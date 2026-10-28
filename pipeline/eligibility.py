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


def _counter_ions() -> dict[str, frozenset[str]]:
    """{form id: its counter-ion names} from vocab/form.json (deterministic)."""
    from pipeline import vocab
    return {f["id"]: frozenset(_arm_norm(c) for c in f.get("counter_ion") or [])
            for ing in vocab.load("form")["ingredients"].values() for f in ing.get("forms") or []}


def _arm_cointerventions(arm: dict, s3: dict | None, s7: dict | None = None) -> frozenset[str] | None:
    """The arm's co-interventions as S3 lists them, WITHOUT what is part of the
    preparation (founder rule 2026-10-28, vocab/cointervention.json and
    vocab/form.json `counter_ion`):
      - a carrier (bare name: dextrose, maltodextrin, cellulose ...) listed on
        EVERY administered ingredient arm: the vehicle. A carrier only some
        ingredient arms get (creatine vs creatine + glucose) is a designed
        factor and stays.
      - the counter-ion of the arm's own form, from S7 by arm label (nitrate
        for creatine nitrate): part of the form, judged as form indirectness.
    MEASURED on run 20261028_082425: doi:103390nu10111640 (creatine + 5 g
    dextrose; the placebo got the same dextrose, which S3 did not list),
    doi:101007s1260301811488 (maltodextrin; the placebo IS maltodextrin) and
    doi:103390nu9121359 (creatine nitrate) were refused as 'arms differ'.
    None (unknown) stays None."""
    from pipeline import vocab
    own = _normalise_cointerventions(arm.get("active_cointerventions"))
    if own is None:
        return None
    carriers = frozenset(_arm_norm(c) for c in vocab.load("cointervention")["carriers"])
    ingredient_arms = [a for a in (s3 or {}).get("arms") or [] if isinstance(a, dict)
                       and a.get("role", "administered") == "administered"
                       and a.get("target_ingredient_presence") == "yes"]
    lists = [_normalise_cointerventions(a.get("active_cointerventions")) or frozenset() for a in ingredient_arms]
    vehicle = frozenset.intersection(*lists) & carriers if lists else frozenset()
    ions: frozenset[str] = frozenset()
    for row in (s7 or {}).get("arms") or []:
        if isinstance(row, dict) and _arm_norm(row.get("label")) == _arm_norm(arm.get("label")):
            ions = _counter_ions().get(row.get("form_vocab_id"), frozenset())
    return own - vehicle - ions


def _matched_factorial_background(s3: dict | None, ingredient: str, s7: dict | None = None) -> bool:
    """True only for an explicitly matched A+B versus B factorial contrast."""
    if not isinstance(s3, dict) or not isinstance(s3.get("arms"), list):
        return False
    arms = [a for a in s3["arms"] if isinstance(a, dict) and
            a.get("role", "administered") == "administered"]
    targets = [a for a in arms if a.get("target_ingredient_presence") == "yes"]
    controls = [a for a in arms if a.get("target_ingredient_presence") == "no"]
    if len(targets) != 1 or len(controls) != 1:
        return False
    target_co = _arm_cointerventions(targets[0], s3, s7)
    control_co = _arm_cointerventions(controls[0], s3, s7)
    return target_co is not None and control_co is not None and target_co == control_co


def _claim_arm_pair(claim: dict, s3: dict | None) -> tuple[dict | None, dict | None]:
    """The claim's ingredient and control arms as administered S3 arms, each
    by exact, unique label; (None, None) when either does not resolve."""
    arms = [a for a in (s3 or {}).get("arms") or [] if isinstance(a, dict)
            and a.get("role", "administered") == "administered"]

    def one(label):
        hits = [a for a in arms if _arm_norm(a.get("label")) == _arm_norm(label)]
        return hits[0] if _arm_norm(label) and len(hits) == 1 else None
    target, control = one(claim.get("ingredient_arm")), one(claim.get("control_arm"))
    if not target or not control or target is control:
        return None, None
    return target, control


def matched_addon_claim(claim: dict, s3: dict | None, s7: dict | None = None) -> bool:
    """True when THIS claim's two arms are an explicitly matched add-on pair:
    the claim's ingredient arm and control arm each resolve (exact label,
    unique) to an administered S3 arm, the first with the ingredient and the
    second without, and both list the SAME co-interventions. Then the contrast
    isolates the ingredient even when the trial has other arms (A / B / A+X):
    `_matched_factorial_background` asks the same question of a whole two-arm
    trial. Unknown co-interventions (None) never match. Evidence method v2 only
    (pipeline/pool.py); founder 2026-10-05, measured on isrctn68542582 (PLA /
    GAA / GAA + CrM, refused whole although GAA + CrM vs GAA isolates creatine)."""
    target, control = _claim_arm_pair(claim, s3)
    if not target:
        return False
    if target.get("target_ingredient_presence") != "yes" or control.get("target_ingredient_presence") != "no":
        return False
    t_co, c_co = _arm_cointerventions(target, s3, s7), _arm_cointerventions(control, s3, s7)
    return t_co is not None and c_co is not None and t_co == c_co


def unmatched_claim_arms(claim: dict, s3: dict | None, s7: dict | None = None) -> bool:
    """True when THIS claim's two arms are known to differ in more than the
    ingredient: both resolve (exact label, unique) to administered S3 arms and
    both list their co-interventions, and the lists differ. The study-level
    rule in `_ineligible` reads S3's `ingredient_isolated`, which is "yes" when
    ANY pair isolates the ingredient, so the other pairs of a multi-arm trial
    were kept. Unknown (an arm that does not resolve, a list that is None)
    keeps the claim. Founder 2026-10-26; measured on doi:103390nu13072303
    (CS-RT+CrM / CS-RT / no-training control): CS-RT+CrM vs the control was
    pooled for strength, power and lean mass (g 1.21, 1.27, 1.09) once S5N
    mislabelled the matched CS-RT pair."""
    target, control = _claim_arm_pair(claim, s3)
    if not target:
        return False
    t_co, c_co = _arm_cointerventions(target, s3, s7), _arm_cointerventions(control, s3, s7)
    return t_co is not None and c_co is not None and t_co != c_co


def with_s3_contrast(claim: dict, s3: dict | None) -> tuple[dict, bool]:
    """(claim, decided): the claim with `contrast` set from S3's arm facts when
    both of its arms resolve to administered S3 arms -- ingredient present in
    the first and absent in the second is vs_ingredient_free, present in both is
    vs_ingredient_arm -- and `decided` True; otherwise the claim unchanged
    (S5N's label stands) and False. S3 is the study's arm reader; the arm's
    presence of the target ingredient is its fact, not S5N's. Founder rule
    2026-10-28 (Claude): MEASURED, S5N labelled add-on controls (creatine + X
    vs X) and once "CREATINE vs PLACEBO" vs_ingredient_arm on 21 claims at
    v1.40 and 20 at v1.41, after a prompt fix aimed at exactly that."""
    target, control = _claim_arm_pair(claim, s3)
    if not target:
        return claim, False
    t, c = target.get("target_ingredient_presence"), control.get("target_ingredient_presence")
    contrast = {("yes", "no"): "vs_ingredient_free", ("yes", "yes"): "vs_ingredient_arm"}.get((t, c))
    if contrast is None:
        return claim, False
    return ({**claim, "contrast": contrast} if claim.get("contrast") != contrast else claim), True


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
            not _matched_factorial_background(s3, ext.get("record", {}).get("ingredient", ""), ext.get("S7"))):
        return "no_isolated_ingredient_arm"
    return None
