"""
Green open-access resolution: OpenAlex and Unpaywall. NO MODEL MAY ENTER HERE.

This is the largest single coverage uplift in the design. Europe PMC alone
reaches 65.5% raw OA and 69.5% methods-level facts (measured 2026-08-06, n=741)
against a target of 80%. A paper that is paywalled at the publisher is very
often deposited in a repository, and finding that copy is what closes the gap.

The two services do different jobs and are not interchangeable:

  OpenAlex   works with NO CREDENTIALS. Supplies the reference list -- which is
             how an SR's included studies get resolved -- plus best_oa_location.
  Unpaywall  REQUIRES a contact email by API policy. Best single source of green
             OA locations.

Unpaywall is therefore gated: without BSPROOF_CONTACT_EMAIL it raises rather
than silently returning "no OA found", because a silent miss looks exactly like
a genuinely paywalled paper and would quietly depress coverage everywhere.
"""
from __future__ import annotations

from sources.http import CONTACT_EMAIL, SourceError, get_json

OPENALEX = "https://api.openalex.org/works"
UNPAYWALL = "https://api.unpaywall.org/v2"


class ContactEmailMissing(SourceError):
    """Unpaywall policy requires a contact address. Refuse rather than degrade."""


# ------------------------------------------------------------------ OpenAlex

def openalex_by_doi(doi: str) -> dict | None:
    """OpenAlex record for a DOI, or None if unknown. No credentials needed."""
    if not doi:
        return None
    try:
        return get_json(f"{OPENALEX}/https://doi.org/{doi.lstrip('/')}",
                        {"mailto": CONTACT_EMAIL} if CONTACT_EMAIL else None)
    except SourceError as e:
        if getattr(e, "status", None) == 404:
            return None
        raise


def oa_location(work: dict | None) -> dict | None:
    """
    Best open-access copy, normalised. None when there is no OA copy -- which is
    a real answer, distinct from "we did not look".
    """
    if not work:
        return None
    best = work.get("best_oa_location") or work.get("primary_location") or {}
    if not best.get("is_oa"):
        return None
    return {
        "url": best.get("pdf_url") or best.get("landing_page_url"),
        "version": best.get("version"),          # submittedVersion | acceptedVersion | publishedVersion
        "license": best.get("license"),
        "host_type": (best.get("source") or {}).get("type"),
        "via": "openalex",
    }


def referenced_dois(work: dict | None, *, limit: int = 200) -> list[str]:
    """
    OpenAlex ids of the works this one cites. For a systematic review these are
    the candidate included studies, which is how an SR's included list gets
    resolved to canonical ids without parsing its tables. S2 remains the
    authority on what was ACTUALLY included -- a reference list also contains
    methods citations and excluded studies, so this narrows the search space and
    never decides membership on its own.
    """
    if not work:
        return []
    return [r for r in (work.get("referenced_works") or [])][:limit]


# ----------------------------------------------------------------- Unpaywall

def unpaywall(doi: str) -> dict | None:
    """
    Unpaywall record for a DOI. Raises ContactEmailMissing when unconfigured.

    Returning None on a missing email would be indistinguishable from a genuinely
    closed-access paper, and the whole point of this module is measuring the
    difference.
    """
    if not CONTACT_EMAIL:
        raise ContactEmailMissing(
            "Unpaywall requires a contact address by API policy. "
            "Set BSPROOF_CONTACT_EMAIL. OpenAlex still works without one.")
    if not doi:
        return None
    try:
        return get_json(f"{UNPAYWALL}/{doi.lstrip('/')}", {"email": CONTACT_EMAIL})
    except SourceError as e:
        if getattr(e, "status", None) == 404:
            return None
        raise


def unpaywall_location(rec: dict | None) -> dict | None:
    if not rec or not rec.get("is_oa"):
        return None
    best = rec.get("best_oa_location") or {}
    return {
        "url": best.get("url_for_pdf") or best.get("url"),
        "version": best.get("version"),
        "license": best.get("license"),
        "host_type": best.get("host_type"),
        "via": "unpaywall",
    }


# ------------------------------------------------------------------ resolver

def resolve(record: dict) -> dict:
    """
    Best available full-text location for one normalised record.

    Order: Europe PMC's own OA status is already known and free, so it wins.
    Then OpenAlex (no credentials). Then Unpaywall, if configured.

    Returns {'oa': <scoring.OA_FACTOR key>, 'location': {...} | None,
             'checked': [...]}. `checked` records which services were actually
    consulted, so a low coverage number can be attributed rather than guessed at.
    """
    checked = []
    if record.get("oa") == "full_text":
        return {"oa": "full_text", "location": {"via": "europepmc"},
                "checked": ["europepmc"]}

    doi = record.get("doi")
    if not doi:
        return {"oa": record.get("oa") or "abstract_only", "location": None,
                "checked": checked}

    loc = oa_location(openalex_by_doi(doi))
    checked.append("openalex")
    if loc:
        return {"oa": "full_text", "location": loc, "checked": checked}

    try:
        loc = unpaywall_location(unpaywall(doi))
        checked.append("unpaywall")
        if loc:
            return {"oa": "full_text", "location": loc, "checked": checked}
    except ContactEmailMissing:
        checked.append("unpaywall:SKIPPED_NO_EMAIL")

    return {"oa": "abstract_only", "location": None, "checked": checked}
