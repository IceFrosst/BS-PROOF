"""
A/B/C: what does effect-size s_value do to the creatine corpus?
NO MODEL MAY ENTER THIS FILE. Offline replay, zero model calls.

    python3 scripts/effect_size_experiment.py [extractions_dump.json]

Arm A is the OLD vote-counting model, reproduced by making every unit refuse to
standardise so every study falls back to its direction label. Arm B is what
ships. Arm C and D sweep the two constants that define the scale, because
EFFECT_MID_SMD and EFFECT_FULL_SMD are founder-owned (invariant 4, SPEC 13) and
the founder should see their sensitivity rather than take 0.2/0.8 on faith.

READ THE COVERAGE LINE FIRST. This change only bites where a usable number
exists, and on the v1.14 dump that is 107 of 243 sized claims (44%) -- the rest
are within-group changes, unsigned eta-squared, ratios whose null is 1, or raw
units needing an SD we never extract. v1.15 roughly doubles how many nulls carry
a number, so the shipped effect will be LARGER than what this prints. Do not
read these numbers as the final state of the score; read them as the direction
and rough size of the move.
"""
from __future__ import annotations

import collections
import contextlib
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pipeline.scoring as sc                    # noqa: E402
from pipeline.assemble import build_ecus         # noqa: E402

SHOWCASE = ["energy_levels", "muscle_strength", "lean_body_mass",
            "exercise_endurance", "muscle_power"]
PRODUCT = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult", "age_band": "adult", "sex": "mixed",
                          "deficiency_status": "unknown", "pregnancy": "not_pregnant",
                          "health_status": "healthy"},
           "dose_low_mg": 4400, "dose_high_mg": 4400}


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **k)


@contextlib.contextmanager
def scale(mid_smd=None, full_smd=None, disable=False):
    """
    Swap the effect-size scale for one arm, always restoring it.

    `disable=True` reproduces the OLD model exactly by replacing
    standardise_effect with a function that refuses everything -- which is the
    honest way to build arm A, because it exercises the same fallback path
    production uses rather than a separate reimplementation of the old formula.
    """
    old = (sc.EFFECT_MID_SMD, sc.EFFECT_FULL_SMD, sc.standardise_effect)
    try:
        if mid_smd is not None:
            sc.EFFECT_MID_SMD = mid_smd
        if full_smd is not None:
            sc.EFFECT_FULL_SMD = full_smd
        if disable:
            sc.standardise_effect = lambda v, u: (None, "arm_A_disabled")
        yield
    finally:
        sc.EFFECT_MID_SMD, sc.EFFECT_FULL_SMD, sc.standardise_effect = old


def run(dump):
    rows = quiet(build_ecus, dump, PRODUCT, prompt_version="experiment",
                 searched_outcomes=SHOWCASE, ignore_population=False,
                 exclude_offtarget_population=True)
    return {r["outcome_vocab_id"]: r for r in rows}


def coverage(dump):
    """How much of the corpus can this change actually reach?"""
    routes = collections.Counter()
    for rec in dump:
        for o in ((rec.get("extraction") or {}).get("outcomes") or []):
            cl = o.get("claim") or {}
            oid = o.get("outcome_vocab_id") or o.get("vocab_id")
            if not oid:
                continue
            from pipeline.assemble import _effect_s
            _, route = _effect_s(cl, oid)
            routes[route] += 1
    return routes


def main(dump_path: str) -> int:
    dump = json.load(open(dump_path))
    print(f"loaded {len(dump)} extractions from {Path(dump_path).name}")
    print(f"K={sc.K}  MID_SMD={sc.EFFECT_MID_SMD}  FULL_SMD={sc.EFFECT_FULL_SMD}"
          f"  MID_PCT={sc.EFFECT_MID_PCT}  FULL_PCT={sc.EFFECT_FULL_PCT}\n")

    routes = coverage(dump)
    total = sum(routes.values())
    used = routes["smd"] + routes["percent"]
    print("=== COVERAGE: how many MAPPED claims get a measured s? ===")
    for r, n in routes.most_common():
        mark = "  <- used" if r in ("smd", "percent") else ""
        print(f"    {r:<36}{n:>5}{n / max(total,1):>7.0%}{mark}")
    print(f"    {'TOTAL mapped claims':<36}{total:>5}")
    print(f"\n    measured s on {used}/{total} ({used / max(total,1):.0%}) of mapped claims."
          f"\n    The label path is therefore still the majority path, and v1.15"
          f"\n    (numbers on nulls) is what raises this -- not a scale change.")

    arms = {}
    with scale(disable=True):
        arms["A  vote counting (old)"] = run(dump)
    arms["B  effect size, 0.2/0.8 (SHIPPED)"] = run(dump)
    with scale(mid_smd=0.2, full_smd=0.5):
        arms["C  effect size, 0.2/0.5"] = run(dump)
    with scale(mid_smd=0.1, full_smd=0.8):
        arms["D  effect size, 0.1/0.8"] = run(dump)
    with scale(mid_smd=0.0, full_smd=0.8):
        arms["E  centred on ZERO, 0.0/0.8"] = run(dump)

    for metric, get in (
            ("SIGNED score", lambda x: x.get("score")),
            ("d (direction)", lambda x: (x.get("components") or {}).get("d")),
            ("COMPOSITE 0-100", lambda x: x.get("composite"))):
        print(f"\n=== {metric} ===")
        print(f"  {'arm':<36}" + "".join(f"{o[:11]:>13}" for o in SHOWCASE))
        for label, rows in arms.items():
            cells = []
            for o in SHOWCASE:
                x = rows.get(o)
                v = get(x) if x else None
                if v is None:
                    cells.append(f"{'gated':>13}")
                elif isinstance(v, float):
                    cells.append(f"{v:>+13.3f}")
                else:
                    cells.append(f"{v:>13}")
            print(f"  {label:<36}" + "".join(cells))

    print("\n=== WHAT MOVED, and is it in the right direction? ===")
    A, B = arms["A  vote counting (old)"], arms["B  effect size, 0.2/0.8 (SHIPPED)"]
    for o in SHOWCASE:
        a, b = A.get(o), B.get(o)
        if not a or not b:
            continue
        sa, sb = a.get("score"), b.get("score")
        if sa is None or sb is None:
            continue
        print(f"    {o:<20}{sa:>+5} -> {sb:>+5}   ({sb - sa:+d})")
    print("\n    External check, and the only one that is not our own arithmetic:")
    print("    7 published pooled estimates put creatine on muscle strength at")
    print("    SMD 0.28-0.46 with CIs excluding zero. Under arm B a corpus of such")
    print("    trials would score about "
          f"{round(100 * sc.standardise_effect(0.43, 'cohen d')[0]):+d}. Vote counting")
    print("    scored the same evidence -15.")

    print("\n=== ARM E IS THE CONTROL THAT MUST FAIL ===")
    print("    Arm E centres on zero instead of on the meaningful threshold. It is")
    print("    included because it is the OBVIOUS implementation and it is wrong:")
    print("    a well-powered trial measuring a true zero effect scores s=0, so a")
    print("    properly-studied useless product reads 'inconclusive' -- which")
    print("    scripts/penalty_experiment.py argues is indistinguishable from never")
    print("    having been studied. Check it on the fixture:")
    rob = {f"i{i}": 1 for i in range(1, 7)}
    for label, mid in (("B  recentred on 0.2", 0.2), ("E  centred on zero", 0.0)):
        with scale(mid_smd=mid):
            useless = [sc.Study(id=f"u{i}", design_rank=4, n=60, rob_items=rob,
                                funding="independent", oa="full_text",
                                form_match="exact", dose_match="in_band",
                                pop_match="exact", direction="null_effect",
                                effect_s=sc.standardise_effect(0.0, "cohen d")[0])
                       for i in range(20)]
            r = sc.score_ecu(useless, [])
            print(f"      {label:<24}20 measured-zero trials -> {r['score']:>+5}"
                  f"  {sc.band_for(r['score'])}")
    print("\n    Recentring is not a tuning choice. It is what keeps invariant 7")
    print("    true while removing the vote-counting error.")

    print("\nNothing was changed. This script only measures.")
    return 0


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else str(
        Path.home() / ".claude/jobs/d96af802/tmp/extractions_v114.json")
    sys.exit(main(d))
