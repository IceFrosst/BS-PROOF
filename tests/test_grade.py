"""Evidence method v2: GRADE certainty and letter grades (pipeline/grade.py)."""
import unittest

from pipeline.grade import RULES, TABLE, benefit, certainty, egger_test, grade
from pipeline.pool import OutcomePool


def st(g=0.4, var=0.04, n=200, rob="low", form="exact", pop="exact", design=4, dose="in_band",
       reviewed=True):
    return {"g": g, "g_variance": var, "n": n, "rob": rob, "form_match": form,
            "pop_match": pop, "design_rank": design, "dose_match": dose, "reviewed": reviewed}


def make_pool(studies, estimate=0.5, ci=(0.3, 0.7), i2=0.0, tau2=0.0):
    p = OutcomePool("muscle_strength")
    p.studies, p.k = studies, len(studies)
    p.smd = {"estimate": estimate, "ci": ci, "i2": i2, "tau2": tau2, "k": len(studies)}
    return p


CLEAN = [st() for _ in range(3)]          # 600 participants, low RoB, exact form


class Benefit(unittest.TestCase):
    def test_categories(self):
        m = 0.2
        self.assertEqual(benefit(0.5, (0.3, 0.7), m), "large")
        self.assertEqual(benefit(0.25, (0.1, 0.4), m), "meaningful")
        self.assertEqual(benefit(0.1, (0.02, 0.18), m), "small")
        self.assertEqual(benefit(0.0, (-0.1, 0.1), m), "none")
        self.assertEqual(benefit(-0.5, (-0.8, -0.3), m), "harm")

    def test_too_wide_for_any_category_is_inconclusive(self):
        self.assertEqual(benefit(0.5, (-0.1, 1.1), 0.2), "inconclusive")     # big but crosses 0
        self.assertEqual(benefit(0.0, (-0.6, 0.6), 0.2), "inconclusive")     # could be harm


class CertaintyDomains(unittest.TestCase):
    def test_clean_randomised_evidence_is_high(self):
        c = certainty(make_pool(CLEAN), 0.2)
        self.assertEqual((c.level, c.downgrades), (4, {}))

    def test_risk_of_bias(self):
        unclear = certainty(make_pool([st(rob="unclear") for _ in range(3)]), 0.2)
        self.assertEqual(unclear.downgrades["risk_of_bias"][0], 1)
        high = certainty(make_pool([st(rob="high") for _ in range(3)]), 0.2)
        self.assertEqual(high.downgrades["risk_of_bias"][0], 2)

    def test_inconsistency(self):
        self.assertEqual(certainty(make_pool(CLEAN, i2=0.6), 0.2).downgrades["inconsistency"][0], 1)
        self.assertEqual(certainty(make_pool(CLEAN, i2=0.8), 0.2).downgrades["inconsistency"][0], 2)
        two = certainty(make_pool(CLEAN[:2], i2=0.9), 0.2)
        self.assertNotIn("inconsistency", two.downgrades)
        self.assertTrue(any("inconsistency" in x for x in two.not_assessed))

    def test_imprecision(self):
        crosses_zero = certainty(make_pool(CLEAN, estimate=0.15, ci=(-0.05, 0.35)), 0.2)
        self.assertEqual(crosses_zero.downgrades["imprecision"][0], 1)
        spans_both = certainty(make_pool(CLEAN, estimate=0.0, ci=(-0.5, 0.5)), 0.2)
        self.assertEqual(spans_both.downgrades["imprecision"][0], 2)
        small_n = certainty(make_pool([st(n=40) for _ in range(3)]), 0.2)
        self.assertIn("optimal information size", small_n.downgrades["imprecision"][1])

    def test_indirectness_and_non_randomised_start(self):
        other_form = certainty(make_pool([st(form="different") for _ in range(3)]), 0.2)
        self.assertEqual(other_form.downgrades["indirectness"][0], 1)
        adjacent = certainty(make_pool([st(pop="adjacent") for _ in range(3)]), 0.2)
        self.assertNotIn("indirectness", adjacent.downgrades)
        self.assertTrue(any(x.startswith("population:") for x in adjacent.not_assessed))
        observational = certainty(make_pool([st(design=6) for _ in range(3)]), 0.2)
        self.assertEqual(observational.level, 2)

    def test_dose_indirectness(self):
        off = certainty(make_pool([st(dose="below_50") for _ in range(3)]), 0.2)
        self.assertEqual(off.downgrades["indirectness"][0], 1)
        both = certainty(make_pool([st(dose="above_200", form="different") for _ in range(3)]), 0.2)
        self.assertEqual(both.downgrades["indirectness"][0], 2)
        unknown = certainty(make_pool([st(dose="unspecified") for _ in range(3)]), 0.2)
        self.assertNotIn("indirectness", unknown.downgrades)
        self.assertTrue(any(x.startswith("dose:") for x in unknown.not_assessed))
        no_product = certainty(make_pool([st(dose=None) for _ in range(3)]), 0.2)
        self.assertTrue(any("no product dose" in x for x in no_product.not_assessed))

    def test_single_extraction_is_reported_not_downgraded(self):
        c = certainty(make_pool([st(reviewed=False) for _ in range(3)]), 0.2)
        self.assertEqual(c.level, 4)
        self.assertTrue(any("3 of 3 effects single-extracted" in x for x in c.not_assessed))

    def test_publication_bias_needs_ten_trials(self):
        few = certainty(make_pool(CLEAN), 0.2)
        self.assertTrue(any("publication bias" in x for x in few.not_assessed))
        reg = {"registered": 12, "in_corpus": 4, "unpublished": ["NCT1", "NCT2"], "upper_bound": True}
        g = grade(make_pool(CLEAN), registry=reg)                    # 2 missing < 3 pooled
        self.assertEqual(g.certainty.level, 4)
        self.assertTrue(any(x.startswith("registry: 2 of 12") for x in g.certainty.not_assessed))
        reg3 = {**reg, "unpublished": ["NCT1", "NCT2", "NCT3"]}      # 3 missing >= 3 pooled
        g3 = grade(make_pool(CLEAN), registry=reg3)
        self.assertEqual((g3.certainty.level, g3.certainty.downgrades["publication_bias"][0]), (3, 1))
        # Small trials with big effects, big trials with small ones: asymmetric.
        skewed = [st(g=1.2 - 0.1 * i, var=0.30 - 0.025 * i, n=60 + 40 * i) for i in range(11)]
        c = certainty(make_pool(skewed, estimate=0.6, ci=(0.4, 0.8)), 0.2)
        self.assertIn("publication_bias", c.downgrades)

    def test_egger_on_symmetric_data(self):
        effects = [0.4, 0.5, 0.3, 0.45, 0.35, 0.4, 0.42, 0.38]
        variances = [0.04, 0.02, 0.06, 0.03, 0.05, 0.01, 0.025, 0.035]
        intercept, _t = egger_test(effects, variances)
        self.assertLess(abs(intercept), 1.0)
        self.assertIsNone(egger_test([0.1, 0.2], [0.01, 0.02]))


class Letters(unittest.TestCase):
    def test_table_is_the_approved_one(self):
        self.assertEqual(TABLE["large"][4], "A+")
        self.assertEqual(TABLE["meaningful"][3], "B+")
        self.assertEqual(TABLE["none"][4], "F")
        self.assertTrue(all(row[1] == "I" for row in TABLE.values()))   # Very low is always I

    def test_grade_end_to_end_and_default_threshold_flag(self):
        g = grade(make_pool(CLEAN, estimate=0.5, ci=(0.3, 0.7)))
        self.assertEqual((g.letter, g.benefit, g.certainty.label), ("A+", "large", "High"))
        self.assertIn("statistical convention", g.threshold_source)
        self.assertEqual(g.threshold, RULES["default_mcid_smd"])

    def test_an_approved_mcid_is_used(self):
        g = grade(make_pool(CLEAN, estimate=0.5, ci=(0.3, 0.7)),
                  {"smd": 0.4, "source": "anchor study X", "approved": True})
        self.assertEqual((g.threshold, g.benefit, g.threshold_source), (0.4, "meaningful", "anchor study X"))

    def test_a_proposed_mcid_is_ignored_until_approved(self):
        g = grade(make_pool(CLEAN, estimate=0.5, ci=(0.3, 0.7)),
                  {"smd": 0.4, "source": "anchor study X", "approved": False})
        self.assertEqual(g.threshold, RULES["default_mcid_smd"])
        self.assertIn("no approved MCID", g.threshold_source)

    def test_vocab_mcids_are_cited_and_explicitly_approved_or_not(self):
        from pipeline import vocab
        mcids = {o["id"]: o["mcid"] for o in vocab.load("outcome")["outcomes"] if "mcid" in o}
        self.assertIn("muscle_strength", mcids)
        for oid, m in mcids.items():
            self.assertTrue(m["source"], oid)
            self.assertIn(m["tier"], (1, 2, 3, 4), oid)
            self.assertIsInstance(m["approved"], bool, f"{oid}: approval is an explicit founder decision")

    def test_threshold_sensitivity_is_flagged(self):
        g = grade(make_pool(CLEAN, estimate=0.3, ci=(0.25, 0.35)))   # meaningful at 0.2, large at 0.1
        self.assertTrue(g.threshold_sensitive)
        self.assertEqual(g.letters_at["half"], "A+")

    def test_no_data_is_I_not_F(self):
        empty = OutcomePool("lean_body_mass")
        g = grade(empty)
        self.assertEqual((g.letter, g.benefit), ("I", "no data"))

    def test_harm_is_marked(self):
        g = grade(make_pool(CLEAN, estimate=-0.5, ci=(-0.7, -0.3)))
        self.assertEqual((g.letter, g.harm), ("F", True))


if __name__ == "__main__":
    unittest.main()
