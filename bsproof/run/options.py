"""
Command-line options for one pipeline run (`run_pipeline.py`). NO MODEL.

Replaces the hand-rolled `"--flag" in args` parsing that lived at the top of
run_pipeline.main() until 2026-10-03. Same flags, same defaults and the same
precedence; the one deliberate difference is that an UNKNOWN flag is now an
error instead of silently becoming the ingredient name.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

DEFAULT_TOP_OUTCOMES = 5

PILOT_REMOVED = (
    "--pilot was removed. Use the default Claude production backend, e.g.\n"
    "  run_pipeline.py <ingredient> --form <form> --limit 40 "
    "--full-text-only --intervention-scope"
)


@dataclass(frozen=True)
class RunOptions:
    ingredient: str
    form: str
    wiring: bool
    grok: bool
    demo: bool
    full_text_only: bool
    with_sr: bool
    all_outcomes: bool
    top_n: int
    scope: str
    dose_mg: float | None
    # Founder 2026-08-08: score the WHOLE available corpus by default. A capped
    # run is a SAMPLE, and its score is not the full-corpus score -- c grows with
    # n by construction (pipeline/preview.py). So the cap is opt-IN.
    limit: int | None


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="run_pipeline.py",
        description="Score one ingredient end to end (retrieve -> extract -> score -> report).")
    p.add_argument("ingredients", nargs="*", default=["magnesium"],
                   help="ingredient vocabulary id; only the first is run (default: magnesium)")
    p.add_argument("--form", default="magnesium_glycinate", help="form vocabulary id")
    backend = p.add_argument_group("backend (default: Claude production)")
    backend.add_argument("--wiring", action="store_true", help="synthetic extraction, no model")
    backend.add_argument("--grok", action="store_true", help="Grok CLI backend (separate store)")
    backend.add_argument("--pilot", action="store_true", help=argparse.SUPPRESS)
    p.add_argument("--dose", type=float, help="the product's ELEMENTAL mg, for the dose axis")
    p.add_argument("--limit", type=int, help="cap studies extracted (default: whole corpus)")
    p.add_argument("--with-sr", action="store_true", help="mine systematic-review tables (S2)")
    p.add_argument("--demo", action="store_true",
                   help="exact form only + ignore population (NOT production)")
    p.add_argument("--full-text-only", action="store_true", help="score only full-text studies")
    p.add_argument("--all-oa", action="store_true", help="include abstract-only studies")
    p.add_argument("--all-outcomes", action="store_true", help="score the full outcome vocabulary")
    p.add_argument("--top-outcomes", type=int, default=DEFAULT_TOP_OUTCOMES,
                   help="showcase top-N outcomes by RCT count (default 5)")
    scope = p.add_argument_group("retrieval scope (default: intervention with --grok, else broad)")
    scope.add_argument("--broad-scope", action="store_true")
    scope.add_argument("--supplement-scope", action="store_true")
    scope.add_argument("--intervention-scope", action="store_true")
    scope.add_argument("--per-outcome", action="store_true",
                       help="one retrieval query per outcome")
    return p


def parse_args(argv: list[str]) -> RunOptions | str:
    """RunOptions, or the message to print before exiting 1."""
    a = build_parser().parse_args(argv)
    if a.pilot:
        # pilot_adapter was removed 2026-10-02 (superseded by claude_adapter's
        # --safe-mode on the same subscription). Its demo defaults are flags.
        return PILOT_REMOVED
    if a.wiring and a.grok:
        return "Pick only one of --wiring, --grok"

    # Same precedence the old parser had: --all-oa then --full-text-only.
    full_text_only = a.grok
    if a.all_oa:
        full_text_only = False
    if a.full_text_only:
        full_text_only = True

    # Later flags win, in this fixed order (not command-line order), as before.
    scope = "intervention" if a.grok else "broad"
    for flag, value in (("broad_scope", "broad"), ("supplement_scope", "supplement"),
                        ("intervention_scope", "intervention"), ("per_outcome", "per_outcome")):
        if getattr(a, flag):
            scope = value

    return RunOptions(
        ingredient=a.ingredients[0], form=a.form, wiring=a.wiring, grok=a.grok,
        demo=a.demo, full_text_only=full_text_only, with_sr=a.with_sr,
        all_outcomes=a.all_outcomes, top_n=a.top_outcomes, scope=scope,
        dose_mg=a.dose, limit=a.limit)
