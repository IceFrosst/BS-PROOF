#!/usr/bin/env python3
"""
Build a DEV-ONLY preview of the evidence-v2 grade card from a stability run.
NO MODEL CALLS (the registry check reads ClinicalTrials.gov unless --no-registry).

    .venv/bin/python scripts/experiments/v2_preview.py out/stability/B.json
    EVIDENCE_V2_RUNS_DIR=out/v2_preview npm run dev      # then scan a creatine label

Writes out/v2_preview/<stamp>_<ingredient>_v2-preview_dashboard.json (gitignored,
never under reports/runs/: it is a 25-study shadow sample, not a run).
lib/analyze/grade-v2.ts reads that directory only when NODE_ENV is not
"production".
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline import vocab                       # noqa: E402
from pipeline.evidence_v2 import corpus_ncts, summarise  # noqa: E402
from pool_shadow import items_from               # noqa: E402

OUT = ROOT / "out" / "v2_preview"


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("--no-registry", action="store_true")
    args = ap.parse_args(argv)
    items, ingredient, form = items_from(args.source)
    pv = vocab.population_variants()[0]
    product = {"ingredient": ingredient, "form_vocab_id": form,
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}},
               "dose_low_mg": None, "dose_high_mg": None}
    registry = None
    if not args.no_registry:
        from pipeline.registry_bias import registry_check
        from sources.clinicaltrials import search_completed
        records = search_completed(ingredient)
        ncts = corpus_ncts(items)
        registry = {o["id"]: registry_check(records, ingredient, o.get("search_terms") or [], ncts)
                    for o in vocab.load("outcome")["outcomes"]}
    block = summarise(items, product, registry)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    run_id = f"{stamp}-preview-{args.source.stem}"
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{stamp}_{ingredient}_v2-preview_dashboard.json"
    dest.write_text(json.dumps({"run": {"id": run_id}, "product": {"ingredient": ingredient, "form": form},
                                "evidence_v2": block}, indent=1) + "\n")
    print(f"wrote {dest.relative_to(ROOT)}")
    for o in block["outcomes"]:
        print(f"  {o['outcome']:<22} {o['run_grade']['letter']:<3} k={o['k']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
