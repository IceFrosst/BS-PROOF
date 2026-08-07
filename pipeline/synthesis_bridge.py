"""
Wire stored synthesis records + S2 extraction into score_ecu's syntheses list.

NO MODEL LOGIC HERE beyond calling the injectable `call` for S2.
Resolution and quality are deterministic (pipeline.synthesis).

Invariant 6: syntheses never add evidence mass — only a bounded E' lift.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from pipeline import synthesis as syn

DEFAULT_MAX_SRS = 15
# The prompt budget moved to pipeline.synthesis.s2_payload, which builds the
# payload and is therefore the only place that can trim it honestly.


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
    targets = syn_records[:max_srs]
    if not targets:
        print("  SR bridge: no synthesis records in store")
        return []

    print(f"  SR bridge: extracting S2 for {len(targets)} syntheses "
          f"(cap={max_srs}, workers≤{max_workers})...")

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

    out = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futs = {pool.submit(one, r): r for r in targets}
        for fut in as_completed(futs):
            out.append(fut.result())

    ok = sum(1 for x in out if x["s2"])
    no_tables = sum(1 for x in out
                    if not x["s2"] and "no tables" in str(x["meta"].get("error")))
    print(f"  SR bridge: S2 ok={ok}/{len(out)}"
          + (f"  ({no_tables} unreadable — no tables in full text)" if no_tables else ""))
    return out


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
    return to_score_inputs(batch, all_rows)
