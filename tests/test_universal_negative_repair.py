"""Table-driven, offline contracts for universal negative-effect handling."""
import json
import unittest
from pathlib import Path

from pipeline.assemble import (
    _claim_equivalence_valid, _effect_s, _ineligible, _resolve_claim_arms,
    _s7_for_claim, _one_study_one_vote, to_studies,
)
from pipeline.scoring import Study


class UniversalNegativeRepairTests(unittest.TestCase):
    def setUp(self):
        self.s3 = {
            "arms": [
                {"label": "Creatine", "target_ingredient_presence": "yes",
                 "role": "administered", "active_cointerventions": []},
                {"label": "Placebo", "target_ingredient_presence": "no",
                 "role": "administered", "active_cointerventions": []},
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
        self.assertIsNone(_s7_for_claim(s7, {"ingredient_arm": "Creatine"}, self.s3))

    def test_modern_top_level_s7_and_missing_provenance_refuse(self):
        modern_s7 = {"extraction_version": "v1.24", "compound_dose_mg": 5000}
        self.assertIsNone(_s7_for_claim(modern_s7, {"ingredient_arm": "Creatine"}, self.s3, modern=True))
        ok, reason = _resolve_claim_arms(
            {"ingredient_arm": "Creatine", "control_arm": "Placebo",
             "test_kind": "between_arm", "outcome_role": "primary",
             "statistic_provenance": "pairwise"}, self.s3,
            "creatine", contract_version="v1.24")
        self.assertFalse(ok)
        self.assertEqual(reason, "modern_provenance_missing")

    def test_duplicate_normalised_arm_labels_refuse_claim(self):
        s3 = {"arms": [
            {"label": "Creatine", "target_ingredient_presence": "yes", "role": "administered", "active_cointerventions": []},
            {"label": "CREATINE", "target_ingredient_presence": "yes", "role": "administered", "active_cointerventions": []},
            {"label": "Placebo", "target_ingredient_presence": "no", "role": "administered", "active_cointerventions": []},
        ]}
        ok, reason = _resolve_claim_arms(
            {"ingredient_arm": "Creatine", "control_arm": "Placebo", "test_kind": "between_arm",
             "outcome_role": "primary", "statistic_provenance": "pairwise"}, s3, "creatine")
        self.assertFalse(ok)
        self.assertEqual(reason, "claim_arm_not_unique_in_s3")

    def _claim(self, **kw):
        out = {"ingredient_arm": "Creatine", "control_arm": "Placebo",
               "test_kind": "between_arm", "outcome_role": "primary",
               "statistic_provenance": "pairwise", "contrast": "vs_ingredient_free"}
        out.update(kw)
        return out

    def test_factorial_background_isolated_but_unmatched_refuses(self):
        factorial = {"arms": [
            {"label": "A+B", "target_ingredient_presence": "yes", "role": "administered", "active_cointerventions": ["B"]},
            {"label": "B", "target_ingredient_presence": "no", "role": "administered", "active_cointerventions": ["B"]},
        ]}
        claim = self._claim(ingredient_arm="A+B", control_arm="B")
        self.assertEqual(_resolve_claim_arms(claim, factorial, "A"), (True, "eligible"))
        self.assertIsNone(_ineligible({"S3": {**factorial, "ingredient_isolated": "no"}, "record": {"ingredient": "A"}}))
        unmatched = {"arms": [dict(factorial["arms"][0]), dict(factorial["arms"][1])]}
        unmatched["arms"][1]["active_cointerventions"] = ["C"]
        ok, reason = _resolve_claim_arms(claim, unmatched, "A")
        self.assertFalse(ok)
        self.assertEqual(reason, "unmatched_active_cointerventions")

    def test_group_time_direction_kept_but_F_magnitude_refused(self):
        benefit = self._claim(test_kind="group_by_time", statistic="F(1, 30)",
                               statistic_provenance="group x time interaction",
                               direction="benefit", effect_size=22, effect_unit="F",
                               effect_favours="ingredient")
        measured, route = _effect_s(benefit, "muscle_strength")
        self.assertIsNone(measured)
        self.assertEqual(route, "omnibus_magnitude_refused")
        null = dict(benefit, direction="null_effect", effect_favours="neither")
        self.assertEqual(_effect_s(null, "muscle_strength"), (None, "inconclusive_unquantified"))

    def test_unsigned_nulls_are_inconclusive_before_subthreshold_rescue(self):
        for favours, value in (("neither", 0.05), (None, 0.05), ("neither", 0.0)):
            claim = self._claim(direction="null_effect", effect_size=value,
                                 effect_unit="smd", effect_favours=favours)
            self.assertEqual(_effect_s(claim, "muscle_strength"),
                             (None, "inconclusive_unquantified"))
        signed_zero = self._claim(direction="null_effect", effect_size=0.0,
                                  effect_unit="smd", effect_favours="ingredient")
        self.assertLess(_effect_s(signed_zero, "muscle_strength")[0], 0)

    def test_typed_equivalence_basis_is_the_only_null_rescue(self):
        valid = self._claim(direction="null_effect", effect_size=0.05,
                            effect_unit="smd", effect_favours="neither",
                            null_precision=0.2, ci_low=-0.1, ci_high=0.1,
                            equivalence_basis={"method": "equivalence", "conclusion": "successful",
                                               "margin_value": 0.2, "margin_unit": "smd"})
        self.assertTrue(_claim_equivalence_valid(valid))
        self.assertEqual(_effect_s(valid, "muscle_strength"), (None, "no_effect_size"))
        self.assertFalse(_claim_equivalence_valid(dict(valid, equivalence_basis="authors said equivalent")))
        self.assertFalse(_claim_equivalence_valid(dict(valid, ci_high=0.3)))
        bad_unit = dict(valid, equivalence_basis={**valid["equivalence_basis"], "margin_unit": "percent"})
        self.assertFalse(_claim_equivalence_valid(bad_unit))

    def test_safety_harm_observational_route_is_not_efficacy_firewalled(self):
        record = {"_canonical": "obs", "ingredient": "creatine", "design_rank": 6}
        extraction = {"S3": None, "S7": None,
                      "outcomes": [{"outcome_vocab_id": "adverse_events_any", "discarded": False,
                                     "claim": {"direction": "harm", "magnitude": None}}]}
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        rows = to_studies(record, extraction, product)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1].s_value(), -1.0)

    def test_outcome_role_is_carried_from_exact_claim_not_rejoined_by_id(self):
        s3 = {"comparator": "ingredient_free", "ingredient_isolated": "yes",
              "arms": self.s3["arms"]}
        extraction = {"S3": s3, "S7": None, "S5": {"extraction_version": "legacy-v1.23"},
                      "outcomes": [
                          {"outcome_vocab_id": "muscle_strength", "discarded": False,
                           "claim": self._claim(direction="benefit", outcome_role="secondary")},
                          {"outcome_vocab_id": "muscle_strength", "discarded": False,
                           "claim": self._claim(direction="null_effect", outcome_role="primary")},
                      ]}
        record = {"_canonical": "same", "ingredient": "creatine", "design_rank": 4}
        studies = to_studies(record, extraction,
                              {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate", "population": {}})
        self.assertEqual([s.outcome_role for _, s, _, _ in studies], ["secondary", "primary"])

    def test_exact_incident_run_id_is_invalid_in_status_registry(self):
        statuses = json.loads((Path(__file__).parents[1] / "reports" / "run_statuses.json").read_text())
        full_id = "20260825_072759_creatine_creatine-monohydrate_claude-sr-ft-top5-suppl"
        self.assertEqual(statuses["runs"][full_id]["status"], "invalid")
        self.assertFalse(statuses["runs"][full_id]["public_claims_allowed"])

    def test_v124_schemas_require_contract_and_nullable_fields(self):
        try:
            from jsonschema import Draft7Validator
        except ImportError:
            self.skipTest("jsonschema unavailable")
        for name in ("s3_study.json", "s5_conclusion.json", "s7_form.json"):
            schema = json.loads((Path(__file__).parents[1] / "schemas" / name).read_text())
            self.assertIn("extraction_version", schema["required"])
            self.assertIn("v1.24", schema["properties"]["extraction_version"]["enum"])


if __name__ == "__main__":
    unittest.main()
