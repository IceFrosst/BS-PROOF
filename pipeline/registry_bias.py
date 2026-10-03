"""
Evidence method v2: the registry side of GRADE's publication-bias domain.
NO MODEL MAY ENTER THIS FILE. Pure functions over ClinicalTrials.gov records
(sources/clinicaltrials.search_completed fetches them).

Egger's test (pipeline/grade.py) needs >= 10 trials and only sees what was
published. The registry sees what was RUN: a trial that completed years ago,
registered this outcome, and has neither posted results nor a linked result
publication is a candidate unpublished trial -- the classic signature of
publication bias (unflattering results left in the drawer).

What it counts, per outcome:

  registered    completed interventional trials whose intervention names the
                ingredient as a whole word ("creatine", never "creatinine"),
                registering an outcome that matches the outcome's search terms
  in_corpus     those whose NCT id is already among our retrieved studies
  unpublished   the rest that sources/clinicaltrials.unpublished_flag flags
                (completed > 2 years ago, no posted results, no RESULT reference)

`unpublished` is an UPPER BOUND: a trial can be published without the registry
linking it, and a trial in our corpus without a stated NCT id is not matched.
That is why it is REPORTED BESIDE the grade and does not downgrade it yet: the
rule turning the count into a downgrade is a founder decision
(docs/REVIEW_PENDING.md #0), and SPEC §12 ("shown, never scored") still governs
production v14.
"""
from __future__ import annotations

import re
from datetime import date

from sources.clinicaltrials import unpublished_flag


def _section(rec: dict, *path):
    node = rec
    for p in path:
        if not isinstance(node, dict):
            return None
        node = node.get(p)
    return node


def _word(term: str) -> re.Pattern:
    return re.compile(r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])")


def names_ingredient(rec: dict, ingredient: str) -> bool:
    """The ingredient is an intervention by NAME (or listed other name), as a
    whole word. A free-text search hit is not enough: measured 2026-10-03, the
    registry's "creatine" search returns cystatin-C / creatinine trials."""
    pat = _word(ingredient)
    for iv in _section(rec, "protocolSection", "armsInterventionsModule", "interventions") or []:
        names = [iv.get("name") or ""] + list(iv.get("otherNames") or [])
        if any(pat.search(n.lower()) for n in names):
            return True
    return False


def registered_outcome_text(rec: dict) -> str:
    mod = _section(rec, "protocolSection", "outcomesModule") or {}
    rows = (mod.get("primaryOutcomes") or []) + (mod.get("secondaryOutcomes") or [])
    return " | ".join(f"{r.get('measure') or ''} {r.get('description') or ''}" for r in rows).lower()


def registry_check(records: list[dict], ingredient: str, outcome_terms: list[str],
                   corpus_ncts: set[str], *, today: date | None = None) -> dict:
    """Registered vs published trials for one ingredient x outcome."""
    pats = [_word(t) for t in outcome_terms if t]
    corpus = {n.upper() for n in corpus_ncts if n}
    registered, in_corpus, unpublished = [], [], []
    for rec in records:
        if _section(rec, "protocolSection", "designModule", "studyType") != "INTERVENTIONAL":
            continue
        if not names_ingredient(rec, ingredient):
            continue
        text = registered_outcome_text(rec)
        if not any(p.search(text) for p in pats):
            continue
        nct = (_section(rec, "protocolSection", "identificationModule", "nctId") or "").upper()
        registered.append(nct)
        if nct in corpus:
            in_corpus.append(nct)
        elif unpublished_flag(rec, today=today)["flagged"]:
            unpublished.append(nct)
    return {"registered": len(registered), "in_corpus": len(in_corpus),
            "unpublished": sorted(unpublished), "upper_bound": True}
