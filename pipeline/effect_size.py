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
  reported_smd_ci  a reported SMD + its CI + stated level -> SE from the CI
  reported_md_ci   a reported mean difference + CI       -> mean difference only
  reported_smd_p   a reported SMD + an EXACT p           -> SE from the p
  reported_smd_n   a reported SMD + both arm sizes       -> variance from n

Refused, each with its reason: anything not a between-arm contrast against an
ingredient-free control; crossover / cluster / unstated designs (they need a
correlation or ICC the papers rarely print); ratios and percent-change kinds
(they need their own scale); a favoured arm of "neither"; percentage values
used as arm means without SDs.
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


def effect_from_claim(claim: dict, verified: dict, *, polarity: str | None,
                      abs_only: tuple[str, ...] | list[str] = ()) -> tuple[Effect | None, str]:
    """(Effect, route) or (None, refusal reason)."""
    if claim.get("contrast") != "vs_ingredient_free":
        return None, "not a contrast against an ingredient-free control"
    if claim.get("design_kind") != "parallel":
        return None, f"design is {claim.get('design_kind') or 'unstated'}, not parallel"
    kind = claim.get("estimate_kind")
    if kind in ("ratio", "relative_percent"):
        return None, f"{kind} needs its own scale; not pooled with differences"
    flags = tuple(f"sign_from_words:{f}" for f in abs_only)
    estimand = claim.get("estimand")
    v = verified

    # --- arm_stats: both arms' mean, SD and n --------------------------------
    arm_keys = ("mean_ingredient", "mean_control", "sd_ingredient", "sd_control",
                "n_ingredient", "n_control")
    if all(k in v for k in arm_keys):
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
        return Effect("arm_stats", orient * g.g, g.variance, orient * md, md_var,
                      claim.get("effect_unit") or claim.get("measure"), estimand, flags), "arm_stats"

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
