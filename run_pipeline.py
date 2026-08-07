#!/usr/bin/env python3
"""
End-to-end v1 run.

  python run_pipeline.py magnesium --form magnesium_glycinate --grok --limit 20

Flags: --with-sr --demo --full-text-only
Predatory list: vocab/predatory_journals.txt (auto-expanded after git pull)

Corpus strategy: retrieve broadly (up to 600 primaries), rank by OA + year,
then extract only the top `--limit` as evidence. Store size ≠ evidence mass.
"""
from __future__ import annotations
import os
import sys

from pipeline import vocab
from pipeline import predatory as pred
from pipeline.assemble import build_ecus
from pipeline import arcs as arcsmod
from pipeline.donut import donut_line, four_arc_lines
from pipeline.storage import Store, DEFAULT_DB
from pipeline.retrieve import retrieve

WIRING_DB = DEFAULT_DB.parent / "wiring_demo.sqlite"

DEFAULT_PILOT_LIMIT = 40
DEFAULT_GROK_LIMIT = 100
DEFAULT_WIRING_SCORE_CAP = 40
# Broad retrieve, narrow extract: store up to 600, score only --limit top-ranked.
RETRIEVE_MAX_PRIMARIES = int(os.environ.get("SP_RETRIEVE_MAX_PRIMARIES", "600"))
RETRIEVE_MAX_SYNTHESES = int(os.environ.get("SP_RETRIEVE_MAX_SYNTHESES", "120"))
SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"
GROK_STUDIES_IN_FLIGHT = int(os.environ.get("SP_GROK_STUDIES_IN_FLIGHT", "32"))
MAX_SRS = int(os.environ.get("SP_MAX_SRS", "12"))

_OA_RANK = {
    "full_text": 0, "fulltext": 0, "green_oa": 1, "hybrid": 2,
    "bronze": 3, "abstract_only": 4, "closed": 5, "unknown": 6,
}


def _pilot_db(ingredient: str, scope: str):
    return DEFAULT_DB.parent / (
        f"pilot_{ingredient}{'_supp' if scope == 'supplement' else ''}.sqlite"
    )


def _grok_db(ingredient: str, scope: str):
    return DEFAULT_DB.parent / (
        f"grok_{ingredient}{'_supp' if scope == 'supplement' else ''}.sqlite"
    )


def _best_text(record: dict) -> str:
    from sources import fulltext as ft
    try:
        text, _tier = ft.best_text(record)
    except Exception:
        text = record.get("abstract") or record.get("title") or ""
    return text or (record.get("title") or "")


def _prioritize_primaries(primaries: list[dict], *,
                          full_text_only: bool = False) -> list[dict]:
    """Highest-value first: full-text/green OA, then newer year."""
    def key(s: dict):
        oa = (s.get("oa") or "abstract_only").lower()
        return (_OA_RANK.get(oa, 6), -(s.get("year") or 0))
    ordered = sorted(primaries, key=key)
    if full_text_only:
        kept = [s for s in ordered
                if _OA_RANK.get((s.get("oa") or "").lower(), 9) <= 1]
        print(f"  FULL-TEXT-ONLY: {len(kept)}/{len(ordered)} RCTs kept")
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
        print(f"  skipped {len(skipped)}/{len(raw)} studies with no usable text")


def _agent_stats(raw: list[dict]) -> dict:
    """Aggregate S3–S8 (+S6) ok/fail from extraction metadata."""
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
            bucket = stats.setdefault(agent, {"ok": 0, "fail": 0, "cache": 0})
            if agent in failed_agents or m.get("error"):
                bucket["fail"] += 1
            else:
                bucket["ok"] += 1
            if m.get("cached"):
                bucket["cache"] += 1
        for f in (ext.get("_failed") or []):
            agent = f.get("agent") or "?"
            if agent not in meta:
                bucket = stats.setdefault(agent, {"ok": 0, "fail": 0, "cache": 0})
                bucket["fail"] += 1
    return stats


def _studies_list(raw: list[dict]) -> list[dict]:
    out = []
    for r in raw:
        rec = r.get("record") or {}
        out.append({
            "title": rec.get("title"),
            "year": rec.get("year"),
            "doi": rec.get("doi"),
            "pmid": rec.get("pmid"),
            "canonical_id": rec.get("_canonical") or rec.get("canonical_id"),
            "journal": rec.get("journal") or rec.get("journal_name"),
            "oa": rec.get("oa"),
            "predatory_venue": bool(rec.get("predatory_venue")),
            "skipped": bool((r.get("extraction") or {}).get("_skipped")),
            "failed_partial": bool((r.get("extraction") or {}).get("_failed")),
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
    # Full-text-only. Default ON for the pilot/grok demo backends: an
    # abstract-only study carries OA_FACTOR 0.55 AND cannot verify most RoB
    # items, so it lands near w=0.02 and needs ~300 of its kind to reach c=0.9.
    # A full-text study needs ~50. Extracting them is the same token cost, so
    # spending the budget on readable papers is strictly better value.
    full_text_only = grok or pilot
    if "--all-oa" in args:
        args.remove("--all-oa"); full_text_only = False
    if "--full-text-only" in args:
        args.remove("--full-text-only"); full_text_only = True
    with_sr = "--with-sr" in args
    if with_sr:
        args.remove("--with-sr")
    if sum([wiring, pilot, grok]) > 1:
        print("Pick only one of --wiring, --pilot, --grok")
        return 1

    scope = "supplement" if "--supplement-scope" in args else "broad"
    if scope == "supplement":
        args.remove("--supplement-scope")

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

    pv = vocab.population_variants()[0]
    product = {"ingredient": ingredient, "form_vocab_id": form,
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}

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
                  f"(max primaries={RETRIEVE_MAX_PRIMARIES})...")
            retrieve(ingredient, store,
                     max_syntheses=RETRIEVE_MAX_SYNTHESES,
                     max_primaries=RETRIEVE_MAX_PRIMARIES,
                     scope=scope)

        all_rows = store.studies(syntheses=False)
        syn_rows = store.studies(syntheses=True)

        # Research layer: flag predatory venues
        pred_summary = pred.flag_records(all_rows)
        pred.flag_records(syn_rows)
        print(pred.format_summary(pred_summary))
        run_context["predatory"] = pred_summary

        primaries = _prioritize_primaries(
            [s for s in all_rows if s.get("design_rank") == 4],
            full_text_only=full_text_only,
        )
        print(f"\nstore: {len(all_rows)} primaries, {len(syn_rows)} syntheses; "
              f"{len(primaries)} RCT-rank after filters "
              f"(will extract top {min(limit, len(primaries))})")

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
                    print("No RCTs left after filters.")
                    return 1
                effective = min(limit, len(primaries))
                print("\n" + "-" * 68)
                print("GROK MODE")
                print(f"  studies in flight: {GROK_STUDIES_IN_FLIGHT}")
                print(f"  concurrent grok CLI: {ga.MAX_CONCURRENCY}")
                print(f"  batch size (extract): {effective}")
                print(f"  corpus stored: up to {RETRIEVE_MAX_PRIMARIES} primaries")
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
                  f"(from {len(primaries)} ranked RCTs in store)...")
            raw = workers.extract_corpus(
                [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
                 for p in targets],
                text_for=lambda r: _best_text(r),
                registry_for=lambda r: store.registry_facts(r["registration_id"])
                                       if r.get("registration_id") else None,
                call=call_fn,
                max_studies_in_flight=in_flight,
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
                print("No study had usable text.")
                return 1

            if with_sr and call_fn is not None:
                from pipeline.synthesis_bridge import build_syntheses_for_scoring
                run_context["sr"]["requested"] = MAX_SRS
                syntheses_for_score = build_syntheses_for_scoring(
                    store, call=call_fn, text_for=lambda r: _best_text(r),
                    max_srs=MAX_SRS, max_workers=min(6, GROK_STUDIES_IN_FLIGHT),
                )
                run_context["sr"]["s2_ok"] = sum(
                    1 for s in syntheses_for_score if s)
                run_context["sr"]["resolved"] = sum(
                    1 for s in syntheses_for_score if s.get("resolved"))
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

        rows = build_ecus(
            extractions, product, syntheses=syntheses_for_score,
            prompt_version=prompt_version,
            exact_form_only=demo, ignore_population=True,
        )
        for row in rows:
            store.upsert_ecu(row)

        run_context["ecu_rows"] = [{
            "outcome_vocab_id": r["outcome_vocab_id"],
            "score": r["score"],
            "band": r["band"],
            "n_primaries": r["evidence"]["n_primaries"],
            "prompt_version": prompt_version,
        } for r in rows]

        print(f"\n{tag}ECU ROWS — {ingredient}, form={form}")
        print("  0-100 = 100 x c x mean(effect, form, dose).  Each arc shows its")
        print("  verdict and the share of evidence behind it.  A low number with a")
        print("  FULL evidence arc means 'does not work'; an EMPTY one means")
        print("  'barely studied'.  The number must never be quoted without them.")
        print("-" * 74)
        for row in sorted(rows, key=lambda r: -(r.get("composite")
                                                if r.get("composite") is not None else -999)):
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            comp = row.get("composite")
            shown = "gated" if comp is None else f"{comp:>3}/100"
            verdict = arcsmod.label(comp, (row.get("components") or {}).get("c"))
            print(f"{tag}{o.get('label', row['outcome_vocab_id']):<30}{shown:>9}  "
                  f"{verdict:<24} n={row['evidence']['n_primaries']}"
                  f"   (signed {row.get('score')})")
            try:
                print(four_arc_lines(row))
            except Exception:
                pass
        print("-" * 74)
        print(f"\nWritten to {db}")

    mode = "grok"
    if demo:
        mode += "-demo"
    if with_sr:
        mode += "-sr"
    if full_text_only:
        mode += "-ft"
    if grok:
        _auto_push_report(ingredient, form, mode, run_context=run_context)
    elif pilot:
        _auto_push_report(ingredient, form, "pilot", run_context=run_context)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
