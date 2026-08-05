"""
Deterministic deduplication. No model may enter this file.
One trial = one evidence unit. Implements SPEC.md section 6.

2026-08-05 audit fixes (pending Claude review — see REVIEW.md):
- Registry regex tightened for ChiCTR / CTRI / UMIN / EudraCT full IDs.
- synthesis_contribution_cap no longer a no-op; still not applied in score_ecu
  (under-count is the safe direction until wired deliberately).
"""
from __future__ import annotations
import re, unicodedata
from collections import defaultdict

# Full-ish patterns. Prefer over-rejecting a short prefix over accepting "ChiCTR" alone.
_REGISTRY_RE = re.compile(
    r"^("
    r"NCT\d{8}"
    r"|ISRCTN\d+"
    r"|ChiCTR[-A-Z0-9]+"
    r"|CTRI/[0-9/]+"
    r"|UMIN[A-Z0-9]+"
    r"|EudraCT[-\d]+"
    r")$",
    re.I,
)


def _norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def canonical_id(rec: dict) -> tuple[str, str]:
    """NCT > DOI > PMID > fingerprint. Returns (kind, id)."""
    for k in ("nct", "registration_id"):
        v = rec.get(k)
        if v and _REGISTRY_RE.match(str(v).strip()):
            return ("registry", _norm(v))
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
