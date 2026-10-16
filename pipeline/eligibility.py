"""
Study scope refusals. NO MODEL MAY ENTER THIS FILE.

The refusals are invariant 7's three scope rules (all arms get the ingredient,
self-declared underpowered, ingredient not isolated); both fields default to KEEP.
v2 (pipeline/pool.py) drops the "self-declared underpowered" refusal and keeps
a matched add-on pair (matched_addon_claim). The v14 one-study-one-vote
collapse and claim-level arm firewall that lived beside these are in
`git show v14-final:pipeline/eligibility.py` / `pipeline/claim_arms.py`.
"""
from __future__ import annotations

import re


def _arm_norm(value) -> str:
    """Stable arm-label comparison; never invents aliases or ingredient names."""
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def _normalise_cointerventions(values) -> frozenset[str] | None:
    if not isinstance(values, list):
        return None
    return frozenset(_arm_norm(v) for v in values if _arm_norm(v))


def _matched_factorial_background(s3: dict | None, ingredient: str) -> bool:
    """True only for an explicitly matched A+B versus B factorial contrast."""
    if not isinstance(s3, dict) or not isinstance(s3.get("arms"), list):
        return False
    arms = [a for a in s3["arms"] if isinstance(a, dict) and
            a.get("role", "administered") == "administered"]
    targets = [a for a in arms if a.get("target_ingredient_presence") == "yes"]
    controls = [a for a in arms if a.get("target_ingredient_presence") == "no"]
    if len(targets) != 1 or len(controls) != 1:
        return False
    target_co = _normalise_cointerventions(targets[0].get("active_cointerventions"))
    control_co = _normalise_cointerventions(controls[0].get("active_cointerventions"))
    return target_co is not None and control_co is not None and target_co == control_co


def matched_addon_claim(claim: dict, s3: dict | None) -> bool:
    """True when THIS claim's two arms are an explicitly matched add-on pair:
    the claim's ingredient arm and control arm each resolve (exact label,
    unique) to an administered S3 arm, the first with the ingredient and the
    second without, and both list the SAME co-interventions. Then the contrast
    isolates the ingredient even when the trial has other arms (A / B / A+X):
    `_matched_factorial_background` asks the same question of a whole two-arm
    trial. Unknown co-interventions (None) never match. Evidence method v2 only
    (pipeline/pool.py); founder 2026-10-05, measured on isrctn68542582 (PLA /
    GAA / GAA + CrM, refused whole although GAA + CrM vs GAA isolates creatine)."""
    arms = [a for a in (s3 or {}).get("arms") or [] if isinstance(a, dict)
            and a.get("role", "administered") == "administered"]

    def one(label):
        hits = [a for a in arms if _arm_norm(a.get("label")) == _arm_norm(label)]
        return hits[0] if _arm_norm(label) and len(hits) == 1 else None
    target, control = one(claim.get("ingredient_arm")), one(claim.get("control_arm"))
    if not target or not control or target is control:
        return False
    if target.get("target_ingredient_presence") != "yes" or control.get("target_ingredient_presence") != "no":
        return False
    t_co = _normalise_cointerventions(target.get("active_cointerventions"))
    c_co = _normalise_cointerventions(control.get("active_cointerventions"))
    return t_co is not None and c_co is not None and t_co == c_co


def _ineligible(ext: dict) -> str | None:
    """
    Why this trial cannot answer whether the ingredient works. None = it can.

    Every refusal is a SCOPE rule, not a discount: the trial is answering a
    different question, so down-weighting it would still be counting the wrong
    answer, just quietly.

    MEASURED 2026-08-10, 80-study creatine corpus. Of the 23 null verdicts
    driving muscle_strength and muscle_power negative, 5 verifiers reading the
    actual papers found 11 that are not evidence against creatine at all:

      no ingredient-free arm   3   every arm took creatine and the trial compared
                                   morning vs evening, one dosing schedule vs
                                   another, or creatine+HMB vs creatine. One says
                                   so outright -- "a control group that did not
                                   consume the Cr supplement was not considered
                                   necessary given the high level of scientific
                                   evidence that exists on how Cr improves
                                   performance." Its 1RM rose in BOTH creatine
                                   arms. v14 scored it -0.7 against creatine.
      self-declared underpowered 6  CONSORT pilot/feasibility designs (n=8 per
                                   arm, no power calculation) and trials that
                                   state they missed their own a priori target
                                   -- 33 of 42, 28 of 48, 22 of 34.

    The second row was a v14 refusal. Evidence method v2 dropped it (pooling
    already gives a small trial a small weight) and S3 stopped extracting
    `self_declared_underpowered` in v1.37.

    Every refusal is SYMMETRIC (a benefit is dropped too) and defaults to
    "keep": `unknown`/None/absent never excludes. S3 is
    told to answer `unknown` when unsure, so a hesitant extractor loses no
    evidence -- it only fails to gain the refusal.
    """
    s3 = ext.get("S3") or {}
    arms = s3.get("arms") if isinstance(s3, dict) else None
    if isinstance(arms, list) and arms:
        administered = [a for a in arms if isinstance(a, dict) and
                        a.get("role", "administered") == "administered"]
        if not administered and any(isinstance(a, dict) and a.get("role") in
                                     ("measurement_only", "biomarker") for a in arms):
            return "no_administered_intervention_arm"
        explicit_presence = [a.get("target_ingredient_presence") for a in administered]
        if explicit_presence and all(p == "yes" for p in explicit_presence):
            return "no_ingredient_free_arm"
    if s3.get("comparator") == "all_arms_get_ingredient":
        return "no_ingredient_free_arm"
    # Combination refusal, 2026-08-10 (decision delegated by the founder the same day;
    # measured basis in the v14-era REVIEW_PENDING #4, at tag v14-final). A trial whose every treatment
    # arm co-administers another active ingredient tests a COMBINATION --
    # creatine+HMB vs placebo says nothing about creatine alone, in either
    # direction. 21 of 143 studies in the audited corpus were this shape, every
    # one had a genuine ingredient-free control (so the first refusal correctly
    # did not fire), and the one read in full ALSO carried significant benefits
    # that were never credited. SYMMETRIC like the others: a combination's
    # benefit is dropped too. "yes"/unknown/None/absent all KEEP -- only S3's
    # explicit "no" (no arm isolates the ingredient) refuses.
    if (s3.get("ingredient_isolated") == "no" and
            not _matched_factorial_background(s3, ext.get("record", {}).get("ingredient", ""))):
        return "no_isolated_ingredient_arm"
    return None
