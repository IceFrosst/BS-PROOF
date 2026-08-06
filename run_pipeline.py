#!/usr/bin/env python3
"""
End-to-end v1 run: corpus -> extraction -> assembly -> scored ECU rows.

    python3 run_pipeline.py creatine --form creatine_monohydrate --wiring
    python3 run_pipeline.py creatine --form creatine_monohydrate --pilot
    python3 run_pipeline.py creatine --form creatine_monohydrate --grok

Modes:
  --wiring  SYNTHETIC extractions — plumbing only
  --pilot   Claude subscription pilot (not production)
  --grok    Grok Build CLI pure-function path (separate store; test vs Claude)
  (default) Claude production — needs ANTHROPIC_API_KEY + --bare

Default --limit = 40 RCT-rank primaries.
Never mix Claude and Grok rows in one score without an explicit compare step.
"""
from __future__ import annotations
import os
import sys

from pipeline import vocab
from pipeline.assemble import build_ecus
from pipeline.storage import Store, DEFAULT_DB
from pipeline.retrieve import retrieve

WIRING_DB = DEFAULT_DB.parent / "wiring_demo.sqlite"

DEFAULT_PILOT_LIMIT = 40
DEFAULT_WIRING_SCORE_CAP = 40
RETRIEVE_MAX_PRIMARIES = 150
RETRIEVE_MAX_SYNTHESES = 50
SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"


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
    if sum([wiring, pilot, grok]) > 1:
        print("Pick only one of --wiring, --pilot, --grok")
        return 1

    scope = "supplement" if "--supplement-scope" in args else "broad"
    if scope == "supplement":
        args.remove("--supplement-scope")
    limit = DEFAULT_PILOT_LIMIT
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
        print("  --wiring  synthetic (no AI)")
        print("  --pilot   Claude subscription pilot")
        print("  --grok    Grok Build CLI pure-function (grok login or XAI_API_KEY)")
        print("  default   Claude production needs ANTHROPIC_API_KEY")
        return 1

    if vocab.form(ingredient, form) is None:
        print(f"unknown form {form!r} for {ingredient}. Known forms:")
        for f in vocab.forms_for(ingredient):
            print("   ", f["id"])
        return 1

    pv = vocab.population_variants()[0]
    product = {"ingredient": ingredient, "form_vocab_id": form,
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
    axes = {a: pv[a] for a in vocab.AXES}

    if wiring:
        db = WIRING_DB
    elif grok:
        db = _grok_db(ingredient, scope)
    elif pilot:
        db = _pilot_db(ingredient, scope)
    else:
        db = DEFAULT_DB

    with Store(db) as store:
        if store.counts()["studies"] == 0:
            print(f"no corpus in {db.name}; retrieving...")
            retrieve(ingredient, store,
                     max_syntheses=RETRIEVE_MAX_SYNTHESES,
                     max_primaries=RETRIEVE_MAX_PRIMARIES,
                     scope=scope)

        all_rows = store.studies(syntheses=False)
        syn_rows = store.studies(syntheses=True)
        primaries = [s for s in all_rows if s.get("design_rank") == 4]
        print(f"\nstore: {len(all_rows)} primaries, {len(syn_rows)} syntheses; "
              f"{len(primaries)} RCT-rank (4)")

        if wiring:
            print("\n!! WIRING MODE — SYNTHETIC numbers only !!\n")
            extractions = [{
                "record": {**p, "_canonical": p["canonical_id"], "ingredient": ingredient},
                "registry": store.registry_facts(p["registration_id"])
                            if p.get("registration_id") else None,
                "extraction": synthetic_extraction(p, axes),
            } for p in primaries[:DEFAULT_WIRING_SCORE_CAP]]
            prompt_version = SYNTHETIC_VERSION
            tag = "SYNTHETIC "
        elif pilot or grok:
            import workers
            if grok:
                import grok_adapter as ga
                if not ga.preflight():
                    return 1
                print("\n" + "-" * 68)
                print("GROK MODE — Grok Build CLI pure-function path")
                print("Separate store. Do not merge with Claude scores.")
                print(f"Batch size: {limit}")
                print("-" * 68)
                call_fn = ga.call
                prompt_version = f"{ga.PROMPT_VERSION}+{ga.PROVENANCE}"
                tag = "GROK "
            else:
                import pilot_adapter as pa
                if not pa.preflight():
                    return 1
                print("\n" + "-" * 68)
                print("PILOT MODE — Claude subscription (not production)")
                print(f"Batch size: {limit}")
                print("-" * 68)
                call_fn = lambda agent, payload: pa.call(agent, payload, verified=True)
                prompt_version = f"{pa.PROMPT_VERSION}+{pa.PILOT_MARKER}"
                tag = "PILOT "

            targets = primaries[:limit]
            print(f"extracting {len(targets)} RCT-rank studies...")
            raw = workers.extract_corpus(
                [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
                 for p in targets],
                text_for=lambda r: _best_text(r),
                registry_for=lambda r: store.registry_facts(r["registration_id"])
                                       if r.get("registration_id") else None,
                call=call_fn,
            )
            _report_failures(raw)
            extractions = [{
                "record": r["record"],
                "extraction": r["extraction"],
                "registry": store.registry_facts(r["record"].get("registration_id"))
                            if r["record"].get("registration_id") else None,
            } for r in raw if not r["extraction"].get("_skipped")]
            if not extractions:
                print("No study had usable text — retrieval problem, not scoring.")
                return 1
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
            print(claude_adapter.USAGE.report())

        rows = build_ecus(extractions, product, prompt_version=prompt_version)
        for row in rows:
            store.upsert_ecu(row)

        print(f"\n{tag}ECU ROWS — {ingredient}, form={form}, "
              f"population={product['population']['id']}")
        print("-" * 74)
        for row in sorted(rows, key=lambda r: -(r["score"] or -999)):
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            score = "gated" if row["score"] is None else f"{row['score']:+d}"
            print(f"{tag}{o.get('label', row['outcome_vocab_id']):<32}"
                  f"{score:>7}  {row['band']:<24} n={row['evidence']['n_primaries']}")
        print("-" * 74)
        print(f"dose_band: unbanded (band_version 0)")
        print(f"\nWritten to {db}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
