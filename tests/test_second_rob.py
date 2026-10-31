"""A risk-of-bias flaw counts only when two independent readers report it
(pool.confirmed_s4, workers._second_rob; founder rule 2026-10-31)."""
import unittest

from bsproof import workers
from pipeline.effect_size import effect_from_claim
from pipeline.pool import confirmed_s4, rob_status

S4 = {"item1_randomisation_method": 0, "item2_double_blind_placebo": 1, "item5_attrition_ok": 1,
      "item7_attrition_problem": 0}


class Confirmed(unittest.TestCase):
    def test_a_flaw_one_reader_does_not_see_is_not_a_flaw(self):
        for flaw in ({"item2_double_blind_placebo": 0}, {"item7_attrition_problem": 1}):
            merged, disputed = confirmed_s4({**S4, **flaw}, S4)
            self.assertTrue(disputed)
            self.assertEqual(rob_status(merged), "unclear")

    def test_a_flaw_both_report_stands(self):
        s4 = {**S4, "item2_double_blind_placebo": 0}
        self.assertEqual(confirmed_s4(s4, s4), (s4, False))
        self.assertEqual(rob_status(confirmed_s4(s4, s4)[0]), "high")

    def test_a_second_readers_null_does_not_confirm_and_no_reader_changes_nothing(self):
        s4 = {**S4, "item2_double_blind_placebo": 0}
        merged, disputed = confirmed_s4(s4, {**S4, "item2_double_blind_placebo": None})
        self.assertTrue(disputed)
        self.assertIsNone(merged["item2_double_blind_placebo"])
        self.assertEqual(confirmed_s4(s4, None), (s4, False))
        # only S4's flaws are in question: S4R alone cannot add one
        self.assertEqual(confirmed_s4(S4, {**S4, "item7_attrition_problem": 1}), (S4, False))


class Worker(unittest.TestCase):
    CLAIM = {"ingredient_arm": "CR", "control_arm": "PL", "contrast": "vs_ingredient_free", "design_kind": "parallel",
             "estimand": "endpoint", "outcome_raw": "1RM"}
    NUMS = {"mean_ingredient": 10.0, "sd_ingredient": 2.0, "n_ingredient": 10,
            "mean_control": 9.0, "sd_control": 2.0, "n_control": 10}

    def out(self, s4, numbers=None):
        return {"S4": s4, "outcomes": [{"claim": self.CLAIM, "outcome_vocab_id": "muscle_strength", "discarded": False,
                                        "numbers_v2": {"verified": self.NUMS if numbers is None else numbers,
                                                       "claim": self.CLAIM}}]}

    def run_it(self, out):
        calls = []

        def call(agent, payload):
            calls.append(agent)
            return S4, {}
        workers._second_rob(out, {"title": "t"}, "paper text", None, None, {"arms": []}, call)
        return calls

    def test_called_only_for_a_reported_flaw_in_a_study_with_an_effect(self):
        flaw = {**S4, "item7_attrition_problem": 1}
        out = self.out(flaw)
        self.assertEqual(self.run_it(out), ["S4R"])
        self.assertEqual(out["S4R"], S4)
        self.assertEqual(self.run_it(self.out(S4)), [])
        self.assertEqual(self.run_it(self.out(flaw, numbers={})), [])


class PooledOverVisits(unittest.TestCase):
    def test_an_se_pooled_over_visits_gives_no_sd_a_printed_sd_is_kept(self):
        claim = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint"}
        se = {"mean_ingredient": 444.6, "mean_control": 396.7, "se_ingredient": 11.62, "se_control": 13.89,
              "n_ingredient": 12, "n_control": 9}
        eff, why = effect_from_claim({**claim, "timepoint": "across 6-week intervention"}, se, polarity="higher_better")
        self.assertIsNone(eff)
        self.assertIn("pooled over visits", why)
        self.assertIsNotNone(effect_from_claim({**claim, "timepoint": "6 weeks"}, se, polarity="higher_better")[0])
        sd = {**{k: v for k, v in se.items() if not k.startswith("se_")}, "sd_ingredient": 40.0, "sd_control": 41.0}
        self.assertIsNotNone(effect_from_claim({**claim, "timepoint": "across 6 weeks"}, sd, polarity="higher_better")[0])


if __name__ == "__main__":
    unittest.main()
