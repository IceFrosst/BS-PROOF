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

SYNTHESIS_TAGS = ("meta-analysis", "systematic review", "review")
_REG_IN_TEXT = re.compile(r"(NCT\d{8}|ISRCTN\d{6,8}|ChiCTR[-A-Z0-9]{6,}"
                          r"|CTRI/\d{4}/\d+/\d+|UMIN\d{6,9})", re.I)

CLINICAL_EXCLUSIONS = (
    "eclampsia OR anesthesia OR anaesthesia OR surgery OR intravenous "
    "OR infusion OR intubation OR ventilation OR sedation OR perioperative "
    "OR postoperative OR preoperative OR ketamine"
)

SUPPLEMENT_CONTEXT = (
    'supplementation OR "dietary supplement" OR "oral supplement" OR oral'
)


def _query(ingredient: str, *, syntheses: bool, scope: str = "broad") -> str:
    kinds = ('PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review"'
             if syntheses else 'PUB_TYPE:"Randomized Controlled Trial"')
    ing = ingredient.strip()

    if scope == "intervention":
        intervention = (
            f'(TITLE:"{ing}") OR '
            f'(ABSTRACT:"{ing} supplementation") OR '
            f'(ABSTRACT:"oral {ing}") OR '
            f'(ABSTRACT:"{ing} supplement") OR '
            f'(ABSTRACT:"supplementation with {ing}")'
        )
        q = (
            f'({intervention}) AND (SRC:"MED") AND ({kinds}) '
            f'AND ({SUPPLEMENT_CONTEXT}) NOT ({CLINICAL_EXCLUSIONS})'
        )
        return q

    q = f'("{ing}") AND (SRC:"MED") AND ({kinds})'
    if scope == "supplement":
        q += f' AND ({SUPPLEMENT_CONTEXT}) NOT ({CLINICAL_EXCLUSIONS})'
    elif scope != "broad":
        raise ValueError(f"unknown scope {scope!r}")
    return q


def outcome_terms(outcome_id: str) -> list[str]:
    from pipeline import vocab
    o = vocab.outcome(outcome_id)
    if not o:
        return []
    terms = list(o.get("search_terms") or []) or ([o["label"]] + list(o.get("includes") or []))
    seen, out = set(), []
    for t in terms:
        t = t.strip()
        if len(t) > 2 and t.lower() not in seen:
            seen.add(t.lower()); out.append(t)
    return out[:8]


def outcome_query(ingredient: str, outcome_id: str) -> str:
    terms = outcome_terms(outcome_id)
    if not terms:
        return _query(ingredient, syntheses=False, scope="intervention")
    ing = ingredient.strip()
    outcome_clause = " OR ".join(f'"{t}"' for t in terms)
    return (f'(TITLE:"{ing}" OR ABSTRACT:"{ing} supplementation" '
            f'OR ABSTRACT:"oral {ing}") '
            f'AND (SRC:"MED") AND (PUB_TYPE:"Randomized Controlled Trial") '
            f'AND ({outcome_clause}) NOT ({CLINICAL_EXCLUSIONS})')


def outcome_hit_count(ingredient: str, outcome_id: str) -> int:
    """
    How many RCTs Europe PMC indexes for this ingredient + outcome.
    pageSize=1 — we only need hitCount. Used to pick showcase top-N.
    """
    page = get_json(SEARCH, {
        "query": outcome_query(ingredient, outcome_id),
        "format": "json",
        "pageSize": 1,
    })
    return int(page.get("hitCount") or 0)


def discover_by_outcome(ingredient: str, outcome_ids: list[str], *,
                        per_outcome: int = 40) -> dict:
    found, counts = [], {}
    for oid in outcome_ids:
        recs = search(outcome_query(ingredient, oid), max_records=per_outcome)
        counts[oid] = len(recs)
        for r in recs:
            n = normalise(r)
            n["retrieved_for"] = oid
            found.append(n)
    return {"primaries": found, "by_outcome": counts}


def search(query: str, *, page_size: int = 100, max_records: int = 1000) -> list[dict]:
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
    page = get_json(SEARCH, {"query": _query(ingredient, syntheses=syntheses, scope=scope),
                             "format": "json", "pageSize": 1})
    return int(page.get("hitCount") or 0)


def is_synthesis(rec: dict) -> bool:
    tags = [t.lower() for t in (rec.get("pubTypeList", {}) or {}).get("pubType", [])]
    return any(any(s in t for s in SYNTHESIS_TAGS) for t in tags)


def oa_status(rec: dict) -> str:
    if rec.get("isOpenAccess") == "Y" or rec.get("inEPMC") == "Y" or rec.get("pmcid"):
        return "full_text"
    return "abstract_only"


def free_fulltext_urls(rec: dict) -> list[dict]:
    urls = (rec.get("fullTextUrlList") or {}).get("fullTextUrl", [])
    out = []
    for u in urls:
        if (u.get("availability") or "").lower() in ("free", "open access"):
            out.append({"url": u.get("url"),
                        "style": (u.get("documentStyle") or "").lower(),
                        "site": u.get("site")})
    return out


def mesh_terms(rec: dict) -> list[str]:
    heads = (rec.get("meshHeadingList", {}) or {}).get("meshHeading", [])
    return [h.get("descriptorName") for h in heads if h.get("descriptorName")]


def registry_ids(rec: dict) -> list[str]:
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
        "full_text_urls": free_fulltext_urls(rec),
        "n": None,
        "country": None,
        "dose_text": None,
    }


def discover(ingredient: str, *, max_syntheses: int = 200,
             max_primaries: int = 800, scope: str = "broad") -> dict:
    syn = [normalise(r) for r in search(_query(ingredient, syntheses=True, scope=scope),
                                        max_records=max_syntheses)]
    pri = [normalise(r) for r in search(_query(ingredient, syntheses=False, scope=scope),
                                        max_records=max_primaries)]
    return {"syntheses": syn, "primaries": pri}
