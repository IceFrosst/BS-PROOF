"""
Calibration harness over the anchor set. NO MODEL MAY ENTER THIS FILE.

The anchor set is a FACE-VALIDITY harness, not a gold standard for magnitude.
It answers one question: does the pipeline put a well-established finding on the
wrong side of zero, or fire the sufficiency gate on a well-studied ECU? Either
means it is broken, and you learn that without a scientist.

It cannot calibrate `k` or the transfer factors -- those need Tier-3 expert
ratings (docs/SPEC.md 13). Do not tune a constant to make an anchor pass; that
inverts the purpose of the harness and invariant 4 forbids it.

    python3 -m pipeline.calibration          # readiness report, no scoring
"""
from __future__ import annotations
import csv
from pathlib import Path

from pipeline import vocab

ANCHORS_CSV = Path(__file__).parent.parent / "docs" / "anchors.csv"

# Anchors whose whole point is a RELATIONSHIP between two ECUs (form A vs form
# B, dose A vs dose B, population A vs population B). They are scored as pairs,
# not against an absolute range, so a range check on them is meaningless.
PAIR_BANDS = {"form_pair", "dose_pair", "dose_pair_null", "population_pair"}

# Anchors that cannot run in v1 by DESIGN, not for want of data. v1 scope is
# 1-2 ingredient products (SPEC section 2); multi-ingredient roll-up is deferred.
# Listing them as "missing vocabulary" would imply work that should not be done.
OUT_OF_V1_SCOPE = {"multivitamin"}


def load() -> list[dict]:
    with open(ANCHORS_CSV) as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k in ("expected_min", "expected_max"):
            r[k] = int(r[k]) if str(r[k]).strip().lstrip("-").isdigit() else None
        r["tests"] = [t for t in r["tests"].split(";") if t]
    return rows


def validate(rows: list[dict] | None = None) -> list[str]:
    """Structural problems in the anchor set itself. Empty means healthy."""
    rows = rows if rows is not None else load()
    problems = []
    seen = set()
    for r in rows:
        aid = r["id"]
        if aid in seen:
            problems.append(f"anchor {aid}: duplicate id")
        seen.add(aid)
        lo, hi = r["expected_min"], r["expected_max"]
        if r["band"] in PAIR_BANDS:
            continue
        if lo is None or hi is None:
            problems.append(f"anchor {aid}: missing expected range")
        elif lo > hi:
            problems.append(f"anchor {aid}: expected_min > expected_max")
        elif not (-100 <= lo <= 100 and -100 <= hi <= 100):
            problems.append(f"anchor {aid}: range outside -100..100")
        # Sign must agree with the band name, or one of the two is wrong.
        if hi is not None and r["band"].endswith("positive") and hi <= 0:
            problems.append(f"anchor {aid}: band says positive, range does not")
        if lo is not None and (r["band"].endswith("negative") or r["band"] == "harm") \
                and lo >= 0:
            problems.append(f"anchor {aid}: band says negative, range does not")
    return problems


def ingredient_key(name: str) -> str:
    """
    Anchor-set ingredient name -> vocab/form.json key.

    The anchor set is written for humans ("vitamin D", "omega-3", "folic acid");
    the vocabulary is keyed for machines. Normalising here rather than rewriting
    either file keeps the anchor set readable, which matters because a human has
    to be able to check it.
    """
    return name.strip().lower().replace("-", "_").replace(" ", "_")


def readiness(rows: list[dict] | None = None) -> dict:
    """
    Which anchors can actually be run today.

    An anchor needs its ingredient in vocab/form.json before the pipeline can
    produce an ECU for it. This is the real distance between "harness written"
    and "harness runnable", and it is vocabulary work, not code.
    """
    rows = rows if rows is not None else load()
    known = set(vocab.ingredients())
    in_scope = [r for r in rows if r["ingredient"] not in OUT_OF_V1_SCOPE]
    deferred = [r for r in rows if r["ingredient"] in OUT_OF_V1_SCOPE]
    ready = [r for r in in_scope if ingredient_key(r["ingredient"]) in known]
    blocked = sorted({r["ingredient"] for r in in_scope
                      if ingredient_key(r["ingredient"]) not in known})
    return {
        "total": len(rows),
        "in_scope": len(in_scope),
        "runnable": len(ready),
        "deferred_out_of_scope": len(deferred),
        "blocked_anchors": len(in_scope) - len(ready),
        "missing_ingredients": blocked,
        "pair_anchors": sum(1 for r in rows if r["band"] in PAIR_BANDS),
        "by_test": _count_tests(rows),
    }


def _count_tests(rows: list[dict]) -> dict:
    out: dict[str, int] = {}
    for r in rows:
        for t in r["tests"]:
            out[t] = out.get(t, 0) + 1
    return dict(sorted(out.items()))


def evaluate(scores: dict[str, int | None], rows: list[dict] | None = None) -> dict:
    """
    Compare produced scores against the anchor set. `scores` maps anchor id ->
    score, with None meaning the sufficiency gate fired.

    Failures are graded, because they are not equally bad:

      sign      the score is on the wrong side of zero. FATAL -- the system is
                telling users the opposite of the evidence.
      gated     no number on a well-studied ECU. Also fatal: the anchor set
                contains only heavily-researched claims.
      range     right sign, outside the expected band. Expected while the
                constants are uncalibrated; informative, not fatal.
    """
    rows = rows if rows is not None else load()
    by_id = {r["id"]: r for r in rows}
    sign, gated, range_miss, passed, skipped = [], [], [], [], []

    for aid, score in scores.items():
        r = by_id.get(aid)
        if not r or r["band"] in PAIR_BANDS:
            skipped.append(aid)
            continue
        lo, hi = r["expected_min"], r["expected_max"]
        if score is None:
            gated.append(aid)
            continue
        expected_positive = lo is not None and lo > 0
        expected_negative = hi is not None and hi < 0
        if (expected_positive and score < 0) or (expected_negative and score > 0):
            sign.append({"id": aid, "score": score, "expected": [lo, hi]})
        elif lo is not None and hi is not None and not (lo <= score <= hi):
            range_miss.append({"id": aid, "score": score, "expected": [lo, hi]})
        else:
            passed.append(aid)

    return {
        "evaluated": len(scores) - len(skipped),
        "passed": len(passed),
        "sign_errors": sign,        # fatal
        "gate_errors": gated,       # fatal
        "range_misses": range_miss,  # expected pre-calibration
        "skipped_pair_anchors": skipped,
        "face_valid": not sign and not gated,
    }


def main() -> int:
    rows = load()
    problems = validate(rows)
    rep = readiness(rows)

    print(f"anchor set: {rep['total']} rows "
          f"({rep['pair_anchors']} are relative pair tests, scored against each "
          f"other rather than a range)")
    for p in problems:
        print("  PROBLEM:", p)

    print(f"\nrunnable today: {rep['runnable']}/{rep['in_scope']} in-scope anchors")
    if rep["deferred_out_of_scope"]:
        print(f"deferred:       {rep['deferred_out_of_scope']} anchor(s) are "
              f"multi-ingredient, which v1 does not do (SPEC section 2).")
        print(f"                Not a vocabulary gap -- do not 'fix' it.")
    if rep["missing_ingredients"]:
        print(f"blocked:        {rep['blocked_anchors']} anchors, missing "
              f"{len(rep['missing_ingredients'])} ingredients from vocab/form.json:")
        for ing in rep["missing_ingredients"]:
            print(f"    {ing}")
    else:
        print("blocked:        none -- every in-scope anchor has a vocabulary entry.")
        print("                Running them needs extraction, i.e. a signed-in")
        print("                Claude subscription (`claude auth status`).")

    print("\nmechanisms exercised:")
    for t, n in rep["by_test"].items():
        print(f"  {t:<34}{n}")
    return 1 if problems else 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
