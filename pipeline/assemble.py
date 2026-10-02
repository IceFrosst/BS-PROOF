"""
Worker JSON -> Study objects -> scored ECU rows. NO MODEL MAY ENTER THIS FILE.

Demo flags (for founder demos only — not production claims):
  exact_form_only=True  drop studies that are not form_match == "exact"
  ignore_population=True  treat every study as pop_match == "exact"

Predatory venues: flagged on the record for reporting; do NOT zero weight yet
(founder policy 2026-08-07). See pipeline/predatory.ZERO_WEIGHT.
"""
from __future__ import annotations
import math
import re
from datetime import datetime, timezone

from pipeline import vocab
from pipeline import arcs as arcsmod
from pipeline import dose as dosemod
from pipeline.scoring import Study, score_ecu, contributions
# Split out 2026-10-03 (moved verbatim); re-exported so callers and the
# selftest keep using `assemble.<name>`.
from pipeline.claim_arms import (  # noqa: F401
    _arm_norm, _claim_equivalence_valid, _claim_firewall,
    _claim_has_target_exposure, _normalise_cointerventions, _resolve_claim_arms,
)
from pipeline.effect_s import _effect_s  # noqa: F401
from pipeline.eligibility import (  # noqa: F401
    _ineligible, _matched_factorial_background, _one_study_one_vote,
)

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


def _s7_for_claim(s7: dict | None, claim: dict, s3: dict | None,
                   *, modern: bool = False) -> dict | None:
    """Select S7 facts only from S5/S3's administered target arm.

    Arm-keyed S7 facts must be joined by an evidenced label, never by array
    position.  In particular, a one-row S7 response may be the control arm, so
    its length does not make it safe to project onto the ingredient claim.
    Legacy top-level S7 envelopes remain usable unchanged.
    """
    if not isinstance(s7, dict):
        return None
    arm_rows = s7.get("arms")
    if not isinstance(arm_rows, list) or not arm_rows:
        # Top-level S7 facts are an explicitly legacy contract only. A modern
        # envelope with omitted arm rows must not silently fall back to the
        # historical positional/top-level dose.
        return None if modern else s7
    if modern and any(not isinstance(row, dict) or
                      any(key not in row for key in (
                          "label", "form_vocab_id", "form_raw", "compound_dose_mg",
                          "elemental_dose_mg", "dose_per_kg_mg",
                          "mean_body_mass_kg", "dose_basis",
                          "dose_frequency_per_day", "evidence_span"))
                      for row in arm_rows):
        return None
    s3_arms = s3.get("arms") if isinstance(s3, dict) else None
    if not isinstance(s3_arms, list) or not s3_arms:
        return None

    def _administered_target(a: dict) -> bool:
        # An arm-keyed S7 row is usable only when S3 explicitly evidenced that
        # the corresponding arm was administered. A null/omitted role is not a
        # safe fallback: it could be a biomarker or measurement row carrying a
        # tempting dose.
        return (a.get("role") == "administered" and
                a.get("target_ingredient_presence") == "yes")

    targets = [a for a in s3_arms if isinstance(a, dict) and _administered_target(a)
               and _arm_norm(a.get("label"))]
    wanted = claim.get("ingredient_arm")
    if isinstance(wanted, str) and wanted.strip():
        target_labels = [a for a in targets
                         if _arm_norm(a.get("label")) == _arm_norm(wanted)]
        if len(target_labels) != 1:
            return None
        target_label = _arm_norm(target_labels[0].get("label"))
    else:
        # The firewall may resolve an unnamed claim only when there is exactly
        # one target/control pair. Requiring one target here avoids borrowing a
        # dose from an arbitrary active arm or from a placebo-only S7 row.
        if len(targets) != 1:
            return None
        target_label = _arm_norm(targets[0].get("label"))

    matches = [a for a in arm_rows if isinstance(a, dict)
               and _arm_norm(a.get("label")) == target_label]
    return matches[0] if len(matches) == 1 else None


def _pos_finite(x) -> float | None:
    """A strictly positive, finite number, or None. Anything else is refused.

    Exists because an adversarial pass found three ways a bad envelope value
    became a confident dose: dose_per_kg_mg=-300 x mean_body_mass_kg=-70
    multiplied to +21000 (two negatives cancel, and the schema had no minimum);
    Infinity survives json.loads on the non-schema-validated fallback paths in
    claude_adapter._extract_payload; and a STRING elemental dose crashed
    to_studies with a TypeError inside dose_match_for -- study doses never
    entered comparisons before dose_match went per-study, so the type was
    never load-bearing until 2026-08-12. Zero is refused too: "0 mg" is not a
    dose, and treating it as one made dose_match read below_50.
    """
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v <= 0:
        return None
    return v


def study_dose(ingredient: str, s7: dict | None) -> dict:
    if not s7:
        return {"dose_low_mg": None, "dose_high_mg": None, "dose_basis": "unstated"}
    form_id = s7.get("form_vocab_id")
    declared_basis = s7.get("dose_basis") or "unstated"

    def _compound(value) -> dict:
        amount = _pos_finite(value)
        rng = vocab.elemental_dose_range_mg(ingredient, form_id, amount)
        return {"dose_low_mg": rng["low"], "dose_high_mg": rng["high"],
                "dose_basis": rng["basis"]}

    elemental = _pos_finite(s7.get("elemental_dose_mg"))
    compound = _pos_finite(s7.get("compound_dose_mg"))

    # A known-form extraction sometimes copies compound_dose_mg into the
    # elemental field. Equality is not evidence that the amount is elemental:
    # when a known conversion exists, prefer the explicitly convertible
    # compound interpretation.  Unknown/bounded forms cannot trigger this
    # rule, because there is no exact factor with which to identify a copy.
    if elemental is not None and compound is not None and math.isclose(
            elemental, compound, rel_tol=1e-9, abs_tol=1e-9):
        known = vocab.elemental_dose_range_mg(ingredient, form_id, compound)
        if known.get("basis") == "converted":
            return _compound(compound)

    # Explicit compound-only reports (including a copied elemental field) are
    # converted only here. Per-kg compound values are converted after their
    # stated body mass is applied.
    if declared_basis == "compound_only":
        if compound is not None and elemental is not None and not math.isclose(
                compound, elemental, rel_tol=1e-9, abs_tol=1e-9):
            return {"dose_low_mg": None, "dose_high_mg": None,
                    "dose_basis": "contradictory_dose_fields"}
        if compound is not None or elemental is not None:
            return _compound(compound if compound is not None else elemental)

    # An explicit elemental amount remains authoritative over a redundant
    # per-kg field. (The copied-field case was handled above.)
    if elemental is not None and declared_basis != "compound_only":
        # When both fields are present, verify that they describe the same
        # basis. A mismatch is safer as a refusal than an invented preference.
        if compound is not None:
            converted = vocab.elemental_dose_range_mg(ingredient, form_id, compound)
            if (converted["low"] is None or converted["high"] is None
                    or not converted["low"] <= elemental <= converted["high"]):
                return {"dose_low_mg": None, "dose_high_mg": None,
                        "dose_basis": "contradictory_dose_fields"}
        return {"dose_low_mg": elemental, "dose_high_mg": elemental,
                "dose_basis": declared_basis}
    # PER-KG DOSING (v1.19): arithmetic uses only the paper's stated mass.
    # Critically, a missing elemental_dose_mg does not block this branch: S7's
    # per-kg value is elemental unless the declaration explicitly says compound.
    per_kg = _pos_finite(s7.get("dose_per_kg_mg"))
    mass = _pos_finite(s7.get("mean_body_mass_kg"))
    if per_kg is not None and mass is not None:
        daily = per_kg * mass
        if declared_basis == "compound_only":
            return _compound(daily)
        return {"dose_low_mg": daily, "dose_high_mg": daily,
                "dose_basis": "per_kg_x_stated_mass"}

    # Legacy/unstated envelopes with an explicit elemental value are already on
    # the active-moiety axis; retain it rather than treating it as compound.
    if elemental is not None:
        return {"dose_low_mg": elemental, "dose_high_mg": elemental,
                "dose_basis": "elemental_stated"}
    return _compound(compound)


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
        # dose_factor stays None for the same reason: no per-trial dose exists.
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


SUPPORTED_EXTRACTION_CONTRACTS = frozenset({
    "v1.24", "legacy-v1.23", "legacy-v1.22", "legacy-v1.21",
})


def to_studies(record: dict, extraction: dict, product: dict,
               registry: dict | None = None, *,
               ignore_population: bool = False,
               dose_bands: dict[str, dict] | None = None) -> list[tuple[str, Study]]:
    s3, s4, s7, s8 = (extraction.get(k) for k in ("S3", "S4", "S7", "S8"))
    s5 = extraction.get("S5") if isinstance(extraction.get("S5"), dict) else {}
    ingredient = record["ingredient"]
    contract_parts = (s3, s5, s7)
    contract_values = [part.get("extraction_version")
                       if isinstance(part, dict) else None
                       for part in contract_parts]
    # S3/S5/S7 are one joined contract. Every component must state the same
    # version: a missing value is just as unsafe as a mixed value because it
    # lets malformed v1.24 output impersonate a legacy cache row.
    if (any(value is None for value in contract_values)
            or any(value not in SUPPORTED_EXTRACTION_CONTRACTS
                   for value in contract_values)):
        return []
    contract_versions = set(contract_values)
    if len(contract_versions) != 1:
        return []
    contract_version = contract_values[0]
    modern_contract = contract_version == "v1.24"

    form_id = (s7 or {}).get("form_vocab_id") or vocab.unspecified_form_id(ingredient)
    form_match = vocab.form_match(ingredient, form_id, product.get("form_vocab_id"))

    if ignore_population:
        pop_match = "exact"
    else:
        study_pop = (s3 or {}).get("population_axes") or {}
        pop_match = vocab.pop_match(study_pop, product.get("population") or {})

    funding = (s8 or {}).get("funding_class") or "undisclosed"

    dose = study_dose(ingredient, s7)

    def _dose_match_for(outcome_id: str, selected_dose: dict | None = None) -> str:
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
        selected_dose = selected_dose or dose
        if selected_dose.get("dose_low_mg") is None:
            return "unspecified"
        return dosemod.dose_match_for(
            selected_dose["dose_low_mg"], selected_dose.get("dose_high_mg") or selected_dose["dose_low_mg"],
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
        # Universal arm/test firewall. It is deliberately before any numeric
        # routing: a beautifully reported number from a baseline, biomarker,
        # combination, or omnibus test is still the wrong counterfactual.
        # Counterfactual arm rules scope to efficacy. Safety harm signals are
        # valid in observational/no-arm reports and must not disappear merely
        # because an efficacy comparison cannot be established.
        adverse_event = (vocab.outcome_kind(entry["outcome_vocab_id"]) ==
                         "adverse_event")
        safety_signal = adverse_event and claim.get("direction") == "harm"
        # Only an adverse-event HARM may use the observational safety route.
        # Efficacy harms still need a valid counterfactual, and a reassuring
        # safety null needs a control. Modern safety harms must at minimum prove
        # exposure to the target ingredient; otherwise a biomarker/tracer paper
        # could manufacture a safety signal without administering the product.
        safety_bypass = safety_signal and _claim_has_target_exposure(claim, s3)
        firewall_reason = (None if safety_bypass else
                           _claim_firewall(claim, s3, ingredient,
                                           contract_version=contract_version))
        if firewall_reason:
            continue
        claim_s7 = _s7_for_claim(s7, claim, s3, modern=modern_contract)
        if (not safety_bypass and isinstance(s7, dict)
                and isinstance(s7.get("arms"), list) and claim_s7 is None):
            # Arm-keyed S7 cannot be safely projected onto an efficacy claim;
            # safety direction remains eligible even when form/dose is absent.
            continue
        # Modern arm-keyed S7 has no top-level fallback. A safety claim may
        # remain eligible without a dose, but must not inherit a control or
        # ambiguous top-level form and thereby claim exact-form applicability.
        if claim_s7 is not None:
            claim_form_id = claim_s7.get("form_vocab_id") or vocab.unspecified_form_id(ingredient)
        elif modern_contract:
            claim_form_id = vocab.unspecified_form_id(ingredient)
        else:
            claim_form_id = form_id
        claim_form_match = vocab.form_match(ingredient, claim_form_id,
                                            product.get("form_vocab_id"))
        claim_dose = study_dose(ingredient, claim_s7)
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
            form_match=claim_form_match,
            dose_match=_dose_match_for(entry["outcome_vocab_id"], claim_dose),
            dose_factor=dosemod.dose_factor_for(
                claim_dose.get("dose_low_mg"), claim_dose.get("dose_high_mg"),
                {"low": product.get("dose_low_mg"),
                 "high": product.get("dose_high_mg")}),
            pop_match=pop_match,
            direction=direction,
            magnitude=magnitude,
            outcome_role=claim.get("outcome_role"),
        ), claim_dose, bool((claim or {}).get("is_primary_outcome"))))
    return out


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

    # Build and route the same buckets that will be scored first.  Dose bands
    # and dose counts must describe this final evidence universe, not discarded
    # populations or duplicate claims.
    buckets: dict[str, list[tuple[Study, dict]]] = {}
    bands: dict[str, dict] = {}
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
                         "is_primary": is_primary,
                         # Carry the role from the exact claim selected by
                         # to_studies; outcome ids are not unique within a study.
                         "outcome_role": study.outcome_role}))

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

    # Collapse before deriving every dose-facing statistic.  This is the same
    # one-study-one-vote evidence passed to score_ecu below.
    collapsed_claims = 0
    for key, pairs in list(buckets.items()):
        collapsed, n_collapsed = _one_study_one_vote(pairs)
        buckets[key] = collapsed
        collapsed_claims += n_collapsed
    per_outcome: dict[str, list[dict]] = {}
    for pairs in buckets.values():
        for study, meta in pairs:
            oid = meta["outcome_id"]
            per_outcome.setdefault(oid, []).append(
                {**meta["dose"], "direction": study.direction,
                 "weight": study.weight(), "s": study.s_value(),
                 "study_id": study.id})
    bands = {oid: dosemod.effective_range(entries)
             for oid, entries in per_outcome.items()}

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

    for key, pairs in sorted(buckets.items()):
        studies = [s for s, _ in pairs]
        outcome_id = pairs[0][1]["outcome_id"]
        result = score_ecu(studies, syntheses or [])
        # The four arcs and the 0-100 headline. Each arc carries a verdict
        # AND the coverage behind it, so "your form failed" and "nobody
        # tested your form" never collapse into the same picture.
        # form_syntheses stays empty until the SR path runs: a review only
        # counts as FORM evidence once its own direction is extracted, and an
        # unread review must never be credited as non-negative. The ladder
        # therefore caps at rank 4 (0.80) on a primaries-only corpus, which is
        # honest rather than convenient -- see arcs.FORM_LADDER.
        built = arcsmod.build(
            studies, syntheses or [], form_top=form_top,
            # The composite's dose term (v12): the product's closeness to
            # the range where positive effects occurred. Same number the
            # row reports as dose.product_factor.
            dose_closeness=dosemod.dose_factor_for(
                product.get("dose_low_mg"), product.get("dose_high_mg"),
                bands.get(outcome_id, {"low": None})))
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
            "components": {
                **{k: result[k] for k in ("d", "c", "H", "E", "E_prime",
                                          "coverage") if k in result},
                # The v14 applicability term A -- mean(form strength, dose
                # closeness) -- the ONLY input to the headline that is not
                # already in the signed score. Travels with the row so the
                # composite can be re-derived from stored fields and so a label
                # can say "not tested for your product" instead of blaming the
                # evidence. None when the ECU gated.
                "applicability": built.get("applicability"),
            },
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
                # The continuous version of the line above (SCORING_MODEL v10):
                # a 4 g product against a 5-10 g band reads 0.64 instead of the
                # tier's 0.45-with-a-cliff-at-5000. The tier string stays for
                # display; this is the number.
                "product_factor": dosemod.dose_factor_for(
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
            "arcs": built["arcs"],
            "composite": built["composite"],
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


