"""
Per-study workers. This file MAY call a model; `pipeline/` may not.
"""
from __future__ import annotations

import time
import os
import math
import re
from collections import deque
from concurrent.futures import ThreadPoolExecutor, FIRST_COMPLETED, wait as _fwait

import claude_adapter
from pipeline import vocab
from pipeline.relevance import relevance_check

PER_STUDY = ("S3", "S4", "S5", "S7", "S8")
MIN_TEXT_CHARS = 200


def _v13_shadow_enabled() -> bool:
    """Return whether the experimental v13 wiring is explicitly enabled."""
    return os.environ.get("SP_V13_SHADOW", "0") == "1"

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

# Subscription-limit survival. The 2026-08-10 run lost 364 of 906 calls
# because a limit hit is FATAL per call (claude_adapter._FATAL: retrying a
# time-based limit is a wasted minute) but the CORPUS loop kept marching,
# recording every remaining study as failed. The right unit of retry is the
# STUDY, and the right response to a time-based limit is to WAIT: quota-hit
# studies are requeued and the run pauses QUOTA_WAIT_S between probes, up to
# QUOTA_MAX_WAIT_S of total waiting per run. Probing while still limited is
# nearly free -- the CLI fails fast with no tokens spent.
QUOTA_WAIT_S = int(os.environ.get("SP_QUOTA_WAIT_S", "900"))          # 15 min
QUOTA_MAX_WAIT_S = int(os.environ.get("SP_QUOTA_MAX_WAIT_S", "28800"))  # 8 h
_QUOTA_STRINGS = ("session limit", "usage limit", "rate limit", "rate_limit")


def _quota_signal(value) -> bool:
    """Return whether an adapter value identifies a retryable quota failure."""
    text = str(value or "").lower()
    return (any(marker in text for marker in _QUOTA_STRINGS)
            or bool(_re.search(
                r"\b(?:session|usage|rate)[ _-]?(?:limit|limited)\b", text)))


def _hit_quota(extraction: dict) -> bool:
    """True when this study's failures include a subscription-limit hit."""
    if extraction.get("_quota_exhausted"):
        return True
    for f in extraction.get("_failed") or []:
        err = str(f.get("error") or "").lower()
        if any(k in err for k in _QUOTA_STRINGS):
            return True
    return False

# S3 is the longest system prompt + schema among per-study agents. Give it a
# stricter text headroom so full-text papers do not re-hit the wall.
AGENT_BUDGET_TRIM = {
    "S3": 1500,   # extra reserved vs other agents
}


ELISION = "\n\n[... middle of paper elided to fit the input budget ...]\n\n"


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
    if agent == "S1":
        return base
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
        return {**base, "tables": _tables_text(record)}
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
        return {**base, "text": _fit_text(agent, text, _fixed + snip_chars),
                "ingredient": ingredient,
                "form_vocabulary": vocab.forms_for(ingredient),
                "unspecified_form_id": vocab.unspecified_form_id(ingredient),
                "dose_snippets": snippets}
    if agent == "S8":
        return base
    raise KeyError(agent)


def _shadow_arm_aliases(s3: dict | None, ingredient: str | None = None) -> tuple[dict[str, list[str]] | None, str | None, dict[str, str] | None]:
    """Build conservative aliases from explicit S3 labels only.

    Parenthetical/dose removal handles the common table header shortening.  The
    prefix aliases are deliberately generated from the labels (never from
    world knowledge); if two arm words share a first word, abbreviation would
    be ambiguous and the whole table is refused.
    """
    if not isinstance(s3, dict):
        return None, "S3 arm facts are absent", None
    if s3.get("comparator") != "ingredient_free":
        return None, "S3 comparator is not explicitly ingredient_free", None
    if s3.get("ingredient_isolated") != "yes":
        return None, "S3 ingredient_isolated is not explicitly yes", None
    arms = s3.get("arms")
    if not isinstance(arms, list):
        return None, "S3 arms are absent", None
    # Unknown arm roles are not safe to ignore: the selector requires a fully
    # explicit two-role comparison, not merely one true and one false among
    # otherwise ambiguous arms.
    if any(not isinstance(a, dict) or type(a.get("is_control")) is not bool
           for a in arms):
        return None, "S3 has an arm with unknown control status", None
    controls = [a for a in arms if a.get("is_control") is True]
    noncontrols = [a for a in arms if a.get("is_control") is False]
    if len(controls) != 1:
        return None, "S3 does not have exactly one explicit control arm", None
    if not noncontrols:
        return None, "S3 has no explicit non-control arm", None
    # More than two arms are recoverable only when exactly one non-control arm
    # explicitly contains the ingredient token.  This preserves the ingredient
    # alone vs comparator contrast while refusing Cr vs Cr+protein mixtures.
    token = str(ingredient or s3.get("ingredient") or "").strip().casefold()
    token_words = re.findall(r"[a-z0-9]+", token)
    token = token_words[0] if token_words else ""
    if len(noncontrols) != 1:
        if not token:
            return None, "S3 multi-arm trial has no ingredient token", None
        hits = [a for a in noncontrols
                if re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])",
                             str(a.get("label", "")).casefold())]
        if len(hits) == 0:
            return None, "S3 multi-arm trial has no ingredient-alone arm", None
        if len(hits) > 1:
            return None, "S3 multi-arm trial has multiple ingredient arms", None
        ingredients = hits
    else:
        ingredients = noncontrols
    control_label = controls[0].get("label")
    ingredient_label = ingredients[0].get("label")
    if not (isinstance(control_label, str) and control_label.strip()
            and isinstance(ingredient_label, str) and ingredient_label.strip()):
        return None, "S3 arm labels are not explicit", None
    if control_label == ingredient_label:
        return None, "S3 arm labels are not unique", None
    if not token:
        ingredient_words = re.findall(r"[a-z0-9]+", ingredient_label.casefold())
        token = ingredient_words[0] if ingredient_words else ""

    def _label_aliases(label: str) -> list[str]:
        # Strip parenthetical sample sizes, comparator details, and doses only;
        # these are formatting variants of the supplied label, not synonyms.
        bare = re.sub(r"\s*\([^)]*\)", "", label).strip()
        dose = re.sub(r"\s+(?:\d+(?:\.\d+)?\s*(?:mg|g|kg|μg|mcg)(?:\s*/\s*(?:kg|day|d))?\s*)+$",
                      "", bare, flags=re.IGNORECASE).strip()
        values = [label, bare, dose]
        text = next((a.get("intervention_text") for a in arms
                     if a.get("label") == label), None)
        if isinstance(text, str) and text.strip():
            values.append(text)
        return list(dict.fromkeys(v for v in values if v))

    # Prefix aliases are unsafe if *any* S3 arm can claim the same header,
    # including ignored multi-arm arms.  Check every explicit label before
    # returning aliases for the selected pair.
    all_labels = [a.get("label") for a in arms]
    if any(not isinstance(label, str) or not label.strip() for label in all_labels):
        return None, "S3 arm labels are not explicit", None
    first_words = []
    for label in all_labels:
        match = re.match(r"[A-Za-z]+", label)
        first_words.append(match.group(0).casefold() if match else "")
    prefixes: dict[str, str] = {}
    for label, word in zip(all_labels, first_words):
        if not word:
            continue
        for size in range(2, len(word) + 1):
            prefix = word[:size]
            prior = prefixes.get(prefix)
            if prior is not None and prior != label:
                return None, "S3 arm words share a prefix; abbreviation is ambiguous", None
            prefixes[prefix] = label
    # A control label that contains the ingredient token is not a safe control
    # alias (e.g. "Placebo (creatine-free)").
    if token and re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])",
                           control_label.casefold()):
        return None, "S3 control label contains the ingredient token", None

    def aliases_for(arm, label):
        values = _label_aliases(label)
        # Prefix aliases allow headers such as CR/PLA, but only for a unique
        # first word.  They are label-derived and therefore cannot invent PLC
        # or any other world-knowledge synonym.
        first = re.match(r"[A-Za-z]+", label)
        if first:
            word = first.group(0)
            values.extend(word[:i] for i in range(2, len(word) + 1))
        return list(dict.fromkeys(values))
    selected = {ingredient_label: aliases_for(ingredients[0], ingredient_label),
                control_label: aliases_for(controls[0], control_label)}
    return selected, None, {"ingredient": ingredient_label, "control": control_label}


_SHADOW_SELECTION_KEYS = frozenset({
    "selected_candidate_index", "n_ingredient", "n_control",
    "mean_ingredient", "mean_control", "sd_ingredient", "sd_control",
    "estimand", "timepoint", "design_kind", "table_provenance",
    "refusal_reason",
})
_SHADOW_NUMERIC_KEYS = ("mean_ingredient", "mean_control",
                        "sd_ingredient", "sd_control")
_SHADOW_NULL_ON_REFUSAL = (
    "selected_candidate_index", "n_ingredient", "n_control",
    "mean_ingredient", "mean_control", "sd_ingredient", "sd_control",
    "estimand", "timepoint", "design_kind", "table_provenance",
)


def _shadow_validate_selection(claim: dict, candidates: list[dict], selected: dict,
                               s1: dict, role_facts: dict) -> tuple[dict | None, str | None]:
    """Validate S5T output with dependency-free, strict schema checks."""
    if not isinstance(selected, dict):
        return None, "selector output is not an object"
    if set(selected) != _SHADOW_SELECTION_KEYS:
        return None, "selector output has missing or extra keys"

    index = selected["selected_candidate_index"]
    # A refusal is valid only when every selection field is explicitly null.
    if index is None:
        if any(selected[key] is not None for key in _SHADOW_NULL_ON_REFUSAL):
            return None, "refusal contains non-null selection fields"
        reason = selected["refusal_reason"]
        if (not isinstance(reason, str) or not reason.strip()
                or len(reason) > 500):
            return None, "refusal reason is not a nonblank string"
        return None, reason.strip()
    # type() rather than isinstance(): bool is an int subclass, and an
    # adversarial int SUBCLASS must not satisfy a strict-native-type contract.
    if type(index) is not int:
        return None, "selector index is not an integer"
    if index < 0 or index > 100000 or index >= len(candidates):
        return None, "selector index is out of range"
    if selected["refusal_reason"] is not None:
        return None, "selection refusal_reason must be null"
    for key in ("n_ingredient", "n_control"):
        value = selected[key]
        if value is not None and (type(value) is not int or value < 1
                                   or value > 1_000_000):
            return None, f"selector {key} is not null or a positive integer"
    for key in _SHADOW_NUMERIC_KEYS:
        value = selected[key]
        try:
            finite = math.isfinite(value) if type(value) in (int, float) else False
            bounded = abs(value) <= 1_000_000_000_000 if finite else False
        except (OverflowError, TypeError):
            finite = bounded = False
        if not finite or not bounded:
            return None, f"selector {key} is not a finite native number"
    if any(selected[key] <= 0 for key in ("mean_ingredient", "mean_control",
                                           "sd_ingredient", "sd_control")):
        return None, "selector means and SDs must be positive"
    if selected["estimand"] not in ("endpoint", "change_from_baseline"):
        return None, "selector estimand is invalid"
    if (not isinstance(selected["timepoint"], str)
            or not selected["timepoint"].strip()
            or len(selected["timepoint"]) > 120):
        return None, "selector timepoint is invalid"
    if selected["design_kind"] != "parallel":
        return None, "selector design_kind is not parallel"
    provenance = selected["table_provenance"]
    if (not isinstance(provenance, dict)
            or set(provenance) != {"caption", "row", "column"}
            or any(not isinstance(provenance[key], str)
                   or not provenance[key].strip()
                   for key in ("caption", "row", "column"))
            or len(provenance["caption"]) > 500
            or len(provenance["row"]) > 500
            or len(provenance["column"]) > 1000):
        return None, "selector provenance has invalid shape"

    if index < 0 or index >= len(candidates):
        return None, "selector index is out of range"
    candidate = candidates[index]
    if not isinstance(candidate, dict):
        return None, "selected candidate is malformed"

    design_kind = s1.get("design_kind") if isinstance(s1, dict) else None
    if design_kind != "parallel":
        return None, "S1 design_kind is not explicit parallel"
    estimand = claim.get("estimand")
    timepoint = claim.get("timepoint")
    if estimand not in ("endpoint", "change_from_baseline"):
        return None, "claim estimand is absent or unsupported"
    if not isinstance(timepoint, str) or not timepoint.strip():
        return None, "claim timepoint is absent"
    from pipeline.effect_harvest import _term_matches as _harvest_term_matches
    outcome_term = str(candidate.get("outcome_term", "")).strip()
    claim_terms = [str(claim.get(key, "") or "").strip()
                   for key in ("outcome_raw", "measure")]
    # Mirror the harvester's matching contract exactly: word-bounded
    # containment or paren-stripped equality against the same claim terms the
    # candidates were harvested for.  Anything looser would let a selection
    # attach a different endpoint's numbers to this claim.
    if not any(term and _harvest_term_matches(outcome_term, term)
               for term in claim_terms):
        return None, "candidate outcome does not match claim terms"

    arms = candidate.get("arms")
    if not isinstance(arms, (list, tuple)) or len(arms) != 2:
        return None, "selected candidate does not have exactly two arms"
    by_alias = {a.get("arm_alias"): a for a in arms
                if isinstance(a, dict) and isinstance(a.get("arm_alias"), str)}
    if len(by_alias) != 2:
        return None, "selected candidate arm aliases are ambiguous"
    # Aliases are S3 labels, so role assignment is explicit and not positional.
    s3_facts = role_facts
    if not isinstance(s3_facts, dict):
        return None, "missing explicit arm alias facts"
    ingredient_label = s3_facts.get("ingredient")
    control_label = s3_facts.get("control")
    ingredient = by_alias.get(ingredient_label)
    control = by_alias.get(control_label)
    if ingredient is None or control is None or ingredient is control:
        return None, "candidate cannot be mapped to one ingredient and one control arm"

    def _number(value, *, positive=False):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        try:
            finite = math.isfinite(value)
        except (OverflowError, TypeError):
            finite = False
        if not finite:
            return False
        return value > 0 if positive else True

    for arm in (ingredient, control):
        if arm.get("n") is not None and (
                not isinstance(arm.get("n"), int) or isinstance(arm.get("n"), bool)
                or arm.get("n") <= 0):
            return None, "candidate n is invalid"
        if not _number(arm.get("mean"), positive=True) or not _number(
                arm.get("sd"), positive=True):
            return None, "candidate mean or SD is invalid"

    expected = {
        "n_ingredient": ingredient.get("n"),
        "n_control": control.get("n"),
        "mean_ingredient": ingredient.get("mean"),
        "mean_control": control.get("mean"),
        "sd_ingredient": ingredient.get("sd"),
        "sd_control": control.get("sd"),
        "estimand": estimand,
        "timepoint": timepoint,
        "design_kind": design_kind,
        "table_provenance": {
            "caption": candidate.get("caption"),
            "row": (candidate.get("outcome_cell") or {}).get("cell_verbatim"),
            "column": f"{ingredient.get('column')} | {control.get('column')}",
        },
    }
    provenance = expected["table_provenance"]
    if not all(isinstance(provenance.get(k), str) and provenance[k]
               for k in ("caption", "row", "column")):
        return None, "candidate provenance is incomplete"
    for key, value in expected.items():
        if selected.get(key) != value:
            return None, f"selector field {key} disagrees with candidate"
    if selected.get("refusal_reason") is not None:
        return None, "selector returned a selection with refusal metadata"

    # Existing non-null facts are immutable.  This includes the two fields
    # below: selecting a table cannot silently change an S5-reported estimate.
    expected.update({"estimate_kind": "mean_difference",
                     "estimate_basis": "derived_from_arms"})
    for key, value in expected.items():
        if claim.get(key) is not None and claim.get(key) != value:
            return None, f"existing claim field {key} disagrees"
    return expected, None


def _shadow_enrich_claims(out: dict, record: dict, call) -> None:
    """Run the v13 selector after the normal per-study calls, never in prod."""
    from pipeline.effect_harvest import harvest_candidates

    s1 = out.get("S1") if isinstance(out.get("S1"), dict) else {}
    s3 = out.get("S3") if isinstance(out.get("S3"), dict) else {}
    aliases, alias_reason, selected_roles = _shadow_arm_aliases(
        s3, record.get("ingredient"))
    claims = ((out.get("S5") or {}).get("claims")) or []
    audit = {"enabled": True, "selector_calls": 0, "claims": []}
    try:
        # SHADOW-ONLY structured tables: colspan/rowspan-expanded with merged
        # multi-row headers (sources/fulltext.extract_tables_structured), so
        # arm columns survive layouts the flat S5 serialisation cannot carry.
        # _tables_text stays untouched for S5 payloads (LLM cache stability);
        # it remains the fallback when structured parsing yields nothing.
        tables = _tables_structured(record) or _tables_text(record)
    except Exception as exc:
        tables = []
        table_error = str(exc)
    else:
        table_error = None

    # This role map is retained only in local validation state.  It prevents
    # role assignment from candidate order.
    role_facts = None
    if aliases:
        # Derive roles from the same explicit boolean facts, never from alias
        # insertion order or candidate arm order.
        # Use the exact pair selected by _shadow_arm_aliases; rebuilding this
        # from the first non-control arm breaks when an ignored arm precedes the
        # ingredient-alone arm.
        role_facts = dict(selected_roles or {})
    for claim_index, claim in enumerate(claims):
        item = {"claim_index": claim_index, "candidate_count": 0}
        if not isinstance(claim, dict):
            item.update({"status": "refused", "reason": "claim is malformed"})
            audit["claims"].append(item)
            continue
        terms = [claim.get(key) for key in ("outcome_raw", "measure")
                 if isinstance(claim.get(key), str) and claim.get(key).strip()]
        try:
            candidates = harvest_candidates(tables, terms, aliases or {})
            candidate_dicts = [candidate.to_dict() for candidate in candidates]
        except Exception as exc:
            # A broken table parser is an audit failure, not a reason to lose
            # the ordinary S5 claim or skip S6 for this study.
            error = str(exc) or exc.__class__.__name__
            item.update({"status": "failed", "stage": "harvester",
                         "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "harvester", "error": error})
            audit["claims"].append(item)
            continue
        item["candidate_count"] = len(candidate_dicts)
        if not candidates or not aliases:
            item.update({"status": "refused", "reason": alias_reason
                         if not aliases else "no deterministic table candidates"})
            audit["claims"].append(item)
            continue
        payload = {"S5_CLAIM": dict(claim), "CANDIDATES": candidate_dicts,
                   "S1_DESIGN_FACTS": s1, "S3_ARM_FACTS": s3.get("arms") or []}
        audit["selector_calls"] += 1
        try:
            selected, meta = call("S5T", payload)
        except Exception as exc:
            # Selector failures are isolated to this claim.  Only an explicit
            # quota signal is promoted to the corpus retry convention.
            error = str(exc) or exc.__class__.__name__
            item.update({"status": "failed", "stage": "selector",
                         "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "selector", "error": error})
            if _quota_signal(error):
                out["_quota_exhausted"] = error
                out.setdefault("_failed", []).append(
                    {"agent": "S5T", "error": error})
            audit["claims"].append(item)
            continue
        item["selector_result"] = selected
        item["selector_meta"] = meta
        # A schema-valid envelope can still contain a null result.  That is a
        # selector/adapter failure, not an evidence refusal: retain its error
        # channel for audit and do not pretend the table was inspected.
        if selected is None:
            error = (meta.get("error") if isinstance(meta, dict) else None) or \
                    "selector returned no result"
            error = str(error)
            item.update({"status": "failed", "stage": "selector", "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "selector", "error": error})
            if _quota_signal(error):
                out["_quota_exhausted"] = error
                out.setdefault("_failed", []).append(
                    {"agent": "S5T", "error": error})
            audit["claims"].append(item)
            continue
        # Inspect ONLY the error channel. Stringifying the whole metadata
        # mapping classified benign fields ({"rate_limit_remaining": 100}) as
        # quota exhaustion, discarding a valid selector result and requeuing
        # the study forever (second runtime review, 2026-08-23).
        meta_error = meta.get("error") if isinstance(meta, dict) else None
        if meta_error is not None and _quota_signal(meta_error):
            error = str(meta_error) or "S5T quota limit"
            item.update({"status": "failed", "stage": "selector",
                         "error": error})
            audit.setdefault("failures", []).append(
                {"claim_index": claim_index, "stage": "selector", "error": error})
            out["_quota_exhausted"] = error
            out.setdefault("_failed", []).append(
                {"agent": "S5T", "error": error})
            audit["claims"].append(item)
            continue
        enriched, reason = _shadow_validate_selection(
            claim, candidate_dicts, selected, s1, role_facts)
        if enriched is None:
            item.update({"status": "refused", "reason": reason})
        else:
            claim.update(enriched)
            item["status"] = "enriched"
        audit["claims"].append(item)
    if alias_reason:
        audit["alias_refusal"] = alias_reason
    if table_error:
        audit["table_error"] = table_error
    out["_v13_shadow"] = audit


def _self_check_v13_shadow_wiring() -> None:
    """Offline contract checks for the shadow boundary (never run on import)."""
    from unittest.mock import patch

    tables = [{"caption": "Table 1",
               "columns": ["Outcome", "Creatine (n=20)", "Placebo (n=19)"],
               "rows": [["Strength", "10.2 +/- 2.1", "8.4 +/- 2.0"]]}]
    record = {"ingredient": "creatine", "title": "Creatine supplement trial",
              "abstract": "oral creatine supplement"}
    text = "x" * MIN_TEXT_CHARS
    mode = "valid"
    # Label-only aliases cover real short headers and conservatively refuse
    # ingredient-plus-protein ambiguity in a multi-arm trial.
    cr_aliases, cr_reason, cr_roles = _shadow_arm_aliases({
        "comparator": "ingredient_free", "ingredient_isolated": "yes",
        "arms": [{"label": "Creatine (0.2 g/kg)", "is_control": False},
                 {"label": "Placebo (Resistant Dextrin, 0.2 g/kg)", "is_control": True}]},
        "creatine")
    assert cr_reason is None and "cr" in [x.casefold() for x in cr_aliases["Creatine (0.2 g/kg)"]]
    # Prefixes are compared against every S3 label, not only the selected pair.
    _, crinine_reason, _ = _shadow_arm_aliases({
        "comparator": "ingredient_free", "ingredient_isolated": "yes",
        "arms": [{"label": "Creatine", "is_control": False},
                 {"label": "Creatinine", "is_control": True}]}, "creatine")
    assert crinine_reason and "prefix" in crinine_reason
    _, ignored_prefix_reason, _ = _shadow_arm_aliases({
        "comparator": "ingredient_free", "ingredient_isolated": "yes",
        "arms": [{"label": "Placebogenic", "is_control": False},
                 {"label": "Creatine", "is_control": False},
                 {"label": "Placebo", "is_control": True}]}, "creatine")
    assert ignored_prefix_reason and "prefix" in ignored_prefix_reason
    _, control_token_reason, _ = _shadow_arm_aliases({
        "comparator": "ingredient_free", "ingredient_isolated": "yes",
        "arms": [{"label": "Creatine", "is_control": False},
                 {"label": "Placebo (creatine-free)", "is_control": True}]}, "creatine")
    assert control_token_reason and "ingredient token" in control_token_reason
    amb, amb_reason, amb_roles = _shadow_arm_aliases({
        "comparator": "ingredient_free", "ingredient_isolated": "yes",
        "arms": [{"label": "Creatine", "is_control": False},
                 {"label": "Creatine+Protein", "is_control": False},
                 {"label": "Placebo", "is_control": True}]}, "creatine")
    assert amb is None and "multiple ingredient arms" in amb_reason
    four, four_reason, four_roles = _shadow_arm_aliases({
        "comparator": "ingredient_free", "ingredient_isolated": "yes",
        "arms": [{"label": "Creatine", "is_control": False},
                 {"label": "Creatine+Protein", "is_control": False},
                 {"label": "Placebo", "is_control": True},
                 {"label": "Other", "is_control": False}]}, "creatine")
    assert four is None and four_reason and "multiple ingredient arms" in four_reason

    def fake_call(agent, payload):
        calls.append(agent)
        if agent == "S1":
            return {"design_rank": 4, "design_label": "RCT", "design_kind": "parallel",
                    "confidence": 1, "rationale": "fixture"}, {}
        if agent == "S3":
            arms = [{"label": "Creatine", "is_control": False},
                    {"label": "Placebo", "is_control": True}]
            if mode == "multi-arm":
                arms.append({"label": "Other", "is_control": False})
            elif mode == "reordered":
                arms = [{"label": "Other", "is_control": False},
                        {"label": "Creatine", "is_control": False},
                        {"label": "Placebo", "is_control": True}]
            comparator = "ingredient_free"
            isolated = "yes"
            if mode == "blend":
                comparator = "all_arms_get_ingredient"
            elif mode == "unknown":
                comparator = "unknown"
            elif mode == "not-isolated":
                isolated = "no"
            return {"arms": arms, "comparator": comparator,
                    "ingredient_isolated": isolated}, {}
        if agent == "S5":
            return {"claims": [{"outcome_raw": "Strength", "measure": None,
                                 "direction": "benefit", "is_primary_outcome": True,
                                 "evidence_span": "fixture", "estimand": "endpoint",
                                 "timepoint": "post"}]}, {}
        if agent == "S5T":
            candidate = payload["CANDIDATES"][0]
            arms = {a["arm_alias"]: a for a in candidate["arms"]}
            result = {"selected_candidate_index": 0,
                      "n_ingredient": arms["Creatine"]["n"],
                      "n_control": arms["Placebo"]["n"],
                      "mean_ingredient": arms["Creatine"]["mean"],
                      "mean_control": arms["Placebo"]["mean"],
                      "sd_ingredient": arms["Creatine"]["sd"],
                      "sd_control": arms["Placebo"]["sd"],
                      "estimand": "endpoint", "timepoint": "post",
                      "design_kind": "parallel",
                      "table_provenance": {"caption": "Table 1", "row": "Strength",
                                           "column": "Creatine (n=20) | Placebo (n=19)"},
                      "refusal_reason": None}
            if mode == "malicious":
                result["mean_ingredient"] = 999
            elif mode == "bool-number":
                result["mean_ingredient"] = True
            elif mode == "missing-key":
                result.pop("table_provenance")
            elif mode == "extra-key":
                result["unexpected"] = "nope"
            elif mode == "selector-exception":
                raise RuntimeError("ordinary selector failure")
            elif mode == "selector-quota":
                raise RuntimeError("rate limit exceeded")
            return result, {}
        if agent == "S6B":
            return {"mappings": []}, {}
        return {}, {}

    def run(shadow, fixture_mode):
        nonlocal mode
        mode = fixture_mode
        calls.clear()
        with patch.dict(os.environ, {"SP_V13_SHADOW": "1"} if shadow else {},
                        clear=not shadow), patch.object(
                            __import__(__name__), "_tables_text",
                            lambda _: tables), patch.object(
                            __import__(__name__), "_tables_structured",
                            lambda _: []):
            return extract_study(record, text, call=fake_call, max_workers=5)

    calls = []
    valid = run(True, "valid")
    assert valid["S5"]["claims"][0]["estimate_kind"] == "mean_difference"
    assert "S5T" in calls
    malicious = run(True, "malicious")
    assert "estimate_kind" not in malicious["S5"]["claims"][0]
    assert malicious["_v13_shadow"]["claims"][0]["status"] == "refused"
    multi = run(True, "multi-arm")
    assert "S5T" in calls and multi["_v13_shadow"]["selector_calls"] == 1
    reordered = run(True, "reordered")
    assert reordered["S5"]["claims"][0]["estimate_kind"] == "mean_difference"
    assert reordered["_v13_shadow"]["claims"][0]["status"] == "enriched"
    for refusal_mode in ("blend", "unknown", "not-isolated"):
        refused = run(True, refusal_mode)
        assert "S5T" not in calls
        assert "alias_refusal" in refused["_v13_shadow"]
    for malformed_mode in ("missing-key", "extra-key", "bool-number"):
        malformed = run(True, malformed_mode)
        assert malformed["_v13_shadow"]["claims"][0]["status"] == "refused"
        assert "estimate_kind" not in malformed["S5"]["claims"][0]
    selector_failed = run(True, "selector-exception")
    assert "S6B" in calls and not any(
        f.get("agent") == "S5T" for f in selector_failed.get("_failed", []))
    assert selector_failed["_v13_shadow"]["failures"][0]["stage"] == "selector"
    selector_quota = run(True, "selector-quota")
    assert selector_quota.get("_quota_exhausted")
    assert any(f.get("agent") == "S5T"
               for f in selector_quota.get("_failed", []))
    assert "S6B" in calls
    off = run(False, "valid")
    off_again = run(False, "valid")
    assert "S1" not in calls and "S5T" not in calls
    assert "_v13_shadow" not in off and off == off_again

    # Structured table extraction (shadow-only path): colspan/rowspan headers
    # merge into composite column labels; the flat extract_tables output is
    # deliberately untouched (S5 payload / LLM-cache stability).
    from sources.fulltext import extract_tables_structured
    xml = (
        '<article><body><table-wrap><label>Table 2</label>'
        '<caption><p>Values are mean (SD).</p></caption>'
        '<table><thead>'
        '<tr><th rowspan="2">Outcome</th><th colspan="2">Creatine</th>'
        '<th colspan="2">Placebo</th></tr>'
        '<tr><th>Pre</th><th>Post</th><th>Pre</th><th>Post</th></tr>'
        '</thead><tbody>'
        '<tr><td>Muscle strength</td><td>10.1 (2.0)</td><td>12.2 (2.2)</td>'
        '<td>10.0 (2.1)</td><td>10.4 (2.3)</td></tr>'
        '</tbody></table></table-wrap></body></article>'
    )
    structured = extract_tables_structured(xml)
    assert structured and structured[0]["columns"] == [
        "Outcome", "Creatine — Pre", "Creatine — Post",
        "Placebo — Pre", "Placebo — Post"]
    assert structured[0]["rows"][0][0] == "Muscle strength"
    # A multi-timepoint grid yields one candidate per identical qualifier
    # pair ('Creatine — Pre' with 'Placebo — Pre', never Pre with Post), and
    # the harvester still asserts nothing about what the qualifier means:
    # candidate timepoint/endpoint stay None, the qualifier is only visible
    # in column provenance for the selector + validator to judge.
    from pipeline.effect_harvest import harvest_candidates
    grid_tables = [{"caption": "Table 2 — Values are mean (SD).",
                    "columns": structured[0]["columns"],
                    "rows": structured[0]["rows"]}]
    grid_cands = harvest_candidates(grid_tables, "muscle strength",
                                    {"Creatine": ["Creatine"],
                                     "Placebo": ["Placebo"]})
    assert len(grid_cands) == 2
    pair_columns = {tuple(a.column for a in c.arms) for c in grid_cands}
    assert pair_columns == {("Creatine — Pre", "Placebo — Pre"),
                            ("Creatine — Post", "Placebo — Post")}
    assert all(c.timepoint is None and c.endpoint_kind is None
               for c in grid_cands)
    # A single-header-row structured table with a mean (SD) declaration DOES
    # harvest — the coverage win this path exists for.
    xml_simple = (
        '<article><body><table-wrap><label>Table 3</label>'
        '<caption><p>Data are mean (SD).</p></caption>'
        '<table><thead>'
        '<tr><th>Outcome</th><th>Creatine (n=20)</th><th>Placebo (n=19)</th></tr>'
        '</thead><tbody>'
        '<tr><td>1RM bench press</td><td>82.1 (5.2)</td><td>79.9 (4.8)</td></tr>'
        '</tbody></table></table-wrap></body></article>'
    )
    simple = extract_tables_structured(xml_simple)
    simple_tables = [{"caption": "Table 3 — Data are mean (SD).",
                      "columns": simple[0]["columns"],
                      "rows": simple[0]["rows"]}]
    got = harvest_candidates(simple_tables, "1RM bench press (kg)",
                             {"Creatine": ["Creatine"], "Placebo": ["Placebo"]})
    assert len(got) == 1 and got[0].arms[0].mean == 82.1 and got[0].arms[0].sd == 5.2
    assert got[0].arms[0].n == 20 and got[0].arms[1].n == 19


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
    shadow = _v13_shadow_enabled()
    agents = (("S1",) + PER_STUDY) if shadow else PER_STUDY

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {agent: pool.submit(
                       call, agent,
                       _payload(agent, record, text, registry, sections))
                   for agent in agents}
        for agent, fut in futures.items():
            result, meta = fut.result()
            out[agent] = result
            out.setdefault("_meta", {})[agent] = meta
            if result is None:
                # PRODUCTION PATH: byte-for-byte the pre-shadow behavior.
                # The widened _quota_signal regex must not leak here -- with
                # SP_V13_SHADOW unset this loop's output must exactly match
                # v12 (default-off parity, second runtime review 2026-08-23).
                err = str(meta.get("error") or "").lower()
                if any(k in err for k in ("session limit", "usage limit", "rate limit")):
                    out["_quota_exhausted"] = meta.get("error")
                out.setdefault("_failed", []).append(
                    {"agent": agent, "error": meta.get("error")})

    if shadow:
        _shadow_enrich_claims(out, record, call)

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

    # Bounded submission instead of submit-everything: quota-hit studies are
    # requeued and the run PAUSES until the subscription window resets, instead
    # of burning the rest of the corpus against a closed door (2026-08-10:
    # 364 of 906 calls lost exactly that way).
    pending: deque[int] = deque(range(n))
    quota_waited = 0.0
    resume_at = 0.0
    requeued = 0

    def _submit(pool, future_map):
        while pending and len(future_map) < max_studies_in_flight:
            i = pending.popleft()
            r = records[i]
            fut = pool.submit(
                extract_study, r, text_for(r),
                registry_for(r) if registry_for else None, call=call,
                outcome_allowlist=outcome_allowlist,
                sections=sections_for(r) if sections_for else None,
            )
            future_map[fut] = i

    with ThreadPoolExecutor(max_workers=max_studies_in_flight) as pool:
        future_map: dict = {}
        _submit(pool, future_map)
        while future_map or pending:
            if not future_map:
                # Everything in flight was requeued for quota; wait out the
                # window before probing again.
                delay = max(0.0, resume_at - time.time())
                if delay:
                    print(f"  QUOTA PAUSE: sleeping {delay:.0f}s "
                          f"(total waited {quota_waited:.0f}/{QUOTA_MAX_WAIT_S}s, "
                          f"{len(pending)} studies queued)")
                    time.sleep(delay)
                _submit(pool, future_map)
                continue
            done_set, _ = _fwait(set(future_map), return_when=FIRST_COMPLETED)
            for fut in done_set:
                i = future_map.pop(fut)
                r = records[i]
                try:
                    extraction = fut.result()
                except Exception as e:
                    extraction = {"_failed": [{"agent": "*", "error": str(e)}], "outcomes": []}
                if _hit_quota(extraction) and quota_waited < QUOTA_MAX_WAIT_S:
                    # Requeue the STUDY and schedule a pause. Extending the
                    # deadline on every hit is correct: concurrent in-flight
                    # studies failing against the same closed window each land
                    # here within seconds and should not stack extra waits.
                    pending.append(i)
                    requeued += 1
                    if time.time() >= resume_at:
                        resume_at = time.time() + QUOTA_WAIT_S
                        quota_waited += QUOTA_WAIT_S
                        print(f"  QUOTA HIT on {r.get('canonical_id', '?')}: "
                              f"requeued; run will pause {QUOTA_WAIT_S}s once "
                              f"in-flight studies drain "
                              f"(requeues so far: {requeued})")
                    continue
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
            if pending and future_map:
                # Refill only when not inside a quota window; if a pause is
                # scheduled, let the in-flight studies drain first so the sleep
                # happens in one block at the top of the loop.
                if time.time() >= resume_at:
                    _submit(pool, future_map)

    if requeued:
        print(f"  quota recovery: {requeued} requeue(s), "
              f"{quota_waited:.0f}s total pause budget consumed")

    if relevance_skip:
        print(f"  relevance gate skipped {relevance_skip}/{n} "
              f"(not oral/supplement intervention — no agent spend)")
    return [results_by_id[i] for i in range(n)]
