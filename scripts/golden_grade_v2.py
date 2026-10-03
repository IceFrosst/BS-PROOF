#!/usr/bin/env python3
"""Regenerate tests/golden_grade_v2.json FROM THE PYTHON ORIGINALS.

lib/analyze/grade-v2.ts recomputes the evidence-method-v2 letter for a scanned
product from a run's stored `evidence_v2` block. tests/grade-v2-parity.test.ts
pins it to what Python's FULL path -- pool_outcomes for that product, then
pipeline/grade.grade -- computes for the cases below. A change to grade.py or
pool.py that the port does not follow fails vitest loudly.

The fixture trials and products are fixed here; only the expected values are
computed. Never hand-edit an expected value.

    python3 scripts/golden_grade_v2.py          # rewrite the JSON
    python3 scripts/golden_grade_v2.py --check  # exit 1 if the JSON is stale
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline import vocab  # noqa: E402
from pipeline.evidence_v2 import summarise  # noqa: E402
from pipeline.grade import grade  # noqa: E402
from pipeline.pool import pool_outcomes  # noqa: E402

OUT = ROOT / "tests" / "golden_grade_v2.json"
PV = vocab.population_variants()[0]
POP = {a: PV[a] for a in vocab.AXES}

# (study, outcome, raw measure, ingredient mean, control mean, sd, n per arm, form, daily mg, RoB items)
TRIALS = [
    ("s1", "muscle_strength", "Leg press 1-RM (kg)", 86, 80, 10, 40, "creatine_monohydrate", 5000, (1, 1, 1)),
    ("s2", "muscle_strength", "Leg press 1-RM (kg)", 84, 80, 10, 40, "creatine_hcl", 5000, (1, 1, 1)),
    ("s3", "muscle_strength", "Bench press 1-RM (kg)", 88, 80, 10, 40, "creatine_monohydrate", 20000, (1, 0, 1)),
    ("s4", "muscle_strength", "Squat 1-RM (kg)", 83, 80, 10, 40, "creatine_monohydrate", 3000, (None, 1, 1)),
    ("s5", "muscle_strength", "Leg press 1-RM (kg)", 85, 80, 10, 40, None, None, (1, 1, 1)),
    ("s1", "lean_body_mass", "Whole-body lean mass (kg)", 61.0, 60.0, 8, 40, "creatine_monohydrate", 5000, (1, 1, 1)),
    ("s2", "lean_body_mass", "Fat-free mass (kg)", 59.0, 60.0, 8, 40, "creatine_hcl", 5000, (1, 1, 1)),
    ("s6", "lean_body_mass", "Lean body mass (kg)", 60.5, 60.0, 8, 12, "creatine_monohydrate", 5000, (0, 0, 1)),
    ("s7", "muscle_power", "Wingate peak power (W)", 700, 760, 60, 30, "creatine_monohydrate", 5000, (1, 1, 1)),
    ("s8", "muscle_power", "Wingate peak power (W)", 690, 750, 60, 30, "creatine_monohydrate", 5000, (1, 1, 1)),
]
REGISTRY = {"muscle_strength": {"registered": 12, "in_corpus": 5, "upper_bound": True,
                                "unpublished": [f"NCT9{i}" for i in range(6)]},
            "lean_body_mass": {"registered": 4, "in_corpus": 3, "upper_bound": True, "unpublished": ["NCT81"]}}
PRODUCTS = [("creatine_monohydrate", None), ("creatine_monohydrate", 5000), ("creatine_monohydrate", 1000),
            ("creatine_hcl", 5000), ("creatine_hcl", 20000), (None, None), ("creatine_monohydrate", 12000)]


def items() -> list[dict]:
    out: dict[str, dict] = {}
    for sid, oid, raw, mi, mc, sd, n, form, mg, (r1, r2, r5) in TRIALS:
        it = out.setdefault(sid, {"id": sid, "record": {"ingredient": "creatine", "design_rank": 4},
                                  "extraction": {"S3": {"population_axes": dict(POP), "comparator": "ingredient_free",
                                                        "ingredient_isolated": "yes"},
                                                 "S4": {"item1_randomisation_method": r1,
                                                        "item2_double_blind_placebo": r2, "item5_attrition_ok": r5},
                                                 "S7": {"form_vocab_id": form, "elemental_dose_mg": mg,
                                                        "dose_basis": "elemental_stated" if mg else None},
                                                 "outcomes": []}})
        claim = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint",
                 "effect_unit": "kg", "outcome_raw": raw, "is_primary_outcome": True}
        it["extraction"]["outcomes"].append({
            "outcome_vocab_id": oid, "discarded": False, "claim": claim,
            "numbers_v2": {"verified": {"mean_ingredient": mi, "mean_control": mc, "sd_ingredient": sd,
                                        "sd_control": sd, "n_ingredient": n, "n_control": n}, "abs_only": []}})
    return list(out.values())


def product(form, mg) -> dict:
    return {"ingredient": "creatine", "form_vocab_id": form, "population": {"id": PV["id"], **POP},
            "dose_low_mg": mg, "dose_high_mg": mg}


def build() -> dict:
    its = items()
    mcids = {o["id"]: o.get("mcid") for o in vocab.load("outcome")["outcomes"]}
    block = summarise(its, product("creatine_monohydrate", 5000), REGISTRY)
    cases = []
    for form, mg in PRODUCTS:
        expected = {}
        for oid, pool in pool_outcomes(its, product(form, mg)).items():
            g = grade(pool, mcids.get(oid), REGISTRY.get(oid))
            expected[oid] = {"letter": g.letter, "level": g.certainty.level, "benefit": g.benefit,
                             "letters_at": g.letters_at,
                             "downgrade_points": {d: p for d, (p, _w) in g.certainty.downgrades.items()}}
        cases.append({"form": form, "dose_mg": mg, "expected": expected})
    return {"_note": "GENERATED by scripts/golden_grade_v2.py from pipeline/grade.py -- do not edit",
            "block": json.loads(json.dumps(block)), "cases": cases}


def main(argv: list[str]) -> int:
    text = json.dumps(build(), indent=1, sort_keys=True) + "\n"
    if "--check" in argv:
        if not OUT.exists() or OUT.read_text() != text:
            print(f"{OUT.relative_to(ROOT)} is stale: run python3 scripts/golden_grade_v2.py")
            return 1
        print("golden_grade_v2.json is current")
        return 0
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
