#!/usr/bin/env python3
"""Regenerate tests/golden_scoring_parity.json FROM THE PYTHON ORIGINALS.

lib/analyze/scoring.ts and lib/analyze/vocab.ts are ports of pipeline/dose.py,
pipeline/arcs.py and pipeline/vocab.py so the label-upload route can run on
Vercel, where there is no Python. tests/analyze-parity.test.ts pins every port
to the values the Python originals compute for the cases below. When a founder
retunes a constant or reshapes a formula in Python, run this, commit the JSON,
and the vitest suite fails until the TypeScript port is re-synced -- a loud
disagreement instead of a silent drift.

The ARGUMENTS are fixed here; only the EXPECTED values are computed. Adding a
case is adding an argument tuple. Never hand-edit an expected value.

    python3 scripts/golden_parity.py          # rewrite the JSON
    python3 scripts/golden_parity.py --check  # exit 1 if the JSON is stale
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline import arcs, dose, vocab  # noqa: E402

OUT = ROOT / "tests" / "golden_scoring_parity.json"

BAND = {"low": 5000.0, "high": 20000.0}
DOSES = (1000, 2400, 2500, 3000, 4000, 4999, 5000, 12000, 20000, 25000, 39000,
         40000, 60000)

DOSE_FACTOR_ARGS = (
    [(d, d, BAND) for d in DOSES]
    + [(None, None, BAND), (3000, 6000, BAND), (4400, 4400, {"low": None, "high": None})]
)
DOSE_MATCH_ARGS = [
    (1000, 1000, BAND), (3000, 3000, BAND), (5000, 5000, BAND), (20000, 20000, BAND),
    (39000, 39000, BAND), (41000, 41000, BAND), (None, None, BAND), (3000, 6000, BAND),
]
# (effect_d, form_strength, dose_closeness, c, H) -- SCORING_MODEL v14.
COMPOSITE_ARGS = [
    (None, 0.8, 1.0, 0.9, 0.0),
    (0.0, 1.0, 1.0, 1.0, 0.0), (0.0, 0.0, None, 1.0, 0.0),
    (1.0, 1.0, 1.0, 1.0, 0.0), (1.0, 1.0, 0.0, 1.0, 0.0), (1.0, 1.0, None, 1.0, 0.0),
    (1.0, 0.0, None, 1.0, 0.0), (0.5, 0.0, None, 1.0, 0.0),
    (-1.0, 1.0, 1.0, 1.0, 0.0), (-1.0, 0.0, None, 1.0, 0.0),
    (-0.35, 1.0, 1.0, 1.0, 0.0), (-0.35, 0.0, None, 1.0, 0.0),
    (0.38, 0.8, 1.0, 0.9, 0.0), (0.38, 0.8, 0.1, 0.9, 0.0), (0.38, 0.8, None, 0.9, 0.0),
    (0.8, 1.0, 1.0, 1.0, 1.0), (0.8, 1.0, 1.0, 1.0, 0.5),
    (0.3, 0.8, 0.85, 0.8, 0.0), (0.3, 0.8, 0.10, 0.8, 0.0),
    (0.1, 0.8, None, 0.9, 0.0), (0.1, 0.8, 0.64, 0.9, 0.0), (0.1, 0.8, 0.1, 0.9, 0.0),
    # The four scored creatine rows of run 20260825_175339 (v13 inputs).
    (0.038, 0.8, None, 0.821, 0.016), (0.09, 0.8, None, 0.642, 0.013),
    (0.727, 0.8, 0.7842, 0.363, 0.132), (0.241, 0.8, 0.1, 0.693, 0.106),
    # Round-half-to-even is the Python behaviour the port must reproduce.
    (0.01, 1.0, 1.0, 1.0, 0.0), (0.03, 1.0, 1.0, 1.0, 0.0), (-0.01, 1.0, 1.0, 1.0, 0.0),
    (0.9, 1.0, 1.0, 1.0, 0.0), (0.7, 1.0, 1.0, 0.5, 0.0),
]
# (composite, c, effect_verdict, applicability_limited, applicability_score)
LABEL_ARGS = [
    (None, 0.9, None, False, None), (40, None, None, False, None), (60, 0.1, None, False, None),
    (100, 1.0, 1.0, False, 1.0), (65, 0.9, 0.3, False, 0.9), (64, 0.9, 0.3, False, 0.9),
    (55, 0.9, 0.2, False, 0.9), (54, 0.9, 0.1, False, 0.9), (45, 0.9, 0.0, False, 0.9),
    (44, 0.9, -0.1, False, 0.9), (30, 0.9, -0.3, False, 0.9), (29, 0.9, -0.4, False, 0.9),
    (0, 1.0, -1.0, False, 0.9),
    (52, 0.9, 1.0, False, 0.05), (52, 0.9, 1.0, True, None), (52, 0.9, 1.0, False, 0.9),
    (52, 0.9, 1.0, False, None), (52, 0.9, 0.24, False, 0.45),
    (60, 0.9, -0.5, False, 1.0), (37, 0.51, 1.0, True, None), (5, 0.5, -0.7, True, None),
    (60, 0.363, 0.727, False, 0.792), (54, 0.693, 0.241, False, 0.45),
]
ELEMENTAL_ARGS = [
    ("creatine", "creatine_monohydrate", 4400), ("creatine", "creatine_monohydrate", None),
    ("creatine", "creatine_buffered", 3000), ("magnesium", "magnesium_glycinate", 2000),
    ("magnesium", "magnesium_chloride", 1000), ("magnesium", "magnesium_citrate", 1000),
    ("creatine", None, 4400), ("creatine", "no_such_form", 4400),
]


def _cases(fn, args):
    return [{"args": list(a), "expect": fn(*a)} for a in args]


def build() -> dict:
    return {
        "dose_factor": _cases(dose.dose_factor_for, DOSE_FACTOR_ARGS),
        "dose_match": _cases(dose.dose_match_for, DOSE_MATCH_ARGS),
        "composite": _cases(arcs.composite, COMPOSITE_ARGS),
        "label": [{"args": list(a),
                   "expect": arcs.label(a[0], a[1], effect_verdict=a[2],
                                        applicability_limited=a[3],
                                        applicability_score=a[4])}
                  for a in LABEL_ARGS],
        "elemental": _cases(vocab.elemental_dose_range_mg, ELEMENTAL_ARGS),
    }


def main(argv: list[str]) -> int:
    golden = build()
    text = json.dumps(golden, indent=1) + "\n"
    if "--check" in argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print(f"STALE: {OUT.relative_to(ROOT)} differs from what the Python "
                  f"originals compute. Run scripts/golden_parity.py and commit.")
            return 1
        print("golden parity file is current")
        return 0
    OUT.write_text(text, encoding="utf-8")
    n = sum(len(v) for v in golden.values())
    print(f"wrote {OUT.relative_to(ROOT)}: {n} cases across {len(golden)} functions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
