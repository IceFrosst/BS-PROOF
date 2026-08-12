"""
The four arcs, and the 0-100 number they compose into. NO MODEL HERE.

Each arc carries TWO facts, and keeping them separate is the whole design:

    verdict   what this slice of the evidence SAYS   (-1 .. +1, signed)
    coverage  how much evidence that slice IS        (0 .. 1, share of weight)

A form arc that showed only coverage answers "how much evidence used your form"
and cannot tell a well-tested form from a well-tested-and-useless one. A form arc
that showed only a verdict answers "what did your form's trials find" and hides
that the answer rests on two studies. You need both, so each arc renders as:

    filled    the verdict, coloured by sign
    solid     the portion of evidence that could be judged on this axis
    hatched   the rest -- nobody reported it

THE FOUR ARCS

    effect     verdict over ALL evidence          "does this ingredient work?"
    form       verdict over YOUR-FORM evidence    "does your preparation work?"
    dose       verdict over IN-BAND evidence      "does it work at your dose?"
    evidence   overall confidence c               "how much do we actually know?"

The form and dose arcs are SUBSETS of the effect arc, which is why the composite
below multiplies by confidence rather than averaging it in -- see composite().
"""
from __future__ import annotations

from pipeline.scoring import DOSE_FACTOR, FORM_FACTOR, score_ecu

ARC_ORDER = ("effect", "form", "dose", "evidence")

# A subset nobody studied is not neutral. Falling back to the transfer tier the
# scorer already uses for that situation keeps the penalty consistent with SPEC
# section 8 rather than inventing a new number: no in-band dose evidence means
# the dose relationship is unestablished (0.10).
MISSING_DOSE_PENALTY = DOSE_FACTOR["below_50"]

# Retained for the archive: what the form term used to be before the ladder
# (SCORING_MODEL v4 and earlier). No exact-form trial meant the composite's form
# term became `effect x 0.15`, so a corpus that simply never printed which form
# it used dragged every score down in proportion to how well the ingredient
# worked. Measured 2026-08-11 on 149 creatine studies: 80 of them (54%) said only
# "creatine", so muscle_strength's form arc read +0.02 @ 61% while 61 trials had
# confirmed monohydrate.
LEGACY_MISSING_FORM_PENALTY = FORM_FACTOR["different"]

# ------------------------------------------------------------------ FORM LADDER
#
# FOUNDER DESIGN 2026-08-11. The form arc answers a DIFFERENT question from the
# effect arc and must not be computed from it:
#
#     "How strong is the best evidence that YOUR form was tested and did not
#      fail?"
#
# Before this, the form term was a re-scoring of the same signed `d` over the
# exact-form subset, then blended into the composite -- so an ingredient with
# excellent monohydrate RCTs still lost points because most of the literature
# omits the form, and the arc could not express that an umbrella review in your
# exact form is worth more than one animal study in it.
#
# The ladder scores by EVIDENCE HIERARCHY instead. Ranks are pipeline.classify's
# design_rank (1 umbrella, 2 SR+meta-analysis, 3 SR, 4 RCT, 5-11 observational,
# 12-13 animal/cell, 14 none), so this table needs no new taxonomy.
#
# EVERY VALUE HERE IS A FOUNDER-INITIALISED GUESS awaiting calibration, exactly
# like `k` and the transfer factors -- invariant 4 applies and SPEC 13 owns them.
FORM_LADDER = {
    1: 1.00,   # umbrella review conducted in your form
    2: 0.95,   # systematic review with meta-analysis
    3: 0.90,   # systematic review
    4: 0.80,   # RCT
    5: 0.55, 6: 0.45, 7: 0.35,          # quasi-experimental / cohort / case-control
    8: 0.25, 9: 0.20, 10: 0.18, 11: 0.15,  # cross-sectional ... case report
    12: 0.10, 13: 0.05,                 # animal, cell
    14: 0.00,                           # in-silico / none
}

# How many of the highest-ranked eligible studies are averaged. A/B/C/D MEASURED
# 2026-08-11 via scripts/form_experiment.py. The creatine corpus could not decide
# this on its own -- every exact-form primary is design_rank 4, so all widths are
# arithmetically identical there -- so the decision rests on rank-varied fixtures:
#
#   evidence in your form        top-1   top-3   top-5   top-10
#   1 RCT + 9 animal studies     0.800   0.333   0.240   0.170
#   umbrella + 4 RCTs            1.000   0.867   0.840   0.840
#   meta-analysis + 9 RCTs       0.950   0.850   0.830   0.815
#   one animal study only        0.100   0.100   0.100   0.100
#   10 RCTs                      0.800   0.800   0.800   0.800
#
# top-1 fails the corroboration test: "1 RCT + 9 animal" scores 0.800, IDENTICAL
# to ten RCTs, so one paper in your form buys the same credit as a replicated
# literature. top-10 fails the opposite way: it drags a real RCT down to 0.170,
# animal tier, for the crime of having weak company. top-3 credits the top rank
# while still requiring some corroboration, and it is the only width that
# separates all five fixtures monotonically. A founder guess, calibratable like
# every other constant -- SPEC 13.
FORM_LADDER_TOP = 3


def form_ladder_score(design_ranks, top_n: int = FORM_LADDER_TOP) -> float | None:
    """
    Mean ladder score of the top `top_n` highest-ranked entries. None when empty.

    `design_ranks` must already be filtered to NON-NEGATIVE evidence in the
    product's own form -- this function deliberately knows nothing about
    direction, so the eligibility rule stays in one place (`form_strength`).
    """
    scores = sorted((FORM_LADDER.get(r, 0.0) for r in design_ranks), reverse=True)
    if not scores:
        return None
    top = scores[:max(1, top_n)]
    return sum(top) / len(top)


def form_strength(exact_studies: list, form_d: float | None,
                  form_syntheses: list | None = None,
                  top_n: int = FORM_LADDER_TOP) -> tuple[float, str]:
    """
    (strength 0..1, basis) -- the composite's form term.

    Eligibility is PER STUDY, not pooled. Take the studies in your own form whose
    OWN result is not negative, rank them by evidence hierarchy, and average the
    top `top_n`. If the highest-ranked ones are negative you simply keep walking
    DOWN the ladder until you find non-negative evidence.

    FOUNDER CORRECTION 2026-08-11, and it fixed a real error in v5. v5 short-
    circuited on the POOLED verdict: if the exact-form subset scored d < 0 the
    whole arc collapsed to 0.0, so a form with one solid positive RCT and three
    nulls got no form credit at all -- the nulls out-voted the RCT in `d` and the
    ladder never ran. That is not what a hierarchy is for. A negative pooled
    verdict is a WARNING, and it belongs in the verdict where the reader sees it;
    it is not a reason to discard the positive evidence that exists in your form.

    Two remaining zero cases, still distinguishable in the arc:

      no exact-form evidence at all       0.0, "untested_in_form"
      exact-form evidence, none positive  0.0, "all_negative_in_form"

    Invariant 8 is unaffected: the arc still carries the signed verdict and the
    coverage beside the strength, so "nobody tested your form" (verdict None,
    coverage 0) can never render as "your form was tested and failed" (signed
    verdict, real coverage).
    """
    has_any = bool(exact_studies) or bool(form_syntheses or [])
    if not has_any:
        return 0.0, "untested_in_form"

    def _non_negative(study) -> bool:
        # "Non-negative in your form" is judged by what the study actually
        # CONTRIBUTES (s_value), not by its direction label -- v8 coherence,
        # 2026-08-12. The two disagree in both directions once effects are
        # measured: a `null_effect` whose reported estimate favours the
        # ingredient (s = +0.38) is non-negative evidence the form works, and a
        # `benefit` whose measured effect is sub-threshold (s = -0.25) is
        # evidence AGAINST a meaningful effect in this form. Under the label
        # rule the first earned no ladder credit and the second earned full.
        # Unsized studies are unchanged: label nulls score -0.35 (< 0, out) and
        # label benefits score +0.3/+1.0 (>= 0, in), exactly as before, so a
        # pre-v1.17 corpus produces identical ladders.
        return study.direction != "harm" and study.s_value() >= 0

    ranks = [s.design_rank for s in exact_studies
             if _non_negative(s) and s.design_rank is not None]
    # Synthesis entries are dicts, not Study objects -- they carry no measured
    # effect yet (the SR path extracts direction only), so the label test is
    # still the only test available for them.
    ranks += [e.get("design_rank") for e in (form_syntheses or [])
              if e.get("direction") not in ("harm", "null_effect")
              and e.get("design_rank") is not None]
    lad = form_ladder_score(ranks, top_n)
    if lad is None:
        return 0.0, "all_negative_in_form"
    return lad, "ladder"


def _verdict(studies: list) -> tuple[float | None, float]:
    """(d, total weight) for a subset. d is None when the subset cannot be scored."""
    if not studies:
        return None, 0.0
    weight = sum(s.weight() for s in studies)
    r = score_ecu(studies, [])
    if r.get("score") is None:
        return None, weight
    return r["d"], weight


def _dose_verdict(studies: list) -> tuple[float | None, float]:
    """
    (d, dose-credited weight) with GRADED membership (SCORING_MODEL v10).

    Each study enters at weight x its continuous dose_factor instead of passing
    a binary in_band test. Under the binary rule a trial at 99% of the product's
    dose contributed NOTHING to the dose arc while one at 200% contributed fully
    -- the cliff an adversarial pass flagged, and the same cliff the founder
    challenged on the product side ("4 g against a 5-10 g band"). Now that trial
    counts at ~0.98 and a 20 g loading trial against a 4.4 g product at 0.60's
    tail, priced rather than binned.

    dose_factor None (dose unknown) contributes zero, exactly as "unspecified"
    membership did -- an unassessable axis earns nothing, it is merely not
    punished. Coverage stays "credited weight / total weight", so the arc still
    separates "nobody was dosed near your product" (low coverage) from "they
    were, and here is what they found" (the verdict).
    """
    pairs = [(s, s.weight() * s.dose_factor) for s in studies
             if s.dose_factor is not None and s.weight() > 0]
    dose_w = sum(w for _, w in pairs)
    if dose_w <= 0:
        return None, 0.0
    d = sum(w * s.s_value() for s, w in pairs) / dose_w
    return round(d, 3), dose_w


def _unit(d: float) -> float:
    """Signed verdict -1..+1 -> 0..1, so it can be composed. 0.5 is 'no effect'."""
    return (d + 1.0) / 2.0


def build(studies: list, syntheses: list | None = None, *,
          form_syntheses: list | None = None, form_top: int | None = None) -> dict:
    """
    studies: the Study objects for one ECU.

    Returns {arcs: {...}, composite, signed, band, ...}. The signed score is kept
    alongside -- the bands, the anchor set and every stored row depend on it, and
    only the DISPLAY becomes 0-100.
    """
    overall = score_ecu(studies, syntheses or [])
    if overall.get("score") is None:
        return {"arcs": {k: {"verdict": None, "coverage": 0.0} for k in ARC_ORDER},
                "composite": None, "signed": None,
                "band": overall.get("band"), "gate_fired": True}

    total_w = sum(s.weight() for s in studies) or 1.0
    eff_d, _ = _verdict(studies)
    exact = [s for s in studies if s.form_match == "exact"]
    form_d, form_w = _verdict(exact)
    dose_d, dose_w = _dose_verdict(studies)
    c = overall["c"]

    # The form arc carries THREE facts since the ladder (v5): the signed verdict
    # and coverage exactly as before, plus `strength` -- the evidence-hierarchy
    # score that the composite actually uses. verdict/coverage are what stop
    # "nobody tested your form" and "your form failed" from ever rendering the
    # same; strength is what stops an unreported form from dragging the headline.
    form_s, form_basis = form_strength(exact, form_d, form_syntheses,
                                       top_n=form_top or FORM_LADDER_TOP)

    arcs = {
        "effect": {"verdict": eff_d, "coverage": 1.0},
        "form": {"verdict": form_d, "coverage": round(form_w / total_w, 3),
                 "strength": round(form_s, 3), "basis": form_basis,
                 "n_in_form": len(exact)},
        "dose": {"verdict": dose_d, "coverage": round(dose_w / total_w, 3)},
        # The evidence arc has no direction -- it is pure quantity, so its fill
        # IS its coverage. Drawn last (innermost) because it qualifies the rest.
        "evidence": {"verdict": None, "coverage": round(c, 3), "is_quantity": True},
    }
    return {
        "arcs": arcs,
        "composite": composite(eff_d, form_s, dose_d, c),
        "signed": overall["score"],
        "band": overall["band"],
        "gate_fired": False,
        "c": c, "d": overall["d"], "H": overall["H"], "E": overall["E"],
    }


def composite(effect_d: float | None, form_strength_score: float | None,
              dose_d: float | None, c: float) -> int | None:
    """
    The 0-100 headline.

        100 x c x mean(effect, form, dose)

    Confidence MULTIPLIES rather than averaging in. Measured on five cases: as a
    fourth term in a mean, a single tiny abstract-only trial scored 76/100,
    because three direction terms outvoted it. Confidence is not a peer of the
    other arcs -- if we barely know anything, nothing else matters, and only
    multiplication expresses that.

    A missing subset is PENALISED, not dropped. Averaging over "available" arcs
    gave 99/100 to a product no study had ever tested in that form, identical to
    one whose form was tested and worked. Silence is not a pass.

    50 means "no effect either way", not "half good". 0 means actively harmful
    on strong evidence; a well-studied useless product lands near 0-25, and an
    unstudied one lands near 0 too -- but its EVIDENCE ARC is empty, which is
    what tells them apart. The number alone never could.
    """
    if effect_d is None:
        return None
    eff = _unit(effect_d)
    # The form term arrives ALREADY on 0..1 from form_strength() -- it is an
    # evidence-strength score, not a signed verdict, so it must NOT be _unit()ed.
    # Passing a strength of 0.0 through _unit() would read it as 0.5, "no effect",
    # and hand an untested form half credit. Scales differ deliberately: 0.5 means
    # "neutral" on the effect and dose terms and "moderately strong form evidence"
    # on this one. Both are monotone in the direction a reader expects, and the arc
    # reports strength separately so the mixture is never the published claim.
    form = 0.0 if form_strength_score is None else form_strength_score
    dose = _unit(dose_d) if dose_d is not None else eff * MISSING_DOSE_PENALTY
    return round(100 * c * (eff + form + dose) / 3)


def label(composite_score: int | None, c: float | None,
          effect_verdict: float | None = None,
          applicability_limited: bool = False) -> str:
    """
    Plain words. Deliberately does NOT read a low number as 'bad' when the
    evidence arc is empty -- that is the confusion the whole system exists to
    prevent.
    """
    if composite_score is None:
        return "not enough human evidence"
    if c is None:
        # Confidence missing means the caller lost it in transit, not that the
        # evidence is strong. Never upgrade that silence into a verdict.
        return "confidence unknown"
    if c < 0.15:
        return "barely studied"

    # A composite can be dragged down by APPLICABILITY -- no trial in your form,
    # no dose band -- while the evidence itself is clearly positive. Reading
    # that as a verdict published "probably does not work" for an outcome whose
    # effect arc was +1.00 (unanimous benefit). An applicability penalty is not
    # a finding, and must never be reported as one.
    if effect_verdict is not None and effect_verdict >= 0.25 and composite_score < 45:
        return ("works, but not tested for your product"
                if applicability_limited else "works, but weakly evidenced")
    if effect_verdict is not None and effect_verdict <= -0.25 and composite_score >= 55:
        # The mirror case: never let a good form match read as "works" when the
        # evidence itself is negative.
        return "does not work"

    if composite_score >= 70:
        return "works"
    if composite_score >= 55:
        return "probably works"
    if composite_score >= 45:
        return "unclear"
    if composite_score >= 25:
        return "probably does not work"
    return "does not work"
