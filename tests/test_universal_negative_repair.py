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

    def test_arm_keyed_s7_requires_explicit_administered_role(self):
        s3 = {"arms": [
            {"label": "Creatine", "target_ingredient_presence": "yes", "role": None},
            {"label": "Placebo", "target_ingredient_presence": "no", "role": "administered"},
        ]}
        s7 = {"arms": [{"label": "Creatine", "compound_dose_mg": 5000}]}
        self.assertIsNone(_s7_for_claim(s7, {"ingredient_arm": "Creatine"}, s3))

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
             "outcome_role": "primary", "statistic_provenance": "pairwise",
             "contrast": "vs_ingredient_free"}, s3, "creatine",
            contract_version="v1.24")
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
        self.assertEqual(_resolve_claim_arms(
            claim, factorial, "A", contract_version="v1.24"), (True, "eligible"))
        self.assertIsNone(_ineligible({"S3": {**factorial, "ingredient_isolated": "no"}, "record": {"ingredient": "A"}}))
        unmatched = {"arms": [dict(factorial["arms"][0]), dict(factorial["arms"][1])]}
        unmatched["arms"][1]["active_cointerventions"] = ["C"]
        ok, reason = _resolve_claim_arms(
            claim, unmatched, "A", contract_version="v1.24")
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

    def test_mixed_s3_s5_s7_contract_versions_refuse_before_joining(self):
        extraction = {
            "S3": {"extraction_version": "v1.24"},
            "S5": {"extraction_version": "legacy-v1.23", "claims": []},
            "S7": {"extraction_version": "v1.24"},
            "outcomes": [],
        }
        record = {"_canonical": "mixed", "ingredient": "creatine", "design_rank": 4}
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        self.assertEqual(to_studies(record, extraction, product), [])

    def test_safety_claim_without_matching_s7_does_not_inherit_top_level_form(self):
        extraction = {
            "S3": {"extraction_version": "v1.24", "arms": [
                {"label": "Exposed", "target_ingredient_presence": "yes",
                 "role": "administered", "active_cointerventions": []},
                {"label": "Placebo", "target_ingredient_presence": "no",
                 "role": "administered", "active_cointerventions": []}
            ]},
            "S5": {"extraction_version": "v1.24"},
            "S7": {"extraction_version": "v1.24", "form_vocab_id": "creatine_monohydrate",
                   "arms": [{"label": "Placebo", "form_vocab_id": "creatine_monohydrate"}]},
            "outcomes": [{"outcome_vocab_id": "adverse_events_any", "discarded": False,
                           "claim": {"direction": "harm", "ingredient_arm": "Exposed"}}],
        }
        record = {"_canonical": "safety", "ingredient": "creatine", "design_rank": 6}
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        rows = to_studies(record, extraction, product)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1].form_match, "unspecified")

    def test_nonfinite_effect_size_is_refused(self):
        for value in (float("nan"), float("inf"), float("-inf")):
            claim = self._claim(direction="benefit", effect_size=value,
                                effect_unit="smd", effect_favours="ingredient")
            self.assertEqual(_effect_s(claim, "muscle_strength"),
                             (None, "unparseable_effect_size"))
            null = dict(claim, direction="null_effect")
            effect, route = _effect_s(null, "muscle_strength")
            self.assertIsNone(effect)
            self.assertEqual(route, "inconclusive_unquantified")
            self.assertEqual(Study(id="n", design_rank=4,
                                   direction="null_effect",
                                   effect_route=route).s_value(), 0.0)

    def test_unsupported_equal_contract_versions_refuse(self):
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        record = {"_canonical": "bad-version", "ingredient": "creatine", "design_rank": 6}
        for version in ("bogus", "legacy-evil"):
            extraction = {
                "S3": {"extraction_version": version, "arms": [{
                    "label": "Exposed", "role": "administered",
                    "target_ingredient_presence": "yes"}]},
                "S5": {"extraction_version": version, "claims": []},
                "S7": {"extraction_version": version},
                "outcomes": [{"outcome_vocab_id": "adverse_events_any",
                               "discarded": False,
                               "claim": {"direction": "harm",
                                         "ingredient_arm": "Exposed"}}],
            }
            self.assertEqual(to_studies(record, extraction, product), [])

    def test_safety_harm_must_name_the_target_exposed_arm(self):
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        extraction = {
            "S3": {"extraction_version": "v1.24", "arms": [
                {"label": "Target", "role": "administered",
                 "target_ingredient_presence": "yes"},
                {"label": "Drug X", "role": "administered",
                 "target_ingredient_presence": "no"}]},
            "S5": {"extraction_version": "v1.24", "claims": []},
            "S7": {"extraction_version": "v1.24", "arms": []},
            "outcomes": [{"outcome_vocab_id": "adverse_events_any", "discarded": False,
                           "claim": {"direction": "harm", "ingredient_arm": "Drug X"}}],
        }
        record = {"_canonical": "wrong-harm-arm", "ingredient": "creatine", "design_rank": 6}
        self.assertEqual(to_studies(record, extraction, product), [])

    def test_unversioned_contract_never_enters_legacy_route(self):
        self.assertEqual(
            _resolve_claim_arms({}, None, "ingredient"),
            (False, "extraction_version_missing"))
        record = {"_canonical": "unversioned", "ingredient": "creatine", "design_rank": 4}
        extraction = {
            "S3": {}, "S5": {"claims": []}, "S7": {},
            "outcomes": [{"outcome_vocab_id": "muscle_strength", "discarded": False,
                           "claim": {"direction": "harm"}}],
        }
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        self.assertEqual(to_studies(record, extraction, product), [])

    def test_efficacy_harm_and_reassuring_safety_null_need_counterfactual(self):
        base = {
            "S3": {"extraction_version": "v1.24", "arms": []},
            "S5": {"extraction_version": "v1.24", "claims": []},
            "S7": {"extraction_version": "v1.24", "arms": []},
        }
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        record = {"_canonical": "bad-counterfactual", "ingredient": "creatine", "design_rank": 4}
        for outcome, direction in (("muscle_strength", "harm"),
                                   ("adverse_events_any", "null_effect"),
                                   ("adverse_events_any", "harm")):
            extraction = {**base, "outcomes": [{
                "outcome_vocab_id": outcome, "discarded": False,
                "claim": {"direction": direction, "test_kind": "within_group"},
            }]}
            self.assertEqual(to_studies(record, extraction, product), [])

    def test_safety_harm_observational_route_is_not_efficacy_firewalled(self):
        record = {"_canonical": "obs", "ingredient": "creatine", "design_rank": 6}
        extraction = {
            "S3": {"extraction_version": "legacy-v1.23", "arms": [{
                "label": "Exposed", "role": "administered",
                "target_ingredient_presence": "yes"}]},
            "S5": {"extraction_version": "legacy-v1.23", "claims": []},
            "S7": {"extraction_version": "legacy-v1.23"},
            "outcomes": [{"outcome_vocab_id": "adverse_events_any", "discarded": False,
                           "claim": {"direction": "harm", "magnitude": None,
                                     "ingredient_arm": "Exposed"}}]}
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {}}
        rows = to_studies(record, extraction, product)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1].s_value(), -1.0)

    def test_outcome_role_is_carried_from_exact_claim_not_rejoined_by_id(self):
        s3 = {"extraction_version": "legacy-v1.23", "comparator": "ingredient_free",
              "ingredient_isolated": "yes", "arms": self.s3["arms"]}
        extraction = {"S3": s3, "S7": {"extraction_version": "legacy-v1.23"},
                      "S5": {"extraction_version": "legacy-v1.23"},
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

    def test_incident_ledger_reconciles_without_asserting_a_corrected_score(self):
        ledger = json.loads((Path(__file__).parents[1] / "docs" / "history" /
                             "2026-08-25-negative-contributors.v1.json").read_text())
        rows = ledger["adjudications"]
        self.assertEqual(ledger["source_totals"],
                         {"studies": 32, "contributions": 43, "points": -95.73})
        self.assertEqual(len(rows), 32)
        self.assertEqual(len({row["study_id"] for row in rows}), 32)
        self.assertEqual(sum(len(row["original_contributions"]) for row in rows), 43)
        self.assertTrue(all(not row["corrected_score_asserted"] for row in rows))
        self.assertEqual(sum(row["action"] == "exclude_scope" for row in rows), 2)

    def test_v124_schemas_require_contract_and_nullable_fields(self):
        try:
            from jsonschema import Draft7Validator
        except ImportError:
            self.skipTest("jsonschema unavailable")
        schemas = {}
        for name in ("s3_study.json", "s5_conclusion.json", "s7_form.json"):
            schema = json.loads((Path(__file__).parents[1] / "schemas" / name).read_text())
            schemas[name] = schema
            self.assertIn("extraction_version", schema["required"])
            self.assertIn("v1.24", schema["properties"]["extraction_version"]["enum"])
        self.assertIn("n_analysed", schemas["s3_study.json"]["required"])
        self.assertIn("claims", schemas["s5_conclusion.json"]["required"])
        self.assertTrue(Draft7Validator(schemas["s5_conclusion.json"]).is_valid(
            {"extraction_version": "v1.24", "claims": []}))
        self.assertFalse(Draft7Validator(schemas["s5_conclusion.json"]).is_valid(
            {"extraction_version": "v1.24"}))
        self.assertFalse(Draft7Validator(schemas["s3_study.json"]).is_valid(
            {"extraction_version": "v1.24", "arms": []}))
        self.assertFalse(Draft7Validator(schemas["s7_form.json"]).is_valid(
            {"extraction_version": "v1.24", "arms": []}))
        import claude_adapter
        import grok_adapter
        self.assertEqual(claude_adapter.PROMPT_VERSION, "v1.26")
        shared = (Path(__file__).parents[1] / "prompts" / "_shared.md").read_text()
        self.assertIn("schema object directly", shared)
        self.assertIn("Never stringify", shared)
        self.assertNotIn("StructuredOutput", shared)
        for _agent, (_tier, _schema, prompt_f) in claude_adapter.AGENTS.items():
            neutral = claude_adapter._system_prompt(prompt_f)
            claude = claude_adapter._claude_system_prompt(prompt_f)
            self.assertNotIn("StructuredOutput", neutral)
            self.assertEqual(claude.count("CLAUDE SCHEMA RETURN CHANNEL"), 1)
            self.assertIn("DIRECT argument object", claude)
            self.assertEqual(grok_adapter._system_prompt(prompt_f), neutral)


if __name__ == "__main__":
    unittest.main()
