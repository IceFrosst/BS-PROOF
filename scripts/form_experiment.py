"""
Form-arc A/B/C: which ladder aggregation width? NO MODEL MAY ENTER THIS FILE.

    python3 scripts/form_experiment.py [extractions_dump.json]

Two arms, because one of them cannot answer the question on its own:

  REAL      the 149-study creatine dump. Every exact-form primary is design_rank
            4, so top-1 / top-3 / top-5 / top-10 are ARITHMETICALLY IDENTICAL
            here. This arm measures the thing that does change -- the headline
            move from the v4 `effect x 0.15` form term to the ladder.

  SYNTHETIC rank-varied fixtures, including the founder's flagship case (an
            umbrella review conducted in your form). This arm is the only one
            that can discriminate the aggregation widths, so it is not a
            nice-to-have: without it "top-5 wins" would be an unmeasured claim.

Decision criteria, in order:
  1. invariant 8 preserved -- "nobody tested your form" and "your form failed"
     must stay distinguishable in the ARC even though both score 0 strength
  2. robustness -- one weak paper in your form must not read like strong
     form evidence, and one strong paper must not be diluted to nothing
  3. differentiation -- monohydrate (61 confirmed trials) must separate from a
     thin form like creatine_nitrate (2 trials)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import arcs as arcsmod                      # noqa: E402
from pipeline.arcs import FORM_LADDER, form_ladder_score  # noqa: E402
from pipeline.assemble import build_ecus                  # noqa: E402
from pipeline.scoring import Study                        # noqa: E402

WIDTHS = (1, 3, 5, 10)
SHOWCASE = ["energy_levels", "muscle_strength", "lean_body_mass",
            "exercise_endurance", "muscle_power"]
PRODUCT = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult", "age_band": "adult", "sex": "mixed",
                          "deficiency_status": "unknown", "pregnancy": "not_pregnant",
                          "health_status": "healthy"},
           "dose_low_mg": 4400, "dose_high_mg": 4400}

ROB_CLEAN = {f"i{i}": 1 for i in range(1, 7)}


def _study(rank: int, direction: str = "benefit", form: str = "exact") -> Study:
    return Study(id=f"s{rank}{direction}{form}", design_rank=rank, n=60,
                 rob_items=ROB_CLEAN, funding="independent", oa="full_text",
                 form_match=form, dose_match="in_band", pop_match="exact",
                 direction=direction,
                 magnitude="meaningful" if direction == "benefit" else None)


# --------------------------------------------------------------- synthetic arm

def synthetic() -> None:
    print("\n" + "=" * 78)
    print("SYNTHETIC ARM -- the only arm that can discriminate aggregation width")
    print("=" * 78)
    cases = [
        ("umbrella in your form (founder's flagship)", [1]),
        ("umbrella + 4 RCTs", [1, 4, 4, 4, 4]),
        ("one RCT only", [4]),
        ("one ANIMAL study only", [12]),
        ("one animal + one cell", [12, 13]),
        ("meta-analysis + 9 RCTs", [2, 4, 4, 4, 4, 4, 4, 4, 4, 4]),
        ("1 RCT + 9 animal studies", [4] + [12] * 9),
        ("10 RCTs", [4] * 10),
    ]
    print(f"  {'evidence in your form':<42}" + "".join(f"{'top-'+str(w):>9}" for w in WIDTHS))
    for label, ranks in cases:
        row = "".join(f"{form_ladder_score(ranks, w):>9.3f}" for w in WIDTHS)
        print(f"  {label:<42}{row}")
    print("\n  Read the two rows that matter:")
    a = form_ladder_score([4] + [12] * 9, 1)
    b = form_ladder_score([4] + [12] * 9, 10)
    print(f"    '1 RCT + 9 animal': top-1={a:.3f} vs top-10={b:.3f}")
    print("      top-1 ignores that the RCT stands nearly alone;")
    print("      top-10 dilutes a real RCT down to animal-tier. Neither is honest.")
    c1 = form_ladder_score([12], 1)
    print(f"    'one animal study only': top-1={c1:.3f} -- correctly LOW at every")
    print("      width, so the ladder cannot be gamed by a single weak paper.")


# ------------------------------------------------------------------- real arm

def real(dump_path: str) -> None:
    dump = json.load(open(dump_path))
    print("\n" + "=" * 78)
    print(f"REAL ARM -- {len(dump)} creatine studies, pop B, K={__import__('pipeline.scoring', fromlist=['K']).K}")
    print("=" * 78)

    def run(width: int | None, legacy: bool = False):
        if legacy:
            orig = arcsmod.form_strength
            # v4 behaviour: form term = _unit(d) over exact subset, else eff*0.15.
            # Reconstructed here rather than kept in arcs.py, so the shipped file
            # carries one rule and this script carries the comparison.
            def legacy_strength(exact, form_d, form_syntheses=None, top_n=None):
                if form_d is None:
                    return None, "legacy_untested"
                return (form_d + 1.0) / 2.0, "legacy_verdict"
            arcsmod.form_strength = legacy_strength
        try:
            rows = build_ecus(dump, PRODUCT, prompt_version="experiment",
                              searched_outcomes=SHOWCASE, ignore_population=False,
                              exclude_offtarget_population=True,
                              form_top=width) if not legacy else build_ecus(
                              dump, PRODUCT, prompt_version="experiment",
                              searched_outcomes=SHOWCASE, ignore_population=False,
                              exclude_offtarget_population=True)
        finally:
            if legacy:
                arcsmod.form_strength = orig
        return {r["outcome_vocab_id"]: r for r in rows}

    import contextlib, io
    def quiet(fn, *a, **k):
        with contextlib.redirect_stdout(io.StringIO()):
            return fn(*a, **k)

    base = quiet(run, None, True)
    arms = {w: quiet(run, w) for w in WIDTHS}

    print(f"  {'outcome':<20}{'v4 comp':>8}" + "".join(f"{'t'+str(w):>7}" for w in WIDTHS)
          + f"{'strength':>10}{'n_form':>7}{'basis':>20}")
    for o in SHOWCASE:
        b = base.get(o)
        if not b or b.get("composite") is None:
            print(f"  {o[:19]:<20}{'gated':>8}")
            continue
        fa = (arms[WIDTHS[0]].get(o) or {}).get("arcs", {}).get("form", {})
        row = "".join(f"{(arms[w].get(o) or {}).get('composite'):>7}" for w in WIDTHS)
        print(f"  {o[:19]:<20}{b['composite']:>8}{row}"
              f"{fa.get('strength'):>10}{fa.get('n_in_form'):>7}{fa.get('basis',''):>20}")
    print("\n  Every width is identical because every exact-form primary in this")
    print("  corpus is design_rank 4. The v4 -> ladder column is the real move.")


if __name__ == "__main__":
    dump = sys.argv[1] if len(sys.argv) > 1 else str(
        Path.home() / ".claude/jobs/d96af802/tmp/extractions_v113.json")
    synthetic()
    if Path(dump).exists():
        real(dump)
    else:
        print(f"\n(no dump at {dump}; synthetic arm only)")
