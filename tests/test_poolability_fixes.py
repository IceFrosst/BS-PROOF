"""Evidence method v2 poolability fixes (founder 2026-10-05, measured on run
20261005_080012): an arm's n from S3 when the claim lacks it
(pipeline/span_check.fill_arm_n), and a claim-level matched add-on contrast
(pipeline/eligibility.matched_addon_claim)."""
import unittest

from pipeline import vocab
from pipeline.eligibility import matched_addon_claim
from pipeline.pool import pool_outcomes
from pipeline.review import reconcile
from pipeline.span_check import fill_arm_n

ARMS = [{"label": "CR", "n": 12, "role": "administered", "target_ingredient_presence": "yes",
         "active_cointerventions": []},
        {"label": "PL", "n": 11, "role": "administered", "target_ingredient_presence": "no",
         "active_cointerventions": []}]
CLAIM = {"ingredient_arm": "CR", "control_arm": "PL", "contrast": "vs_ingredient_free",
         "design_kind": "parallel", "estimand": "change_from_baseline", "effect_favours": "ingredient",
         "outcome_raw": "LBM", "effect_unit": "kg"}
MEANS = {"mean_ingredient": 2.78, "sd_ingredient": 1.89, "mean_control": 2.04, "sd_control": 2.70}


class FillArmN(unittest.TestCase):
    def test_missing_n_comes_from_the_same_labelled_arm(self):
        v, flags = fill_arm_n(CLAIM, MEANS, ARMS)
        self.assertEqual((v["n_ingredient"], v["n_control"]), (12, 11))
        self.assertEqual(flags, ("n_from_s3:ingredient", "n_from_s3:control"))

    def test_a_verified_n_is_never_replaced(self):
        v, flags = fill_arm_n(CLAIM, {**MEANS, "n_ingredient": 10}, ARMS)
        self.assertEqual((v["n_ingredient"], flags), (10, ("n_from_s3:control",)))

    def test_no_unique_label_no_fill(self):
        self.assertEqual(fill_arm_n({**CLAIM, "control_arm": "Placebo"}, MEANS, ARMS)[1], ("n_from_s3:ingredient",))
        dup = ARMS + [{**ARMS[1]}]
        self.assertNotIn("n_control", fill_arm_n(CLAIM, MEANS, dup)[0])
        self.assertEqual(fill_arm_n(CLAIM, MEANS, None), (MEANS, ()))

    def test_the_reviewer_routes_on_filled_n_but_never_compares_it(self):
        r = reconcile(CLAIM, {"verified": MEANS}, {"found": True, **CLAIM, **MEANS}, "higher_better", ARMS)
        self.assertEqual((r["status"], r["route"]), ("agreed", "arm_stats"))
        self.assertNotIn("n_ingredient", r["verified"])            # the pool re-fills it


class MatchedAddon(unittest.TestCase):
    GAA = [{"label": "PLA", "role": "administered", "target_ingredient_presence": "no", "active_cointerventions": []},
           {"label": "GAA", "role": "administered", "target_ingredient_presence": "no",
            "active_cointerventions": ["guanidinoacetic acid (GAA)"]},
           {"label": "GAA + CrM", "role": "administered", "target_ingredient_presence": "yes",
            "active_cointerventions": ["guanidinoacetic acid (GAA)"]}]

    def test_a_matched_pair_in_a_three_arm_trial(self):
        s3 = {"arms": self.GAA}
        self.assertTrue(matched_addon_claim({"ingredient_arm": "GAA + CrM", "control_arm": "GAA"}, s3))
        self.assertFalse(matched_addon_claim({"ingredient_arm": "GAA + CrM", "control_arm": "PLA"}, s3))

    def test_unknown_cointerventions_never_match(self):
        arms = [{**a, "active_cointerventions": None} for a in self.GAA]
        self.assertFalse(matched_addon_claim({"ingredient_arm": "GAA + CrM", "control_arm": "GAA"}, {"arms": arms}))

    def test_the_pool_keeps_only_the_matched_claim(self):
        pv = vocab.population_variants()[0]
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
        nums = {**MEANS, "n_ingredient": 12, "n_control": 11}

        def item(control):
            claim = {**CLAIM, "ingredient_arm": "GAA + CrM", "control_arm": control}
            return {"id": "g", "record": {"ingredient": "creatine", "design_rank": 4}, "extraction": {
                "S3": {"population_axes": {a: pv[a] for a in vocab.AXES}, "comparator": "ingredient_free",
                       "ingredient_isolated": "no", "arms": self.GAA},
                "outcomes": [{"claim": claim, "outcome_vocab_id": "lean_body_mass", "discarded": False,
                              "numbers_v2": {"verified": nums, "claim": claim}}]}}
        self.assertEqual(pool_outcomes([item("GAA")], product)["lean_body_mass"].k, 1)
        refused = pool_outcomes([item("PLA")], product)["lean_body_mass"]
        self.assertEqual((refused.k, refused.refused), (0, {"study: no_isolated_ingredient_arm": 1}))


if __name__ == "__main__":
    unittest.main()
