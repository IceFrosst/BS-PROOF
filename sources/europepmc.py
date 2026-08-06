"""
Europe PMC: search and record normalisation. NO MODEL MAY ENTER THIS FILE.

This is the discovery layer. It answers "which papers exist for this ingredient"
and "is the full text reachable", and it emits records in the shape
`pipeline.dedup.canonical_id` expects.

RETRIEVAL PRIORITY IS INVERTED ON PURPOSE: syntheses are fetched before
primaries. One open-access systematic review carries characteristics-of-included
-studies and a RoB table for ~15 primaries that cannot be read directly, so an
SR is worth an order of magnitude more than a primary at fetch time. It still
contributes ZERO evidence mass (invariant 6). SPEC section 4.
"""
from __future__ import annotations
import re

from sources.http import get_json

SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

# publicationType strings that mark a document as a synthesis rather than a
# study. Deterministic classification from source tags is right ~85-90% of the
# time; S1 is the fallback for the ambiguous remainder, never the first resort.
SYNTHESIS_TAGS = ("meta-analysis", "systematic review", "review")
_REG_IN_TEXT = re.compile(r"(NCT\d{8}|ISRCTN\d{6,8}|ChiCTR[-A-Z0-9]{6,}"
                          r"|CTRI/\d{4}/\d+/\d+|UMIN\d{6,9})", re.I)


# Contexts where the ingredient is a DRUG, not a supplement. IV magnesium
# sulfate in eclampsia or cardiac surgery is not the product this system scores,
# can never map to a consumer outcome, and costs a full extraction to discover.
CLINICAL_EXCLUSIONS = (
    "eclampsia OR anesthesia OR anaesthesia OR surgery OR intravenous "
    "OR infusion OR intubation OR ventilation OR sedation")

SUPPLEMENT_CONTEXT = 'supplementation OR "dietary supplement" OR "oral supplement"'


def _query(ingredient: str, *, syntheses: bool, scope: str = "broad") -> str:
    """
    scope 'broad'      ingredient + design. What every measurement to date used.
    scope 'supplement' adds a supplement context and excludes drug contexts.

    MEASURED 2026-08-06 on magnesium RCTs:

      broad                      6736 hits, 25% clinical-context titles
      + MeSH Dietary Supplements   10 hits  (MeSH indexing far too sparse)
      + supplement terms         2022 hits, 12% clinical
      + supplement NOT clinical  1420 hits,  1% clinical

    MEASURED YIELD, 2026-08-06: switching to 'supplement' did NOT improve the
    number of scorable ECU rows -- 1 row from 8 studies under BOTH scopes. It
    trades clinical noise for WRONG-INGREDIENT noise, because Europe PMC matches
    "magnesium" anywhere in the record: an Astragalus, whey-protein or Griffonia
    trial that merely mentions magnesium is retrieved. Neither scope is right
    yet; the ingredient needs to be constrained to the INTERVENTION, not the
    document.

    'broad' remains the DEFAULT on purpose. Switching it silently would change
    the corpus behind every coverage number already recorded, and the RECALL
    cost of the NOT clause is not yet measured -- a supplement trial that merely
    mentions surgery in its exclusion criteria would be dropped. Measure recall
    against the anchor set before promoting this.
    """
    kinds = ('PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review"'
             if syntheses else 'PUB_TYPE:"Randomized Controlled Trial"')
    q = f'("{ingredient}") AND (SRC:"MED") AND ({kinds})'
    if scope == "supplement":
        q += f' AND ({SUPPLEMENT_CONTEXT}) NOT ({CLINICAL_EXCLUSIONS})'
    elif scope != "broad":
        raise ValueError(f"unknown scope {scope!r}")
    return q


def search(query: str, *, page_size: int = 100, max_records: int = 1000) -> list[dict]:
    """
    Cursor-paginated search. max_records is a real limit, not a page count --
    run_coverage.py capped at 3 pages and silently truncated magnesium and
    creatine at exactly 300, which biased the measurement toward whatever the
    relevance ordering surfaced first.
    """
    out, cursor = [], "*"
    while len(out) < max_records:
        page = get_json(SEARCH, {"query": query, "format": "json",
                                 "pageSize": min(page_size, max_records - len(out)),
                                 "cursorMark": cursor, "resultType": "core"})
        hits = page.get("resultList", {}).get("result", [])
        if not hits:
            break
        out.extend(hits)
        nxt = page.get("nextCursorMark")
        if not nxt or nxt == cursor:
            break
        cursor = nxt
    return out[:max_records]


def hit_count(ingredient: str, *, syntheses: bool, scope: str = "broad") -> int:
    """
    How many records the query ACTUALLY matches, independent of any fetch cap.

    Without this, a capped run cannot tell whether it saw the whole corpus or a
    truncated slice, and every ratio computed over it is unfalsifiable. One
    cheap request answers it.
    """
    page = get_json(SEARCH, {"query": _query(ingredient, syntheses=syntheses, scope=scope),
                             "format": "json", "pageSize": 1})
    return int(page.get("hitCount") or 0)


def is_synthesis(rec: dict) -> bool:
    tags = [t.lower() for t in (rec.get("pubTypeList", {}) or {}).get("pubType", [])]
    return any(any(s in t for s in SYNTHESIS_TAGS) for t in tags)


def oa_status(rec: dict) -> str:
    """
    Maps onto OA_FACTOR in scoring.py. 'sr_table' is never assigned here -- it is
    earned later, when S2 actually extracts a study's row from an SR table.
    """
    if rec.get("isOpenAccess") == "Y" or rec.get("inEPMC") == "Y" or rec.get("pmcid"):
        return "full_text"
    return "abstract_only"


def mesh_terms(rec: dict) -> list[str]:
    """
    MeSH descriptors. These are curated by human indexers, which is why
    pipeline/classify.py trusts them over anything a model could re-derive.
    Empty for records PubMed has not finished indexing -- an empty list means
    "not indexed yet", never "no such terms apply".
    """
    heads = (rec.get("meshHeadingList", {}) or {}).get("meshHeading", [])
    return [h.get("descriptorName") for h in heads if h.get("descriptorName")]


def registry_ids(rec: dict) -> list[str]:
    """
    Trial registry IDs mentioned anywhere in the record. Europe PMC exposes
    accession ids inconsistently, so the abstract is scanned too. These feed
    canonical_id, where a registry hit collapses the four papers of one trial
    into one evidence unit.
    """
    found = []
    accs = (rec.get("fullTextIdList", {}) or {}).get("fullTextId", [])
    for block in (rec.get("abstractText") or "", " ".join(accs)):
        found += [m.group(1) for m in _REG_IN_TEXT.finditer(block)]
    seen, unique = set(), []
    for f in found:
        u = f.upper()
        if u not in seen:
            seen.add(u); unique.append(f)
    return unique


def normalise(rec: dict) -> dict:
    """
    Europe PMC record -> the pipeline's record shape.

    Every field that is not present stays None. There are no fallbacks and no
    inferred defaults here: a null is a known unknown the pipeline handles, a
    guess is an unknown unknown that corrupts everything downstream
    (invariant 5).
    """
    regs = registry_ids(rec)
    authors = rec.get("authorString") or ""
    return {
        "source": "europepmc",
        "pmid": rec.get("pmid"),
        "pmcid": rec.get("pmcid"),
        "doi": rec.get("doi"),
        "registration_id": regs[0] if regs else None,
        "all_registration_ids": regs,
        "title": rec.get("title"),
        "journal": ((rec.get("journalInfo") or {}).get("journal") or {}).get("title"),
        "year": int(rec["pubYear"]) if str(rec.get("pubYear") or "").isdigit() else None,
        "first_author": authors.split(",")[0].strip() or None,
        "abstract": rec.get("abstractText"),
        "is_synthesis": is_synthesis(rec),
        "oa": oa_status(rec),
        "pub_types": (rec.get("pubTypeList", {}) or {}).get("pubType", []),
        "mesh_terms": mesh_terms(rec),
        "n": None,          # only S3 knows this
        "country": None,    # not exposed by the search endpoint
        "dose_text": None,  # only S7 knows this
    }


def discover(ingredient: str, *, max_syntheses: int = 200,
             max_primaries: int = 800, scope: str = "broad") -> dict:
    """
    Full discovery for one ingredient, syntheses first.

    Returns {'syntheses': [...], 'primaries': [...]} of normalised records.
    Neither list is deduplicated -- that is pipeline/dedup.py's job, and it must
    happen before any conclusion exists (SPEC section 6).
    """
    syn = [normalise(r) for r in search(_query(ingredient, syntheses=True, scope=scope),
                                        max_records=max_syntheses)]
    pri = [normalise(r) for r in search(_query(ingredient, syntheses=False, scope=scope),
                                        max_records=max_primaries)]
    return {"syntheses": syn, "primaries": pri}
