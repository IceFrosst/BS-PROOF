"""S7's dose checked against its own quote (pipeline/dose._span_refusal, 2026-11-04).
Every case is a reading found in the extraction cache."""
import unittest

from pipeline.dose import study_dose

VD = "vitamin_d3_cholecalciferol"


class DoseSpanCheck(unittest.TestCase):
    def test_micrograms_read_as_mg_are_refused(self):
        s7 = {"form_vocab_id": VD, "elemental_dose_mg": 500, "compound_dose_mg": 500,
              "dose_basis": "elemental_stated", "dose_frequency_per_day": None,
              "evidence_span": "loading dose of 100 000 IU (2500 ug) vitamin D3 followed by "
                               "20 000 IU (500 ug)/week"}
        self.assertEqual(study_dose("vitamin_d", s7)["dose_basis"], "dose_unit_mismatch")

    def test_less_than_daily_schedules_are_refused(self):
        every_two_weeks = {"form_vocab_id": VD, "elemental_dose_mg": 1.25, "compound_dose_mg": 1.25,
                           "dose_basis": "converted", "dose_frequency_per_day": 0.0714,
                           "evidence_span": "consumed 50,000 IU vitamin D3 or placebo once every 2 weeks."}
        three_a_week = {"form_vocab_id": "creatine_monohydrate", "compound_dose_mg": 5000,
                        "dose_basis": "compound_only", "dose_frequency_per_day": 1,
                        "evidence_span": "received 5 g creatine; loading phase: 7 g creatine 3x/wk"}
        self.assertEqual(study_dose("vitamin_d", every_two_weeks)["dose_low_mg"], None)
        self.assertEqual(study_dose("creatine", three_a_week)["dose_basis"], "dose_not_daily")

    def test_a_trial_length_is_not_a_schedule(self):
        s7 = {"form_vocab_id": VD, "elemental_dose_mg": 0.03, "dose_basis": "elemental_stated",
              "dose_frequency_per_day": 1,
              "evidence_span": "Participants received either 1,200 IU colecalciferol during 6 months"}
        self.assertEqual(study_dose("vitamin_d", s7)["dose_low_mg"], 0.03)
        daily = {"form_vocab_id": VD, "elemental_dose_mg": 0.05, "dose_basis": "elemental_stated",
                 "evidence_span": "2000 IU/d of vitamin D3 for 12 weeks"}
        self.assertEqual(study_dose("vitamin_d", daily)["dose_low_mg"], 0.05)

    def test_a_copied_per_kg_value_uses_the_stated_mass(self):
        s7 = {"form_vocab_id": "creatine_monohydrate", "elemental_dose_mg": None,
              "compound_dose_mg": 300, "dose_per_kg_mg": 300, "mean_body_mass_kg": 80.5,
              "dose_basis": "compound_only", "evidence_span": "0.3 g/kg/day creatine monohydrate"}
        d = study_dose("creatine", s7)
        self.assertAlmostEqual(d["dose_low_mg"], 300 * 80.5 * 0.879, delta=50)
