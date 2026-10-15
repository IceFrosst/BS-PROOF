"""
The tested arm's daily dose, and a product dose compared with it. NO MODEL HERE.

    S7    -> compound / elemental / per-kg dose of the tested arm (a reading)
    vocab -> elemental / active-moiety mg (molar-mass arithmetic, deterministic)
    here  -> the arm's daily elemental interval, and the product's tier against it

Evidence method v2 reads these through pipeline/pool.py (trial_dose,
dose_match_tier): form and dose are GRADE indirectness, never study weight.
Moved here from the v14 assemble.py on 2026-10-15, unchanged; the v14 benefit
dose bands and closeness ramp are in docs/history/v14-scoring-model.md.

A dose we could not convert is refused, never guessed. Hydrate-ambiguous salts
give a bounded interval instead of a point, and an interval that straddles a
tier edge resolves to "unspecified" rather than being rounded to the likelier
side.
"""
from __future__ import annotations

import math

from pipeline import vocab
from pipeline.eligibility import _arm_norm


def _s7_for_claim(s7: dict | None, claim: dict, s3: dict | None,
                   *, modern: bool = False) -> dict | None:
    """Select S7 facts only from S5/S3's administered target arm.

    Arm-keyed S7 facts must be joined by an evidenced label, never by array
    position.  In particular, a one-row S7 response may be the control arm, so
    its length does not make it safe to project onto the ingredient claim.
    Legacy top-level S7 envelopes remain usable unchanged.
    """
    if not isinstance(s7, dict):
        return None
    arm_rows = s7.get("arms")
    if not isinstance(arm_rows, list) or not arm_rows:
        # Top-level S7 facts are an explicitly legacy contract only. A modern
        # envelope with omitted arm rows must not silently fall back to the
        # historical positional/top-level dose.
        return None if modern else s7
    if modern and any(not isinstance(row, dict) or
                      any(key not in row for key in (
                          "label", "form_vocab_id", "form_raw", "compound_dose_mg",
                          "elemental_dose_mg", "dose_per_kg_mg",
                          "mean_body_mass_kg", "dose_basis",
                          "dose_frequency_per_day", "evidence_span"))
                      for row in arm_rows):
        return None
    s3_arms = s3.get("arms") if isinstance(s3, dict) else None
    if not isinstance(s3_arms, list) or not s3_arms:
        return None

    def _administered_target(a: dict) -> bool:
        # An arm-keyed S7 row is usable only when S3 explicitly evidenced that
        # the corresponding arm was administered. A null/omitted role is not a
        # safe fallback: it could be a biomarker or measurement row carrying a
        # tempting dose.
        return (a.get("role") == "administered" and
                a.get("target_ingredient_presence") == "yes")

    targets = [a for a in s3_arms if isinstance(a, dict) and _administered_target(a)
               and _arm_norm(a.get("label"))]
    wanted = claim.get("ingredient_arm")
    if isinstance(wanted, str) and wanted.strip():
        target_labels = [a for a in targets
                         if _arm_norm(a.get("label")) == _arm_norm(wanted)]
        if len(target_labels) != 1:
            return None
        target_label = _arm_norm(target_labels[0].get("label"))
    else:
        # The firewall may resolve an unnamed claim only when there is exactly
        # one target/control pair. Requiring one target here avoids borrowing a
        # dose from an arbitrary active arm or from a placebo-only S7 row.
        if len(targets) != 1:
            return None
        target_label = _arm_norm(targets[0].get("label"))

    matches = [a for a in arm_rows if isinstance(a, dict)
               and _arm_norm(a.get("label")) == target_label]
    return matches[0] if len(matches) == 1 else None


def _pos_finite(x) -> float | None:
    """A strictly positive, finite number, or None. Anything else is refused.

    Exists because an adversarial pass found three ways a bad envelope value
    became a confident dose: dose_per_kg_mg=-300 x mean_body_mass_kg=-70
    multiplied to +21000 (two negatives cancel, and the schema had no minimum);
    Infinity survives json.loads on the non-schema-validated fallback paths in
    claude_adapter._extract_payload; and a STRING elemental dose crashed
    to_studies with a TypeError inside dose_match_for -- study doses never
    entered comparisons before dose_match went per-study, so the type was
    never load-bearing until 2026-08-12. Zero is refused too: "0 mg" is not a
    dose, and treating it as one made dose_match read below_50.
    """
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v <= 0:
        return None
    return v


def study_dose(ingredient: str, s7: dict | None) -> dict:
    if not s7:
        return {"dose_low_mg": None, "dose_high_mg": None, "dose_basis": "unstated"}
    form_id = s7.get("form_vocab_id")
    declared_basis = s7.get("dose_basis") or "unstated"

    def _compound(value) -> dict:
        amount = _pos_finite(value)
        rng = vocab.elemental_dose_range_mg(ingredient, form_id, amount)
        return {"dose_low_mg": rng["low"], "dose_high_mg": rng["high"],
                "dose_basis": rng["basis"]}

    elemental = _pos_finite(s7.get("elemental_dose_mg"))
    compound = _pos_finite(s7.get("compound_dose_mg"))

    # A known-form extraction sometimes copies compound_dose_mg into the
    # elemental field. Equality is not evidence that the amount is elemental:
    # when a known conversion exists, prefer the explicitly convertible
    # compound interpretation.  Unknown/bounded forms cannot trigger this
    # rule, because there is no exact factor with which to identify a copy.
    if elemental is not None and compound is not None and math.isclose(
            elemental, compound, rel_tol=1e-9, abs_tol=1e-9):
        known = vocab.elemental_dose_range_mg(ingredient, form_id, compound)
        if known.get("basis") == "converted":
            return _compound(compound)

    # Explicit compound-only reports (including a copied elemental field) are
    # converted only here. Per-kg compound values are converted after their
    # stated body mass is applied.
    if declared_basis == "compound_only":
        if compound is not None and elemental is not None and not math.isclose(
                compound, elemental, rel_tol=1e-9, abs_tol=1e-9):
            return {"dose_low_mg": None, "dose_high_mg": None,
                    "dose_basis": "contradictory_dose_fields"}
        if compound is not None or elemental is not None:
            return _compound(compound if compound is not None else elemental)

    # An explicit elemental amount remains authoritative over a redundant
    # per-kg field. (The copied-field case was handled above.)
    if elemental is not None and declared_basis != "compound_only":
        # When both fields are present, verify that they describe the same
        # basis. A mismatch is safer as a refusal than an invented preference.
        if compound is not None:
            converted = vocab.elemental_dose_range_mg(ingredient, form_id, compound)
            if (converted["low"] is None or converted["high"] is None
                    or not converted["low"] <= elemental <= converted["high"]):
                return {"dose_low_mg": None, "dose_high_mg": None,
                        "dose_basis": "contradictory_dose_fields"}
        return {"dose_low_mg": elemental, "dose_high_mg": elemental,
                "dose_basis": declared_basis}
    # PER-KG DOSING (v1.19): arithmetic uses only the paper's stated mass.
    # Critically, a missing elemental_dose_mg does not block this branch: S7's
    # per-kg value is elemental unless the declaration explicitly says compound.
    per_kg = _pos_finite(s7.get("dose_per_kg_mg"))
    mass = _pos_finite(s7.get("mean_body_mass_kg"))
    if per_kg is not None and mass is not None:
        daily = per_kg * mass
        if declared_basis == "compound_only":
            return _compound(daily)
        return {"dose_low_mg": daily, "dose_high_mg": daily,
                "dose_basis": "per_kg_x_stated_mass"}

    # Legacy/unstated envelopes with an explicit elemental value are already on
    # the active-moiety axis; retain it rather than treating it as compound.
    if elemental is not None:
        return {"dose_low_mg": elemental, "dose_high_mg": elemental,
                "dose_basis": "elemental_stated"}
    return _compound(compound)


def dose_match_for(product_low: float | None, product_high: float | None,
                   band: dict) -> str:
    """
    Product dose vs a band (in v2: one trial's own daily dose) -> a tier
    (SPEC section 8):

        in_band     inside the band
        low_50_99   50-99% of the low end
        below_50    under half the low end
        above_200   more than twice the high end
        unspecified no band, no dose, or an interval that straddles

    An ambiguous product dose is NOT rounded to the likelier tier. A hydrate
    salt whose bounded interval spans the band edge genuinely does not have an
    answer, and inventing one here would silently move the grade.
    """
    # .get() on BOTH keys, and high checked too. An adversarial pass verified
    # the crash this guards: a band dict with "low" set but "high" missing raised
    # KeyError, and {"low": X, "high": None} raised TypeError at 2*None -- both
    # unreachable from effective_range (which always emits the pair), but
    # dose_match_for became a two-caller function on 2026-08-12 and a future
    # product dict with only dose_low_mg set would have crashed mid-run instead
    # of reading "unspecified".
    if (band.get("low") is None or band.get("high") is None
            or product_low is None or product_high is None):
        return "unspecified"

    lo, hi = band["low"], band["high"]

    def tier(dose: float) -> str:
        if dose < 0.5 * lo:
            return "below_50"
        if dose < lo:
            return "low_50_99"
        if dose > 2 * hi:
            return "above_200"
        return "in_band"

    t_low, t_high = tier(product_low), tier(product_high)
    # The interval lands in two different tiers -> no defensible single answer.
    return t_low if t_low == t_high else "unspecified"
