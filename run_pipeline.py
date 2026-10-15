#!/usr/bin/env python3
"""
End-to-end run: retrieve -> extract -> pool + GRADE (evidence method v2) -> report.

  .venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --intervention-scope --all-outcomes
  .venv/bin/python run_pipeline.py --help

Grades the FULL available corpus by default; `--limit N` opts into a sample.
Showcase top-N outcomes are chosen by Europe PMC RCT hit counts (most-studied
first), not a fixed marketing list; `--all-outcomes` grades every outcome.

This file only wires the stages together; each stage lives in bsproof/run/.
"""
from __future__ import annotations

import sys
import time

from pipeline import showcase as show
from pipeline import vocab
from pipeline.storage import Store

from bsproof.run.corpus import load_corpus, store_path
from bsproof.run.evidence import evidence_stage
from bsproof.run.extract import extract_stage
from bsproof.run.options import RunOptions, parse_args
from bsproof.run.report import finish


def _new_run_context(opts: RunOptions, product: dict, outcome_allowlist,
                     showcase_counts: dict) -> dict:
    return {
        "ingredient": opts.ingredient,
        "form": opts.form,
        "product": product,
        "scope": opts.scope,
        "showcase_outcomes": outcome_allowlist,
        "showcase_study_counts": {k: v for k, v in showcase_counts.items()
                                  if not str(k).startswith("_")},
        "studies_targeted": 0,
        "studies_ok": 0,
        "studies_skipped": 0,
        "studies_failed_partial": 0,
        "predatory": {},
        "studies_list": [],
        "agent_stats": {},
        "speed_report": "",
        "prompt_version": "",
        "concurrency": None,
        "studies_in_flight": None,
    }


def main(argv: list[str]) -> int:
    run_started = time.monotonic()
    opts = parse_args(argv)
    ingredient, form, dose_mg = opts.ingredient, opts.form, opts.dose_mg

    if not opts.wiring:
        # Imported here, not at module scope: a --wiring run must not load the
        # model boundary at all. preflight() checks the subscription is signed
        # in, which is the whole configuration story now.
        from bsproof import claude_adapter
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
        ingredient, top_n=opts.top_n, all_outcomes=opts.all_outcomes,
        counts_out=showcase_counts,
    )

    pv = vocab.population_variants()[0]
    product = {"ingredient": ingredient, "form_vocab_id": form,
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}},
               "dose_low_mg": dose_mg, "dose_high_mg": dose_mg}
    if dose_mg is None:
        print("\nNOTE: no --dose given, so the run's own letters cannot judge dose.")
    db = store_path(opts)
    run_context = _new_run_context(opts, product, outcome_allowlist, showcase_counts)

    with Store(db) as store:
        primaries, _n_available = load_corpus(store, opts, db, outcome_allowlist, run_context)
        extracted = extract_stage(store, opts, primaries, pv, outcome_allowlist, run_context)
        if isinstance(extracted, int):
            return extracted
        evidence_stage(opts, product, extracted, run_context)

    finish(opts, outcome_allowlist, run_context, run_started)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
