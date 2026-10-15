"""
Extraction stage: synthetic (--wiring) or Claude production. The model is
reached only through the adapter `call` injected here (CLAUDE.md invariant 1).
Moved out of run_pipeline.py on 2026-10-03.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from pipeline import vocab

from bsproof.run.corpus import _best_text, _sections, stratify_targets

DEFAULT_WIRING_SCORE_CAP = 40
SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"
CHECKPOINTS = Path(__file__).resolve().parents[2] / "out" / "checkpoints"
# Exit code of a run that stopped on the subscription limit before writing any
# report: re-run the same command to resume.
EXIT_INCOMPLETE = 3


def _incomplete_quota(raw: list[dict]) -> list[str]:
    """Studies whose extraction still carries a subscription-limit failure
    after the corpus loop's own pause budget (SP_QUOTA_MAX_WAIT_S) ran out."""
    from bsproof.worker_quota import _hit_quota
    return [str(r["record"].get("canonical_id")) for r in raw if _hit_quota(r["extraction"])]

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
    """Return the extractions ([{record, extraction, registry}]), or an int exit
    code when the run cannot continue."""
    wiring, limit, scope, ingredient = opts.wiring, opts.limit, opts.scope, opts.ingredient

    if wiring:
        axes = {a: pv[a] for a in vocab.AXES}
        extractions = [{
            "record": {**p, "_canonical": p["canonical_id"], "ingredient": ingredient},
            "registry": store.registry_facts(p["registration_id"])
                        if p.get("registration_id") else None,
            "extraction": synthetic_extraction(p, axes),
        } for p in primaries[:DEFAULT_WIRING_SCORE_CAP]]
        run_context["prompt_version"] = SYNTHETIC_VERSION
        run_context["studies_targeted"] = len(extractions)
        run_context["studies_ok"] = len(extractions)
        return extractions

    from bsproof import claude_adapter as ca
    from bsproof import workers
    if not primaries:
        print("No RCTs left after relevance / OA filters.")
        return 1
    run_context["concurrency"] = ca.MAX_CONCURRENCY
    run_context["studies_in_flight"] = ca.MAX_CONCURRENCY

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
    # Say what this will cost BEFORE spending it: S3, S4, S5, S7, S8, S6B and
    # S5N, about 7 model calls per study.
    print(f"\n  EXTRACTING {len(targets)} studies"
          + ("  (FULL corpus — no --limit)" if limit is None
             else f" of {len(primaries)} available  (--limit {limit})")
          + f"\n  ~{len(targets) * 7} model calls at ~7/study")
    if limit is None and len(targets) > 200:
        print(f"  NOTE: {len(targets)} studies is a large run. "
              f"Cap it with --limit N if this is a smoke test.")
    run_context["studies_targeted"] = len(targets)
    checkpoint = CHECKPOINTS / f"{ingredient}_{opts.form}.json"
    if checkpoint.exists():
        try:
            prev = json.loads(checkpoint.read_text(encoding="utf-8"))
            print(f"  previous attempt ({prev.get('updated')}): "
                  f"{prev.get('studies_finished')}/{prev.get('studies_total')} studies finished "
                  f"{prev.get('by_status')} -- their model calls replay from cache")
        except (OSError, ValueError):
            pass
    raw = workers.extract_corpus(
        [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
         for p in targets],
        text_for=lambda r: _best_text(r),
        sections_for=lambda r: _sections(r),
        registry_for=lambda r: store.registry_facts(r["registration_id"])
                               if r.get("registration_id") else None,
        call=ca.call,
        max_studies_in_flight=ca.MAX_CONCURRENCY,
        outcome_allowlist=outcome_allowlist,
        checkpoint=checkpoint,
    )
    _report_failures(raw)
    cut = _incomplete_quota(raw)
    if cut and os.environ.get("SP_ALLOW_INCOMPLETE") != "1":
        # A run truncated by the limit must never reach reports/: failed calls
        # hide refusals and bias the result (CLAUDE.md "Extraction backends").
        # Nothing is lost -- finished calls are cached.
        print("\n" + "=" * 74 + f"\nINCOMPLETE: {len(cut)} studies still hit the usage limit "
              "after the pause budget.\nNo report was written. Re-run the SAME command after "
              "the limit resets to resume\n(finished calls replay from cache). "
              f"Progress: {checkpoint}\n" + "=" * 74)
        return EXIT_INCOMPLETE
    run_context["studies_skipped"] = sum(
        1 for r in raw if r["extraction"].get("_skipped"))
    run_context["studies_failed_partial"] = sum(
        1 for r in raw if r["extraction"].get("_failed"))
    run_context["studies_ok"] = len(raw) - run_context["studies_skipped"]
    run_context["agent_stats"] = _agent_stats(raw)
    run_context["studies_list"] = _studies_list(raw)
    extractions = [{
        "record": r["record"],
        "extraction": r["extraction"],
        "registry": store.registry_facts(r["record"].get("registration_id"))
                    if r["record"].get("registration_id") else None,
    } for r in raw if not r["extraction"].get("_skipped")]
    if not extractions:
        print("No study passed relevance + text checks.")
        return 1

    # The whole extraction, for auditing a result claim by claim. Off by
    # default; written where asked, not into reports/.
    _dump = os.environ.get("SP_DUMP_EXTRACTIONS")
    if _dump:
        try:
            with open(_dump, "w") as fh:
                json.dump(extractions, fh, indent=1, default=str)
            print(f"  extractions dumped -> {_dump}")
        except Exception as e:
            print(f"  extraction dump failed: {e}")

    run_context["prompt_version"] = ca.PROMPT_VERSION
    # Token + cost accounting for the run report. On a subscription the
    # per-call spend is 0, so what the adapter reports is the API-EQUIVALENT
    # price of the same work. Both are carried; neither is called "spent".
    run_context["usage"] = ca.USAGE.as_dict()
    run_context["models"] = dict(ca.TIER_MODEL)
    run_context["agent_tiers"] = {a: t for a, (t, _s, _p) in ca.AGENTS.items()}
    return extractions
