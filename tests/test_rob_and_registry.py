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


if __name__ == "__main__":
    unittest.main()
