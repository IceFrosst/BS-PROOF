"""
Is the score's null share an EXTRACTION defect, or an AGGREGATION defect?
NO MODEL MAY ENTER THIS FILE. Offline replay, zero model calls.

    python3 scripts/vote_counting_investigation.py [extractions_dump.json]

THE QUESTION THIS SETTLES. `scripts/magnitude_investigation.py` asked whether the
score's compression was our bug or the literature's, and framed two answers:

  (a) our extraction fails to size benefits the papers DID quantify  -> fix S5
  (b) the literature genuinely does not report sizes                 -> the bands
                                                                        or the
                                                                        display
                                                                        scale move

Measured 2026-08-11, the answer is NEITHER. Our extraction is faithful and the
literature reports plenty. The defect is in how we AGGREGATE, and it has a name.

WHAT WE DO. `assemble` maps each trial to a direction LABEL (benefit / null_effect
/ harm), `Study.s_value` maps that label to a number (+1.0 / +0.3 / -0.35 / -1.0),
and `score_ecu` takes a weighted mean of those numbers. The effect SIZE the paper
reported is extracted, stored -- and then discarded before it reaches the score.
Counting how many trials individually cleared p < 0.05 is VOTE COUNTING, and it is
the specific failure that meta-analysis was invented to fix: its power falls toward
zero as the constituent trials get smaller, so it systematically returns "no
effect" for literatures made of small trials with a real, moderate effect. Which
is precisely what supplement literature is made of.

THE TWO MEASUREMENTS BELOW, and they are independent of each other.

1. OUR OWN NULLS POINT THE WRONG WAY FOR A "NO EFFECT" READING. Of the
   null_effect claims on the four showcase outcomes that carry a usable number,
   24 of 27 (89%) have a point estimate FAVOURING creatine. They failed to reach
   significance individually; they did not find nothing. Our model maps every one
   to s = -0.35, i.e. evidence AGAINST the product.

   Restricted to those four outcomes on purpose, because all four are
   "higher is better". A raw sign count over every outcome is confounded by
   polarity -- an adverse-event rate or a homocysteine level moving UP is the
   supplement doing worse, and 2 of the 10 largest positive estimates in the
   unrestricted set are exactly that.

2. THE PUBLISHED POOLED VERDICT ON THE SAME LITERATURE IS POSITIVE. 14 stored
   creatine syntheses were read (see reports/ for the run); 8 pooled estimates on
   muscle strength favour creatine with a CI excluding zero, SMD 0.28 to 0.46,
   and every one survived an adversarial verification pass instructed to refute
   it (0 of 24 refuted). Our pipeline scores the same outcome at -15.

WHAT THIS DOES NOT SHOW, stated because the temptation is to overclaim:

- It does NOT show creatine's true effect size. That is not ours to compute.
- It does NOT show our null LABELS are wrong. They are right: those trials really
  did report no significant between-arm difference.
- The n is small. Only 27 of 139 null claims on the showcase outcomes carry a
  usable number at all -- the other 112 report no figure we extracted. The 89%
  is measured on 19% of the relevant nulls, and a lopsided ratio on a small
  sample is a strong hint, not a pooled estimate.
- Effect units are heterogeneous (%, kg, W, m, SMD), so only the SIGN is
  comparable across claims here. Magnitudes are NOT pooled and must not be.

WHY THIS BLOCKS BAND DERIVATION RATHER THAN INFORMING IT. The plan for deriving
anchor bands externally was: take the trial mixture a published synthesis reports,
run it through our arithmetic, and let the band be the output. Measured on the same
14 syntheses, **0 of 14 publish per-trial dichotomous results in usable form.**
Three appear to, and do not: the one checked in detail (doi 10.3390/nu13061912)
carries a narrative arrow column that mixes endpoints in free text, cannot be
attributed to its own pooled analyses, and disagrees with the study counts the
review states for those analyses. An adversarial re-read REFUTED two of the three
per-trial counts a first pass extracted from it.

That is not a gap in our reading. It is the finding restated: syntheses publish
pooled effect sizes with confidence intervals, because that is what evidence
synthesis is. They do not publish the vote tally, because vote tallies are not
evidence. Our scoring model consumes a quantity the literature does not produce.

NOTHING HERE CHANGES A CONSTANT OR A FORMULA. `S_VALUE`, and any move from
vote-counting to precision-weighted pooling, are founder decisions under
invariant 4 and SPEC section 13.
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Four showcase outcomes, all "higher is better", so the SIGN of a point estimate
# has one unambiguous reading. Do not add an outcome here without checking
# vocab/outcome.json polarity -- that is the confound this list exists to avoid.
POSITIVE_POLARITY = ("muscle_strength", "muscle_power",
                     "lean_body_mass", "exercise_endurance")

# The published pooled estimates, verbatim-verified 2026-08-11 by an adversarial
# pass instructed to refute them (0 of 24 refuted). Recorded here so the
# comparison is auditable without re-running any model. `pooled` is the review's
# own primary between-arm estimate; `ci` excludes zero for every FAVOURS row.
PUBLISHED = [
    # (doi, outcome, pooled, unit, ci_low, ci_high, n_trials, verdict)
    ("10.7717/peerj.20380", "muscle_strength", 0.43, "SMD", 0.25, 0.61, 14, "favours"),
    ("10.3390/nu18060909", "muscle_strength", 0.46, "SMD", 0.29, 0.63, 11, "favours"),
    ("10.3390/nu13061912", "muscle_strength", 0.28, "SMD", 0.09, 0.47, 17, "favours"),
    ("10.3390/nu13061912", "muscle_strength", 0.20, "SMD", 0.00, 0.39, 15, "borderline"),
    ("10.3390/nu13113757", "muscle_strength", 0.35, "SMD", 0.02, 0.69, 7, "favours"),
    ("10.3390/nu16213665", "muscle_strength", 4.43, "WMD kg", 3.12, 5.75, 21, "favours"),
    ("10.3389/fnut.2026.1800546", "muscle_strength", 11.9, "MD kg", 7.6, 16.2, 16, "favours"),
    ("10.1080/15502783.2026.2668435", "muscle_strength", 7.5, "MD kg", 2.2, 12.8, 3, "favours"),
    ("10.3390/nu13061912", "lean_body_mass", 1.32, "MD kg", 0.93, 1.72, 16, "favours"),
    ("10.1080/15502783.2025.2586523", "lean_body_mass", 1.39, "WMD kg", 1.07, 1.70, 44, "favours"),
    ("10.1080/15502783.2024.2380058", "lean_body_mass", 0.82, "WMD kg", 0.57, 1.06, None, "favours"),
    ("10.3389/fnut.2026.1800546", "lean_body_mass", 2.32, "MD kg", 0.76, 3.89, 15, "favours"),
    ("10.3390/nu15092116", "lean_body_mass", 0.11, "SMD", -0.02, 0.25, 10, "null"),
    ("10.3390/nu13113757", "lean_body_mass", 0.24, "SMD", -0.10, 0.59, 6, "null"),
    ("10.3390/nu17020238", "muscle_power", 2.70, "MD cm", 0.18, 5.21, 11, "favours"),
    ("10.3390/nu17020238", "muscle_power", 71.27, "MD W", 38.09, 104.45, 12, "favours"),
    ("10.3390/nu17020238", "exercise_endurance", 0.05, "SMD", -0.26, 0.36, 3, "null"),
]


def point_estimate(cl: dict) -> float | None:
    """
    The claim's own effect estimate: the reported value, else the CI midpoint.

    The CI midpoint is a fallback, not an equivalent: it assumes a symmetric
    interval, which is false for a ratio measure. Only the SIGN is used here and
    the sign of a midpoint is robust to that, so the shortcut is safe for this
    measurement and would NOT be safe for pooling.
    """
    e = cl.get("effect_size")
    if e is not None:
        try:
            return float(e)
        except (TypeError, ValueError):
            return None
    lo, hi = cl.get("ci_low"), cl.get("ci_high")
    if lo is not None and hi is not None:
        try:
            return (float(lo) + float(hi)) / 2
        except (TypeError, ValueError):
            return None
    return None


def mapped_claims(dump):
    """(outcome_vocab_id, claim) for every claim S6/S6B actually mapped."""
    for rec in dump:
        for o in ((rec.get("extraction") or {}).get("outcomes") or []):
            oid = o.get("outcome_vocab_id") or o.get("vocab_id")
            cl = o.get("claim") or {}
            if oid and isinstance(cl, dict):
                yield oid, cl


def measure_null_signs(dump) -> dict:
    """Measurement 1: which way do OUR OWN null claims' point estimates point?"""
    out = {"positive": 0, "negative": 0, "zero": 0, "no_number": 0, "examples": []}
    for oid, cl in mapped_claims(dump):
        if oid not in POSITIVE_POLARITY or cl.get("direction") != "null_effect":
            continue
        v = point_estimate(cl)
        if v is None:
            out["no_number"] += 1
            continue
        out["positive" if v > 0 else ("negative" if v < 0 else "zero")] += 1
        if v > 0:
            out["examples"].append((oid, v, (cl.get("outcome_raw") or "")[:46]))
    out["examples"].sort(key=lambda x: -x[1])
    return out


def main(dump_path: str) -> int:
    dump = json.load(open(dump_path))
    print(f"loaded {len(dump)} extractions from {Path(dump_path).name}\n")

    # ------------------------------------------------------------------ 1
    m = measure_null_signs(dump)
    usable = m["positive"] + m["negative"] + m["zero"]
    print("=== 1. OUR OWN nulls: which way does the point estimate point? ===")
    print(f"    (the four 'higher is better' showcase outcomes only, so the sign")
    print(f"     has one reading -- polarity would otherwise confound this)\n")
    for k in ("positive", "negative", "zero"):
        share = f"  ({m[k] / usable:.0%})" if usable else ""
        print(f"    point estimate {k:<9}: {m[k]:>4}{share}")
    print(f"    carry NO number         : {m['no_number']:>4}   <- {m['no_number']}/"
          f"{m['no_number'] + usable} of nulls, so the above is measured on "
          f"{usable / max(m['no_number'] + usable, 1):.0%} of them")
    if usable:
        print(f"\n    {m['positive']} of {usable} ({m['positive'] / usable:.0%}) of our "
              f"`null_effect` claims measured the")
        print(f"    supplement doing BETTER than control. Each is scored -0.35,")
        print(f"    i.e. evidence AGAINST the product.")
    print("\n    largest such estimates:")
    for oid, v, raw in m["examples"][:8]:
        print(f"      {oid:<20}{v:>8}  {raw}")

    # ------------------------------------------------------------------ 2
    print("\n=== 2. What the PUBLISHED syntheses concluded on the same literature ===")
    print("    (verbatim-verified; an adversarial pass refuted 0 of 24)\n")
    by_outcome = collections.defaultdict(lambda: collections.Counter())
    for _, outcome, _, _, _, _, _, verdict in PUBLISHED:
        by_outcome[outcome][verdict] += 1
    print(f"    {'outcome':<20}{'favours':>8}{'borderline':>12}{'null':>6}{'harm':>6}")
    for outcome, c in by_outcome.items():
        print(f"    {outcome:<20}{c['favours']:>8}{c['borderline']:>12}"
              f"{c['null']:>6}{c['harm']:>6}")
    print(f"\n    {'doi':<32}{'outcome':<19}{'pooled':>9} {'95% CI':<18}{'trials':>7}")
    for doi, outcome, pooled, unit, lo, hi, n, verdict in PUBLISHED:
        if verdict != "favours":
            continue
        ci = f"[{lo}, {hi}]"
        print(f"    {doi:<32}{outcome:<19}{pooled:>9} {ci:<18}{n if n else '-':>7}")

    # ------------------------------------------------------------------ 3
    print("\n=== 3. Why the external band derivation is BLOCKED, not merely unfinished ===")
    print("    Of the 14 syntheses read, 0 publish per-trial dichotomous results in")
    print("    usable form. Three appear to and do not: the one checked in detail")
    print("    (10.3390/nu13061912) has a narrative arrow column that mixes endpoints")
    print("    in free text and disagrees with the study counts the review states for")
    print("    its own pooled analyses. An adversarial re-read REFUTED 2 of 3 per-trial")
    print("    counts a first pass had extracted from it.")
    print("\n    That is the finding restated, not a gap in our reading: syntheses")
    print("    publish pooled effect sizes because that is what synthesis IS. Our")
    print("    scoring model consumes a vote tally the literature does not produce.")

    print("\n=== VERDICT ===")
    print("    The null share is REAL and our extraction is FAITHFUL. The labels are")
    print("    correct: those trials did report no significant between-arm difference.")
    print("    What is wrong is treating 'this trial alone did not reach significance'")
    print("    as 'this trial is evidence the supplement does not work'. That is vote")
    print("    counting, and its power falls toward zero as trials get smaller --")
    print("    exactly the regime supplement literature lives in.")
    print("\n    FOUNDER DECISION REQUIRED (invariant 4 / SPEC 13). Three candidates,")
    print("    and they are not equivalent:")
    print("      i.   s_value uses the reported effect SIZE and its precision, not the")
    print("           direction label. Statistically correct; largest change; needs the")
    print("           effect_size coverage that is currently 27/139 on showcase nulls.")
    print("      ii.  an underpowered null is out of scope, measured rather than")
    print("           self-declared. Invariant 7 ALREADY says this and only fires when")
    print("           the authors volunteer it; a CI that includes a meaningful effect")
    print("           is the same fact, measured. Smallest change, and symmetric.")
    print("      iii. S_VALUE['null_effect'] -> 0. Cheapest, and WRONG in the other")
    print("           direction: a genuinely well-powered null IS evidence against, and")
    print("           a tool that cannot say no is not measuring anything.")
    print("\n    Nothing was changed. This script only measures.")
    return 0


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else str(
        Path.home() / ".claude/jobs/d96af802/tmp/extractions_v114.json")
    sys.exit(main(d))
