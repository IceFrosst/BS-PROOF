"""
Diff two run artifacts. NO MODEL MAY ENTER THIS FILE.

    python3 scripts/compare_runs.py                 # latest two runs
    python3 scripts/compare_runs.py <stampA> <stampB>

Written 2026-08-10 after doing this by hand three times in one session and
getting a conclusion wrong each time it was done from memory rather than from the
artifacts.

It reports the FUNNEL, not just the scores, because every wrong conclusion in this
session came from reading a score without the funnel behind it:

  * "the run lost 145 calls to the session limit, so truncation biased the score
    negative" -- backwards. The failures were HIDING studies that read as nulls,
    so truncation biased it POSITIVE.
  * "the two telemetry tables disagree" -- they don't. One counts CLI attempts
    including retries, the other counts studies. Different denominators.
  * "anchor #1 is a sign error" -- no. Its band was never reachable under the
    shipped constants.

A score is only interpretable next to n, c and d. `c` is usually the whole story:
`c = 1 - exp(-E/K)`, so a low `c` means low evidence MASS, not a wrong direction,
and the fix is retrieval rather than scoring.
"""
from __future__ import annotations

import glob
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "reports" / "runs"
K = 3.0  # pipeline.scoring.K, read below rather than trusted


def _load(stamp: str) -> dict:
    hits = sorted(glob.glob(str(RUNS / f"{stamp}*_context.json")))
    if not hits:
        raise SystemExit(f"no context artifact for {stamp}")
    return json.load(open(hits[0]))


def _latest_two() -> tuple[str, str]:
    ctx = sorted(glob.glob(str(RUNS / "*_context.json")))
    if len(ctx) < 2:
        raise SystemExit("need at least two runs to compare")
    return Path(ctx[-2]).name[:15], Path(ctx[-1]).name[:15]


def _outcome(row: dict) -> str:
    # outcome_vocab_id is the field; ecu_key parsing is the fallback for older
    # artifacts. Field index 3 of the pipe-joined key is the same value.
    o = row.get("outcome_vocab_id")
    if o:
        return o
    k = row.get("ecu_key", "")
    return k.split("|")[3] if "|" in k else k


def _n(row: dict):
    """n_primaries lives under `evidence`, not at row level."""
    return (row.get("evidence") or {}).get("n_primaries")


def _rows(d: dict) -> dict:
    return {_outcome(r): r for r in (d.get("ecu_rows") or [])}


def _fmt(v, w=7, nd=3):
    if v is None:
        return f"{'—':>{w}}"
    if isinstance(v, float):
        return f"{v:>{w}.{nd}f}"
    return f"{v:>{w}}"


def funnel(d: dict) -> dict:
    sl = d.get("studies_list") or []
    el = d.get("eligibility") or {}
    landed = sum((_n(r) or 0) for r in (d.get("ecu_rows") or []))
    skipped = {}
    for s in sl:
        if s.get("skipped"):
            skipped[s.get("skip_reason") or "?"] = skipped.get(s.get("skip_reason") or "?", 0) + 1
    return {
        "retrieved": len(sl) or d.get("studies_targeted"),
        "skipped": skipped,
        "extracted_ok": d.get("studies_ok"),
        "partial": d.get("studies_failed_partial"),
        "eligible": el.get("eligible"),
        "refused": el.get("ineligible_by_reason") or {},
        "landed_in_ecus": landed,
    }


def main(argv: list[str]) -> int:
    try:
        from pipeline.scoring import K as _K
        k = _K
    except Exception:
        k = K

    a_s, b_s = (argv[0], argv[1]) if len(argv) >= 2 else _latest_two()
    a, b = _load(a_s), _load(b_s)
    ra, rb = _rows(a), _rows(b)

    print(f"A  {a_s}   mode={a.get('mode')}  prompt={a.get('prompt_version')}  "
          f"scoring={a.get('scoring_model')}")
    print(f"B  {b_s}   mode={b.get('mode')}  prompt={b.get('prompt_version')}  "
          f"scoring={b.get('scoring_model')}")
    if a.get("scoring_model") != b.get("scoring_model"):
        print("\n  !! DIFFERENT scoring_model -- these numbers are not comparable.")
        print("     A formula change read as an evidence change is the thing")
        print("     reports/archive exists to prevent.")

    print("\n=== FUNNEL ===")
    fa, fb = funnel(a), funnel(b)
    for key in ("retrieved", "extracted_ok", "partial", "eligible", "landed_in_ecus"):
        print(f"  {key:<18}{_fmt(fa[key], 8)}{_fmt(fb[key], 8)}")
    print(f"  {'skipped':<18}{str(fa['skipped'])[:28]:>28}   {str(fb['skipped'])[:28]}")
    print(f"  {'refused (inv 6/7)':<18}{str(fa['refused'])[:28]:>28}   {str(fb['refused'])[:28]}")

    print("\n=== PER OUTCOME ===")
    print(f"  {'outcome':<20}{'signed A':>9}{'signed B':>9}{'Δ':>6}"
          f"{'n A':>5}{'n B':>5}{'d A':>8}{'d B':>8}{'c A':>7}{'c B':>7}")
    for o in sorted(set(ra) | set(rb)):
        x, y = ra.get(o, {}), rb.get(o, {})
        cx, cy = x.get("components") or {}, y.get("components") or {}
        sa, sb = x.get("score"), y.get("score")
        delta = (sb - sa) if (sa is not None and sb is not None) else None
        print(f"  {o[:19]:<20}{_fmt(sa,9)}{_fmt(sb,9)}{_fmt(delta,6)}"
              f"{_fmt(_n(x),5)}{_fmt(_n(y),5)}"
              f"{_fmt(cx.get('d'),8)}{_fmt(cy.get('d'),8)}"
              f"{_fmt(cx.get('c'),7)}{_fmt(cy.get('c'),7)}")

    print("\n=== WHAT c IMPLIES (the lever) ===")
    print(f"  c = 1 - exp(-E/K), K={k}. mean w = E/n. Studies for c=0.9 at that quality:")
    for label, rows in (("A", ra), ("B", rb)):
        for o, r in sorted(rows.items()):
            comp = r.get("components") or {}
            c, n = comp.get("c"), _n(r)
            if not c or not n or c >= 1:
                continue
            E = -k * math.log(1 - c)
            mw = E / n
            need = int(-k * math.log(0.1) / mw) if mw > 0 else None
            print(f"    {label} {o[:20]:<21} c={c:<6} n={n:<4} E={E:6.3f} "
                  f"mean w={mw:6.3f}  need ~{need} studies for c=0.9")

    print("\n=== RUN HEALTH ===")
    for label, d in (("A", a), ("B", b)):
        u = d.get("usage") or {}
        print(f"  {label}  calls={u.get('calls')} failures={u.get('failures')} "
              f"cache_hits={u.get('cache_hits')} wall={d.get('wall_time_s')}")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    sys.exit(main(sys.argv[1:]))
