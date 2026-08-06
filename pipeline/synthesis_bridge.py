"""
Wire stored synthesis records + S2 extraction into score_ecu's syntheses list.

NO MODEL LOGIC HERE beyond calling the injectable `call` for S2.
Resolution and quality are deterministic (pipeline.synthesis).

Invariant 6: syntheses never add evidence mass — only a bounded E' lift.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from pipeline import synthesis as syn

MIN_TEXT = 200
DEFAULT_MAX_SRS = 15


def _text_for_syn(record: dict, text_for) -> str:
    if text_for is not None:
        try:
            t = text_for(record) or ""
        except Exception:
            t = ""
    else:
        t = ""
    if len(t.strip()) >= MIN_TEXT:
        return t
    return (record.get("abstract") or record.get("title") or "").strip()


def extract_s2_batch(
    syn_records: list[dict],
    *,
    call,
    text_for=None,
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
        text = _text_for_syn(rec, text_for)
        if len(text) < MIN_TEXT:
            return {"record": rec, "s2": None, "meta": {"error": "no text"}}
        result, meta = call("S2", {
            "title": rec.get("title"),
            "text": text,
        })
        return {"record": rec, "s2": result, "meta": meta}

    out = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futs = {pool.submit(one, r): r for r in targets}
        for fut in as_completed(futs):
            out.append(fut.result())

    ok = sum(1 for x in out if x["s2"])
    print(f"  SR bridge: S2 ok={ok}/{len(out)}")
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
        if packed.get("resolved"):
            n_resolved += 1
            res = packed.get("_resolution") or {}
            print(
                f"    resolved SR {item['record'].get('canonical_id', '?')[:40]}: "
                f"{res.get('n_resolved')}/{res.get('n_listed')} "
                f"q_s={packed['q_s']:.2f}"
            )
    print(f"  SR bridge: {n_resolved}/{len(scoring)} syntheses resolved for multiplier")
    return scoring


def build_syntheses_for_scoring(
    store,
    *,
    call,
    text_for=None,
    max_srs: int = DEFAULT_MAX_SRS,
    max_workers: int = 4,
) -> list[dict]:
    """
    Full path: store syntheses -> S2 -> resolve -> score_ecu-ready list.
    """
    syn_rows = store.studies(syntheses=True)
    all_rows = store.studies(syntheses=None)  # may not support None
    try:
        all_rows = store.studies(syntheses=True) + store.studies(syntheses=False)
    except Exception:
        all_rows = syn_rows

    batch = extract_s2_batch(
        syn_rows, call=call, text_for=text_for,
        max_srs=max_srs, max_workers=max_workers,
    )
    return to_score_inputs(batch, all_rows)
