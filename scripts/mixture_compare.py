"""
Our extracted trial mixture vs the PUBLISHED mixture, per outcome.
NO MODEL MAY ENTER THIS FILE. Offline replay, zero model calls.

    python3 scripts/mixture_compare.py [extractions_dump.json]

WHY THIS EXISTS. Every anchor band in `docs/anchors.csv` is uncited judgement,
and `docs/SPEC.md` used to say we would re-derive them "against what the formula
can actually produce" -- which is circular: fit the target to the output and the
harness can never fail. The non-circular move is to take the mixture from a
PUBLISHED synthesis and run it through our own arithmetic.

But before a band can be derived that way, one question has to be answered:
IS OUR MIXTURE EVEN THE LITERATURE'S MIXTURE? Measured 2026-08-11, 60-83% of our
mapped claims per showcase outcome are negative, while the published creatine
meta-analyses report pooled effects favouring creatine on strength. Both cannot
be right. This script prints our side of that comparison so the two can be put
next to each other:

  - the mixture BY COUNT (how many claims) and BY WEIGHT (what actually moves d,
    since d = sum(w*s)/E and a full-text RCT outweighs an abstract ~24x)
  - what d would be if our mixture were replaced by a published one

The by-weight column is the one that matters and it is not the intuitive one:
a corpus can be 50% null by count and 80% null by weight if the nulls are the
better-run studies.
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

from pipeline.assemble import build_ecus                     # noqa: E402
from pipeline.scoring import S_VALUE, score_ecu, Study, K  # noqa: E402

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


def our_mixture(dump):
    """Per outcome: the mixture by count and by evidence weight, plus d."""
    rows = quiet(build_ecus, dump, PRODUCT, prompt_version="mixture",
                 searched_outcomes=SHOWCASE, ignore_population=False,
                 exclude_offtarget_population=True)
    out = {}
    for r in rows:
        oid = r["outcome_vocab_id"]
        contribs = ((r.get("evidence") or {}).get("contributions") or [])
        by_count = collections.Counter()
        by_weight = collections.Counter()
        total_w = 0.0
        for c in contribs:
            d = c.get("direction") or "unknown"
            w = float(c.get("w") or 0.0)
            by_count[d] += 1
            by_weight[d] += w
            total_w += w
        out[oid] = {
            "n": len(contribs),
            "d": (r.get("components") or {}).get("d"),
            "c": (r.get("components") or {}).get("c"),
            "score": r.get("score"),
            "composite": r.get("composite"),
            "by_count": dict(by_count),
            "by_weight": {k: round(v, 3) for k, v in by_weight.items()},
            "total_w": round(total_w, 3),
            "null_share_count": (by_count.get("null_effect", 0) / len(contribs)) if contribs else None,
            "null_share_weight": (by_weight.get("null_effect", 0.0) / total_w) if total_w else None,
        }
    return out


def d_from_mixture(n_pos: int, n_null: int, n_neg: int = 0,
                   magnitude: str = "meaningful") -> dict:
    """
    Run a PUBLISHED mixture through our own arithmetic.

    Every trial is given identical, good quality (full-text, independent,
    low-RoB, n=60, exact form/dose/population) so the ONLY thing driving the
    result is the direction mixture. That is deliberate: the band derived from
    this is "what our formula says about the literature's composition", not
    "what our formula says about our corpus's quality".
    """
    rob = {f"i{i}": 1 for i in range(1, 7)}
    studies = []
    for kind, count in (("benefit", n_pos), ("null_effect", n_null), ("harm", n_neg)):
        for i in range(count):
            studies.append(Study(
                id=f"{kind}{i}", design_rank=4, n=60, rob_items=rob,
                funding="independent", oa="full_text", form_match="exact",
                dose_match="in_band", pop_match="exact", direction=kind,
                magnitude=magnitude if kind == "benefit" else None))
    if not studies:
        return {}
    r = score_ecu(studies, [])
    return {"n": len(studies), "d": r.get("d"), "c": r.get("c"),
            "score": r.get("score"), "H": r.get("H")}


def main(dump_path: str) -> int:
    dump = json.load(open(dump_path))
    print(f"loaded {len(dump)} extractions from {Path(dump_path).name}")
    print(f"K={K}  S_VALUE={ {k: v for k, v in S_VALUE.items()} }\n")

    mix = our_mixture(dump)

    print("=== OUR extracted mixture, per showcase outcome ===")
    print(f"  {'outcome':<20}{'n':>4}{'d':>8}{'score':>7}"
          f"{'null% count':>13}{'null% WEIGHT':>14}{'benefit% wt':>13}")
    for o in SHOWCASE:
        m = mix.get(o)
        if not m:
            print(f"  {o:<20}{'gated -- no claims mapped':>50}")
            continue
        nc = m["null_share_count"]
        nw = m["null_share_weight"]
        bw = (m["by_weight"].get("benefit", 0.0) / m["total_w"]) if m["total_w"] else 0.0
        print(f"  {o:<20}{m['n']:>4}{(m['d'] or 0):>+8.3f}{m['score']:>7}"
              f"{(nc or 0):>12.0%}{(nw or 0):>14.0%}{bw:>13.0%}")

    print("\n  full direction breakdown by weight:")
    for o in SHOWCASE:
        m = mix.get(o)
        if m:
            print(f"    {o:<20} {m['by_weight']}  (total w {m['total_w']})")

    print("\n=== WHAT OUR FORMULA SAYS ABOUT A PUBLISHED MIXTURE ===")
    print("  Identical good-quality trials; only the direction mixture varies.")
    print("  This is the non-circular band derivation: the band is what the")
    print("  formula produces for the literature's REAL composition.\n")
    print(f"  {'mixture':<34}{'n':>4}{'d':>9}{'c':>7}{'signed':>8}")
    for label, (p, nl, ng) in {
        "20 pos,  0 null   (unanimous)": (20, 0, 0),
        "18 pos,  2 null   (90% pos)": (18, 2, 0),
        "15 pos,  5 null   (75% pos)": (15, 5, 0),
        "12 pos,  8 null   (60% pos)": (12, 8, 0),
        "10 pos, 10 null   (50/50)": (10, 10, 0),
        " 7 pos, 13 null   (35% pos)": (7, 13, 0),
        " 4 pos, 16 null   (20% pos)": (4, 16, 0),
        " 0 pos, 20 null   (unanimous null)": (0, 20, 0),
    }.items():
        r = d_from_mixture(p, nl, ng)
        print(f"  {label:<34}{r['n']:>4}{r['d']:>+9.3f}{r['c']:>7.3f}{r['score']:>+8}")

    print("\n  same, if every benefit is only `trivial`/`unstated` (+0.3):")
    print(f"  {'mixture':<34}{'n':>4}{'d':>9}{'c':>7}{'signed':>8}")
    for label, (p, nl, ng) in {
        "20 pos,  0 null   (unanimous)": (20, 0, 0),
        "15 pos,  5 null   (75% pos)": (15, 5, 0),
        "12 pos,  8 null   (60% pos)": (12, 8, 0),
    }.items():
        r = d_from_mixture(p, nl, ng, magnitude="trivial")
        print(f"  {label:<34}{r['n']:>4}{r['d']:>+9.3f}{r['c']:>7.3f}{r['score']:>+8}")

    print("\nNothing was changed. This script only measures.")
    return 0


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else str(
        Path.home() / ".claude/jobs/d96af802/tmp/extractions_v114.json")
    sys.exit(main(d))
