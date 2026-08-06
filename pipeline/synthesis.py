"""
Synthesis resolution: S2 output -> the bounded multiplier. NO MODEL HERE.

A meta-analysis contains zero new patients. It never enters evidence mass
(invariant 6). It contributes exactly three things, and this module handles the
deterministic parts of all three:

  DISCOVERY        its included-studies table names primaries we may not have
  METHODS FACTS    its characteristics and RoB tables describe primaries whose
                   full text is unreachable -- worth ~15 primaries per SR
  A BOUNDED LIFT   coverage x quality, ceiling 1.30, applied in scoring.score_ecu

The trap this file exists to defuse: 30 meta-analyses often re-analyse the same
9 RCTs. Resolving each SR's included studies to the SAME canonical ids is what
stops 30 documents reading as 30 corroborations. Resolution is ID matching --
it has a right answer, so no model may do it.
"""
from __future__ import annotations

from pipeline.dedup import canonical_id, registry_id

# AMSTAR-2-shaped quality proxy, q_s in [0, 1]. Multiplied by coverage and by
# LAMBDA (0.30) in score_ecu, so the whole synthesis path can lift E by at most
# 30%. THESE ARE GUESSES awaiting Tier-3 calibration -- see docs/SPEC.md 13.
Q_COMPLETE_WITH_ROB = 1.00      # included list + a RoB table, extraction complete
Q_COMPLETE_NO_ROB = 0.70        # included list only
Q_PARTIAL = 0.40                # extraction incomplete; the SR was partly unreadable
Q_UNRESOLVED = 0.0              # nothing usable

# An SR whose included studies we cannot resolve is not evidence of agreement --
# it is an unknown. Below this fraction the synthesis is marked unresolved and
# score_ecu ignores it entirely (the conservative direction).
MIN_RESOLVED_FRACTION = 0.5


def resolve_included(s2: dict | None, known: dict[str, str] | None = None) -> dict:
    """
    Map an SR's included-studies table onto canonical ids.

    `known`: optional {registry_id_or_doi_or_pmid -> canonical_id} index built
    from the store, so an included study already in the corpus resolves to the
    SAME id the primary carries. Without that, the SR's row and the primary
    paper would be two units and the dedup trap reopens.

    Returns {included_ids, n_listed, n_resolved, resolved, unresolved_labels}.
    """
    known = known or {}
    listed = (s2 or {}).get("included_studies") or []
    ids, unresolved = set(), []

    for entry in listed:
        cid = _resolve_one(entry, known)
        if cid:
            ids.add(cid)
        else:
            unresolved.append(entry.get("label") or "?")

    n_listed = len(listed)
    frac = (len(ids) / n_listed) if n_listed else 0.0
    return {
        "included_ids": ids,
        "n_listed": n_listed,
        "n_resolved": len(ids),
        "resolved_fraction": round(frac, 3),
        # 'resolved' gates whether score_ecu counts this synthesis at all.
        "resolved": bool(n_listed) and frac >= MIN_RESOLVED_FRACTION,
        "unresolved_labels": unresolved,
    }


def _resolve_one(entry: dict, known: dict[str, str]) -> str | None:
    """
    One included-study row -> canonical id, or None.

    Priority mirrors dedup: registry > DOI > PMID > fingerprint. A row we cannot
    resolve returns None and is COUNTED, never approximated to the nearest
    plausible study -- a wrong resolution silently merges two different trials.
    """
    reg = registry_id(entry.get("nct"))
    for candidate in (reg, _norm_key(entry.get("doi")), _norm_key(entry.get("pmid"))):
        if candidate and candidate in known:
            return known[candidate]
    # Not in the corpus, but still identifiable: build the id the same way dedup
    # would, so it collapses correctly if the primary is retrieved later.
    if reg or entry.get("doi") or entry.get("pmid"):
        kind, cid = canonical_id({"nct": entry.get("nct"),
                                  "doi": entry.get("doi"),
                                  "pmid": entry.get("pmid")})
        return f"{kind}:{cid}"
    return None


def _norm_key(v) -> str | None:
    if not v:
        return None
    return "".join(ch for ch in str(v).lower() if ch.isalnum()) or None


def quality(s2: dict | None, resolution: dict) -> float:
    """
    q_s for the synthesis multiplier. Deliberately coarse: this term is capped
    at a 30% lift, so precision here buys almost nothing and invented precision
    would be worse than none.
    """
    if not s2 or not resolution["resolved"]:
        return Q_UNRESOLVED
    if not s2.get("extraction_complete"):
        return Q_PARTIAL
    return Q_COMPLETE_WITH_ROB if s2.get("rob_table") else Q_COMPLETE_NO_ROB


def to_scoring_input(s2: dict | None, known: dict[str, str] | None = None) -> dict:
    """
    The dict scoring.score_ecu expects: {included_ids, q_s, resolved}.
    """
    res = resolve_included(s2, known)
    return {"included_ids": res["included_ids"], "q_s": quality(s2, res),
            "resolved": res["resolved"], "_resolution": res}


def inherited_rob(s2: dict | None) -> dict[str, str]:
    """
    {study_label -> rob band} from the SR's risk-of-bias table.

    This is how a primary whose full text is unreachable still gets a RoB band:
    someone else already read it. Callers MUST set `rob_inherited=True` on the
    resulting Study so the 0.85 penalty applies -- it is another team's judgment,
    not ours. 'unclear' is dropped rather than mapped to a band, because an
    unclear judgment is not a judgment.
    """
    out = {}
    for row in (s2 or {}).get("rob_table") or []:
        band = row.get("overall")
        if band in ("low", "some_concerns", "high"):
            out[row["study_label"]] = band
    return out


def known_index(studies: list[dict]) -> dict[str, str]:
    """
    Build the lookup `resolve_included` wants from stored study rows:
    every identifier a study carries -> its canonical id.
    """
    index = {}
    for s in studies:
        cid = s.get("canonical_id") or s.get("_canonical")
        if not cid:
            continue
        for key in (registry_id(s.get("registration_id")),
                    _norm_key(s.get("doi")), _norm_key(s.get("pmid"))):
            if key:
                index[key] = cid
    return index
