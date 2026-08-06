"""
Controlled vocabularies: loading, validation, and the deterministic lookups
built on them. NO MODEL MAY ENTER THIS FILE.

S3, S6 and S7 extract *into* these vocabularies. The vocabularies themselves are
data, and every operation over them is arithmetic or a table lookup:

  - elemental / active-moiety conversion   (the 5x dose trap)
  - salt-family -> form transfer tier
  - four-axis population -> pop_match tier
  - ECU key construction

Putting a model in any of these loops means the same bottle scores differently
next Tuesday. Implements SPEC sections 5 and 8.
"""
from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path

VOCAB_DIR = Path(__file__).parent.parent / "vocab"

# Transfer tiers. These names are the keys of FORM_FACTOR / POP_FACTOR in
# scoring.py -- do not rename one without the other.
EXACT, ADJACENT, DIFFERENT = "exact", "adjacent", "different"
SALT_FAMILY, UNSPECIFIED = "salt_family", "unspecified"


@lru_cache(maxsize=None)
def load(name: str) -> dict:
    """load('outcome' | 'form' | 'population'). Cached: these never change at runtime."""
    path = VOCAB_DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"vocabulary {name!r} missing at {path}")
    return json.loads(path.read_text())


def versions() -> dict:
    """For the ECU provenance block. A vocab change must be visible in the output."""
    return {n: load(n)["version"] for n in ("outcome", "form", "population")}


# ---------------------------------------------------------------- outcome

@lru_cache(maxsize=None)
def outcome_ids() -> frozenset:
    return frozenset(o["id"] for o in load("outcome")["outcomes"])


def outcome(vocab_id: str) -> dict | None:
    return next((o for o in load("outcome")["outcomes"] if o["id"] == vocab_id), None)


def outcome_kind(vocab_id: str) -> str | None:
    o = outcome(vocab_id)
    return o["kind"] if o else None


# ---------------------------------------------------------------- form

def ingredients() -> list[str]:
    return sorted(load("form")["ingredients"])


def forms_for(ingredient: str) -> list[dict]:
    block = load("form")["ingredients"].get(ingredient)
    return block["forms"] if block else []


def form(ingredient: str, form_vocab_id: str) -> dict | None:
    return next((f for f in forms_for(ingredient) if f["id"] == form_vocab_id), None)


def unspecified_form_id(ingredient: str) -> str | None:
    """The id S7 must use rather than guess a salt. Exactly one per ingredient."""
    ids = [f["id"] for f in forms_for(ingredient) if f["salt_family"] is None]
    return ids[0] if len(ids) == 1 else None


def elemental_dose_mg(ingredient: str, form_vocab_id: str,
                      compound_dose_mg: float | None) -> tuple[float | None, str]:
    """
    Compound dose -> elemental (or active-moiety) dose. Returns (dose, basis).

    The MODEL never does this arithmetic. S7 reports the compound figure and the
    form id; the conversion happens here, from molar masses recorded in the
    vocabulary, so it is reproducible and auditable.

    Returns (None, 'compound_only') whenever conversion would be a guess -- an
    unknown form, a missing molar mass, or a salt whose hydration state is
    routinely unstated. A dose wrong by 5x destroys dose-band matching silently,
    so refusing to convert is the correct answer (invariant 5).
    """
    if compound_dose_mg is None:
        return None, "unstated"
    f = form(ingredient, form_vocab_id)
    if not f:
        return None, "compound_only"
    if not f.get("conversion_safe"):
        return None, "compound_only"
    mm, am = f.get("molar_mass_g_mol"), f.get("active_mass_g_mol")
    if not mm or not am:
        return None, "compound_only"
    return round(compound_dose_mg * (am / mm), 3), "converted"


def elemental_dose_range_mg(ingredient: str, form_vocab_id: str,
                            compound_dose_mg: float | None) -> dict:
    """
    The elemental dose as an INTERVAL. Returns {low, high, basis}.

    Refusing to convert a hydrate-ambiguous salt (see elemental_dose_mg) is the
    right answer for a point estimate and the wrong answer for the pipeline: the
    ambiguity is bounded, not unknown. The true elemental dose lies between the
    fully-hydrated and anhydrous conversions, and that interval is usually narrow
    enough to fall inside a single dose band -- 1.1x to 1.4x for the organic
    salts, worst case 2.1x for chloride. Discarding a study we can bracket is
    over-caution, and over-caution costs coverage the project cannot spare.

      basis 'converted'    exact; low == high
      basis 'bounded'      low != high; band assignment must handle the interval
      basis 'compound_only' no molar data at all -- genuinely unknown
      basis 'unstated'     no dose given

    A 'bounded' dose that straddles two bands is NOT resolved by picking one.
    That is a dose_match of 'unspecified', decided downstream, not here.
    """
    if compound_dose_mg is None:
        return {"low": None, "high": None, "basis": "unstated"}

    point, basis = elemental_dose_mg(ingredient, form_vocab_id, compound_dose_mg)
    if basis == "converted":
        return {"low": point, "high": point, "basis": "converted"}

    f = form(ingredient, form_vocab_id)
    if not f:
        return {"low": None, "high": None, "basis": "compound_only"}
    mm, am, hm = (f.get("molar_mass_g_mol"), f.get("active_mass_g_mol"),
                  f.get("hydrate_molar_mass_g_mol"))
    if not (mm and am and hm):
        return {"low": None, "high": None, "basis": "compound_only"}

    # More water per mole of salt -> less active mass per mg of powder.
    return {"low": round(compound_dose_mg * (am / hm), 3),
            "high": round(compound_dose_mg * (am / mm), 3),
            "basis": "bounded"}


def form_match(ingredient: str, study_form_id: str | None,
               product_form_id: str | None) -> str:
    """
    Transfer tier between the form a trial used and the form in the bottle.
    Keys map onto FORM_FACTOR in scoring.py: exact 1.00 / salt_family 0.50 /
    different 0.15 / unspecified 0.30.
    """
    if not study_form_id or not product_form_id:
        return UNSPECIFIED
    if study_form_id == product_form_id:
        return EXACT
    a, b = form(ingredient, study_form_id), form(ingredient, product_form_id)
    if not a or not b:
        return UNSPECIFIED
    # A form with no salt family is the *_unspecified member, not a family match.
    if a["salt_family"] is None or b["salt_family"] is None:
        return UNSPECIFIED
    return SALT_FAMILY if a["salt_family"] == b["salt_family"] else DIFFERENT


# ---------------------------------------------------------------- population

AXES = ("age_band", "sex", "deficiency_status", "pregnancy")


def _axis_match(axis: str, a: str, b: str) -> str:
    spec = load("population")["axes"][axis]
    if a == b:
        return EXACT
    # 'unknown' is a known unknown: adjacent by policy, never a free pass.
    if "unknown" in (a, b):
        return ADJACENT if spec.get("unknown_policy") == "adjacent" else DIFFERENT
    pairs = {frozenset(p) for p in spec["adjacent_pairs"]}
    return ADJACENT if frozenset((a, b)) in pairs else DIFFERENT


def pop_match(study_pop: dict, product_pop: dict) -> str:
    """
    Four-axis population match collapsed to one tier, by WORST axis:
    all exact -> exact; any different -> different; otherwise adjacent.
    Maps onto POP_FACTOR: exact 1.00 / adjacent 0.70 / different 0.35.
    """
    tiers = [_axis_match(ax, study_pop.get(ax, "unknown"), product_pop.get(ax, "unknown"))
             for ax in AXES]
    if DIFFERENT in tiers:
        return DIFFERENT
    return EXACT if all(t == EXACT for t in tiers) else ADJACENT


def population_variants() -> list[dict]:
    """The four precomputed rows. The delta between them is the product feature."""
    return load("population")["precomputed_variants"]


# ---------------------------------------------------------------- ECU key

UNBANDED = "unbanded"


def ecu_key(ingredient: str, form_vocab_id: str, dose_band: str | None,
            outcome_vocab_id: str, population_id: str) -> str:
    """
    The 5-tuple, flattened. Exact-key lookup on a btree index -- this is why the
    store is a relational DB and not a vector DB.

    dose_band is None until bands are derived from observed doses; 'unbanded'
    keeps the key well-formed in the meantime rather than inventing a band.
    """
    return "|".join([ingredient, form_vocab_id, dose_band or UNBANDED,
                     outcome_vocab_id, population_id])


# ---------------------------------------------------------------- validation

def validate() -> list[str]:
    """
    Structural checks over the vocabularies themselves. Returns a list of
    problems; empty means healthy. Run from selftest -- a malformed vocabulary
    must fail loudly at build time, not silently mis-map an extraction.
    """
    problems = []

    seen = set()
    for o in load("outcome")["outcomes"]:
        if o["id"] in seen:
            problems.append(f"outcome: duplicate id {o['id']}")
        seen.add(o["id"])
        if o["kind"] not in ("clinical", "biomarker", "adverse_event"):
            problems.append(f"outcome {o['id']}: bad kind {o['kind']}")

    for ing in ingredients():
        block = load("form")["ingredients"][ing]
        families = set(block["salt_families"])
        ids = [f["id"] for f in block["forms"]]
        if len(ids) != len(set(ids)):
            problems.append(f"form/{ing}: duplicate form ids")
        if unspecified_form_id(ing) is None:
            problems.append(f"form/{ing}: needs exactly one form with salt_family null")
        for f in block["forms"]:
            fam = f["salt_family"]
            if fam is not None and fam not in families:
                problems.append(f"form/{ing}/{f['id']}: salt_family {fam} not declared")
            if f.get("conversion_safe") and not (f.get("molar_mass_g_mol") and f.get("active_mass_g_mol")):
                problems.append(f"form/{ing}/{f['id']}: conversion_safe but no molar masses")
            if f.get("conversion_safe") and f["active_mass_g_mol"] > f["molar_mass_g_mol"]:
                problems.append(f"form/{ing}/{f['id']}: active mass exceeds molar mass")
            hm = f.get("hydrate_molar_mass_g_mol")
            if hm and hm <= (f.get("molar_mass_g_mol") or 0):
                problems.append(f"form/{ing}/{f['id']}: hydrate mass not above anhydrous")
            if hm and f.get("conversion_safe"):
                problems.append(f"form/{ing}/{f['id']}: conversion_safe forms need no hydrate mass")

    pop = load("population")
    for ax in AXES:
        if ax not in pop["axes"]:
            problems.append(f"population: missing axis {ax}")
            continue
        values = set(pop["axes"][ax]["values"])
        if "unknown" not in values:
            problems.append(f"population/{ax}: no 'unknown' member")
        for pair in pop["axes"][ax]["adjacent_pairs"]:
            for v in pair:
                if v not in values:
                    problems.append(f"population/{ax}: adjacency names unknown value {v}")
    for variant in pop["precomputed_variants"]:
        for ax in AXES:
            if variant[ax] not in set(pop["axes"][ax]["values"]):
                problems.append(f"population variant {variant['id']}: bad {ax}={variant[ax]}")

    return problems


if __name__ == "__main__":
    import sys
    issues = validate()
    for p in issues:
        print("PROBLEM:", p)
    print(f"outcomes={len(outcome_ids())} ingredients={ingredients()} "
          f"versions={versions()}")
    sys.exit(1 if issues else 0)
