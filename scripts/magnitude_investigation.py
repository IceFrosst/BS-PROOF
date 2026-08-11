"""
Phase 0: is the score's compression OUR bug or the literature's?
NO MODEL MAY ENTER THIS FILE. Offline replay, zero model calls.

    python3 scripts/magnitude_investigation.py [extractions_dump.json]

THE PROBLEM THIS MEASURES. `Study.s_value()` maps magnitude `trivial`, `unstated`
and `None` all to +0.3, so a corpus whose benefits are never sized is HARD-CAPPED
at a score of 30 no matter how many good RCTs it holds (measured 2026-08-11: 30
perfect all-trivial RCTs score exactly 30). The anchor set expects well-established
findings at +80..+95. Before rewriting a single band we need to know which of these
is true:

  (a) our extraction fails to size benefits the papers DID quantify   -> fix S5
  (b) the literature genuinely does not report sizes                  -> the cap is
                                                                          real and
                                                                          the bands
                                                                          or the
                                                                          display
                                                                          scale are
                                                                          what move

Deriving bands before answering this would fit them to a `d` that is still moving,
which is the circularity the harness exists to prevent.

WHAT "SIZEABLE" MEANS HERE. A claim is sizeable if the extraction itself carries a
number that the prompt's own thresholds could act on: `effect_size`, a `p_value`, or
a confidence interval. That is deliberately generous -- it is an upper bound on how
much is recoverable, and the point is to bracket the answer, not to guess each
claim's true magnitude. The counterfactual is reported as a RANGE for the same
reason: `effect_unit` varies too much (% change, kg, Cohen's d, points on a scale)
to auto-size faithfully, so this reports the floor (today) and the ceiling (every
sizeable benefit read as meaningful) rather than inventing a middle.
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

from pipeline.assemble import build_ecus   # noqa: E402
import pipeline.scoring as sc              # noqa: E402

SHOWCASE = ["energy_levels", "muscle_strength", "lean_body_mass",
            "exercise_endurance", "muscle_power"]
PRODUCT = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult", "age_band": "adult", "sex": "mixed",
                          "deficiency_status": "unknown", "pregnancy": "not_pregnant",
                          "health_status": "healthy"},
           "dose_low_mg": 4400, "dose_high_mg": 4400}

UNSIZED = (None, "unstated")


def sizeable(cl: dict) -> bool:
    """Does the extraction already carry a number the prompt's rules could size by?"""
    return (cl.get("effect_size") is not None
            or cl.get("p_value") is not None
            or cl.get("ci_low") is not None
            or cl.get("ci_high") is not None)


def claims(rec: dict):
    """Every S5 claim, plus the record so OA tier is available."""
    for cl in ((rec.get("extraction") or {}).get("S5") or {}).get("claims") or []:
        if isinstance(cl, dict):
            yield cl


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **k)


def resize(dump, mode: str):
    """Copy the dump with unsized BENEFIT claims re-magnituded. Never mutates."""
    import copy
    out = copy.deepcopy(dump)
    for rec in out:
        ex = rec.get("extraction") or {}
        for container in ([(ex.get("S5") or {}).get("claims") or []],
                          [[(o.get("claim") or {}) for o in (ex.get("outcomes") or [])]]):
            for lst in container:
                for cl in lst:
                    if not isinstance(cl, dict):
                        continue
                    if cl.get("direction") != "benefit":
                        continue
                    if cl.get("magnitude") not in UNSIZED:
                        continue
                    if mode == "sizeable_to_meaningful" and sizeable(cl):
                        cl["magnitude"] = "meaningful"
                    elif mode == "all_to_meaningful":
                        cl["magnitude"] = "meaningful"
    return out


def main(dump_path: str) -> int:
    dump = json.load(open(dump_path))
    print(f"loaded {len(dump)} extractions from {Path(dump_path).name}\n")

    # ---------------------------------------------------------------- 1 and 2
    mag = collections.Counter()
    ben_unsized_sizeable = 0
    ben_unsized_unsizeable = 0
    by_oa = collections.Counter()
    field_present = collections.Counter()
    for rec in dump:
        oa = (rec.get("record") or {}).get("oa") or "unknown"
        for cl in claims(rec):
            if cl.get("direction") != "benefit":
                continue
            m = cl.get("magnitude")
            mag[m if m is not None else "None"] += 1
            if m in UNSIZED:
                if sizeable(cl):
                    ben_unsized_sizeable += 1
                    for f in ("effect_size", "p_value", "ci_low"):
                        if cl.get(f) is not None:
                            field_present[f] += 1
                else:
                    ben_unsized_unsizeable += 1
                    by_oa[oa] += 1

    total_ben = sum(mag.values())
    print("=== 1. BENEFIT claims by magnitude ===")
    for k, v in mag.most_common():
        print(f"    {k:<12} {v:>5}  ({v/max(total_ben,1):.1%})")
    print(f"    {'TOTAL':<12} {total_ben:>5}")

    unsized = ben_unsized_sizeable + ben_unsized_unsizeable
    print(f"\n=== 2. Of the {unsized} UNSIZED benefits, how many could have been sized? ===")
    print(f"    carries a number (effect_size / p / CI) : {ben_unsized_sizeable:>5}"
          f"  <- RECOVERABLE, our bug")
    print(f"    carries no number at all               : {ben_unsized_unsizeable:>5}"
          f"  <- the paper gave us nothing")
    if unsized:
        print(f"    recoverable share of unsized benefits  : "
              f"{ben_unsized_sizeable/unsized:.1%}")
    print(f"    which fields the recoverable ones carry: {dict(field_present)}")

    print("\n=== 3. The genuinely unsizeable ones, by OA tier ===")
    print("    (an abstract may honestly not print an effect size; a full text"
          " almost always does)")
    for k, v in by_oa.most_common():
        print(f"    {k:<15} {v:>5}")

    # ------------------------------------------------------------------- 4
    print("\n=== 4. COUNTERFACTUAL: what the cap costs, per outcome ===")
    arms = {
        "A  today": dump,
        "B  size the sizeable ones (our bug fixed)": resize(dump, "sizeable_to_meaningful"),
        "C  size EVERYTHING (unreachable upper bound)": resize(dump, "all_to_meaningful"),
    }
    rows = {}
    for label, data in arms.items():
        r = quiet(build_ecus, data, PRODUCT, prompt_version="investigation",
                  searched_outcomes=SHOWCASE, ignore_population=False,
                  exclude_offtarget_population=True)
        rows[label] = {x["outcome_vocab_id"]: x for x in r}

    for metric, get in (("signed", lambda x: x.get("score")),
                        ("d", lambda x: (x.get("components") or {}).get("d"))):
        print(f"\n    --- {metric} ---")
        print(f"    {'arm':<46}" + "".join(f"{o[:11]:>13}" for o in SHOWCASE))
        for label in arms:
            cells = []
            for o in SHOWCASE:
                x = rows[label].get(o)
                v = get(x) if x else None
                cells.append(f"{'—' if v is None else (format(v, '+.3f') if isinstance(v, float) else v):>13}")
            print(f"    {label:<46}" + "".join(cells))

    print("\n=== VERDICT ===")
    if unsized:
        share = ben_unsized_sizeable / unsized
        print(f"    {share:.0%} of unsized benefits are recoverable by extraction alone.")
        if share >= 0.5:
            print("    -> The cap is substantially OUR BUG. Fix S5 sizing before")
            print("       touching bands or the display scale: B is the honest")
            print("       corpus, and bands derived against A would be fitted to")
            print("       an artefact.")
        else:
            print("    -> The cap is substantially REAL: the literature mostly does")
            print("       not report sizes we can act on. Arm B is close to arm A, so")
            print("       the compression is a property of the evidence and the BANDS")
            print("       or the display scale are what should move.")
    print("\n    Nothing was changed. This script only measures.")
    return 0


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else str(
        Path.home() / ".claude/jobs/d96af802/tmp/extractions_v114.json")
    sys.exit(main(d))
