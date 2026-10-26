"""Rules that read the v1.41 extraction fields (founder 2026-10-26, from the
first spot audit of run 20261026_034529): an smd's basis (S5N `smd_basis`),
the baseline SDs in the ANCOVA slope (`sd_pre_*`), and the end of
supplementation as the pooled timepoint (S5 `timepoint_role`)."""
import unittest

from pipeline import meta_effects as me
from pipeline import vocab
from pipeline.effect_size import effect_from_claim
from pipeline.pool import pool_outcomes

SMD = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint",
       "estimate_kind": "smd", "effect_favours": "ingredient", "ci_level": 0.95}
SMD_NUMS = {"effect_size": 0.95, "ci_low": 0.2, "ci_high": 1.7}


class SmdBasis(unittest.TestCase):
    def test_only_a_between_arm_smd_is_pooled(self):
        for basis in ("between_groups_endpoint", "between_groups_change"):
            eff, route = effect_from_claim({**SMD, "smd_basis": basis}, SMD_NUMS, polarity="higher_better")
            self.assertEqual(route, "reported_smd_ci", basis)
        for basis in ("interaction_or_anova", "within_group", None):
            eff, why = effect_from_claim({**SMD, "smd_basis": basis}, SMD_NUMS, polarity="higher_better")
            self.assertIsNone(eff, basis)
            self.assertIn("only a between-arm SMD is pooled", why)

    def test_a_mean_difference_needs_no_basis(self):
        md = {**SMD, "estimate_kind": "mean_difference"}
        self.assertEqual(effect_from_claim(md, {"effect_size": 2.0, "ci_low": 0.5, "ci_high": 3.5},
                                           polarity="higher_better")[1], "reported_md_ci")


class AncovaSlope(unittest.TestCase):
    ARM = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint"}
    NUMS = {"mean_ingredient": 65.4, "mean_control": 67.6, "sd_ingredient": 7.3, "sd_control": 7.0,
            "n_ingredient": 10, "n_control": 10, "pre_ingredient": 62.9, "pre_control": 68.0}

    def test_baseline_sds_set_the_slope(self):
        eff, _ = effect_from_claim(self.ARM, {**self.NUMS, "sd_pre_ingredient": 14.6, "sd_pre_control": 14.0},
                                   polarity="higher_better")
        ratio = 7.15 / 14.3          # pooled post SD / pooled pre SD (equal n)
        expected = me.hedges_g(65.4 - 0.5 * ratio * (62.9 - 68.0), 7.3, 10, 67.6, 7.0, 10).g
        self.assertAlmostEqual(eff.smd, expected, places=3)
        self.assertIn("ancova_baseline_sd", eff.flags)

    def test_without_baseline_sds_the_sds_are_taken_as_equal(self):
        eff, _ = effect_from_claim(self.ARM, self.NUMS, polarity="higher_better")
        self.assertAlmostEqual(eff.smd, me.hedges_g(65.4 - 0.5 * (62.9 - 68.0), 7.3, 10, 67.6, 7.0, 10).g)
        self.assertNotIn("ancova_baseline_sd", eff.flags)


class TimepointRole(unittest.TestCase):
    def test_the_end_of_supplementation_wins_over_an_earlier_listed_phase(self):
        pv = vocab.population_variants()[0]
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
        arms = [{"label": "CrM", "role": "administered", "target_ingredient_presence": "yes", "active_cointerventions": []},
                {"label": "Control", "role": "administered", "target_ingredient_presence": "no", "active_cointerventions": []}]

        def claim(role, mean):
            c = {"ingredient_arm": "CrM", "control_arm": "Control", "contrast": "vs_ingredient_free",
                 "design_kind": "parallel", "estimand": "change_from_baseline",
                 "outcome_raw": "Total lean body mass change", "measure": "kg", "timepoint_role": role}
            nums = {"mean_ingredient": mean, "sd_ingredient": 1.3, "n_ingredient": 30,
                    "mean_control": 0.0, "sd_control": 1.2, "n_control": 30}
            return {"claim": c, "outcome_vocab_id": "lean_body_mass", "discarded": False,
                    "numbers_v2": {"verified": nums, "claim": c}}
        item = {"id": "w", "record": {"ingredient": "creatine", "design_rank": 4}, "extraction": {
            "S3": {"population_axes": {a: pv[a] for a in vocab.AXES}, "arms": arms,
                   "comparator": "ingredient_free", "ingredient_isolated": "yes"},
            "outcomes": [claim("interim", 0.51), claim("end_of_supplementation", 0.13),
                         claim("after_supplementation_stopped", 0.9)]}}
        chosen = pool_outcomes([item], product)["lean_body_mass"].studies[0]
        self.assertEqual(chosen["claim_index"], 1)


if __name__ == "__main__":
    unittest.main()
