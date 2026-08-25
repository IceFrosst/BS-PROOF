"""Regression tests for the universal negative-effect arm firewall.

These fixtures are hand-written contracts: no model calls, network access, or
ingredient-specific constants are involved.
"""
import unittest

from pipeline.assemble import _resolve_claim_arms, _s7_for_claim


class UniversalNegativeRepairTests(unittest.TestCase):
    def setUp(self):
        self.s3 = {
            "arms": [
                {
                    "label": "Creatine",
                    "target_ingredient_presence": "yes",
                    "role": "administered",
                },
                {
                    "label": "Placebo",
                    "target_ingredient_presence": "no",
                    "role": "administered",
                },
            ]
        }

    def test_arm_keyed_s7_joins_to_named_target(self):
        s7 = {"arms": [
            {"label": "Placebo", "compound_dose_mg": None},
            {"label": "Creatine", "compound_dose_mg": 5000},
        ]}
        row = _s7_for_claim(s7, {"ingredient_arm": "Creatine"}, self.s3)
        self.assertEqual(row["label"], "Creatine")
        self.assertEqual(row["compound_dose_mg"], 5000)

    def test_single_control_row_is_not_projected_as_target_dose(self):
        s7 = {"arms": [{"label": "Placebo", "compound_dose_mg": 5000}]}
        self.assertIsNone(
            _s7_for_claim(s7, {"ingredient_arm": "Creatine"}, self.s3)
        )

    def test_duplicate_normalised_arm_labels_refuse_claim(self):
        s3 = {"arms": [
            {"label": "Creatine", "target_ingredient_presence": "yes",
             "role": "administered"},
            {"label": "CREATINE", "target_ingredient_presence": "yes",
             "role": "administered"},
            {"label": "Placebo", "target_ingredient_presence": "no",
             "role": "administered"},
        ]}
        ok, reason = _resolve_claim_arms(
            {"ingredient_arm": "Creatine", "control_arm": "Placebo",
             "test_kind": "between_arm"},
            s3,
            "creatine",
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "claim_arm_not_unique_in_s3")


if __name__ == "__main__":
    unittest.main()
