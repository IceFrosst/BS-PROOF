"""
Worker JSON -> Study objects -> scored ECU rows. NO MODEL MAY ENTER THIS FILE.

Demo flags (for founder demos only — not production claims):
  exact_form_only=True  drop studies that are not form_match == "exact"
  ignore_population=True  treat every study as pop_match == "exact"

Predatory venues: flagged on the record for reporting; do NOT zero weight yet
(founder policy 2026-08-07). See pipeline/predatory.ZERO_WEIGHT.
"""
from __future__ import annotations
from dataclasses import replace
from datetime import datetime, timezone

from pipeline import vocab
from pipeline import arcs as arcsmod
from pipeline import dose as dosemod
from pipeline import scoring
from pipeline.scoring import Study, score_ecu, contributions

SCORER_VERSION = "v1"
UNBANDED_DOSE_MATCH = "in_band"


def _rob_items(s4: dict | None, registry: dict | None) -> dict:
    items = {}
    for i in range(1, 7):
        key = {1: "item1_randomisation_method", 2: "item2_double_blind_placebo",
               3: "item3_prospective_registration", 4: "item4_outcome_matches_registry",
               5: "item5_attrition_ok", 6: "item6_itt"}[i]
        items[f"i{i}"] = (s4 or {}).get(key)

    if registry and registry.get("item3_prospective") is not None:
        items["i3"] = registry["item3_prospective"]

    if (s4 or {}).get("item5_attrition_ok") is None and registry:
        rate = registry.get("dropout_rate")
        if rate is not None:
            items["i5"] = 1 if rate < 0.20 else 0
    return items


def study_dose(ingredient: str, s7: dict | None) -> dict:
    if not s7:
        return {"dose_low_mg": None, "dose_high_mg": None, "dose_basis": "unstated"}
    form_id = s7.get("form_vocab_id")
    stated = s7.get("elemental_dose_mg")
    if stated is not None:
        return {"dose_low_mg": stated, "dose_high_mg": stated,
                "dose_basis": s7.get("dose_basis") or "elemental_stated"}
    # PER-KG DOSING (v1.19). "0.3 g/kg/day" was the single largest cause of a
    # missing dose -- 25 of 76 dose-less extractions in the creatine corpus. The
    # multiplication happens HERE, deterministically, and only when BOTH numbers
    # are the paper's own (S7 is forbidden from assuming a body weight, and so is
    # this function -- per-kg with no stated mean mass stays doseless, invariant
    # 5). Arithmetic on reported numbers, not inference of an unreported one.
    per_kg, mass = s7.get("dose_per_kg_mg"), s7.get("mean_body_mass_kg")
    if per_kg is not None and mass is not None:
        try:
            daily = float(per_kg) * float(mass)
        except (TypeError, ValueError):
            daily = None
        if daily is not None and daily > 0:
            return {"dose_low_mg": daily, "dose_high_mg": daily,
                    "dose_basis": "per_kg_x_stated_mass"}
    rng = vocab.elemental_dose_range_mg(ingredient, form_id, s7.get("compound_dose_mg"))
    return {"dose_low_mg": rng["low"], "dose_high_mg": rng["high"],
            "dose_basis": rng["basis"]}


def sr_derived_to_studies(rec: dict, product: dict, *,
                          bands: dict | None = None
                          ) -> list[tuple[str, Study, dict]]:
    """
    One SR-table-derived trial -> (outcome_id, Study, dose) tuples.

    Scored by the SAME rules as a paper we read: design x RoB x size x funding
    x OA. The only differences are honest ones and both are already in the
    scoring model -- oa='sr_table' (0.85) and rob_inherited (0.85), together
    ~0.72 of the weight of the same trial read directly.

    Funding is 'undisclosed' (0.80) rather than 'independent': reviews almost
    never report per-trial funding, and absence of a disclosure is not evidence
    of independence.
    """
    ingredient = product["ingredient"]
    form_id = vocab.form_id_for_text(ingredient, rec.get("form_text"))
    form_match = vocab.form_match(ingredient, form_id, product.get("form_vocab_id"))

    dose = {"dose_low_mg": None, "dose_high_mg": None, "dose_basis": "sr_table"}

    out = []
    for entry in rec.get("outcomes") or []:
        oid = entry.get("outcome_vocab_id")
        if not oid or entry.get("discarded"):
            continue
        # SR-table rows carry no per-trial dose (a review's characteristics
        # table rarely states one usably), so under the study-vs-product
        # semantics of 2026-08-12 the axis is UNASSESSABLE for them -- same rule
        # as a directly-read paper whose S7 found no dose. The old code compared
        # the product to the derived band here, which put every SR trial in the
        # dose arc whenever the product happened to sit in band, crediting
        # evidence "at your dose" from trials whose dose nobody knows.
        dose_match = "unspecified"
        claim = entry.get("claim") or {}
        direction = claim.get("direction")
        magnitude = claim.get("magnitude")
        if vocab.outcome_kind(oid) == "adverse_event" and direction == "null_effect":
            direction, magnitude = "benefit", "trivial"
        sr_eff_s, sr_eff_route = _effect_s(claim, oid)
        out.append((oid, Study(
            id=rec["_canonical"],
            design_rank=rec.get("design_rank") or 14,
            n=rec.get("n"),
            effect_s=sr_eff_s,
            effect_route=sr_eff_route,
            rob_items={},
            rob_band_direct=rec.get("rob"),
            rob_inherited=True,
            funding="undisclosed",
            venue_ok=True,
            oa="sr_table",
            form_match=form_match,
            dose_match=dose_match,
            pop_match="exact",
            direction=direction,
            magnitude=magnitude,
        ), dose, False))
    return out


def to_studies(record: dict, extraction: dict, product: dict,
               registry: dict | None = None, *,
               ignore_population: bool = False,
               dose_bands: dict[str, dict] | None = None) -> list[tuple[str, Study]]:
    s3, s4, s7, s8 = (extraction.get(k) for k in ("S3", "S4", "S7", "S8"))
    ingredient = record["ingredient"]

    form_id = (s7 or {}).get("form_vocab_id") or vocab.unspecified_form_id(ingredient)
    form_match = vocab.form_match(ingredient, form_id, product.get("form_vocab_id"))

    if ignore_population:
        pop_match = "exact"
    else:
        study_pop = (s3 or {}).get("population_axes") or {}
        pop_match = vocab.pop_match(study_pop, product.get("population") or {})

    funding = (s8 or {}).get("funding_class") or "undisclosed"

    dose = study_dose(ingredient, s7)

    def _dose_match_for(outcome_id: str) -> str:
        """
        THIS STUDY's dose against the PRODUCT's dose. Per study, not per product.

        REWRITTEN 2026-08-12, and the old semantics were a real defect. This used
        to compare the PRODUCT's dose to the outcome's DERIVED band, which is the
        same value for every study of an outcome -- so the dose arc (which
        filters `dose_match == "in_band"`) was degenerate: either an exact clone
        of the effect arc (product in band; measured, exercise_endurance's dose
        arc -0.225 @ 1.0 equalled its effect arc to the third decimal) or EMPTY.
        Empty is the invariant-8 violation: a 4.4 g product against a band
        derived at 4.8-5.0 g rendered "not tested", when the truth -- "your dose
        is BELOW the range where trials found benefit" -- is what CLAUDE.md
        calls the most useful warning this axis can give.

        SPEC section 9 defines the arc as "d over trials in YOUR dose band", so
        the comparison is study-vs-product. The product's own interval plays the
        role of the band, reusing `dose_match_for` and its founder-approved
        tiers rather than inventing a new tolerance (invariant 4): a trial
        dosed within [product_low, 2x product_high] is at your dose; below half,
        `below_50`; a 20 g loading trial against a 4.4 g product is `above_200`
        and stays out of the arc.

        The product-vs-derived-band comparison did not disappear -- it moved to
        the `dose.product_match` field on the ECU row, where it is a REPORTED
        WARNING rather than a per-study weight key.

        A study with no extracted dose is "unspecified": the axis is
        UNASSESSABLE for it, which is not the same as matching. (The 2026-08-09
        lesson stands: marking unknowns "in_band" made the dose arc read
        +1.00 @ 100% precisely where we knew least.)
        """
        del outcome_id  # kept for signature stability; the band no longer enters
        if dose.get("dose_low_mg") is None:
            return "unspecified"
        return dosemod.dose_match_for(
            dose["dose_low_mg"], dose.get("dose_high_mg") or dose["dose_low_mg"],
            {"low": product.get("dose_low_mg"), "high": product.get("dose_high_mg")})

    rob = _rob_items(s4, registry)
    n = (s3 or {}).get("n_randomised")
    if n is None and registry:
        n = registry.get("n_enrolled")

    # Predatory is FLAG-ONLY for now (pipeline.predatory.ZERO_WEIGHT=False).
    # venue_ok stays True so score is unchanged; count is reported in the run log.
    venue_ok = True
    if record.get("retracted"):
        pass  # retracted handled separately on Study.retracted

    out = []
    for entry in extraction.get("outcomes", []):
        if entry.get("discarded") or not entry.get("outcome_vocab_id"):
            continue
        claim = entry["claim"]
        # CLAIM-LEVEL CONTRAST (v1.13, 2026-08-11). A trial can hold a genuine
        # placebo AND a claim that compares two ingredient arms: audited case --
        # "coingestion vs creatine, ES -0.21..0.14" was filed as a creatine null
        # while the same abstract shows creatine beating placebo ES 0.37-0.83.
        # The study-level comparator cannot see this; only the claim can say
        # which arms it compares. SYMMETRIC and default-KEEP like invariant 7:
        # only an explicit vs_ingredient_arm is dropped, in either direction.
        if claim.get("contrast") == "vs_ingredient_arm":
            continue
        direction = claim.get("direction") or "unclear"
        magnitude = claim.get("magnitude")
        # SAFETY OUTCOMES INVERT. s_i is signed against the product's CLAIM, and
        # for efficacy a null is disconfirming (invariant 7). For an adverse
        # event the claim is "this is safe", so a trial finding NO difference in
        # side effects CONFIRMS it. Scoring that -0.7 published magnesium's
        # safety data as "does not work" -- the worst score on the board for a
        # reassuring result.
        if vocab.outcome_kind(entry["outcome_vocab_id"]) == "adverse_event":
            if direction == "null_effect":
                direction, magnitude = "benefit", "trivial"   # reassuring, mild
            elif direction == "harm":
                pass                                          # already negative
        eff_s, eff_route = _effect_s(claim, entry["outcome_vocab_id"])
        out.append((entry["outcome_vocab_id"], Study(
            id=record["_canonical"],
            design_rank=record.get("design_rank") or 14,
            n=n,
            effect_s=eff_s,
            effect_route=eff_route,
            rob_items=rob,
            funding=funding,
            venue_ok=venue_ok,
            retracted=bool(record.get("retracted")),
            oa=record.get("oa") or "abstract_only",
            rob_inherited=bool(record.get("rob_inherited")),
            form_match=form_match,
            dose_match=_dose_match_for(entry["outcome_vocab_id"]),
            pop_match=pop_match,
            direction=direction,
            magnitude=magnitude,
        ), dose, bool((claim or {}).get("is_primary_outcome"))))
    return out


def _effect_s(claim: dict, outcome_vocab_id: str) -> tuple[float | None, str]:
    """
    A claim's measured effect as a signed s in [-1, +1], or (None, refusal reason).

    Lives here rather than in `scoring` because it needs the VOCABULARY, and
    `pipeline/scoring.py` has no project imports by design (enforced by
    pipeline.invariants). Everything unit-related is delegated to
    `scoring.standardise_effect`; the only judgement added here is the one that
    needs the outcome.

    ADVERSE-EVENT OUTCOMES ARE REFUSED, and this is not incidental. Just above,
    an adverse-event `null_effect` is deliberately rewritten to
    `benefit`/`trivial`, because for a safety outcome "no difference in side
    effects" CONFIRMS the claim "this is safe". The reported NUMBER on such a
    claim is an adverse-event rate difference, where POSITIVE means MORE harm --
    the opposite orientation from every efficacy outcome. Feeding it through the
    same scale would read "12% more adverse events" as strong positive evidence.
    Measured: the unrestricted null-sign count found exactly this shape
    ("Self-reported adverse events (rate) +12.8", "Hyperhomocysteinemia +40.1").
    """
    if vocab.outcome_kind(outcome_vocab_id) == "adverse_event":
        return None, "adverse_event_inverted_polarity"

    raw = claim.get("effect_size")
    if raw is None:
        return None, "no_effect_size"

    # WHICH WAY IS "GOOD"? Never inferred from the number's arithmetic sign.
    #
    # A design analysis of this corpus found effect_size does NOT follow a single
    # sign convention: some papers report a raw measurement difference, where a
    # faster sprint TIME is a NEGATIVE number and a BETTER result, and others
    # report the same finding already oriented toward the treatment. Guessing is a
    # coin flip, and a wrong sign does not weaken a score -- it inverts it, and no
    # downstream step can detect that. So S5 states the arm outright
    # (`effect_favours`, PROMPT_VERSION v1.16).
    #
    # The orientation is applied to the RAW value, BEFORE standardising. Doing it
    # afterwards would be wrong: the scale is recentred on the meaningful
    # threshold, so a genuine but TRIVIAL benefit standardises to a NEGATIVE s by
    # construction, and taking abs() of that would promote a trivial effect into a
    # strong one -- the opposite of conservative.
    favours = claim.get("effect_favours")
    try:
        magnitude = abs(float(raw))
    except (TypeError, ValueError):
        return None, "unparseable_effect_size"

    # THE NUMBER IS USED ONLY WHEN S5 NAMES THE ARM. No exceptions, no fallback
    # to the reported sign, no fallback to outcome polarity.
    #
    # MEASURED 2026-08-11 and this is why the rule is absolute: the stored
    # effect_size is an ABSOLUTE MAGNITUDE, not a signed contrast. Of 54
    # standardised values only 3 are negative, and **24 of 24 standardised
    # null_effect values are positive** -- under a real treatment-minus-control
    # convention roughly half should be negative, so P(all 24 one sign) is about
    # 1e-7. Papers print |d| alongside "no significant difference" and S5 copies
    # it faithfully.
    #
    # Taking that at face value is not a small error. A null reporting |g| = 0.88
    # would standardise to +1.0 when the truth may be -1.0, so the change intended
    # to REMOVE the vote-counting bias would have introduced a systematic UPWARD
    # one instead -- on exactly the claims where the number is load-bearing.
    #
    # "neither" is refused for the same reason: a magnitude with no arm attached
    # cannot be signed, and a LARGE magnitude that favours neither arm is a
    # self-contradiction rather than a reading. Both fall back to the direction
    # label, which is what the pre-v1.16 corpus therefore does in full -- v8
    # scores that corpus identically to v7 by construction, and only data
    # extracted under the v1.17 contract activates the measured path.
    if favours == "ingredient":
        return scoring.standardise_effect(magnitude, claim.get("effect_unit"))
    if favours == "control":
        return scoring.standardise_effect(-magnitude, claim.get("effect_unit"))

    # SIGN UNKNOWN -- "neither", or absent (pre-v1.17 data, or the model declined).
    # Refusing all of these was the first rule and it was too broad: measured on
    # the v1.17 creatine corpus, "neither" alone was the second-largest refusal
    # (48 of 257 mapped claims, 19%) after "no number at all".
    #
    # A SUB-THRESHOLD MAGNITUDE IS SIGN-PROOF, and that is the whole argument. If
    # the magnitude sits at or below the meaningful threshold, BOTH possible signs
    # give a negative s:
    #
    #     true effect +m  ->  s = (m - MID)/(FULL - MID)   < 0   for m < MID
    #     true effect -m  ->  s = (-m - MID)/(FULL - MID)  < 0   and more negative
    #
    # so the unknown sign cannot change the conclusion, and taking the positive
    # reading is the LESS negative of the two -- the conservative choice. A trial
    # that measured a difference too small to notice is evidence against a
    # MEANINGFUL effect whichever arm it happened to favour, which is exactly what
    # the recentred scale says.
    #
    # Above the threshold the sign decides everything, so those stay refused: of
    # 21 standardisable "neither" claims, 9 are sign-proof and 12 are large enough
    # that "favours neither" is a self-contradiction rather than a reading.
    s, route = scoring.standardise_effect(magnitude, claim.get("effect_unit"))
    if s is not None and s <= 0:
        return s, route
    return None, ("favours_neither_but_above_threshold" if favours == "neither"
                  else "sign_convention_unstated")


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
        primaries = [g for g in group if (g[1] or {}).get("is_primary")]
        if primaries:
            kept.append(min(primaries, key=_rank)); continue
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
    if s3.get("ingredient_isolated") == "no":
        return "no_isolated_ingredient_arm"
    return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_ecus(extractions: list[dict], product: dict, *,
               syntheses: list[dict] | None = None,
               prompt_version: str = "unknown",
               band_version: int = 0,
               exact_form_only: bool = False,
               ignore_population: bool = False,
               exclude_offtarget_population: bool = False,
               searched_outcomes: list[str] | None = None,
               sr_derived: list[dict] | None = None,
               form_top: int | None = None,
               stats: dict | None = None) -> list[dict]:
    """
    extractions -> scored ECU rows, one per outcome.

    `exclude_offtarget_population` is VARIANT B of the 2026-08-08 A/B. When
    True, a study whose pop_match is 'different' does not enter this product's
    ECU at all -- it is a different question, not weaker evidence for the same
    one. Measured motivation: 19% of the creatine corpus was disease trials
    (Huntington's, Parkinson's, HIV) whose nulls counted at FULL weight as
    evidence that creatine does not build muscle in healthy adults.

    It is EXCLUSION, not a discount, because invariant 8 keeps population out
    of w_study. Population is an ECU axis; this routes on it.

    Requires ignore_population=False to do anything -- otherwise every study is
    stamped 'exact' before the check.
    """
    ingredient = product["ingredient"]
    form_id = product["form_vocab_id"]
    pop = product["population"]

    # Eligibility is decided ONCE, before the dose-band pass, so an ineligible
    # trial cannot set the band the eligible ones are then scored against.
    ineligible: dict[str, str] = {}
    for item in extractions:
        why = _ineligible(item["extraction"])
        if why:
            ineligible[id(item)] = why
    eligible = [i for i in extractions if id(i) not in ineligible]

    per_outcome: dict[str, list[dict]] = {}
    for item in eligible:
        rec, ext = item["record"], item["extraction"]
        for outcome_id, study, dose, is_primary in to_studies(
            rec, ext, product, item.get("registry"),
            ignore_population=ignore_population,
        ):
            per_outcome.setdefault(outcome_id, []).append(
                {**dose, "direction": study.direction, "weight": study.weight()})

    bands = {oid: dosemod.effective_range(entries)
             for oid, entries in per_outcome.items()}

    # SR-derived trials are appended AFTER the band pass on purpose: they carry
    # no extractable dose, so letting them into effective_range would add rows
    # with dose None and nothing else. They are scored against the band the
    # readable trials produced.

    buckets: dict[str, list[tuple[Study, dict]]] = {}
    dropped_form = 0
    dropped_population = 0
    kept = 0
    form_mix: dict[str, int] = {}
    for item in eligible:
        rec, ext = item["record"], item["extraction"]
        for outcome_id, study, dose, is_primary in to_studies(
            rec, ext, product, item.get("registry"),
            ignore_population=ignore_population,
            dose_bands=bands,
        ):
            form_mix[study.form_match] = form_mix.get(study.form_match, 0) + 1
            if exact_form_only and study.form_match != "exact":
                dropped_form += 1
                continue
            if exclude_offtarget_population and study.pop_match == "different":
                dropped_population += 1
                continue
            kept += 1
            key = vocab.ecu_key(ingredient, form_id, None if band_version == 0
                                else product.get("dose_band"), outcome_id, pop["id"])
            buckets.setdefault(key, []).append(
                (study, {"outcome_id": outcome_id, "dose": dose,
                         "is_primary": is_primary}))

    n_sr_derived = 0
    for rec in (sr_derived or []):
        for outcome_id, study, dose, is_primary in sr_derived_to_studies(
                rec, product, bands=bands):
            form_mix[study.form_match] = form_mix.get(study.form_match, 0) + 1
            if exact_form_only and study.form_match != "exact":
                dropped_form += 1
                continue
            key = vocab.ecu_key(ingredient, form_id, None if band_version == 0
                                else product.get("dose_band"), outcome_id, pop["id"])
            buckets.setdefault(key, []).append(
                (study, {"outcome_id": outcome_id, "dose": dose,
                         "is_primary": is_primary,
                         "sr_derived": True, "from_reviews": rec.get("from_reviews")}))
            n_sr_derived += 1
    if n_sr_derived:
        print(f"  +{n_sr_derived} claims from trials reachable ONLY through "
              f"review tables (oa=sr_table x0.85, rob_inherited x0.85)")

    if form_mix:
        from pipeline.scoring import FORM_FACTOR
        total = sum(form_mix.values())
        print(f"  form transfer mix ({total} claims -> {form_id}):")
        for tier, count in sorted(form_mix.items(), key=lambda kv: -kv[1]):
            print(f"    {tier:<12} x{FORM_FACTOR.get(tier, 0.30):<5} {count:>4} claims"
                  f"  ({100 * count / total:.0f}%)")
    if ineligible:
        by_reason: dict[str, int] = {}
        for why in ineligible.values():
            by_reason[why] = by_reason.get(why, 0) + 1
        print(f"  eligibility: {len(ineligible)} of {len(extractions)} trials "
              f"cannot vote on whether the ingredient works")
        for why, n in sorted(by_reason.items(), key=lambda kv: -kv[1]):
            print(f"    {why:<28} {n:>3}")
    if stats is not None:
        stats["ineligible_total"] = len(ineligible)
        stats["ineligible_by_reason"] = {
            w: sum(1 for x in ineligible.values() if x == w)
            for w in set(ineligible.values())}
        stats["eligible"] = len(eligible)
    if dropped_population:
        print(f"  population routing: {dropped_population} claims excluded "
              f"(pop_match='different' — a different question, not weaker "
              f"evidence for this one)")
    if exact_form_only or ignore_population:
        print(f"  !! DEMO MODE: exact_form_only={exact_form_only} "
              f"ignore_population={ignore_population} "
              f"kept_claims={kept} dropped_nonexact_form={dropped_form}")
        print("     Demo flags suspend scoring rules. NOT a production claim.")

    # An outcome we SEARCHED FOR but could not score must still appear. The
    # 15:41 run retrieved four magnesium sleep trials, none of which yielded a
    # scorable magnesium-only claim, and sleep simply VANISHED from the table --
    # indistinguishable from an outcome nobody had ever asked about.
    #
    # "We looked and found nothing usable" and "we never looked" are the two
    # states this whole system exists to keep apart. Dropping the row collapses
    # them, at the outcome level, silently.
    scored_ids = {pairs[0][1]["outcome_id"] for pairs in buckets.values()}
    missing = [o for o in (searched_outcomes or []) if o not in scored_ids]

    rows = []
    for oid in missing:
        rows.append({
            "ecu_key": vocab.ecu_key(ingredient, form_id, None, oid, pop["id"]),
            "ingredient": ingredient, "form_vocab_id": form_id,
            "dose_band": None, "band_version": band_version,
            "outcome_vocab_id": oid,
            "population": {"id": pop["id"], **{a: pop[a] for a in vocab.AXES}},
            "score": None, "composite": None,
            "band": "no usable evidence retrieved", "gate_fired": True,
            "components": {}, "arcs": {k: {"verdict": None, "coverage": 0.0}
                                       for k in ("effect", "form", "dose", "evidence")},
            "evidence": {"n_primaries": 0, "n_syntheses": 0, "study_ids": []},
            "form_mix": {}, "flags": ["searched_no_usable_evidence"],
            "provenance": {"prompt_version": prompt_version,
                           "vocab_versions": vocab.versions(),
                           "scorer_version": SCORER_VERSION, "computed_at": _now()},
        })

    collapsed_claims = 0
    for key, pairs in sorted(buckets.items()):
        pairs, n_collapsed = _one_study_one_vote(pairs)
        collapsed_claims += n_collapsed
        studies = [s for s, _ in pairs]
        outcome_id = pairs[0][1]["outcome_id"]
        result = score_ecu(studies, syntheses or [])
        rows.append({
            "ecu_key": key,
            "ingredient": ingredient,
            "form_vocab_id": form_id,
            "dose_band": None if band_version == 0 else product.get("dose_band"),
            "band_version": band_version,
            "outcome_vocab_id": outcome_id,
            "population": {"id": pop["id"], **{a: pv for a, pv in (
                (ax, pop[ax]) for ax in vocab.AXES)}},
            "score": result["score"],
            "band": result["band"],
            "gate_fired": result["gate_fired"],
            "components": {k: result[k] for k in ("d", "c", "H", "E", "E_prime",
                                                  "coverage") if k in result},
            "dose": {
                **{k: v for k, v in bands.get(outcome_id, {}).items()
                   if k in ("low", "high", "n_benefit", "n_null", "null_range",
                            "band_version", "basis")},
                "observed": dosemod.observed_range(per_outcome.get(outcome_id, [])),
                "evidence_with_dose": dosemod.coverage_fraction(
                    bands.get(outcome_id, {}), per_outcome.get(outcome_id, [])),
                # The PRODUCT against the DERIVED band -- the warning axis.
                # Until 2026-08-12 this read the first study's `dose_basis` (how
                # that study's dose was STATED: "unstated", "converted"...), a
                # plain wrong-field bug, which is why reports showed
                # product_match "converted" beside a real band. `below_50` /
                # `low_50_99` here is the "product dosed where trials found
                # nothing" warning CLAUDE.md says this axis exists to give.
                "product_match": dosemod.dose_match_for(
                    product.get("dose_low_mg"), product.get("dose_high_mg"),
                    bands.get(outcome_id, {"low": None})),
            },
            "dose_range_mg": {
                "low": bands.get(outcome_id, {}).get("low"),
                "high": bands.get(outcome_id, {}).get("high"),
                "basis": bands.get(outcome_id, {}).get("basis", "unknown"),
            },
            "evidence": {
                "n_primaries": result["n_primaries"],
                "n_syntheses": result["n_syntheses"],
                "study_ids": [s.id for s in studies],
                # Per-study score attribution, exact rather than heuristic: the
                # points sum to the signed score. Founder ask 2026-08-11.
                "contributions": contributions(studies, result),
            },
            "form_mix": {t: sum(1 for st in studies if st.form_match == t)
                         for t in {st.form_match for st in studies}},
            # Weight-based applicability shares. Counting studies would let ten
            # tiny trials outvote one large one; the arcs must agree with the
            # evidence mass the centre number was built from.
            "applicability": _applicability(pairs),
            # The four arcs and the 0-100 headline. Each arc carries a verdict
            # AND the coverage behind it, so "your form failed" and "nobody
            # tested your form" never collapse into the same picture.
            # form_syntheses stays empty until the SR path runs: a review only
            # counts as FORM evidence once its own direction is extracted, and an
            # unread review must never be credited as non-negative. The ladder
            # therefore caps at rank 4 (0.80) on a primaries-only corpus, which is
            # honest rather than convenient -- see arcs.FORM_LADDER.
            **{k: v for k, v in arcsmod.build(studies, syntheses or [],
                                              form_top=form_top).items()
               if k in ("arcs", "composite")},
            "flags": sorted({f for s in studies for f in _flags(s, rec=None)}),
            "provenance": {
                "prompt_version": prompt_version,
                "vocab_versions": vocab.versions(),
                "scorer_version": SCORER_VERSION,
                "computed_at": _now(),
                "demo_exact_form_only": exact_form_only,
                "demo_ignore_population": ignore_population,
            },
        })
    if collapsed_claims:
        # Say it out loud. This number is how many extra votes one trial would
        # have cast for itself under the pre-2026-08-10 scorer.
        print(f"  one study = one vote: collapsed {collapsed_claims} duplicate "
              f"claim(s) that shared a trial id within an outcome")
    return rows


def _applicability(pairs: list) -> dict:
    """
    How much of this ECU's evidence WEIGHT actually applies to the product.

    `pairs` is [(Study, {"outcome_id", "dose"}), ...] as built in build_ecus.

    Each axis reports two numbers, and the difference between them is the whole
    point:
        match       weight that matches the product on this axis
        assessable  weight where the axis could be judged at all

    0% matched means the evidence disagrees with your bottle. 0% assessable
    means nobody reported it. Those are opposite messages, and the arc draws
    them differently -- unfilled versus hatched.

    Weight-based, not study-count-based: ten tiny trials must not outvote one
    large one, because the arcs have to agree with the evidence mass the centre
    number was built from.
    """
    total = sum(st.weight() for st, _ in pairs) or 1.0

    def share(pred):
        return round(sum(st.weight() for st, meta in pairs if pred(st, meta)) / total, 3)

    return {
        "form": {
            "match": share(lambda st, m: st.form_match == "exact"),
            "assessable": share(lambda st, m: st.form_match != "unspecified"),
        },
        "dose": {
            "match": share(lambda st, m: st.dose_match == "in_band"),
            "assessable": share(lambda st, m: m["dose"]["dose_low_mg"] is not None),
        },
        "population": {
            "match": share(lambda st, m: st.pop_match == "exact"),
            "assessable": share(lambda st, m: st.pop_match != "unknown"),
        },
    }


def _flags(s: Study, rec=None) -> list[str]:
    out = []
    if s.funding == "brand_funded":
        out.append("brand_funded")
    if s.oa == "abstract_only":
        out.append("abstract_only")
    if s.form_match == "unspecified":
        out.append("form_unspecified")
    if s.rob_inherited:
        out.append("rob_inherited")
    return out


