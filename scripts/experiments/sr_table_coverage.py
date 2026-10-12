#!/usr/bin/env python3
"""
Evidence method v2: would systematic-review TABLES supply per-arm numbers for
the trials we cannot read? Deterministic measurement -- network (Europe PMC /
PMC, disk-cached) only, NO MODEL.

    .venv/bin/python scripts/experiments/sr_table_coverage.py \\
        reports/runs/<id>_context.json [--json out/sr_table_coverage.json]

For every creatine synthesis in the store with a PMC full text:
  1. table rows that name a study ("Author (Year)", "Author et al. Year") and
     print >= 2 spread values ("m ± sd" or "m (sd)") in OUTCOME cells, i.e. not
     only age / BMI / height -- candidate per-arm outcome rows;
  2. the row's outcome family by keyword (strength / lean mass / power /
     endurance), else "other";
  3. the study matched to the corpus by first-author surname + year;
  4. for matched trials we ALSO read directly (the run's context), how many of
     our span-verified arm numbers are printed in the review's row -- a first
     measure of whether review tables carry the same numbers.

Heuristic by design (it decides whether a build is worth it, it feeds nothing).
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

LABEL = re.compile(r"\b([A-Z][A-Za-z'\-]{1,30})(?:\s+[A-Z]{1,3}\b)?(?:\s+et\s+al\.?)?,?\s*\(?((?:19|20)\d\d)[a-z]?\)?")
SPREAD = re.compile(r"-?\d+(?:\.\d+)?\s*(?:±|\+/-)\s*\d+(?:\.\d+)?|-?\d+\.\d+\s*\(\s*\d+\.\d+\s*\)")
NOT_OUTCOME = re.compile(r"\byears?\b|\bage\b|\bbmi\b|kg/m|\bheight\b|\bcm\b\s*tall", re.I)
FAMILIES = [
    ("muscle_strength", r"strength|press|squat|1\s*-?\s*rm|grip|extension|flexion|curl|deadlift|torque|mvc"),
    ("lean_body_mass", r"lean|fat[- ]free|ffm|lbm|muscle mass|muscle thickness|cross[- ]sectional"),
    ("muscle_power", r"jump|power|wingate|sprint|cmj|peak watt"),
    ("exercise_endurance", r"endurance|vo2|time trial|exhaustion|time to fatigue"),
]


def family(text: str) -> str:
    t = text.lower()
    return next((oid for oid, pat in FAMILIES if re.search(pat, t)), "other")


def outcome_rows(table: dict) -> list[tuple[str, int, str, list[str]]]:
    """(surname, year, family, row cells) for candidate per-arm outcome rows."""
    out, last = [], None
    for row in table.get("rows") or []:
        cells = [str(c) for c in row]
        text = " | ".join(cells)
        m = LABEL.search(cells[0] if cells else "") or LABEL.search(text)
        if m:
            last = (m.group(1).lower(), int(m.group(2)))
        elif not last:
            continue
        spreads = [c for c in cells if SPREAD.search(c) and not NOT_OUTCOME.search(c)]
        if len(spreads) >= 2 and last:
            out.append((last[0], last[1], family(text + " " + (table.get("caption") or "")), cells))
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("context", type=Path)
    ap.add_argument("--json", type=Path)
    args = ap.parse_args(argv)

    from bsproof.run.corpus import _OA_RANK
    from pipeline.relevance import relevance_check
    from pipeline.span_check import find_number
    from pipeline.storage import Store
    from sources import fulltext as ft

    with Store(ROOT / "out" / "bsproof.sqlite") as st:
        corpus = [s for s in st.studies(syntheses=False)
                  if s.get("design_rank") == 4 and relevance_check(s, "creatine")[0]]
        syn = [s for s in st.studies(syntheses=True) if s.get("pmcid")
               and "creatine" in ((s.get("title") or "") + (s.get("abstract") or "")).lower()]

    def readable(s):
        return (_OA_RANK.get((s.get("oa") or "").lower(), 9) <= 1
                or bool(s.get("oa_location") or s.get("full_text_urls")))

    idx: dict[tuple, list[dict]] = collections.defaultdict(list)
    for s in corpus:
        sur = re.split(r"[\s,]+", (s.get("first_author") or "").strip())[0].lower()
        if sur and s.get("year"):
            idx[(sur, int(s["year"]))].append(s)

    ctx = json.loads(args.context.read_text(encoding="utf-8"))
    direct: dict[str, list[float]] = {}
    for s in ctx["studies_list"]:
        vals = []
        for c in (s.get("extraction") or {}).get("s5_claims") or []:
            v = ((c.get("numbers_v2") or {}).get("verified") or {})
            vals += [x for k, x in v.items() if k.startswith(("mean_", "sd_", "post_", "pre_"))
                     and isinstance(x, (int, float))]
        if vals:
            direct[s["canonical_id"]] = vals

    reviews_ok = 0
    trials: dict[str, dict] = {}
    unmatched = collections.Counter()
    agreement = []
    fetch_failed = 0
    for s in syn:
        try:
            xml = ft.fetch_xml(s["pmcid"])
        except Exception:
            xml, fetch_failed = None, fetch_failed + 1
        if not xml:
            continue
        reviews_ok += 1
        for t in ft.extract_tables_structured(xml):
            for sur, yr, fam, cells in outcome_rows(t):
                hits = idx.get((sur, yr)) or []
                if len(hits) != 1:
                    unmatched["ambiguous" if hits else "not in corpus"] += 1
                    continue
                tr = hits[0]
                rec = trials.setdefault(tr["canonical_id"], {
                    "label": f"{sur} {yr}", "readable": readable(tr), "families": set(),
                    "reviews": set(), "rows": 0, "title": (tr.get("title") or "")[:90]})
                rec["families"].add(fam)
                rec["reviews"].add(s["pmcid"])
                rec["rows"] += 1
                ours = direct.get(tr["canonical_id"])
                if ours:
                    row = " | ".join(cells)
                    agreement.append(sum(find_number(x, row) is not None for x in ours) / len(ours))

    print(f"creatine reviews with PMC full text: {reviews_ok}/{len(syn)} (fetch errors {fetch_failed})")
    print(f"candidate per-arm outcome rows not matched: {dict(unmatched)}")
    print(f"corpus trials with review-table outcome rows: {len(trials)} "
          f"(locked: {sum(not t['readable'] for t in trials.values())}, "
          f"readable: {sum(t['readable'] for t in trials.values())})")
    by = collections.defaultdict(lambda: collections.Counter())
    for t in trials.values():
        for f in t["families"]:
            by[f]["locked" if not t["readable"] else "readable"] += 1
    print("\nper outcome family (trials):")
    for f in [x for x, _ in FAMILIES] + ["other"]:
        print(f"  {f:20} locked {by[f]['locked']:3}   readable {by[f]['readable']:3}")
    if agreement:
        full = sum(1 for a in agreement if a >= 0.999)
        print(f"\nagreement on trials we also read directly: {len(agreement)} row comparisons; "
              f"median share of our verified numbers printed in the review row "
              f"{sorted(agreement)[len(agreement) // 2]:.0%}; rows containing ALL of them {full}")
    if args.json:
        args.json.write_text(json.dumps({cid: {**t, "families": sorted(t["families"]),
                                                "reviews": sorted(t["reviews"])}
                                         for cid, t in trials.items()}, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
