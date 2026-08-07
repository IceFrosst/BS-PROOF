#!/usr/bin/env python3
"""
Refresh vocab/predatory_journals.txt

Human reference (user-facing):
  https://www.predatoryjournals.org/the-list/publishers

Machine source (open CSV, same Beall-derived ecosystem — Google Sites
page is not scrapable without a browser):
  stop-predatory-journals publishers.csv on GitHub

    python scripts/refresh_predatory_list.py
"""
from __future__ import annotations

import csv
import io
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "vocab" / "predatory_journals.txt"
CSV_URL = (
    "https://raw.githubusercontent.com/stop-predatory-journals/"
    "stop-predatory-journals.github.io/master/_data/publishers.csv"
)
HUMAN_REF = "https://www.predatoryjournals.org/the-list/publishers"


def main() -> int:
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": "BS-PROOF/1.0"})
    raw = urllib.request.urlopen(req, timeout=90).read().decode("utf-8", errors="replace")
    rows = list(csv.DictReader(io.StringIO(raw)))
    names: list[str] = []
    seen: set[str] = set()
    for r in rows:
        n = (r.get("name") or "").strip()
        if len(n) < 2:
            continue
        k = n.lower()
        if k in seen:
            continue
        seen.add(k)
        names.append(n)
    names.sort(key=str.lower)
    header = (
        "# Predatory / questionable publishers — research-layer flag list\n"
        f"# Human reference: {HUMAN_REF}\n"
        "# Machine source: stop-predatory-journals publishers.csv (Beall-derived open data)\n"
        "# One name per line. Case-insensitive substring match on journal/publisher fields.\n"
        f"# Refresh: python scripts/refresh_predatory_list.py\n"
        f"# Entries: {len(names)}\n"
        "#\n"
    )
    OUT.write_text(header + "\n".join(names) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(names)} publishers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
