"""tests/golden_vocab_parity.json is the Python truth the TS ports are pinned to
(tests/vocab-parity.test.ts). If Python changes, regenerate the golden on purpose."""
import json
import unittest
from pathlib import Path

from pipeline import vocab
from pipeline.dose import dose_match_for

GOLDEN = json.loads((Path(__file__).parent / "golden_vocab_parity.json").read_text())


class VocabGoldens(unittest.TestCase):
    def test_elemental(self):
        for c in GOLDEN["elemental"]:
            self.assertEqual(vocab.elemental_dose_range_mg(*c["args"]), c["expect"], c["args"])

    def test_dose_match(self):
        for c in GOLDEN["dose_match"]:
            low, high, band = c["args"]
            self.assertEqual(dose_match_for(low, high, band), c["expect"], c["args"])


if __name__ == "__main__":
    unittest.main()
