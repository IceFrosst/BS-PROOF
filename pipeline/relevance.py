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

from pipeline import vocab

# SEPARATORS ARE NOT PART OF AN INGREDIENT'S NAME. Measured 2026-08-28 on the
# first omega-3 run: the gate resolved `omega_3` to "omega 3" and required that
# LITERAL substring, so "Effect of omega-3 supplementation on CRP" was dropped as
# "ingredient not in title/abstract" while the same title with a space passed.
# 249 of 267 real omega-3 trials were discarded that way -- precision 1.00,
# recall 0.067 -- and the run logged it as "dropped 360 noise".
#
# This is the SAME CLASS as the vitamin_d incident below, whose fix (underscore
# -> space) cured one spelling instead of the class. `beta_carotene`
# (beta-carotene, the greek-letter form) was broken identically and had never
# been run. Full audit: docs/history/2026-08-28-omega3-relevance-gate-audit.md
#
# Zero separators is deliberate ("omega3" is one more real spelling). Case is
# handled by re.I, and the class is exactly the separators a name can be written
# with -- NOT \W, which would let "omega, 3" or "omega. 3" match across a
# sentence boundary.
_SEP = r"[\s\-\u2010\u2011\u2012\u2013\u2014_]*"


_SEP_SPLIT = re.compile(r"[\s\-‐‑‒–—_]+")


def _tolerant(name: str) -> str:
    """
    'omega 3' -> 'omega[sep]*3'. A one-word name is returned unchanged.

    Splits on EVERY separator, not just spaces, so one vocabulary entry covers
    every way the name is punctuated: "n-3 fatty acid" written as "n - 3 fatty
    acids" (measured in the corpus) matches the same entry, and the greek "w-3"
    covers "w 3" too.
    """
    return _SEP.join(re.escape(part) for part in _SEP_SPLIT.split(name.strip()) if part)


def _name_patterns(name: str, vocab_id: str) -> list[re.Pattern]:
    """
    The canonical name plus every vocabulary synonym, each separator-tolerant.

    Takes BOTH spellings on purpose: `name` is the prose form ("omega 3") that
    matches paper text, while `vocab_id` is the untouched key ("omega_3") the
    vocabulary is indexed by. Looking synonyms up under the prose form silently
    returns nothing -- the underscore is the key.

    Synonyms are bounded on both sides (\b) because several are short tokens
    ("EPA", "DHA") that would otherwise match inside unrelated words. The
    canonical name is deliberately NOT bounded, preserving the substring
    semantics the gate has always had ("vitamin d" still matches "vitamin d3").
    """
    pats = [re.compile(_tolerant(name), re.I)]
    for syn in vocab.search_synonyms(vocab_id):
        # `s?` because a paper writes "n-3 fatty acidS" and the closing \b would
        # otherwise refuse the plural: 4 real trials were lost to exactly that.
        pats.append(re.compile(rf"\b{_tolerant(syn)}s?\b", re.I))
    return pats


def _found(pats: list[re.Pattern], text: str) -> bool:
    return any(p.search(text) for p in pats)

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
    # A vocab ID is not text a paper contains. Same defect as the Europe PMC
    # query builders (sources.europepmc.search_term): ids are snake_case, and
    # "vitamin_d" appears in no abstract ever written. MEASURED 2026-08-09:
    # after the retrieval fix, vitamin_d found 179 primaries and 175 RCT-rank
    # records, and this gate dropped ALL 175 as "ingredient not in
    # title/abstract" -- reported as "dropped 175 noise", which reads like the
    # gate working rather than the gate being broken.
    #
    # Fixed here rather than at the call site because every caller holds a vocab
    # id, so every caller would otherwise need to remember the same conversion.
    #
    # The ID IS KEPT: the vocabulary is indexed by it, so the synonym lookup needs
    # the underscore form while the matching needs the prose form.
    vocab_id = (ingredient or "").strip().lower()
    ingredient = " ".join(vocab_id.split("_"))
    if not ingredient:
        return False, "no ingredient"

    title, abstract, text = _blob(record)
    if not title and not abstract:
        return False, "no title/abstract"

    title_l = title.lower()
    abs_l = abstract.lower()
    text_l = text.lower()

    pats = _name_patterns(ingredient, vocab_id)
    name_re = pats[0]

    # 1) Ingredient must appear in title or abstract (not only full body / MeSH).
    if not _found(pats, title_l) and not _found(pats, abs_l):
        return False, "ingredient not in title/abstract"

    # 1b) ...but not ONLY as part of a biomarker name. MEASURED 2026-08-10: 16
    # records in the creatine store match "creatine" solely via "creatine kinase"
    # / "creatine phosphokinase" -- the muscle-damage ENZYME, not the supplement.
    # One of them ("The impact of a repeated bout of eccentric exercise on
    # muscular strength, muscle soreness and creatine kinase", 1994, no arm
    # ingested anything) survived every downstream gate and voted -0.7 against
    # creatine's muscle_strength claim; a paper-verifier reading the abstract
    # found the trial compared exercise BOUTS, not supplements. The rule is
    # count-based, not a blocklist: a real creatine trial also measures CK, so
    # "creatine supplementation ... serum creatine kinase" has more bare
    # mentions than marker mentions and passes. Only when EVERY mention is the
    # marker is there no supplement in the paper at all. Generic across
    # ingredients -- "magnesium kinase" does not exist, so other ingredients
    # simply never trigger it.
    _marker = re.compile(rf"{_tolerant(ingredient)}\s+(kinase|phosphokinase)", re.I)
    blob_ta = f"{title_l} {abs_l}"
    n_mentions = len(name_re.findall(blob_ta))
    n_marker = len(_marker.findall(blob_ta))
    if n_mentions and n_mentions == n_marker:
        return False, "marker mention only (e.g. creatine kinase)"

    # 1c) Topical route in the TITLE. Audited 2026-08-11: "Repeated Application
    # of a Novel Creatine CREAM" voted -0.7 against ORAL creatine's muscle_power
    # claim -- and its abstract reports no oral-arm result at all, so the null
    # was not just wrong-route, it was unsupported by any text. This pipeline
    # scores oral supplementation (SPEC section 1); a cream answers a different
    # question. Title-only, like the clinical gate: a trial that merely MENTIONS
    # topical delivery in the abstract still passes.
    if re.search(r"\b(cream|topical|transdermal|ointment|gel applied|dermal)\b",
                 title_l):
        return False, "topical/transdermal route in title"

    # 2) Hard reject: clinical/IV framing in the TITLE.
    if _CLINICAL.search(title):
        return False, "clinical/IV context in title"

    # 3) Clinical framing in abstract without any oral/supplement signal → reject.
    if _CLINICAL.search(text) and not _ORAL_SUPP.search(text):
        return False, "clinical context without oral/supplement signal"

    # 4) Prefer intervention-shaped language.
    # Pass if: ingredient in title, OR oral/supplement cue present, OR
    # "<ingredient> supplementation|oral <ingredient>|..." pattern.
    if _found(pats, title_l):
        return True, "ingredient in title"
    if _ORAL_SUPP.search(text):
        return True, "oral/supplement signal"

    # e.g. "magnesium supplementation", "oral magnesium", "supplemented with magnesium"
    pat = re.compile(
        rf"\b({_tolerant(ingredient)}\s+{_INTERVENTION_NEAR})|"
        rf"({_INTERVENTION_NEAR}\s+{_tolerant(ingredient)})\b",
        re.I,
    )
    if pat.search(text):
        return True, "intervention phrasing"

    return False, "ingredient mention only (not intervention)"


