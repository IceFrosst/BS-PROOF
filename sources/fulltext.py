"""
Full-text retrieval and section extraction. NO MODEL MAY ENTER THIS FILE.

Europe PMC serves JATS XML for open-access records. JATS is structured, so
finding the methods section is parsing, not judgement -- and handing a subagent
the methods section instead of the whole paper matters for three reasons:

  1. S4 scores risk of bias from methods. Feeding it the discussion invites it
     to score the authors' confidence instead of their design.
  2. S5 must read results, where the numbers are, not the abstract's conclusion
     sentence, which is where the spin is.
  3. Cost. A full paper is 10-20x an extracted section, and every token is paid
     per study across thousands of studies.

This is also the input to SR-table inheritance: a systematic review's
characteristics-of-included-studies and risk-of-bias tables are what make one
open-access review worth ~15 unreadable primaries.
"""
from __future__ import annotations
import re
import xml.etree.ElementTree as ET

import httpx

from sources.http import CACHE_DIR, SourceError, _headers
from sources.ratelimit import throttle

FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"

# JATS section titles vary. Match on the normalised title, longest-specific
# first, because "materials and methods" also contains "methods".
SECTION_PATTERNS = {
    "methods": (r"^(materials?\s+and\s+)?methods?$", r"^methodology$",
                r"^patients?\s+and\s+methods?$", r"^subjects?\s+and\s+methods?$",
                r"^study\s+design"),
    "results": (r"^results?$", r"^findings?$", r"^results?\s+and\s+discussion$"),
    "discussion": (r"^discussion$", r"^conclusions?$"),
}


def fetch_xml(pmcid: str, *, timeout: int = 60, use_cache: bool = True) -> str | None:
    """
    JATS XML for a PMC id, or None if this record has no open full text.

    Returns None ONLY on 404 -- "not open access" is an answer. Any other
    failure raises, because "we could not fetch it" must never be recorded as
    "no full text exists": the first is transient, the second changes the OA
    factor and therefore the score.
    """
    if not pmcid:
        return None
    pmcid = pmcid.upper()
    if not pmcid.startswith("PMC"):
        pmcid = "PMC" + pmcid
    url = FULLTEXT.format(pmcid=pmcid)

    cache_file = CACHE_DIR / f"jats_{pmcid}.xml"
    if use_cache and cache_file.exists():
        return cache_file.read_text()

    throttle(url)
    try:
        r = httpx.get(url, headers=_headers(url), timeout=timeout,
                      follow_redirects=True)
    except httpx.HTTPError as e:
        raise SourceError(f"fulltext transport error for {pmcid}: {e}") from e

    if r.status_code == 404:
        return None
    if r.status_code >= 400:
        raise SourceError(f"http {r.status_code} for {pmcid}", status=r.status_code)
    if not r.text.lstrip().startswith("<"):
        return None

    if use_cache:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(r.text)
    return r.text


def _text(node) -> str:
    """All descendant text, whitespace-normalised. Tables become prose, which is
    lossy -- see extract_tables for the structured path."""
    return re.sub(r"\s+", " ", "".join(node.itertext())).strip()


def _match_section(title: str) -> str | None:
    t = re.sub(r"[^a-z\s]", "", title.lower()).strip()
    for name, patterns in SECTION_PATTERNS.items():
        if any(re.search(p, t) for p in patterns):
            return name
    return None


def sections(xml: str | None) -> dict[str, str]:
    """
    {'methods': ..., 'results': ..., 'discussion': ...} from JATS.

    Missing keys mean the section was not found, NOT that it is empty. Callers
    must fall back explicitly (full text > SR table > registry > abstract)
    rather than passing an empty string to a subagent, which would look like a
    paper that says nothing.
    """
    if not xml:
        return {}
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return {}

    out: dict[str, list[str]] = {}
    for sec in root.iter("sec"):
        title_el = sec.find("title")
        if title_el is None:
            continue
        name = _match_section(_text(title_el))
        if name:
            out.setdefault(name, []).append(_text(sec))
    return {k: "\n\n".join(v) for k, v in out.items() if v}


def abstract(xml: str | None) -> str | None:
    if not xml:
        return None
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    node = root.find(".//abstract")
    return _text(node) if node is not None else None


def extract_tables(xml: str | None) -> list[dict]:
    """
    Every table with its caption, as rows of cells.

    This is the SR-table inheritance path. A systematic review's
    characteristics-of-included-studies table is a TABLE, and flattening it to
    prose destroys the row/column structure that says which dose belongs to
    which trial. S2 gets the structure.
    """
    if not xml:
        return []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []

    tables = []
    for wrap in root.iter("table-wrap"):
        label = wrap.find("label")
        caption = wrap.find("caption")
        rows = []
        for tr in wrap.iter("tr"):
            cells = [_text(td) for td in list(tr) if td.tag in ("td", "th")]
            if cells:
                rows.append(cells)
        if rows:
            tables.append({
                "label": _text(label) if label is not None else None,
                "caption": _text(caption) if caption is not None else None,
                "rows": rows,
                "n_rows": len(rows),
            })
    return tables


def looks_like_included_studies(table: dict) -> bool:
    """
    Heuristic: is this an SR's characteristics-of-included-studies table?

    Deliberately a FILTER, not a decision. It narrows which tables S2 is shown
    so the call stays affordable; S2 decides what the table actually is. A
    heuristic that decided would be a model-free judgement about scientific
    content, which is exactly what this codebase does not do.
    """
    blob = " ".join(filter(None, [table.get("caption"), table.get("label")])).lower()
    if any(k in blob for k in ("included stud", "characteristics", "study characteristics",
                               "summary of stud", "trial characteristics")):
        return True
    header = " ".join(table["rows"][0]).lower() if table.get("rows") else ""
    signals = ("author", "year", "sample", "dose", "duration", "population",
               "intervention", "participants")
    return sum(1 for s in signals if s in header) >= 3


def best_text(record: dict, *, prefer: tuple[str, ...] = ("methods", "results")) -> tuple[str, str]:
    """
    The best available text for one record, plus the OA tier it earned.

    Returns (text, oa_tier) where oa_tier is a scoring.OA_FACTOR key. The tier
    is RETURNED rather than assumed because it multiplies w_study: a study read
    from its abstract must carry 0.55, and silently treating an abstract as full
    text would inflate every score built on it.
    """
    xml = fetch_xml(record.get("pmcid"))
    if xml:
        sec = sections(xml)
        chunks = [sec[k] for k in prefer if k in sec]
        if chunks:
            return "\n\n".join(chunks), "full_text"
        abs_text = abstract(xml)
        if abs_text:
            # Full text exists but has no parseable sections -- some publishers
            # ship unstructured JATS. Honest tier is abstract_only.
            return abs_text, "abstract_only"
    return (record.get("abstract") or ""), "abstract_only"
