"""
Per-study workers. This file MAY call a model; `pipeline/` may not.

It lives at the repo root beside claude_adapter.py deliberately. Invariant 1
says everything in `pipeline/` and `sources/` is deterministic, so the layer
that fans out to subagents cannot live there. The split is:

    workers.py           orchestrates subagent calls        [MODEL]
    pipeline/assemble.py turns their JSON into a Study      [NO MODEL]

Each worker is a pure function of one study: input JSON on stdin, output JSON,
exit. No tools, no loop, no state. If a subagent seems to need a second turn,
the prompt is wrong (invariant 2).

`call` is injectable so the whole fan-out is testable without an API key or a
single token spent. That is not a testing convenience -- it is how the assembly
logic gets regression coverage at all, since model output cannot be asserted on.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor

import claude_adapter
from pipeline import vocab

# Which subagents run per primary study, and what each one is fed. Order is
# irrelevant -- they are independent pure functions, which is why they can fan
# out. S6 is the exception: it consumes S5's output and must run after it.
PER_STUDY = ("S3", "S4", "S5", "S7", "S8")

# Below this, the "study" is a title or nothing. An abstract is ~800-2000 chars;
# a bare title is ~80. Extraction below this floor cannot produce a real claim.
MIN_TEXT_CHARS = 200


def _payload(agent: str, record: dict, text: str, registry: dict | None) -> dict:
    """
    What each subagent sees. Deliberately minimal: a subagent that receives the
    whole record can drift into using fields it should not, and reproducibility
    depends on the input being exactly what the prompt describes.
    """
    base = {"title": record.get("title"), "text": text}
    if agent == "S3":
        # S3 places the population on the four axes itself. It already has the
        # study in context, so this costs no extra model call -- the alternative
        # was a ninth subagent mapping raw population text after the fact.
        return {**base, "population_vocabulary": vocab.load("population")["axes"]}
    if agent == "S4":
        # RoB items 3 and 4 need registry evidence. Item 3 is already computed
        # deterministically in sources/clinicaltrials.py -- it is passed as a
        # FACT so S4 does not re-derive a date comparison.
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
    """
    Run every per-study subagent for one paper. Returns
    {"S3": {...} | None, ..., "outcomes": [{claim, outcome_vocab_id}, ...]}.

    A None value means the subagent failed its schema twice and the field is
    UNKNOWN. It is never replaced with a default -- a null is a known unknown the
    scorer handles, a guess corrupts every number downstream (invariant 5).
    """
    call = call or claude_adapter.call

    # Refuse to extract from nothing. Measured 2026-08-06: a storage schema that
    # dropped the abstract meant six studies were extracted from an EMPTY string.
    # Every subagent returned schema-valid output, S5 found no claims, and the
    # run produced zero ECU rows while reporting success. Empty input is not a
    # study; spending five model calls to discover that is pure waste.
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
                # A failed subagent is NOT "this study said nothing". Record it
                # so callers can tell an empty study from a broken run --
                # conflating them is how a thrashing batch looked like a corpus
                # with no mappable outcomes.
                out.setdefault("_failed", []).append(
                    {"agent": agent, "error": meta.get("error")})

    # S6 runs after S5 because it consumes S5's raw outcome strings. Each claim
    # is mapped independently; a null mapping DISCARDS that claim rather than
    # approximating it (S6 is the highest-risk subagent for exactly this reason).
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
    Fan out across studies. Concurrency is bounded twice -- here and by the
    semaphore in claude_adapter -- because the outer bound controls memory and
    the inner one controls subprocess count.

    `text_for(record) -> str` supplies the best available text. Callers decide
    the ladder (full text > SR table > ct.gov > abstract); this function does
    not, because that choice affects the OA factor and must be recorded.
    """
    results = []
    with ThreadPoolExecutor(max_workers=max_studies_in_flight) as pool:
        futures = [pool.submit(extract_study, r, text_for(r),
                               registry_for(r) if registry_for else None, call=call)
                   for r in records]
        for r, fut in zip(records, futures):
            results.append({"record": r, "extraction": fut.result()})
    return results
