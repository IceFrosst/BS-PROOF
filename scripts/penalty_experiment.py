"""
A/B/C sweep: what happens if the NEGATIVE penalties come out of the score?
NO MODEL MAY ENTER THIS FILE. Offline replay, zero model calls.

    python3 scripts/penalty_experiment.py [extractions_dump.json]

Founder question 2026-08-11: "an a/b test if we removed any negative penalties".
"Negative penalty" is ambiguous, so this sweeps both mechanisms that can actually
make a score negative, and reports the one consequence a table of scores hides.

SUPERSEDED IN PART BY SCORING_MODEL v8 (2026-08-11). READ THIS BEFORE QUOTING IT.

This script sweeps S_VALUE and H_PENALTY, which under v7 were the only two things
that could push a signed score below zero. Under v8 they are not: `s` now comes
from the measured effect size wherever S5 named the arm, and ANY measured effect
below `EFFECT_MID_SMD` (0.20) is negative by construction. So the arms below
control only the LABEL-FALLBACK share of a corpus, and `real_corpus` is a partial
sweep -- accurate for the v1.14 dump, where 0 of 227 mapped claims take the
measured path, and increasingly incomplete as v1.17 extractions land.

The synthetic fixtures are unaffected and still correct: they set no effect size,
so they exercise the label path deliberately. `scripts/effect_size_experiment.py`
is the sweep for the measured path, and its arm E is the control showing why the
effect-size scale is recentred rather than zero-centred.

The two constants this script does sweep, and what they meant under v7:

    S_VALUE["null_effect"] = -0.35   a well-run null counted as evidence AGAINST
                                     (-0.7 until 2026-08-11; the "A SHIPPED"
                                     label below is stale at -0.7)
    S_VALUE["harm"]        = -1.0    a harm signal

H_PENALTY (0.4) and every weight discount (RoB 0.25, abstract-only OA 0.55,
brand funding 0.60) only shrink a score toward zero -- they cannot flip a sign.
H is swept anyway because it is the other thing that is unambiguously a penalty.

THE DECISIVE OUTPUT IS NOT THE SCORE TABLE. It is the "CAN IT STILL SAY NO?"
fixture: a synthetic product with 20 clean, well-run, unanimous NULL trials --
a genuinely useless supplement that has been properly studied. Under the shipped
constants that product must land firmly negative. Any variant that scores it near
50 has not "removed a penalty", it has removed the system's ability to return a
negative verdict at all -- and a tool called BS-PROOF that can only ever say
"works" or "barely studied" is not measuring anything.

Nothing here changes a constant. S_VALUE and H_PENALTY are invariant-4 founder
decisions (SPEC 13).
"""
from __future__ import annotations

import contextlib
import io
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pipeline.scoring as sc                      # noqa: E402
from pipeline.assemble import build_ecus           # noqa: E402
from pipeline.scoring import Study, score_ecu, band_for  # noqa: E402

SHOWCASE = ["energy_levels", "muscle_strength", "lean_body_mass",
            "exercise_endurance", "muscle_power"]
PRODUCT = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult", "age_band": "adult", "sex": "mixed",
                          "deficiency_status": "unknown", "pregnancy": "not_pregnant",
                          "health_status": "healthy"},
           "dose_low_mg": 4400, "dose_high_mg": 4400}

# null value, H_PENALTY, label
VARIANTS = [
    (-0.7, 0.4, "A  SHIPPED"),
    (-0.5, 0.4, "B  null -0.5"),
    (-0.35, 0.4, "C  null -0.35 (half)"),
    (-0.2, 0.4, "D  null -0.2"),
    (0.0, 0.4, "E  null 0.0 (no null penalty)"),
    (-0.7, 0.0, "F  H_PENALTY 0 only"),
    (0.0, 0.0, "G  BOTH removed"),
]

ROB_CLEAN = {f"i{i}": 1 for i in range(1, 7)}


@contextlib.contextmanager
def constants(null_v: float, h_pen: float):
    """Swap the two constants for one arm, always restoring them."""
    old_s = dict(sc.S_VALUE)
    old_h = sc.H_PENALTY
    try:
        sc.S_VALUE["null_effect"] = null_v
        sc.H_PENALTY = h_pen
        yield
    finally:
        sc.S_VALUE.clear()
        sc.S_VALUE.update(old_s)
        sc.H_PENALTY = old_h


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **k)


def _study(direction: str, magnitude=None, n: int = 60) -> Study:
    return Study(id=f"x{direction}{n}{magnitude}", design_rank=4, n=n,
                 rob_items=ROB_CLEAN, funding="independent", oa="full_text",
                 form_match="exact", dose_match="in_band", pop_match="exact",
                 direction=direction, magnitude=magnitude)


def can_it_still_say_no() -> None:
    """The fixture that decides this. A properly-studied useless product."""
    print("\n" + "=" * 78)
    print("CAN IT STILL SAY NO?  20 clean, well-run, unanimous NULL trials")
    print("  i.e. a supplement that genuinely does nothing, properly studied.")
    print("  A tool that cannot return a negative verdict here is not measuring.")
    print("=" * 78)
    useless = [_study("null_effect") for _ in range(20)]
    works = [_study("benefit", "meaningful") for _ in range(20)]
    unstudied = [_study("benefit", "meaningful", n=12)]
    print(f"  {'variant':<32}{'useless':>9}{'band':<26}{'works':>7}{'1 weak trial':>13}")
    for null_v, h_pen, label in VARIANTS:
        with constants(null_v, h_pen):
            u = score_ecu(useless, [])
            w = score_ecu(works, [])
            t = score_ecu(unstudied, [])
            print(f"  {label:<32}{u['score']:>+9}{'  ' + band_for(u['score']):<26}"
                  f"{w['score']:>+7}{t['score']:>+13}")
    print("\n  'useless' is the column that matters. It must stay clearly negative,")
    print("  and it must stay far from 'works'. If the two converge, the score has")
    print("  stopped discriminating and the evidence arc is carrying the whole")
    print("  message on its own -- which CLAUDE.md invariant 8 says it must not.")


def anchor_reach() -> None:
    """What each variant does to the anchor bands (REVIEW_PENDING open item 3)."""
    from pipeline import calibration as cal
    print("\n" + "=" * 78)
    print("ANCHOR REACHABILITY  -- max null-effect share at which each floor is")
    print("  still reachable at perfect confidence. Open item 3 has been waiting")
    print("  on exactly this: anchor #1 wants creatine strength at +80..+95.")
    print("=" * 78)
    print(f"  {'variant':<32}{'#1 +80':>10}{'#2 +85':>10}{'ceiling@0 nulls':>18}")
    for null_v, h_pen, label in VARIANTS:
        with constants(null_v, h_pen):
            a1 = cal.max_null_share(80.0)
            a2 = cal.max_null_share(85.0)
            top = cal.ceiling_score(0.0)
            f = lambda v: "UNREACHABLE" if v is None else f"{v*100:.1f}%"
            print(f"  {label:<32}{f(a1):>10}{f(a2):>10}{top:>18.1f}")


def real_corpus(dump_path: str) -> None:
    dump = json.load(open(dump_path))
    print("\n" + "=" * 78)
    print(f"REAL CORPUS -- {len(dump)} creatine studies, K={sc.K}, pop B, dose 4400")
    print("=" * 78)
    rows = {}
    for null_v, h_pen, label in VARIANTS:
        with constants(null_v, h_pen):
            r = quiet(build_ecus, dump, PRODUCT, prompt_version="experiment",
                      searched_outcomes=SHOWCASE, ignore_population=False,
                      exclude_offtarget_population=True)
            rows[label] = {x["outcome_vocab_id"]: x for x in r}

    for metric, getter in (("SIGNED", lambda x: x.get("score")),
                           ("COMPOSITE 0-100", lambda x: x.get("composite"))):
        print(f"\n  --- {metric} ---")
        print(f"  {'variant':<32}" + "".join(f"{o[:11]:>13}" for o in SHOWCASE))
        for _, _, label in VARIANTS:
            cells = []
            for o in SHOWCASE:
                x = rows[label].get(o)
                v = getter(x) if x else None
                cells.append(f"{'gated' if v is None else v:>13}")
            print(f"  {label:<32}" + "".join(cells))

    print("\n  --- d (direction) ---")
    print(f"  {'variant':<32}" + "".join(f"{o[:11]:>13}" for o in SHOWCASE))
    for _, _, label in VARIANTS:
        cells = []
        for o in SHOWCASE:
            x = rows[label].get(o)
            d = ((x or {}).get("components") or {}).get("d")
            cells.append(f"{'—' if d is None else format(d, '+.3f'):>13}")
        print(f"  {label:<32}" + "".join(cells))


if __name__ == "__main__":
    dump = sys.argv[1] if len(sys.argv) > 1 else str(
        Path.home() / ".claude/jobs/d96af802/tmp/extractions_v114.json")
    can_it_still_say_no()
    anchor_reach()
    if Path(dump).exists():
        real_corpus(dump)
    else:
        print(f"\n(no dump at {dump}; synthetic arms only)")
    print("\nNothing was changed. S_VALUE and H_PENALTY are invariant-4 founder")
    print("decisions -- SPEC 13 and docs/REVIEW_PENDING.md before either moves.")
