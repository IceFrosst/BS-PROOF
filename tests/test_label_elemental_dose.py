import unittest
from pathlib import Path
from unittest.mock import patch

import label_adapter


class LabelElementalDoseContractTests(unittest.TestCase):
    def setUp(self):
        self.legacy = {
            "ingredient_vocab_id": "magnesium", "form_vocab_id": "magnesium_glycinate",
            "compound_dose_mg": 200, "is_multi_ingredient": False,
            "confidence": "high", "evidence_spans": [],
        }

    def test_legacy_payload_defaults_elemental_field_to_null(self):
        value = label_adapter._validate(dict(self.legacy))
        self.assertIsNone(value["printed_elemental_dose_mg"])

    def test_declared_elemental_payload_is_valid_and_exclusive(self):
        value = label_adapter._validate({**self.legacy, "compound_dose_mg": None,
                                         "printed_elemental_dose_mg": 200})
        self.assertEqual(value["printed_elemental_dose_mg"], 200)

    def test_invalid_or_contradictory_elemental_dose_fails_closed(self):
        with self.assertRaises(label_adapter.LabelReadError):
            label_adapter._validate({**self.legacy, "printed_elemental_dose_mg": -1})
        with self.assertRaises(label_adapter.LabelReadError):
            label_adapter._validate({**self.legacy, "printed_elemental_dose_mg": float("inf")})
        with self.assertRaises(label_adapter.LabelReadError):
            label_adapter._validate({**self.legacy, "printed_elemental_dose_mg": 200})
        contradictory_row = {**self.legacy, "actives": [{
            "name": "Magnesium", "compound_dose_mg": 200,
            "printed_elemental_dose_mg": 200,
        }]}
        with self.assertRaises(label_adapter.LabelReadError):
            label_adapter._validate(contradictory_row)

    def test_analyze_routes_elemental_and_compound_doses_to_score_boundary(self):
        from scripts import analyze_label

        base = {**self.legacy, "is_supplement_label": True}
        for printed_elemental, expected_dose, expected_basis, expected_range in (
            (200, 200, "elemental_stated", {"low": 200, "high": 200, "basis": "elemental_stated"}),
            (None, 200, "compound", {"low": 28.192, "high": 28.192, "basis": "converted"}),
        ):
            label = {**base, "compound_dose_mg": None if printed_elemental is not None else 200,
                     "printed_elemental_dose_mg": printed_elemental}
            calls = []
            result = {"status": "scored"}
            with (patch("label_adapter.read_label", return_value=label),
                  patch.object(analyze_label.product_score, "score_product", side_effect=lambda *a, **kw: calls.append((a, kw)) or result),
                  patch.object(analyze_label, "census", side_effect=AssertionError("no census")),
                  patch.object(analyze_label, "enqueue", side_effect=AssertionError("no queue"))):
                out = analyze_label.analyze(Path("unused"))
            self.assertEqual(out["product"]["elemental_dose_mg"], expected_range)
            self.assertEqual(calls, [(('magnesium', 'magnesium_glycinate', expected_dose), {"dose_basis": expected_basis})])


if __name__ == "__main__":
    unittest.main()
