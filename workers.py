"""
Per-study workers. This file MAY call a model; `pipeline/` may not.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import claude_adapter
from pipeline import vocab
from pipeline.relevance import relevance_check

PER_STUDY = ("S3", "S4", "S5", "S7", "S8")
MIN_TEXT_CHARS = 200


def _payload(agent: str, record: dict, text: str, registry: dict | None) -> dict:
    base = {"title": record.get("title"), "text": text}
    if agent == "S3":
        return {**base, "population_vocabulary": vocab.load("population")["axes"]}
    if agent == "S4":
        return {**base,
                "registry_item3_prospective": (registry or {}).get("item3_prospective"),
                "registry_primary_outcomes": (registry or {}).get(
                    "registered_primary_outcomes"),
                "registry_attrition": {
                    "n_started": (registry or {}).get("n_started"),
                    "n_completed": (registry or {}).get("n_completed"),
                    "dropout_rate": (registry or {}).get("dropout_rate")}}
    if agent == "S5":
        return base
    if agent == "S7":
        ingredient = record["ingredient"]
        return {**base, "ingredient": ingredient,
                "form_vocabulary": vocab.forms_for(ingredient),
                "unspecified_form_id": vocab.unspecified_form_id(ingredient)}
    if agent == "S8":
        return base
    raise KeyError(agent)


def extract_study(record: dict, text: str, registry: dict | None = None, *,
                  call=None, max_workers: int = 5) -> dict:
    call = call or claude_adapter.call

    # Cheap gate BEFORE any model call: is this actually an oral/supplement
    # intervention for our ingredient, or IV/surgery/noise?
    ingredient = record.get("ingredient") or ""
    ok, reason = relevance_check(record, ingredient)
    if not ok:
        return {"_skipped": f"relevance: {reason}",
                "_meta": {"relevance": reason},
                "outcomes": []}

    if len((text or "").strip()) < MIN_TEXT_CHARS:
        return {"_skipped": "no text",
                "_meta": {"chars": len((text or "").strip())},
                "outcomes": []}

    out: dict = {}

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {agent: pool.submit(call, agent, _payload(agent, record, text, registry))
                   for agent in PER_STUDY}
        for agent, fut in futures.items():
            result, meta = fut.result()
            out[agent] = result
            out.setdefault("_meta", {})[agent] = meta
            if result is None:
                err = str(meta.get("error") or "").lower()
                if any(k in err for k in ("session limit", "usage limit", "rate limit")):
                    out["_quota_exhausted"] = meta.get("error")
                out.setdefault("_failed", []).append(
                    {"agent": agent, "error": meta.get("error")})

    out["outcomes"] = []
    claims = ((out.get("S5") or {}).get("claims")) or []
    for claim in claims:
        mapped, _ = call("S6", {"outcome_raw": claim.get("outcome_raw"),
                                "measure": claim.get("measure"),
                                "vocabulary": vocab.load("outcome")["outcomes"]})
        vocab_id = (mapped or {}).get("outcome_vocab_id")
        out["outcomes"].append({
            "claim": claim,
            "outcome_vocab_id": vocab_id,
            "discarded": vocab_id is None,
            "rationale": (mapped or {}).get("rationale"),
        })
    return out


def extract_corpus(records: list[dict], text_for, registry_for=None, *,
                   call=None, max_studies_in_flight: int = 4) -> list[dict]:
    """
    Fan out across studies. Prints live progress so you can judge concurrency.
    """
    n = len(records)
    results_by_id: dict[int, dict] = {}
    t0 = time.time()
    done = 0
    skipped = 0
    failed_studies = 0
    relevance_skip = 0

    print(f"  progress: 0/{n} studies  (in_flight≤{max_studies_in_flight})")

    with ThreadPoolExecutor(max_workers=max_studies_in_flight) as pool:
        future_map = {
            pool.submit(
                extract_study, r, text_for(r),
                registry_for(r) if registry_for else None, call=call,
            ): i
            for i, r in enumerate(records)
        }
        for fut in as_completed(future_map):
            i = future_map[fut]
            r = records[i]
            try:
                extraction = fut.result()
            except Exception as e:
                extraction = {"_failed": [{"agent": "*", "error": str(e)}], "outcomes": []}
            results_by_id[i] = {"record": r, "extraction": extraction}
            done += 1
            if extraction.get("_skipped"):
                skipped += 1
                if str(extraction.get("_skipped", "")).startswith("relevance:"):
                    relevance_skip += 1
            if extraction.get("_failed"):
                failed_studies += 1
            elapsed = time.time() - t0
            rate = done / elapsed if elapsed > 0 else 0
            eta = (n - done) / rate if rate > 0 else 0
            print(
                f"  progress: {done}/{n}  "
                f"ok={done - skipped - failed_studies} skip={skipped} "
                f"(relevance={relevance_skip}) fail_partial={failed_studies}  "
                f"{elapsed:.0f}s elapsed  ~{eta:.0f}s left  "
                f"({rate * 60:.1f} studies/min)"
            )

    if relevance_skip:
        print(f"  relevance gate skipped {relevance_skip}/{n} "
              f"(not oral/supplement intervention — no agent spend)")
    return [results_by_id[i] for i in range(n)]
