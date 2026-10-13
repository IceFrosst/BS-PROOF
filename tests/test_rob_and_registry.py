"""RoB semantics and the registry 'published but unlinked' rule (founder 2026-10-12)."""
import unittest

from pipeline.pool import rob_status
from pipeline.registry_bias import registry_check


class Rob(unittest.TestCase):
    def test_undescribed_method_is_some_concerns_not_high(self):
        self.assertEqual(rob_status({"item1_randomisation_method": 0, "item2_double_blind_placebo": 1}), "unclear")
        self.assertEqual(rob_status({"item1_randomisation_method": 1, "item2_double_blind_placebo": 1,
                                     "item5_attrition_ok": 0}), "unclear")

    def test_missing_blinding_is_high_and_full_marks_low(self):
        self.assertEqual(rob_status({"item1_randomisation_method": 1, "item2_double_blind_placebo": 0}), "high")
        self.assertEqual(rob_status({"item1_randomisation_method": 1, "item2_double_blind_placebo": 1}), "low")
        self.assertEqual(rob_status(None), "unclear")


def rec(nct):
    return {"protocolSection": {
        "identificationModule": {"nctId": nct},
        "designModule": {"studyType": "INTERVENTIONAL"},
        "armsInterventionsModule": {"interventions": [{"name": "Creatine monohydrate"}]},
        "outcomesModule": {"primaryOutcomes": [{"measure": "muscle strength"}]},
        "statusModule": {"overallStatus": "COMPLETED", "completionDateStruct": {"date": "2018-01"}}},
        "hasResults": False}


class Registry(unittest.TestCase):
    def test_a_trial_cited_by_a_paper_is_published_unlinked(self):
        r = registry_check([rec("NCT1"), rec("NCT2")], "creatine", ["strength"], set(), published={"nct2"})
        self.assertNotIn("NCT2", r["unpublished"])
        self.assertEqual(r["published_unlinked"], ["NCT2"])


    def test_a_patient_trial_is_off_target_not_unpublished(self):
        patient = rec("NCT3")
        patient["protocolSection"]["eligibilityModule"] = {"healthyVolunteers": False}
        unknown = rec("NCT4")                                   # no eligibility field: still counted
        r = registry_check([patient, unknown], "creatine", ["strength"], set())
        self.assertEqual((r["off_target_population"], r["unpublished"]), (["NCT3"], ["NCT4"]))


class SpanGlued(unittest.TestCase):
    def test_a_decimal_glued_to_letters_is_found_an_integer_is_not(self):
        from pipeline.span_check import find_number
        self.assertEqual(find_number(33.90, "Grip (kg) PRE33.90 (9.73)33.59"), "exact")
        self.assertEqual(find_number(33.59, "Grip (kg) PRE33.90 (9.73)33.59"), "exact")
        self.assertIsNone(find_number(2, "VO2max improved"))


class S4FullText(unittest.TestCase):
    def test_s4_gets_the_whole_paper_others_are_fitted(self):
        from bsproof.worker_payload import _payload
        rec = {"_canonical": "x", "ingredient": "creatine", "title": "t", "abstract": "a"}
        text = "METHODS double-blind " + "x" * 40000 + " RESULTS"
        self.assertEqual(_payload("S4", rec, text, None, None)["text"], text)
        self.assertLess(len(_payload("S7", rec, text, None, None)["text"]), len(text))


if __name__ == "__main__":
    unittest.main()
