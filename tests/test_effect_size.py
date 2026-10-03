"""Evidence method v2: the span check and the effect-size routes.

pipeline/span_check.py decides which extracted numbers are real (printed where
the claim says); pipeline/effect_size.py turns ONLY those into a signed effect
and variance. Both refuse rather than guess -- these tests pin the refusals as
much as the arithmetic.
"""
import math
import unittest

from pipeline import meta_effects as me
from pipeline.effect_size import effect_from_claim
from pipeline.span_check import find_number, verify_claim_numbers


class SpanCheck(unittest.TestCase):
    def test_printed_precision_and_formats(self):
        self.assertEqual(find_number(12.3, "1RM rose to 12.30 ± 2.1 kg"), "exact")
        self.assertEqual(find_number(2.1, "12.3±2.1"), "exact")
        self.assertEqual(find_number(0.006, "difference (p=.006)"), "exact")
        self.assertEqual(find_number(1234, "n = 1,234 adults"), "exact")
        self.assertIsNone(find_number(12.4, "12.30 ± 2.1"))

    def test_signs(self):
        self.assertEqual(find_number(-3.2, "change −3.2 kg"), "exact")
        self.assertEqual(find_number(-3.2, "body fat decreased by 3.2 kg"), "abs")
        # An en dash between two numbers is a range, not a minus.
        self.assertEqual(find_number(0.61, "SMD 0.43 (0.25–0.61)"), "exact")
        self.assertEqual(find_number(0.25, "SMD 0.43 (0.25–0.61)"), "exact")

    def test_decimal_comma_after_zero(self):
        self.assertEqual(find_number(0.001, "P-value 0,001"), "exact")
        self.assertIsNone(find_number(1, "P-value 0,001"))
        self.assertEqual(find_number(1234, "1,234 participants"), "exact")

    def test_arm_per_row_tables_check_each_arm_against_its_own_row(self):
        # Layout measured 2026-10-03 on doi:10.1080/15502783.2022.2108683.
        tables = [{"caption": "Table 2. Results of lower limb power-related variables.",
                   "columns": ["", "Group", "Before", "After", "Δ"],
                   "rows": [["SJ (cm)", "CrM", "28.8 ± 5.3", "33.3 ± 4.9", "4.5 ± 3.0 (2.6, 6.4)"],
                            ["SJ (cm)", "CON", "32.8 ± 5.3", "36.5 ± 6.3", "3.7 ± 2.1 (2.2, 5.1)"]]}]
        claim = {"evidence_span": "no significant group x time effects (p = 0.449)",
                 "table_provenance": {"caption": "Table 2. — Results of lower limb power-related variables.",
                                      "row": "SJ (cm)", "column": "∆"},
                 "ingredient_arm": "CrM", "control_arm": "CON",
                 "mean_ingredient": 4.5, "sd_ingredient": 3.0, "mean_control": 3.7, "sd_control": 2.1}
        r = verify_claim_numbers(claim, tables=tables)
        self.assertEqual(set(r["source"]), {"mean_ingredient", "sd_ingredient", "mean_control", "sd_control"})
        swapped = {**claim, "mean_control": 4.5}             # the INGREDIENT row's value
        self.assertIn("mean_control", verify_claim_numbers(swapped, tables=tables)["rejected"])

    def test_digits_inside_words_are_not_numbers(self):
        self.assertIsNone(find_number(1, "1RM bench press"))

    def test_claim_verification_sources_and_refusals(self):
        claim = {"evidence_span": "creatine 85.2 ± 9.1 vs placebo 80.0 ± 8.7 kg (p = 0.03)",
                 "mean_ingredient": 85.2, "sd_ingredient": 9.1, "mean_control": 80.0,
                 "sd_control": 8.7, "p_value": 0.03, "p_value_kind": "exact",
                 "n_ingredient": 12, "n_control": 11, "effect_size": 0.9,
                 "ingredient_arm": "CR", "control_arm": "PLA"}
        arms = [{"label": "CR", "n": 12}, {"label": "PLA", "n": 11}]
        r = verify_claim_numbers(claim, s3_arms=arms)
        self.assertEqual(r["source"]["mean_ingredient"], "span")
        self.assertEqual(r["source"]["n_ingredient"], "s3_arm")
        self.assertIn("effect_size", r["rejected"])          # 0.9 is printed nowhere

    def test_bounded_p_is_never_exact(self):
        r = verify_claim_numbers({"evidence_span": "p < 0.05", "p_value": 0.05,
                                  "p_value_kind": "less_than"})
        self.assertIn("p_value", r["rejected"])

    def test_table_row_lookup(self):
        tables = [{"caption": "Table 2. Outcomes after 8 weeks", "columns": ["Outcome", "CR", "PLA"],
                   "rows": [["Bench press 1RM (kg)", "85.2 ± 9.1", "80.0 ± 8.7"]]}]
        claim = {"evidence_span": "greater gains with creatine",
                 "table_provenance": {"caption": "Table 2. Outcomes after 8 weeks",
                                      "row": "Bench press 1RM (kg)", "column": "CR"},
                 "mean_ingredient": 85.2, "sd_control": 8.7}
        r = verify_claim_numbers(claim, tables=tables)
        self.assertEqual(r["source"], {"mean_ingredient": "table", "sd_control": "table"})


BASE = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint"}


class EffectSize(unittest.TestCase):
    def test_arm_stats_hedges_g_and_polarity(self):
        v = {"mean_ingredient": 85.2, "sd_ingredient": 9.1, "n_ingredient": 12,
             "mean_control": 80.0, "sd_control": 8.7, "n_control": 11}
        eff, route = effect_from_claim({**BASE, "effect_unit": "kg"}, v, polarity="higher_better")
        g = me.hedges_g(85.2, 9.1, 12, 80.0, 8.7, 11)
        self.assertEqual(route, "arm_stats")
        self.assertAlmostEqual(eff.smd, g.g)
        self.assertAlmostEqual(eff.md, 5.2)
        self.assertAlmostEqual(eff.md_variance, 9.1 ** 2 / 12 + 8.7 ** 2 / 11)
        lower, _ = effect_from_claim({**BASE, "effect_unit": "min"}, v, polarity="lower_better")
        self.assertAlmostEqual(lower.smd, -g.g)              # higher value is WORSE here

    def test_arm_stats_need_polarity(self):
        v = {k: 1.0 for k in ("mean_ingredient", "mean_control", "sd_ingredient", "sd_control")}
        v.update(n_ingredient=10, n_control=10)
        eff, reason = effect_from_claim(BASE, v, polarity=None)
        self.assertIsNone(eff)
        self.assertIn("polarity", reason)

    def test_reported_smd_ci_uses_favoured_arm_not_printed_sign(self):
        claim = {**BASE, "estimate_kind": "smd", "effect_favours": "ingredient", "ci_level": 0.95}
        v = {"effect_size": -0.43, "ci_low": 0.25, "ci_high": 0.61}
        eff, route = effect_from_claim(claim, v, polarity=None)
        self.assertEqual(route, "reported_smd_ci")
        self.assertAlmostEqual(eff.smd, 0.43)
        se = (0.61 - 0.25) / (2 * me.normal_ppf(0.975))
        self.assertAlmostEqual(eff.smd_variance, se * se)
        against, _ = effect_from_claim({**claim, "effect_favours": "control"}, v, polarity=None)
        self.assertAlmostEqual(against.smd, -0.43)

    def test_unstated_ci_level_falls_back_to_exact_p(self):
        claim = {**BASE, "estimate_kind": "smd", "effect_favours": "ingredient", "ci_level": None}
        eff, route = effect_from_claim(claim, {"effect_size": 0.5, "ci_low": 0.1, "ci_high": 0.9,
                                               "p_value": 0.01}, polarity=None)
        self.assertEqual(route, "reported_smd_p")
        self.assertIn("ci_level_unstated", eff.flags)
        self.assertAlmostEqual(eff.smd_variance, me.se_from_normal_p(0.5, 0.01) ** 2)

    def test_reported_mean_difference_is_md_scale_only(self):
        claim = {**BASE, "estimate_kind": "mean_difference", "effect_favours": "ingredient",
                 "ci_level": 0.95, "effect_unit": "kg"}
        eff, route = effect_from_claim(claim, {"effect_size": 4.4, "ci_low": 1.0, "ci_high": 7.8},
                                       polarity="higher_better")
        self.assertEqual(route, "reported_md_ci")
        self.assertIsNone(eff.smd)
        self.assertEqual(eff.scales, ("md",))
        self.assertAlmostEqual(eff.md, 4.4)

    def test_refusals(self):
        smd = {**BASE, "estimate_kind": "smd", "ci_level": 0.95}
        v = {"effect_size": 0.4, "ci_low": 0.1, "ci_high": 0.7}
        cases = [
            ({**smd, "effect_favours": "neither"}, "sign unknown"),
            ({**smd, "effect_favours": "ingredient", "design_kind": "crossover"}, "d_z"),
            ({**smd, "effect_favours": "ingredient", "design_kind": "cluster"}, "not parallel or crossover"),
            ({**smd, "effect_favours": "ingredient", "contrast": "within_group"}, "ingredient-free"),
            ({**smd, "effect_favours": "ingredient", "estimate_kind": "relative_percent"}, "own scale"),
        ]
        for claim, why in cases:
            with self.subTest(why=why):
                eff, reason = effect_from_claim(claim, v, polarity="higher_better")
                self.assertIsNone(eff)
                self.assertIn(why, reason)

    def test_crossover_arm_stats_are_analysed_as_parallel(self):
        # Cochrane Handbook §23.2.6: conservative (too-wide CI), never over-weighted.
        v = {"mean_ingredient": 85.2, "sd_ingredient": 9.1, "n_ingredient": 12,
             "mean_control": 80.0, "sd_control": 8.7, "n_control": 12}
        eff, route = effect_from_claim({**BASE, "design_kind": "crossover", "effect_unit": "kg"}, v,
                                       polarity="higher_better")
        self.assertEqual(route, "arm_stats")
        self.assertAlmostEqual(eff.smd, me.hedges_g(85.2, 9.1, 12, 80.0, 8.7, 12).g)
        self.assertIn("crossover_as_parallel", eff.flags)

    def test_crossover_paired_mean_difference_is_kept(self):
        claim = {**BASE, "design_kind": "crossover", "estimate_kind": "mean_difference",
                 "effect_favours": "ingredient", "ci_level": 0.95, "effect_unit": "W"}
        eff, route = effect_from_claim(claim, {"effect_size": 30.0, "ci_low": 10.0, "ci_high": 50.0},
                                       polarity="higher_better")
        self.assertEqual(route, "reported_md_ci")
        self.assertIn("crossover_paired_ci", eff.flags)

    def test_percent_arm_values_are_refused(self):
        v = {"mean_ingredient": 75.0, "mean_control": 50.0, "sd_ingredient": 10.0,
             "sd_control": 10.0, "n_ingredient": 10, "n_control": 10}
        eff, reason = effect_from_claim({**BASE, "effect_unit": "%"}, v, polarity="higher_better")
        self.assertIsNone(eff)
        self.assertIn("%", reason)

    def test_unverified_numbers_are_never_used(self):
        claim = {**BASE, "estimate_kind": "smd", "effect_favours": "ingredient", "ci_level": 0.95,
                 "effect_size": 0.4, "ci_low": 0.1, "ci_high": 0.7}
        eff, reason = effect_from_claim(claim, {}, polarity="higher_better")   # nothing verified
        self.assertIsNone(eff)
        self.assertTrue(math.isfinite(len(reason)))


if __name__ == "__main__":
    unittest.main()
