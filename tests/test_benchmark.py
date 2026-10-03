"""Evidence method v2 benchmark: the published rows (vocab/benchmarks.json) and
the like-for-like comparison (pipeline/benchmark.py). Offline; the online check
of each quote against its source is `scripts/benchmark_v2.py verify`."""
import unittest

from pipeline import benchmark

ROW = {"id": "x", "ingredient": "creatine", "outcome": "muscle_strength", "measure": "1RM",
       "population": "adults", "scale": "smd", "unit": None, "estimate": 0.43, "ci_low": 0.25,
       "ci_high": 0.61, "quote": "(SMD = 0.43, 95% CI: 0.25 to 0.61; I2 = 43%)"}


def block(smd=None, md=None, outcome="muscle_strength", k=5):
    return {"outcomes": [{"outcome": outcome, "k": k, "smd": smd, "md": md}]}


class Rows(unittest.TestCase):
    def test_every_stored_row_is_sound(self):
        for r in benchmark.load():
            with self.subTest(row=r["id"]):
                self.assertEqual(benchmark.check_row(r), [])

    def test_at_least_ten_meta_analyses_and_unique_ids(self):
        rows = benchmark.load("creatine")
        self.assertGreaterEqual(len({r["doi"] for r in rows}), 10)     # Phase 4 exit (§8)
        self.assertEqual(len({r["id"] for r in rows}), len(rows))

    def test_the_misattributed_source_is_excluded(self):
        import json
        doc = json.loads(benchmark.PATH.read_text(encoding="utf-8"))
        self.assertNotIn("10.3390/nu17020238", {r["doi"] for r in doc["benchmarks"]})
        self.assertIn("10.3390/nu17020238", {e["source"] for e in doc["excluded"]})

    def test_a_number_not_in_the_quote_is_a_problem(self):
        self.assertIn("ci_high 0.62 is not printed in the quote",
                      benchmark.check_row({**ROW, "ci_high": 0.62}))

    def test_shape_problems(self):
        self.assertTrue(benchmark.check_row({**ROW, "scale": "md"}))           # md without a unit
        self.assertTrue(benchmark.check_row({**ROW, "estimate": 0.7, "quote": ROW["quote"] + " 0.7"}))
        self.assertTrue(benchmark.check_row({**ROW, "outcome": "not_an_outcome"}))


class Compare(unittest.TestCase):
    def one(self, b, row=ROW):
        return benchmark.compare(b, [row])[0]

    def test_overlapping_intervals(self):
        r = self.one(block(smd={"estimate": 0.30, "ci": [0.10, 0.50]}))
        self.assertEqual((r["comparable"], r["overlap"], r["same_direction"]), (True, True, True))

    def test_disjoint_intervals(self):
        r = self.one(block(smd={"estimate": -0.40, "ci": [-0.80, -0.05]}))
        self.assertEqual((r["overlap"], r["same_direction"]), (False, False))

    def test_touching_bounds_overlap(self):
        self.assertTrue(self.one(block(smd={"estimate": 0.1, "ci": [0.0, 0.25]}))["overlap"])

    def test_like_for_like_only(self):
        md_row = {**ROW, "scale": "md", "unit": "kg", "estimate": 4.43, "ci_low": 3.12, "ci_high": 5.75}
        r = self.one(block(smd={"estimate": 0.3, "ci": [0.1, 0.5]}), md_row)
        self.assertEqual((r["comparable"], r["reason"]), (False, "no MD pool for this outcome"))
        r = self.one(block(md={"estimate": 2.0, "ci": [1.0, 3.0], "unit": "cm"}), md_row)
        self.assertIn("units differ", r["reason"])
        r = self.one(block(md={"estimate": 4.0, "ci": [3.0, 5.0], "unit": " KG "}), md_row)
        self.assertTrue(r["overlap"])                                          # unit compared normalised

    def test_no_pool_no_comparison(self):
        r = self.one(block(smd=None, outcome="lean_body_mass"))
        self.assertEqual((r["comparable"], r["reason"]), (False, "no pooled outcome in this run"))
        self.assertFalse(self.one(None)["comparable"])

    def test_summary_counts(self):
        res = benchmark.compare(block(smd={"estimate": 0.3, "ci": [0.1, 0.5]}),
                                [ROW, {**ROW, "id": "y", "estimate": 0.9, "ci_low": 0.8, "ci_high": 1.0,
                                       "quote": "0.9 (0.8, 1.0)"}])
        self.assertEqual(benchmark.summary(res)["muscle_strength"], {"rows": 2, "comparable": 2, "overlap": 1})


if __name__ == "__main__":
    unittest.main()
