#!/usr/bin/env python3
"""
Evidence method v2 benchmark (docs/EVIDENCE_METHOD.md §3 stage 8, §8).

    # re-fetch every source and check each quote + number (network, no model)
    .venv/bin/python scripts/benchmark_v2.py verify
    # compare a run's pooled estimates with the published ones (offline)
    .venv/bin/python scripts/benchmark_v2.py compare reports/runs/<id>_dashboard.json
    .venv/bin/python scripts/benchmark_v2.py compare --stability RSMOKE6

The rows are vocab/benchmarks.json; the comparison is pipeline/benchmark.py.
`verify` is the online half of `benchmark.check_row`: the quote must be in the
fetched abstract / full text / table (whitespace normalised -- PMC prints thin
spaces around numbers), and every number of the row must be in the quote.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline import benchmark  # noqa: E402


def _norm(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _source_texts(row: dict, cache: dict) -> dict:
    from sources import europepmc, fulltext
    key = row["pmcid"] or row["doi"]
    if key not in cache:
        hits = europepmc.search(f'DOI:"{row["doi"]}"', page_size=1, max_records=1)
        abstract = re.sub(r"<[^>]+>", "", (hits[0] if hits else {}).get("abstractText") or "")
        xml = fulltext.fetch_xml(row["pmcid"]) if row.get("pmcid") else None
        tables = [" | ".join(r) for t in fulltext.extract_tables_structured(xml) for r in t.get("rows", [])]
        cache[key] = {"abstract": _norm(abstract),
                      "full_text": _norm(" ".join(fulltext.sections(xml).values())) if xml else "",
                      "table": "\n".join(_norm(r) for r in tables)}
    return cache[key]


def verify(rows: list[dict]) -> int:
    cache: dict = {}
    bad = 0
    for row in rows:
        problems = benchmark.check_row(row)
        try:
            text = _source_texts(row, cache).get(row["quote_location"]) or ""
        except Exception as exc:  # a fetch failure is a failure, never a pass
            text, problems = "", problems + [f"fetch failed: {exc}"]
        if _norm(row["quote"]) not in text:
            problems.append(f"quote not found in the {row['quote_location']}")
        bad += bool(problems)
        print(f"{'FAIL' if problems else 'ok  '}  {row['id']:24} {row['doi']}" +
              ("".join(f"\n        {p}" for p in problems)))
    print(f"\n{len(rows) - bad}/{len(rows)} rows verified against their sources "
          f"({len({r['doi'] for r in rows})} meta-analyses)")
    return 1 if bad else 0


def _block_from_stability(label: str) -> dict:
    from pipeline import vocab
    from pipeline.evidence_v2 import summarise
    run = json.loads((ROOT / "out" / "stability" / f"{label}.json").read_text(encoding="utf-8"))
    pv = vocab.population_variants()[0]
    items = [{"id": cid, "record": r["record"], "extraction": r["extraction"]}
             for cid, r in run.items() if "extraction" in r]
    product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
    return summarise(items, product)


def _fmt(t) -> str:
    return "-" if t is None else f"{t[0]:+.2f} [{t[1]:+.2f}, {t[2]:+.2f}]"


def compare(block: dict | None, ingredient: str) -> int:
    results = benchmark.compare(block, benchmark.load(ingredient))
    for r in results:
        verdict = ("OVERLAP" if r["overlap"] else "NO OVERLAP") if r["comparable"] else "n/a"
        unit = f" {r['unit']}" if r["unit"] else ""
        print(f"{r['outcome']:16} {r['id']:22} {r['scale']}{unit:4} theirs {_fmt(r['theirs'])}  "
              f"ours {_fmt(r['ours'])} k={r['k'] if r['k'] is not None else '-'}  {verdict}"
              + (f"  ({r['reason']})" if r["reason"] else ""))
    print()
    for oid, s in benchmark.summary(results).items():
        print(f"{oid:16} {s['overlap']}/{s['comparable']} comparable rows overlap ({s['rows']} rows)")
    print("\nVERDICT (pipeline/benchmark.RULES: coverage, precision, agreement)")
    for v in benchmark.verdicts(block, results):
        cov = "-" if v["coverage"] is None else f"{v['coverage']:.0%}"
        print(f"{v['outcome']:16} {v['scale']:3}  {v['status'].upper():12} coverage {cov:>4}  "
              f"width x{v['width_ratio']:.1f}  overlap {v['overlap'][0]}/{v['overlap'][1]}"
              + (f"  ({'; '.join(v['reasons'])})" if v["reasons"] else ""))
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("verify")
    v.add_argument("--ingredient")
    c = sub.add_parser("compare")
    c.add_argument("artifact", nargs="?", type=Path, help="a run's *_dashboard.json")
    c.add_argument("--stability", help="an out/stability/<label>.json run instead")
    c.add_argument("--ingredient", default="creatine")
    args = ap.parse_args(argv)
    if args.cmd == "verify":
        return verify(benchmark.load(args.ingredient))
    if args.stability:
        block = _block_from_stability(args.stability)
    elif args.artifact:
        block = json.loads(args.artifact.read_text(encoding="utf-8")).get("evidence_v2")
    else:
        ap.error("compare needs an artifact or --stability LABEL")
    return compare(block, args.ingredient)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
