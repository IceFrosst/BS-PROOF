"""
Command-line options for one pipeline run (`run_pipeline.py`). NO MODEL.
An unknown flag is an error, never the ingredient name.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

DEFAULT_TOP_OUTCOMES = 5


@dataclass(frozen=True)
class RunOptions:
    ingredient: str
    form: str
    wiring: bool
    full_text_only: bool
    all_outcomes: bool
    top_n: int
    scope: str
    dose_mg: float | None
    # Founder 2026-08-08: score the WHOLE available corpus by default. A capped
    # run is a SAMPLE of the evidence, not the answer. So the cap is opt-IN.
    limit: int | None


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="run_pipeline.py",
        description="Grade one ingredient end to end (retrieve -> extract -> pool + GRADE -> report).")
    p.add_argument("ingredients", nargs="*", default=["magnesium"],
                   help="ingredient vocabulary id; only the first is run (default: magnesium)")
    p.add_argument("--form", default="magnesium_glycinate", help="form vocabulary id")
    p.add_argument("--wiring", action="store_true", help="synthetic extraction, no model")
    p.add_argument("--dose", type=float, help="the product's ELEMENTAL mg, for the dose match")
    p.add_argument("--limit", type=int, help="cap studies extracted (default: whole corpus)")
    p.add_argument("--full-text-only", action="store_true", help="extract only full-text studies")
    p.add_argument("--all-outcomes", action="store_true", help="grade the full outcome vocabulary")
    p.add_argument("--top-outcomes", type=int, default=DEFAULT_TOP_OUTCOMES,
                   help="showcase top-N outcomes by RCT count (default 5)")
    scope = p.add_argument_group("retrieval scope (default: broad; later flags in this list win)")
    scope.add_argument("--broad-scope", action="store_true")
    scope.add_argument("--supplement-scope", action="store_true")
    scope.add_argument("--intervention-scope", action="store_true")
    scope.add_argument("--per-outcome", action="store_true",
                       help="one retrieval query per outcome")
    return p


def parse_args(argv: list[str]) -> RunOptions:
    a = build_parser().parse_args(argv)
    # Later flags win, in this fixed order (not command-line order).
    scope = "broad"
    for flag, value in (("broad_scope", "broad"), ("supplement_scope", "supplement"),
                        ("intervention_scope", "intervention"), ("per_outcome", "per_outcome")):
        if getattr(a, flag):
            scope = value
    return RunOptions(
        ingredient=a.ingredients[0], form=a.form, wiring=a.wiring,
        full_text_only=a.full_text_only, all_outcomes=a.all_outcomes,
        top_n=a.top_outcomes, scope=scope, dose_mg=a.dose, limit=a.limit)
