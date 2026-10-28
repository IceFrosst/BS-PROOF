"""
Figures of an open-access PMC article: the list (from the cached JATS) and the
image bytes (PMC's article instance, disk-cached). Deterministic HTTP, no model.
Founder decision 2026-10-28 (figure route; pilot 2026-10-26 in
scripts/experiments/figure_pilot.py).
"""
from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET

from sources import fulltext
from sources.http import CACHE_DIR, _headers
from sources.ratelimit import throttle

_XLINK = "{http://www.w3.org/1999/xlink}href"
_MAGIC = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"GIF8": "image/gif"}


def figures(pmcid: str | None) -> list[dict]:
    """[{"id", "caption", "href"}] for every figure with a caption and a
    graphic; [] when the article has no JATS."""
    xml = fulltext.fetch_xml(pmcid) if pmcid else None
    if not xml:
        return []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    out = []
    for fig in root.iter("fig"):
        cap, graphic = fig.find("caption"), fig.find(".//graphic")
        if cap is None or graphic is None or not graphic.get(_XLINK):
            continue
        href = graphic.get(_XLINK)
        out.append({"id": fig.get("id"), "caption": re.sub(r"\s+", " ", "".join(cap.itertext())).strip(),
                    "href": href if "." in href.rsplit("/", 1)[-1] else href + ".jpg"})
    return out


def image(pmcid: str, href: str, *, timeout: int = 60) -> tuple[str, bytes] | None:
    """(media_type, bytes) of one figure, or None when it cannot be fetched."""
    cache = CACHE_DIR / f"fig_{hashlib.sha256(f'{pmcid}/{href}'.encode()).hexdigest()[:24]}.bin"
    if cache.exists():
        data = cache.read_bytes()
    else:
        import httpx
        url = f"https://pmc.ncbi.nlm.nih.gov/articles/instance/{pmcid.removeprefix('PMC')}/bin/{href}"
        try:
            throttle(url)
            r = httpx.get(url, headers=_headers(url), timeout=timeout, follow_redirects=True)
        except httpx.HTTPError:
            return None
        if r.status_code >= 400:
            return None
        data = r.content
        if not any(data.startswith(m) for m in _MAGIC):
            return None
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(data)
    media = next((t for m, t in _MAGIC.items() if data.startswith(m)), None)
    return (media, data) if media else None
