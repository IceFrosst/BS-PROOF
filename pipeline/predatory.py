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

# A real list is ~1160 publishers. Anything under this is a truncated or
# placeholder file, and must be reported as BROKEN rather than as "no hits".
MIN_PLAUSIBLE_ENTRIES = 200


def list_ok(path: Path | None = None) -> bool:
    _, raw = _parse_txt(path or LIST_PATH)
    return len(raw) >= MIN_PLAUSIBLE_ENTRIES

ZERO_WEIGHT = False  # flag only for now


def _ensure_list_on_disk() -> None:
    """
    The list is a COMMITTED FILE, not something expanded at import time.

    It used to live as gzip+base64 chunks under pipeline/predatory_b64/ that
    expanded on first import. That never once worked: every commit of those
    chunks was TRUNCATED (4400 -> 1988 -> 0 -> 40 bytes across four commits, all
    described as "full list"), gzip refused them, the expander caught its own
    exception, and every run printed "list entries loaded: 0 / flagged: 0" --
    a clean bill of health the pipeline had not earned.

    Refresh it deliberately instead:

        python3 scripts/refresh_predatory_list.py
    """
    if LIST_PATH.exists() and list_ok():
        return
    print("  !! PREDATORY LIST MISSING OR TOO SMALL — every venue will read as "
          "clean, which is NOT the same as verified.\n"
          "     Run: python3 scripts/refresh_predatory_list.py")


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


# WHY THERE IS NO SUBSTRING MATCHING ANY MORE.
#
# This is a list of PUBLISHERS. Europe PMC gives us a JOURNAL title. Matching
# one inside the other is a category error, and thresholds do not rescue it --
# measured on the 2076-study corpus:
#
#     raw substring                 274 flagged (13.2%)
#     word-bounded, >=12 chars       47 flagged (2.3%)
#     exact title / ISSN only         see below
#
# Both of the first two flagged "American journal of obstetrics and gynecology",
# because the list contains the entry "american journal". The 13.2% run also
# flagged "Acta oto-LARyngologica" on the three-letter entry 'lar', and 69
# journals on 'e journal' (i.e. "THE JOURNAL of ...").
#
# Flagging a real journal as predatory is not a scoring error. It is a
# defamation-shaped error that would appear in a published report beside the
# journal's real name, and ZERO_WEIGHT would eventually delete that journal's
# evidence. Under-flagging is the correct failure direction, so:
#
#   journal title  ->  EXACT normalised equality only
#   publisher      ->  containment allowed; comparing publisher to publisher is
#                      what the list is actually for
#   ISSN           ->  exact
#
# Consequence, stated plainly: most true positives are unreachable until the
# retrieval layer carries a publisher field. That is a coverage gap, not a
# correctness problem, and it is recorded in docs/SPEC.md 13.
MIN_PUBLISHER_CHARS = 6


def is_predatory(journal: str | None = None, issn: str | None = None,
                 path: Path | None = None, publisher: str | None = None) -> bool:
    entries = load_list(path)
    if not entries:
        return False
    if issn and "issn:" + _norm_issn(issn) in entries:
        return True
    jt = _norm_title(journal or "")
    if jt and "title:" + jt in entries:
        return True
    pub = _norm_title(publisher or "")
    if pub and len(pub) >= MIN_PUBLISHER_CHARS:
        if "title:" + pub in entries:
            return True
        for e in entries:
            if e.startswith("title:"):
                name = e[6:]
                if len(name) >= MIN_PUBLISHER_CHARS and name in pub:
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
        hit = is_predatory(j, issn, path=path,
                           publisher=r.get("publisher"))
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
    n = summary.get("list_entries", 0)
    if n < MIN_PLAUSIBLE_ENTRIES:
        lines.append(f"  !! LIST BROKEN ({n} entries, expected >= "
                     f"{MIN_PLAUSIBLE_ENTRIES}). '0 flagged' above means "
                     f"NOT CHECKED, not clean.")
        lines.append("     Fix: python3 scripts/refresh_predatory_list.py")
    elif summary.get("studies_predatory", 0) == 0:
        lines.append("  note: the list is PUBLISHERS and Europe PMC gives a "
                     "JOURNAL title, so most true positives are unreachable")
        lines.append("        until records carry a publisher field. "
                     "Under-flagging is deliberate — see pipeline/predatory.py.")
    return "\n".join(lines)
