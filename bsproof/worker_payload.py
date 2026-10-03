"""
Per-study payload building: what text, tables and dose snippets each agent is
sent, fitted to the CLI input budget. Moved verbatim out of workers.py on
2026-10-03; bsproof.workers re-exports every name (workers._payload,
workers._fit_text, workers.ELISION, ... still resolve).

Builds model INPUTS only; it never calls a model.
"""
from __future__ import annotations

import os
import json

from bsproof import claude_adapter
from pipeline import vocab

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


ELISION = "\n\n[... middle of paper elided to fit the input budget ...]\n\n"

# S7's payload walls, RE-MEASURED FOR THE CLAUDE BACKEND 2026-08-25. The old
# single 14,500-char wall was measured on the GROK CLI (S7's one historical
# timeout, a 15,463-char total). Under the v1.24 arm-keyed contract S7's
# system prompt + schema alone reach ~14k chars, so against that wall
# _fit_text clamped every paper to 1,000 chars and wall_room went negative --
# ZERO tables shipped, silently, on the whole 156-study corpus. That is what
# actually emptied the per-kg body masses (the v1.27 prompt fix alone
# recovered 0/32, because the mass was never in the payload). Claude tier B
# demonstrably handles far larger calls: S5 succeeded the same day at a
# 38,376-char fixed envelope plus full 35,740-char papers. TEXT_WALL bounds
# the fitted text region (fixed + snippets + text) at roughly the historical
# 12k text intent; TOTAL_WALL leaves the gap tables ride in, exactly the
# v1.23 design. If the Grok backend is revived, these must be re-measured
# there -- same caveat the S5 budget comment already carries.
S7_TEXT_WALL = 26000
S7_TOTAL_WALL = 30000
# Exact transport fallback after the CLI rejects an otherwise valid call as
# "Prompt is too long". Measured on the v1.26 156-study gate: a 1,703-char
# abstract failed for both S3 and S5 after their contracts grew, while the same
# source fitted to 1,550 chars succeeded. The first call produced no model
# output, so this is an input-transport retry, not a second scientific turn.
# The error match is deliberately EXACT (fail-closed): a reworded CLI error
# falls back to the pre-existing hard-fail path rather than over-triggering.
# If the CLI wall moves, re-measure this constant; the selftest section
# "PROMPT TEXT FITTING" pins both the retry length and the fail-closed match.
PROMPT_TOO_LONG_RETRY_CHARS = 1550


import re as _re

# Two shapes: absolute daily doses ("5 g/day", "3 g of creatine", "5 g daily",
# "creatine 5 g") and per-kg dosing ("0.3 g/kg/day", "0.1 g kg-1", "75 mg
# creatine hydrate kg-1 body mass"). Deliberately broad -- a false positive
# costs a wasted sentence in the payload, a false negative loses the study's
# dose for the run. The second alternative (bare "N g" with a dosing word
# within reach) covers the shapes an adversarial pass confirmed the first
# version missed on real corpus papers: "ingested 3 g of creatine"
# (PMC10975653), "creatine 5 g" (PMC5698587), "5 g twice daily".
_DOSE_PAT = _re.compile(
    r"\b\d+(\.\d+)?\s*(g|mg|grams?)\s*"
    r"(([/·]|per\s+)?\s*(kg|d\b|day|daily|body)"          # 5 g/day, 0.3 g/kg
    r"|(of\s+\w|daily|twice|once|dose|per)"               # 3 g of creatine, 5 g daily
    r")", _re.I)


def _dose_snippets(text: str, cap: int = 5, width: int = 220,
                   ingredient: str | None = None) -> list[str]:
    """
    Sentences around every dose mention in the FULL text, deduplicated,
    INGREDIENT-BEARING SNIPPETS FIRST.

    Exists because the shared slice truncates: measured 2026-08-12, 12 of 76
    dose-less S7 extractions had the dose in the full text but not in what S7
    received. This is retrieval, not judgement -- a regex either matched or it
    did not, and S7 still decides what the numbers mean.

    The ranking exists because the cap can crowd out the real dose: measured,
    PMC5698587's "creatine 5 g" was displaced by an animal-feed citation
    ("animals weighing 200 g and eating 20 g per d"). A snippet that names the
    ingredient outranks one that does not; the cap then bites the junk first.
    """
    if not text:
        return []
    ing = (ingredient or "").split("_")[0].lower()
    hits, seen = [], set()
    for m in _DOSE_PAT.finditer(text):
        start = max(0, m.start() - width // 2)
        snip = " ".join(text[start:m.end() + width // 2].split())
        key = snip[:80]
        if key in seen:
            continue
        seen.add(key)
        hits.append((0 if ing and ing in snip.lower() else 1, len(hits), snip))
    hits.sort()                          # ingredient-bearing first, stable
    return [s for _, _, s in hits[:cap]]


def _tables_structured(record: dict, max_rows_per_table: int = 40) -> list[dict]:
    """Structured tables for the SHADOW harvester only (never model payloads).

    Returns effect_harvest-coercible mappings with colspan-expanded, merged
    multi-row headers.  Deterministic, disk-cached XML, no model calls.
    """
    pmcid = record.get("pmcid")
    if not pmcid:
        return []
    try:
        from sources import fulltext
        xml = fulltext.fetch_xml(pmcid, use_cache=True)
        tables = fulltext.extract_tables_structured(xml) if xml else []
    except Exception:
        return []
    out = []
    for t in tables:
        caption = " — ".join(x for x in (t.get("label"), t.get("caption")) if x)
        out.append({"caption": caption or "Table",
                    "columns": t.get("columns") or [],
                    "rows": (t.get("rows") or [])[:max_rows_per_table]})
    return out


def _tables_text(record: dict, cap_chars: int = 4000,
                 max_rows_per_table: int = 14) -> list[str]:
    """
    The paper's tables, serialised for S5. Deterministic retrieval, no model.

    Exists because the endpoint's mean +/- SD grids live in TABLES, and S5's
    payload was prose-only. MEASURED 2026-08-12 on the 10-study SD test: one
    paper's raw XML held 109 "+/-" values inside <table-wrap> while its prose
    carried mostly demographics -- so `effect_sd` was unextractable for exactly
    the papers that report outcomes properly. Same pattern as S7's
    dose_snippets: hand the model what truncation and section-routing hid.

    Cache-friendly: fetch_xml is disk-cached and was already fetched upstream
    by best_text, so this is a cache hit in production.
    """
    pmcid = record.get("pmcid")
    if not pmcid:
        return []
    try:
        from sources import fulltext
        xml = fulltext.fetch_xml(pmcid, use_cache=True)
        tables = fulltext.extract_tables(xml) if xml else []
    except Exception:
        return []
    out, used = [], 0
    for t in tables:
        rows = t.get("rows") or []
        lines = [f"{t.get('label') or 'Table'} — {t.get('caption') or ''}".strip()]
        lines += [" | ".join(str(c) for c in row) for row in rows[:max_rows_per_table]]
        if len(rows) > max_rows_per_table:
            lines.append(f"... {len(rows) - max_rows_per_table} more rows")
        block = "\n".join(lines)
        if used + len(block) > cap_chars:
            break
        out.append(block)
        used += len(block)
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
    if room <= 0:
        # v1.24's arm-keyed S7 schema is intentionally strict and can exceed
        # the historical 12k prompt budget. S7 still has a measured wall;
        # fit it to that wall rather than returning an unbounded full paper.
        if agent == "S7":
            room = max(1000, S7_TEXT_WALL - fixed_chars - extra)
        else:
            return text
    if len(text) <= room:
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


def _envelope_chars(agent: str, payload: dict) -> int:
    """Exact CLI envelope chars: system prompt + schema + serialized payload."""
    from bsproof.claude_adapter import SCHEMAS, _claude_system_prompt
    _, schema_f, prompt_f = claude_adapter.AGENTS[agent]
    return (len(_claude_system_prompt(prompt_f))
            + len((SCHEMAS / schema_f).read_text())
            + len(json.dumps(payload, ensure_ascii=False, sort_keys=True)))


def _payload(agent: str, record: dict, text: str, registry: dict | None,
             sections: dict | None = None, s3_facts: dict | None = None) -> dict:
    from bsproof.claude_adapter import SCHEMAS, _claude_system_prompt
    _, _schema_f, _prompt_f = claude_adapter.AGENTS[agent]
    # +400 for JSON scaffolding and the fixed keys around the text. This is a
    # TEXT-fit reserve only; S7's final TOTAL wall uses _envelope_chars on the
    # complete serialized payload, never this approximation.
    _fixed = (len(_claude_system_prompt(_prompt_f))
              + len((SCHEMAS / _schema_f).read_text()) + 400)
    text = _agent_text(agent, text, sections)
    base = {"title": record.get("title"), "text": _fit_text(agent, text, _fixed)}
    if agent == "S1":
        return base
    if agent == "S3":
        # Population vocabulary is NOT sent. S3's prompt lists the four axes and
        # allowed values; shipping the JSON duplicated ~1.9k and pushed S3 over
        # the CLI input wall (magnesium: 12/54 S3 fails). The target ingredient
        # is load-bearing for arm eligibility and is therefore explicit rather
        # than guessed from a named case in the prompt.
        return {**base, "ingredient": record.get("ingredient")}
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
        # Tables ride along (v1.21): endpoint means +/- SD live there, and the
        # SD is what standardises a raw-unit difference (see _tables_text).
        #
        # The cap is FLAT, not budget-derived, because the budget arithmetic is
        # dead for S5 under the Claude backend and pretending otherwise would
        # ship zero tables. MEASURED 2026-08-12: S5's system prompt + schema is
        # 22 204 chars against a 12 000-char total budget, so _fit_text's room
        # has been negative -- and its room<=0 branch returns the FULL text --
        # since the v1.15-v1.20 prompt growth. Every recent production S5 call
        # already sent the whole paper and succeeded 149/149; the ~16k wall in
        # PROMPT_BUDGET_CHARS was measured on the GROK CLI, not Claude. If the
        # Grok backend is revived, this is the first thing to revisit.
        return {**base, "tables": _tables_text(record),
                "target_ingredient": record.get("ingredient"),
                "s3_arm_facts": (s3_facts or {}).get("arms", []),
                "s3_extraction_version": (s3_facts or {}).get("extraction_version")}
    if agent == "S5R":
        # The second reviewer reads the SAME paper and tables as S5 but is never
        # shown S5's numbers -- only which claims to read (workers.py adds them).
        return {**base, "tables": _tables_text(record),
                "target_ingredient": record.get("ingredient"),
                "s3_arm_facts": (s3_facts or {}).get("arms", [])}
    if agent == "S7":
        ingredient = record["ingredient"]
        # Dose sentences harvested from the FULL text by regex, because the
        # shared slice can cut them: measured 2026-08-12, 12 of 76 dose-less S7
        # extractions had the dose in the full text but NOT in the text S7
        # received (verified 6/6 on the checkable half). Deterministic, and it
        # rides in the payload so the cache key changes with it.
        snippets = _dose_snippets(text, ingredient=ingredient)
        # The snippets COUNT AGAINST the text budget. Without this, the largest
        # corpus study reached 15,463 total chars -- within 550 of the measured
        # ~16k CLI wall, the exact size of S7's one prior timeout. Refit rather
        # than hope: the head/tail slice shrinks by what the snippets add.
        snip_chars = sum(len(s) for s in snippets) + 24 * len(snippets)
        # Tables ride along (v1.23), exactly like S5's (v1.21) and for the
        # dose arc's version of the same reason: dosing protocols ("20 g/d
        # loading, 5 g/d maintenance") and the baseline MEAN BODY MASS that
        # per-kg dosing needs live in tables the prose slice loses. Measured
        # 2026-08-24 on the creatine corpus: the muscle_strength dose band
        # rested on ONE dosed benefit trial, and 25 per-kg trials stayed
        # dose-less for want of a body mass that Table 1 typically prints.
        # S7's budget arithmetic is LIVE, and _fit_text's room<=0 branch
        # returns the FULL text -- so tables must NEVER be added to
        # fixed_chars: measured 2026-08-24, counting a 2.5k table block
        # against the budget flipped 32/156 corpus studies into the full-text
        # regime (5k -> up to 60k payloads). The text is therefore fitted
        # exactly as before (fixed + snippets only), and tables ride in the
        # gap between the TEXT budget and the CLI WALL: S7's one historical
        # timeout was a 15,463-char total, so 14,500 is the hard ceiling
        # here. Measured on the 156-study corpus: text fitting is
        # byte-identical with and without tables, payload max unchanged
        # (11.1k), and 76/156 studies ship tables (avg 1.4k) -- which is
        # 76/76 of the studies that HAVE PMC XML tables at all (58 lack a
        # pmcid, 22 have XML without <table-wrap>). The leftover-of-12k
        # variant shipped tables to exactly 1 study, i.e. never.
        # (Those measurements were made under the v1.23 contract; the walls
        # are S7_TEXT_WALL / S7_TOTAL_WALL now -- see their comment for the
        # v1.24 collapse this repairs.)
        fitted = _fit_text(agent, text, _fixed + snip_chars)
        payload = {**base,
                   "text": fitted,
                   "ingredient": ingredient,
                   "target_ingredient": ingredient,
                   "s3_arm_facts": (s3_facts or {}).get("arms", []),
                   "s3_extraction_version": (s3_facts or {}).get("extraction_version"),
                   "form_vocabulary": vocab.forms_for(ingredient),
                   "unspecified_form_id": vocab.unspecified_form_id(ingredient),
                   "dose_snippets": snippets,
                   "tables": []}
        # COMPLETE serialized-envelope accounting. The previous arithmetic
        # omitted form_vocabulary, S3 arm facts and JSON encoding overhead; its
        # selftest repeated the same underestimate (~2.2k chars measured), so a
        # nominal 30k wall could actually overflow. Start with up to 2.5k raw
        # table text, then trim/pop the last table until the exact envelope
        # fits. If tables are exhausted and the envelope still overflows (a
        # long paper plus many serialized S3 arms -- reproduced at 31,547
        # chars with 12 arms), the TEXT is re-fit head/tail by the exact
        # overflow: text is the one elastic field left, and crashing on a
        # live study was the alternative.
        # `room` is a RAW char budget compared against a SERIALIZED envelope
        # (JSON quoting/escaping unaccounted, and cap_chars is per table while
        # several may return). That is safe ONLY because the trim loop below
        # corrects against the exact serialized envelope -- do not remove one
        # without the other.
        room = S7_TOTAL_WALL - _envelope_chars("S7", payload)
        tables = (_tables_text(record, cap_chars=min(2500, room))
                  if room >= 300 else [])
        payload["tables"] = list(tables)
        while _envelope_chars("S7", payload) > S7_TOTAL_WALL:
            overflow = _envelope_chars("S7", payload) - S7_TOTAL_WALL
            if payload["tables"]:
                last = payload["tables"][-1]
                keep = len(last) - overflow - 1
                if keep >= 80:
                    # Cut at a row boundary so the model never reads a half
                    # row like "Creatine | 83." as a complete fact.
                    cut = last[:keep]
                    payload["tables"][-1] = cut.rsplit("\n", 1)[0] or cut
                else:
                    payload["tables"].pop()
                continue
            body = payload["text"]
            keep = len(body) - overflow - len(ELISION)
            if keep < 1000:
                # The fixed prompt+schema+facts alone exceed the wall; a
                # sub-1000-char paper slice cannot answer S7's questions, so
                # refuse loudly instead of shipping a doomed call.
                raise RuntimeError(
                    f"S7 envelope cannot fit {S7_TOTAL_WALL} chars: "
                    f"{_envelope_chars('S7', payload)} with text at "
                    f"{len(body)} chars")
            head = keep // 2
            payload["text"] = body[:head] + ELISION + body[-(keep - head):]
        # Explicit raise, not assert: asserts vanish under python -O, which
        # would turn an overflow into a silent oversized live call.
        if _envelope_chars("S7", payload) > S7_TOTAL_WALL:
            raise RuntimeError("S7 envelope exceeds S7_TOTAL_WALL after fitting")
        return payload
    if agent == "S8":
        return base
    raise KeyError(agent)
