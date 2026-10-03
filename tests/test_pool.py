"""Evidence method v2 shadow pooling (pipeline/pool.py) on synthetic studies."""
import unittest

from pipeline import meta_effects as me
from pipeline import vocab
from pipeline.pool import pool_outcomes

PV = vocab.population_variants()[0]
POP = {a: PV[a] for a in vocab.AXES}
PRODUCT = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": PV["id"], **POP}}
ARMS = {"mean_ingredient": None, "mean_control": None, "sd_ingredient": 10.0, "sd_control": 10.0,
        "n_ingredient": 20, "n_control": 20}


def outcome(mean_i, mean_c, *, oid="muscle_strength", primary=False, unit="kg", estimand="endpoint"):
    verified = {**ARMS, "mean_ingredient": mean_i, "mean_control": mean_c}
    claim = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": estimand,
             "effect_unit": unit, "is_primary_outcome": primary}
    return {"outcome_vocab_id": oid, "discarded": False, "claim": claim,
            "numbers_v2": {"verified": verified, "abs_only": []}}


def study(sid, outcomes, **s3):
    return {"id": sid, "record": {"ingredient": "creatine"},
            "extraction": {"S3": {"population_axes": dict(POP), "comparator": "ingredient_free",
                                  "ingredient_isolated": "yes", **s3},
                           "outcomes": outcomes}}


class Pool(unittest.TestCase):
    def test_study_form_comes_from_the_tested_arm(self):
        from pipeline.pool import study_form
        s7 = {"form_vocab_id": None, "arms": [{"label": "CrM", "form_vocab_id": "creatine_monohydrate"},
                                               {"label": "CON", "form_vocab_id": None}]}
        self.assertEqual(study_form(s7, {"ingredient_arm": "CrM"}), "creatine_monohydrate")
        self.assertEqual(study_form(s7, {}), "creatine_monohydrate")       # the only form recorded
        self.assertIsNone(study_form({"arms": []}, {}))

    def test_pooled_estimate_equals_a_direct_meta_analysis(self):
        items = [study(f"s{i}", [outcome(85 + i, 80)]) for i in range(4)]
        p = pool_outcomes(items, PRODUCT)["muscle_strength"]
        gs = [me.hedges_g(85 + i, 10, 20, 80, 10, 20) for i in range(4)]
        direct = me.random_effects_meta_analysis([g.g for g in gs], [g.variance for g in gs],
                                                 confidence_level=0.95, use_hartung_knapp=True)
        self.assertEqual(p.k, 4)
        self.assertAlmostEqual(p.smd["estimate"], direct.estimate)
        self.assertAlmostEqual(p.smd["ci"][0], direct.ci_lower)
        self.assertIsNotNone(p.smd["prediction"])
        self.assertIsNotNone(p.leave_one_out)
        self.assertEqual(p.md["unit"], "kg")

    def test_underpowered_is_kept_but_combinations_are_refused(self):
        items = [study("pilot", [outcome(90, 80)], self_declared_underpowered=True),
                 study("combo", [outcome(90, 80)], ingredient_isolated="no")]
        p = pool_outcomes(items, PRODUCT)["muscle_strength"]
        self.assertEqual([s["study"] for s in p.studies], ["pilot"])
        self.assertEqual(p.refused, {"study: no_isolated_ingredient_arm": 1})

    def test_off_target_population_is_left_out(self):
        sick = study("disease", [outcome(90, 80)])
        sick["extraction"]["S3"]["population_axes"]["health_status"] = "disease"
        p = pool_outcomes([sick, study("healthy", [outcome(90, 80)])], PRODUCT)["muscle_strength"]
        self.assertEqual([s["study"] for s in p.studies], ["healthy"])
        self.assertEqual(p.refused, {"study: off-target population": 1})

    def test_one_effect_per_study_primary_first(self):
        items = [study("s1", [outcome(81, 80), outcome(95, 80, primary=True)])]
        p = pool_outcomes(items, PRODUCT)["muscle_strength"]
        self.assertEqual(p.k, 1)
        self.assertTrue(p.studies[0]["primary"])
        self.assertEqual(p.smd["method"], "single study (not pooled)")

    def test_mixed_units_form_no_natural_unit_pool(self):
        items = [study("a", [outcome(90, 80, unit="kg")]), study("b", [outcome(90, 80, unit="lb")])]
        p = pool_outcomes(items, PRODUCT)["muscle_strength"]
        self.assertIsNone(p.md)
        self.assertIn("2 different units", p.note)
        self.assertEqual(p.k, 2)                             # the SMD pool still forms

    def test_estimand_mix_is_reported(self):
        items = [study("a", [outcome(90, 80)]), study("b", [outcome(5, 2, estimand="change_from_baseline")])]
        p = pool_outcomes(items, PRODUCT)["muscle_strength"]
        self.assertEqual(p.estimand_mix, {"endpoint": 1, "change_from_baseline": 1})


if __name__ == "__main__":
    unittest.main()
