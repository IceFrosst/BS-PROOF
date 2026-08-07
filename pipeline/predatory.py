"""
Predatory / excluded venue check. NO MODEL.

List file: vocab/predatory_journals.txt  (one title or ISSN per line)
Match: case-insensitive; title substring OR exact ISSN digits.

On hit: record['predatory_venue']=True → scoring weight 0 (venue_ok=False).
Also counted for research-layer reports (how many journals / studies flagged).
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIST_PATH = ROOT / "vocab" / "predatory_journals.txt"

_cache: set[str] | None = None
_raw_lines: list[str] | None = None


def _norm_title(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _norm_issn(s: str) -> str:
    return re.sub(r"[^0-9Xx]", "", (s or ""))


def load_list(path: Path | None = None) -> set[str]:
    global _cache, _raw_lines
    path = path or LIST_PATH
    if _cache is not None and path == LIST_PATH:
        return _cache
    entries: set[str] = set()
    raw: list[str] = []
    if not path.exists():
        _cache, _raw_lines = entries, raw
        return entries
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        raw.append(line)
        # ISSN-like
        if re.match(r"^\d{4}-?\d{3}[\dXx]$", line.replace(" ", "")):
            entries.add("issn:" + _norm_issn(line))
        else:
            entries.add("title:" + _norm_title(line))
    if path == LIST_PATH:
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
    return False


def flag_records(records: list[dict], path: Path | None = None) -> dict:
    """
    Mutates records: sets predatory_venue True/False.
    Returns summary counts for the research-layer report.
    """
    load_list(path)
    n_flagged = 0
    journals_flagged: set[str] = set()
    for r in records:
        j = r.get("journal") or r.get("journal_name") or ""
        issn = r.get("issn") or r.get("issn_print") or r.get("issn_electronic")
        hit = is_predatory(j, issn, path=path)
        r["predatory_venue"] = hit
        if hit:
            n_flagged += 1
            if j:
                journals_flagged.add(j.strip())
    return {
        "list_entries": list_size(),
        "studies_checked": len(records),
        "studies_predatory": n_flagged,
        "journals_predatory": sorted(journals_flagged),
        "journals_predatory_n": len(journals_flagged),
    }


def format_summary(summary: dict) -> str:
    lines = [
        "PREDATORY VENUE CHECK",
        f"  list entries loaded:     {summary.get('list_entries', 0)}",
        f"  studies checked:         {summary.get('studies_checked', 0)}",
        f"  studies flagged:         {summary.get('studies_predatory', 0)}",
        f"  distinct journals flagged: {summary.get('journals_predatory_n', 0)}",
    ]
    for j in (summary.get("journals_predatory") or [])[:15]:
        lines.append(f"    - {j}")
    if summary.get("list_entries", 0) == 0:
        lines.append("  !! vocab/predatory_journals.txt is empty — add your list.")
    return "\n".join(lines)
