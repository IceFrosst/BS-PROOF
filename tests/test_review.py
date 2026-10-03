"""Evidence method v2 second reviewer: the disagreement rule (pipeline/review.py),
its worker wiring (bsproof/workers.py) and what the pool does with it."""
import os
import unittest
from unittest import mock

from pipeline.review import reconcile, reconcile_study

CLAIM = {"effect_favours": "ingredient", "estimate_kind": None, "estimand": "endpoint",
         "design_kind": "parallel", "contrast": "vs_ingredient_free", "ci_level": None}
VERIFIED = {"mean_ingredient": 85.0, "mean_control": 80.0, "sd_ingredient": 10.0,
            "sd_control": 10.0, "n_ingredient": 20, "n_control": 20}
NUMS = {"verified": VERIFIED, "abs_only": []}


def review(**over):
    return {"found": True, **CLAIM, **VERIFIED, **over}


class Reconcile(unittest.TestCase):
    def test_agreement_keeps_every_number(self):
        r = reconcile(CLAIM, NUMS, review())
        self.assertEqual((r["status"], r["verified"]), ("agreed", VERIFIED))

    def test_rounding_is_not_a_disagreement(self):
        r = reconcile(CLAIM, NUMS, review(mean_ingredient=85.04))
        self.assertEqual(r["status"], "agreed")

    def test_a_misread_number_refuses_the_claim(self):
        r = reconcile(CLAIM, NUMS, review(sd_control=2.2))          # an SE read as the SD
        self.assertEqual(r["status"], "disagreed")
        self.assertEqual(r["verified"], {})
        self.assertIn("sd_control", r["conflicts"][0])

    def test_a_categorical_difference_refuses_the_claim(self):
        r = reconcile(CLAIM, NUMS, review(effect_favours="control"))
        self.assertEqual(r["status"], "disagreed")
        r = reconcile(CLAIM, NUMS, review(estimand="change_from_baseline"))
        self.assertEqual(r["status"], "disagreed")

    def test_an_unconfirmed_number_is_dropped_not_averaged(self):
        r = reconcile(CLAIM, NUMS, review(sd_control=None))
        self.assertEqual(r["status"], "agreed")
        self.assertEqual(r["dropped"], ["sd_control"])
        self.assertNotIn("sd_control", r["verified"])

    def test_reviewer_two_cannot_add_numbers(self):
        r = reconcile(CLAIM, {"verified": {"effect_size": 0.4}}, review(effect_size=0.4, p_value=0.01))
        self.assertEqual(r["verified"], {"effect_size": 0.4})

    def test_effect_size_is_compared_by_magnitude(self):
        r = reconcile(CLAIM, {"verified": {"effect_size": -0.4}}, review(effect_size=0.4))
        self.assertEqual(r["status"], "agreed")

    def test_not_found_and_not_reviewed(self):
        self.assertEqual(reconcile(CLAIM, NUMS, {"found": False})["status"], "disagreed")
        single = reconcile(CLAIM, NUMS, None)
        self.assertEqual((single["status"], single["verified"]), ("single", VERIFIED))

    def test_study_matches_by_index_and_queues_disagreements(self):
        outcomes = [{"claim": CLAIM, "outcome_vocab_id": "muscle_strength", "numbers_v2": dict(NUMS)},
                    {"claim": CLAIM, "outcome_vocab_id": "lean_body_mass", "numbers_v2": dict(NUMS)}]
        reviews = [{"index": 1, **review(mean_control=60.0)}, {"index": 0, **review()}]   # reordered
        queue = reconcile_study(outcomes, reviews, {0, 1})
        self.assertEqual(outcomes[0]["numbers_v2"]["review"]["status"], "agreed")
        self.assertEqual(outcomes[1]["numbers_v2"]["review"]["status"], "disagreed")
        self.assertEqual([q["outcome"] for q in queue], ["lean_body_mass"])


class WorkerWiring(unittest.TestCase):
    REC = {"_canonical": "doi:10.1/r", "ingredient": "creatine", "title": "t",
           "abstract": "oral creatine supplementation 5 g/day", "design_rank": 4}
    SPAN = "Bench press: creatine 85.0 ± 10.0 kg (n = 20) vs placebo 80.0 ± 10.0 kg (n = 20)."

    def fake(self, reviews):
        calls = []

        def _c(agent, payload):
            calls.append((agent, payload))
            if agent == "S5":
                return {"claims": [{**CLAIM, **VERIFIED, "outcome_raw": "bench press 1-RM",
                                    "measure": "kg", "timepoint": "week 8", "evidence_span": self.SPAN,
                                    "ingredient_arm": "CR", "control_arm": "PL",
                                    "effect_size": None, "ci_low": None, "ci_high": None,
                                    "p_value": None, "table_provenance": None}]}, {}
            if agent == "S6B":
                return {"mappings": [{"index": 0, "outcome_vocab_id": "muscle_strength",
                                      "confidence": 0.9, "rationale": "1rm"}]}, {}
            if agent == "S5R":
                return ({"reviews": reviews} if reviews is not None else None), {"error": "boom"}
            return {}, {}
        return _c, calls

    def run_study(self, reviews, flag="1"):
        from bsproof import workers
        call, calls = self.fake(reviews)
        env = {"SP_SECOND_REVIEWER": flag, "SP_NUMERIC_TABLES": "0", "SP_V13_SHADOW": "0"}
        with mock.patch.dict(os.environ, env):
            out = workers.extract_study(self.REC, "x" * 500 + self.SPAN, call=call)
        return out, calls

    def test_reviewer_is_blind_to_reviewer_one_numbers(self):
        out, calls = self.run_study([{"index": 0, **review()}])
        payload = dict(calls)["S5R"]
        self.assertEqual(payload["claims"][0]["outcome_raw"], "bench press 1-RM")
        self.assertNotIn("mean_ingredient", payload["claims"][0])
        self.assertEqual(out["outcomes"][0]["numbers_v2"]["review"]["status"], "agreed")
        self.assertEqual(out["review_v2"], {"sent": 1, "adjudication": []})

    def test_failed_review_is_single_never_agreed(self):
        out, _ = self.run_study(None)
        self.assertEqual(out["outcomes"][0]["numbers_v2"]["review"]["status"], "single")
        self.assertIn("S5R", [f["agent"] for f in out["_failed"]])

    def test_off_by_default(self):
        out, calls = self.run_study([], flag="0")
        self.assertNotIn("S5R", [a for a, _ in calls])
        self.assertNotIn("review_v2", out)

    def test_the_pool_refuses_a_disputed_claim(self):
        from pipeline import vocab
        from pipeline.pool import pool_outcomes
        out, _ = self.run_study([{"index": 0, **review(sd_ingredient=1.0)}])
        pv = vocab.population_variants()[0]
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
        out["S3"] = {"population_axes": {a: pv[a] for a in vocab.AXES},
                     "comparator": "ingredient_free", "ingredient_isolated": "yes"}
        p = pool_outcomes([{"id": "r", "record": self.REC, "extraction": out}], product)["muscle_strength"]
        self.assertEqual(p.k, 0)
        self.assertEqual(p.refused, {"reviewers disagree (human adjudication)": 1})


class ReviewerModel(unittest.TestCase):
    def test_same_model_as_the_extractor_is_refused(self):
        from bsproof import claude_adapter as ca
        same = {**ca.TIER_MODEL, "R": ca.TIER_MODEL[ca.AGENTS["S5"][0]]}
        with mock.patch.object(ca, "TIER_MODEL", same):
            with self.assertRaises(ValueError):
                ca.call("S5R", {"claims": []})


if __name__ == "__main__":
    unittest.main()
