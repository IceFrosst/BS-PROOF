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
"""
from __future__ import annotations
import hashlib
import io
import json
import re
import xml.etree.ElementTree as ET

from sources.http import CACHE_DIR, SourceError, _headers, secret
from sources.ratelimit import throttle

FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"

# JATS section titles vary. Match on the normalised title, longest-specific
# first, because "materials and methods" also contains "methods".
SECTION_PATTERNS = {
    "methods": (r"^(materials?\s+and\s+)?methods?$", r"^methodology$",
                r"^patients?\s+and\s+methods?$", r"^subjects?\s+and\s+methods?$",
                r"^study\s+design",
                # MDPI's older template. MEASURED 2026-10-26: 3 creatine RCTs
                # (PMC6265971, PMC5707641, PMC4808872) title their methods
                # "2. Experimental Section"; every agent read them without
                # methods and S4 returned all nulls.
                r"^experimental\s+(section|design|procedures?)$"),
    "results": (r"^results?$", r"^findings?$", r"^results?\s+and\s+discussion$"),
    "discussion": (r"^discussion$", r"^conclusions?$"),
    # LIMITATIONS. Added 2026-08-10 (v1.12). The self-declared-underpowered
    # statement invariant 7 depends on lives here -- "only 33 participants
    # completed the study which decreased our statistical power" -- and
    # best_text was METHODS ++ RESULTS, so S3 could never see it. That exact
    # paper (PMC12280466) is the literal "33 of 42" example cited in CLAUDE.md,
    # and it voted -0.7 against creatine because the refusal never fired.
    "limitations": (r"^(study\s+)?limitations?$", r"^strengths?\s+and\s+limitations",
                    r"^limitations?\s+(and|of)\b"),
    # FUNDING / COI. Added 2026-08-09 because S8 could not possibly have been
    # working: best_text returns METHODS ++ RESULTS, neither of which states who
    # paid. Measured on 7 creatine RCTs -- 0/7 of the texts sent to S8 contained
    # any of fund|grant|sponsor|conflict of interest|acknowledg|disclosure, so
    # every study fell through to funding='undisclosed' (0.80 weight) while S8
    # burned the largest output-token count of any agent to get there.
    "funding": (r"^funding$", r"^financial support", r"^funding sources?$",
                r"^acknowledge?ments?$", r"^conflicts? of interest",
                r"^declarations? of (competing|conflicting) interest",
                r"^competing interests?$", r"^disclosures?$",
                r"^role of the funding source"),
}

# JATS keeps funding OUT of <sec> far more often than in it. These are the
# elements that actually carry it, and missing them is why adding the section
# titles alone would not have been enough.
_FUNDING_ELEMENTS = ("funding-group", "funding-statement", "ack",
                     "conflict", "author-notes")


def fetch_xml(pmcid: str, *, timeout: int = 60, use_cache: bool = True,
              retries: int = 3) -> str | None:
    """
    JATS XML for a PMC id, or None if this record has no open full text.

    Returns None ONLY on 404 -- "not open access" is an answer. Any other
    failure raises, because "we could not fetch it" must never be recorded as
    "no full text exists": the first is transient, the second changes what is
    read and verified.

    Transport errors, 429 and 5xx are retried with backoff (like
    sources/http.get_json) before raising. Measured 2026-10-15: one failed fetch
    during the span check silently refused two creatine trials' table numbers
    and moved strength from k = 9 C- to k = 7 I (docs/DECISIONS.md, item 2).
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

    # Lazy, like the PDF and HTML fetchers below: JATS parsing is pure and must
    # be testable without httpx installed. See the note in sources/http.py.
    import httpx

    import time
    r, last = None, None
    for attempt in range(max(1, retries)):
        throttle(url)
        try:
            r = httpx.get(url, headers=_headers(url), timeout=timeout,
                          follow_redirects=True)
        except httpx.HTTPError as e:
            last, r = SourceError(f"fulltext transport error for {pmcid}: {e}"), None
            time.sleep(2 ** attempt)
            continue
        if r.status_code == 429 or r.status_code >= 500:
            last = SourceError(f"http {r.status_code} for {pmcid}", status=r.status_code)
            time.sleep(2 ** attempt * 2)
            continue
        break
    if r is None or r.status_code == 429 or r.status_code >= 500:
        raise last

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

    # Funding again, from the elements JATS actually uses for it. A paper can
    # carry a <funding-group> and no Funding <sec> at all, which is the common
    # case and the reason S8 was blind.
    for tag in _FUNDING_ELEMENTS:
        for el in root.iter(tag):
            t = _text(el)
            if t and t not in out.get("funding", []):
                out.setdefault("funding", []).append(t)
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

    Tables ride along in the S5 and S7 payloads (worker_payload._tables_text):
    endpoint means / SDs and dosing protocols live there, and flattening a
    table to prose destroys the row/column structure that says which value
    belongs to which arm.
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


def _expand_grid(trs) -> list[list[str]]:
    """Expand tr elements into a rectangular text grid honouring col/rowspan.

    Cells with ``colspan=N`` repeat their text across N columns and
    ``rowspan=M`` carries it down M rows, so a group header such as
    ``Creatine`` over ``Pre | Post`` reaches every column it governs.
    Malformed span attributes fall back to 1 (never guessed larger).
    """
    grid: list[list[str]] = []
    carry: dict[int, tuple[str, int]] = {}  # col -> (text, rows remaining)
    for tr in trs:
        row: list[str] = []
        col = 0
        cells = [td for td in list(tr) if td.tag in ("td", "th")]
        idx = 0
        while idx < len(cells) or col in carry:
            if col in carry:
                text, left = carry.pop(col)
                row.append(text)
                if left > 1:
                    carry[col] = (text, left - 1)
                col += 1
                continue
            if idx >= len(cells):
                break
            td = cells[idx]
            idx += 1
            text = _text(td)
            try:
                colspan = max(1, int(td.get("colspan", "1")))
            except ValueError:
                colspan = 1
            try:
                rowspan = max(1, int(td.get("rowspan", "1")))
            except ValueError:
                rowspan = 1
            for _ in range(colspan):
                row.append(text)
                if rowspan > 1:
                    carry[col] = (text, rowspan - 1)
                col += 1
        # Flush any remaining carried columns beyond the last explicit cell.
        while col in carry:
            text, left = carry.pop(col)
            row.append(text)
            if left > 1:
                carry[col] = (text, left - 1)
            col += 1
        if row:
            grid.append(row)
    return grid


def extract_tables_structured(xml: str | None) -> list[dict]:
    """Colspan/rowspan-expanded tables with merged multi-row headers.

    Consumer: the v2 span check via workers._tables_structured (and
    scripts/benchmark_v2.py).  This function must NOT feed any model
    payload -- S5 keeps extract_tables/_tables_text unchanged so the LLM
    cache keys are stable.

    Header rows are the <thead> rows when present (else the first body row).
    Multiple header rows merge column-wise into composite labels joined with
    ' — ' (e.g. 'Creatine — Post'), preserving the structure that the flat
    extract_tables serialisation loses.
    """
    if not xml:
        return []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []

    tables: list[dict] = []
    for wrap in root.iter("table-wrap"):
        label = wrap.find("label")
        caption = wrap.find("caption")
        header_trs = [tr for thead in wrap.iter("thead") for tr in thead.iter("tr")]
        header_set = set(map(id, header_trs))
        body_trs = [tr for tr in wrap.iter("tr") if id(tr) not in header_set]
        header_grid = _expand_grid(header_trs)
        body_grid = _expand_grid(body_trs)
        if not header_grid and body_grid:
            header_grid, body_grid = [body_grid[0]], body_grid[1:]
        if not header_grid or not body_grid:
            continue
        width = max(len(r) for r in (*header_grid, *body_grid))
        columns = []
        for c in range(width):
            parts: list[str] = []
            for hrow in header_grid:
                cell = hrow[c] if c < len(hrow) else ""
                if cell and cell not in parts:
                    parts.append(cell)
            columns.append(" — ".join(parts))
        rows = [list(r) + [""] * (width - len(r)) for r in body_grid]
        tables.append({
            "label": _text(label) if label is not None else None,
            "caption": _text(caption) if caption is not None else None,
            "columns": columns,
            "rows": rows,
            "n_rows": len(rows),
        })
    return tables


def best_text(record: dict, *,
              prefer: tuple[str, ...] = ("methods", "results", "limitations")) -> tuple[str, str]:
    """
    The best available text for one record, plus the OA tier it earned.

    Returns (text, oa_tier), oa_tier one of full_text / abstract_only. The tier
    is RETURNED rather than assumed: --full-text-only filters on it, and
    silently treating an abstract as full text would hide how little was read.

    `limitations` joined `prefer` 2026-08-10 (v1.12), APPENDED to the shared
    blob rather than routed per-agent -- the 2026-08-09 measurement in
    workers.AGENT_SECTIONS stands: per-agent slices cost 27% more via lost
    prompt-cache sharing, while one shared blob is written once and read by all
    five agents. A limitations section is short; the underpowered statement it
    carries decides invariant 7.
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

    # RUNG 4: Elsevier's full-text API (ELSEVIER_API_KEY). MEASURED 2026-11-03:
    # 30 of the 64 vitamin C studies without readable text are Elsevier's (AJCN
    # and J Nutr moved there). Last, so no study that already reads changes text.
    text = fetch_elsevier_text(record)
    if text:
        return text, "full_text"

    return (record.get("abstract") or ""), "abstract_only"


# ----------------------------------------------------------- Elsevier full text

ELSEVIER_ARTICLE = "https://api.elsevier.com/content/article/doi/{doi}"
_ELSEVIER_BLOCKED: list[str] = []   # set once per process when the key is refused


def _is_elsevier(record: dict) -> bool:
    doi = (record.get("doi") or "").lower()
    return doi.startswith("10.1016/") or "elsevier" in (record.get("publisher") or "").lower()


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def elsevier_sections(xml: str | None,
                      prefer: tuple[str, ...] = ("methods", "results", "limitations")) -> str | None:
    """The preferred body sections of an Elsevier full-text XML, or None when the
    response holds no body (the API returns metadata and abstract only for an
    article the key is not entitled to -- that is NOT full text)."""
    if not xml:
        return None
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    found: dict[str, list[str]] = {}
    for sec in root.iter():
        if _local(sec.tag) != "section":
            continue
        title = next((c for c in sec if _local(c.tag) == "section-title"), None)
        name = _match_section(_text(title)) if title is not None else None
        if name in prefer:
            found.setdefault(name, []).append(_text(sec))
    chunks = ["\n\n".join(found[k]) for k in prefer if k in found]
    text = "\n\n".join(chunks)
    return text if len(text) >= MIN_USABLE_CHARS else None


def fetch_elsevier_text(record: dict, *, timeout: int = 60) -> str | None:
    """Methods/results text from Elsevier's Article Retrieval API, or None.
    Needs ELSEVIER_API_KEY (docs/PIPELINE.md); without it this is a no-op."""
    key = secret("ELSEVIER_API_KEY")
    doi = (record.get("doi") or "").strip()
    if not key or not doi or _ELSEVIER_BLOCKED or not _is_elsevier(record):
        return None
    cache = CACHE_DIR / f"els_{hashlib.sha256(doi.lower().encode()).hexdigest()[:24]}.txt"
    if cache.exists():
        return cache.read_text(errors="replace") or None
    import httpx
    from urllib.parse import quote
    url = ELSEVIER_ARTICLE.format(doi=quote(doi, safe="/"))
    try:
        throttle(url)
        r = httpx.get(url, timeout=timeout, headers={
            "X-ELS-APIKey": key, "Accept": "text/xml", **_headers(url)})
    except Exception:
        return None
    if r.status_code in (401, 403) and "AUTHENTICATION_ERROR" in r.text:
        # MEASURED 2026-11-03 with a personal key: Scopus answers, the full-text
        # API refuses every article (even open access) until Elsevier enables
        # text-and-data-mining access for the key. Say it once, then stop asking.
        _ELSEVIER_BLOCKED.append(doi)
        print("  ELSEVIER: the key is valid but not enabled for full text "
              "(AUTHENTICATION_ERROR). See docs/PIPELINE.md, 'API keys'.")
        return None
    if r.status_code >= 400:
        return None
    text = elsevier_sections(r.text)
    if text:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(text)
    return text


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

# Typesetter symbol fonts whose character table maps the minus sign to "2" and
# the plus sign to "þ". MEASURED 2026-11-03 on the vitamin C run: in 5 of 6
# Cambridge (Br J Nutr) PDFs, "(-0·12 mmol/l, 95 % CI -0·32, 0·09)" extracted as
# "(20·12 mmol/l, 95 % CI 20·32, 0·09)" and "+0·12" as "þ0·12" -- in pypdf,
# pdfminer and PyMuPDF alike (the PDF's own table is wrong; fontTools does not
# help). A sign read as a digit would pass the span check and pool as an effect
# of 20, so such a PDF is refused (the study counts as having no full text),
# never decoded with a guessed table.
_BROKEN_SIGN_TEXT = re.compile(r"(?<![A-Za-z])þ ?\d")
_BROKEN_SIGN_FONTS = re.compile(r"Adv(?:MathSymb|P4C4E|PS7DA6)")


def _broken_signs(text: str) -> bool:
    """Whether extracted text shows the broken-sign symbol font (see above)."""
    return bool(_BROKEN_SIGN_TEXT.search(text or ""))


def _broken_sign_fonts(reader) -> bool:
    """Whether any page uses one of the measured broken-sign symbol fonts."""
    try:
        for page in reader.pages:
            fonts = (page.get("/Resources") or {}).get("/Font") or {}
            for ref in fonts.values():
                if _BROKEN_SIGN_FONTS.search(str(ref.get_object().get("/BaseFont") or "")):
                    return True
    except Exception:
        return False
    return False
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
        return t if len(t) >= MIN_USABLE_CHARS and not _broken_signs(t) else None
    try:
        throttle(url)
        r = httpx.get(url, headers=_headers(url), timeout=timeout,
                      follow_redirects=True)
        if r.status_code >= 400 or not r.content[:5].startswith(b"%PDF"):
            return None
    except Exception:
        return None
    text = _pdf_bytes_text(r.content)
    if text is None:
        return None
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(text)
    return text


def _pdf_bytes_text(content: bytes) -> str | None:
    """Text of a downloaded PDF, or None when it is unusable."""
    if not _PDF_OK:
        return None
    try:
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception:
        # A malformed PDF is a dead end, not a pipeline failure. Callers fall
        # back down the ladder.
        return None
    text = _WS.sub(" ", text).strip()
    if _broken_signs(text) or _broken_sign_fonts(reader):
        print("  PDF refused: its symbol font misreads minus/plus signs "
              "(counted as no full text)")
        return None
    return text if len(text) >= MIN_USABLE_CHARS else None


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
        # A cached "%PDF" is a PDF this function once tag-stripped as HTML
        # (fixed 2026-10-26): the bytes were decoded lossily, so fetch again.
        if not t.startswith("%PDF"):
            return t if len(t) >= MIN_USABLE_CHARS and not _broken_signs(t) else None
    try:
        throttle(url)
        r = httpx.get(url, headers=_headers(url), timeout=timeout,
                      follow_redirects=True)
        if r.status_code >= 400:
            return None
        if r.content[:5].startswith(b"%PDF"):
            # Repositories serve PDFs from URLs without a .pdf suffix.
            # MEASURED 2026-10-26: 7 creatine RCTs were sent to every agent as
            # raw "%PDF-1.x" bytes and produced no claims.
            text = _pdf_bytes_text(r.content)
            if text is None:
                return None
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(text)
            return text
        body = re.sub(r"(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>", " ", r.text)
        text = _WS.sub(" ", _TAG.sub(" ", body)).strip()
    except Exception:
        return None
    if len(text) < MIN_USABLE_CHARS:
        return None
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(text)
    return text
