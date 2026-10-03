"""
Evidence method v2, stage 5: pool the verified effect sizes per outcome.
NO MODEL MAY ENTER THIS FILE. SHADOW ONLY: nothing in production scoring
(v14) reads it until the Phase 4 switch (docs/EVIDENCE_METHOD.md §8).

Per outcome:

  1. Study eligibility: the invariant-7 scope refusals (no ingredient-free arm,
     combination arms, no administered arm) EXCEPT "self-declared
     underpowered" -- v2 drops that refusal, because pooling already gives a
     tiny trial a tiny weight (§3 stage 2).
  2. Population: the stored v14 policy (variant B) -- a study whose population
     is "different" from the product's (e.g. a disease trial for a
     healthy-adult product) answers a different question and is left out.
  3. ONE effect per study per outcome: primary-outcome claims first, then the
     strongest route (arm statistics > reported SMD+CI > SMD+exact p > SMD+n),
     then claim order. Pooling two endpoints of one trial would count it twice.
  4. Pool Hedges' g with REML random effects; Hartung-Knapp CI when k >= 3,
     normal CI at k = 2; prediction interval when k >= 3. A natural-unit
     (mean difference) pool only when every MD in it shares one unit.
  5. Dual extraction (pipeline/review.py): a claim the two reviewers disagree
     on is refused for human adjudication; an agreed claim pools only the
     numbers both read; a single-extracted claim pools, flagged "reviewed":
     False so GRADE can say so.
  6. Report every refusal with its reason, the estimand mix (change scores and
     final values are flagged, not silently mixed) and a leave-one-out range.

Effects come from pipeline/effect_size.py on numbers pipeline/span_check.py
verified at extraction time (`numbers_v2` on each mapped outcome).
"""
from __future__ import annotations

import collections
import re
from dataclasses import dataclass, field

from pipeline import meta_effects as me
from pipeline import vocab
from pipeline.assemble import _s7_for_claim, study_dose
from pipeline.dose import dose_match_for
from pipeline.effect_size import Effect, effect_from_claim
from pipeline.eligibility import _ineligible

ROUTE_RANK = {"arm_stats": 0, "reported_smd_ci": 1, "reported_smd_p": 2, "reported_smd_n": 3,
              "reported_md_ci": 4}
CONFIDENCE = 0.95


@dataclass
class StudyEffect:
    study_id: str
    route: str
    effect: Effect
    primary: bool
    claim_index: int
    # Facts GRADE needs (pipeline/grade.py); None = not reported.
    n: int | None = None
    rob: str = "unclear"              # low | unclear | high (rob_status)
    form_match: str | None = None     # vocab.form_match tier vs the product
    pop_match: str | None = None      # vocab.pop_match tier vs the product
    design_rank: int | None = None
    reviewed: bool = False            # both reviewers agreed (pipeline/review.py)
    dose_match: str | None = None     # product dose vs this trial's (dose_match_tier); None = no product dose


def study_form(s7: dict | None, claim: dict) -> str | None:
    """The form the TESTED arm took. S7 is arm-keyed since v1.24 and its top-level
    form is usually null (measured 2026-10-03 on run A): use the S7 arm whose
    label is the claim's ingredient_arm, else the one form recorded across arms,
    else the top-level value. Never guessed."""
    s7 = s7 or {}
    norm = lambda v: re.sub(r"\s+", " ", str(v or "")).strip().lower()
    arms = [a for a in s7.get("arms") or [] if isinstance(a, dict)]
    target = norm(claim.get("ingredient_arm"))
    if target:
        own = [a.get("form_vocab_id") for a in arms if norm(a.get("label")) == target]
        if len(own) == 1 and own[0]:
            return own[0]
    forms = {a.get("form_vocab_id") for a in arms if a.get("form_vocab_id")}
    if len(forms) == 1:
        return next(iter(forms))
    return s7.get("form_vocab_id")


def dose_match_tier(ingredient: str, s7: dict | None, s3: dict | None, claim: dict,
                    product: dict) -> str | None:
    """The product's dose against THIS trial's dose, on SPEC §8's tiers with the
    trial's own daily elemental dose as the band (pipeline/dose.dose_match_for):
    in_band (1-2x the trial dose) | low_50_99 | below_50 | above_200 |
    unspecified (trial dose unknown or an interval straddling a tier). None when
    the product carries no dose. The tested arm's dose is joined by label
    (assemble._s7_for_claim), never by position."""
    lo, hi = product.get("dose_low_mg"), product.get("dose_high_mg")
    if lo is None or hi is None:
        return None
    modern = (s7 or {}).get("extraction_version") == "v1.24"
    dose = study_dose(ingredient, _s7_for_claim(s7, claim, s3, modern=modern))
    return dose_match_for(lo, hi, {"low": dose["dose_low_mg"], "high": dose["dose_high_mg"]})


def rob_status(s4: dict | None) -> str:
    """Study-level risk of bias from the S4 items (1 = adequate, 0 = inadequate,
    None = not reported). HIGH if randomisation, blinding or attrition is judged
    inadequate; LOW only when randomisation AND blinding are adequate and
    attrition is not inadequate; otherwise UNCLEAR. Unknown never counts as low."""
    s4 = s4 or {}
    items = [s4.get("item1_randomisation_method"), s4.get("item2_double_blind_placebo"),
             s4.get("item5_attrition_ok")]
    if 0 in items:
        return "high"
    if items[0] == 1 and items[1] == 1:
        return "low"
    return "unclear"


@dataclass
class OutcomePool:
    outcome: str
    k: int = 0
    smd: dict | None = None
    md: dict | None = None
    studies: list[dict] = field(default_factory=list)
    refused: dict[str, int] = field(default_factory=dict)
    estimand_mix: dict[str, int] = field(default_factory=dict)
    leave_one_out: tuple[float, float] | None = None
    note: str | None = None


def _pool(effects: list[float], variances: list[float]) -> dict:
    k = len(effects)
    if k == 1:
        se = variances[0] ** 0.5
        z = me.normal_ppf(0.975)
        return {"k": 1, "estimate": effects[0], "ci": (effects[0] - z * se, effects[0] + z * se),
                "prediction": None, "i2": None, "tau2": None, "method": "single study (not pooled)"}
    r = me.random_effects_meta_analysis(effects, variances, confidence_level=CONFIDENCE,
                                        use_hartung_knapp=k >= 3)
    return {"k": k, "estimate": r.estimate, "ci": (r.ci_lower, r.ci_upper),
            "prediction": (r.prediction_lower, r.prediction_upper) if k >= 3 else None,
            "i2": r.i2, "tau2": r.tau2,
            "method": "REML + Hartung-Knapp" if k >= 3 else "REML, normal CI (k = 2)"}


def _study_effects(item: dict, product: dict, polarity: dict) -> tuple[dict[str, StudyEffect], dict]:
    """Best effect per outcome for one study, plus per-outcome refusal reasons."""
    ext, record = item["extraction"], item.get("record") or {}
    refusals: dict[str, str] = {}
    s3 = ext.get("S3") if isinstance(ext.get("S3"), dict) else {}
    scope = _ineligible({"S3": {**s3, "self_declared_underpowered": None}, "record": record})
    pop = vocab.pop_match(s3.get("population_axes") or {}, product.get("population") or {})
    best: dict[str, StudyEffect] = {}
    for i, o in enumerate(ext.get("outcomes") or []):
        oid = o.get("outcome_vocab_id")
        if not oid or o.get("discarded"):
            continue
        if scope:
            refusals[oid] = f"study: {scope}"
            continue
        if pop == "different":
            refusals[oid] = "study: off-target population"
            continue
        nums = o.get("numbers_v2") or {}
        claim = o.get("claim") or {}
        review = nums.get("review") or {"status": "single", "verified": nums.get("verified") or {}}
        if review["status"] == "disagreed":
            refusals.setdefault(oid, "reviewers disagree (human adjudication)")
            continue
        eff, why = effect_from_claim(claim, review["verified"], polarity=polarity.get(oid),
                                     abs_only=nums.get("abs_only") or ())
        if eff is None:
            refusals.setdefault(oid, why)
            continue
        verified = review["verified"]
        arm_n = (verified.get("n_ingredient"), verified.get("n_control"))
        if not all(isinstance(x, int) for x in arm_n):
            n = s3.get("n_analysed") or s3.get("n_randomised")
        elif claim.get("design_kind") == "crossover":
            n = max(arm_n)            # the same people in both periods: not 2n
        else:
            n = sum(arm_n)
        s7 = ext.get("S7") if isinstance(ext.get("S7"), dict) else {}
        cand = StudyEffect(item["id"], eff.route, eff, bool(claim.get("is_primary_outcome")), i,
                           n=n if isinstance(n, int) else None,
                           rob=rob_status(ext.get("S4") if isinstance(ext.get("S4"), dict) else None),
                           form_match=vocab.form_match(product.get("ingredient") or "",
                                                       study_form(s7, claim), product.get("form_vocab_id")),
                           pop_match=pop, design_rank=record.get("design_rank"),
                           reviewed=review["status"] == "agreed",
                           dose_match=dose_match_tier(product.get("ingredient") or "", s7, s3, claim, product))
        cur = best.get(oid)
        key = lambda s: (not s.primary, ROUTE_RANK.get(s.route, 9), s.claim_index)
        if cur is None or key(cand) < key(cur):
            best[oid] = cand
    for oid in best:
        refusals.pop(oid, None)
    return best, refusals


def pool_outcomes(items: list[dict], product: dict) -> dict[str, OutcomePool]:
    """items: [{"id", "record", "extraction"}] in the worker's extraction format."""
    polarity = {o["id"]: o.get("polarity") for o in vocab.load("outcome")["outcomes"]}
    per_outcome: dict[str, list[StudyEffect]] = collections.defaultdict(list)
    refused: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for item in items:
        ext = item.get("extraction") or {}
        if ext.get("_skipped"):
            continue
        best, refusals = _study_effects(item, product, polarity)
        for oid, se in best.items():
            per_outcome[oid].append(se)
        for oid, why in refusals.items():
            refused[oid][why] += 1

    out: dict[str, OutcomePool] = {}
    for oid in sorted(set(per_outcome) | set(refused)):
        studies = per_outcome.get(oid, [])
        pool = OutcomePool(oid, refused=dict(refused.get(oid, {})))
        pool.estimand_mix = dict(collections.Counter(s.effect.estimand or "unstated" for s in studies))
        pool.studies = [{"study": s.study_id, "route": s.route, "g": s.effect.smd,
                         "g_variance": s.effect.smd_variance, "md": s.effect.md, "unit": s.effect.unit,
                         "estimand": s.effect.estimand, "primary": s.primary,
                         "flags": list(s.effect.flags), "n": s.n, "rob": s.rob,
                         "form_match": s.form_match, "pop_match": s.pop_match,
                         "design_rank": s.design_rank, "reviewed": s.reviewed,
                         "dose_match": s.dose_match} for s in studies]
        smd = [s for s in studies if s.effect.smd_variance is not None]
        pool.k = len(smd)
        if smd:
            ys, vs = [s.effect.smd for s in smd], [s.effect.smd_variance for s in smd]
            pool.smd = _pool(ys, vs)
            if len(smd) >= 3:
                loo = [_pool(ys[:i] + ys[i + 1:], vs[:i] + vs[i + 1:])["estimate"] for i in range(len(ys))]
                pool.leave_one_out = (min(loo), max(loo))
        md = [s for s in studies if s.effect.md_variance is not None]
        units = {(s.effect.unit or "").strip().lower() for s in md}
        if md and len(units) == 1 and "" not in units:
            pool.md = {**_pool([s.effect.md for s in md], [s.effect.md_variance for s in md]),
                       "unit": next(iter(units))}
        elif md:
            pool.note = f"mean differences in {len(units)} different units; natural-unit pool not formed"
        out[oid] = pool
    return out
