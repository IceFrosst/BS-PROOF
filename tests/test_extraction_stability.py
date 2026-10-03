"""The Phase 1b comparison maths (scripts/experiments/extraction_stability.py)."""
import copy
import unittest

from scripts.experiments import extraction_stability as es


def _ext(direction="benefit", effect=0.4, comparator="ingredient_free"):
    return {"S3": {"comparator": comparator, "n_randomised": 40, "ingredient_isolated": "yes"},
            "S4": {"item1_randomisation_method": 1}, "S7": {"form_vocab_id": "creatine_monohydrate"},
            "S8": {"funding_class": "independent"},
            "outcomes": [{"outcome_vocab_id": "muscle_strength", "discarded": False,
                          "claim": {"direction": direction, "effect_size": effect,
                                    "effect_favours": "ingredient", "contrast": "vs_ingredient_free"}}]}


def _run(**kw):
    return {"s1": {"record": {"canonical_id": "s1", "ingredient": "creatine"}, "extraction": _ext(**kw)}}


class Stability(unittest.TestCase):
    def test_kappa(self):
        self.assertEqual(es._kappa([("a", "a"), ("b", "b")]), 1.0)
        self.assertEqual(es._kappa([("a", "b"), ("b", "a")]), -1.0)
        self.assertIsNone(es._kappa([]))

    def test_numeric_agreement_tolerates_rounding_only(self):
        self.assertTrue(es._same(0.400, 0.4002))
        self.assertFalse(es._same(0.40, 0.45))
        self.assertTrue(es._same(None, None))

    def test_identical_runs_agree_completely(self):
        a = _run()
        r = es.compare_runs(a, copy.deepcopy(a))
        self.assertEqual(r["studies_compared"], 1)
        self.assertEqual(r["outcome_mapping_jaccard_mean"], 1.0)
        self.assertEqual(r["fields"]["claim.direction"]["agree"], 1.0)
        self.assertEqual(r["fields"]["S3.comparator"]["agree"], 1.0)

    def test_a_flipped_direction_is_counted(self):
        r = es.compare_runs(_run(direction="benefit"), _run(direction="null_effect", effect=0.05))
        self.assertEqual(r["fields"]["claim.direction"]["agree"], 0.0)
        self.assertEqual(r["fields"]["claim.effect_size"]["agree"], 0.0)

    def test_a_failed_agent_drops_only_its_own_fields_and_is_reported(self):
        a, b = _run(), _run()
        b["s1"]["extraction"]["_failed"] = [{"agent": "S7", "error": "exit 1: max_turns"}]
        r = es.compare_runs(a, b)
        self.assertEqual(r["studies_compared"], 1)
        self.assertEqual(r["studies_with_no_failed_agent_in_either_run"], 0)
        self.assertEqual(r["agent_failures"]["B"], {"S7": 1})
        self.assertEqual(r["fields"]["S7.form_vocab_id"]["n"], 0)
        self.assertEqual(r["fields"]["S3.comparator"]["n"], 1)
        self.assertEqual(r["fields"]["claim.direction"]["n"], 1)

if __name__ == "__main__":
    unittest.main()
