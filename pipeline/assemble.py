"""
Worker JSON -> Study objects -> scored ECU rows. NO MODEL MAY ENTER THIS FILE.

Demo flags (for founder demos only — not production claims):
  exact_form_only=True  drop studies that are not form_match == "exact"
  ignore_population=True  treat every study as pop_match == "exact"

Predatory venues: flagged on the record for reporting; do NOT zero weight yet
(founder policy 2026-08-07). See pipeline/predatory.ZERO_WEIGHT.
"""
from __future__ import annotations
from datetime import datetime, timezone

from pipeline import vocab
from pipeline import arcs as arcsmod
from pipeline import dose as dosemod
from pipeline.scoring import Study, score_ecu

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
    rng = vocab.elemental_dose_range_mg(ingredient, form_id, s7.get("compound_dose_mg"))
    return {"dose_low_mg": rng["low"], "dose_high_mg": rng["high"],
            "dose_basis": rng["basis"]}


def to_studies(record: dict, extraction: dict, product: dict,
               registry: dict | None = None, *,
               ignore_population: bool = False,
               dose_band: dict | None = None) -> list[tuple[str, Study]]:
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
    if dose_band and dose_band.get("low") is not None:
        dose_match = dosemod.dose_match_for(
            product.get("dose_low_mg"), product.get("dose_high_mg"), dose_band)
    else:
        # No band could be derived. The axis is UNASSESSABLE, which is not the
        # same as matching. Marking it "in_band" made the dose arc read
        # +1.00 @ 100% precisely when no dose had been extracted at all --
        # most confident exactly where we knew least.
        dose_match = "unspecified"

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
        out.append((entry["outcome_vocab_id"], Study(
            id=record["_canonical"],
            design_rank=record.get("design_rank") or 14,
            n=n,
            rob_items=rob,
            funding=funding,
            venue_ok=venue_ok,
            retracted=bool(record.get("retracted")),
            oa=record.get("oa") or "abstract_only",
            rob_inherited=bool(record.get("rob_inherited")),
            form_match=form_match,
            dose_match=dose_match,
            pop_match=pop_match,
            direction=direction,
            magnitude=magnitude,
        ), dose))
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_ecus(extractions: list[dict], product: dict, *,
               syntheses: list[dict] | None = None,
               prompt_version: str = "unknown",
               band_version: int = 0,
               exact_form_only: bool = False,
               ignore_population: bool = False,
               searched_outcomes: list[str] | None = None) -> list[dict]:
    ingredient = product["ingredient"]
    form_id = product["form_vocab_id"]
    pop = product["population"]

    per_outcome: dict[str, list[dict]] = {}
    for item in extractions:
        rec, ext = item["record"], item["extraction"]
        for outcome_id, study, dose in to_studies(
            rec, ext, product, item.get("registry"),
            ignore_population=ignore_population,
        ):
            per_outcome.setdefault(outcome_id, []).append(
                {**dose, "direction": study.direction, "weight": study.weight()})

    bands = {oid: dosemod.effective_range(entries)
             for oid, entries in per_outcome.items()}

    buckets: dict[str, list[tuple[Study, dict]]] = {}
    dropped_form = 0
    kept = 0
    form_mix: dict[str, int] = {}
    for item in extractions:
        rec, ext = item["record"], item["extraction"]
        for outcome_id, study, dose in to_studies(
            rec, ext, product, item.get("registry"),
            ignore_population=ignore_population,
            dose_band=bands.get(outcome_id),
        ):
            form_mix[study.form_match] = form_mix.get(study.form_match, 0) + 1
            if exact_form_only and study.form_match != "exact":
                dropped_form += 1
                continue
            kept += 1
            key = vocab.ecu_key(ingredient, form_id, None if band_version == 0
                                else product.get("dose_band"), outcome_id, pop["id"])
            buckets.setdefault(key, []).append(
                (study, {"outcome_id": outcome_id, "dose": dose}))

    if form_mix:
        from pipeline.scoring import FORM_FACTOR
        total = sum(form_mix.values())
        print(f"  form transfer mix ({total} claims -> {form_id}):")
        for tier, count in sorted(form_mix.items(), key=lambda kv: -kv[1]):
            print(f"    {tier:<12} x{FORM_FACTOR.get(tier, 0.30):<5} {count:>4} claims"
                  f"  ({100 * count / total:.0f}%)")
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
                "product_match": next((p["dose"] for _, p in pairs), {}).get("dose_basis"),
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
            **{k: v for k, v in arcsmod.build(studies, syntheses or []).items()
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


def evidence_rows(ecu: dict, extractions: list[dict]) -> list[dict]:
    by_id = {i["record"]["_canonical"]: i for i in extractions}
    rows = []
    for sid in ecu["evidence"]["study_ids"]:
        if sid not in by_id:
            continue
        rows.append({"canonical_id": sid, "role": "primary"})
    return rows
