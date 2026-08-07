"""
Per-study workers. This file MAY call a model; `pipeline/` may not.
"""
from __future__ import annotations

import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import claude_adapter
from pipeline import vocab
from pipeline.relevance import relevance_check

PER_STUDY = ("S3", "S4", "S5", "S7", "S8")
MIN_TEXT_CHARS = 200

# Total prompt budget per call: system + schema + payload.
#
# Measured 2026-08-07 against the Grok CLI. Failures track TOTAL PROMPT SIZE:
#     S8 12.8k -> 0 fails      S4 13.4k -> 0 fails
#     S5 14.8k -> 0 fails      S7 15.5k -> 1 fail (timeout)
#     S3 18.1k -> 12 fails, all "the schema and study input look truncated"
# Wall ~16k. Default tightened 14k -> 12k after magnesium still showed 12 S3 fails.
PROMPT_BUDGET_CHARS = int(os.environ.get("SP_PROMPT_BUDGET", "12000"))

# S3 is the longest system prompt + schema among per-study agents. Give it a
# stricter text headroom so full-text papers do not re-hit the wall.
AGENT_BUDGET_TRIM = {
    "S3": 1500,   # extra reserved vs other agents
}


def _fit_text(agent: str, text: str, fixed_chars: int) -> str:
    """
    Trim the study text so system + schema + payload stays under budget.

    Trimming the TEXT is the right lever: the schema and the instructions are
    load-bearing, and a truncated schema produces a malformed extraction rather
    than a shorter one. Methods and results lead the text, so the head is the
    part worth keeping.
    """
    extra = AGENT_BUDGET_TRIM.get(agent, 0)
    room = PROMPT_BUDGET_CHARS - fixed_chars - extra
    if room <= 0 or len(text) <= room:
        return text
    return text[:room]


def _payload(agent: str, record: dict, text: str, registry: dict | None) -> dict:
    from claude_adapter import SCHEMAS, _system_prompt
    _, _schema_f, _prompt_f = claude_adapter.AGENTS[agent]
    # +400 for JSON scaffolding and the fixed keys around the text.
    _fixed = (len(_system_prompt(_prompt_f))
              + len((SCHEMAS / _schema_f).read_text()) + 400)
    base = {"title": record.get("title"), "text": _fit_text(agent, text, _fixed)}
    if agent == "S3":
        # Population vocabulary is NOT sent. S3's prompt lists the four axes and
        # allowed values; shipping the JSON duplicated ~1.9k and pushed S3 over
        # the CLI input wall (magnesium: 12/54 S3 fails).
        return base
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

    # S6 runs after S5 because it consumes S5's raw outcome strings, but the
    # claims are independent of each other -- fan them out.
    claims = ((out.get("S5") or {}).get("claims")) or []
    out["outcomes"] = []
    if claims:
        vocabulary = vocab.load("outcome")["outcomes"]
        with ThreadPoolExecutor(max_workers=min(len(claims), 6)) as pool:
            mapped = list(pool.map(
                lambda cl: (cl, call("S6", {"outcome_raw": cl.get("outcome_raw"),
                                            "measure": cl.get("measure"),
                                            "vocabulary": vocabulary})),
                claims))
        for claim, (result, _meta) in mapped:
            vid = (result or {}).get("outcome_vocab_id")
            out["outcomes"].append({
                "claim": claim,
                "outcome_vocab_id": vid,
                "discarded": vid is None,
                "rationale": (result or {}).get("rationale"),
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
    print(f"  prompt budget: {PROMPT_BUDGET_CHARS} chars (S3 extra trim "
          f"{AGENT_BUDGET_TRIM.get('S3', 0)})")

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
