"""
Predatory / excluded venue check. NO MODEL.

List: vocab/predatory_journals.txt
Human reference: https://www.predatoryjournals.org/the-list/publishers
Machine source (Google Sites not scrapable): stop-predatory-journals CSV

If the local list is empty, load_list() auto-refreshes once from the network.
On hit: predatory_venue=True → scoring weight 0.
"""
from __future__ import annotations

import re
import subprocess
import sys
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


def _parse_file(path: Path) -> tuple[set[str], list[str]]:
    entries: set[str] = set()
    raw: list[str] = []
    if not path.exists():
        return entries, raw
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        raw.append(line)
        if re.match(r"^\d{4}-?\d{3}[\dXx]$", line.replace(" ", "")):
            entries.add("issn:" + _norm_issn(line))
        else:
            entries.add("title:" + _norm_title(line))
    return entries, raw


def _auto_refresh() -> None:
    script = ROOT / "scripts" / "refresh_predatory_list.py"
    if not script.exists():
        return
    try:
        subprocess.run([sys.executable, str(script)], cwd=str(ROOT), check=False,
                       capture_output=True, timeout=120)
    except Exception:
        pass


def load_list(path: Path | None = None) -> set[str]:
    global _cache, _raw_lines
    path = path or LIST_PATH
    if _cache is not None and path == LIST_PATH:
        return _cache
    entries, raw = _parse_file(path)
    # Empty placeholder → pull open Beall-derived publisher list once
    if path == LIST_PATH and len(raw) < 10:
        print("  predatory list empty — auto-refreshing from open data…")
        _auto_refresh()
        entries, raw = _parse_file(path)
        print(f"  predatory list now has {len(raw)} entries")
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
    load_list(path)
    n_flagged = 0
    journals_flagged: set[str] = set()
    for r in records:
        j = (r.get("journal") or r.get("journal_name") or
             r.get("publisher") or "")
        issn = r.get("issn") or r.get("issn_print") or r.get("issn_electronic")
        hit = is_predatory(j, issn, path=path)
        r["predatory_venue"] = hit
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
        "source": "https://www.predatoryjournals.org/the-list/publishers",
    }


def format_summary(summary: dict) -> str:
    lines = [
        "PREDATORY VENUE CHECK",
        f"  list entries loaded:       {summary.get('list_entries', 0)}",
        f"  studies checked:           {summary.get('studies_checked', 0)}",
        f"  studies flagged:           {summary.get('studies_predatory', 0)}",
        f"  distinct journals flagged: {summary.get('journals_predatory_n', 0)}",
        f"  human ref: {summary.get('source', '')}",
    ]
    for j in (summary.get("journals_predatory") or [])[:15]:
        lines.append(f"    - {j}")
    if summary.get("list_entries", 0) == 0:
        lines.append("  !! list still empty — run: python scripts/refresh_predatory_list.py")
    return "\n".join(lines)
