"""
Per-study workers. This file MAY call a model; `pipeline/` may not.
"""
from __future__ import annotations

import time
import os
import math
import re
import json
from collections import deque
from concurrent.futures import ThreadPoolExecutor, FIRST_COMPLETED, wait as _fwait

from bsproof import claude_adapter
from pipeline import vocab
from pipeline.relevance import relevance_check


# Split out 2026-10-03 (moved verbatim). Re-imported here so `workers.<name>`
# keeps resolving for run_pipeline, the selftest and the experiments.
from bsproof.worker_payload import (  # noqa: F401
    AGENT_BUDGET_TRIM, AGENT_SECTIONS, ELISION, PROMPT_BUDGET_CHARS,
    PROMPT_TOO_LONG_RETRY_CHARS, S7_TEXT_WALL, S7_TOTAL_WALL, _agent_text,
    _dose_snippets, _envelope_chars, _fit_text, _payload, _tables_structured,
    _tables_text,
)
from bsproof.worker_quota import (  # noqa: F401
    QUOTA_MAX_WAIT_S, QUOTA_WAIT_S, _QUOTA_STRINGS, _hit_quota, _quota_signal,
)
from bsproof.worker_shadow import (  # noqa: F401
    _SHADOW_NULL_ON_REFUSAL, _SHADOW_NUMERIC_KEYS, _SHADOW_SELECTION_KEYS,
    _shadow_arm_aliases, _shadow_enrich_claims, _shadow_validate_selection,
)

PER_STUDY = ("S3", "S4", "S5", "S7", "S8")
MIN_TEXT_CHARS = 200


def _v13_shadow_enabled() -> bool:
    """Return whether the experimental v13 wiring is explicitly enabled."""
    return os.environ.get("SP_V13_SHADOW", "0") == "1"


def _numeric_tables_enabled() -> bool:
    """The table route for arm-level numbers (S1 design facts + the S5T table
    selector, bsproof/worker_shadow.py). ON by default since 2026-10-03 for
    evidence method v2 (docs/EVIDENCE_METHOD.md §8 Phase 2); SP_NUMERIC_TABLES=0
    turns it off. It adds calls but no v14 score reads its fields."""
    return _v13_shadow_enabled() or os.environ.get("SP_NUMERIC_TABLES", "1") == "1"


def _second_reviewer_enabled() -> bool:
    """Evidence method v2 dual extraction (S5R, pipeline/review.py). OFF by
    default: it adds one call per study with poolable numbers, on a different
    and heavier model. SP_SECOND_REVIEWER=1 turns it on."""
    return os.environ.get("SP_SECOND_REVIEWER", "0") == "1"


def _second_review(out: dict, record: dict, text: str, sections: dict | None,
                   s3_facts: dict, call) -> None:
    """Send reviewer 2 every MAPPED claim whose span-verified numbers make an effect, in one
    call per study, and attach the reconciliation to each outcome's numbers_v2.
    Claims whose verified numbers make no effect are not sent."""
    from pipeline.review import effect_route, reconcile_study
    outcomes = out.get("outcomes") or []
    polarity = {o["id"]: o.get("polarity") for o in vocab.load("outcome")["outcomes"]}
    # Only claims whose verified numbers make an effect: a claim the pool would
    # refuse anyway has nothing worth a second reading (and costs a call).
    sent = {i for i, o in enumerate(outcomes)
            if not o.get("discarded") and effect_route(
                o.get("claim") or {}, (o.get("numbers_v2") or {}).get("verified") or {},
                polarity.get(o.get("outcome_vocab_id")))}
    reviews = None
    if sent:
        payload = _payload("S5R", record, text, None, sections, s3_facts=s3_facts)
        payload["claims"] = [{"index": i, **{k: outcomes[i]["claim"].get(k) for k in
                                             ("outcome_raw", "measure", "timepoint", "estimand",
                                              "ingredient_arm", "control_arm")}}
                             for i in sorted(sent)]
        try:
            result, meta = call("S5R", payload)
        except Exception as exc:
            result, meta = None, {"error": str(exc)}
        out.setdefault("_meta", {})["S5R"] = meta
        if result is None:
            # A failed review leaves every claim single-extracted; it never
            # passes as an agreement.
            err = str((meta or {}).get("error") or "")
            if any(k in err.lower() for k in ("session limit", "usage limit", "rate limit")):
                out["_quota_exhausted"] = err
            out.setdefault("_failed", []).append({"agent": "S5R", "error": err})
            sent = set()
        reviews = (result or {}).get("reviews")
    out["review_v2"] = {"sent": len(sent),
                        "adjudication": reconcile_study(outcomes, reviews, sent, polarity)}


def _verify_numbers(out: dict, record: dict) -> list[dict]:
    """Span-check every S5 claim's numbers (pipeline/span_check.py), by claim
    index. Deterministic; tables are fetched only when a claim cites one, and
    through the worker_payload MODULE so tests that patch it stay offline."""
    from pipeline.span_check import verify_claim_numbers
    from bsproof import worker_payload as _wp
    claims = ((out.get("S5") or {}).get("claims")) or []
    s3_arms = (out.get("S3") or {}).get("arms") if isinstance(out.get("S3"), dict) else None
    tables = None
    if any(isinstance(c, dict) and c.get("table_provenance") for c in claims):
        try:
            tables = _wp._tables_structured(record)
        except Exception:
            tables = None  # an unreadable table refuses its numbers; it never passes them
    return [verify_claim_numbers(c, tables=tables, s3_arms=s3_arms) if isinstance(c, dict)
            else {"verified": {}, "source": {}, "abs_only": [], "rejected": {"claim": "malformed"}}
            for c in claims]

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


def _self_check_v13_shadow_wiring() -> None:
    """Offline contract checks for the shadow boundary (never run on import)."""
    from unittest.mock import patch

    from bsproof import worker_payload as _wp
    from bsproof import worker_shadow as _ws

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
        # The table helpers are looked up in two modules since the 2026-10-03
        # split: worker_payload (via _payload) and worker_shadow (via
        # _shadow_enrich_claims). Patch both, or one path reads real tables.
        with patch.dict(os.environ, {"SP_V13_SHADOW": "1"} if shadow else
                        {"SP_NUMERIC_TABLES": "0"},
                        clear=not shadow), patch.object(
                            _wp, "_tables_text",
                            lambda _record, **_kw: tables), patch.object(
                            _wp, "_tables_structured",
                            lambda _record, **_kw: []), patch.object(
                            _ws, "_tables_text",
                            lambda _record, **_kw: tables), patch.object(
                            _ws, "_tables_structured",
                            lambda _record, **_kw: []):
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

    # S7 payload carries the paper's tables (v1.23): dosing protocols and the
    # baseline mean body mass live there, and the dose band was resting on one
    # dosed benefit trial without them. GUARANTEES under test:
    #   1. the fitted text is byte-identical with and without tables -- tables
    #      must never flip a study into _fit_text's full-text regime (measured
    #      2026-08-24: budget-counting them did exactly that for 32/156);
    #   2. the total (system+schema+snippets+fitted+tables+overhead) stays
    #      under the S7_TOTAL_WALL ceiling whenever tables ship;
    #   3. an ordinary paper actually ships its tables (the leftover-of-12k
    #      variant shipped tables to 1/156 studies, i.e. never).
    s7_tables = ["Table 1 — Baseline\nGroup | Body mass (kg)\nCreatine | 83.2 ± 9.8"]
    # Realistic maximal S3 arm overhead: the bugged total-wall arithmetic
    # omitted this entire serialized field (plus form vocabulary and JSON
    # encoding), undercounting a measured envelope by ~2.2k chars.
    s7_s3 = {"extraction_version": "v1.24", "arms": [
        {"label": f"Arm {i}", "role": "administered",
         "target_ingredient_presence": "yes" if i == 0 else "no",
         "evidenced_arm_text": "reported intervention arm " + "x" * 120,
         "active_cointerventions": []}
        for i in range(12)]}
    def s7_pay(text_body, tables_ret):
        with patch.object(_wp, "_tables_text",
                          lambda _record, cap_chars=4000, **_kw:
                          [t[:cap_chars] for t in tables_ret]):
            return _payload("S7", {"ingredient": "creatine",
                                   "title": "t", "pmcid": "PMC1"},
                            text_body, None, s3_facts=s7_s3)
    for body in ("creatine 5 g/day. " + "x" * 30000,
                 "creatine 5 g/day was given for 8 weeks."):
        pay_with, pay_without = s7_pay(body, s7_tables), s7_pay(body, [])
        assert pay_with["text"] == pay_without["text"]                    # 1
        if pay_with["tables"]:
            # COMPLETE serialized envelope, not the old approximation that
            # omitted form vocabulary, S3 facts and JSON encoding overhead.
            assert _envelope_chars("S7", pay_with) <= S7_TOTAL_WALL         # 2
        # With the strict v1.24 schema, a pathological oversized text may
        # consume the entire measured wall; ordinary short papers MUST still
        # ship tables. v1.24's larger prompt once made this permissive assertion
        # pass while zero tables shipped across the whole 156-study corpus.
        if len(body) < 1000:
            assert pay_with["tables"] == s7_tables                          # 3
        else:
            assert pay_with["tables"] in (s7_tables, [])


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
    tables_route = _numeric_tables_enabled()

    def run_agent(agent: str, *, facts: dict | None = None):
        payload = _payload(agent, record, text, registry, sections,
                           s3_facts=facts)
        result, meta = call(agent, payload)
        if (result is not None
                or str((meta or {}).get("error") or "").lower()
                != "exit 1: prompt is too long"):
            return result, meta
        original = payload.get("text")
        if not isinstance(original, str) or len(original) <= PROMPT_TOO_LONG_RETRY_CHARS:
            return result, meta
        room = PROMPT_TOO_LONG_RETRY_CHARS - len(ELISION)
        head = room // 2
        retry_payload = {**payload,
                         "text": (original[:head] + ELISION
                                  + original[-(room - head):])}
        retried, retry_meta = call(agent, retry_payload)
        retry_meta = dict(retry_meta or {})
        retry_meta.update({
            "prompt_too_long_retry": True,
            # The first attempt's literal error is preserved so the audit trail
            # never loses WHY a retry happened, even when the retry succeeds.
            "first_attempt_error": (meta or {}).get("error"),
            "original_text_chars": len(original),
            "retry_text_chars": len(retry_payload["text"]),
        })
        return retried, retry_meta

    def store(agent: str, result_meta):
        result, meta = result_meta
        out[agent] = result
        out.setdefault("_meta", {})[agent] = meta
        if result is None:
            err = str((meta or {}).get("error") or "").lower()
            if any(k in err for k in ("session limit", "usage limit", "rate limit")):
                out["_quota_exhausted"] = (meta or {}).get("error")
            out.setdefault("_failed", []).append(
                {"agent": agent, "error": (meta or {}).get("error")})

    # S3 is the dependency boundary: S5 and S7 receive its exact target arm
    # labels/facts. S4/S8 do not depend on it and run concurrently with the
    # dependent pair, preserving study-level throughput.
    try:
        store("S3", run_agent("S3"))
    except Exception as exc:
        store("S3", (None, {"error": str(exc)}))
    s3_facts = out.get("S3") if isinstance(out.get("S3"), dict) else {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {agent: pool.submit(run_agent, agent, facts=s3_facts)
                   for agent in (("S1", "S4", "S5", "S7", "S8")
                                 if tables_route else ("S4", "S5", "S7", "S8"))}
        for agent, fut in futures.items():
            try:
                store(agent, fut.result())
            except Exception as exc:
                store(agent, (None, {"error": str(exc)}))

    if tables_route:
        _shadow_enrich_claims(out, record, call)
    # Evidence method v2: which numbers are actually printed where the claim
    # says. Runs after the table route so its table-sourced values are checked
    # the same way. Attached to out["outcomes"][i] below.
    numbers = _verify_numbers(out, record)

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
        for i, (claim, (result, _meta)) in enumerate(mapped):
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
                "numbers_v2": numbers[i] if i < len(numbers) else None,
            })
    if _second_reviewer_enabled():
        _second_review(out, record, text, sections, s3_facts, call)
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
