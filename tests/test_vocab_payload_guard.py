"""Vocabulary keys that reach a model's payload are part of its cache key.
MEASURED 2026-10-31: adding `counter_ion` to vocab/form.json (read only by
pipeline/eligibility.py) and `exclude_measures` to vocab/outcome.json (read only
by pipeline/pool.py) changed the S7 and S6B payloads on every study: 490 live
calls in a run expected to need 60-80, about 5 hours of quota pauses. A new key
for code alone must be stripped from the payload, or the re-run accepted."""
import unittest

from pipeline import vocab
from pipeline.showcase import restrict_outcome_vocab


class PayloadVocabulary(unittest.TestCase):
    def test_keys_sent_to_s6b(self):
        sent = {k for o in restrict_outcome_vocab(vocab.load("outcome")["outcomes"], None) for k in o}
        self.assertEqual(sorted(sent), ['definition', 'exclude_measures', 'excludes', 'id', 'includes', 'kind', 'label', 'mcid', 'measure_direction', 'measure_hierarchy', 'polarity', 'polarity_note', 'search_terms'],
                         "an outcome key changes every S6B cache key: see this file's docstring")

    def test_keys_sent_to_s7(self):
        sent = {k for f in vocab.forms_for("creatine") for k in f}
        self.assertEqual(sorted(sent), ['active_mass_g_mol', 'aliases', 'conversion_safe', 'counter_ion', 'formula', 'hydration_note', 'id', 'label', 'molar_mass_g_mol', 'salt_family'],
                         "a form key changes every S7 cache key: see this file's docstring")


if __name__ == "__main__":
    unittest.main()
