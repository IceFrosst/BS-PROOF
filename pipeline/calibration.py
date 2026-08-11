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
            pe = (r.get("pair_expect") or "").strip()
            if not (r.get("pair_id") or "").strip():
                problems.append(f"anchor {aid}: pair band with no pair_id -- it would "
                                f"be silently skipped, which is how 14 of 35 anchors "
                                f"went unscored until 2026-08-11")
            elif pe not in PAIR_EXPECT:
                problems.append(f"anchor {aid}: pair_expect {pe!r} not in {sorted(PAIR_EXPECT)}")
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

    # Each pair must be exactly one `a` and one `b` that AGREE on the relationship.
    # Both rows carry pair_expect so either is self-describing; disagreement means
    # the transcription from ANCHORS.md prose went wrong, and a half-pair can never
    # be scored at all.
    groups: dict[str, list[dict]] = {}
    for r in rows:
        pid = (r.get("pair_id") or "").strip()
        if pid:
            groups.setdefault(pid, []).append(r)
    for pid, members in sorted(groups.items()):
        ids = sorted(m["id"] for m in members)
        if len(members) != 2 or not (ids[0].endswith("a") and ids[1].endswith("b")):
            problems.append(f"pair {pid}: expected one 'a' and one 'b', got {ids}")
        expects = {(m.get("pair_expect") or "").strip() for m in members}
        if len(expects) != 1:
            problems.append(f"pair {pid}: members disagree on pair_expect {expects}")
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


# The expected RELATIONSHIP for a pair anchor, transcribed into docs/anchors.csv
# 2026-08-11 from the prose at docs/ANCHORS.md:193-224. Until then 14 of 35 anchors
# -- 40% of the set, and the only SCALE-FREE ones -- were merely `skipped`, so the
# tests ANCHORS.md calls "the cleanest available tests of the moat" were never run.
PAIR_EXPECT = frozenset({"a_gt_b", "b_gt_a", "approx_equal"})

# Band order, most negative to most positive. The pair test is expressed in BANDS
# rather than raw points on purpose: "D3 clearly higher than D2" is a claim about
# verdicts, and comparing bands invents no new tolerance constant. The cost is
# bluntness -- two scores inside one 40-point band read as equal -- which is why
# `pair_margin` exists as an OPT-IN column and is empty everywhere. Putting a number
# there is a founder decision (invariant 4), so the loose-but-honest test ships
# rather than a tuned one.
_BAND_ORDER = ("strong evidence against / harm", "does not work",
               "weak evidence against", "inconclusive", "weak support",
               "moderate support", "strong support")


def band_rank(score: int) -> int:
    """Ordinal position of a score's band. Higher = more positive."""
    from pipeline.scoring import band_for
    return _BAND_ORDER.index(band_for(score))


def evaluate_pairs(scores: dict[str, int | None],
                   rows: list[dict] | None = None) -> dict:
    """
    Score the RELATIONAL anchors. These survive any recalibration.

    A pair anchor asserts an ordering, not a magnitude, so it stays valid when `k`,
    `S_VALUE` or a band moves -- which is exactly why it is worth more than an
    absolute range while the constants are uncalibrated. ANCHORS.md:203-204 states
    the stake plainly: "If #22 and #23 come out equal, the form factor is not being
    applied and the product's core differentiator is dead."

    `pair_error` is FATAL, the same class as a sign error. Getting D3 below D2 does
    not mean the magnitude is off; it means the transfer model is inverted.

    #26 (creatine 3 g maintenance vs 20 g loading, `approx_equal`) is the
    FALSE-POSITIVE guard and reads in the opposite direction from the others: if the
    higher dose scores higher, the dose factor is behaving as a monotone function
    instead of a band match, which would penalise correctly-dosed products.

    A pair whose members are missing or gated is `incomplete`, not an error -- a
    gate is already fatal in `evaluate()` and must not be counted twice.
    """
    rows = rows if rows is not None else load()
    scores = scores or {}
    groups: dict[str, list[dict]] = {}
    for r in rows:
        pid = (r.get("pair_id") or "").strip()
        if pid and r.get("band") in PAIR_BANDS:
            groups.setdefault(pid, []).append(r)

    errors, passed, incomplete = [], [], []
    for pid, members in sorted(groups.items()):
        a = next((m for m in members if m["id"].endswith("a")), None)
        b = next((m for m in members if m["id"].endswith("b")), None)
        if not a or not b:
            incomplete.append({"pair": pid, "why": "pair is not exactly one a and one b"})
            continue
        sa, sb = scores.get(a["id"]), scores.get(b["id"])
        if sa is None or sb is None:
            incomplete.append({"pair": pid, "why": "a member was gated or not scored",
                               "a": sa, "b": sb})
            continue
        expect = (a.get("pair_expect") or "").strip()
        ra, rb = band_rank(sa), band_rank(sb)
        if expect == "a_gt_b":
            ok = ra > rb
        elif expect == "b_gt_a":
            ok = rb > ra
        elif expect == "approx_equal":
            ok = ra == rb
        else:
            incomplete.append({"pair": pid, "why": f"unknown pair_expect {expect!r}"})
            continue
        rec = {"pair": pid, "expect": expect, "a": sa, "b": sb,
               "a_id": a["id"], "b_id": b["id"]}
        (passed if ok else errors).append(rec)

    return {
        "pairs": len(groups),
        "passed": len(passed),
        "pair_errors": errors,          # fatal
        "incomplete": incomplete,
        "relationally_valid": not errors,
    }


# band column -> the band_for() class that row is asserting. ANCHORS.md:274 says
# every numeric boundary "was set by judgment, not measurement", and evaluate()
# already grades a range miss as non-fatal, so the honest test of magnitude is the
# CLASS, with one tier of slack while the constants are uncalibrated.
STRATUM_OF_BAND = {
    "strong_positive": "strong support",
    "moderate_positive": "moderate support",
    "weak_positive": "weak support",
    "inconclusive": "inconclusive",
    "moderate_negative": "does not work",
    "strong_negative": "strong evidence against / harm",
    "harm": "strong evidence against / harm",
}


def evaluate_strata(scores: dict[str, int | None],
                    rows: list[dict] | None = None, *, slack: int = 1) -> dict:
    """
    Does each absolute anchor land in the BAND CLASS it claims, within `slack` tiers?

    This is the replacement for testing the numeric window, and it is strictly
    weaker on purpose. The windows are uncited judgement (ANCHORS.md:274), and
    measured 2026-08-11 the +80..+95 window is only satisfiable when <11.8% of
    weighted evidence is null -- so a numeric miss says more about the window than
    about the pipeline. A CLASS miss of two or more tiers is a real signal: it means
    the pipeline and the literature disagree about the kind of verdict, not the
    decimal.

    Phase 2 replaces these strata with bands derived from published trial mixtures.
    Until then this is the honest test: ordinal, tolerant, and falsifiable.
    """
    rows = rows if rows is not None else load()
    by_id = {r["id"]: r for r in rows}
    off, ok, unscored = [], [], []
    for aid, score in (scores or {}).items():
        r = by_id.get(aid)
        if not r or r["band"] in PAIR_BANDS:
            continue
        want = STRATUM_OF_BAND.get(r["band"])
        if want is None or score is None:
            unscored.append(aid)
            continue
        gap = band_rank(score) - _BAND_ORDER.index(want)
        rec = {"id": aid, "score": score, "expected_stratum": want,
               "got_stratum": _BAND_ORDER[band_rank(score)], "tiers_off": gap}
        (ok if abs(gap) <= slack else off).append(rec)
    return {"within_slack": len(ok), "off_by_more": off, "unscored": unscored,
            "slack_tiers": slack}


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
    unknown: list[str] = []

    for aid, score in scores.items():
        r = by_id.get(aid)
        if not r:
            # A typo used to take the same branch as a pair anchor, so a malformed
            # id was indistinguishable from a deliberately-skipped one and vanished
            # silently. Separated 2026-08-11.
            unknown.append(aid)
            continue
        if r["band"] in PAIR_BANDS:
            skipped.append(aid)   # scored by evaluate_pairs, not against a range
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
        "unknown_ids": unknown,
        "face_valid": not sign and not gated,
    }


def ceiling_score(p_null: float) -> float:
    """
    Best signed score reachable when `p_null` of the evidence mass is a well-run
    null and every remaining study is the strongest available benefit, as
    confidence saturates (c -> 1).

    This is an upper bound on a perfect world: unlimited evidence, no risk of
    bias, no funding penalty, every non-null study maximally positive. A real
    corpus scores below it, never above.

    H is NOT a free parameter. score_ecu derives it from the weighted variance of
    the same s_i values that produce d, so a corpus cannot have a high mean and a
    low spread -- disagreement is priced automatically. Any analysis that varies H
    independently of the null share overstates what is reachable (it did here,
    2026-08-10, before this function existed).
    """
    from pipeline.scoring import S_VALUE, H_PENALTY, H_NORM
    s_pos = max(S_VALUE.values())
    s_null = S_VALUE["null_effect"]
    d = (1 - p_null) * s_pos + p_null * s_null
    var = (1 - p_null) * (s_pos - d) ** 2 + p_null * (s_null - d) ** 2
    H = min(1.0, var / H_NORM)
    return 100 * d * (1 - H_PENALTY * H)


def max_null_share(target: float, steps: int = 2000) -> float | None:
    """
    Largest share of null-effect evidence mass at which `target` is still
    reachable. None means unreachable even with zero nulls.

    A grid rather than a solved inverse: `ceiling_score` is not guaranteed
    monotonic for an arbitrary S_VALUE table, and a grid stays obviously correct
    if those values are recalibrated.
    """
    if ceiling_score(0.0) < target:
        return None
    best = 0.0
    for i in range(steps + 1):
        p = i / steps
        if ceiling_score(p) >= target:
            best = p
    return best


def feasibility(rows: list[dict] | None = None) -> list[dict]:
    """
    For every absolute-range anchor, the null-effect share its FLOOR can tolerate.

    This is the question `evaluate()` cannot ask. `evaluate()` compares a produced
    score against a band and grades the miss; it cannot tell you that the band was
    never reachable under the current constants, so a range_miss reads as "the
    pipeline is uncalibrated" when it may mean "these two numbers contradict each
    other."

    Measured 2026-08-10 on the shipped constants (S_VALUE null_effect -0.7,
    H_PENALTY 0.4, H_NORM 1.5): the five confidence-A anchors expecting >= +70
    tolerate roughly 6-12% null-effect mass. Creatine on muscle strength -- the
    most-studied sports supplement there is -- must come back >= 91% strongest-
    benefit claims to clear anchor #1's floor of +80.

    That is a REAL TENSION and it is deliberately NOT resolved here. Three things
    could be wrong and only the founder may choose: the null penalty (invariant 4,
    SPEC 13), the H penalty, or the anchor bands themselves -- docs/ANCHORS.md
    says outright that "every band boundary here was set by judgment, not
    measurement, so a 'failure' may be a wrong anchor." Tuning any constant to
    make an anchor pass is forbidden; see this module's own docstring.
    """
    rows = rows if rows is not None else load()
    out = []
    for r in rows:
        if r["band"] in PAIR_BANDS:
            continue
        lo = r["expected_min"]
        if lo is None or lo <= 0:
            continue  # a negative or zero floor is not null-share limited
        out.append({
            "id": r["id"],
            "ingredient": r["ingredient"],
            "outcome": r["outcome"],
            "expected_min": lo,
            "confidence": r.get("confidence", ""),
            "max_null_share": max_null_share(float(lo)),
        })
    out.sort(key=lambda x: (x["max_null_share"] is not None,
                            x["max_null_share"] if x["max_null_share"] is not None else -1))
    return out


def main() -> int:
    rows = load()
    problems = validate(rows)
    rep = readiness(rows)

    pair_groups = len({(r.get("pair_id") or "").strip() for r in rows
                       if (r.get("pair_id") or "").strip()})
    print(f"anchor set: {rep['total']} rows "
          f"({rep['pair_anchors']} rows = {pair_groups} relational pairs, scored "
          f"against each other rather than a range)")
    print(f"            {rep['total'] - rep['pair_anchors']} absolute-range rows")
    print("  ALL 35 are now scoreable: the pairs go through evaluate_pairs(), which")
    print("  did not exist until 2026-08-11 -- before that they were silently skipped.")
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

    feas = feasibility(rows)
    print("\nband feasibility -- max share of NULL-EFFECT evidence mass at which")
    print("each anchor's FLOOR is still reachable, at perfect confidence:")
    print(f"  {'id':<4}{'ingredient':<16}{'floor':>6}  {'conf':<5}max null share")
    for f in feas[:10]:
        share = ("UNREACHABLE at any null share" if f["max_null_share"] is None
                 else f"{f['max_null_share'] * 100:.1f}%")
        print(f"  {f['id']:<4}{f['ingredient'][:15]:<16}{f['expected_min']:>+6}  "
              f"{f['confidence']:<5}{share}")
    if len(feas) > 10:
        print(f"  ... {len(feas) - 10} more with looser floors")
    print("\n  A floor is not 'hard to hit', it is arithmetic: H is derived from the")
    print("  same spread that produces d, so disagreement is already priced in.")
    print("  If a tolerance here looks implausible for real literature, then the")
    print("  band, the null penalty or the H penalty is wrong -- a FOUNDER call")
    print("  (SPEC 13 + invariant 4). Never tune a constant to make an anchor pass.")
    return 1 if problems else 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
