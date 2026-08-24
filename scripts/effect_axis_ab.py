#!/usr/bin/env python3
"""A/B/C experiment on the EFFECT axis. EXPERIMENT ONLY — writes no run,
changes no constant, never touches production scoring.

Question (founder, 2026-08-24): "Can we just disable nulls completely from
the effect axis, so a supplement with all nulls scores ~0 and only harms
score negatively — or is this a bad idea?"

Variants, all re-scored from a retained run's OWN extractions (the same
reconstruction scripts/rescore_run.py uses, so no model calls):

  A  CURRENT        S_VALUE null_effect = -0.35 (production, control)
  B1 NULLS ZEROED   null_effect claims keep their weight but contribute s=0
                    (an all-null outcome pulls its d toward 0 = "inconclusive")
  B2 NULLS REMOVED  null_effect claims are dropped from the effect evidence
                    entirely (an all-null outcome has NO effect evidence and
                    dies by confidence instead)
  C  SHADOW POOLED  the v13 measured-effect pooled Hedges g (k>=2 strata,
                    from the run artifact's own v13_shadow block) replaces the
                    outcome's vote-counted d through the SAME transform the
                    production effect-size route uses
                    (_rescale(g, EFFECT_MID_SMD, EFFECT_FULL_SMD)); outcomes
                    without a pooled g keep variant A's d. Confidence, form
                    and dose terms are held fixed at the variant-A values so
                    the delta is the effect axis alone.

In B1/B2 the effect-size route for nulls is also disabled: the point of the
variant is "nulls do not push the score", so a null's measured magnitude must
not sneak back in through effect_s. Harm and benefit claims are untouched.

Usage:
  python scripts/effect_axis_ab.py <run-prefix> [--dose 4396]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.rescore_run import _find, _design_ranks, _extractions, _score  # noqa: E402
from pipeline import scoring  # noqa: E402


def _composites(rows: list) -> dict:
    return {r["outcome_vocab_id"]: {
        "composite": r.get("composite"),
        "signed": r.get("score"),
        "d": (r.get("components") or {}).get("d"),
        "c": (r.get("components") or {}).get("c"),
        "arcs": r.get("arcs") or {},
    } for r in rows}


def _score_variant(context: dict, ranks: dict, dose_mg, *, null_s=None,
                   drop_nulls=False) -> dict:
    """Score with a patched null policy, restoring production values after."""
    original_s_value = dict(scoring.S_VALUE)
    try:
        if null_s is not None:
            scoring.S_VALUE["null_effect"] = null_s
        if drop_nulls or null_s is not None:
            # Both B variants must silence the effect-size route for nulls
            # too: a null's measured magnitude re-entering via effect_s would
            # contradict "nulls do not push the score".
            ctx = json.loads(json.dumps(context))  # deep copy, JSON-native
            for study in ctx.get("studies_list") or []:
                claims = ((study.get("extraction") or {}).get("s5_claims")) or []
                kept = []
                for cl in claims:
                    if cl.get("direction") == "null_effect":
                        if drop_nulls:
                            continue
                        cl = {**cl, "effect_size": None, "ci_low": None,
                              "ci_high": None}
                    kept.append(cl)
                if isinstance(study.get("extraction"), dict):
                    study["extraction"]["s5_claims"] = kept
            context = ctx
        return _composites(_score(context, ranks, dose_mg))
    finally:
        scoring.S_VALUE.clear()
        scoring.S_VALUE.update(original_s_value)


def main(argv: list) -> int:
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 1
    run_prefix = argv[0]
    dose = None
    if "--dose" in argv:
        dose = float(argv[argv.index("--dose") + 1])
    ctx_path, dash_path = _find(run_prefix)
    context = json.loads(ctx_path.read_text())
    ranks = _design_ranks(dash_path)
    dose = dose if dose is not None else (
        (context.get("product") or {}).get("dose_low_mg"))

    a = _score_variant(context, ranks, dose)
    b1 = _score_variant(context, ranks, dose, null_s=0.0)
    b2 = _score_variant(context, ranks, dose, drop_nulls=True)

    # C: swap the effect term with the pooled shadow g through the production
    # SMD transform; keep c/form/dose from variant A.
    pooled = {}
    for row in (context.get("v13_shadow") or {}).get("outcomes", []):
        if row.get("k", 0) >= 2 and row.get("pooled_g") is not None:
            # First (i.e. most-measured after the summary sort) pooled stratum
            # per outcome wins; others are recorded for transparency.
            pooled.setdefault(row["outcome"], row)
    c_scores = {}
    for outcome, av in a.items():
        row = pooled.get(outcome)
        arcs = av["arcs"]
        c_conf = av["c"]
        form_t = (arcs.get("form") or {}).get("strength")
        dose_t = (arcs.get("dose") or {}).get("closeness")
        if row is None or c_conf is None or form_t is None or dose_t is None:
            c_scores[outcome] = {"composite": av["composite"], "d": av["d"],
                                 "pooled_g": None, "k": None, "note": "no pooled g; = A"}
            continue
        s_g = scoring._rescale(row["pooled_g"], scoring.EFFECT_MID_SMD,
                               scoring.EFFECT_FULL_SMD)
        comp = round(100 * c_conf * (((s_g + 1) / 2) + form_t + dose_t) / 3)
        c_scores[outcome] = {"composite": comp, "d": round(s_g, 3),
                             "pooled_g": row["pooled_g"], "k": row["k"],
                             "ci": row.get("ci"), "note": row["stratum"]}

    print(f"\nEFFECT-AXIS A/B/C — {ctx_path.name}")
    print(f"dose={dose}  (EXPERIMENT ONLY: no run written, constants restored)\n")
    hdr = f"{'outcome':<22}{'A cur':>7}{'B1 null=0':>11}{'B2 no-null':>12}{'C shadow':>10}"
    print(hdr)
    print("-" * len(hdr))
    for outcome in sorted(a):
        print(f"{outcome:<22}"
              f"{a[outcome]['composite']!s:>7}"
              f"{b1[outcome]['composite']!s:>11}"
              f"{b2[outcome]['composite']!s:>12}"
              f"{c_scores[outcome]['composite']!s:>10}")
    print("\nd (effect verdict) per variant:")
    for outcome in sorted(a):
        cs = c_scores[outcome]
        extra = (f"  pooled g={cs['pooled_g']:+.3f} k={cs['k']} ci={cs.get('ci')}"
                 if cs.get("pooled_g") is not None else "  (no pooled g)")
        print(f"{outcome:<22} A={a[outcome]['d']!s:>7} B1={b1[outcome]['d']!s:>7} "
              f"B2={b2[outcome]['d']!s:>7} C={cs['d']!s:>7}{extra}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
