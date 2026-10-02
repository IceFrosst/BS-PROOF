"""
Corpus stage: make sure the store holds this ingredient's RCTs, then apply the
OA ordering and the relevance gate. NO MODEL. Moved out of run_pipeline.py on
2026-10-03 (helpers verbatim).
"""
from __future__ import annotations

import os

from pipeline import predatory as pred
from pipeline.relevance import relevance_check
from pipeline.storage import DEFAULT_DB

WIRING_DB = DEFAULT_DB.parent / "wiring_demo.sqlite"
RETRIEVE_MAX_PRIMARIES = int(os.environ.get("SP_RETRIEVE_MAX_PRIMARIES", "600"))
RETRIEVE_MAX_SYNTHESES = int(os.environ.get("SP_RETRIEVE_MAX_SYNTHESES", "400"))

_OA_RANK = {
    "full_text": 0, "fulltext": 0, "green_oa": 1, "hybrid": 2,
    "bronze": 3, "abstract_only": 4, "closed": 5, "unknown": 6,
}


def _grok_db(ingredient: str, scope: str):
    suffix = "" if scope == "broad" else f"_{scope[:4]}"
    return DEFAULT_DB.parent / f"grok_{ingredient}{suffix}.sqlite"


def _sections(record: dict) -> dict:
    """
    Parsed sections for per-agent routing. fetch_xml is disk-cached, so this
    costs nothing beyond the fetch best_text already did.
    """
    from sources import fulltext as ft
    try:
        return ft.sections(ft.fetch_xml(record.get("pmcid"))) or {}
    except Exception:
        return {}


def _best_text(record: dict) -> str:
    from sources import fulltext as ft
    try:
        text, _tier = ft.best_text(record)
    except Exception:
        text = record.get("abstract") or record.get("title") or ""
    return text or (record.get("title") or "")


def _prioritize_primaries(primaries: list[dict], *,
                          full_text_only: bool = False) -> list[dict]:
    def key(s: dict):
        oa = (s.get("oa") or "abstract_only").lower()
        return (_OA_RANK.get(oa, 6), -(s.get("year") or 0))
    def readable(s: dict) -> bool:
        if _OA_RANK.get((s.get("oa") or "").lower(), 9) <= 1:
            return True
        return bool(s.get("oa_location") or s.get("full_text_urls"))

    ordered = sorted(primaries, key=key)
    if full_text_only:
        kept = [s for s in ordered if readable(s)]
        via_oa = sum(1 for s in kept
                     if _OA_RANK.get((s.get("oa") or "").lower(), 9) > 1)
        print(f"  FULL-TEXT-ONLY: {len(kept)}/{len(ordered)} RCTs kept"
              + (f" ({via_oa} via green OA, not PMC)" if via_oa else ""))
        ordered = kept
    else:
        n_ft = sum(1 for s in ordered
                   if _OA_RANK.get((s.get("oa") or "").lower(), 9) <= 1)
        print(f"  priority: full-text/green first ({n_ft}/{len(ordered)})")
    return ordered


def stratify_targets(primaries: list[dict], outcomes: list[str],
                     limit: int) -> list[dict]:
    """
    Round-robin the --limit budget across the outcomes each record was
    RETRIEVED FOR, preserving priority order within each outcome.

    Why (measured 2026-08-11): plain `primaries[:limit]` takes by full-text
    priority, so outcomes whose studies sit in the tail starve -- endurance
    scored on n=4 and energy on n=1 while Europe PMC held 122 and 200 hits.
    The per-outcome quota machinery upstream existed precisely to prevent
    this and its work was being discarded at selection.

    Records with no retrieved_for tag (older stores) keep priority order and
    fill remaining budget, so the function degrades to [:limit] gracefully.
    """
    pools: dict[str, list[dict]] = {o: [] for o in outcomes}
    rest: list[dict] = []
    for r in primaries:
        tags = set((r.get("retrieved_for") or "").split(","))
        hit = [o for o in outcomes if o in tags]
        if hit:
            for o in hit:
                pools[o].append(r)
        else:
            rest.append(r)
    chosen, seen = [], set()
    idx = {o: 0 for o in outcomes}
    while len(chosen) < limit:
        progressed = False
        for o in outcomes:
            pool = pools[o]
            while idx[o] < len(pool):
                r = pool[idx[o]]; idx[o] += 1
                cid = r.get("canonical_id") or r.get("_canonical") or id(r)
                if cid not in seen:
                    seen.add(cid); chosen.append(r); progressed = True
                    break
            if len(chosen) >= limit:
                break
        if not progressed:
            break
    for r in rest:
        if len(chosen) >= limit:
            break
        cid = r.get("canonical_id") or r.get("_canonical") or id(r)
        if cid not in seen:
            seen.add(cid); chosen.append(r)
    return chosen


def store_path(opts):
    """Each backend writes its own store (invariant 9: never blend backends)."""
    if opts.wiring:
        return WIRING_DB
    if opts.grok:
        return _grok_db(opts.ingredient, opts.scope)
    return DEFAULT_DB


def load_corpus(store, opts, db, outcome_allowlist, run_context) -> tuple[list[dict], int]:
    """Retrieve if needed, then return (gated RCT primaries, n_available)."""
    # Imported here, not at module scope: retrieval needs httpx, and this
    # module must stay importable on the bare interpreter (the selftest).
    from pipeline.retrieve import retrieve
    ingredient, scope, limit = opts.ingredient, opts.scope, opts.limit
    full_text_only = opts.full_text_only
    counts = store.counts()
    # MEASURED 2026-08-10, and this one condition was costing ~5x the corpus.
    #
    # Two defects, both in this expression:
    #
    # 1. `grok and ...` meant that on the PRODUCTION CLAUDE PATH retrieval
    #    fired only when the store was COMPLETELY EMPTY. So the corpus never
    #    grew and never refreshed. Second-order effect, which is the one that
    #    actually hurt: rows written before `resultType=core` was added left
    #    `abstract` NULL on 100% of 1560 RCT rows, and since storage upserts
    #    with COALESCE it can only be backfilled by a fresh retrieval that
    #    never happened. A NULL abstract silently turns relevance_check into
    #    title-only (see the vitamin_d note in pipeline/relevance.py, which is
    #    the same failure) and leaves abstract-only studies with no text, which
    #    is where "skipped: no text" on 23 of 69 studies came from.
    #
    # 2. `counts["studies"]` is the WHOLE store across every ingredient ever
    #    run, so it answered a different question than the one that matters.
    #    The 2076-row store held 1560 RCT-rank primaries of which only 69 were
    #    creatine -- the rest were ashwagandha and magnesium from earlier runs
    #    -- and 392 creatine RCTs existed upstream at intervention scope. The
    #    run scored 69 and reported n=1..7 per outcome, which is why every
    #    confidence arc sat at c=0.02..0.22 and every score rounded to ~0.
    #
    # So: count what is RELEVANT TO THIS INGREDIENT, and do it for every
    # backend. Re-retrieval when already full is cheap -- sources/http.py
    # caches every response to disk, so a repeat pass is offline and fast.
    target = (RETRIEVE_MAX_PRIMARIES if limit is None
              else min(limit + 50, RETRIEVE_MAX_PRIMARIES))
    _n_relevant = sum(1 for s in store.studies(syntheses=False)
                      if s.get("design_rank") == 4
                      and relevance_check(s, ingredient)[0])
    need_retrieve = _n_relevant < target
    if need_retrieve:
        print(f"corpus: {_n_relevant} RCT-rank {ingredient} studies in store, "
              f"target {target} -- expanding")
    if need_retrieve:
        print(f"retrieving / expanding corpus in {db.name} "
              f"(scope={scope}, max primaries={RETRIEVE_MAX_PRIMARIES})...")
        retrieve(ingredient, store,
                 max_syntheses=RETRIEVE_MAX_SYNTHESES,
                 max_primaries=RETRIEVE_MAX_PRIMARIES,
                 outcome_ids=outcome_allowlist,
                 scope=scope)

    all_rows = store.studies(syntheses=False)
    syn_rows = store.studies(syntheses=True)

    pred_summary = pred.flag_records(all_rows)
    pred.flag_records(syn_rows)
    print(pred.format_summary(pred_summary))
    run_context["predatory"] = pred_summary

    # How many studies were AVAILABLE to score, before --limit. Used for the
    # sample-size note at the end: a capped run is a SAMPLE, and its score
    # does not estimate the full-corpus score (pipeline/preview.py).
    n_available = 0
    primaries = _prioritize_primaries(
        [s for s in all_rows if s.get("design_rank") == 4],
        full_text_only=full_text_only,
    )

    relevant = []
    rejected = 0
    for s in primaries:
        ok, reason = relevance_check(s, ingredient)
        if ok:
            relevant.append(s)
        else:
            rejected += 1
    print(f"\nstore: {len(all_rows)} primaries, {len(syn_rows)} syntheses; "
          f"{len(primaries)} RCT-rank after OA filters; "
          f"{len(relevant)} after relevance gate "
          f"(dropped {rejected} noise)")
    primaries = relevant
    # Everything that SURVIVED the gates, before --limit. This is the
    # denominator for the sample-size note; counting pre-gate records would
    # project against studies we were never going to score.
    n_available = len(primaries)
    return primaries, n_available
