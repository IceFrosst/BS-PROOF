"""
Worker JSON -> Study objects -> scored ECU rows. NO MODEL MAY ENTER THIS FILE.

This is the deterministic reducer. Subagents produce observations; every
judgement made about those observations -- how they weigh, how they transfer,
what they sum to -- happens here, in arithmetic, so the same corpus produces the
same score tomorrow.

The riskiest thing this file does is decide what a MISSING extraction means.
The rule throughout: a null propagates as a null and takes the pessimistic
factor. It is never replaced by a plausible value.
"""
from __future__ import annotations
from datetime import datetime, timezone

from pipeline import vocab
from pipeline.scoring import Study, score_ecu

SCORER_VERSION = "v1"

# While band_version is 0 there is no dose axis: the ECU key carries "unbanded",
# so every study for an ingredient/form is in the same (single) dose bucket by
# definition and there is no mismatch to penalise. This is NOT a free pass --
# it is the honest consequence of the dose axis not being live yet. When bands
# are derived, this becomes a real comparison and scores will move.
UNBANDED_DOSE_MATCH = "in_band"


def _rob_items(s4: dict | None, registry: dict | None) -> dict:
    """
    Six binary items. S4 may return null for any of them, and null must survive:
    scoring.rob_band counts only items that are 0 or 1, so an unverifiable item
    lowers confidence rather than silently scoring as a failure.

    Item 3 is overridden by the registry when the registry knows, because a date
    comparison has a right answer and a model's opinion of it does not improve on
    that.
    """
    items = {}
    for i in range(1, 7):
        key = {1: "item1_randomisation_method", 2: "item2_double_blind_placebo",
               3: "item3_prospective_registration", 4: "item4_outcome_matches_registry",
               5: "item5_attrition_ok", 6: "item6_itt"}[i]
        items[f"i{i}"] = (s4 or {}).get(key)

    if registry and registry.get("item3_prospective") is not None:
        items["i3"] = registry["item3_prospective"]

    # Attrition is structured data when the registry has it; RoB item 5's own
    # threshold (<20%) is applied here rather than trusted to a model.
    if (s4 or {}).get("item5_attrition_ok") is None and registry:
        rate = registry.get("dropout_rate")
        if rate is not None:
            items["i5"] = 1 if rate < 0.20 else 0
    return items


def to_studies(record: dict, extraction: dict, product: dict,
               registry: dict | None = None) -> list[tuple[str, Study]]:
    """
    One paper -> (outcome_vocab_id, Study) per surviving claim.

    A study that reports six outcomes produces six Studies, five of which may be
    null_effect. Dropping the nulls would bias every score upward, which is why
    S5 is instructed to emit them and why they are carried here unchanged.

    Claims whose outcome S6 could not map are DISCARDED, not bucketed into a
    nearest match.
    """
    s3, s4, s7, s8 = (extraction.get(k) for k in ("S3", "S4", "S7", "S8"))
    ingredient = record["ingredient"]

    form_id = (s7 or {}).get("form_vocab_id") or vocab.unspecified_form_id(ingredient)
    form_match = vocab.form_match(ingredient, form_id, product.get("form_vocab_id"))

    study_pop = (s3 or {}).get("population_axes") or {}
    pop_match = vocab.pop_match(study_pop, product.get("population") or {})

    # funding: S8 null -> "undisclosed", which is the vocabulary's own value for
    # "not stated", not a default we invented. FUNDING_FACTOR penalises it (0.80).
    funding = (s8 or {}).get("funding_class") or "undisclosed"

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
            dose_match=UNBANDED_DOSE_MATCH,
            pop_match=pop_match,
            direction=claim.get("direction") or "unclear",
            magnitude=claim.get("magnitude"),
        )))
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_ecus(extractions: list[dict], product: dict, *,
               syntheses: list[dict] | None = None,
               prompt_version: str = "unknown",
               band_version: int = 0) -> list[dict]:
    """
    Group every surviving claim by ECU key, score each group, and emit rows
    matching schemas/ecu.json.

    `extractions`: [{"record": {...}, "extraction": {...}, "registry": {...}}]

    Syntheses are passed to the scorer as a bounded multiplier and NEVER as
    evidence mass (invariant 6). They are not grouped here at all.
    """
    ingredient = product["ingredient"]
    form_id = product["form_vocab_id"]
    pop = product["population"]

    buckets: dict[str, list[tuple[Study, dict]]] = {}
    for item in extractions:
        rec, ext = item["record"], item["extraction"]
        for outcome_id, study in to_studies(rec, ext, product, item.get("registry")):
            key = vocab.ecu_key(ingredient, form_id, None if band_version == 0
                                else product.get("dose_band"), outcome_id, pop["id"])
            buckets.setdefault(key, []).append((study, {"outcome_id": outcome_id}))

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
            "evidence": {
                "n_primaries": result["n_primaries"],
                "n_syntheses": result["n_syntheses"],
                "study_ids": [s.id for s in studies],
            },
            "flags": sorted({f for s in studies for f in _flags(s)}),
            "provenance": {
                "prompt_version": prompt_version,
                "vocab_versions": vocab.versions(),
                "scorer_version": SCORER_VERSION,
                "computed_at": _now(),
            },
        })
    return rows


def _flags(s: Study) -> list[str]:
    """Shown to the user, NEVER scored. These already moved w_study; surfacing
    them again as a number would double-count."""
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
    """The ecu_evidence audit trail: which study, at what weight and discount."""
    by_id = {i["record"]["_canonical"]: i for i in extractions}
    rows = []
    for sid in ecu["evidence"]["study_ids"]:
        if sid not in by_id:
            continue
        rows.append({"canonical_id": sid, "role": "primary"})
    return rows
