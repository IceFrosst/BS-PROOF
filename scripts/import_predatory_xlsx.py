#!/usr/bin/env python3
"""Import The Predatory Journals List 2025.xlsx → vocab/predatory_journals.txt"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "vocab" / "The Predatory Journals List 2025.xlsx"
OUT = ROOT / "vocab" / "predatory_journals.txt"


def main() -> int:
    try:
        import openpyxl
    except ImportError:
        print("pip install openpyxl")
        return 1
    if not XLSX.exists():
        print(f"Missing {XLSX}")
        print("Copy The Predatory Journals List 2025.xlsx into vocab/")
        return 1
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb.active
    names: list[str] = []
    seen: set[str] = set()
    for row in ws.iter_rows(values_only=True):
        vals = [v for v in row if v is not None and str(v).strip()]
        if not vals:
            continue
        if len(vals) >= 2 and str(vals[0]).strip().replace(".", "", 1).isdigit():
            text = str(vals[1]).strip()
        else:
            text = max((str(v).strip() for v in vals), key=len)
        if len(text) < 2 or re.fullmatch(r"\d+(\.\d+)?", text):
            continue
        k = text.lower()
        if k in seen:
            continue
        seen.add(k)
        names.append(text)
    header = (
        "# The Predatory Journals List 2025 (founder-supplied)\n"
        "# Policy: FLAG + COUNT only — does not change score yet.\n"
        f"# Entries: {len(names)}\n#\n"
    )
    OUT.write_text(header + "\n".join(names) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(names)} titles)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
