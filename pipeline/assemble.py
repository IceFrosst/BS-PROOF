"""
Worker JSON -> Study objects -> scored ECU rows. NO MODEL MAY ENTER THIS FILE.

Demo flags (for founder demos only — not production claims):
  exact_form_only=True  drop studies that are not form_match == "exact"
  ignore_population=True  treat every study as pop_match == "exact"
"""
from __future__ import annotations
from datetime import datetime, timezone

from pipeline import vocab
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
    """
    S7's reading -> elemental/active mg, as an interval. The MODEL never does
    this arithmetic (invariant 1); vocab converts from recorded molar masses and
    REFUSES on hydrate-ambiguous salts, returning bounds instead of a point.
    """
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

    # Dose. Until a band exists this stays UNBANDED_DOSE_MATCH -- there is no
    # dose axis to mismatch against. Once a band is derived from the trials, the
    # product's dose is judged against it.
    dose = study_dose(ingredient, s7)
    if dose_band and dose_band.get("low") is not None:
        dose_match = dosemod.dose_match_for(
            product.get("dose_low_mg"), product.get("dose_high_mg"), dose_band)
    else:
        dose_match = UNBANDED_DOSE_MATCH

    rob = _rob_items(s4, registry)
    n = (s3 or {}).get("n_randomised")
    if n is None and registry:
        n = registry.get("n_enrolled")

    out = []
    for entry in extraction.get("outcomes", []):
        if entry.get("discarded") or not entry.get("outcome_vocab_id"):
            continue
        claim = entry["claim"]
        out.append((entry["outcome_vocab_id"], Study(
            id=record["_canonical"],
            design_rank=record.get("design_rank") or 14,
            n=n,
            rob_items=rob,
            funding=funding,
            venue_ok=not record.get("predatory_venue", False),
            retracted=bool(record.get("retracted")),
            oa=record.get("oa") or "abstract_only",
            rob_inherited=bool(record.get("rob_inherited")),
            form_match=form_match,
            dose_match=dose_match,
            pop_match=pop_match,
            direction=claim.get("direction") or "unclear",
            magnitude=claim.get("magnitude"),
        ), dose))
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_ecus(extractions: list[dict], product: dict, *,
               syntheses: list[dict] | None = None,
               prompt_version: str = "unknown",
               band_version: int = 0,
               exact_form_only: bool = False,
               ignore_population: bool = False) -> list[dict]:
    """
    exact_form_only: keep only studies with form_match == "exact" (demo).
    ignore_population: force pop_match == "exact" (demo — no pop transfer penalty).
    """
    ingredient = product["ingredient"]
    form_id = product["form_vocab_id"]
    pop = product["population"]

    # PASS 1 -- collect doses and directions per outcome so the effective band
    # can be DERIVED from the trials before anything is scored against it.
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

    # PASS 2 -- score, now judging each product dose against its outcome's band.
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

    # Always show which forms contributed and at what discount. The product's
    # whole claim is that evidence TRANSFERS between forms at a stated price --
    # so a run must make it visible that e.g. a citrate trial counted toward a
    # glycinate product at 0.50, rather than leaving the reader to assume only
    # exact-form studies were used.
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

    rows = []
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
            "population": {"id": pop["id"], **{a: pop[a] for a in vocab.AXES}},
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
            "flags": sorted({f for s in studies for f in _flags(s)}),
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


def _flags(s: Study) -> list[str]:
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
