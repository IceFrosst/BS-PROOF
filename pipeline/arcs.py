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
# section 8 rather than inventing a new number: no exact-form evidence means you
# are relying on a different form (0.15); no in-band dose evidence means the
# dose relationship is unestablished (0.10).
MISSING_FORM_PENALTY = FORM_FACTOR["different"]
MISSING_DOSE_PENALTY = DOSE_FACTOR["below_50"]


def _verdict(studies: list) -> tuple[float | None, float]:
    """(d, total weight) for a subset. d is None when the subset cannot be scored."""
    if not studies:
        return None, 0.0
    weight = sum(s.weight() for s in studies)
    r = score_ecu(studies, [])
    if r.get("score") is None:
        return None, weight
    return r["d"], weight


def _unit(d: float) -> float:
    """Signed verdict -1..+1 -> 0..1, so it can be composed. 0.5 is 'no effect'."""
    return (d + 1.0) / 2.0


def build(studies: list, syntheses: list | None = None) -> dict:
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
    form_d, form_w = _verdict([s for s in studies if s.form_match == "exact"])
    dose_d, dose_w = _verdict([s for s in studies if s.dose_match == "in_band"])
    c = overall["c"]

    arcs = {
        "effect": {"verdict": eff_d, "coverage": 1.0},
        "form": {"verdict": form_d, "coverage": round(form_w / total_w, 3)},
        "dose": {"verdict": dose_d, "coverage": round(dose_w / total_w, 3)},
        # The evidence arc has no direction -- it is pure quantity, so its fill
        # IS its coverage. Drawn last (innermost) because it qualifies the rest.
        "evidence": {"verdict": None, "coverage": round(c, 3), "is_quantity": True},
    }
    return {
        "arcs": arcs,
        "composite": composite(eff_d, form_d, dose_d, c),
        "signed": overall["score"],
        "band": overall["band"],
        "gate_fired": False,
        "c": c, "d": overall["d"], "H": overall["H"], "E": overall["E"],
    }


def composite(effect_d: float | None, form_d: float | None,
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
    form = _unit(form_d) if form_d is not None else eff * MISSING_FORM_PENALTY
    dose = _unit(dose_d) if dose_d is not None else eff * MISSING_DOSE_PENALTY
    return round(100 * c * (eff + form + dose) / 3)


def label(composite_score: int | None, c: float | None) -> str:
    """
    Plain words. Deliberately does NOT read a low number as 'bad' when the
    evidence arc is empty -- that is the confusion the whole system exists to
    prevent.
    """
    if composite_score is None:
        return "not enough human evidence"
    if c is not None and c < 0.15:
        return "barely studied"
    if composite_score >= 70:
        return "works"
    if composite_score >= 55:
        return "probably works"
    if composite_score >= 45:
        return "unclear"
    if composite_score >= 25:
        return "probably does not work"
    return "does not work"
