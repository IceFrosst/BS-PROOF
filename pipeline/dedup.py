"""
Deterministic deduplication. No model may enter this file.
One trial = one evidence unit. Implements SPEC.md section 6.
"""
from __future__ import annotations
import re, unicodedata
from collections import defaultdict


def _norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def canonical_id(rec: dict) -> tuple[str, str]:
    """NCT > DOI > PMID > fingerprint. Returns (kind, id)."""
    for k in ("nct", "registration_id"):
        v = rec.get(k)
        if v and re.match(r"^(NCT\d{8}|ISRCTN\d+|ChiCTR|CTRI|UMIN|EudraCT)", str(v), re.I):
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


def synthesis_contribution_cap(syntheses: list[dict], median_primary_w: float):
    """
    Unresolved syntheses ALL TOGETHER cap at one median primary study.
    Fail toward under-counting. SPEC.md section 6.
    """
    unresolved = [s for s in syntheses if not s.get("resolved")]
    if not unresolved: return 0.0
    return min(median_primary_w, median_primary_w)
