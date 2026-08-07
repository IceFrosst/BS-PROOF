"""
Predatory journal check. NO MODEL.

List: vocab/predatory_journals.txt
  (The Predatory Journals List 2025 — founder-supplied)
Human site: https://www.predatoryjournals.org/the-list/publishers

POLICY (2026-08-07): FLAG + COUNT only.
  - Sets record['predatory_venue'] = True/False
  - Prints how many studies in the run matched
  - Does NOT zero scoring weight (venue_ok stays true for now)
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIST_PATH = ROOT / "vocab" / "predatory_journals.txt"
XLSX_PATH = ROOT / "vocab" / "The Predatory Journals List 2025.xlsx"

_cache: set[str] | None = None
_raw_lines: list[str] | None = None

# When False (current policy): flag only, still allow full weight.
# Set True later to hard-zero predatory venues in scoring.
ZERO_WEIGHT = False


def _norm_title(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _norm_issn(s: str) -> str:
    return re.sub(r"[^0-9Xx]", "", (s or ""))


def _parse_txt(path: Path) -> tuple[set[str], list[str]]:
    entries: set[str] = set()
    raw: list[str] = []
    if not path.exists():
        return entries, raw
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if re.fullmatch(r"\d+(\.\d+)?", line):
            continue
        raw.append(line)
        if re.match(r"^\d{4}-?\d{3}[\dXx]$", line.replace(" ", "")):
            entries.add("issn:" + _norm_issn(line))
        else:
            entries.add("title:" + _norm_title(line))
    return entries, raw


def _parse_xlsx(path: Path) -> tuple[set[str], list[str]]:
    try:
        import openpyxl
    except ImportError:
        return set(), []
    if not path.exists():
        return set(), []
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    raw: list[str] = []
    seen: set[str] = set()
    entries: set[str] = set()
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
        raw.append(text)
        entries.add("title:" + _norm_title(text))
    return entries, raw


def load_list(path: Path | None = None) -> set[str]:
    global _cache, _raw_lines
    if path is not None:
        entries, raw = _parse_txt(path)
        return entries

    if _cache is not None:
        return _cache

    # Prefer founder xlsx if present, else txt
    if XLSX_PATH.exists():
        entries, raw = _parse_xlsx(XLSX_PATH)
        print(f"  predatory list: {len(raw)} titles from xlsx")
    else:
        entries, raw = _parse_txt(LIST_PATH)
        print(f"  predatory list: {len(raw)} titles from txt")

    _cache, _raw_lines = entries, raw
    return entries


def list_size() -> int:
    load_list()
    return len(_raw_lines or [])


def is_predatory(journal: str | None = None, issn: str | None = None,
                path: Path | None = None) -> bool:
    entries = load_list(path)
    if not entries:
        return False
    if issn:
        key = "issn:" + _norm_issn(issn)
        if key in entries:
            return True
    jt = _norm_title(journal or "")
    if not jt:
        return False
    for e in entries:
        if e.startswith("title:") and e[6:] and e[6:] in jt:
            return True
        # also try reverse: journal contained in list title (short journal names)
        if e.startswith("title:") and jt and jt in e[6:] and len(jt) >= 12:
            return True
    return False


def flag_records(records: list[dict], path: Path | None = None) -> dict:
    """
    Mutates records: predatory_venue True/False.
    Does NOT clear venue_ok / weight unless ZERO_WEIGHT is True.
    """
    load_list(path)
    n_flagged = 0
    journals_flagged: set[str] = set()
    for r in records:
        j = (r.get("journal") or r.get("journal_name") or
             r.get("publisher") or "")
        issn = r.get("issn") or r.get("issn_print") or r.get("issn_electronic")
        hit = is_predatory(j, issn, path=path)
        r["predatory_venue"] = hit
        if ZERO_WEIGHT:
            r["venue_ok"] = not hit
        # else: leave venue_ok alone — flag only
        if hit:
            n_flagged += 1
            if j:
                journals_flagged.add(str(j).strip())
    return {
        "list_entries": list_size(),
        "studies_checked": len(records),
        "studies_predatory": n_flagged,
        "journals_predatory": sorted(journals_flagged),
        "journals_predatory_n": len(journals_flagged),
        "zero_weight": ZERO_WEIGHT,
        "source": "The Predatory Journals List 2025 (founder)",
    }


def format_summary(summary: dict) -> str:
    lines = [
        "PREDATORY VENUE CHECK (flag only — not in score)",
        f"  list entries loaded:       {summary.get('list_entries', 0)}",
        f"  studies in this run:       {summary.get('studies_checked', 0)}",
        f"  studies flagged predatory: {summary.get('studies_predatory', 0)}",
        f"  distinct journals flagged: {summary.get('journals_predatory_n', 0)}",
        f"  affects score:             {'YES' if summary.get('zero_weight') else 'NO (count only)'}",
    ]
    for j in (summary.get("journals_predatory") or [])[:20]:
        lines.append(f"    - {j}")
    if summary.get("list_entries", 0) == 0:
        lines.append("  !! list empty — place xlsx or txt under vocab/")
    return "\n".join(lines)
