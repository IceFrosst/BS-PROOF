"""
Evidence method v2, stages 6-7: GRADE certainty and the letter grade, per
outcome, on top of a shadow pool (pipeline/pool.py). NO MODEL MAY ENTER THIS
FILE. SHADOW ONLY until the Phase 4 switch (docs/EVIDENCE_METHOD.md §8).

  certainty  GRADE: start High for randomised trials (Low otherwise), then
             downgrade 0/1/2 levels per domain -- risk of bias, inconsistency,
             imprecision, indirectness, publication bias -- floor Very low.
             Every downgrade carries its reason.
  benefit    the pooled estimate against the meaningful-change threshold M
             (docs/EVIDENCE_METHOD.md §4); a CI too wide for any category is
             "inconclusive" and grades I.
  letter     the founder-approved table (§4, decided 2026-10-03) from
             (benefit, certainty); re-graded at M/2 and 2M, and flagged
             threshold-sensitive when the letter moves (§5 policy).

THE THRESHOLDS IN `RULES` ARE CONSTANTS (invariant 4). They are the usual GRADE
handbook rules of thumb, chosen for the shadow pipeline and listed for founder
review in docs/REVIEW_PENDING.md; none feeds a production score.

The meaningful-change threshold comes from `vocab/outcome.json` ("mcid" with
{"smd": value, "source": ..., "approved": true}) once the founder approves it;
a proposed value carries "approved": false and is ignored. Until then the
statistical convention 0.2 SD is used and the result says so.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from pipeline import meta_effects as me

RULES = {
    "default_mcid_smd": 0.2,          # Cohen's "small" -- convention, flagged when used
    "rob_low_weight_ok": 0.5,         # >= half the weight from low-RoB trials: no downgrade
    "rob_high_weight_serious": 0.5,   # > half the weight from high-RoB trials: -2
    "i2_serious": 0.50,               # I² above this: -1 ...
    "i2_very_serious": 0.75,          # ... above this: -2
    "ois_participants": 400,          # optimal information size, continuous outcomes
    "indirect_weight_serious": 0.5,   # > half the weight not matching the product: -1 per axis
    "egger_min_k": 10,                # funnel asymmetry is not testable below this
    "egger_alpha": 0.10,              # two-sided, the conventional Egger level
    # Registry (founder decision 2026-10-03): -1 publication bias when the
    # registered-but-unpublished trials for this outcome are at least as many
    # as the trials pooled. Ratio 1.0 = "as many missing as found".
    "registry_unpublished_ratio": 1.0,
}

LEVELS = {4: "High", 3: "Moderate", 2: "Low", 1: "Very low"}

# SPEC §8 dose tiers that make a trial's dose unlike the product's (indirectness).
OFF_DOSE = ("below_50", "above_200")

# §4 grade table (founder decision 2026-10-03). Rows: benefit; columns: certainty.
TABLE = {
    "large":      {4: "A+", 3: "A",  2: "B",  1: "I"},
    "meaningful": {4: "A",  3: "B+", 2: "C+", 1: "I"},
    "small":      {4: "C",  3: "C",  2: "C-", 1: "I"},
    "none":       {4: "F",  3: "D",  2: "D+", 1: "I"},
    "harm":       {4: "F",  3: "F",  2: "D-", 1: "I"},
}


@dataclass
class Certainty:
    level: int
    label: str
    downgrades: dict[str, tuple[int, str]] = field(default_factory=dict)
    not_assessed: list[str] = field(default_factory=list)


@dataclass
class Grade:
    outcome: str
    letter: str
    benefit: str
    certainty: Certainty
    threshold: float
    threshold_source: str
    harm: bool = False
    threshold_sensitive: bool = False
    letters_at: dict[str, str] = field(default_factory=dict)
    reason: str | None = None
    registry: dict | None = None      # pipeline/registry_bias.registry_check, reported only


# ------------------------------------------------------------------ helpers
def _weights(studies: list[dict], tau2: float | None) -> list[float]:
    t = tau2 or 0.0
    return [1.0 / (s["g_variance"] + t) for s in studies]


def _share(studies, weights, pred) -> float:
    total = sum(weights)
    return sum(w for s, w in zip(studies, weights) if pred(s)) / total if total else 0.0


def egger_test(effects: list[float], variances: list[float]) -> tuple[float, float] | None:
    """Egger's regression: (intercept, t statistic), or None if k < 3.
    Regress effect/SE on 1/SE; an intercept far from 0 is funnel asymmetry."""
    k = len(effects)
    if k < 3:
        return None
    ses = [math.sqrt(v) for v in variances]
    x = [1.0 / s for s in ses]
    y = [e / s for e, s in zip(effects, ses)]
    mx, my = sum(x) / k, sum(y) / k
    sxx = sum((a - mx) ** 2 for a in x)
    if sxx <= 0:
        return None
    slope = sum((a - mx) * (b - my) for a, b in zip(x, y)) / sxx
    intercept = my - slope * mx
    resid = [b - (intercept + slope * a) for a, b in zip(x, y)]
    s2 = sum(r * r for r in resid) / (k - 2)
    se_int = math.sqrt(s2 * (1.0 / k + mx * mx / sxx)) if s2 > 0 else 0.0
    return intercept, (intercept / se_int if se_int > 0 else math.inf)


# ---------------------------------------------------------------- certainty
# Split in two on purpose (2026-10-03): `base_domains` is everything that does
# NOT depend on the product -- the run artifact stores it -- and `indirectness`
# is the product-dependent part, re-done by the app for the scanned bottle
# (lib/analyze/grade-v2.ts). `certainty` is exactly their sum, so the Python
# letter and the app's letter cannot drift (tests/grade-v2-parity.test.ts).
def base_domains(pool, threshold: float) -> tuple[int, dict, list[str]]:
    """(start level, downgrades, not_assessed) for every domain EXCEPT indirectness."""
    studies = [s for s in pool.studies if s.get("g_variance") is not None]
    smd = pool.smd or {}
    w = _weights(studies, smd.get("tau2"))
    down, not_assessed = {}, []

    randomised = all((s.get("design_rank") or 4) == 4 for s in studies)
    start = 4 if randomised else 2

    # 1. Risk of bias
    low = _share(studies, w, lambda s: s.get("rob") == "low")
    high = _share(studies, w, lambda s: s.get("rob") == "high")
    if low >= RULES["rob_low_weight_ok"]:
        pass
    elif high > RULES["rob_high_weight_serious"]:
        down["risk_of_bias"] = (2, f"{high:.0%} of the weight from high-risk-of-bias trials")
    else:
        down["risk_of_bias"] = (1, f"only {low:.0%} of the weight from low-risk-of-bias trials")

    # 2. Inconsistency
    i2 = smd.get("i2")
    if len(studies) < 3 or i2 is None:
        not_assessed.append("inconsistency (fewer than 3 trials)")
    elif i2 > RULES["i2_very_serious"]:
        down["inconsistency"] = (2, f"I² = {i2:.0%}")
    elif i2 > RULES["i2_serious"]:
        down["inconsistency"] = (1, f"I² = {i2:.0%}")

    # 3. Imprecision: the CI against 0 and the threshold, and the information size
    lo, hi = smd.get("ci", (None, None))
    total_n = sum(s["n"] for s in studies if isinstance(s.get("n"), int))
    imp, why = 0, []
    if lo is not None:
        if lo < -threshold and hi > threshold:
            imp, why = 2, [f"CI [{lo:+.2f}, {hi:+.2f}] spans both harm and benefit thresholds (±{threshold:.2f})"]
        elif (lo < 0 < hi) or (lo < threshold < hi):
            imp, why = 1, [f"CI [{lo:+.2f}, {hi:+.2f}] crosses 0 or the threshold {threshold:.2f}"]
    if total_n < RULES["ois_participants"]:
        why.append(f"{total_n} participants < {RULES['ois_participants']} (optimal information size)")
        imp = max(imp, 1)
    if imp:
        down["imprecision"] = (imp, "; ".join(why))

    # Population: "different" populations are already EXCLUDED by the pool.
    # "Adjacent" here means one sex for a mixed-sex product or an unreported
    # axis (measured on run A) -- not serious indirectness under GRADE practice,
    # so it is reported, not downgraded (founder decision 2026-10-03).
    not_pop = _share(studies, w, lambda s: s.get("pop_match") not in ("exact", None))
    if not_pop:
        not_assessed.append(f"population: {not_pop:.0%} of the weight from adjacent populations "
                            "(one sex or unreported axes) -- reported, not downgraded")

    # 5. Publication bias (the registry half is added in grade())
    if len(studies) < RULES["egger_min_k"]:
        not_assessed.append(f"publication bias: Egger needs {RULES['egger_min_k']}+ trials")
    else:
        eg = egger_test([s["g"] for s in studies], [s["g_variance"] for s in studies])
        crit = me.student_t_ppf(1 - RULES["egger_alpha"] / 2, len(studies) - 2)
        if eg and abs(eg[1]) > crit:
            down["publication_bias"] = (1, f"Egger intercept {eg[0]:+.2f} (t = {eg[1]:.2f})")

    # Dual extraction is a review-conduct standard, not a GRADE domain: an
    # effect read by one extractor only is reported, never downgraded.
    single = sum(1 for s in studies if not s.get("reviewed"))
    if single:
        not_assessed.append(f"second reviewer: {single} of {len(studies)} effects single-extracted")
    return start, down, not_assessed


def indirectness(studies: list[dict], weights: list[float]) -> tuple[int, list[str], list[str]]:
    """(points 0-2, reasons, notes) from each study's `form_match` and
    `dose_match` against the product. A form is direct only when exact. A dose
    is OFF only when the product is under half (`below_50`) or over double
    (`above_200`) the trial's daily dose (SPEC §8 tiers); 50-99 % counts as
    direct -- founder decision 2026-10-03, after 5 g monohydrate (~4.4 g
    creatine) was judged off-dose against 5 g trials. > half the weight off
    costs one level per axis. Unknown trial doses are noted, never counted as a
    mismatch."""
    points, reasons, notes = 0, [], []
    not_form = _share(studies, weights, lambda s: s.get("form_match") != "exact")
    if not_form > RULES["indirect_weight_serious"]:
        points += 1
        reasons.append(f"{not_form:.0%} of the weight from other or unstated forms")
    if not any(s.get("dose_match") is not None for s in studies):
        notes.append("dose indirectness (no product dose given)")
    else:
        known = lambda s: s.get("dose_match") not in (None, "unspecified")
        off_dose = _share(studies, weights, lambda s: s.get("dose_match") in OFF_DOSE)
        if off_dose > RULES["indirect_weight_serious"]:
            points += 1
            reasons.append(f"{off_dose:.0%} of the weight from trials at a dose unlike the product's")
        unknown = _share(studies, weights, lambda s: not known(s))
        if unknown:
            notes.append(f"dose: {unknown:.0%} of the weight from trials with no comparable dose")
    return min(points, 2), reasons, notes


def study_weights(pool) -> list[float]:
    studies = [s for s in pool.studies if s.get("g_variance") is not None]
    return _weights(studies, (pool.smd or {}).get("tau2"))


def certainty(pool, threshold: float) -> Certainty:
    start, down, not_assessed = base_domains(pool, threshold)
    studies = [s for s in pool.studies if s.get("g_variance") is not None]
    points, reasons, notes = indirectness(studies, study_weights(pool))
    if points:
        down["indirectness"] = (points, "; ".join(reasons))
    level = max(1, start - sum(p for p, _ in down.values()))
    return Certainty(level, LEVELS[level], down, not_assessed + notes)


# ------------------------------------------------------------------ benefit
def benefit(estimate: float, ci: tuple[float, float], m: float) -> str:
    """§4 categories on the benefit-positive pooled scale."""
    lo, hi = ci
    if estimate <= -m and hi < 0:
        return "harm"
    if lo > 0 and estimate >= 2 * m:
        return "large"
    if lo > 0 and estimate >= m:
        return "meaningful"
    if lo > 0 and 0 < estimate < m:
        return "small"
    if lo > -m and estimate < m:
        return "none"
    return "inconclusive"


def _letter(benefit_cat: str, level: int) -> str:
    return "I" if benefit_cat == "inconclusive" else TABLE[benefit_cat][level]


def _registry(down: dict, not_assessed: list[str], registry: dict | None, k: int) -> None:
    """Registry side of publication bias (pipeline/registry_bias.py), IN PLACE:
    -1 when unpublished >= ratio x pooled trials, unless Egger already
    downgraded the domain (one domain, never two points for one suspicion).
    Founder decision 2026-10-03."""
    if not registry:
        return
    missing = len(registry["unpublished"])
    if k and missing >= RULES["registry_unpublished_ratio"] * k and "publication_bias" not in down:
        down["publication_bias"] = (1, f"{missing} registered trials unpublished vs {k} pooled")
    else:
        not_assessed.append(f"registry: {missing} of {registry['registered']} registered, completed "
                            "trials have no results or result publication (upper bound)")


def _threshold(mcid: dict | None) -> tuple[float, str]:
    if (mcid and mcid.get("approved") is True
            and isinstance(mcid.get("smd"), (int, float)) and mcid["smd"] > 0):
        return float(mcid["smd"]), str(mcid.get("source") or "approved MCID")
    # A proposed value ("approved": false) is a constant awaiting the founder
    # (invariant 4) and is never used, even when it equals 0.2.
    return RULES["default_mcid_smd"], "statistical convention (0.2 SD), no approved MCID"


VARIANTS = (("m", 1.0), ("half", 0.5), ("double", 2.0))


def grade_record(pool, mcid: dict | None = None, registry: dict | None = None) -> dict:
    """The PRODUCT-INDEPENDENT half of a grade, as the run artifact stores it:
    per threshold variant (M, M/2, 2M) the benefit category and every
    downgrade except indirectness. `letter_from_record` (and its TypeScript
    port) adds the product's indirectness and reads the letter."""
    m, source = _threshold(mcid)
    rec = {"outcome": pool.outcome, "threshold": m, "threshold_source": source,
           "registry": registry, "variants": {}}
    if not pool.smd:
        return rec
    est, ci = pool.smd["estimate"], tuple(pool.smd["ci"])
    for name, factor in VARIANTS:
        t = m * factor
        start, down, not_assessed = base_domains(pool, t)
        _registry(down, not_assessed, registry, pool.k)
        rec["variants"][name] = {"threshold": t, "benefit": benefit(est, ci, t), "start": start,
                                 "downgrades": {d: [p, why] for d, (p, why) in down.items()},
                                 "not_assessed": not_assessed}
    return rec


def letter_from_record(rec: dict, studies: list[dict], weights: list[float]) -> dict:
    """Letter for one product: `studies` carry `form_match` / `dose_match`
    against THIS product, `weights` the stored per-study weights. Mirrored line
    for line by lib/analyze/grade-v2.ts."""
    if not rec["variants"]:
        return {"letter": "I", "benefit": "no data", "level": 1, "label": LEVELS[1],
                "downgrades": {}, "not_assessed": [], "letters_at": {}, "threshold_sensitive": False,
                "harm": False}
    points, reasons, notes = indirectness(studies, weights)
    out = {}
    for name, v in rec["variants"].items():
        down = {d: tuple(x) for d, x in v["downgrades"].items()}
        if points:
            down["indirectness"] = (points, "; ".join(reasons))
        level = max(1, v["start"] - sum(p for p, _ in down.values()))
        out[name] = (_letter(v["benefit"], level), v["benefit"], level, down, v["not_assessed"] + notes)
    letter, cat, level, down, not_assessed = out["m"]
    letters_at = {"half": out["half"][0], "double": out["double"][0]}
    return {"letter": letter, "benefit": cat, "level": level, "label": LEVELS[level],
            "downgrades": {d: [p, why] for d, (p, why) in down.items()}, "not_assessed": not_assessed,
            "letters_at": letters_at, "threshold_sensitive": any(x != letter for x in letters_at.values()),
            "harm": cat == "harm"}


def grade(pool, mcid: dict | None = None, registry: dict | None = None) -> Grade:
    """Letter grade for one outcome pool; `pool.studies` carry form_match /
    dose_match against the product. `mcid` = {"smd", "source", "approved"}."""
    rec = grade_record(pool, mcid, registry)
    m, source = rec["threshold"], rec["threshold_source"]
    if not pool.smd:
        return Grade(pool.outcome, "I", "no data", Certainty(1, LEVELS[1]), m, source,
                     reason="no trial with a verified, poolable effect", registry=registry)
    studies = [s for s in pool.studies if s.get("g_variance") is not None]
    r = letter_from_record(rec, studies, study_weights(pool))
    cert = Certainty(r["level"], r["label"], {d: tuple(x) for d, x in r["downgrades"].items()},
                     r["not_assessed"])
    return Grade(pool.outcome, r["letter"], r["benefit"], cert, m, source, harm=r["harm"],
                 letters_at=r["letters_at"], threshold_sensitive=r["threshold_sensitive"],
                 registry=registry,
                 reason="CI too wide for any benefit category" if r["benefit"] == "inconclusive" else None)
