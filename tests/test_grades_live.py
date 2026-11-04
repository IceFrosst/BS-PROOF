"""vocab/grades_live.json: the only v2 grades the app may show (docs/APP.md §4,
founder 2026-11-04). Each listed outcome must pass its benchmark in the pinned run."""
import json
import unittest
from pathlib import Path

from pipeline import benchmark

ROOT = Path(__file__).resolve().parents[1]
LIVE = json.loads((ROOT / "vocab" / "grades_live.json").read_text(encoding="utf-8"))["live"]


def verdicts_for(run_id: str) -> tuple[dict, dict]:
    ctx = json.loads((ROOT / "reports" / "runs" / f"{run_id}_context.json").read_text(encoding="utf-8"))
    block = ctx["evidence_v2"]
    rows = benchmark.load(ctx.get("ingredient"))
    by = {}
    for v in benchmark.verdicts(block, benchmark.compare(block, rows)):
        by.setdefault(v["outcome"], []).append(v["status"])
    return ctx, by


class GradesLive(unittest.TestCase):
    def test_every_entry_is_validated(self):
        seen = set()
        for e in LIVE:
            self.assertNotIn(e["ingredient"], seen, "one pinned run per ingredient")
            seen.add(e["ingredient"])
            ctx, by = verdicts_for(e["run_id"])
            self.assertEqual(ctx.get("ingredient"), e["ingredient"])
            graded = {o["outcome"] for o in ctx["evidence_v2"]["outcomes"]}
            for oid in e["outcomes"]:
                self.assertIn(oid, graded, f"{e['run_id']} has no {oid}")
                statuses = by.get(oid, [])
                self.assertTrue(statuses and all(s == "pass" for s in statuses),
                                f"{e['ingredient']} {oid} in {e['run_id']}: benchmark {statuses or 'no comparable rows'}")

    def test_the_check_rejects_an_unvalidated_outcome(self):
        # Vitamin D strength, run 20261103_205726: not testable (coverage 40 %).
        _, by = verdicts_for("20261103_205726_vitamin-d_vitamin-d3-cholecalciferol_claude-ft-top1-inter")
        self.assertEqual(by["muscle_strength"], ["not_testable"])
