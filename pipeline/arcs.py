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

The form and dose arcs are SUBSETS of the effect arc. The 0-100 headline is the
SIGNED score rescaled onto 0-100 and discounted for how much of that evidence
applies to the product in front of you -- see composite().
"""
from __future__ import annotations

from pipeline.scoring import DOSE_FACTOR, FORM_FACTOR, H_PENALTY, score_ecu

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


def build(studies: list, syntheses: list | None = None, *,
          form_syntheses: list | None = None, form_top: int | None = None,
          dose_closeness: float | None = None) -> dict:
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
        # `closeness` is what the composite eats since v12 (founder design:
        # "take all the dosages where there was a positive effect, and see how
        # close our dose is"). verdict/coverage still describe what trials near
        # the product's dose found -- they are the picture, closeness is the
        # score input, the same split the form arc uses (verdict vs strength).
        "dose": {"verdict": dose_d, "coverage": round(dose_w / total_w, 3),
                 "closeness": dose_closeness},
        # The evidence arc has no direction -- it is pure quantity, so its fill
        # IS its coverage. Drawn last (innermost) because it qualifies the rest.
        "evidence": {"verdict": None, "coverage": round(c, 3), "is_quantity": True},
    }
    fit = applicability(form_s, dose_closeness)
    return {
        "arcs": arcs,
        "composite": composite(eff_d, form_s, dose_closeness, c, overall["H"]),
        "applicability": round(fit, 3),
        "signed": overall["score"],
        "band": overall["band"],
        "gate_fired": False,
        "c": c, "d": overall["d"], "H": overall["H"], "E": overall["E"],
    }


def applicability(form_strength_score: float | None,
                  dose_closeness: float | None) -> float:
    """
    How much of the evidence applies to THIS product, 0..1. The composite's
    only input beyond the signed score (SCORING_MODEL v14).

        mean(form strength, dose closeness)

    Both terms arrive already on 0..1 and both are evidence-ABOUT-YOUR-BOTTLE
    scores, not verdicts: the form ladder (v5) says how strong the non-negative
    evidence in your exact form is, the dose closeness (v12) says how near your
    dose sits to the range where benefit occurred. Neither carries a direction
    -- direction lives in the signed score alone -- so a mean of the two is a
    plain "share of the evidence that is about your product".

    A MISSING axis is priced, never dropped (the 2026-08-07 measurement stands:
    averaging over "available" axes handed 99/100 to a product no trial had
    used in that form). No form evidence contributes 0.0; no benefit dose range
    contributes MISSING_DOSE_PENALTY (0.10) -- the transfer tier SPEC section 8
    already assigns to "dose relationship unestablished", so no new constant.
    The founder call of 2026-08-12 ("don't fix that thing we lose") is kept:
    a dose where trials looked and FAILED and a dose nobody looked at both
    read as "outside the range where it worked"; the row's null_range and the
    dose arc show a reader the difference, it does not move this number.
    """
    form = 0.0 if form_strength_score is None else float(form_strength_score)
    dose = (float(dose_closeness) if dose_closeness is not None
            else MISSING_DOSE_PENALTY)
    return max(0.0, min(1.0, (form + dose) / 2.0))


def composite(effect_d: float | None, form_strength_score: float | None,
              dose_closeness: float | None, c: float, h: float) -> int | None:
    """
    The 0-100 headline (SCORING_MODEL v14-applicability-discount).

        signal    = d x c x (1 - H_PENALTY x H)        (= signed score / 100)
        composite = 50 + 50 x signal x (A if signal > 0 else 1)

    where A is applicability() -- the mean of form strength and dose closeness.
    So the headline IS the signed score, rescaled onto 0-100 (50 = the evidence
    points nowhere), and then pulled back toward 50 by however much of that
    evidence is NOT about your product. At full applicability the identity is
    exact: composite = 50 + signed / 2, and SPEC section 9's signed bands map
    one-to-one onto the labels below.

    WHY THIS REPLACED 100 x c x mean(effect, form, dose) (2026-09-04, founder:
    "it's too strict, make it make sense"). That mean treated two
    APPLICABILITY terms as peers of the one DIRECTION term, so the number was
    set mostly by the applicability axes and only a third by what the trials
    found. Measured on the 155-study creatine run (v13):

        d = +0.04, c = 0.82, form 0.80, NO benefit dose range
            -> dose term 0.05 -> 38 "probably does not work"   (evidence: neutral)
        the same d with the dose term at 1.0 -> 63 "probably works"
        d = 0.00 (nothing works), form 0.80, dose 1.0, c = 1 -> 77 "works"
        d = -1.00 (harm) with full form and dose, c = 1        -> 60 "probably works"

    A well-matched useless product read "works" and a poorly-matched neutral
    one read "does not work". Applicability cannot be a peer of direction: it
    can only QUALIFY a verdict, never supply one.

    Three properties, each measured against the fixtures in selftest:

    - CONFIDENCE STILL MULTIPLIES, inside the signed score, so one tiny trial
      still cannot score well -- but it now lands at ~50 "barely studied"
      rather than ~3. Low confidence means "we do not know", and the middle of
      the scale is where "we do not know" belongs. "Barely studied" and "does
      not work" stay distinguishable by the number AND by the evidence arc.
    - APPLICABILITY DISCOUNTS BENEFIT ONLY. A positive verdict for an
      ingredient does not transfer to an untested form or an untested dose, so
      it is pulled toward 50. A NEGATIVE verdict is not softened by a poor
      match: harm is a safety signal and a null is the burden of proof
      unmet, and "your form was never tested" is no reason to read either as
      "unclear". This is the same under-count direction every other refusal in
      the system takes (invariants 6, 7, 9).
    - SILENCE IS STILL NOT A PASS. An untested form or a missing dose range
      cannot raise the number; it caps how far above 50 a positive verdict may
      travel (untested form + no dose range: A = 0.05, so even d = +1 at
      c = 1 reads 52 "unclear").

    0 still means actively harmful on strong evidence and 100 a strong,
    replicated, fully applicable benefit. 50 now means exactly one thing: the
    evidence points nowhere, either because it is neutral or because there is
    too little of it -- and the evidence arc says which.
    """
    if effect_d is None:
        return None
    signal = float(effect_d) * float(c) * (1.0 - H_PENALTY * float(h or 0.0))
    if signal > 0:
        signal *= applicability(form_strength_score, dose_closeness)
    return int(max(0, min(100, round(50.0 + 50.0 * signal))))


def label(composite_score: int | None, c: float | None,
          effect_verdict: float | None = None,
          applicability_limited: bool = False,
          applicability_score: float | None = None) -> str:
    """
    Plain words. Deliberately does NOT read a low number as 'bad' when the
    evidence arc is empty -- that is the confusion the whole system exists to
    prevent.

    THE THRESHOLDS ARE SPEC SECTION 9's SIGNED BANDS, not new constants. Under
    v14 the composite at full applicability is exactly 50 + signed/2, so each
    band maps onto the 0-100 scale arithmetically:

        signed  +30 .. +100  moderate/strong support   -> composite >= 65  "works"
        signed  +10 .. +29   weak support              -> 55 .. 64  "probably works"
        signed   -9 .. +9    inconclusive              -> 45 .. 54  "unclear"
        signed  -39 .. -10   weak evidence against     -> 30 .. 44  "probably does not work"
        signed -100 .. -40   does not work / harm      ->  0 .. 29  "does not work"

    So 20 unanimous well-run nulls (signed -35, the fixture the null constant
    was chosen on) read "probably does not work", and harm reads "does not
    work", exactly where the founder's bands put them.

    `applicability_score` is the v14 A term when the caller has it; below 0.5
    the product's own form/dose is the reason a positive verdict sits low, and
    the label says so instead of blaming the evidence.
    """
    if composite_score is None:
        return "not enough human evidence"
    if c is None:
        # Confidence missing means the caller lost it in transit, not that the
        # evidence is strong. Never upgrade that silence into a verdict.
        return "confidence unknown"
    if c < 0.15:
        return "barely studied"

    limited = applicability_limited or (
        applicability_score is not None and applicability_score < 0.5)
    # A composite can be pulled toward 50 by APPLICABILITY -- no trial in your
    # form, a dose far from where it worked -- or by thin confidence, while
    # the evidence itself is clearly positive. An applicability penalty is not
    # a finding, and must never be reported as one.
    if effect_verdict is not None and effect_verdict >= 0.25 and composite_score < 55:
        return ("works, but not tested for your product"
                if limited else "works, but weakly evidenced")
    if effect_verdict is not None and effect_verdict <= -0.25 and composite_score >= 55:
        # The mirror case: never let a good form match read as "works" when the
        # evidence itself is negative. Unreachable under v14 (applicability
        # never lifts a negative signal) and kept as a guard.
        return "does not work"

    if composite_score >= 65:
        return "works"
    if composite_score >= 55:
        return "probably works"
    if composite_score >= 45:
        return "unclear"
    if composite_score >= 30:
        return "probably does not work"
    return "does not work"
