"""
Demo / product showcase: only a small set of outcomes matters.

Everything else burns S6 tokens and fills reports with noise the buyer never
asks about. NO MODEL HERE — curated lists only.

Default: top 5 per ingredient. Override with --all-outcomes on the runner.
"""
from __future__ import annotations

# Always keep one safety outcome so "is it safe?" still has a row.
_ALWAYS = ("adverse_events_any",)

# Curated for the bottle the founder actually wants to demo.
# Order = preference when ranking for the report centrepiece.
SHOWCASE: dict[str, tuple[str, ...]] = {
    "creatine": (
        "muscle_strength",
        "muscle_power",
        "lean_body_mass",
        "exercise_endurance",
        "adverse_events_any",
    ),
    "magnesium": (
        "sleep_quality",
        "muscle_cramps",
        "anxiety",
        "serum_magnesium",
        "adverse_events_gi",
    ),
    "ashwagandha": (
        "perceived_stress",
        "anxiety",
        "cortisol",
        "sleep_quality",
        "adverse_events_any",
    ),
}

# Fallback when the ingredient has no dedicated list.
DEFAULT_SHOWCASE = (
    "sleep_quality",
    "muscle_strength",
    "energy_levels",
    "anxiety",
    "adverse_events_any",
)


def outcomes_for(ingredient: str, *,
                 top_n: int = 5,
                 all_outcomes: bool = False) -> list[str] | None:
    """
    None  → caller should use the full vocabulary (all_outcomes=True).
    list  → restrict S6 + ECU report to these ids (length ≤ top_n).
    """
    if all_outcomes or top_n <= 0:
        return None
    base = list(SHOWCASE.get(ingredient, DEFAULT_SHOWCASE))
    # De-dupe while preserving order; ensure a safety id is present.
    seen, out = set(), []
    for oid in list(base) + list(_ALWAYS):
        if oid not in seen:
            seen.add(oid)
            out.append(oid)
        if len(out) >= top_n:
            break
    return out[:top_n]


def filter_ecu_rows(rows: list[dict], allowed: list[str] | None) -> list[dict]:
    """Keep only showcase outcomes; stable order follows `allowed`."""
    if not allowed:
        return rows
    by_id = {r.get("outcome_vocab_id"): r for r in rows}
    return [by_id[oid] for oid in allowed if oid in by_id]


def restrict_outcome_vocab(full_outcomes: list[dict],
                           allowed: list[str] | None) -> list[dict]:
    """Shrink the S6 vocabulary payload so the model cannot map into the tail."""
    if not allowed:
        return full_outcomes
    allow = set(allowed)
    return [o for o in full_outcomes if o.get("id") in allow]
