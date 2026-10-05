"""
Scope refusals and one-study-one-vote collapsing for ECU buckets. NO MODEL MAY
ENTER THIS FILE. Moved verbatim out of pipeline/assemble.py on 2026-10-03;
assemble re-exports `_one_study_one_vote`, `_matched_factorial_background` and
`_ineligible`.

The refusals are invariant 7's three scope rules (all arms get the ingredient,
self-declared underpowered, ingredient not isolated); both fields default to KEEP.
"""
from __future__ import annotations
from dataclasses import replace

from pipeline.claim_arms import _normalise_cointerventions


def _one_study_one_vote(pairs: list[tuple]) -> tuple[list[tuple], int]:
    """
    Collapse an ECU bucket so ONE TRIAL IS ONE VOTE. Returns (pairs, n_collapsed).

    `score_ecu` documents its own contract -- "primaries: UNIQUE primary studies
    only. Dedup happens before this is called." -- and until 2026-08-10 nothing
    did. `to_studies` emits one Study PER CLAIM, all carrying the same
    `record["_canonical"]`, and this bucket appended every one of them. One real
    S5 output expanded ONE finding across a sex x phase x body-region grid into
    20 claims, so E, c, H and the human-evidence gate were all set by how finely
    the model happened to slice the paper.

    WHICH CLAIM SURVIVES -- and the first answer here was wrong.

    v1 kept the LOWEST s_value, on the reasoning that a collapse must never
    inflate. MEASURED on 158 cached S5 extractions, that rule contradicted the
    trial's OWN PRIMARY OUTCOME in 31 of the 87 that declare one (36%):

        primary said benefit -> recorded null_effect   20
        primary said benefit -> recorded harm           4
        primary said benefit -> recorded unclear        4
        primary said unclear/null -> recorded harm      3

    So 28 of 87 trials that found an effect on the endpoint they were DESIGNED
    AND POWERED to test were filed as evidence against. That is a systematic
    score-lowering bias, and it is most of why an 80-study creatine corpus
    returned d = -0.265 for muscle strength -- a result that contradicts one of
    the most replicated findings in sports nutrition.

    The rule now, in order:

    1. A claim flagged `is_primary_outcome` wins. That is the question the trial
       was built to answer; secondary endpoints are hypothesis-generating and
       usually underpowered. If several claims are primary, take the most
       conservative among THEM.
    2. No primary declared (71 of 158 extractions) -> MAJORITY direction. Not
       "any benefit wins": measure twenty endpoints at p<0.05 and one turns up
       by chance, so letting a lone positive override nine nulls is the
       multiple-comparisons trap this pipeline exists to resist. Not "lowest
       wins" either, because that penalises a trial for measuring more things.

    3. A benefit/null TIE resolves to `unclear` (s = 0.0). `harm` still wins any
       tie it is in, because a safety signal must never be averaged away.

       This was "ties broken conservatively" -- the null won -- until
       2026-08-10, and it inverted a real trial. PMC6534934 reports bench-press
       MEAN POWER up 17.9% vs placebo, interaction p = 0.003, AND bench-press
       mRFD null at p = 0.101. S6 maps both constructs to muscle_power, neither
       is flagged primary, so the bucket tied 1-1 and the conservative rule
       filed a measured, significant, between-group effect as evidence AGAINST
       creatine at s = -0.7.

       Why `unclear` and not "benefit wins": that would be the same error
       mirrored. The trial found an effect on one measure of this outcome and
       not on another; it did not confirm and it did not disconfirm. s = 0.0 is
       the reading that adds no evidence in either direction, and it is the only
       tie rule that treats the two failure modes symmetrically -- which matters
       here, because handling uncertainty asymmetrically is the defect this
       whole investigation found.

       The multiple-comparisons worry does not apply to a tie. It is the reason
       a LONE positive must not override nine nulls, and the majority rule above
       still enforces that. Nulls also still win outright whenever they are the
       primary or the majority, so invariant 7 is untouched: what changed is
       only that a null no longer wins a coin-flip against a measured effect.

    Nulls are still never silently dropped -- a null that is the primary, or the
    majority, still wins. Invariant 7 is intact; what changed is that a null is
    no longer allowed to overrule the trial's own designed answer.

    SR-derived rows carry is_primary=False (a review table designates no
    endpoint) and are collapsed on the same key: a trial reachable both directly
    and through a review is still one trial (invariant 6).
    """
    # Conservatism order, used when SEVERAL claims are flagged primary.
    _CONS = {"harm": 0, "null_effect": 1, "unclear": 1, "benefit": 2}

    def _rank(pair):
        return _CONS.get(pair[0].direction, 1)

    def _break_tie(winners: list[str], group: list[tuple]) -> tuple:
        """Resolve a tied majority. See rule 3 in the docstring."""
        if "harm" in winners:                       # safety is never averaged away
            return next(g for g in group if g[0].direction == "harm")
        if {"benefit", "null_effect"} <= set(winners):
            pair = next(g for g in group if g[0].direction == "null_effect")
            # Same Study, re-read as "this trial did not give one answer here".
            # effect_s MUST be cleared alongside the direction. The tie rule's
            # whole point is that the trial "did not confirm and did not
            # disconfirm", which s = 0.0 expresses -- but s_value() prefers a
            # measured effect over the label, so a surviving number would keep
            # voting and the tie would silently pick a side. The selftest pin
            # "a benefit/null tie adds no evidence in either direction" (d == 0.0)
            # passes either way today only because its fixture carries no number.
            return (replace(pair[0], direction="unclear", magnitude=None,
                            effect_s=None, effect_route="tie_cleared"), pair[1])
        return next(g for g in group
                    if g[0].direction == min(winners, key=lambda d: _CONS.get(d, 1)))

    by_id: dict[str, list[tuple]] = {}
    order: list[str] = []
    for pair in pairs:
        sid = pair[0].id
        if sid not in by_id:
            by_id[sid] = []
            order.append(sid)
        by_id[sid].append(pair)

    kept, n_collapsed = [], 0
    for sid in order:
        group = by_id[sid]
        n_collapsed += len(group) - 1
        if len(group) == 1:
            kept.append(group[0]); continue
        # New S5 hierarchy is preferred when evidenced. A declared primary
        # endpoint leads; an explicit unknown-role sibling mixed with eligible
        # non-primary claims is intentionally unclear rather than majority-voted
        # into a direction. The legacy boolean remains compatible.
        role_primaries = [g for g in group if (g[1] or {}).get("outcome_role") == "primary"]
        primaries = role_primaries or [g for g in group if (g[1] or {}).get("is_primary")]
        if primaries:
            kept.append(min(primaries, key=_rank)); continue
        roles = {(g[1] or {}).get("outcome_role") for g in group}
        if "unknown" in roles and any(r in roles for r in ("secondary", "exploratory")):
            if any(g[0].direction == "harm" for g in group):
                kept.append(next(g for g in group if g[0].direction == "harm"))
            else:
                candidate = group[0]
                kept.append((replace(candidate[0], direction="unclear", magnitude=None,
                                     effect_s=None, effect_route="mixed_role_unclear"), candidate[1]))
            continue
        counts: dict[str, int] = {}
        for g in group:
            counts[g[0].direction] = counts.get(g[0].direction, 0) + 1
        top = max(counts.values())
        winners = [d for d, c in counts.items() if c == top]
        if len(winners) == 1:
            kept.append(next(g for g in group if g[0].direction == winners[0]))
        else:
            kept.append(_break_tie(winners, group))
    return kept, n_collapsed


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
    from pipeline.claim_arms import _arm_norm
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
    Why this trial cannot vote on whether the ingredient works. None = it can.

    Both refusals are SCOPE rules, not discounts, and both are the same shape as
    invariant 6's five refusals: the trial is answering a different question, so
    down-weighting it would still be counting the wrong answer, just quietly.

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
                                   arms. We scored it -0.7 against creatine.
      self-declared underpowered 6  CONSORT pilot/feasibility designs (n=8 per
                                   arm, no power calculation) and trials that
                                   state they missed their own a priori target
                                   -- 33 of 42, 28 of 48, 22 of 34.

    The underpowered rule is applied SYMMETRICALLY -- a pilot's benefit is
    dropped too. Keeping pilot benefits while dropping pilot nulls would be the
    same one-way handling of uncertainty that this investigation was opened to
    find. If the authors say the trial could not answer the question, it does
    not answer it in either direction.

    Both fields default to "keep": `unknown`/None/absent never excludes. S3 is
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
    if s3.get("self_declared_underpowered") is True:
        return "self_declared_underpowered"
    # Third refusal, 2026-08-10 (decision delegated by the founder the same day;
    # measured basis in docs/REVIEW_PENDING.md #4). A trial whose every treatment
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
