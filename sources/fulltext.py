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
import hashlib
import io
import json
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


# Over-matching here is CHEAP (S2 is shown one extra table and is told to ignore
# what it is not); under-matching is FATAL (the row structure never reaches S2 at
# all, and s2_payload's fallback then ships every table in the paper). So both
# lists are deliberately generous. "included" is listed bare because reviews
# write "included systematic reviews", "included trials", "studies included in
# the meta-analysis" -- the old literal "included stud" matched none of them.
CAPTION_SIGNALS = (
    "included", "characteristics", "summary of stud", "summary of find",
    "trial characteristics", "study characteristics", "eligible stud",
    "overview of stud", "description of stud", "quality assessment",
    "risk of bias", "certainty of evidence", "grade",
)
HEADER_SIGNALS = (
    "author", "year", "sample", "dose", "duration", "population",
    "intervention", "participants", "patient", "trial", "stud", "reference",
    "design", "country", "follow", "comparator", "control", "outcome",
    "treatment", "arm", "group", "age", "sex", "n =", "no.", "citation",
)


def looks_like_included_studies(table: dict) -> bool:
    """
    Heuristic: is this an SR's characteristics-of-included-studies table?

    Deliberately a FILTER, not a decision. It narrows which tables S2 is shown
    so the call stays affordable; S2 decides what the table actually is. A
    heuristic that decided would be a model-free judgement about scientific
    content, which is exactly what this codebase does not do.
    """
    blob = " ".join(filter(None, [table.get("caption"), table.get("label")])).lower()
    if any(k in blob for k in CAPTION_SIGNALS):
        return True
    # Headers are frequently split across two rows (a spanning group header over
    # a column header), so scan both. Measured 2026-08-07 on three real OA
    # reviews: the old single-row scan returned False on 14 of 14 tables,
    # including "Treatment option | Reviews (n) | Patient (n) | Author, year" --
    # which scored 2 because the signal list said "participants" and the table
    # said "Patient".
    rows = table.get("rows") or []
    header = " ".join(c for row in rows[:2] for c in row).lower()
    return sum(1 for s in HEADER_SIGNALS if s in header) >= 3


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

    # RUNG 2: free locations Europe PMC already told us about, in the response
    # we had. Measured 2026-08-07: 4 of 63 records marked abstract_only listed a
    # Free/pdf or Open-access/html URL we were discarding.
    for loc in (record.get("full_text_urls") or []):
        url, style = loc.get("url"), (loc.get("style") or "")
        text = (fetch_pdf_text(url) if style == "pdf"
                else fetch_html_text(url) if style == "html" else None)
        if text:
            return text, "full_text"

    # RUNG 3: green OA found by OpenAlex/Unpaywall. Measured: 20% of closed
    # records with a DOI have a reachable copy. Only attempted when a caller
    # opts in -- it is an HTTP call per record and the disk cache makes the
    # SECOND run free, not the first.
    loc = record.get("oa_location")
    if isinstance(loc, str):          # storage round-trips it as JSON text
        try:
            loc = json.loads(loc)
        except (ValueError, TypeError):
            loc = None
    if loc:
        url = loc.get("url") or ""
        text = (fetch_pdf_text(url) if url.lower().endswith(".pdf")
                else fetch_html_text(url))
        if text:
            return text, "full_text"

    return (record.get("abstract") or ""), "abstract_only"


# ----------------------------------------------------- beyond Europe PMC JATS

# pypdf is optional at runtime. A machine without it still runs the whole
# pipeline -- it just cannot read PDFs, and says so once rather than crashing
# mid-batch. Grok and Claude run on different machines; a hard import would make
# the pipeline machine-dependent, which is what invariant 2 exists to prevent.
try:
    from pypdf import PdfReader
    _PDF_OK = True
except ImportError:  # pragma: no cover
    PdfReader = None
    _PDF_OK = False

MIN_USABLE_CHARS = 1500      # below this a "full text" is a landing page stub
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def pdf_available() -> bool:
    return _PDF_OK


def fetch_pdf_text(url: str, *, timeout: int = 90) -> str | None:
    """
    Download a PDF and extract its text. None when unusable.

    Returns None rather than a stub for the same reason S3 refuses to guess:
    a 200-character extraction is a cover page, and handing that to S4 as if it
    were a methods section produces confident nonsense.
    """
    if not _PDF_OK or not url:
        return None
    import httpx
    from sources.http import _headers
    cache = CACHE_DIR / f"pdf_{hashlib.sha256(url.encode()).hexdigest()[:24]}.txt"
    if cache.exists():
        t = cache.read_text(errors="replace")
        return t if len(t) >= MIN_USABLE_CHARS else None
    try:
        throttle(url)
        r = httpx.get(url, headers=_headers(url), timeout=timeout,
                      follow_redirects=True)
        if r.status_code >= 400 or not r.content[:5].startswith(b"%PDF"):
            return None
        text = "\n".join((p.extract_text() or "")
                         for p in PdfReader(io.BytesIO(r.content)).pages)
    except Exception:
        # A malformed PDF is a dead end, not a pipeline failure. Callers fall
        # back down the ladder.
        return None
    text = _WS.sub(" ", text).strip()
    if len(text) < MIN_USABLE_CHARS:
        return None
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(text)
    return text


def fetch_html_text(url: str, *, timeout: int = 60) -> str | None:
    """Strip tags from an open-access HTML article. Crude but adequate: the
    subagents want prose, not structure, and JATS is preferred whenever it
    exists."""
    if not url:
        return None
    import httpx
    from sources.http import _headers
    cache = CACHE_DIR / f"html_{hashlib.sha256(url.encode()).hexdigest()[:24]}.txt"
    if cache.exists():
        t = cache.read_text(errors="replace")
        return t if len(t) >= MIN_USABLE_CHARS else None
    try:
        throttle(url)
        r = httpx.get(url, headers=_headers(url), timeout=timeout,
                      follow_redirects=True)
        if r.status_code >= 400:
            return None
        body = re.sub(r"(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>", " ", r.text)
        text = _WS.sub(" ", _TAG.sub(" ", body)).strip()
    except Exception:
        return None
    if len(text) < MIN_USABLE_CHARS:
        return None
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(text)
    return text
