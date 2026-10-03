"""
Extraction stage: synthetic (--wiring), Grok or Claude production, then the
optional SR-table inheritance (--with-sr). The model is reached only through
the adapter `call` injected here (CLAUDE.md invariant 1). Moved out of
run_pipeline.py on 2026-10-03 (helpers verbatim); tests/test_sr_wiring.py pins
this file's backend branches by AST.
"""
from __future__ import annotations

import json
import os
from collections import Counter as _Counter

from pipeline import vocab

from bsproof.run.corpus import _best_text, _sections, stratify_targets

DEFAULT_WIRING_SCORE_CAP = 40
SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"
GROK_STUDIES_IN_FLIGHT = int(os.environ.get("SP_GROK_STUDIES_IN_FLIGHT", "32"))
# A CEILING, not a budget: extraction stops itself when reviews stop naming
# trials we have not seen (synthesis_bridge marginal-yield stopping).
MAX_SRS = int(os.environ.get("SP_MAX_SRS", "60"))

def synthetic_extraction(record: dict, axes: dict) -> dict:
    return {
        "S3": {"n_randomised": 100, "population_axes": axes},
        "S4": {"item1_randomisation_method": 1, "item2_double_blind_placebo": 1,
               "item3_prospective_registration": None,
               "item4_outcome_matches_registry": None,
               "item5_attrition_ok": None, "item6_itt": 1},
        "S7": {"form_vocab_id": None},
        "S8": {"funding_class": "undisclosed"},
        "outcomes": [
            {"claim": {"direction": "benefit", "magnitude": None},
             "outcome_vocab_id": "sleep_onset", "discarded": False},
            {"claim": {"direction": "null_effect", "magnitude": None},
             "outcome_vocab_id": "anxiety", "discarded": False},
        ],
    }


def _report_failures(raw: list[dict]) -> None:
    failed = [r for r in raw if r["extraction"].get("_failed")]
    if failed:
        n = sum(len(r["extraction"]["_failed"]) for r in failed)
        print(f"  !! {n} subagent calls FAILED across {len(failed)} studies")
    skipped = [r for r in raw if r["extraction"].get("_skipped")]
    if skipped:
        rel = sum(1 for r in skipped
                  if str(r["extraction"].get("_skipped", "")).startswith("relevance:"))
        print(f"  skipped {len(skipped)}/{len(raw)} "
              f"(relevance gate: {rel}, no text / other: {len(skipped) - rel})")


def _agent_stats(raw: list[dict]) -> dict:
    stats: dict[str, dict[str, int]] = {}
    for r in raw:
        ext = r.get("extraction") or {}
        if ext.get("_skipped"):
            continue
        meta = ext.get("_meta") or {}
        failed_agents = {f.get("agent") for f in (ext.get("_failed") or [])}
        for agent, m in meta.items():
            if agent.startswith("_"):
                continue
            bucket = stats.setdefault(agent, {"ok": 0, "fail": 0, "cache": 0,
                                              "errors": {}})
            if agent in failed_agents or m.get("error"):
                bucket["fail"] += 1
                why = str(m.get("error") or "")[:90] or "unknown"
                bucket["errors"][why] = bucket["errors"].get(why, 0) + 1
            else:
                bucket["ok"] += 1
            if m.get("cached"):
                bucket["cache"] += 1
        for f in (ext.get("_failed") or []):
            agent = f.get("agent") or "?"
            if agent not in meta:
                bucket = stats.setdefault(agent, {"ok": 0, "fail": 0, "cache": 0,
                                              "errors": {}})
                bucket["fail"] += 1
    return stats


def _span(v, cap: int = 240) -> str | None:
    """One evidence span, truncated. Spans are quotes from the paper, not ours."""
    if v is None:
        return None
    s = str(v)
    return s[:cap]


def _spans(v, n: int = 8, cap: int = 240) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x)[:cap] for x in v[:n] if x is not None]


def _study_extraction(ext: dict) -> dict | None:
    """
    The per-study extraction payload the dashboard shows to REVIEWERS.

    FOUNDER DECISION 2026-08-12: verbatim evidence spans are now exported. The
    dashboard is an internal calibration instrument behind Vercel auth, and the
    quote each subagent extracted its answer from is the single most useful
    field for a scientist verifying extraction against the paper. This
    deliberately amends the earlier "no raw extraction text" allowlist policy;
    what stays out is unchanged -- prompts, cache keys, model envelopes, and the
    private `_meta`/`_failed` bookkeeping.

    ALLOWLIST, not passthrough: every exported key is named here, so a new
    extraction field never leaks to the site by default.
    """
    if not ext or ext.get("_skipped"):
        return None
    s3, s4, s7, s8 = (ext.get(k) or None for k in ("S3", "S4", "S7", "S8"))
    claims = []
    for o in ext.get("outcomes") or []:
        cl = o.get("claim") or {}
        claims.append({
            "outcome_vocab_id": o.get("outcome_vocab_id"),
            "discarded": bool(o.get("discarded")),
            "outcome_raw": _span(cl.get("outcome_raw"), 120),
            "measure": _span(cl.get("measure"), 80),
            "direction": cl.get("direction"),
            "magnitude": cl.get("magnitude"),
            "effect_size": cl.get("effect_size"),
            "effect_unit": _span(cl.get("effect_unit"), 60),
            "effect_favours": cl.get("effect_favours"),
            "effect_sd": cl.get("effect_sd"),
            "effect_sd_basis": cl.get("effect_sd_basis"),
            "ci_low": cl.get("ci_low"),
            "ci_high": cl.get("ci_high"),
            "p_value": cl.get("p_value"),
            "is_primary_outcome": cl.get("is_primary_outcome"),
            "contrast": cl.get("contrast"),
            "evidence_span": _span(cl.get("evidence_span")),
            # Evidence method v2 (2026-10-03): the arm-level facts pooling needs.
            # Until then this projection dropped them, so a retained run could
            # not be re-pooled without re-extraction.
            **{k: cl.get(k) for k in (
                "estimate_kind", "estimate_basis", "estimand", "design_kind",
                "n_ingredient", "n_control", "mean_ingredient", "mean_control",
                "sd_ingredient", "sd_control", "standard_error", "ci_level",
                "p_value_kind", "p_operator")},
            "timepoint": _span(cl.get("timepoint"), 120),
            "ingredient_arm": _span(cl.get("ingredient_arm"), 120),
            "control_arm": _span(cl.get("control_arm"), 120),
            "table_provenance": cl.get("table_provenance"),
            "numbers_v2": o.get("numbers_v2"),
        })
    return {
        "s3": None if not s3 else {
            "population_axes": s3.get("population_axes"),
            "population_text": _span(s3.get("population_text")),
            "n_randomised": s3.get("n_randomised"),
            "n_analysed": s3.get("n_analysed"),
            "duration_days": s3.get("duration_days"),
            "comparator": s3.get("comparator"),
            "ingredient_isolated": s3.get("ingredient_isolated"),
            "self_declared_underpowered": s3.get("self_declared_underpowered"),
            "deficiency_status": s3.get("deficiency_status"),
            "registration_id": _span(s3.get("registration_id"), 60),
            "evidence_spans": _spans(s3.get("evidence_spans")),
            "arms": [{"label": _span(a.get("label"), 120), "n": a.get("n"),
                      "is_control": a.get("is_control"),
                      "target_ingredient_presence": a.get("target_ingredient_presence")}
                     for a in (s3.get("arms") or []) if isinstance(a, dict)],
        },
        "s4": None if not s4 else {
            **{f"item{i}_{n}": s4.get(f"item{i}_{n}") for i, n in (
                (1, "randomisation_method"), (2, "double_blind_placebo"),
                (3, "prospective_registration"), (4, "outcome_matches_registry"),
                (5, "attrition_ok"), (6, "itt"))},
            "unverifiable_items": s4.get("unverifiable_items"),
            "evidence_spans": _spans(s4.get("evidence_spans")),
        },
        "s5_claims": claims,
        "s7": None if not s7 else {
            "form_vocab_id": s7.get("form_vocab_id"),
            "form_raw": _span(s7.get("form_raw"), 120),
            "salt_family": s7.get("salt_family"),
            "elemental_dose_mg": s7.get("elemental_dose_mg"),
            "compound_dose_mg": s7.get("compound_dose_mg"),
            "dose_per_kg_mg": s7.get("dose_per_kg_mg"),
            "mean_body_mass_kg": s7.get("mean_body_mass_kg"),
            "dose_basis": s7.get("dose_basis"),
            "dose_frequency_per_day": s7.get("dose_frequency_per_day"),
            "confidence": s7.get("confidence"),
            "evidence_span": _span(s7.get("evidence_span")),
        },
        "s8": None if not s8 else {
            "funding_class": s8.get("funding_class"),
            "funder_names": s8.get("funder_names"),
            "author_coi": s8.get("author_coi"),
            "supplies_donated_by_industry": s8.get("supplies_donated_by_industry"),
            "evidence_span": _span(s8.get("evidence_span")),
        },
    }


def _studies_list(raw: list[dict]) -> list[dict]:
    out = []
    for r in raw:
        rec = r.get("record") or {}
        ext = r.get("extraction") or {}
        out.append({
            "title": rec.get("title"),
            "year": rec.get("year"),
            "doi": rec.get("doi"),
            "pmid": rec.get("pmid"),
            "canonical_id": rec.get("_canonical") or rec.get("canonical_id"),
            "journal": rec.get("journal") or rec.get("journal_name"),
            "oa": rec.get("oa"),
            "predatory_venue": bool(rec.get("predatory_venue")),
            "skipped": bool(ext.get("_skipped")),
            "skip_reason": ext.get("_skipped"),
            "failed_partial": bool(ext.get("_failed")),
            "extraction": _study_extraction(ext),
        })
    return out



def extract_stage(store, opts, primaries, pv, outcome_allowlist, run_context):
    """Return (extractions, prompt_version, tag, syntheses_for_score, sr_derived),
    or an int exit code when the run cannot continue."""
    wiring, grok, limit, scope = opts.wiring, opts.grok, opts.limit, opts.scope
    ingredient, with_sr = opts.ingredient, opts.with_sr
    call_fn = None
    raw: list[dict] = []
    syntheses_for_score: list = []
    sr_derived: list[dict] = []

    if wiring:
        axes = {a: pv[a] for a in vocab.AXES}
        extractions = [{
            "record": {**p, "_canonical": p["canonical_id"], "ingredient": ingredient},
            "registry": store.registry_facts(p["registration_id"])
                        if p.get("registration_id") else None,
            "extraction": synthetic_extraction(p, axes),
        } for p in primaries[:DEFAULT_WIRING_SCORE_CAP]]
        prompt_version = SYNTHETIC_VERSION
        tag = "SYNTHETIC "
        run_context["studies_targeted"] = len(extractions)
        run_context["studies_ok"] = len(extractions)
    else:
        from bsproof import workers
        if grok:
            from bsproof import grok_adapter as ga
            ga.reset_stats()
            if not ga.preflight():
                return 1
            if not primaries:
                print("No RCTs left after relevance / OA filters.")
                return 1
            effective = len(primaries) if limit is None else min(limit, len(primaries))
            print("\n" + "-" * 68)
            print("GROK MODE")
            print(f"  scope: {scope}")
            print(f"  studies in flight: {GROK_STUDIES_IN_FLIGHT}")
            print(f"  concurrent grok CLI: {ga.MAX_CONCURRENCY}")
            print(f"  batch size (extract): {effective}"
                  + ("  (FULL corpus)" if limit is None else ""))
            if outcome_allowlist:
                print(f"  showcase top-{len(outcome_allowlist)} by RCT count: "
                      + ", ".join(outcome_allowlist))
            else:
                print("  showcase: OFF (full outcome vocabulary)")
            print("-" * 68)
            call_fn = ga.call
            prompt_version = f"{ga.PROMPT_VERSION}+{ga.PROVENANCE}"
            tag = "GROK "
            in_flight = GROK_STUDIES_IN_FLIGHT
            # Do NOT collapse limit to a number here: None is what tells
            # the run (and the report) that this was the FULL corpus and
            # not a sample, which changes how the score may be read.
            run_context["concurrency"] = ga.MAX_CONCURRENCY
            run_context["studies_in_flight"] = in_flight
        else:
            # PRODUCTION. This branch used to live below in an `else:` of
            # its own, and it was a wiring-shaped stub rather than an
            # implementation: it passed `text_for=lambda r: title`, so every
            # subagent read the TITLE of the paper and nothing else. S5 was
            # asked what a trial concluded from its title, and correctly
            # answered {"claims": []}. It also ignored --limit, used
            # DEFAULT_WIRING_SCORE_CAP, and set none of the run_context keys
            # the report renders -- which is why production reports came out
            # empty and every run said "no scored outcomes".
            #
            # The pilot/grok path was the only real implementation. There is
            # no reason for a second one: the backends differ ONLY in which
            # `call` they inject, which is exactly what call_fn is for.
            # Merged 2026-08-09.
            from bsproof import claude_adapter as ca
            if not ca.preflight():
                return 1
            # EXPLICIT, not None. workers.extract_study defaults a None
            # call to claude_adapter.call, so for extraction the two are
            # identical
            # -- but the SR block below gates on `call_fn is not None`, so
            # None silently skipped SR inheritance on the one production
            # backend while the report still said `-sr`. Measured
            # 2026-08-25: two full --with-sr production runs reported
            # requested: 0, s2_ok: 0, resolved: 0 under an `sr` mode label,
            # and neither artifact could be retained.
            call_fn = ca.call
            prompt_version = ca.PROMPT_VERSION
            tag = ""
            in_flight = ca.MAX_CONCURRENCY
            ga = None
            run_context["concurrency"] = ca.MAX_CONCURRENCY
            run_context["studies_in_flight"] = in_flight

        if limit is None:
            targets = primaries
        elif scope == "per_outcome" and outcome_allowlist:
            targets = stratify_targets(primaries, outcome_allowlist, limit)
            _tagged = sum(1 for t in targets if t.get("retrieved_for"))
            print(f"  stratified selection: {_tagged}/{len(targets)} carry "
                  f"retrieved_for tags (round-robin across "
                  f"{len(outcome_allowlist)} outcomes)")
        else:
            targets = primaries[:limit]
        # Say what this will cost BEFORE spending it. ~10 model calls per
        # study, and about half are S6, which fires once per extracted claim.
        _calls = len(targets) * 10
        print(f"\n  EXTRACTING {len(targets)} studies"
              + ("  (FULL corpus — no --limit)" if limit is None
                 else f" of {len(primaries)} available  (--limit {limit})")
              + f"\n  ~{_calls} model calls at ~10/study; "
                f"S6 is about half of them (once per claim).")
        if limit is None and len(targets) > 200:
            print(f"  NOTE: {len(targets)} studies is a large run. "
                  f"Cap it with --limit N if this is a smoke test.")
        run_context["studies_targeted"] = len(targets)
        print(f"extracting {len(targets)} studies "
              f"(from {len(primaries)} relevance-filtered RCTs)...")
        raw = workers.extract_corpus(
            [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
             for p in targets],
            text_for=lambda r: _best_text(r),
            sections_for=lambda r: _sections(r),
            registry_for=lambda r: store.registry_facts(r["registration_id"])
                                   if r.get("registration_id") else None,
            call=call_fn,
            max_studies_in_flight=in_flight,
            outcome_allowlist=outcome_allowlist,
        )
        _report_failures(raw)
        run_context["studies_skipped"] = sum(
            1 for r in raw if r["extraction"].get("_skipped"))
        run_context["studies_failed_partial"] = sum(
            1 for r in raw if r["extraction"].get("_failed"))
        run_context["studies_ok"] = (
            len(raw) - run_context["studies_skipped"]
        )
        run_context["agent_stats"] = _agent_stats(raw)
        run_context["studies_list"] = _studies_list(raw)
        if grok:
            speed = ga.speed_report()
            print(speed)
            run_context["speed_report"] = speed
        extractions = [{
            "record": r["record"],
            "extraction": r["extraction"],
            "registry": store.registry_facts(r["record"].get("registration_id"))
                        if r["record"].get("registration_id") else None,
        } for r in raw if not r["extraction"].get("_skipped")]
        if not extractions:
            print("No study passed relevance + text checks.")
            return 1

        # Claim-level audit trail. The run report carries scores; it does not
        # carry the claims those scores were computed from, and "why is this
        # ECU negative" is unanswerable without them -- anchor #1 took a
        # re-run to diagnose for exactly this reason. Off by default; the
        # dump is the whole extraction, so it is written where asked, not
        # into reports/.
        _dump = os.environ.get("SP_DUMP_EXTRACTIONS")
        if _dump:
            try:
                with open(_dump, "w") as fh:
                    json.dump(extractions, fh, indent=1, default=str)
                print(f"  extractions dumped -> {_dump}")
            except Exception as e:
                print(f"  extraction dump failed: {e}")

        if with_sr and call_fn is not None:
            from pipeline.synthesis_bridge import build_syntheses_for_scoring
            run_context["sr"]["requested"] = MAX_SRS
            syntheses_for_score, _s2_batch, _all_rows = (
                build_syntheses_for_scoring(
                    store, call=call_fn, max_srs=MAX_SRS,
                    max_workers=min(6, GROK_STUDIES_IN_FLIGHT)))
            # Invariant 6 as amended 2026-08-08: the review adds no mass,
            # the trials it describes add themselves, once each, at
            # oa='sr_table'. This is the largest source of evidence we were
            # discarding -- trials whose own full text we cannot reach.
            from pipeline.synthesis_bridge import build_sr_derived
            sr_derived, sr_stats = build_sr_derived(
                _s2_batch, _all_rows, call=call_fn,
                outcome_allowlist=outcome_allowlist)
            run_context["sr"]["derived"] = sr_stats
            run_context["sr"]["s2_ok"] = sum(
                1 for s in syntheses_for_score if s)
            run_context["sr"]["resolved"] = sum(
                1 for s in syntheses_for_score if s.get("resolved"))
            # q_s now comes from a checklist about the REVIEW, so record the
            # checklist. A quality number with no visible basis is exactly
            # the kind of thing this pipeline exists to refuse.
            run_context["sr"]["review_bands"] = _Counter(
                (s.get("_review") or {}).get("band") for s in syntheses_for_score
                if s.get("resolved"))
            run_context["sr"]["overlap"] = [
                {"listed": (s.get("_resolution") or {}).get("n_listed"),
                 "in_corpus": (s.get("_resolution") or {}).get("n_resolved"),
                 "q_s": s.get("q_s")}
                for s in syntheses_for_score if s.get("resolved")]
    run_context["prompt_version"] = prompt_version

    # Token + cost accounting for the run report. On a subscription the
    # per-call spend is 0, so what the adapter reports is the API-EQUIVALENT
    # price of the same work -- the number that tells a reader what this
    # pipeline would cost metered. Both are carried; neither is called
    # "spent". Backends other than Claude leave this absent rather than
    # reporting a zero that looks measured.
    if not wiring and not grok:
        try:
            from bsproof import claude_adapter as _ca
            run_context["usage"] = _ca.USAGE.as_dict()
            run_context["models"] = dict(_ca.TIER_MODEL)
            run_context["agent_tiers"] = {a: t for a, (t, _s, _p)
                                          in _ca.AGENTS.items()}
        except Exception:
            pass
    return extractions, prompt_version, tag, syntheses_for_score, sr_derived
