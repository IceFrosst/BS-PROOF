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

# Batched outcome mapping (S6B): one call per STUDY instead of one per claim.
#
# A/B/C MEASURED 2026-08-09 on the same 7 creatine RCTs, each arm run cold with
# its own LLM cache:
#
#   A  per-claim S6, opus-5     91 calls  326 095 in-tok  $1.856  0 fail   78s
#   B  batched  S6B, opus-5     42 calls  204 644 in-tok  $1.182  0 fail  112s
#   C  per-claim S6, sonnet-5   86 calls  312 446 in-tok  $1.351  1 fail  146s
#
# B: -54% calls, -37% input tokens, -36% cost. S6 itself went 56 calls ->
# 7 and 144 393 -> 22 942 input tokens (-84%).
#
# AND THE RESULTS ARE THE SAME, which is the only reason this is on. All three
# arms produced the SAME five non-null vocabulary mappings, and no two arms ever
# disagreed on a non-null mapping. C is not adopted: it saves cost but almost no
# tokens, and it was the only arm with a failure.
#
# Sample is 7 studies. SP_S6_BATCH=0 returns to per-claim if a larger corpus
# ever shows the batch drifting.
S6_BATCH = os.environ.get("SP_S6_BATCH", "1") == "1"

# S3 is the longest system prompt + schema among per-study agents. Give it a
# stricter text headroom so full-text papers do not re-hit the wall.
AGENT_BUDGET_TRIM = {
    "S3": 1500,   # extra reserved vs other agents
}


ELISION = "\n\n[... middle of paper elided to fit the input budget ...]\n\n"


import re as _re

# One pattern, two shapes: absolute daily doses ("5 g/day", "3500 mg per day")
# and per-kg dosing ("0.3 g/kg/day", "0.1 g kg-1"). Deliberately broad -- a false
# positive costs a wasted sentence in the payload, a false negative loses the
# study's dose for the run.
_DOSE_PAT = _re.compile(
    r"\b\d+(\.\d+)?\s*(g|mg|grams?)\s*(/|per\s+|·)?\s*(kg|d\b|day|body)", _re.I)


def _dose_snippets(text: str, cap: int = 5, width: int = 220) -> list[str]:
    """
    Sentences around every dose mention in the FULL text, deduplicated.

    Exists because the shared slice truncates: measured 2026-08-12, 12 of 76
    dose-less S7 extractions had the dose in the full text but not in what S7
    received. This is retrieval, not judgement -- a regex either matched or it
    did not, and S7 still decides what the numbers mean.
    """
    if not text:
        return []
    out, seen = [], set()
    for m in _DOSE_PAT.finditer(text):
        start = max(0, m.start() - width // 2)
        snip = " ".join(text[start:m.end() + width // 2].split())
        key = snip[:80]
        if key in seen:
            continue
        seen.add(key)
        out.append(snip)
        if len(out) >= cap:
            break
    return out


def _fit_text(agent: str, text: str, fixed_chars: int) -> str:
    """
    Trim the study text so system + schema + payload stays under budget.

    Trimming the TEXT is the right lever: the schema and the instructions are
    load-bearing, and a truncated schema produces a malformed extraction rather
    than a shorter one.

    TRIM FROM THE MIDDLE, NOT THE TAIL. `fulltext.best_text` returns
    METHODS ++ RESULTS in that order, so a head-only cut deletes precisely the
    section that carries the finding. Measured 2026-08-09 on a 13 924-char
    creatine RCT: S5 received 5 871 chars, stopped mid-Methods describing
    dynamometer placement, and never saw the word "Results" or a single p-value
    that WAS present in the full text. It returned {"claims": []} -- the correct
    answer to what it had been shown -- and with no claims there are no
    outcomes, no ECU rows and no score. Every run reported "no scored outcomes
    (every ECU gated, or extraction failed)" and the cause was upstream of the
    model entirely.

    Half head, half tail: S3 needs the methods (n, population, design), S5 needs
    the results. Neither is served by keeping only one end.
    """
    extra = AGENT_BUDGET_TRIM.get(agent, 0)
    room = PROMPT_BUDGET_CHARS - fixed_chars - extra
    if room <= 0 or len(text) <= room:
        return text
    room -= len(ELISION)
    if room <= 0:
        return text[:max(0, PROMPT_BUDGET_CHARS - fixed_chars - extra)]
    head = room // 2
    return text[:head] + ELISION + text[-(room - head):]


# Which sections each agent actually needs. Sending one combined blob to all
# five per-study agents cost ~10 000 input tokens per study in duplication --
# the same ~7 900 chars, five times -- and, worse, gave S8 text that could not
# contain the answer: best_text returns METHODS ++ RESULTS and funding is stated
# in neither. Measured 2026-08-09: 0/7 of the texts S8 received held any of
# fund|grant|sponsor|conflict of interest|acknowledg|disclosure, so every study
# defaulted to funding='undisclosed' (0.80) while S8 burned the largest output
# token count of any agent.
# ONLY S8. Routing all five was measured and it BACKFIRED -- see below.
AGENT_SECTIONS = {
    "S8": ("funding",),                 # the ONLY section that states it
}

# WHY NOT S3/S4/S5/S7, measured 2026-08-09 on the same 7 studies:
#
#   arm D  shared text, no routing    199 323 in-tok  $1.067   81s
#   arm G  all five routed            178 801 in-tok  $1.350  117s
#
# 10% FEWER tokens and 27% MORE money. The token count is not the price. When
# every per-study agent gets the SAME text, the first call writes the prompt
# cache and the other four read it:
#
#   arm D   cache_write  10 001   cache_read  181 327
#   arm G   cache_write  66 638   cache_read   96 161
#
# Giving each agent a different slice means each one writes its own cache entry,
# and a cache WRITE costs roughly 12x a cache READ per token. S3/S4/S5/S7 all
# read the methods-and-results blob happily, so slicing them buys a little input
# and pays for it many times over in lost sharing.
#
# S8 is the exception and the reason this exists at all: it went the other way,
# -49% input AND cheaper ($0.138 -> $0.118), because its slice is tiny and it
# was never able to answer from the shared text anyway.


def _agent_text(agent: str, text: str, sections: dict | None) -> str:
    """
    The slice this agent needs, or the combined text when we cannot slice.

    The fallback is not a nicety. Unstructured JATS parses to no sections at
    all, and handing a subagent an empty payload reads exactly like a paper
    that reports nothing -- the failure mode invariant 7 makes expensive,
    because a missing result is scored as evidence AGAINST.
    """
    want = AGENT_SECTIONS.get(agent)
    if not want or not sections:
        return text
    parts = [sections[k] for k in want if sections.get(k)]
    return "\n\n".join(parts) if parts else text


def _payload(agent: str, record: dict, text: str, registry: dict | None,
             sections: dict | None = None) -> dict:
    from claude_adapter import SCHEMAS, _system_prompt
    _, _schema_f, _prompt_f = claude_adapter.AGENTS[agent]
    # +400 for JSON scaffolding and the fixed keys around the text.
    _fixed = (len(_system_prompt(_prompt_f))
              + len((SCHEMAS / _schema_f).read_text()) + 400)
    text = _agent_text(agent, text, sections)
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
                "unspecified_form_id": vocab.unspecified_form_id(ingredient),
                # Dose sentences harvested from the FULL text by regex, because
                # the shared slice can cut them: measured 2026-08-12, 12 of 76
                # dose-less S7 extractions had the dose in the full text but NOT
                # in the text S7 received. Deterministic (no model), tiny, and it
                # rides in the payload so the cache key changes with it.
                "dose_snippets": _dose_snippets(text)}
    if agent == "S8":
        return base
    raise KeyError(agent)


def extract_study(record: dict, text: str, registry: dict | None = None, *,
                  call=None, max_workers: int = 5,
                  outcome_allowlist: list[str] | None = None,
                  sections: dict | None = None) -> dict:
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
        futures = {agent: pool.submit(
                       call, agent,
                       _payload(agent, record, text, registry, sections))
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
    #
    # Showcase mode: shrink the S6 vocabulary to the top-N outcomes for this
    # ingredient. That is the main token/complexity win — the model cannot map
    # into the long tail, so those claims are discarded instead of scored.
    claims = ((out.get("S5") or {}).get("claims")) or []
    out["outcomes"] = []
    if claims:
        from pipeline.showcase import restrict_outcome_vocab
        full = vocab.load("outcome")["outcomes"]
        vocabulary = restrict_outcome_vocab(full, outcome_allowlist)
        if S6_BATCH:
            # ONE call for the whole study instead of one per claim. The fixed
            # part of an S6 call -- shared rules + S6 rules + schema +
            # vocabulary, ~1 300 tokens -- is identical for every claim, while
            # the variable part is one short string. Paying it per claim is the
            # single largest avoidable token cost in the pipeline: S6 was 44 of
            # 64 calls on a 5-study run.
            #
            # Results are matched back BY INDEX, never by position in the
            # returned array: a model that reorders or omits an entry must not
            # silently shift every mapping onto the wrong claim. A claim with no
            # returned index keeps result None and is discarded, which is the
            # same under-count the per-claim path produces on failure.
            res, _meta = call("S6B", {
                "claims": [{"index": i,
                            "outcome_raw": cl.get("outcome_raw"),
                            "measure": cl.get("measure")}
                           for i, cl in enumerate(claims)],
                "vocabulary": vocabulary})
            by_index = {m.get("index"): m
                        for m in ((res or {}).get("mappings") or [])
                        if isinstance(m, dict)}
            mapped = [(cl, (by_index.get(i), None)) for i, cl in enumerate(claims)]
        else:
            with ThreadPoolExecutor(max_workers=min(len(claims), 6)) as pool:
                mapped = list(pool.map(
                    lambda cl: (cl, call("S6", {"outcome_raw": cl.get("outcome_raw"),
                                                "measure": cl.get("measure"),
                                                "vocabulary": vocabulary})),
                    claims))
        for claim, (result, _meta) in mapped:
            vid = (result or {}).get("outcome_vocab_id")
            # If allowlist is active and S6 still returned something outside it
            # (should not), discard — showcase is a hard product boundary.
            if outcome_allowlist and vid and vid not in outcome_allowlist:
                vid = None
            out["outcomes"].append({
                "claim": claim,
                "outcome_vocab_id": vid,
                "discarded": vid is None,
                "rationale": (result or {}).get("rationale"),
            })
    return out


def extract_corpus(records: list[dict], text_for, registry_for=None, *,
                   call=None, max_studies_in_flight: int = 4,
                   outcome_allowlist: list[str] | None = None,
                   sections_for=None) -> list[dict]:
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
    if outcome_allowlist:
        print(f"  showcase outcomes ({len(outcome_allowlist)}): "
              + ", ".join(outcome_allowlist))
    else:
        print("  showcase: OFF (full outcome vocabulary)")

    with ThreadPoolExecutor(max_workers=max_studies_in_flight) as pool:
        future_map = {
            pool.submit(
                extract_study, r, text_for(r),
                registry_for(r) if registry_for else None, call=call,
                outcome_allowlist=outcome_allowlist,
                sections=sections_for(r) if sections_for else None,
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
