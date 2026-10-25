"""The smd_from_p route (founder 2026-10-25, pipeline/effect_size.py): an effect
from an exact two-group p and the arm sizes, refused for any other test, and
always reported with and without (pipeline/evidence_v2.py "sensitivity")."""
import copy
import unittest

from pipeline.effect_size import effect_from_claim
from pipeline.evidence_v2 import summarise
from pipeline.review import reconcile
from tests.test_evidence_v2 import ITEMS, product

CLAIM = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint",
         "effect_favours": "ingredient", "p_test": "two_group_endpoint"}
P_ONLY = {"p_value": 0.05, "n_ingredient": 20, "n_control": 20}


class Conversion(unittest.TestCase):
    def test_hand_computed_value(self):
        # t(38, 0.975) = 2.0244; d = t * sqrt(1/20 + 1/20) = 0.6402; J = 1 - 3/151.
        eff, route = effect_from_claim(CLAIM, P_ONLY, polarity="higher_better")
        self.assertEqual(route, "smd_from_p")
        self.assertAlmostEqual(eff.smd, 0.6275, places=3)
        self.assertIn("smd_from_t_p", eff.flags)
        self.assertEqual(eff.estimand, "endpoint")

    def test_sign_comes_from_the_favoured_arm_and_p_1_is_a_null(self):
        eff, _ = effect_from_claim({**CLAIM, "effect_favours": "control"}, P_ONLY, polarity="higher_better")
        self.assertLess(eff.smd, 0)
        null, _ = effect_from_claim(CLAIM, {**P_ONLY, "p_value": 1.0}, polarity="higher_better")
        self.assertEqual(null.smd, 0.0)

    def test_change_scores_carry_their_estimand(self):
        eff, _ = effect_from_claim({**CLAIM, "p_test": "two_group_change"}, P_ONLY, polarity="higher_better")
        self.assertEqual(eff.estimand, "change_from_baseline")

    def test_refusals_name_their_reason(self):
        cases = {"other": {**CLAIM, "p_test": "other"},
                 "not stated": {**CLAIM, "p_test": None},
                 "crossover": {**CLAIM, "design_kind": "crossover"},
                 "sign unknown": {**CLAIM, "effect_favours": "neither"}}
        for why, claim in cases.items():
            with self.subTest(why=why):
                eff, reason = effect_from_claim(claim, P_ONLY, polarity="higher_better")
                self.assertIsNone(eff)
                self.assertTrue(reason.startswith("only a p-value reported"), reason)

    def test_arm_statistics_still_win(self):
        full = {**P_ONLY, "mean_ingredient": 90, "mean_control": 80, "sd_ingredient": 10, "sd_control": 10}
        _, route = effect_from_claim(CLAIM, full, polarity="higher_better")
        self.assertEqual(route, "arm_stats")


class Review(unittest.TestCase):
    def numbers(self):
        return {"verified": dict(P_ONLY)}

    def test_reviewers_must_name_the_same_test(self):
        agree = {"found": True, **P_ONLY, **{k: CLAIM[k] for k in ("effect_favours", "design_kind", "contrast")},
                 "p_test": "two_group_endpoint"}
        self.assertEqual(reconcile(CLAIM, self.numbers(), agree, "higher_better")["status"], "agreed")
        for other in ("other", None):
            with self.subTest(reviewer_test=other):
                rec = reconcile(CLAIM, self.numbers(), {**agree, "p_test": other}, "higher_better")
                self.assertEqual(rec["status"], "disagreed")


class Sensitivity(unittest.TestCase):
    def test_outcome_reports_the_estimate_without_p_derived_effects(self):
        items = copy.deepcopy(ITEMS)
        extra = copy.deepcopy(items[0])
        extra["id"] = "s9"
        o = extra["extraction"]["outcomes"][0]
        o["claim"] = {**o["claim"], **CLAIM}
        o["numbers_v2"] = {"verified": dict(P_ONLY), "abs_only": []}
        block = summarise(items + [extra], product())
        out = next(x for x in block["outcomes"] if x["outcome"] == "muscle_strength")
        self.assertEqual(out["k"], 6)
        without = out["sensitivity"]["without_smd_from_p"]
        self.assertEqual((without["k"], without["dropped"]), (5, 1))
        self.assertIsNone(summarise(ITEMS, product())["outcomes"][0]["sensitivity"])


if __name__ == "__main__":
    unittest.main()
