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
        # The band is per OUTCOME, so it can only be looked up once we know
        # which outcome this row is for.
        band = (bands or {}).get(oid)
        if band and band.get("low") is not None:
            dose_match = dosemod.dose_match_for(
                product.get("dose_low_mg"), product.get("dose_high_mg"), band)
        else:
            dose_match = "unspecified"
        claim = entry.get("claim") or {}
        direction = claim.get("direction")
        magnitude = claim.get("magnitude")
        if vocab.outcome_kind(oid) == "adverse_event" and direction == "null_effect":
            direction, magnitude = "benefit", "trivial"
        out.append((oid, Study(
            id=rec["_canonical"],
            design_rank=rec.get("design_rank") or 14,
            n=rec.get("n"),
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
        The band is derived PER OUTCOME, so the lookup has to happen per
        outcome. It used to be computed once per record from a single band
        passed by the caller -- as `dose_band=bands.get(outcome_id)`, reading a
        loop variable of the generator being called, before it was bound.

        Two failures, one line. With no outcomes in the first pass the name was
        never bound at all and build_ecus raised UnboundLocalError; with any
        outcomes it silently reused the LAST outcome's band for every study, so
        a creatine strength band could decide whether a cognition trial was
        in-band. Fixed 2026-08-09.
        """
        band = (dose_bands or {}).get(outcome_id)
        if band and band.get("low") is not None:
            return dosemod.dose_match_for(
                product.get("dose_low_mg"), product.get("dose_high_mg"), band)
        # No band could be derived. The axis is UNASSESSABLE, which is not the
        # same as matching. Marking it "in_band" made the dose arc read
        # +1.00 @ 100% precisely when no dose had been extracted at all --
        # most confident exactly where we knew least.
        return "unspecified"

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
            dose_match=_dose_match_for(entry["outcome_vocab_id"]),
            pop_match=pop_match,
            direction=direction,
            magnitude=magnitude,
        ), dose, bool((claim or {}).get("is_primary_outcome"))))
    return out


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
    2. No primary declared (71 of 158 extractions) -> MAJORITY direction, ties
       broken conservatively. Not "any benefit wins": measure twenty endpoints
       at p<0.05 and one turns up by chance, so letting a lone positive override
       nine nulls is the multiple-comparisons trap this pipeline exists to
       resist. Not "lowest wins" either, because that penalises a trial for
       measuring more things.

    Nulls are still never silently dropped -- a null that is the primary, or the
    majority, still wins. Invariant 7 is intact; what changed is that a null is
    no longer allowed to overrule the trial's own designed answer.

    SR-derived rows carry is_primary=False (a review table designates no
    endpoint) and are collapsed on the same key: a trial reachable both directly
    and through a review is still one trial (invariant 6).
    """
    _CONS = {"harm": 0, "null_effect": 1, "unclear": 1, "benefit": 2}

    def _rank(pair):
        return _CONS.get(pair[0].direction, 1)

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
        winner = min(winners, key=lambda d: _CONS.get(d, 1))
        kept.append(next(g for g in group if g[0].direction == winner))
    return kept, n_collapsed


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
               sr_derived: list[dict] | None = None) -> list[dict]:
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

    per_outcome: dict[str, list[dict]] = {}
    for item in extractions:
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
    for item in extractions:
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


