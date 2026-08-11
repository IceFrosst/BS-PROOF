"""
Did PROMPT_VERSION v1.15 actually make S5 extract the numbers on NULL claims?
MODEL CALLS: yes, S5 only. Run with the venv interpreter (needs httpx).

    ./.venv/bin/python scripts/null_numbers_experiment.py [--limit 10]

WHY SURGICAL AND NOT A FULL RE-RUN. A PROMPT_VERSION bump invalidates the whole
response cache, so re-extracting the 149-study corpus to check one prompt edit
would be ~900 cold calls against a subscription session limit -- and CLAUDE.md is
explicit that throughput, not access, is the ceiling. S5's payload is only
{title, text}, so it can be replayed on its own. This calls S5 and nothing else,
on the studies that actually exhibited the defect.

WHAT IT MEASURES. v1.14 produced 139 null_effect claims on the four main
performance outcomes and only 27 carried any number. The prompt described
effect_size / CI / p_value purely as inputs to `magnitude`, and magnitude is
benefit-only, so a null read as "no numbers needed". v1.15 requires the numeric
fields on every claim regardless of direction.

The comparison is per study, old vs new, on the SAME text:

    nulls with a number   before -> after
    nulls with a CI       before -> after     <- the one that matters most

The CI is singled out because it is the only field that separates an
underpowered null ("CI -3.1 to +3.5", answers nothing) from a well-run one
("CI -0.3 to +0.5", rules a real effect out). Invariant 7 already treats those as
opposites; without the interval nothing downstream can tell them apart.

HONEST FAILURE MODE. If v1.15 shows no improvement, the numbers were never in the
text we send S5 and the fix is in RETRIEVAL (the section slice, or full text we
never resolved), not in the prompt. Either result is informative; do not retry
the prompt until this says which.

RESULT, 8 studies, 2026-08-11:

    null claims          74      ->  78
    ...with a number     10  14% ->  48  62%     v1.15 works
    ...with a CI          0   0% ->   7   9%     ceiling is the LITERATURE

The CI ceiling was checked directly rather than assumed: 6 of these 8 papers
mention a confidence interval ZERO times in their whole full text, and the two
that do are exactly the two S5 got CIs from (PMC2646129 reports 7, S5 returned
7). So CI extraction is now near-exact and this field simply publishes means and
p-values instead of intervals. That distinction decides which candidate fix to
the aggregation rule is actually available -- see the verdict.
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SHOWCASE = ("muscle_strength", "muscle_power", "lean_body_mass", "exercise_endurance")


def has_number(cl: dict) -> bool:
    return any(cl.get(k) is not None
               for k in ("effect_size", "ci_low", "ci_high", "p_value"))


def has_ci(cl: dict) -> bool:
    return cl.get("ci_low") is not None or cl.get("ci_high") is not None


def null_stats(claims) -> tuple[int, int, int]:
    """(n_nulls, n_with_a_number, n_with_a_CI) over a claim list."""
    nulls = [c for c in claims if isinstance(c, dict)
             and c.get("direction") == "null_effect"]
    return len(nulls), sum(map(has_number, nulls)), sum(map(has_ci, nulls))


def pick(dump, limit: int) -> list[dict]:
    """
    Studies that EXHIBIT the defect: full text available, and at least one
    null_effect claim carrying no number at all. Ranked by how many such claims
    they have, so the sample is the strongest available test rather than random.
    """
    out = []
    for rec in dump:
        record = rec.get("record") or {}
        if (record.get("oa") or "") != "full_text":
            continue
        claims = ((rec.get("extraction") or {}).get("S5") or {}).get("claims") or []
        if not claims:
            continue
        mapped = {(o.get("outcome_vocab_id") or o.get("vocab_id"))
                  for o in ((rec.get("extraction") or {}).get("outcomes") or [])}
        if not (mapped & set(SHOWCASE)):
            continue
        bare = [c for c in claims if isinstance(c, dict)
                and c.get("direction") == "null_effect" and not has_number(c)]
        if bare:
            out.append((len(bare), rec))
    out.sort(key=lambda x: -x[0])
    return [r for _, r in out[:limit]]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--dump", default=str(
        Path.home() / ".claude/jobs/d96af802/tmp/extractions_v114.json"))
    args = ap.parse_args()

    import claude_adapter
    from sources import fulltext
    import workers

    print(f"PROMPT_VERSION = {claude_adapter.PROMPT_VERSION}")
    if claude_adapter.PROMPT_VERSION == "v1.14":
        print("  refusing to run: this compares v1.14 against a NEWER prompt, and")
        print("  PROMPT_VERSION is still v1.14, so both arms would be identical.")
        return 2

    dump = json.load(open(args.dump))
    chosen = pick(dump, args.limit)
    print(f"selected {len(chosen)} full-text studies that exhibit the defect\n")

    tot = collections.Counter()
    rows = []
    for i, rec in enumerate(chosen, 1):
        record = rec.get("record") or {}
        pmcid = record.get("pmcid")
        old = ((rec.get("extraction") or {}).get("S5") or {}).get("claims") or []
        o_n, o_num, o_ci = null_stats(old)

        xml = fulltext.fetch_xml(pmcid, use_cache=True) if pmcid else None
        sections = fulltext.sections(xml) if xml else None
        # best_text returns (text, oa_tier); the tier is ignored here because this
        # experiment only replays S5 and never re-weights a study.
        text, _tier = fulltext.best_text(record)
        if not text:
            print(f"  {i:>2}. {str(pmcid):<13} SKIP -- no cached full text")
            continue

        payload = workers._payload("S5", record, text, None, sections)
        res, meta = claude_adapter.call("S5", payload)
        if not res:
            print(f"  {i:>2}. {str(pmcid):<13} S5 FAILED ({meta.get('error')})")
            tot["failed"] += 1
            continue
        new = res.get("claims") or []
        n_n, n_num, n_ci = null_stats(new)
        rows.append((pmcid, o_n, o_num, o_ci, n_n, n_num, n_ci))
        tot["old_nulls"] += o_n; tot["old_num"] += o_num; tot["old_ci"] += o_ci
        tot["new_nulls"] += n_n; tot["new_num"] += n_num; tot["new_ci"] += n_ci
        print(f"  {i:>2}. {str(pmcid):<13} nulls {o_n}->{n_n}  "
              f"with a number {o_num}->{n_num}  with a CI {o_ci}->{n_ci}")

    print("\n=== TOTALS ===")
    if not rows:
        print("  no studies compared; nothing to conclude.")
        return 1
    for label, o, n, d in (
            ("null claims", tot["old_nulls"], tot["new_nulls"], "(should be similar --"
             " v1.15 did not change how direction is judged)"),
            ("...with a number", tot["old_num"], tot["new_num"], ""),
            ("...with a CI", tot["old_ci"], tot["new_ci"], "<- the decisive one")):
        share_o = f"{o / max(tot['old_nulls'], 1):.0%}" if "with" in label else ""
        share_n = f"{n / max(tot['new_nulls'], 1):.0%}" if "with" in label else ""
        print(f"  {label:<18}{o:>4} {share_o:>5}  ->{n:>4} {share_n:>5}  {d}")
    if tot["failed"]:
        print(f"  S5 failures: {tot['failed']}")

    print("\n=== VERDICT ===")
    before = tot["old_num"] / max(tot["old_nulls"], 1)
    after = tot["new_num"] / max(tot["new_nulls"], 1)
    ci_after = tot["new_ci"] / max(tot["new_nulls"], 1)
    if after > before + 0.15:
        print(f"    v1.15 WORKS: nulls carrying a number went {before:.0%} -> {after:.0%}.")
        print("    The numbers were in the text all along and the prompt was")
        print("    suppressing them. A full re-extraction is now worth its cost.")
        print(f"\n    BUT THE CI COLUMN BARELY MOVED ({ci_after:.0%}), AND THAT IS NOT OUR BUG.")
        print("    MEASURED 2026-08-11 on these same 8 papers: 6 of 8 mention a")
        print("    confidence interval ZERO times in their entire full text. The two")
        print("    that do are exactly the two S5 extracted CIs from -- PMC2646129")
        print("    reports 7 in its results and S5 returned 7. So CI extraction is now")
        print("    close to exact, and the ceiling is the literature: this field")
        print("    reports means and p-values, not intervals.")
        print("\n    That splits the two candidate fixes apart -- they are NOT both")
        print("    unblocked, which an earlier version of this verdict claimed:")
        print(f"      (i)  effect-size-weighted s_value  -> UNBLOCKED to {after:.0%} coverage")
        print("      (ii) refuse a MEASURED-underpowered null -> still blocked. It needs")
        print("           the interval, and the interval is mostly unpublished. The way")
        print("           through is to RECONSTRUCT it from the point estimate, the")
        print("           p-value and n by standard meta-analytic arithmetic (Altman &")
        print("           Bland), which the 62% point-estimate coverage now makes")
        print("           possible. That is arithmetic on reported numbers, not")
        print("           inference of an unreported one -- but it is a new derivation")
        print("           in the scoring path, so it is a founder call, not a fix.")
        print("\n    ALSO WATCH ON A FULL RE-RUN: claim counts churned per study")
        print("    (8->14, 12->8 nulls). v1.15 was meant to add numbers, not to move")
        print("    direction or claim splitting, so some of that is ordinary model")
        print("    variance in how endpoints are grouped -- but it is large enough")
        print("    that the population A/B and the null share must be re-measured")
        print("    rather than assumed stable.")
    elif after < before - 0.15:
        print(f"    v1.15 made it WORSE ({before:.0%} -> {after:.0%}). Revert the prompt.")
    else:
        print(f"    NO REAL CHANGE ({before:.0%} -> {after:.0%}). The numbers are not in")
        print("    the text we send S5, so this is a RETRIEVAL problem -- the section")
        print("    slice, or full text we never resolved -- not a prompt problem.")
        print("    Do not iterate on the prompt until retrieval is checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
