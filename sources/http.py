"""
The one HTTP client every source module uses. Throttled, retried, and cached
to disk. NO MODEL MAY ENTER THIS FILE.

Disk caching is not an optimisation here, it is a correctness property. A
retrieval run that hits the network twice can return two different corpora, and
then the same bottle scores differently tomorrow for reasons nothing records.
Cached responses make a run replayable and make tests offline.
"""
from __future__ import annotations
import hashlib, json, os, time
from pathlib import Path

# httpx is imported INSIDE get_json, not here. Measured 2026-08-10: a module-level
# import made `python3 -m pipeline.selftest` exit 1 on any interpreter without the
# dependency installed -- it died at EUROPE PMC NORMALISATION, because
# sources.europepmc imports this module for get_json while the checks themselves
# only exercise pure normalisation functions. That is a zero-network, zero-model
# suite failing on a network library it never calls.
#
# The cost was not the crash, it was WHO hit it: CLAUDE.md's command block told
# every agent to run exactly that command, so an agent following the docs got a
# traceback and started debugging a regression that did not exist. The 2026-08-05
# audit flagged the python/python3 mismatch and it was still live five days later.
#
# sources/fulltext.py already did it this way in two places (its PDF and HTML
# fetchers), so this is the file matching the pattern, not inventing one.
from sources.ratelimit import throttle

CACHE_DIR = Path(__file__).parent.parent / "out" / "http_cache"

# Polite-pool identification. Unpaywall REQUIRES an email; OpenAlex and Crossref
# give faster, more stable service when you supply one. One value, one variable.
CONTACT_EMAIL = os.environ.get("BSPROOF_CONTACT_EMAIL", "")

USER_AGENT = ("bs-proof/0.1 (supplement evidence pipeline"
              + (f"; mailto:{CONTACT_EMAIL}" if CONTACT_EMAIL else "") + ")")


class SourceError(RuntimeError):
    """A source could not be read. Callers must decide; they must not invent data."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


# ClinicalTrials.gov returns 403 whenever a User-Agent header is present -- ours
# and a curl-shaped one both fail, while sending none returns 200. Measured
# 2026-08-06. Politeness norms say identify yourself; this host says otherwise,
# and rate limiting still applies via the token bucket.
NO_UA_HOSTS = {"clinicaltrials.gov"}


def _headers(url: str) -> dict:
    from urllib.parse import urlparse
    if urlparse(url).netloc in NO_UA_HOSTS:
        return {"Accept": "application/json"}
    return {"User-Agent": USER_AGENT}


def _key(url: str, params: dict | None) -> str:
    blob = url + "\0" + json.dumps(params or {}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


def get_json(url: str, params: dict | None = None, *, timeout: int = 60,
             retries: int = 3, use_cache: bool = True) -> dict:
    """
    Throttled GET returning parsed JSON. Raises SourceError rather than
    returning a partial or empty result that a caller might mistake for
    'this ingredient has no studies'.
    """
    cache_file = CACHE_DIR / f"{_key(url, params)}.json"
    if use_cache and cache_file.exists():
        return json.loads(cache_file.read_text())

    # Deliberately after the cache read: a cached run stays fully offline and
    # needs no transport library at all.
    import httpx

    last = None
    for attempt in range(retries):
        throttle(url)
        try:
            r = httpx.get(url, params=params, headers=_headers(url),
                          timeout=timeout, follow_redirects=True)
        except httpx.HTTPError as e:
            last = f"transport: {e}"
            time.sleep(2 ** attempt)
            continue

        # 429/5xx are worth retrying; a 404 means the record is absent, which is
        # an answer, not a failure.
        if r.status_code == 404:
            raise SourceError(f"404 {url}", status=404)
        if r.status_code == 429 or r.status_code >= 500:
            last = f"http {r.status_code}"
            time.sleep(2 ** attempt * 2)
            continue
        if r.status_code >= 400:
            raise SourceError(f"http {r.status_code} {url}: {r.text[:200]}",
                              status=r.status_code)

        try:
            data = r.json()
        except ValueError as e:
            last = f"bad json: {e}"
            time.sleep(2 ** attempt)
            continue

        if use_cache:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(data))
        return data

    raise SourceError(f"{url} failed after {retries} attempts: {last}")
