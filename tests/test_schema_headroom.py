"""Free-text fields need headroom above the length the PROMPT asks for.

Measured 2026-10-03 (evidence method v2, Phase 2): S1 lost 6/25 studies and S7
4/25 to `exit 1: max_turns`. The captured outputs were correct objects with ONE
free-text field slightly over its schema maxLength (S1 rationale > 300; an S7
arm evidence_span > 200). Schema rejection asks for a second turn, which
`--max-turns 1` forbids, so the whole call fails -- and a failed S5 drops every
claim of the study. The prompts keep the short TARGETS; the schemas allow ~1.5x.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# (schema, JSON path, length the prompt asks for or the old hard cap)
TARGETS = [
    ("s1_design.json", ".rationale", 300),
    ("s3_study.json", ".arms[].intervention_text", 200),
    ("s3_study.json", ".arms[].evidenced_arm_text", 300),
    ("s3_study.json", ".population_text", 300),
    ("s3_study.json", ".evidence_spans[]", 200),
    ("s5_conclusion.json", ".claims[].outcome_raw", 120),
    ("s5_conclusion.json", ".claims[].measure", 80),
    ("s5_conclusion.json", ".claims[].evidence_span", 200),
    ("s5_conclusion.json", ".claims[].statistic_provenance", 200),
    ("s6_outcome.json", ".rationale", 300),
    ("s6b_outcome_batch.json", ".mappings[].rationale", 300),
    ("s7_form.json", ".arms[].evidence_span", 200),
]


def limits(schema: dict) -> dict:
    out = {}

    def walk(node, path):
        if isinstance(node, dict):
            if "maxLength" in node:
                out[path] = node["maxLength"]
            for k, v in node.items():
                if k == "properties":
                    for pk, pv in v.items():
                        walk(pv, f"{path}.{pk}")
                elif k in ("items", "anyOf", "oneOf"):
                    for x in (v if isinstance(v, list) else [v]):
                        walk(x, f"{path}[]")
    walk(schema, "")
    return out


class SchemaHeadroom(unittest.TestCase):
    def test_free_text_limits_leave_headroom_over_the_target(self):
        for schema, path, target in TARGETS:
            with self.subTest(schema=schema, path=path):
                cap = limits(json.loads((ROOT / "schemas" / schema).read_text()))[path]
                self.assertGreaterEqual(cap, int(target * 1.5), f"{schema}{path} cap {cap}")

    def test_prompt_targets_stay_below_the_caps(self):
        # A prompt that states "N characters maximum" must state a number the
        # schema comfortably allows; raising the prompt number to the cap would
        # bring the failure back.
        caps = {(s, p): limits(json.loads((ROOT / "schemas" / s).read_text()))[p] for s, p, _ in TARGETS}
        s5 = (ROOT / "prompts" / "s5_conclusion.md").read_text()
        stated = int(re.search(r"clause with the number in it, (\d+) characters maximum", s5).group(1))
        self.assertLess(stated, caps[("s5_conclusion.json", ".claims[].evidence_span")])


if __name__ == "__main__":
    unittest.main()
