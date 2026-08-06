#!/usr/bin/env python3
"""
End-to-end v1 run: corpus -> extraction -> assembly -> scored ECU rows.

    python3 run_pipeline.py magnesium --form magnesium_glycinate            # live
    python3 run_pipeline.py magnesium --form magnesium_glycinate --wiring   # no key
    python3 run_pipeline.py creatine --form creatine_monohydrate --pilot    # subscription

TWO MODES, and the difference matters:

  live      calls the real subagents. Needs ANTHROPIC_API_KEY.
  --pilot   real extractions on subscription auth (labelled non-production).
  --wiring  SYNTHETIC extractor. Proves the code path only.

Pilot default --limit is 40 primary RCTs (~6-8 model calls each via S3–S8 + S6).
That is sized as a **single Claude Pro session-class batch**. If you hit rate
limits, pass --limit 20 (or lower). Raise only deliberately.

Reviews (umbrella / meta-analysis / systematic review) are **retrieved first**
and stored, but this runner scores **primary RCTs** (design_rank == 4). SR-table
inheritance is a separate path: `run_sr_inheritance.py` (S2).
"""
from __future__ import annotations
import os
import sys

from pipeline import vocab
from pipeline.assemble import build_ecus
from pipeline.storage import Store, DEFAULT_DB
from pipeline.retrieve import retrieve

WIRING_DB = DEFAULT_DB.parent / "wiring_demo.sqlite"

# Pilot batch size: one Pro-friendly run (not the whole literature).
# Per study ≈ S3,S4,S5,S7,S8 (+ S6 × claims). Measured non-bare calls are slow.
DEFAULT_PILOT_LIMIT = 40
DEFAULT_WIRING_SCORE_CAP = 40
RETRIEVE_MAX_PRIMARIES = 150
RETRIEVE_MAX_SYNTHESES = 50


def _pilot_db(ingredient, scope):
    """One store per (ingredient, scope). Mixing them makes yields unfalsifiable."""
    return DEFAULT_DB.parent / f"pilot_{ingredient}{'_supp' if scope == 'supplement' else ''}.sqlite"


SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"


def _best_text(record: dict) -> str:
    """
    Best available text for one study, via the ladder in sources/fulltext.
    Falls back to the abstract, which is honest but costs the 0.55 OA factor.
    """
    from sources import fulltext as ft
    try:
        text, _tier = ft.best_text(record)
    except Exception:
        text = record.get("abstract") or record.get("title") or ""
    return text or (record.get("title") or "")


def synthetic_extraction(record: dict, axes: dict) -> dict:
    """
    A fixed, obviously-fake extraction. Deliberately NOT randomised: a random
    stub produces a different score every run, which is the one property this
    system must never have.
    """
    return {
        "S3": {"n_randomised": 100, "population_axes": axes},
        "S4": {"item1_randomisation_method": 1, "item2_double_blind_placebo": 1,
               "item3_prospective_registration": None,
               "item4_outcome_matches_registry": None,
               "item5_attrition_ok": None, "item6_itt": 1},
        "S7": {"form_vocab_id": None},   # unspecified -> 0.30 transfer penalty
        "S8": {"funding_class": "undisclosed"},
        "outcomes": [
            {"claim": {"direction": "benefit", "magnitude": None},
             "outcome_vocab_id": "sleep_onset", "discarded": False},
            {"claim": {"direction": "null_effect", "magnitude": None},
             "outcome_vocab_id": "anxiety", "discarded": False},
        ],
    }


def main(argv: list[str]) -> int:
    args = list(argv)
    wiring = "--wiring" in args
    if wiring:
        args.remove("--wiring")
    pilot = "--pilot" in args
    if pilot:
        args.remove("--pilot")
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

    if not wiring and not pilot and not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set, so production extraction cannot run.")
        print("  --pilot   real extractions on subscription auth. Results are")
        print("            REAL but labelled pilot: not reproducible in the sense")
        print("            invariant 2 requires, and not for public claims.")
        print(f"            Default --limit {DEFAULT_PILOT_LIMIT} primary RCTs.")
        print("  --wiring  SYNTHETIC extractor. Proves the code path, says")
        print("            nothing about the ingredient.")
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

    db = WIRING_DB if wiring else (_pilot_db(ingredient, scope) if pilot else DEFAULT_DB)
    with Store(db) as store:
        if store.counts()["studies"] == 0:
            print(f"no corpus in {db.name}; retrieving...")
            print("  (syntheses are fetched BEFORE primaries — see pipeline/retrieve.py)")
            retrieve(ingredient, store,
                     max_syntheses=RETRIEVE_MAX_SYNTHESES,
                     max_primaries=RETRIEVE_MAX_PRIMARIES,
                     scope=scope)

        all_rows = store.studies(syntheses=False)
        syn_rows = store.studies(syntheses=True)
        primaries = [s for s in all_rows if s.get("design_rank") == 4]
        print(f"\nstore: {len(all_rows)} primaries, {len(syn_rows)} syntheses "
              f"(umbrella/MA/SR ranks 1–3); {len(primaries)} RCT-rank (4)")
        print("  note: this runner extracts RCT-rank primaries; SR inheritance "
              "is run_sr_inheritance.py (S2)")

        if wiring:
            print("\n" + "!" * 68)
            print("!! WIRING MODE. Every number below is SYNTHETIC and describes")
            print("!! nothing about this ingredient. It exercises the code path only.")
            print("!" * 68)
            extractions = [{"record": {**p, "_canonical": p["canonical_id"],
                                       "ingredient": ingredient},
                            "registry": store.registry_facts(p["registration_id"])
                                        if p.get("registration_id") else None,
                            "extraction": synthetic_extraction(p, axes)}
                           for p in primaries[:DEFAULT_WIRING_SCORE_CAP]]
            prompt_version = SYNTHETIC_VERSION
        elif pilot:
            import pilot_adapter as pa
            import workers
            if not pa.preflight():
                return 1
            print("\n" + "-" * 68)
            print("PILOT MODE. Extractions are REAL. Reproducibility is NOT")
            print("guaranteed: plugins and auto-memory load without --bare.")
            print("Not for public claims. Written to a separate store.")
            print(f"Batch size: {limit} (default {DEFAULT_PILOT_LIMIT}; "
                  f"override with --limit N if rate-limited).")
            print("-" * 68)
            targets = primaries[:limit]
            print(f"extracting {len(targets)} RCT-rank studies...")
            raw = workers.extract_corpus(
                [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
                 for p in targets],
                text_for=lambda r: _best_text(r),
                registry_for=lambda r: store.registry_facts(r["registration_id"])
                                       if r.get("registration_id") else None,
                call=lambda agent, payload: pa.call(agent, payload, verified=True))
            failed = [r for r in raw if r["extraction"].get("_failed")]
            if failed:
                n = sum(len(r["extraction"]["_failed"]) for r in failed)
                print(f"  !! {n} subagent calls FAILED across {len(failed)} studies")
                for r in failed[:3]:
                    for f in r["extraction"]["_failed"][:2]:
                        print(f"     {f['agent']}: {str(f['error'])[:70]}")
                print("     A failed call is not an empty study. Treat these rows")
                print("     as missing data, not as evidence of no effect.")
            skipped = [r for r in raw if r["extraction"].get("_skipped")]
            if skipped:
                print(f"  skipped {len(skipped)}/{len(raw)} studies with no usable "
                      f"text (no full text and no stored abstract)")
            extractions = [{"record": r["record"], "extraction": r["extraction"],
                            "registry": store.registry_facts(
                                r["record"]["registration_id"])
                                if r["record"].get("registration_id") else None}
                           for r in raw if not r["extraction"].get("_skipped")]
            if not extractions:
                print("\nNo study had usable text. Nothing to score -- this is a")
                print("retrieval problem, not a scoring one.")
                return 1
            prompt_version = f"{pa.PROMPT_VERSION}+{pa.PILOT_MARKER}"
        else:
            import workers
            import claude_adapter
            if not claude_adapter.preflight():
                return 1
            texts = {p["canonical_id"]: (p.get("title") or "") for p in primaries}
            raw = workers.extract_corpus(
                [{**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
                 for p in primaries[:DEFAULT_WIRING_SCORE_CAP]],
                text_for=lambda r: texts.get(r["_canonical"], ""))
            extractions = [{"record": r["record"], "extraction": r["extraction"],
                            "registry": store.registry_facts(r["record"]["registration_id"])
                                        if r["record"].get("registration_id") else None}
                           for r in raw]
            prompt_version = claude_adapter.PROMPT_VERSION
            print(claude_adapter.USAGE.report())

        rows = build_ecus(extractions, product, prompt_version=prompt_version)
        for row in rows:
            store.upsert_ecu(row)

        tag = "SYNTHETIC " if wiring else ("PILOT " if pilot else "")
        print(f"\n{tag}ECU ROWS — {ingredient}, form={form}, "
              f"population={product['population']['id']}")
        print("-" * 74)
        for row in sorted(rows, key=lambda r: -(r["score"] or -999)):
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            score = "gated" if row["score"] is None else f"{row['score']:+d}"
            print(f"{tag}{o.get('label', row['outcome_vocab_id']):<32}"
                  f"{score:>7}  {row['band']:<24} n={row['evidence']['n_primaries']}")
        print("-" * 74)
        print(f"dose_band: unbanded (band_version 0 — the dose axis is not live yet)")
        if wiring:
            print(f"\nWritten to {db} — the SYNTHETIC store, not the real one.")
        elif pilot:
            print(f"\nWritten to {db} — the PILOT store, not out/bsproof.sqlite.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
