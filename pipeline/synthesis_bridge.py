"""
Wire stored synthesis records + S2 extraction into score_ecu's syntheses list.

NO MODEL LOGIC HERE beyond calling the injectable `call` for S2.
Resolution and quality are deterministic (pipeline.synthesis).

Invariant 6: syntheses never add evidence mass — only a bounded E' lift.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from pipeline import synthesis as syn

# Founder 2026-08-07: retrieve as many reviews as we can. The cap is now a
# CEILING on a loop that stops itself (see marginal-yield stopping below), not a
# budget someone picked. 15 was a budget.
DEFAULT_MAX_SRS = 60
STOP_MIN_NEW = 2                 # new trials a chunk must name to count as productive
STOP_AFTER_BARREN_CHUNKS = 2     # consecutive unproductive chunks before stopping

# The prompt budget moved to pipeline.synthesis.s2_payload, which builds the
# payload and is therefore the only place that can trim it honestly.


def rank_syntheses(rows: list[dict]) -> list[dict]:
    """
    Best reviews first, so a cap of 12 spends its calls on 12 USABLE reviews.

    `store.studies()` has no ORDER BY, so it returns insertion order and the cap
    was an arbitrary slice. Measured on a 462-synthesis store: the first 12 rows
    contained 7 with NO PMC id -- unreadable, so s2_payload returns no tables and
    the call cannot produce anything -- plus 3 never classified at all. More than
    half the budget was spent before the first usable review.

    Order:
      1. readable first          no full text -> no table -> nothing to extract
      2. design rank             umbrella (1) > SR+MA (2) > SR (3)
      3. newest                  a 2024 review covers the 2019 review's trials
    """
    def key(s: dict):
        readable = 0 if (s.get("pmcid") or "").strip() else 1
        rank = s.get("design_rank") or 9        # unclassified sorts after real ranks
        return (readable, rank, -(s.get("year") or 0))
    return sorted(rows, key=key)


def _xml_for(record: dict, xml_for) -> str | None:
    """
    JATS for one synthesis. A failure returns None, and the caller records
    "could not read" -- never "this review lists no studies".
    """
    from sources import fulltext as ft
    if xml_for is not None:
        try:
            return xml_for(record)
        except Exception:
            return None
    pmcid = record.get("pmcid")
    if not pmcid:
        return None
    try:
        return ft.fetch_xml(pmcid)
    except Exception:
        return None


def extract_s2_batch(
    syn_records: list[dict],
    *,
    call,
    xml_for=None,
    max_srs: int = DEFAULT_MAX_SRS,
    max_workers: int = 4,
) -> list[dict]:
    """
    Run S2 on up to max_srs synthesis records.
    Returns list of {"record", "s2", "meta"} (s2 may be None).
    """
    ranked = rank_syntheses(syn_records)
    targets = ranked[:max_srs]
    if not targets:
        print("  SR bridge: no synthesis records in store")
        return []

    readable = sum(1 for t in targets if (t.get("pmcid") or "").strip())
    print(f"  SR bridge: extracting S2 for up to {len(targets)} of "
          f"{len(syn_records)} syntheses (cap={max_srs}, chunk={max_workers}); "
          f"{readable}/{len(targets)} have full text")

    def one(rec: dict):
        xml = _xml_for(rec, xml_for)
        payload = syn.s2_payload(rec, xml)
        # No tables means we could not READ the review, not that it contains no
        # trials. Calling S2 anyway spends a model call to be told nothing.
        if not payload["tables"]:
            return {"record": rec, "s2": None,
                    "meta": {"error": "no tables in full text"}}
        result, meta = call("S2", payload)
        return {"record": rec, "s2": result, "meta": meta}

    # MARGINAL-YIELD STOPPING. "As many reviews as possible" is the right goal
    # and a bad loop: 30 meta-analyses commonly re-analyse the same 9 RCTs, so
    # after the first few the marginal review names trials we already have and
    # costs a full-text table read to tell us so.
    #
    # Reviews are processed in RANKED chunks and the run stops when a whole
    # chunk contributes fewer than STOP_MIN_NEW previously-unseen trial labels.
    # Stopping on NEW TRIALS rather than on a fixed count means a rich corpus
    # keeps going and a repetitive one stops early, without either being a
    # number someone had to guess.
    out: list[dict] = []
    seen_labels: set[str] = set()
    barren = 0
    for start in range(0, len(targets), max_workers):
        chunk = targets[start:start + max_workers]
        with ThreadPoolExecutor(max_workers=len(chunk)) as pool:
            results = [f.result() for f in
                       as_completed({pool.submit(one, r) for r in chunk})]
        out.extend(results)
        new = set()
        for r in results:
            for row in ((r.get("s2") or {}).get("included_studies") or []):
                key = (row.get("nct") or row.get("doi") or row.get("pmid")
                       or row.get("label") or "")
                if key and key not in seen_labels:
                    new.add(key)
        seen_labels |= new
        print(f"    chunk {start // max_workers + 1}: "
              f"+{len(new)} trials not seen in an earlier review "
              f"({len(seen_labels)} distinct so far)")
        barren = barren + 1 if len(new) < STOP_MIN_NEW else 0
        if barren >= STOP_AFTER_BARREN_CHUNKS:
            print(f"    stopping: {barren} consecutive chunks added "
                  f"<{STOP_MIN_NEW} new trials — the remaining "
                  f"{len(targets) - len(out)} reviews are re-analysing the "
                  f"same corpus")
            break

    ok = sum(1 for x in out if x["s2"])
    no_tables = sum(1 for x in out
                    if not x["s2"] and "no tables" in str(x["meta"].get("error")))
    print(f"  SR bridge: S2 ok={ok}/{len(out)} reviews, "
          f"{len(seen_labels)} distinct trials named"
          + (f"  ({no_tables} unreadable — no tables in full text)" if no_tables else ""))
    return out


def build_sr_derived(s2_batch: list[dict], primary_and_syn_rows: list[dict], *,
                     call, outcome_allowlist: list[str] | None = None,
                     max_workers: int = 6) -> tuple[list[dict], dict]:
    """
    Trials reachable ONLY through review tables, ready for assemble.

    Invariant 6 as amended 2026-08-08: the review adds nothing, the trials it
    describes add themselves, once each, at the sr_table tier.

    Returns (records, stats). Every record carries provenance -- which reviews
    described it -- so a score built partly on second-hand facts can be audited
    rather than taken on trust.
    """
    from concurrent.futures import ThreadPoolExecutor
    from pipeline import vocab

    known = syn.known_index(primary_and_syn_rows)
    held = {r.get("canonical_id") for r in primary_and_syn_rows
            if not r.get("is_synthesis")}

    packed = []
    for item in s2_batch:
        s2 = item.get("s2")
        if not s2:
            continue
        rows = s2.get("included_studies") or []
        by_row = {i: cid for i, cid in
                  ((i, syn._resolve_one(row, known)) for i, row in enumerate(rows))
                  if cid}
        packed.append({"review_id": item["record"].get("canonical_id") or "?",
                       "s2": s2, "included_ids_by_row": by_row})

    merged = syn.merge_inherited(packed)
    directions = syn.results_by_trial(packed)
    records, stats = syn.derived_studies(merged, held_ids=held,
                                         directions=directions)

    # S6 maps the REVIEW's outcome wording into our vocabulary, exactly as it
    # does for a paper we read ourselves. Same agent, same vocabulary, same
    # refusal: an unmappable outcome is discarded, never nudged into a
    # neighbouring id.
    vocabulary = vocab.load("outcome")["outcomes"]
    if outcome_allowlist:
        from pipeline.showcase import restrict_outcome_vocab
        vocabulary = restrict_outcome_vocab(vocabulary, outcome_allowlist)

    jobs = [(rec, raw, res) for rec in records
            for raw, res in (rec.get("results") or {}).items()]
    mapped = []
    if jobs:
        with ThreadPoolExecutor(max_workers=min(len(jobs), max_workers)) as pool:
            mapped = list(pool.map(
                lambda j: (j, call("S6", {"outcome_raw": j[1], "measure": None,
                                          "vocabulary": vocabulary})), jobs))

    stats["outcome_unmapped"] = 0
    for (rec, _raw, res), (result, _meta) in mapped:
        vid = (result or {}).get("outcome_vocab_id")
        if outcome_allowlist and vid and vid not in outcome_allowlist:
            vid = None
        if not vid:
            stats["outcome_unmapped"] += 1
            continue
        rec.setdefault("outcomes", []).append({
            "outcome_vocab_id": vid, "discarded": False,
            "claim": {"direction": res.get("direction"),
                      "magnitude": res.get("magnitude")},
        })

    records = [r for r in records if r.get("outcomes")]
    stats["scorable"] = len(records)
    print(f"  SR-derived trials: {stats['emitted']} passed the refusal rules "
          f"of {stats['candidates']} candidates "
          f"(held={stats['already_held']} no_design={stats['no_design']} "
          f"no_direction={stats['no_direction']} "
          f"conflict={stats['direction_conflict']}); "
          f"{stats['scorable']} mapped to an outcome")
    return records, stats


def inherited_facts(s2_batch: list[dict], primary_and_syn_rows: list[dict]) -> dict:
    """
    {canonical_id: merged facts} across every review in the batch.

    Separate from to_score_inputs on purpose: that function answers "how much
    should the multiplier lift E", this one answers "what do we now know about
    trials we cannot read". The second is the reason to retrieve SRs at scale;
    the first is capped at 1.30 no matter how many we read.
    """
    known = syn.known_index(primary_and_syn_rows)
    packed = []
    for item in s2_batch:
        s2 = item.get("s2")
        if not s2:
            continue
        rows = s2.get("included_studies") or []
        by_row = {}
        for i, row in enumerate(rows):
            cid = syn._resolve_one(row, known)
            if cid:
                by_row[i] = cid
        packed.append({"review_id": item["record"].get("canonical_id") or "?",
                       "s2": s2, "included_ids_by_row": by_row})
    return syn.merge_inherited(packed)


def to_score_inputs(
    s2_batch: list[dict],
    primary_and_syn_rows: list[dict],
) -> list[dict]:
    """
    Deterministic: S2 JSON + known index -> score_ecu syntheses list.
    """
    known = syn.known_index(primary_and_syn_rows)
    scoring = []
    n_resolved = 0
    for item in s2_batch:
        s2 = item.get("s2")
        if not s2:
            continue
        packed = syn.to_scoring_input(s2, known)
        scoring.append(packed)
        res = packed.get("_resolution") or {}
        n_listed = res.get("n_listed") or 0
        n_res = res.get("n_resolved") or 0
        rev = packed.get("_review") or {}
        if packed.get("resolved"):
            n_resolved += 1
            # Overlap is printed as OVERLAP, which is what it is. It no longer
            # decides q_s -- the review checklist does -- so the two are shown
            # side by side rather than one standing in for the other.
            print(
                f"    SR {item['record'].get('canonical_id', '?')[:40]}: "
                f"{n_listed} included, {n_res} in our corpus  "
                f"q_s={packed['q_s']:.2f} "
                f"({rev.get('band')}, {rev.get('hits')}/{rev.get('answered')} "
                f"methods items)"
            )
        else:
            # Why it produced nothing — without this, "0 usable" is a black box.
            sample = (res.get("unresolved_labels") or [])[:3]
            print(
                f"    SR {item['record'].get('canonical_id', '?')[:40]}: "
                f"no included-studies list extracted; "
                f"sample unresolved={sample}"
            )
    print(f"  SR bridge: {n_resolved}/{len(scoring)} syntheses usable")
    return scoring


def build_syntheses_for_scoring(
    store,
    *,
    call,
    xml_for=None,
    max_srs: int = DEFAULT_MAX_SRS,
    max_workers: int = 4,
) -> list[dict]:
    """
    Full path: store syntheses -> S2 -> resolve -> score_ecu-ready list.
    """
    syn_rows = store.studies(syntheses=True)
    try:
        all_rows = store.studies(syntheses=True) + store.studies(syntheses=False)
    except Exception:
        all_rows = syn_rows

    batch = extract_s2_batch(
        syn_rows, call=call, xml_for=xml_for,
        max_srs=max_srs, max_workers=max_workers,
    )
    return to_score_inputs(batch, all_rows), batch, all_rows
