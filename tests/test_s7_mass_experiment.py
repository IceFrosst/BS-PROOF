import unittest

from scripts.s7_mass_experiment import _arm_drift


class S7MassDriftGuard(unittest.TestCase):
    def test_identical_arms_have_no_drift(self):
        rows = [{"label": "Creatine", "form_vocab_id": "creatine_monohydrate",
                 "dose_per_kg_mg": 100, "elemental_dose_mg": None,
                 "compound_dose_mg": None, "dose_basis": "compound_only"},
                {"label": "Placebo", "form_vocab_id": None,
                 "dose_per_kg_mg": None, "elemental_dose_mg": None,
                 "compound_dose_mg": None, "dose_basis": None}]
        self.assertEqual([], _arm_drift(rows, [dict(r) for r in rows]))

    def test_renamed_arm_is_structural_drift(self):
        old = [{"label": "Creatine"}, {"label": "Placebo"}]
        new = [{"label": "CR"}, {"label": "Placebo"}]
        self.assertTrue(any(x[0] == "__structure__" for x in _arm_drift(old, new)))

    def test_added_and_removed_arms_are_structural_drift(self):
        base = [{"label": "Creatine"}, {"label": "Placebo"}]
        self.assertTrue(_arm_drift(base, base + [{"label": "Other"}]))
        self.assertTrue(_arm_drift(base, base[:1]))

    def test_duplicate_labels_do_not_collapse_silently(self):
        old = [{"label": "Creatine"}, {"label": "Placebo"}]
        new = [{"label": "Creatine"}, {"label": "Creatine"},
               {"label": "Placebo"}]
        drift = _arm_drift(old, new)
        structural = next(x for x in drift if x[0] == "__structure__")
        self.assertEqual(["Creatine", "Placebo"], structural[2])
        self.assertEqual(["Creatine", "Creatine", "Placebo"], structural[3])


if __name__ == "__main__":
    unittest.main()
