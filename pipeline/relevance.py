"""
Pre-extract relevance gate. NO MODEL.

Before spending S3–S8 tokens, check title + abstract:
  1. Ingredient appears in title or abstract
  2. Looks like an oral / dietary supplement intervention
  3. Not primarily IV / surgical / anesthetic magnesium

Fail → skip extraction (_skipped). Fail under-count, never invent relevance.
"""
from __future__ import annotations

import re

# Title/abstract signals that the paper is clinical-drug magnesium, not a consumer supplement.
_CLINICAL = re.compile(
    r"\b("
    r"intravenous|\biv\b|i\.v\.|infusion|infused|"
    r"surgery|surgical|perioperative|postoperative|preoperative|"
    r"anesthesia|anaesthesia|anesthetic|anaesthetic|sedation|intubation|"
    r"eclampsia|preeclampsia|pre-eclampsia|"
    r"cardiac surgery|bypass|cesarean|caesarean|"
    r"ketamine|nerve block|spinal anesthesia|epidural"
    r")\b",
    re.I,
)

# Signals that magnesium is being given as oral / dietary supplement.
_ORAL_SUPP = re.compile(
    r"\b("
    r"supplement(?:ation|s)?|dietary supplement|oral|"
    r"capsule|capsules|tablet|tablets|softgel|"
    r"mg\s*/\s*day|mg\s*daily|elemental|"
    r"bisglycinate|glycinate|citrate|oxide|malate|threonate|"
    r"powdered|chewable"
    r")\b",
    re.I,
)

# Ingredient used as the tested intervention (not a passing mention).
_INTERVENTION_NEAR = (
    r"(?:supplement(?:ation)?|oral|dietary|administrat(?:ion|ed)|"
    r"intake|dose[d]?|treated with|receiving|received)"
)


def _blob(record: dict) -> tuple[str, str, str]:
    title = (record.get("title") or "").strip()
    abstract = (record.get("abstract") or "").strip()
    return title, abstract, f"{title}\n{abstract}"


def relevance_check(record: dict, ingredient: str) -> tuple[bool, str]:
    """
    Returns (ok, reason).
    ok=False → workers should skip S3–S8 for this study.
    """
    ingredient = (ingredient or "").strip().lower()
    if not ingredient:
        return False, "no ingredient"

    title, abstract, text = _blob(record)
    if not title and not abstract:
        return False, "no title/abstract"

    title_l = title.lower()
    abs_l = abstract.lower()
    text_l = text.lower()

    # 1) Ingredient must appear in title or abstract (not only full body / MeSH).
    if ingredient not in title_l and ingredient not in abs_l:
        return False, "ingredient not in title/abstract"

    # 2) Hard reject: clinical/IV framing in the TITLE.
    if _CLINICAL.search(title):
        return False, "clinical/IV context in title"

    # 3) Clinical framing in abstract without any oral/supplement signal → reject.
    if _CLINICAL.search(text) and not _ORAL_SUPP.search(text):
        return False, "clinical context without oral/supplement signal"

    # 4) Prefer intervention-shaped language.
    # Pass if: ingredient in title, OR oral/supplement cue present, OR
    # "<ingredient> supplementation|oral <ingredient>|..." pattern.
    if ingredient in title_l:
        return True, "ingredient in title"
    if _ORAL_SUPP.search(text):
        return True, "oral/supplement signal"

    # e.g. "magnesium supplementation", "oral magnesium", "supplemented with magnesium"
    pat = re.compile(
        rf"\b({re.escape(ingredient)}\s+{_INTERVENTION_NEAR})|"
        rf"({_INTERVENTION_NEAR}\s+{re.escape(ingredient)})\b",
        re.I,
    )
    if pat.search(text):
        return True, "intervention phrasing"

    return False, "ingredient mention only (not intervention)"


def filter_records(records: list[dict], ingredient: str) -> tuple[list[dict], list[dict]]:
    """Split into (kept, rejected) with rejection reason on each rejected row."""
    kept, rejected = [], []
    for r in records:
        ok, reason = relevance_check(r, ingredient)
        if ok:
            kept.append(r)
        else:
            rejected.append({**r, "_relevance_reject": reason})
    return kept, rejected
