#!/usr/bin/env python3
"""
End-to-end v1 run.

  python run_pipeline.py magnesium --form magnesium_glycinate --grok --limit 20

Scores the FULL available corpus by default. `--limit N` opts into a sample,
and a sampled run prints a projection saying so (pipeline/preview.py).

Flags: --with-sr --demo --full-text-only --all-oa --broad-scope
       --limit N        cap the studies extracted (default: no cap)
       --all-outcomes   (score full vocab; default is showcase top-5 by RCT count)
       --top-outcomes N (default 5)

Default demo scope is **intervention**: ingredient in TITLE/ABSTRACT as the
thing being tested. Showcase top-N outcomes are chosen by Europe PMC RCT
hit counts (most-studied first), not a fixed marketing list.
"""
from __future__ import annotations
import json
import os
import sys
import time
from collections import Counter as _Counter

from pipeline import vocab
from pipeline import predatory as pred
from pipeline import showcase as show
from pipeline.assemble import build_ecus
from pipeline import arcs as arcsmod
from pipeline.donut import four_arc_lines
from pipeline.relevance import relevance_check
from pipeline.storage import Store, DEFAULT_DB
from pipeline.retrieve import retrieve

WIRING_DB = DEFAULT_DB.parent / "wiring_demo.sqlite"

DEFAULT_PILOT_LIMIT = 40
DEFAULT_GROK_LIMIT = 100
DEFAULT_WIRING_SCORE_CAP = 40
DEFAULT_TOP_OUTCOMES = 5
RETRIEVE_MAX_PRIMARIES = int(os.environ.get("SP_RETRIEVE_MAX_PRIMARIES", "600"))
RETRIEVE_MAX_SYNTHESES = int(os.environ.get("SP_RETRIEVE_MAX_SYNTHESES", "400"))
SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"
GROK_STUDIES_IN_FLIGHT = int(os.environ.get("SP_GROK_STUDIES_IN_FLIGHT", "32"))
# A CEILING, not a budget: extraction stops itself when reviews stop naming
# trials we have not seen (synthesis_bridge marginal-yield stopping).
MAX_SRS = int(os.environ.get("SP_MAX_SRS", "60"))

_OA_RANK = {
    "full_text": 0, "fulltext": 0, "green_oa": 1, "hybrid": 2,
    "bronze": 3, "abstract_only": 4, "closed": 5, "unknown": 6,
}


def _pilot_db(ingredient: str, scope: str):
    return DEFAULT_DB.parent / (
        f"pilot_{ingredient}{'_supp' if scope != 'broad' else ''}.sqlite"
    )


def _grok_db(ingredient: str, scope: str):
    suffix = "" if scope == "broad" else f"_{scope[:4]}"
    return DEFAULT_DB.parent / f"grok_{ingredient}{suffix}.sqlite"


def _sections(record: dict) -> dict:
    """
    Parsed sections for per-agent routing. fetch_xml is disk-cached, so this
    costs nothing beyond the fetch best_text already did.
    """
    from sources import fulltext as ft
    try:
        return ft.sections(ft.fetch_xml(record.get("pmcid"))) or {}
    except Exception:
        return {}


def _best_text(record: dict) -> str:
    from sources import fulltext as ft
    try:
        text, _tier = ft.best_text(record)
    except Exception:
        text = record.get("abstract") or record.get("title") or ""
    return text or (record.get("title") or "")


def _prioritize_primaries(primaries: list[dict], *,
                          full_text_only: bool = False) -> list[dict]:
    def key(s: dict):
        oa = (s.get("oa") or "abstract_only").lower()
        return (_OA_RANK.get(oa, 6), -(s.get("year") or 0))
    def readable(s: dict) -> bool:
        if _OA_RANK.get((s.get("oa") or "").lower(), 9) <= 1:
            return True
        return bool(s.get("oa_location") or s.get("full_text_urls"))

    ordered = sorted(primaries, key=key)
    if full_text_only:
        kept = [s for s in ordered if readable(s)]
        via_oa = sum(1 for s in kept
                     if _OA_RANK.get((s.get("oa") or "").lower(), 9) > 1)
        print(f"  FULL-TEXT-ONLY: {len(kept)}/{len(ordered)} RCTs kept"
              + (f" ({via_oa} via green OA, not PMC)" if via_oa else ""))
        ordered = kept
    else:
        n_ft = sum(1 for s in ordered
                   if _OA_RANK.get((s.get("oa") or "").lower(), 9) <= 1)
        print(f"  priority: full-text/green first ({n_ft}/{len(ordered)})")
    return ordered


def stratify_targets(primaries: list[dict], outcomes: list[str],
                     limit: int) -> list[dict]:
    """
    Round-robin the --limit budget across the outcomes each record was
    RETRIEVED FOR, preserving priority order within each outcome.

    Why (measured 2026-08-11): plain `primaries[:limit]` takes by full-text
    priority, so outcomes whose studies sit in the tail starve -- endurance
    scored on n=4 and energy on n=1 while Europe PMC held 122 and 200 hits.
    The per-outcome quota machinery upstream existed precisely to prevent
    this and its work was being discarded at selection.

    Records with no retrieved_for tag (older stores) keep priority order and
    fill remaining budget, so the function degrades to [:limit] gracefully.
    """
    pools: dict[str, list[dict]] = {o: [] for o in outcomes}
    rest: list[dict] = []
    for r in primaries:
        tags = set((r.get("retrieved_for") or "").split(","))
        hit = [o for o in outcomes if o in tags]
        if hit:
            for o in hit:
                pools[o].append(r)
        else:
            rest.append(r)
    chosen, seen = [], set()
    idx = {o: 0 for o in outcomes}
    while len(chosen) < limit:
        progressed = False
        for o in outcomes:
            pool = pools[o]
            while idx[o] < len(pool):
                r = pool[idx[o]]; idx[o] += 1
                cid = r.get("canonical_id") or r.get("_canonical") or id(r)
                if cid not in seen:
                    seen.add(cid); chosen.append(r); progressed = True
                    break
            if len(chosen) >= limit:
                break
        if not progressed:
            break
    for r in rest:
        if len(chosen) >= limit:
            break
        cid = r.get("canonical_id") or r.get("_canonical") or id(r)
        if cid not in seen:
            seen.add(cid); chosen.append(r)
    return chosen


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


def _shadow_context_summary(extractions: list[dict]) -> dict:
    """Run the opt-in measured-effect path and retain only compact audit data."""
    from pipeline.v13_shadow import analyze_shadow, SHADOW_ONLY_WARNING
    records = []
    for item in extractions:
        rec, ext = item.get("record") or {}, item.get("extraction") or {}
        study_id = rec.get("_canonical") or rec.get("doi") or rec.get("pmid")
        for outcome in ext.get("outcomes") or []:
            if outcome.get("discarded") or not outcome.get("outcome_vocab_id"):
                continue
            claim = outcome.get("claim")
            if not isinstance(claim, dict):
                continue
            records.append({**claim, "study_id": study_id or "unknown",
                            "outcome": outcome["outcome_vocab_id"]})
    result = analyze_shadow(records)
    summaries = []
    # Prefer strata that actually measured something (then the most eligible)
    # so the capped summary shows the pooling frontier, not the first eight
    # stratum names alphabetically.
    for row in sorted(result.outcomes,
                      key=lambda r: (-r.measured_count, -r.eligible_count,
                                     r.stratum))[:8]:
        summaries.append({
            "outcome": row.outcome,
            "stratum": row.stratum,
            "pooled_g": row.pooled_g,
            "ci": [row.ci_lower, row.ci_upper],
            "pi": [row.prediction_lower, row.prediction_upper],
            "k": row.k, "tau2": row.tau2, "i2": row.i2,
            "measured": row.measured_count, "eligible": row.eligible_count,
            "top_refusals": sorted(row.refusal_reasons.items(),
                                    key=lambda item: (-item[1], item[0]))[:5],
            "study_audit": [
                {"study_id": str(study_id), "measure": str(measure),
                 "timepoint": str(timepoint), "g": g}
                for study_id, measure, timepoint, g in row.study_audit[:24]
            ],
        })
    return {"warning": SHADOW_ONLY_WARNING, "outcomes": summaries,
            "measured": result.measured_count, "eligible": result.eligible_count}


def _auto_push_report(ingredient: str, form: str, mode: str,
                      run_context: dict | None = None) -> None:
    try:
        from scripts.auto_report_push import write_report, git_push_reports
        write_report(ingredient, form, mode, run_context=run_context)
        git_push_reports()
    except Exception as e:
        print(f"Auto-report/push failed: {e}")


def main(argv: list[str]) -> int:
    _run_started = time.monotonic()
    args = list(argv)
    wiring = "--wiring" in args
    if wiring:
        args.remove("--wiring")
    pilot = "--pilot" in args
    if pilot:
        args.remove("--pilot")
    grok = "--grok" in args
    if grok:
        args.remove("--grok")
    demo = "--demo" in args
    if demo:
        args.remove("--demo")
    full_text_only = grok or pilot
    if "--all-oa" in args:
        args.remove("--all-oa"); full_text_only = False
    if "--full-text-only" in args:
        args.remove("--full-text-only"); full_text_only = True
    with_sr = "--with-sr" in args
    if with_sr:
        args.remove("--with-sr")
    all_outcomes = "--all-outcomes" in args
    if all_outcomes:
        args.remove("--all-outcomes")
    top_n = DEFAULT_TOP_OUTCOMES
    if "--top-outcomes" in args:
        i = args.index("--top-outcomes")
        top_n = int(args[i + 1]); del args[i:i + 2]
    if sum([wiring, pilot, grok]) > 1:
        print("Pick only one of --wiring, --pilot, --grok")
        return 1

    scope = "intervention" if (grok or pilot) else "broad"
    if "--broad-scope" in args:
        args.remove("--broad-scope"); scope = "broad"
    if "--supplement-scope" in args:
        args.remove("--supplement-scope"); scope = "supplement"
    if "--intervention-scope" in args:
        args.remove("--intervention-scope"); scope = "intervention"
    if "--per-outcome" in args:
        args.remove("--per-outcome"); scope = "per_outcome"

    dose_mg = None
    if "--dose" in args:
        i = args.index("--dose")
        dose_mg = float(args[i + 1]); del args[i:i + 2]

    # Founder 2026-08-08: score the WHOLE available corpus by default. A capped
    # run is a SAMPLE, and its score is not the full-corpus score -- c grows with
    # n by construction (pipeline/preview.py). We want one supplement scored
    # properly before we optimise anything, so the cap is now opt-IN.
    limit = None
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1]); del args[i:i + 2]

    form = "magnesium_glycinate"
    if "--form" in args:
        i = args.index("--form")
        form = args[i + 1]
        del args[i:i + 2]
    ingredients = args or ["magnesium"]
    ingredient = ingredients[0]

    if not wiring and not pilot and not grok:
        # Imported here, not at module scope: a --wiring run must not load the
        # model boundary at all. preflight() checks the subscription is signed
        # in, which is the whole configuration story now.
        import claude_adapter
        if not claude_adapter.preflight():
            print("No extraction backend selected / configured.")
            return 1

    if vocab.form(ingredient, form) is None:
        print(f"unknown form {form!r} for {ingredient}. Known forms:")
        for f in vocab.forms_for(ingredient):
            print("   ", f["id"])
        return 1

    # Top-N by published RCT count (Europe PMC), not a fixed list.
    showcase_counts: dict = {}
    outcome_allowlist = show.outcomes_for(
        ingredient, top_n=top_n, all_outcomes=all_outcomes,
        counts_out=showcase_counts,
    )

    pv = vocab.population_variants()[0]
    product = {"ingredient": ingredient, "form_vocab_id": form,
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}},
               "dose_low_mg": dose_mg, "dose_high_mg": dose_mg}
    if dose_mg is None:
        print("\nNOTE: no --dose given, so the dose arc will read 'not tested'.")
        print("      Pass --dose <mg elemental> to judge the dose axis.")

    if wiring:
        db = WIRING_DB
    elif grok:
        db = _grok_db(ingredient, scope)
    elif pilot:
        db = _pilot_db(ingredient, scope)
    else:
        db = DEFAULT_DB

    call_fn = None
    run_context: dict = {
        "ingredient": ingredient,
        "form": form,
        "product": product,
        "scope": scope,
        "showcase_outcomes": outcome_allowlist,
        "showcase_study_counts": {k: v for k, v in showcase_counts.items()
                                  if not str(k).startswith("_")},
        "studies_targeted": 0,
        "studies_ok": 0,
        "studies_skipped": 0,
        "studies_failed_partial": 0,
        "predatory": {},
        "studies_list": [],
        "sr": {"requested": 0, "s2_ok": 0, "resolved": 0},
        "agent_stats": {},
        "speed_report": "",
        "ecu_rows": [],
        "prompt_version": "",
        "concurrency": None,
        "studies_in_flight": None,
    }

    with Store(db) as store:
        counts = store.counts()
        # MEASURED 2026-08-10, and this one condition was costing ~5x the corpus.
        #
        # Two defects, both in this expression:
        #
        # 1. `grok and ...` meant that on the PRODUCTION CLAUDE PATH retrieval
        #    fired only when the store was COMPLETELY EMPTY. So the corpus never
        #    grew and never refreshed. Second-order effect, which is the one that
        #    actually hurt: rows written before `resultType=core` was added left
        #    `abstract` NULL on 100% of 1560 RCT rows, and since storage upserts
        #    with COALESCE it can only be backfilled by a fresh retrieval that
        #    never happened. A NULL abstract silently turns relevance_check into
        #    title-only (see the vitamin_d note in pipeline/relevance.py, which is
        #    the same failure) and leaves abstract-only studies with no text, which
        #    is where "skipped: no text" on 23 of 69 studies came from.
        #
        # 2. `counts["studies"]` is the WHOLE store across every ingredient ever
        #    run, so it answered a different question than the one that matters.
        #    The 2076-row store held 1560 RCT-rank primaries of which only 69 were
        #    creatine -- the rest were ashwagandha and magnesium from earlier runs
        #    -- and 392 creatine RCTs existed upstream at intervention scope. The
        #    run scored 69 and reported n=1..7 per outcome, which is why every
        #    confidence arc sat at c=0.02..0.22 and every score rounded to ~0.
        #
        # So: count what is RELEVANT TO THIS INGREDIENT, and do it for every
        # backend. Re-retrieval when already full is cheap -- sources/http.py
        # caches every response to disk, so a repeat pass is offline and fast.
        target = (RETRIEVE_MAX_PRIMARIES if limit is None
                  else min(limit + 50, RETRIEVE_MAX_PRIMARIES))
        _n_relevant = sum(1 for s in store.studies(syntheses=False)
                          if s.get("design_rank") == 4
                          and relevance_check(s, ingredient)[0])
        need_retrieve = _n_relevant < target
        if need_retrieve:
            print(f"corpus: {_n_relevant} RCT-rank {ingredient} studies in store, "
                  f"target {target} -- expanding")
        if need_retrieve:
            print(f"retrieving / expanding corpus in {db.name} "
                  f"(scope={scope}, max primaries={RETRIEVE_MAX_PRIMARIES})...")
            retrieve(ingredient, store,
                     max_syntheses=RETRIEVE_MAX_SYNTHESES,
                     max_primaries=RETRIEVE_MAX_PRIMARIES,
                     outcome_ids=outcome_allowlist,
                     scope=scope)

        all_rows = store.studies(syntheses=False)
        syn_rows = store.studies(syntheses=True)

        pred_summary = pred.flag_records(all_rows)
        pred.flag_records(syn_rows)
        print(pred.format_summary(pred_summary))
        run_context["predatory"] = pred_summary

        # How many studies were AVAILABLE to score, before --limit. Used for the
        # sample-size note at the end: a capped run is a SAMPLE, and its score
        # does not estimate the full-corpus score (pipeline/preview.py).
        n_available = 0
        primaries = _prioritize_primaries(
            [s for s in all_rows if s.get("design_rank") == 4],
            full_text_only=full_text_only,
        )

        relevant = []
        rejected = 0
        for s in primaries:
            ok, reason = relevance_check(s, ingredient)
            if ok:
                relevant.append(s)
            else:
                rejected += 1
        print(f"\nstore: {len(all_rows)} primaries, {len(syn_rows)} syntheses; "
              f"{len(primaries)} RCT-rank after OA filters; "
              f"{len(relevant)} after relevance gate "
              f"(dropped {rejected} noise)")
        primaries = relevant
        # Everything that SURVIVED the gates, before --limit. This is the
        # denominator for the sample-size note; counting pre-gate records would
        # project against studies we were never going to score.
        n_available = len(primaries)

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
            import workers
            if grok:
                import grok_adapter as ga
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
            elif pilot:
                import pilot_adapter as pa
                if not pa.preflight():
                    return 1
                call_fn = lambda agent, payload: pa.call(agent, payload, verified=True)
                prompt_version = f"{pa.PROMPT_VERSION}+{pa.PILOT_MARKER}"
                tag = "PILOT "
                in_flight = 4
                ga = None
                run_context["concurrency"] = 4
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
                import claude_adapter as ca
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
                import claude_adapter as _ca
                run_context["usage"] = _ca.USAGE.as_dict()
                run_context["models"] = dict(_ca.TIER_MODEL)
                run_context["agent_tiers"] = {a: t for a, (t, _s, _p)
                                              in _ca.AGENTS.items()}
            except Exception:
                pass

        if outcome_allowlist:
            searched = list(outcome_allowlist)
        elif scope == "per_outcome":
            searched = sorted(vocab.outcome_ids())
        else:
            searched = None

        # A/B, founder 2026-08-08: score the SAME extractions twice. Extraction
        # is the expensive part; build_ecus is deterministic and free, so the
        # second pass costs nothing.
        #
        #   A  everything counts   (ignore_population=True)
        #   B  route on population (a disease trial is a DIFFERENT question)
        #
        # DECIDED 2026-08-10 (delegated by the founder the same day): B is what
        # gets STORED. The null audit (docs/REVIEW_PENDING.md #4) found disease
        # trials -- breast cancer, COPD, ALS, cancer anorexia -- voting at full
        # weight on healthy-adult claims; health_status feeds vocab.pop_match,
        # so B excludes them as a different QUESTION, not weaker evidence
        # (invariant 8: exclusion on an ECU axis, never a weight discount).
        # A is still computed, printed and reported beside it, never blended --
        # same discipline as invariant 9 for backends.
        def _score(variant_b: bool, stats: dict | None = None):
            return build_ecus(
                extractions, product, syntheses=syntheses_for_score,
                prompt_version=prompt_version,
                exact_form_only=demo,
                ignore_population=not variant_b,
                exclude_offtarget_population=variant_b,
                searched_outcomes=searched, sr_derived=sr_derived,
                stats=stats,
            )

        _elig: dict = {}
        rows = _score(True, stats=_elig)     # B: STORED since 2026-08-10
        run_context["eligibility"] = _elig
        run_context["population_policy"] = "B_exclude_offtarget"
        try:
            rows_b = _score(False)           # A: comparison only
        except Exception as e:
            print(f"  population A/B unavailable: {e}")
            rows_b = []
        if rows_b:
            _b = {r["outcome_vocab_id"]: r for r in rows_b}
            print("\n" + "=" * 74)
            print("POPULATION A/B — same studies, two policies. B is STORED (2026-08-10).")
            print("  B = off-target populations excluded (stored)   A = everything counts")
            print("-" * 74)
            # NOTE since 2026-08-10: `rows` is variant B (stored), `_b` holds
            # variant A (comparison). Column names below say which is which so
            # the swap cannot mislabel the table.
            print(f"  {'outcome':<24}{'B*':>5}{'A':>6}{'B-A':>8}   {'n B':>4}{'n A':>5}")
            for r in rows:
                b = _b.get(r["outcome_vocab_id"])
                if not b:
                    continue
                stored_s, cmp_s = r.get("composite"), b.get("composite")
                ns = (r.get("evidence") or {}).get("n_primaries", 0)
                nc = (b.get("evidence") or {}).get("n_primaries", 0)
                d = ("" if stored_s is None or cmp_s is None
                     else f"{stored_s - cmp_s:+d}")
                print(f"  {r['outcome_vocab_id']:<24}"
                      f"{'--' if stored_s is None else stored_s:>5}"
                      f"{'--' if cmp_s is None else cmp_s:>6}{d:>8}   {ns:>4}{nc:>5}")
            print("-" * 74)
            print("  B* is stored. A positive B-A means A was dragged down by trials")
            print("  asking a different question. n_B far below n_A means B is")
            print("  starving the row -- check S3 health_status before trusting it.")
            print("=" * 74)
            run_context["population_ab"] = [
                {"outcome": r["outcome_vocab_id"],
                 "b_stored": r.get("composite"),
                 "a": (_b.get(r["outcome_vocab_id"]) or {}).get("composite"),
                 "n_b": (r.get("evidence") or {}).get("n_primaries", 0),
                 "n_a": ((_b.get(r["outcome_vocab_id"]) or {}).get("evidence") or {}).get("n_primaries", 0)}
                for r in rows if r["outcome_vocab_id"] in _b]
        # K SENSITIVITY A/B (founder ask 2026-08-11: "the algo may be too
        # punishing by the amount of studies we get... we fragment so much").
        # Measured: ECU granularity fragments 143 studies into cells of 4-17,
        # while K=3.0 needs ~51 studies/cell for c=0.8 -- so confidence, not
        # direction, caps every score. K is a SPEC 13 constant awaiting external
        # calibration; until then every run PRINTS both, never blends (same
        # discipline as the population A/B above).
        try:
            import pipeline.scoring as _sc
            _k0 = _sc.K
            _sc.K = 3.0   # the pre-2026-08-11 value, kept visible
            rows_k = _score(True)
        except Exception as e:
            print(f"  K sensitivity unavailable: {e}")
            rows_k = []
        finally:
            _sc.K = _k0
        if rows_k:
            _kb = {r["outcome_vocab_id"]: r for r in rows_k}
            print(f"\nCONFIDENCE A/B -- same evidence, K={_k0} (stored) vs K=3.0 (old).")
            print("  If these diverge wildly, fragmentation is the binding constraint,")
            print("  not the evidence. K change needs external calibration (SPEC 13).")
            print(f"  {'outcome':<24}{'stored':>7}{'K=3.0':>7}   {'c':>6}{'c@1.5':>7}")
            for r in rows:
                kk = _kb.get(r["outcome_vocab_id"])
                if not kk: continue
                c0 = (r.get("components") or {}).get("c")
                c1 = (kk.get("components") or {}).get("c")
                print(f"  {r['outcome_vocab_id']:<24}"
                      f"{str(r.get('composite')):>7}{str(kk.get('composite')):>7}   "
                      f"{str(c0):>6}{str(c1):>7}")
            run_context["k_ab"] = [
                {"outcome": r["outcome_vocab_id"], "stored": r.get("composite"),
                 "k_old": (_kb.get(r["outcome_vocab_id"]) or {}).get("composite")}
                for r in rows if r["outcome_vocab_id"] in _kb]

        if os.environ.get("SP_V13_SHADOW") == "1":
            try:
                run_context["v13_shadow"] = _shadow_context_summary(extractions)
            except Exception as exc:
                # The opt-in audit must never change production scoring; retain
                # a bounded failure marker rather than aborting the run.
                run_context["v13_shadow"] = {
                    "warning": "SHADOW ONLY: analysis failed; production scores unchanged.",
                    "outcomes": [], "error": str(exc)[:300]}

        rows = show.filter_ecu_rows(rows, outcome_allowlist)
        for row in rows:
            store.upsert_ecu(row)

        # The immutable DashboardRunV1 export needs the complete deterministic
        # ECU result: dose, applicability, study ids, flags and provenance are
        # all required to explain the centre number and its arcs.  The old
        # abbreviated projection made those facts unrecoverable after the
        # gitignored SQLite store was gone.
        run_context["ecu_rows"] = rows

        print(f"\n{tag}ECU ROWS — {ingredient}, form={form}, scope={scope}")
        if outcome_allowlist:
            print(f"  showcase top-{len(outcome_allowlist)} by published RCT count")
        print("  0-100 = 50 + signed/2, a positive signal discounted by applicability "
              "A = mean(form strength, dose closeness)")
        print("-" * 74)
        for row in rows:
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            comp = row.get("composite")
            shown = "gated" if comp is None else f"{comp:>3}/100"
            verdict = arcsmod.label(
                comp, (row.get("components") or {}).get("c"),
                effect_verdict=((row.get("arcs") or {}).get("effect") or {}).get("verdict"),
                applicability_limited=any(
                    ((row.get("arcs") or {}).get(k) or {}).get("verdict") is None
                    for k in ("form", "dose")),
                applicability_score=(row.get("components") or {}).get("applicability"))
            print(f"{tag}{o.get('label', row['outcome_vocab_id']):<30}{shown:>9}  "
                  f"{verdict:<24} n={row['evidence']['n_primaries']}"
                  f"   (signed {row.get('score')})")
            try:
                print(four_arc_lines(row))
            except Exception:
                pass
        print("-" * 74)

        scored = [r for r in rows if r.get("composite") is not None]
        print("\n" + "=" * 74)
        print(f"{tag}RESULT — {ingredient} / {form}")
        if not scored:
            print("  no scored outcomes (every ECU gated, or extraction failed)")
        else:
            top = max(scored, key=lambda r: r["composite"])
            o = vocab.outcome(top["outcome_vocab_id"]) or {}
            c = (top.get("components") or {}).get("c")
            a = top.get("arcs") or {}

            def _a(k):
                arc = a.get(k) or {}
                v, cov = arc.get("verdict"), arc.get("coverage")
                if arc.get("is_quantity"):
                    return f"{cov:.0%}" if cov is not None else "n/a"
                if v is None:
                    return "not tested"
                return f"{v:+.2f}@{cov:.0%}"

            print(f"  best outcome   : {o.get('label', top['outcome_vocab_id'])}")
            _lab = arcsmod.label(
                top["composite"], c,
                effect_verdict=(a.get("effect") or {}).get("verdict"),
                applicability_limited=any((a.get(k) or {}).get("verdict") is None
                                          for k in ("form", "dose")),
                applicability_score=(top.get("components") or {}).get("applicability"))
            print(f"  SCORE          : {top['composite']}/100   {_lab}")
            print(f"  arcs           : effect {_a('effect')} | form {_a('form')} "
                  f"| dose {_a('dose')} | evidence {_a('evidence')}")
            print(f"  outcomes shown : {len(rows)} showcase  "
                  f"scored {len(scored)}  range "
                  f"{min(r['composite'] for r in scored)}-"
                  f"{max(r['composite'] for r in scored)}/100")

            # A capped run is a SAMPLE of the corpus, and the score it produces
            # is not an estimate of the full-corpus score: d and H are
            # sample-size independent, c grows with n by construction. Printing
            # the sample score with no note invites reading a --limit 40 run as
            # the answer. preview.py has done this arithmetic since it was
            # written and nothing called it.
            _n_avail = n_available or len(extractions)
            if _n_avail > len(extractions):
                from pipeline import preview as _prev
                _best = {"score": top.get("score"),
                         **{k: (top.get("components") or {}).get(k)
                            for k in ("c", "d", "H", "E")}}
                if _best.get("E"):
                    print("\n" + _prev.summarise(_best, len(extractions), _n_avail))
        print("=" * 74)
        print(f"\nWritten to {db}")

    # The label is the BACKEND that produced the numbers. It was hardcoded to
    # "grok" for every run, and only --grok and --pilot wrote a report at all --
    # so the production path, the one backend allowed to back a public claim,
    # silently produced no report. Invariant 9 requires the provider on every
    # report; a run labelled by the wrong backend is worse than an unlabelled
    # one, because it invites exactly the cross-provider comparison that
    # invariant forbids. Fixed 2026-08-09.
    mode = "grok" if grok else "pilot" if pilot else "claude"
    if demo:
        mode += "-demo"
    if with_sr:
        mode += "-sr"
    if full_text_only:
        mode += "-ft"
    if outcome_allowlist:
        mode += f"-top{len(outcome_allowlist)}"
    mode += f"-{scope[:5]}"
    # Wiring is synthetic and never a claim, so it stays out of reports/runs/.
    if not wiring:
        run_context["mode"] = mode
        run_context["provider"] = (
            "grok" if grok else "claude-pilot" if pilot else "claude"
        )
        run_context["wall_time_s"] = round(time.monotonic() - _run_started, 4)
        _auto_push_report(ingredient, form, mode, run_context=run_context)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
