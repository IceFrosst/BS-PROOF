"""
Showcase: only the top-N outcomes by how many studies exist.

NO MODEL HERE. Ranking is deterministic Europe PMC RCT hit counts
(ingredient as intervention + outcome terms).

That answers: "which claims does the literature actually study for this
ingredient?" — not a hand-picked marketing list.

Fallback curated lists exist only if the network ranking fails.
"""
from __future__ import annotations

from pipeline import vocab

# Last-resort fallback if Europe PMC is unreachable.
_FALLBACK: dict[str, tuple[str, ...]] = {
    "creatine": (
        "muscle_strength", "muscle_power", "lean_body_mass",
        "exercise_endurance", "adverse_events_any",
    ),
    "magnesium": (
        "sleep_quality", "muscle_cramps", "anxiety",
        "serum_magnesium", "adverse_events_gi",
    ),
    "ashwagandha": (
        "perceived_stress", "anxiety", "cortisol",
        "sleep_quality", "adverse_events_any",
    ),
}
_DEFAULT_FALLBACK = (
    "sleep_quality", "muscle_strength", "energy_levels",
    "anxiety", "adverse_events_any",
)


def rank_outcomes_by_study_count(ingredient: str) -> list[tuple[str, int]]:
    """
    Every outcome id with its Europe PMC RCT hit count, highest first.

    One cheap pageSize=1 call per outcome (hitCount only — no paper download).
    """
    from sources import europepmc as ep
    from sources.http import SourceError

    ranked: list[tuple[str, int]] = []
    for oid in sorted(vocab.outcome_ids()):
        try:
            n = ep.outcome_hit_count(ingredient, oid)
        except (SourceError, OSError, ValueError, KeyError, TypeError):
            n = 0
        ranked.append((oid, int(n or 0)))
    ranked.sort(key=lambda kv: (-kv[1], kv[0]))
    return ranked


def outcomes_for(ingredient: str, *,
                 top_n: int = 5,
                 all_outcomes: bool = False,
                 counts_out: dict | None = None) -> list[str] | None:
    """
    None  → full vocabulary (--all-outcomes).
    list  → top-N outcome ids by published RCT count.

    If counts_out is a dict, it is filled with {outcome_id: hit_count} for
    the chosen set (and optionally the full ranking in counts_out['_all']).
    """
    if all_outcomes or top_n <= 0:
        return None

    try:
        ranked = rank_outcomes_by_study_count(ingredient)
    except Exception as e:
        print(f"  showcase rank failed ({e}); using fallback list")
        base = list(_FALLBACK.get(ingredient, _DEFAULT_FALLBACK))
        if counts_out is not None:
            counts_out.update({oid: -1 for oid in base[:top_n]})
        return base[:top_n]

    # Prefer outcomes with at least one trial; if fewer than top_n have hits,
    # fill with the next-highest zeros so the report still has N slots.
    with_hits = [(oid, n) for oid, n in ranked if n > 0]
    without = [(oid, n) for oid, n in ranked if n <= 0]
    ordered = with_hits + without

    chosen = ordered[:top_n]
    if counts_out is not None:
        counts_out.clear()
        counts_out.update({oid: n for oid, n in chosen})
        counts_out["_all"] = {oid: n for oid, n in ranked}

    ids = [oid for oid, _ in chosen]
    print(f"  showcase top-{len(ids)} by RCT count for {ingredient}:")
    for oid, n in chosen:
        label = (vocab.outcome(oid) or {}).get("label", oid)
        print(f"    {n:>5} studies  {label} ({oid})")
    return ids


def filter_ecu_rows(rows: list[dict], allowed: list[str] | None) -> list[dict]:
    """Keep showcase outcomes; order follows `allowed` (study-count rank)."""
    if not allowed:
        return rows
    by_id = {r.get("outcome_vocab_id"): r for r in rows}
    return [by_id[oid] for oid in allowed if oid in by_id]


def filter_ecu_rows_by_extracted_n(rows: list[dict], top_n: int = 5) -> list[dict]:
    """
    Alternate ranking AFTER scoring: top-N by n_primaries in this run.
    Used when allowlist was None but the report still wants a short table.
    """
    def n_of(r):
        return int(
            r.get("n_primaries")
            or (r.get("evidence") or {}).get("n_primaries")
            or 0
        )
    return sorted(rows, key=lambda r: -n_of(r))[:top_n]


def restrict_outcome_vocab(full_outcomes: list[dict],
                           allowed: list[str] | None) -> list[dict]:
    """Shrink the S6 vocabulary so the model cannot map into the tail."""
    if not allowed:
        return full_outcomes
    allow = set(allowed)
    return [o for o in full_outcomes if o.get("id") in allow]
