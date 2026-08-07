#!/usr/bin/env python3
"""
End-to-end v1 run.

  python run_pipeline.py magnesium --form magnesium_glycinate --grok --with-sr
  python run_pipeline.py magnesium --form magnesium_glycinate --grok --demo

--with-sr  extract S2 on stored meta-analyses and apply capped E' multiplier
--demo     exact form only + ignore population (founder demos)
"""
from __future__ import annotations
import os
import sys

from pipeline import vocab
from pipeline.assemble import build_ecus
from pipeline.donut import donut_line
from pipeline.storage import Store, DEFAULT_DB
from pipeline.retrieve import retrieve

WIRING_DB = DEFAULT_DB.parent / "wiring_demo.sqlite"

DEFAULT_PILOT_LIMIT = 40
DEFAULT_GROK_LIMIT = 100
DEFAULT_WIRING_SCORE_CAP = 40
RETRIEVE_MAX_PRIMARIES = 250
RETRIEVE_MAX_SYNTHESES = 80
SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"
GROK_STUDIES_IN_FLIGHT = int(os.environ.get("SP_GROK_STUDIES_IN_FLIGHT", "32"))
MAX_SRS = int(os.environ.get("SP_MAX_SRS", "15"))


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
    # A quota ceiling is not a property of the corpus and will fail identically
    # for every remaining study. Say so first, or an empty run reads as "this
    # supplement has no evidence". Measured 2026-08-06: a 10-study creatine
    # batch burned 43 calls against the subscription session limit.
    quota = next((r["extraction"]["_quota_exhausted"] for r in raw
                  if r["extraction"].get("_quota_exhausted")), None)
    if quota:
        print(f"\n  !! QUOTA EXHAUSTED: {quota}")
        print("     The subscription's throughput ceiling, not a code failure")
        print("     and not a property of the corpus. Batches this size need")
        print("     ANTHROPIC_API_KEY (or a smaller --limit).")

    failed = [r for r in raw if r["extraction"].get("_failed")]
    if failed:
        n = sum(len(r["extraction"]["_failed"]) for r in failed)
        print(f"  !! {n} subagent calls FAILED across {len(failed)} studies")
        for r in failed[:3]:
            for f in r["extraction"]["_failed"][:2]:
                print(f"     {f['agent']}: {str(f['error'])[:70]}")
        print("     Treat failed calls as missing data, not as null effects.")
    skipped = [r for r in raw if r["extraction"].get("_skipped")]
    if skipped:
        print(f"  skipped {len(skipped)}/{len(raw)} studies with no usable text")


def _auto_push_report(ingredient: str, form: str, mode: str) -> None:
    try:
        from scripts.auto_report_push import write_report, git_push_reports
        write_report(ingredient, form, mode)
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
    with Store(db) as store:
        counts = store.counts()
        need_retrieve = counts["studies"] == 0 or (
            grok and counts["studies"] < min(limit + 50, RETRIEVE_MAX_PRIMARIES)
        )
        if need_retrieve:
            print(f"retrieving / expanding corpus in {db.name}...")
            retrieve(ingredient, store,
                     max_syntheses=RETRIEVE_MAX_SYNTHESES,
                     max_primaries=RETRIEVE_MAX_PRIMARIES,
                     scope=scope)

        all_rows = store.studies(syntheses=False)
        syn_rows = store.studies(syntheses=True)
        primaries = [s for s in all_rows if s.get("design_rank") == 4]
        print(f"\nstore: {len(all_rows)} primaries, {len(syn_rows)} syntheses; "
              f"{len(primaries)} RCT-rank (4)")
        if demo:
            print("DEMO MODE: score only exact form match; population transfer OFF")
        if with_sr:
            print(f"WITH-SR MODE: up to {MAX_SRS} meta-analyses via S2 (capped multiplier)")

        if wiring:
            print("\n!! WIRING MODE — SYNTHETIC numbers only !!\n")
            axes = {a: pv[a] for a in vocab.AXES}
            extractions = [{
                "record": {**p, "_canonical": p["canonical_id"], "ingredient": ingredient},
                "registry": store.registry_facts(p["registration_id"])
                            if p.get("registration_id") else None,
                "extraction": synthetic_extraction(p, axes),
            } for p in primaries[:DEFAULT_WIRING_SCORE_CAP]]
            prompt_version = SYNTHETIC_VERSION
            tag = "SYNTHETIC "
            syntheses_for_score = []
        elif pilot or grok:
            import workers
            if grok:
                import grok_adapter as ga
                ga.reset_stats()
                if not ga.preflight():
                    return 1
                effective = min(limit, len(primaries))
                print("\n" + "-" * 68)
                print("GROK MODE")
                print(f"  studies in flight: {GROK_STUDIES_IN_FLIGHT}")
                print(f"  concurrent grok CLI: {ga.MAX_CONCURRENCY}")
                print(f"  batch size: {effective}")
                if with_sr:
                    print(f"  --with-sr: S2 on ≤{MAX_SRS} reviews")
                if demo:
                    print("  --demo: exact form only + no pop penalty")
                print("-" * 68)
                call_fn = ga.call
                prompt_version = f"{ga.PROMPT_VERSION}+{ga.PROVENANCE}"
                tag = "GROK "
                in_flight = GROK_STUDIES_IN_FLIGHT
                limit = effective
            else:
                import pilot_adapter as pa
                if not pa.preflight():
                    return 1
                call_fn = lambda agent, payload: pa.call(agent, payload, verified=True)
                prompt_version = f"{pa.PROMPT_VERSION}+{pa.PILOT_MARKER}"
                tag = "PILOT "
                in_flight = 4
                ga = None

            targets = primaries[:limit]
            print(f"extracting {len(targets)} RCT-rank studies...")
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
            if grok:
                print(ga.speed_report())
            extractions = [{
                "record": r["record"],
                "extraction": r["extraction"],
                "registry": store.registry_facts(r["record"].get("registration_id"))
                            if r["record"].get("registration_id") else None,
            } for r in raw if not r["extraction"].get("_skipped")]
            if not extractions:
                print("No study had usable text.")
                return 1

            syntheses_for_score = []
            if with_sr and call_fn is not None:
                from pipeline.synthesis_bridge import build_syntheses_for_scoring
                syntheses_for_score = build_syntheses_for_scoring(
                    store,
                    call=call_fn,
                    text_for=lambda r: _best_text(r),
                    max_srs=MAX_SRS,
                    max_workers=min(4, GROK_STUDIES_IN_FLIGHT),
                )
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
            syntheses_for_score = []

        rows = build_ecus(
            extractions, product,
            syntheses=syntheses_for_score,
            prompt_version=prompt_version,
            exact_form_only=demo,
            ignore_population=demo,
        )
        for row in rows:
            store.upsert_ecu(row)

        print(f"\n{tag}ECU ROWS — {ingredient}, form={form}"
              + (" [DEMO]" if demo else "")
              + (" [+SR]" if with_sr else ""))
        print("-" * 74)
        for row in sorted(rows, key=lambda r: -(r["score"] or -999)):
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            score = "gated" if row["score"] is None else f"{row['score']:+d}"
            cov = (row.get("components") or {}).get("coverage")
            extra = f"  cov={cov}" if cov else ""
            print(f"{tag}{o.get('label', row['outcome_vocab_id']):<32}"
                  f"{score:>7}  {row['band']:<24} n={row['evidence']['n_primaries']}"
                  f"{extra}")
        print("-" * 74)
        if with_sr:
            print("Note: SRs only boost confidence (E'), never add fake trial mass.")
        print(f"\nWritten to {db}")

    mode = "grok"
    if demo:
        mode += "-demo"
    if with_sr:
        mode += "-sr"
    if grok:
        _auto_push_report(ingredient, form, mode)
    elif pilot:
        _auto_push_report(ingredient, form, "pilot" + ("-sr" if with_sr else ""))

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
