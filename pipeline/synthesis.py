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

import os
import re

from pipeline.dedup import canonical_id, registry_id

# --------------------------------------------------------------- q_s
#
# WHAT q_s IS ALLOWED TO MEASURE  (founder decision 2026-08-07)
#
# q_s must describe the REVIEW. The previous implementation gated it on
# `resolved_fraction >= 0.5` -- the share of a review's included studies that
# happened to already be in OUR store -- and that is circular: it measures our
# retrieval and calls the answer a property of the science. It inverts on the
# cases that matter most. A Cochrane review of 30 trials where we hold 6 scored
# q_s = 0 and was DISCARDED; a thin review of 4 trials where we hold 3 scored
# 1.00. The better review, covering more trials we cannot read, was worth less
# precisely BECAUSE it covered more than we had.
#
# Overlap was never missing from the maths either. score_ecu already multiplies
# by `cov` = |included ∩ our primaries| / |our primaries|, so a review that
# corroborates little of our corpus already lifts E by little, smoothly. The
# 0.5 gate re-punished the same quantity a second time, as a cliff.
#
# So: overlap -> cov (already there). Review quality -> the checklist below,
# which reads the REVIEW'S OWN reported methodology. It is AMSTAR-2 shaped and
# mirrors how S4 proxies RoB for a primary: count the items that were actually
# answered, band the count, map the band to a factor.
REVIEW_ITEMS = (
    "protocol_registered",          # a priori protocol / PROSPERO registration
    "multi_database_search",        # >= 2 databases (set from databases_searched)
    "duplicate_selection",          # two reviewers screening / extracting
    "rob_assessed",                 # RoB judged for the included trials
    "heterogeneity_assessed",       # I^2 / tau^2 / a heterogeneity discussion
    "publication_bias_assessed",    # funnel plot, Egger, trim-and-fill
    "funding_independent",          # review itself not industry funded
)
MIN_DATABASES = 2

# A 2026-08-07 patch lowered the overlap gate 0.5 -> 0.25 with a floor of 2 ids,
# on the correct observation that a 50% bar rejected every review. That treated
# the symptom: at ANY threshold the quantity being tested is our retrieval. The
# gate is gone rather than tuned. The label parser from the same patch is kept --
# it is a real improvement to RESOLUTION, which is a different question.

# "Smith 2019", "Smith et al. 2019", "Smith, J. (2019)"
_LABEL_AY = re.compile(
    r"^\s*([A-Za-z][A-Za-z'\-]{1,40})"
    r"(?:\s*,?\s*[A-Z]\.?)?"
    r"(?:\s+et\s+al\.?)?"
    r"(?:\s*,)?\s*\(?((?:19|20)\d{2})\)?\s*$",
    re.I,
)

# Band -> q_s. GUESSES awaiting Tier-3 calibration; see docs/SPEC.md 13.
Q_REVIEW = {"high": 1.00, "moderate": 0.70, "low": 0.40}

# S2 told us it could not read the whole review. Cap rather than zero: a
# partially-read review still names real trials.
Q_INCOMPLETE_CAP = 0.40

# No methods items answered at all -- an S2 output from before this schema, or a
# review that reports none of them. Treated as the LOW band, never as unknown-
# therefore-fine. Not zero: it is still a real synthesis of real trials.
Q_NO_METHODS_REPORTED = Q_REVIEW["low"]

Q_UNRESOLVED = 0.0              # S2 found no included-studies list at all

# Kept for the report layer, which still labels a review by what S2 got out of
# it. These no longer decide q_s.
Q_COMPLETE_WITH_ROB = 1.00
Q_COMPLETE_NO_ROB = 0.70
Q_PARTIAL = Q_INCOMPLETE_CAP


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
        # 'resolved' now means only "S2 found an included-studies list", i.e.
        # this document behaved like a synthesis. It deliberately does NOT read
        # resolved_fraction: how much of the review we already hold is `cov`'s
        # job in score_ecu, and a review whose studies we hold NONE of scores
        # cov = 0 -> lift = 1.0 on its own. The gate was never load-bearing; it
        # was only capable of discarding good reviews.
        "resolved": bool(n_listed),
        "unresolved_labels": unresolved,
    }


def _resolve_one(entry: dict, known: dict[str, str]) -> str | None:
    """
    One included-study row -> canonical id, or None.

    Priority mirrors dedup: registry > DOI > PMID > author+year. A row we cannot
    resolve returns None and is COUNTED, never approximated to the nearest
    plausible study -- a wrong resolution silently merges two different trials.
    """
    reg = registry_id(entry.get("nct"))
    for candidate in (reg, _norm_key(entry.get("doi")), _norm_key(entry.get("pmid"))):
        if candidate and candidate in known:
            return known[candidate]

    # Author+year fallback. Measured 2026-08-06: S2 extracted 36 included studies
    # from three reviews and resolved ZERO, because characteristics tables name
    # trials as "Smith 2019" and rarely carry a DOI or PMID.
    #
    # 2026-08-07: also parse the *label* when first_author/year fields are empty.
    # S2 often fills only label="Smith 2019".
    ay = _author_year_key(entry.get("first_author"), entry.get("year"))
    if not ay:
        ay = _author_year_from_label(entry.get("label"))
    if ay:
        hits = known.get(ay)
        if isinstance(hits, str):
            return hits
        # a set means the key was ambiguous at index time

    # Not in the corpus, but still identifiable: build the id the same way dedup
    # would, so it collapses correctly if the primary is retrieved later.
    if reg or entry.get("doi") or entry.get("pmid"):
        kind, cid = canonical_id({"nct": entry.get("nct"),
                                  "doi": entry.get("doi"),
                                  "pmid": entry.get("pmid")})
        return f"{kind}:{cid}"
    return None


def _author_year_from_label(label) -> str | None:
    if not label or not isinstance(label, str):
        return None
    m = _LABEL_AY.match(label.strip())
    if not m:
        return None
    return _author_year_key(m.group(1), m.group(2))


def _author_year_key(first_author, year) -> str | None:
    """
    "Smith 2019" -> "smith|2019". Surname only: reviews write "Smith J",
    "Smith, J.", or "Smith et al." for the same person.
    """
    if not first_author or not year:
        return None
    raw = str(first_author).replace(",", " ").strip()
    # Drop leading "et al" noise if the field was mangled.
    parts = [p for p in raw.split() if p.lower() not in ("et", "al", "al.")]
    if not parts:
        return None
    surname = _norm_key(parts[0])
    if not surname or not str(year).strip().isdigit():
        return None
    return f"{surname}|{int(year)}"


def _norm_key(v) -> str | None:
    if not v:
        return None
    return "".join(ch for ch in str(v).lower() if ch.isalnum()) or None


def review_items(s2: dict | None) -> dict[str, bool | None]:
    """
    The AMSTAR-2-shaped checklist, normalised from S2's `review_methods`.

    Every item may be None. None means "the review did not say", which is not
    the same as "the review did not do it" (invariant 5) -- an unanswered item
    is dropped from the count rather than scored as a failure.
    """
    rm = (s2 or {}).get("review_methods") or {}
    n_db = rm.get("databases_searched")
    funding = rm.get("review_funding")
    return {
        "protocol_registered": rm.get("protocol_registered"),
        "multi_database_search": (None if n_db is None else n_db >= MIN_DATABASES),
        "duplicate_selection": rm.get("duplicate_selection"),
        "rob_assessed": (True if s2 and s2.get("rob_table") else rm.get("rob_assessed")),
        "heterogeneity_assessed": rm.get("heterogeneity_assessed"),
        "publication_bias_assessed": rm.get("publication_bias_assessed"),
        "funding_independent": (None if funding is None else funding == "independent"),
    }


def review_band(items: dict) -> tuple[str, int, int]:
    """
    (band, hits, n_answered). Same shape as scoring.rob_band, and deliberately
    so: both are "count what was actually reported, then band the count".

    Banding on HITS rather than on hits/n_answered is intentional. A review that
    answered one item and passed it is not a high-quality review; it is a review
    that told us almost nothing.
    """
    answered = [v for v in items.values() if v in (True, False)]
    hits = sum(1 for v in answered if v)
    if hits >= 5:
        return "high", hits, len(answered)
    if hits >= 3:
        return "moderate", hits, len(answered)
    return "low", hits, len(answered)


def quality(s2: dict | None, resolution: dict) -> float:
    """
    q_s for the synthesis multiplier -- a property of the REVIEW.

    Deliberately coarse: the term is capped at a 30% lift, so precision buys
    almost nothing here and invented precision would be worse than none.
    """
    if not s2 or not resolution.get("resolved"):
        return Q_UNRESOLVED
    items = review_items(s2)
    band, _hits, n_answered = review_band(items)
    q = Q_NO_METHODS_REPORTED if n_answered == 0 else Q_REVIEW[band]
    if not s2.get("extraction_complete"):
        q = min(q, Q_INCOMPLETE_CAP)
    return q


def to_scoring_input(s2: dict | None, known: dict[str, str] | None = None) -> dict:
    """
    The dict scoring.score_ecu expects: {included_ids, q_s, resolved}.
    """
    res = resolve_included(s2, known)
    items = review_items(s2)
    band, hits, n_answered = review_band(items)
    return {"included_ids": res["included_ids"], "q_s": quality(s2, res),
            "resolved": res["resolved"], "_resolution": res,
            # Reported so a run can be audited on WHY a review counted for what
            # it did. A q_s with no visible checklist behind it is a magic number.
            "_review": {"band": band, "hits": hits, "answered": n_answered,
                        "items": items}}


MAX_TABLE_ROWS = 60          # a very long table is truncated, and we say so
MAX_METHODS_CHARS = 6000

# Same CLI input wall the per-study agents hit (workers.PROMPT_BUDGET_CHARS).
# It matters MORE here than it did for prose: a 12-column characteristics table
# over 60 rows is larger than a methods section, and a truncated table is how S3
# failed for a day. Rows are dropped from the END and the payload says so, which
# S2's prompt reads as "partial" -- an honest under-count, not a silent one.
S2_PROMPT_BUDGET = int(os.environ.get("SP_PROMPT_BUDGET", "12000"))
S2_FIXED_OVERHEAD = 3500     # system + schema + JSON scaffolding (approx)


def s2_payload(record: dict, xml: str | None) -> dict:
    """
    What S2 must see: the candidate tables WITH their row structure, plus the
    methods section for context.

    THE ONE builder for both callers. There used to be two: run_sr_inheritance
    sent tables, while the scored pipeline sent flattened methods+results prose
    from fulltext.best_text. A characteristics table flattened to prose loses
    which dose belongs to which trial, so the scored path was asking S2 to read
    a table it had never been shown -- which is why 12/12 S2 calls "succeeded"
    and 0 resolved.

    Returns tables=[] when there is no full text; callers must treat that as
    "cannot extract", never as "this review lists no studies".
    """
    from sources import fulltext as ft

    tables = ft.extract_tables(xml)
    candidates = [t for t in tables if ft.looks_like_included_studies(t)]
    # If the filter finds nothing, fall back to every table rather than giving
    # S2 nothing -- the heuristic is a filter, not a decision (see fulltext.py).
    chosen = candidates or tables
    sections = ft.sections(xml)
    methods = (sections.get("methods") or "")[:MAX_METHODS_CHARS]

    # Spend the budget on TABLES first. The methods section is context; the table
    # is the payload, and dropping table rows to keep prose would be backwards.
    room = max(1000, S2_PROMPT_BUDGET - S2_FIXED_OVERHEAD - len(methods))
    trimmed, used = [], 0
    for t in chosen:
        rows, dropped = [], False
        for r in t["rows"][:MAX_TABLE_ROWS]:
            size = sum(len(c) for c in r) + len(r)
            if used + size > room:
                dropped = True
                break
            rows.append(r); used += size
        if rows:
            trimmed.append({"label": t["label"], "caption": t["caption"],
                            "rows": rows,
                            "truncated": dropped or len(t["rows"]) > MAX_TABLE_ROWS})
        if used >= room:
            break
    return {
        "title": record.get("title"),
        "tables": trimmed,
        "methods": methods,
        "table_filter_hit": bool(candidates),
    }


# --------------------------------------------------- many reviews, one corpus
#
# WHY SCALING SRs CANNOT DOUBLE-COUNT EVIDENCE
#
# Three different things could be duplicated, and only the third needs new code:
#
#  1. EVIDENCE MASS. Syntheses never enter E (invariant 6). E is the sum of
#     w_study over UNIQUE PRIMARIES. 400 reviews add exactly 0.0 to it. This is
#     not a safeguard we maintain -- it is the definition.
#
#  2. THE MULTIPLIER. score_ecu takes the MAXIMUM cov across syntheses, not a
#     sum: `if c > cov: cov, q = c, q_s`. Thirty meta-analyses of the same nine
#     RCTs therefore yield ONE lift, ceiling 1.30 -- not thirty. Already safe.
#
#  3. INHERITED FACTS. This is the real one. Thirty reviews describe the same
#     trial and disagree about its n or its risk of bias. Resolution collapses
#     them to one canonical id, so the trial stays one unit -- but SOMETHING
#     has to decide which number wins, and "last review processed" is not a
#     rule. merge_inherited is that rule.
#
# What must NEVER become a signal: how many reviews mention a trial. Reviews
# copy each other's inclusion lists. Counting mentions would reward a trial for
# being fashionable, which is the citation-count trap the whole system rejects.
ROB_SEVERITY = {"low": 0, "some_concerns": 1, "high": 2}


def merge_inherited(reviews: list[dict]) -> dict[str, dict]:
    """
    Facts for each primary, merged across every review that described it.

    reviews: [{"review_id": str, "s2": {...}, "included_ids_by_row": {row_index:
    canonical_id}}]  -- see bridge.inherited_facts, which builds it.

    Returns {canonical_id: {n, rob, form, dose_text, duration_days, population,
                            sources: [review_id], conflicts: [field]}}

    CONFLICT RULES, all failing toward under-count (SPEC section 6):

      rob          WORST band wins. Two teams read the same paper and disagreed;
                   taking the kinder judgement would let a product shop for the
                   review that liked its trials.
      n            must AGREE. A disagreement usually means the reviews counted
                   different arms or different follow-ups, and picking one
                   silently changes size_factor. Disagreement -> None.
      everything   only when unanimous among the reviews that reported it.
      else

    Conflicts are RECORDED, not smoothed. A field in `conflicts` is a field we
    refuse to state, and a run that hides that is claiming knowledge it lacks.
    """
    acc: dict[str, dict] = {}
    for rev in reviews:
        rid = rev.get("review_id") or "?"
        s2 = rev.get("s2") or {}
        rob_by_label = inherited_rob(s2)
        rows = s2.get("included_studies") or []
        by_row = rev.get("included_ids_by_row") or {}
        for i, row in enumerate(rows):
            cid = by_row.get(i)
            if not cid:
                continue
            slot = acc.setdefault(cid, {"_seen": {}, "sources": [], "conflicts": []})
            if rid not in slot["sources"]:
                slot["sources"].append(rid)
            facts = {
                "n": row.get("n"),
                "design": row.get("design"),
                "rob": rob_by_label.get(row.get("label")),
                "form": row.get("form"),
                "dose_text": row.get("dose_text"),
                "duration_days": row.get("duration_days"),
                "population": row.get("population"),
            }
            for field, value in facts.items():
                if value is None:
                    continue
                slot["_seen"].setdefault(field, []).append(value)

    out: dict[str, dict] = {}
    for cid, slot in acc.items():
        merged = {"sources": slot["sources"], "conflicts": [],
                  "n_reviews": len(slot["sources"])}
        for field, values in slot["_seen"].items():
            distinct = list(dict.fromkeys(values))
            if len(distinct) == 1:
                merged[field] = distinct[0]
            elif field == "rob":
                # Worst wins, and the disagreement is still recorded.
                merged["rob"] = max(distinct, key=lambda b: ROB_SEVERITY.get(b, 1))
                merged["conflicts"].append("rob")
            else:
                merged[field] = None
                merged["conflicts"].append(field)
        out[cid] = merged
    return out


# ------------------------------------------- trials we can only reach by table
#
# FOUNDER DECISION 2026-08-08 -- INVARIANT 6 AMENDED.
#
# Old: "syntheses add no evidence mass."
# New: "a synthesis DOCUMENT adds no evidence mass. The primary trials it
#       describes do -- once each, at the sr_table tier."
#
# The distinction is the whole point. A meta-analysis of 9 RCTs is not a 10th
# study, and 30 meta-analyses of those 9 are not 30 corroborations -- both are
# still prevented, by canonical-id dedup and by score_ecu's max-cov rule. But
# the 9 trials are real trials with real patients, and if a review's table gives
# us the same facts S3/S4/S7 would have read off the paper, refusing to count
# them discards evidence for no reason other than where we read it.
#
# scoring.py has been ready for this since it was written and nothing ever used
# it: OA_FACTOR["sr_table"] = 0.85 and Study.rob_inherited -> x0.85. Stacked, a
# table-derived trial carries ~0.72 of the weight of the same trial read
# directly. Second-hand facts, second-hand price.
#
# WHAT IS REFUSED, and why each refusal is not negotiable:
#
#   no direction      DISCARDED. Study.direction defaults to null_effect
#                     (s = -0.7), so a missing result would silently become
#                     evidence AGAINST. This is the single most dangerous
#                     default in the system.
#   'unclear'         DISCARDED, same reason.
#   no design         DISCARDED. design_rank drives w_d across a 250x range;
#                     assuming RCT because the review says it included RCTs is
#                     how a non-randomised trial gets full weight.
#   already held      DISCARDED. We scored the real paper. A second unit for the
#                     same trial is the double-count invariant 6 exists to stop.
#   reviews disagree  DISCARDED. Two teams read the same paper and reported
#   on direction      different findings; picking one manufactures a result.
_DESIGN_PATTERNS = (
    # ORDER IS LOAD-BEARING: "randomis" is a substring of "non-randomis", so the
    # negative case must be tested FIRST. Written the other way round it promoted
    # every non-randomised trial from rank 5 to rank 4 (w_d 0.55 -> 1.00) and
    # nothing downstream could have noticed. Caught by selftest, not by review.
    (5, ("non-randomis", "non-randomiz", "nonrandomis", "nonrandomiz",
         "quasi-experimental", "open-label trial")),
    (4, ("randomis", "randomiz", "rct")),
    (6, ("prospective cohort",)),
    (7, ("retrospective cohort",)),
    (8, ("case-control", "case control")),
    (9, ("cross-sectional", "cross sectional")),
)


def design_rank_from_text(text: str | None) -> int | None:
    """
    Verbatim design text -> rank, or None when it does not clearly say.

    Deterministic and deliberately narrow. "Non-randomised" is checked before
    "randomised" because the second is a substring of the first -- an ordering
    bug here would promote every non-randomised trial to rank 4 (w_d 0.55 ->
    1.00) and nothing downstream would notice.
    """
    if not text:
        return None
    t = str(text).lower()
    for rank, needles in _DESIGN_PATTERNS:
        if any(n in t for n in needles):
            return rank
    return None


# A ratio is null at 1, a difference is null at 0. Getting this backwards turns
# every "RR 1.02 (0.88-1.18)" into a benefit.
_RATIO_MEASURES = ("rr", "or", "hr", "risk ratio", "odds ratio", "hazard ratio",
                   "relative risk", "irr", "rate ratio")
_CI = re.compile(
    r"(-?\d+(?:\.\d+)?)\s*(?:to|,|;|–|—|-)\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$")
_CI_ANY = re.compile(
    r"(?:95\s*%?\s*ci|confidence interval)\s*[:=]?\s*[\[\(]?\s*"
    r"(-?\d+(?:\.\d+)?)\s*(?:to|,|;|–|—)\s*(-?\d+(?:\.\d+)?)", re.I)


def direction_from_effect_text(text: str | None) -> str | None:
    """
    "MD -0.30 (95% CI -1.10 to 0.50)" -> "null_effect". Otherwise None.

    RECOVERS ONE HALF OF A REAL GAP. A review often gives a trial's effect
    estimate without ever saying in words whether it worked, and S2 is forbidden
    to judge. But "the confidence interval spans the null" is arithmetic, not
    judgement, so the deterministic layer can answer it -- and a null IS a
    result (invariant 7: s = -0.7), so recovering it recovers real evidence.

    THE OTHER HALF STAYS UNANSWERED ON PURPOSE. When the interval excludes the
    null, the SIGN tells you benefit vs harm only if you know which way is good
    for that outcome -- lower is better for sleep_onset, higher for
    muscle_strength. `vocab/outcome.json` records no polarity, so this returns
    None rather than guessing, and the trial is discarded. Add `polarity` to the
    outcome vocabulary and the other half opens up. See docs/SPEC.md 13.
    """
    if not text:
        return None
    t = " ".join(str(text).split())
    m = _CI_ANY.search(t) or _CI.search(t)
    if not m:
        return None
    try:
        lo, hi = float(m.group(1)), float(m.group(2))
    except (TypeError, ValueError):
        return None
    if lo > hi:
        lo, hi = hi, lo
    null_value = 1.0 if any(k in t.lower() for k in _RATIO_MEASURES) else 0.0
    return "null_effect" if lo <= null_value <= hi else None


def derived_studies(merged: dict[str, dict], *, held_ids: set[str],
                    directions: dict[str, dict]) -> tuple[list[dict], dict]:
    """
    Trials known ONLY through review tables, as scorable study records.

    merged     : output of merge_inherited -- facts per canonical id
    held_ids   : canonical ids already in our corpus. These are SKIPPED.
    directions : {canonical_id: {outcome_raw: {"direction", "magnitude"}}}
                 built from the reviews' results_tables.

    Returns (records, stats). Each record is shaped like a normalised study so
    assemble.to_studies can consume it, plus `oa='sr_table'`, `rob_inherited`
    and provenance. Nothing here invents a field.
    """
    out, stats = [], {"candidates": len(merged), "already_held": 0,
                      "no_direction": 0, "no_design": 0, "direction_conflict": 0,
                      "emitted": 0}
    for cid, facts in merged.items():
        if cid in held_ids:
            stats["already_held"] += 1
            continue
        rank = design_rank_from_text(facts.get("design"))
        if rank is None:
            stats["no_design"] += 1
            continue
        per_outcome = directions.get(cid) or {}
        usable = {k: v for k, v in per_outcome.items()
                  if v.get("direction") in ("benefit", "null_effect", "harm")}
        if not usable:
            if any(v.get("_conflict") for v in per_outcome.values()):
                stats["direction_conflict"] += 1
            else:
                stats["no_direction"] += 1
            continue
        out.append({
            "_canonical": cid,
            "canonical_id": cid,
            "design_rank": rank,
            "n": facts.get("n"),
            "rob": facts.get("rob"),
            "rob_inherited": True,
            "oa": "sr_table",
            "form_text": facts.get("form"),
            "dose_text": facts.get("dose_text"),
            "population_text": facts.get("population"),
            "results": usable,
            "from_reviews": facts.get("sources") or [],
            "fact_conflicts": facts.get("conflicts") or [],
        })
        stats["emitted"] += 1
    return out, stats


def results_by_trial(reviews: list[dict]) -> dict[str, dict]:
    """
    {canonical_id: {outcome_raw: {"direction", "magnitude"}}} across all reviews.

    Reviews that disagree about a trial's direction for the same outcome are
    marked `_conflict` and yield nothing. That is a disagreement about what the
    trial FOUND -- the one fact we cannot average, under-count or guess.
    """
    acc: dict[str, dict] = {}
    for rev in reviews:
        s2 = rev.get("s2") or {}
        by_row = rev.get("included_ids_by_row") or {}
        rows = s2.get("included_studies") or []
        label_to_cid = {(rows[i].get("label") or ""): cid
                        for i, cid in by_row.items() if i < len(rows)}
        for res in (s2.get("results_table") or []):
            cid = label_to_cid.get(res.get("study_label"))
            direction = res.get("direction")
            if direction not in ("benefit", "null_effect", "harm"):
                # S2 could not read a verdict in words. If it copied an effect
                # estimate, a CI spanning the null is still a real finding, and
                # arithmetic may answer what prose did not.
                direction = direction_from_effect_text(res.get("effect_text"))
            if not cid or direction not in ("benefit", "null_effect", "harm"):
                continue
            slot = acc.setdefault(cid, {}).setdefault(
                res.get("outcome_raw") or "?", {})
            if slot and slot.get("direction") not in (None, direction):
                slot["_conflict"] = True
                slot["direction"] = None
            elif not slot.get("_conflict"):
                slot["direction"] = direction
                slot["magnitude"] = res.get("magnitude")
    return acc


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
    index: dict = {}
    ambiguous: set[str] = set()
    for s in studies:
        cid = s.get("canonical_id") or s.get("_canonical")
        if not cid:
            continue
        for key in (registry_id(s.get("registration_id")),
                    _norm_key(s.get("doi")), _norm_key(s.get("pmid"))):
            if key:
                index[key] = cid

        # Author+year is the weakest tier and the only one that can collide.
        # A key matching two DIFFERENT studies is poisoned: mark it so
        # _resolve_one refuses rather than merging two trials.
        ay = _author_year_key(s.get("first_author"), s.get("year"))
        if ay:
            if ay in index and index[ay] != cid:
                ambiguous.add(ay)
            index.setdefault(ay, cid)
    for key in ambiguous:
        index[key] = {"ambiguous"}
    return index
