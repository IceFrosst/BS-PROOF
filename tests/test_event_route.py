"""The yes/no route (pipeline/effect_size._event_effect, founder 2026-11-03)
and the benchmark fixes that came with vitamin C."""
import math
import unittest

from pipeline.effect_size import effect_from_claim
from pipeline.benchmark import check_row, compare, verdicts

CLAIM = {"contrast": "vs_ingredient_free", "design_kind": "parallel"}
COUNTS = {"events_ingredient": 20, "n_ingredient": 100, "events_control": 40, "n_control": 100}


def effect(v=COUNTS, polarity="lower_better", **claim):
    return effect_from_claim({**CLAIM, **claim}, v, polarity=polarity)


class EventRoute(unittest.TestCase):
    def test_fewer_events_on_a_lower_is_better_outcome_is_a_benefit(self):
        eff, route = effect()
        self.assertEqual(route, "event_counts")
        log_or = math.log((20 * 60) / (80 * 40))
        c = math.sqrt(3) / math.pi
        self.assertAlmostEqual(c, 0.5513, places=4)                # Handbook v5.1 §9.4.6
        self.assertAlmostEqual(eff.smd, -log_or * c)
        self.assertGreater(eff.smd, 0)
        self.assertAlmostEqual(eff.smd_variance, (1 / 20 + 1 / 80 + 1 / 40 + 1 / 60) * c ** 2)
        self.assertIn("or_to_smd", eff.flags)
        self.assertIsNone(eff.md)

    def test_more_events_on_a_higher_is_better_outcome_is_a_benefit(self):
        self.assertGreater(effect({**COUNTS, "events_ingredient": 60}, "higher_better")[0].smd, 0)

    def test_equal_risk_is_zero(self):
        self.assertAlmostEqual(effect({**COUNTS, "events_ingredient": 40})[0].smd, 0.0)

    def test_the_risk_ratio_travels_unoriented(self):
        eff, _ = effect()
        self.assertAlmostEqual(math.exp(eff.log_rr), 0.5)
        self.assertAlmostEqual(eff.log_rr_variance, 1 / 20 - 1 / 100 + 1 / 40 - 1 / 100)

    def test_a_zero_cell_gets_the_correction(self):
        eff, _ = effect({**COUNTS, "events_ingredient": 0})
        self.assertIn("continuity_correction", eff.flags)
        self.assertAlmostEqual(eff.log_rr, math.log((0.5 / 101) / (40.5 / 101)))

    def test_no_information_is_refused_with_a_reason(self):
        for v in ({**COUNTS, "events_ingredient": 0, "events_control": 0},
                  {**COUNTS, "events_ingredient": 100, "events_control": 100}):
            eff, why = effect(v)
            self.assertIsNone(eff)
            self.assertIn("no difference to measure", why)

    def test_episode_counts_above_the_arm_size_are_refused(self):
        eff, why = effect({**COUNTS, "events_ingredient": 130})
        self.assertIsNone(eff)
        self.assertIn("episodes", why)

    def test_crossover_and_missing_polarity_are_refused(self):
        self.assertIn("crossover", effect(design_kind="crossover")[1])
        self.assertIn("polarity", effect(polarity=None)[1])

    def test_a_printed_risk_ratio_does_not_block_the_counts(self):
        self.assertEqual(effect(estimate_kind="ratio")[1], "event_counts")

    def test_a_ratio_without_counts_is_still_refused(self):
        self.assertIn("own scale", effect({"effect_size": 0.5}, estimate_kind="ratio")[1])

    def test_counts_missing_an_arm_size_take_no_route(self):
        self.assertIsNone(effect({k: v for k, v in COUNTS.items() if k != "n_control"})[0])

    def test_arm_means_stay_the_first_choice(self):
        means = {"mean_ingredient": 5.0, "mean_control": 4.0, "sd_ingredient": 1.0, "sd_control": 1.0,
                 "n_ingredient": 100, "n_control": 100, "events_ingredient": 20, "events_control": 40}
        self.assertEqual(effect(means, estimand="endpoint")[1], "arm_stats")


class SpanAndReview(unittest.TestCase):
    def test_counts_are_verified_against_the_quote(self):
        from pipeline.span_check import verify_claim_numbers
        claim = {**CLAIM, **COUNTS, "ingredient_arm": "VitC", "control_arm": "Placebo",
                 "evidence_span": "Colds: VitC 20 of 100, placebo 40 of 100",
                 "events_control": 41}
        out = verify_claim_numbers(claim)
        self.assertEqual(out["verified"]["events_ingredient"], 20)
        self.assertIn("events_control", out["rejected"])

    def test_the_second_reader_must_agree_on_the_counts(self):
        from pipeline.review import ROUTE_FIELDS, S5N_FIELDS, numbers_claim
        fields, cats = ROUTE_FIELDS["event_counts"]
        self.assertIn("events_control", fields)
        self.assertEqual(cats, ("design_kind", "contrast"))
        self.assertIn("events_ingredient", S5N_FIELDS)
        self.assertEqual(numbers_claim({}, COUNTS)["events_control"], 40)


class Pooling(unittest.TestCase):
    def test_a_yes_no_outcome_pools_as_smd_with_a_separate_risk_ratio(self):
        from pipeline import vocab
        from pipeline.evidence_v2 import summarise
        pv = vocab.population_variants()[0]
        product = {"ingredient": "vitamin_c", "form_vocab_id": "ascorbic_acid",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}},
                   "dose_low_mg": None, "dose_high_mg": None}

        def item(i, e1, e2):
            claim = {**CLAIM, "outcome_raw": "Caught a cold", "measure": "participants with a cold",
                     "events_ingredient": e1, "events_control": e2, "n_ingredient": 100, "n_control": 100}
            return {"id": f"s{i}", "record": {"design_rank": 4, "canonical_id": f"s{i}"}, "extraction": {
                "S3": {"population_axes": {a: pv[a] for a in vocab.AXES},
                       "comparator": "ingredient_free", "ingredient_isolated": "yes"},
                "S4": {"item1_randomisation_method": 1, "item2_double_blind_placebo": 1, "item5_attrition_ok": 1},
                "outcomes": [{"claim": claim, "outcome_vocab_id": "cold_incidence", "discarded": False,
                              "numbers_v2": {"claim": claim, "verified": {k: claim[k] for k in (
                                  "events_ingredient", "events_control", "n_ingredient", "n_control")}}}]}}
        block = summarise([item(1, 30, 32), item(2, 25, 26), item(3, 40, 40)], product)
        o = next(x for x in block["outcomes"] if x["outcome"] == "cold_incidence")
        self.assertEqual((o["k"], o["rr"]["k"]), (3, 3))
        self.assertGreater(o["smd"]["estimate"], 0)            # fewer colds = benefit
        self.assertLess(o["rr"]["estimate"], 1)                # the ratio stays unoriented
        self.assertEqual(o["md"], None)
        self.assertIn("event_proportion", o["estimand_mix"])


def row(**kw):
    base = {"id": "r", "outcome": "blood_pressure", "scale": "md", "unit": "mm Hg", "estimate": -3.84,
            "ci_low": -5.29, "ci_high": -2.38, "quote": "-3.84 mm Hg (95% CI: -5.29, -2.38 mm Hg", "doi": "x"}
    return {**base, **kw}


class BenchmarkFixes(unittest.TestCase):
    def block(self, **pools):
        return {"outcomes": [{"outcome": "blood_pressure", "k": 5, "refused": {}, **pools}]}

    def test_a_lower_is_benefit_row_meets_our_benefit_positive_pool(self):
        block = self.block(md={"estimate": 3.0, "ci": [1.0, 5.0], "unit": "mmhg"})
        r = compare(block, [row(benefit_direction="lower")])[0]
        self.assertEqual(r["theirs"], (3.84, 2.38, 5.29))
        self.assertTrue(r["comparable"])                       # "mm Hg" = "mmHg"
        self.assertTrue(r["overlap"])
        self.assertTrue(r["same_direction"])

    def test_without_the_direction_the_row_is_read_as_printed(self):
        block = self.block(md={"estimate": 3.0, "ci": [1.0, 5.0], "unit": "mmHg"})
        self.assertFalse(compare(block, [row()])[0]["overlap"])

    def test_risk_ratio_rows_compare_directly_and_by_log_width(self):
        rr = row(outcome="cold_incidence", scale="rr", unit=None, estimate=0.97, ci_low=0.94, ci_high=1.0,
                 quote="RR was 0.97 (95% CI 0.94 to 1.00)")
        self.assertEqual(check_row(rr), [])
        block = {"outcomes": [{"outcome": "cold_incidence", "k": 4, "refused": {},
                               "rr": {"estimate": 0.9, "ci": [0.8, 1.01], "k": 4}}]}
        res = compare(block, [rr])
        self.assertTrue(res[0]["overlap"])
        self.assertTrue(res[0]["same_direction"])
        v = verdicts(block, res)[0]
        self.assertAlmostEqual(v["width_ratio"], (math.log(1.01) - math.log(0.8)) / (math.log(1.0) - math.log(0.94)))
        self.assertEqual(v["status"], "not_testable")          # ours is much wider

    def test_a_risk_ratio_row_takes_no_direction(self):
        rr = row(outcome="cold_incidence", scale="rr", unit=None, estimate=0.97, ci_low=0.94, ci_high=1.0,
                 quote="0.97 0.94 1.00", benefit_direction="lower")
        self.assertTrue(any("benefit_direction" in p for p in check_row(rr)))


class VitaminCVocabulary(unittest.TestCase):
    def test_directions_and_measure_order(self):
        from pipeline import vocab
        from pipeline.pool import measure_rank
        o = {x["id"]: x for x in vocab.load("outcome")["outcomes"]}
        self.assertEqual(o["blood_pressure"]["polarity"], "lower_better")
        self.assertEqual(o["glycaemic_control"]["polarity"], "lower_better")
        rank = lambda oid, text: measure_rank({"outcome_raw": text}, o[oid]["measure_hierarchy"])
        self.assertEqual(rank("blood_pressure", "Systolic BP"), 0)
        self.assertEqual(rank("blood_pressure", "DBP"), 1)
        self.assertEqual(rank("glycaemic_control", "HbA1c (%)"), 0)
        self.assertEqual(rank("glycaemic_control", "Fasting plasma glucose"), 1)
        self.assertEqual(rank("glycaemic_control", "HOMA-IR"), 2)
        self.assertEqual(rank("inflammation_crp", "hs-CRP"), 0)
        self.assertEqual(rank("inflammation_crp", "IL-6"), 1)
        self.assertEqual(rank("cold_duration", "Duration of colds (days)"), 0)
        self.assertEqual(rank("cold_duration", "WURSS severity"), 1)


if __name__ == "__main__":
    unittest.main()
