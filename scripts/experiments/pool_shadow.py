#!/usr/bin/env python3
"""
Evidence method v2 SHADOW pooling report (pipeline/pool.py). NO MODEL CALLS.

    .venv/bin/python scripts/experiments/pool_shadow.py out/stability/A.json
    .venv/bin/python scripts/experiments/pool_shadow.py reports/runs/<run>_context.json [--json OUT]

Accepts a stability-harness file ({id: {record, extraction}}) or a run context
(`studies_list`, whose per-study record keeps arm-level facts and `numbers_v2`
since 2026-10-03; older runs have neither and pool nothing). Production v14
scores are not touched.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline import vocab                      # noqa: E402
from pipeline.grade import grade               # noqa: E402
from pipeline.pool import pool_outcomes         # noqa: E402


def items_from(path: Path) -> tuple[list[dict], str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "studies_list" in data:                  # a run context
        items = []
        for s in data["studies_list"]:
            ex = s.get("extraction") or {}
            if s.get("skipped") or not ex:
                continue
            outcomes = [{"outcome_vocab_id": c.get("outcome_vocab_id"), "discarded": c.get("discarded"),
                         "claim": c, "numbers_v2": c.get("numbers_v2")} for c in ex.get("s5_claims") or []]
            items.append({"id": s["canonical_id"], "record": {"ingredient": data.get("ingredient")},
                          "extraction": {"S3": ex.get("s3") or {}, "S4": ex.get("s4") or {},
                                         "S7": ex.get("s7") or {}, "outcomes": outcomes}})
        return items, data.get("ingredient"), data.get("form")
    items = [{"id": k, "record": v["record"], "extraction": v["extraction"]}
             for k, v in data.items() if isinstance(v, dict) and "record" in v]
    ingredient = next((i["record"].get("ingredient") for i in items), "creatine")
    return items, ingredient, f"{ingredient}_monohydrate" if ingredient == "creatine" else None


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("--form", help="product form vocabulary id (default: from the source)")
    ap.add_argument("--json", type=Path, help="write the full result as JSON")
    args = ap.parse_args(argv)
    items, ingredient, form = items_from(args.source)
    pv = vocab.population_variants()[0]
    product = {"ingredient": ingredient, "form_vocab_id": args.form or form,
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
    pools = pool_outcomes(items, product)
    print(f"SHADOW POOLING (evidence method v2) — {ingredient}, {len(items)} studies, "
          f"population '{pv['id']}'. Not a production score.\n")
    mcids = {o["id"]: o.get("mcid") for o in vocab.load("outcome")["outcomes"]}
    grades = {}
    for oid, p in pools.items():
        g = grades[oid] = grade(p, mcids.get(oid))
        print(f"{oid:<20} GRADE {g.letter:<3} benefit {g.benefit:<12} certainty {g.certainty.label}"
              + ("  ⚠ harm" if g.harm else "") + ("  (threshold-sensitive)" if g.threshold_sensitive else ""))
        for domain, (points, why) in g.certainty.downgrades.items():
            print(f"{'':<26}-{points} {domain}: {why}")
        s = p.smd
        head = (f"g = {s['estimate']:+.2f}  [{s['ci'][0]:+.2f}, {s['ci'][1]:+.2f}]  {s['method']}"
                if s else "no poolable effect")
        print(f"{oid:<20} k={p.k:<3} {head}")
        if s and s.get("prediction"):
            print(f"{'':<26}prediction interval [{s['prediction'][0]:+.2f}, {s['prediction'][1]:+.2f}]  "
                  f"I² = {s['i2']:.0%}")
        if p.refused:
            print(f"{'':<26}left out: " + "; ".join(f"{n}× {why}" for why, n in sorted(p.refused.items(), key=lambda kv: -kv[1])))
    if args.json:
        args.json.write_text(json.dumps({k: {"pool": v.__dict__, "grade": grades[k].__dict__}
                                         for k, v in pools.items()}, indent=1, default=lambda o: o.__dict__) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
