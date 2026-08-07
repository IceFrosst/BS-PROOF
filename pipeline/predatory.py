"""
Predatory journal check. NO MODEL.

List is committed in-repo (compressed). On first import, expands to
vocab/predatory_journals.txt — after `git pull` nothing else is needed.

Source: The Predatory Journals List 2025 (founder)
Human site: https://www.predatoryjournals.org/the-list/publishers

POLICY (2026-08-07): FLAG + COUNT only. Does not zero score weight.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIST_PATH = ROOT / "vocab" / "predatory_journals.txt"

_cache: set[str] | None = None
_raw_lines: list[str] | None = None

ZERO_WEIGHT = False  # flag only for now


def _ensure_list_on_disk() -> None:
    """Expand embedded list if vocab file is missing/small."""
    if LIST_PATH.exists() and LIST_PATH.stat().st_size > 10000:
        return
    try:
        from pipeline.predatory_data import materialize
        materialize(LIST_PATH)
        print(f"  predatory list expanded to {LIST_PATH.name}")
    except Exception as e:
        print(f"  !! could not expand predatory list: {e}")


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


def load_list(path: Path | None = None) -> set[str]:
    global _cache, _raw_lines
    if path is not None:
        entries, raw = _parse_txt(path)
        return entries

    if _cache is not None:
        return _cache

    _ensure_list_on_disk()
    entries, raw = _parse_txt(LIST_PATH)
    print(f"  predatory list: {len(raw)} journal titles loaded")
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
        if e.startswith("title:") and jt and len(jt) >= 12 and jt in e[6:]:
            return True
    return False


def flag_records(records: list[dict], path: Path | None = None) -> dict:
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
        "source": "The Predatory Journals List 2025 (in-repo)",
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
        lines.append("  !! list empty — check pipeline/predatory_data.py")
    return "\n".join(lines)
