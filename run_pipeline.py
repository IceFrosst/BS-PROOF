#!/usr/bin/env python3
"""
End-to-end v1 run.

  python run_pipeline.py magnesium --form magnesium_glycinate --grok --limit 20

Flags: --with-sr --demo --full-text-only --all-oa --broad-scope
       --all-outcomes   (score full vocab; default is showcase top-5 by RCT count)
       --top-outcomes N (default 5)

Default demo scope is **intervention**: ingredient in TITLE/ABSTRACT as the
thing being tested. Showcase top-N outcomes are chosen by Europe PMC RCT
hit counts (most-studied first), not a fixed marketing list.
"""
from __future__ import annotations
import os
import sys
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
        })
    return out


def _auto_push_report(ingredient: str, form: str, mode: str,
                      run_context: dict | None = None) -> None:
    try:
        from scripts.auto_report_push import write_report, git_push_reports
        write_report(ingredient, form, mode, run_context=run_context)
        git_push_reports()
    except Exception as e:
        print(f"Auto-report/push failed: {e}")


def main(argv: list[str]) -> int:
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

    limit = DEFAULT_GROK_LIMIT if grok else DEFAULT_PILOT_LIMIT
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

    if not wiring and not pilot and not grok and not os.environ.get("ANTHROPIC_API_KEY"):
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
        need_retrieve = counts["studies"] == 0 or (
            grok and counts["studies"] < min(limit + 50, RETRIEVE_MAX_PRIMARIES)
        )
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

        raw: list[dict] = []
        syntheses_for_score: list = []

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
        elif pilot or grok:
            import workers
            if grok:
                import grok_adapter as ga
                ga.reset_stats()
                if not ga.preflight():
                    return 1
                if not primaries:
                    print("No RCTs left after relevance / OA filters.")
                    return 1
                effective = min(limit, len(primaries))
                print("\n" + "-" * 68)
                print("GROK MODE")
                print(f"  scope: {scope}")
                print(f"  studies in flight: {GROK_STUDIES_IN_FLIGHT}")
                print(f"  concurrent grok CLI: {ga.MAX_CONCURRENCY}")
                print(f"  batch size (extract): {effective}")
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
                limit = effective
                run_context["concurrency"] = ga.MAX_CONCURRENCY
                run_context["studies_in_flight"] = in_flight
            else:
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

            targets = primaries[:limit]
            run_context["studies_targeted"] = len(targets)
            print(f"extracting {len(targets)} studies "
                  f"(from {len(primaries)} relevance-filtered RCTs)...")
            raw = workers.extract_corpus(
                [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
                 for p in targets],
                text_for=lambda r: _best_text(r),
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

            if with_sr and call_fn is not None:
                from pipeline.synthesis_bridge import build_syntheses_for_scoring
                run_context["sr"]["requested"] = MAX_SRS
                syntheses_for_score = build_syntheses_for_scoring(
                    store, call=call_fn,
                    max_srs=MAX_SRS, max_workers=min(6, GROK_STUDIES_IN_FLIGHT),
                )
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
        else:
            import workers
            import claude_adapter
            if not claude_adapter.preflight():
                return 1
            texts = {p["canonical_id"]: (p.get("title") or "") for p in primaries}
            raw = workers.extract_corpus(
                [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
                 for p in primaries[:DEFAULT_WIRING_SCORE_CAP]],
                text_for=lambda r: texts.get(r["_canonical"], ""),
                outcome_allowlist=outcome_allowlist,
            )
            extractions = [{
                "record": r["record"],
                "extraction": r["extraction"],
                "registry": store.registry_facts(r["record"].get("registration_id"))
                            if r["record"].get("registration_id") else None,
            } for r in raw]
            prompt_version = claude_adapter.PROMPT_VERSION
            tag = ""

        run_context["prompt_version"] = prompt_version

        if outcome_allowlist:
            searched = list(outcome_allowlist)
        elif scope == "per_outcome":
            searched = sorted(vocab.outcome_ids())
        else:
            searched = None

        rows = build_ecus(
            extractions, product, syntheses=syntheses_for_score,
            prompt_version=prompt_version,
            exact_form_only=demo, ignore_population=True,
            searched_outcomes=searched,
        )
        rows = show.filter_ecu_rows(rows, outcome_allowlist)
        for row in rows:
            store.upsert_ecu(row)

        run_context["ecu_rows"] = [{
            "outcome_vocab_id": r["outcome_vocab_id"],
            "score": r["score"],
            "composite": r.get("composite"),
            "arcs": r.get("arcs"),
            "components": r.get("components"),
            "band": r["band"],
            "n_primaries": r["evidence"]["n_primaries"],
            "prompt_version": prompt_version,
        } for r in rows]

        print(f"\n{tag}ECU ROWS — {ingredient}, form={form}, scope={scope}")
        if outcome_allowlist:
            print(f"  showcase top-{len(outcome_allowlist)} by published RCT count")
        print("  0-100 = 100 x c x mean(effect, form, dose)")
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
                    for k in ("form", "dose")))
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
                                          for k in ("form", "dose")))
            print(f"  SCORE          : {top['composite']}/100   {_lab}")
            print(f"  arcs           : effect {_a('effect')} | form {_a('form')} "
                  f"| dose {_a('dose')} | evidence {_a('evidence')}")
            print(f"  outcomes shown : {len(rows)} showcase  "
                  f"scored {len(scored)}  range "
                  f"{min(r['composite'] for r in scored)}-"
                  f"{max(r['composite'] for r in scored)}/100")
        print("=" * 74)
        print(f"\nWritten to {db}")

    mode = "grok"
    if demo:
        mode += "-demo"
    if with_sr:
        mode += "-sr"
    if full_text_only:
        mode += "-ft"
    if outcome_allowlist:
        mode += f"-top{len(outcome_allowlist)}"
    mode += f"-{scope[:5]}"
    if grok:
        _auto_push_report(ingredient, form, mode, run_context=run_context)
    elif pilot:
        _auto_push_report(ingredient, form, "pilot", run_context=run_context)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
