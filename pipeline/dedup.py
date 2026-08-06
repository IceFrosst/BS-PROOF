"""
Deterministic deduplication. No model may enter this file.
One trial = one evidence unit. Implements SPEC.md section 6.

2026-08-05 audit fixes (Grok) — reviewed 2026-08-06 (Claude), see REVIEW.md:
- Registry regex tightened for ChiCTR / CTRI / UMIN / EudraCT full IDs.
  AMENDED: extract-not-validate, so surrounding text no longer defeats the match.
- synthesis_contribution_cap no longer a no-op; still not applied in score_ecu
  (under-count is the safe direction until wired deliberately).
"""
from __future__ import annotations
import re, unicodedata
from collections import defaultdict

# Bare prefixes ("ChiCTR" alone) must NOT match -- they would collapse every
# Chinese trial into one unit. But full-string anchoring is the wrong cure:
# registry fields arrive as "NCT01234567 (primary outcome paper)", and a
# non-match falls through to DOI, which splits one trial across its four papers.
# That is the dedup trap SPEC section 6 exists to prevent, so this EXTRACTS the
# ID from the field rather than validating the whole field.
_REGISTRY_RE = re.compile(
    r"(NCT\d{8}"
    r"|ISRCTN\d{6,8}"
    r"|ChiCTR[-A-Z0-9]{6,}"
    r"|CTRI/\d{4}/\d+/\d+"
    r"|UMIN\d{6,9}"
    r"|EudraCT[\s:-]*\d{4}-\d{6}-\d{2}"
    r")",
    re.I,
)


def _norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def registry_id(value) -> str | None:
    """The registry ID inside a field, normalised -- or None. Never guesses."""
    if not value:
        return None
    m = _REGISTRY_RE.search(str(value))
    return _norm(m.group(1)) if m else None


def canonical_id(rec: dict) -> tuple[str, str]:
    """NCT > DOI > PMID > fingerprint. Returns (kind, id)."""
    for k in ("nct", "registration_id"):
        rid = registry_id(rec.get(k))
        if rid:
            # the matched ID, not the whole field -- so the same trial collapses
            # regardless of what text surrounds the ID in each paper.
            return ("registry", rid)
    if rec.get("doi"):
        return ("doi", _norm(rec["doi"]))
    if rec.get("pmid"):
        return ("pmid", _norm(rec["pmid"]))
    fp = "|".join([_norm(rec.get("first_author")), str(rec.get("year") or ""),
                   str(rec.get("n") or ""), _norm(rec.get("country")),
                   _norm(rec.get("dose_text"))])
    return ("fingerprint", fp)


def dedup(records: list[dict]):
    """
    Returns (unique_records, id_map, stats).
    Registry IDs collapse multiple papers from one trial into one unit --
    that is the point. Fingerprint matches are reported separately because
    they are the least reliable tier and you want to eyeball them.
    """
    buckets, kinds = defaultdict(list), {}
    for r in records:
        kind, cid = canonical_id(r)
        key = f"{kind}:{cid}"
        buckets[key].append(r)
        kinds[key] = kind

    unique, id_map = [], {}
    for key, group in buckets.items():
        # keep the record with the most non-null fields
        best = max(group, key=lambda r: sum(1 for v in r.values() if v not in (None, "", [])))
        best = dict(best); best["_canonical"] = key
        best["_merged_from"] = [r.get("label") or r.get("pmid") or "?" for r in group]
        unique.append(best)
        for r in group:
            id_map[id(r)] = key

    stats = {"in": len(records), "out": len(unique),
             "collapsed": len(records) - len(unique),
             "by_kind": {k: sum(1 for kk in kinds.values() if kk == k)
                         for k in set(kinds.values())}}
    return unique, id_map, stats


def synthesis_contribution_cap(syntheses: list[dict], median_primary_w: float) -> float:
    """
    Unresolved syntheses ALL TOGETHER cap at one median primary study weight.
    Fail toward under-counting. SPEC.md section 6.

    NOT YET APPLIED in score_ecu — score_ecu ignores unresolved syntheses
    entirely (even more conservative). Wire deliberately when retrieval exists;
    do not call this from scoring without a SPEC update + selftest.
    """
    unresolved = [s for s in syntheses if not s.get("resolved")]
    if not unresolved:
        return 0.0
    return float(median_primary_w)
