"""
Effect sizes for evidence method v2: span-verified numbers -> one signed effect
and its sampling variance per claim. NO MODEL MAY ENTER THIS FILE.

docs/EVIDENCE_METHOD.md §3 stage 4. Inputs are the claim's categorical fields
plus the numbers `pipeline/span_check.verify_claim_numbers` VERIFIED; a number
that failed the span check is never used. The arithmetic is
`pipeline/meta_effects.py` (Hedges' g, SE from a CI or an exact normal p).

Sign convention: POSITIVE = BENEFIT for the ingredient, after applying the
outcome's polarity (vocab/outcome.json). An outcome with no recorded polarity
cannot be oriented and is refused -- the same rule v14 applies.

Routes, best first (the first that applies wins; each is recorded):

  arm_stats        both arms' mean, SD and n             -> Hedges' g and the
                                                            raw mean difference
  arm_stats_derived  the same, with an arm's SD DERIVED from its printed SE or
                   its printed CI of the mean (below). Ranked after arm_stats.
  reported_smd_ci  a reported SMD + its CI + stated level -> SE from the CI
  reported_md_ci   a reported mean difference + CI       -> mean difference only
  reported_smd_p   a reported SMD + an EXACT p           -> SE from the p
  reported_smd_n   a reported SMD + both arm sizes       -> variance from n

Crossover trials (added 2026-10-03, Cochrane Handbook ch. 23):

  arm_stats        analysed AS IF PARALLEL: "take all measurements from
                   intervention E periods and all measurements from intervention
                   C periods and analyse these as if the trial were a
                   parallel-group trial" (§23.2.6). It ignores the within-person
                   correlation, so the CI is too wide -- "conservative, in that
                   studies are under-weighted rather than over-weighted". The g
                   is standardised by the SD of measurements, as §23.2.7.2
                   requires. Flagged `crossover_as_parallel`.
  reported_md_ci   a paired mean difference with its CI is valid as printed
                   (the CI already carries the pairing). Flagged.
  reported SMD     REFUSED: a crossover paper's "d" is often standardised by
                   the SD of the within-person differences (d_z), which §23.2.7.2
                   says not to use, and the text rarely says which.

Per-arm SD from SE or CI (added 2026-10-03, Cochrane Handbook §6.5.2.2):

  SE        SD = SE x sqrt(n)
  CI        SD = sqrt(n) x (upper - lower) / (2 x t(1 - (1 - level)/2, n - 1))
            -- the t quantile, which §6.5.2.2 prescribes for small samples and
            which is also exact for large ones. The level must be STATED.
  Applied per arm only when that arm's SD is not printed; each derived SD is
  flagged (`sd_from_se:<arm>` / `sd_from_ci:<arm>`). The model never converts
  (S5N copies the SE / CI as printed); this deterministic step does.

Printed-table consistency guard (added 2026-10-03; RSMOKE5 found a paper whose
∆ cells were swapped between two rows, which two faithful readers both copy):

  When an arm's baseline (`pre_*`) and post (`post_*`) values are verified too,
  the claim's mean must match them at printed precision -- a change mean must
  equal post - pre, an endpoint mean must equal post. A mismatch REFUSES the
  arm-statistics routes ("printed numbers inconsistent"). Unknown pre/post:
  nothing is checked (null is never a failure).

Baseline imbalance (founder 2026-10-03: downgrade, never refuse):

  An ENDPOINT effect whose arms' verified baselines differ by more than the
  endpoint difference itself is flagged `baseline_imbalance`; the pool then
  caps that trial's risk of bias at "unclear" (pipeline/pool.py), so GRADE's
  existing risk-of-bias rule downgrades when such trials carry the weight.

Refused, each with its reason: anything not a between-arm contrast against an
ingredient-free control; cluster / unstated designs (they need an ICC the papers
rarely print); ratios and percent-change kinds (they need their own scale); a
favoured arm of "neither"; percentage values used as arm means without SDs.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from pipeline import meta_effects as me

SMD = "smd"
MD = "md"


@dataclass(frozen=True)
class Effect:
    route: str
    smd: float | None                 # Hedges' g (or the reported SMD), benefit-positive
    smd_variance: float | None
    md: float | None = None           # raw mean difference, benefit-positive
    md_variance: float | None = None
    unit: str | None = None           # the MD's unit, as printed
    estimand: str | None = None       # endpoint | change_from_baseline (never mixed later)
    flags: tuple[str, ...] = field(default_factory=tuple)

    @property
    def scales(self) -> tuple[str, ...]:
        return tuple(s for s, v in ((SMD, self.smd_variance), (MD, self.md_variance)) if v is not None)


def _orientation(polarity: str | None) -> int | None:
    return {"higher_better": 1, "lower_better": -1}.get(polarity or "")


def _favoured_sign(favours: str | None) -> int | None:
    return {"ingredient": 1, "control": -1}.get(favours or "")


def _decimals(x: float) -> int:
    """Decimal places of a number as stored (JSON keeps 33.3 as 33.3; 4.0 and 4
    both read as 0, the wider -- more permissive -- rounding)."""
    text = repr(float(x))
    if "e" in text or "." not in text:
        return 0
    frac = text.split(".")[1].rstrip("0")
    return len(frac)


def _half_unit(*values: float) -> float:
    """The largest error printed rounding can put on a sum of these values."""
    return sum(0.5 * 10 ** -_decimals(v) for v in values) + 1e-9


def _inconsistent_arms(v: dict, estimand: str | None) -> list[str]:
    """Arms whose mean disagrees with their own printed pre / post values."""
    bad = []
    for arm in ("ingredient", "control"):
        mean, pre, post = v.get(f"mean_{arm}"), v.get(f"pre_{arm}"), v.get(f"post_{arm}")
        if not isinstance(mean, (int, float)) or not isinstance(post, (int, float)):
            continue
        if estimand == "change_from_baseline" and isinstance(pre, (int, float)):
            if abs(mean - (post - pre)) > _half_unit(mean, post, pre):
                bad.append(f"{arm} change {mean} != {post} - {pre}")
        elif estimand == "endpoint" and abs(mean - post) > _half_unit(mean, post):
            bad.append(f"{arm} endpoint {mean} != post {post}")
    return bad


def _derive_arm_sds(verified: dict, ci_level) -> tuple[dict, tuple[str, ...]]:
    """Fill a missing arm SD from that arm's verified SE or CI (§6.5.2.2).
    Returns (numbers with the derived SDs, flags). Nothing is derived without a
    verified n for the arm, and a CI only with a stated level."""
    v, flags = dict(verified), []
    for arm in ("ingredient", "control"):
        sd_key, n = f"sd_{arm}", v.get(f"n_{arm}")
        if sd_key in v or not isinstance(n, int) or n < 2:
            continue
        se, lo, hi = v.get(f"se_{arm}"), v.get(f"ci_{arm}_low"), v.get(f"ci_{arm}_high")
        if isinstance(se, (int, float)) and se > 0:
            v[sd_key] = se * n ** 0.5
            flags.append(f"sd_from_se:{arm}")
        elif (isinstance(lo, (int, float)) and isinstance(hi, (int, float)) and hi > lo
              and isinstance(ci_level, (int, float)) and 0 < ci_level < 1):
            t = me.student_t_ppf(1 - (1 - ci_level) / 2, n - 1)
            v[sd_key] = n ** 0.5 * (hi - lo) / (2 * t)
            flags.append(f"sd_from_ci:{arm}")
    return v, tuple(flags)


def effect_from_claim(claim: dict, verified: dict, *, polarity: str | None,
                      abs_only: tuple[str, ...] | list[str] = (),
                      checks: dict | None = None) -> tuple[Effect | None, str]:
    """(Effect, route) or (None, refusal reason). `checks` are span-verified
    numbers used ONLY for the consistency guard and the imbalance flag (the
    pool passes reviewer 1's, so a pre / post value reviewer 2 did not repeat
    still guards); default `verified`."""
    checks = {**verified, **(checks or {})}
    if claim.get("contrast") != "vs_ingredient_free":
        return None, "not a contrast against an ingredient-free control"
    design = claim.get("design_kind")
    if design not in ("parallel", "crossover"):
        return None, f"design is {design or 'unstated'}, not parallel or crossover"
    crossover = design == "crossover"
    kind = claim.get("estimate_kind")
    if kind in ("ratio", "relative_percent"):
        return None, f"{kind} needs its own scale; not pooled with differences"
    flags = tuple(f"sign_from_words:{f}" for f in abs_only)
    estimand = claim.get("estimand")
    v = verified

    # --- arm_stats: both arms' mean, SD and n --------------------------------
    arm_keys = ("mean_ingredient", "mean_control", "sd_ingredient", "sd_control",
                "n_ingredient", "n_control")
    v, derived = _derive_arm_sds(v, claim.get("arm_ci_level"))
    if all(k in v for k in arm_keys):
        bad = _inconsistent_arms(checks, estimand)
        if bad:
            return None, "printed numbers inconsistent (misprinted or misparsed table): " + "; ".join(bad)
        orient = _orientation(polarity)
        if orient is None:
            return None, "outcome has no recorded polarity, so arm means cannot be oriented"
        if (claim.get("effect_unit") or "").strip() in ("%", "percent") and kind != "percentage_points":
            # "%" with no stated kind may be a relative change per arm, which is
            # not an outcome value; refusing is the safe reading.
            return None, "arm values in % without percentage_points kind (may be relative change)"
        try:
            g = me.hedges_g(v["mean_ingredient"], v["sd_ingredient"], v["n_ingredient"],
                            v["mean_control"], v["sd_control"], v["n_control"])
        except ValueError as exc:
            return None, f"arm statistics are not usable: {exc}"
        md = v["mean_ingredient"] - v["mean_control"]
        md_var = (v["sd_ingredient"] ** 2 / v["n_ingredient"]
                  + v["sd_control"] ** 2 / v["n_control"])
        if crossover:
            flags = flags + ("crossover_as_parallel",)
        pre_i, pre_c = checks.get("pre_ingredient"), checks.get("pre_control")
        if (estimand == "endpoint" and isinstance(pre_i, (int, float)) and isinstance(pre_c, (int, float))
                and abs(pre_i - pre_c) > abs(md)):
            flags = flags + ("baseline_imbalance",)
        route = "arm_stats_derived" if derived else "arm_stats"
        return Effect(route, orient * g.g, g.variance, orient * md, md_var,
                      claim.get("effect_unit") or claim.get("measure"), estimand,
                      flags + derived), route

    # --- reported estimates: magnitude from the paper, sign from the favoured arm
    sign = _favoured_sign(claim.get("effect_favours"))
    if "effect_size" not in v:
        return None, "no verified effect estimate and incomplete arm statistics"
    if sign is None:
        return None, f"favoured arm is {claim.get('effect_favours') or 'unstated'}; sign unknown"
    if kind not in ("smd", "mean_difference", "percentage_points"):
        return None, f"estimate kind {kind or 'unstated'} cannot be pooled"
    # The paper's own sign convention is not trusted (|d| is often printed
    # beside "no difference"); the favoured arm decides, as in v8.
    magnitude = abs(v["effect_size"])
    # `effect_favours` already answers "better for whom", so the outcome's
    # polarity is NOT applied a second time to a reported estimate.
    signed = sign * magnitude

    has_ci = "ci_low" in v and "ci_high" in v
    level = claim.get("ci_level")
    if has_ci and level is None:
        flags = flags + ("ci_level_unstated",)
    if kind == "smd" and crossover:
        return None, "crossover SMD may be standardised by the SD of differences (d_z); not poolable"
    if crossover:
        flags = flags + ("crossover_paired_ci",)
    if kind == "smd":
        if has_ci and level is not None:
            try:
                se = me.se_from_ci(v["ci_low"], v["ci_high"], level)
            except ValueError as exc:
                return None, f"CI is not usable: {exc}"
            return Effect("reported_smd_ci", signed, se * se, estimand=estimand, flags=flags), "reported_smd_ci"
        if "p_value" in v:
            try:
                se = me.se_from_normal_p(magnitude, v["p_value"])
            except ValueError as exc:
                return None, f"p is not usable: {exc}"
            return Effect("reported_smd_p", signed, se * se, estimand=estimand,
                          flags=flags + ("se_from_normal_p",)), "reported_smd_p"
        if "n_ingredient" in v and "n_control" in v:
            var = me.sampling_variance_g(magnitude, v["n_ingredient"], v["n_control"])
            return Effect("reported_smd_n", signed, var, estimand=estimand,
                          flags=flags + ("variance_from_n",)), "reported_smd_n"
        return None, "reported SMD has no verified CI with a stated level, exact p, or arm sizes"
    # mean_difference / percentage_points: natural units, MD scale only.
    if has_ci and level is not None:
        try:
            se = me.se_from_ci(v["ci_low"], v["ci_high"], level)
        except ValueError as exc:
            return None, f"CI is not usable: {exc}"
        return Effect("reported_md_ci", None, None, signed, se * se,
                      claim.get("effect_unit") or claim.get("measure"), estimand, flags), "reported_md_ci"
    return None, "reported mean difference has no verified CI with a stated level"
