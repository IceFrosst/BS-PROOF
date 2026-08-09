"""
Crossref: the PUBLISHER behind a DOI. NO MODEL MAY ENTER THIS FILE.

WHY THIS EXISTS. The predatory-venue check reads a list of ~1160 PUBLISHERS,
and Europe PMC gives us a JOURNAL TITLE. Matching one inside the other is a
category error: measured 2026-08-08 on a 2076-study corpus, substring matching
flagged 274 studies (13.2%) including "American Journal of Obstetrics and
Gynecology" (on the list entry 'american journal') and "Acta oto-laryngologica"
(on 'lar'). Restricting to exact title matches removed every false positive and
also every true one -- the honest count became 0.

Crossref closes that gap. `publisher` is a first-class field on every DOI, it is
the same KIND of string the list contains, and comparing publisher to publisher
is what the list is actually for.

It is free, needs no key, and rewards a contact address with the polite pool.
One call per DOI, disk-cached like every other source.
"""
from __future__ import annotations

from sources.http import CONTACT_EMAIL, SourceError, get_json

WORKS = "https://api.crossref.org/works"


def work(doi: str) -> dict | None:
    """
    Crossref record for a DOI, or None when Crossref does not have it.

    None ONLY on 404. Any other failure raises, because "we could not ask" and
    "Crossref has no record" are different facts: the first is transient and the
    second is an answer. Collapsing them would let a network blip look like a
    venue we checked and cleared.
    """
    if not doi:
        return None
    try:
        payload = get_json(f"{WORKS}/{doi.strip().lstrip('/')}",
                           {"mailto": CONTACT_EMAIL} if CONTACT_EMAIL else None)
    except SourceError as e:
        if getattr(e, "status", None) == 404:
            return None
        raise
    return (payload or {}).get("message")


def venue(rec: dict | None) -> dict:
    """
    {publisher, journal, issns} from a Crossref message. Missing stays None.

    `publisher` here is the imprint that registered the DOI -- "Informa UK
    Limited", "Elsevier BV", "MDPI AG". That is deliberately NOT the journal
    name, and it is the field the predatory list is expressed in.
    """
    if not rec:
        return {"publisher": None, "journal": None, "issns": []}
    container = rec.get("container-title") or []
    return {
        "publisher": rec.get("publisher") or None,
        "journal": container[0] if container else None,
        "issns": [i for i in (rec.get("ISSN") or []) if i],
    }


def publisher_for_doi(doi: str) -> str | None:
    """Convenience: just the publisher string, or None."""
    return venue(work(doi))["publisher"]
