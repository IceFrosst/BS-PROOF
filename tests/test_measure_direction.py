"""Polarity per measure, not only per outcome (vocab/outcome.json
`measure_direction`, pipeline/pool.measure_polarity; founder 2026-10-26).
MEASURED on run 20261026_034529: the Hooper fatigue score was pooled under
energy_levels' `higher_better`, so less fatigue counted against creatine."""
import unittest

from pipeline import vocab
from pipeline.effect_size import effect_from_claim
from pipeline.pool import measure_polarity, pool_outcomes

OUTCOMES = {o["id"]: o for o in vocab.load("outcome")["outcomes"]}


def polarity(oid: str, raw: str, measure: str | None = None):
    o = OUTCOMES[oid]
    return measure_polarity({"outcome_raw": raw, "measure": measure}, o["polarity"], o.get("measure_direction"))[0]


class MeasureDirection(unittest.TestCase):
    def test_lower_is_better_measures(self):
        for oid, raw, unit in (("energy_levels", "Hooper fatigue score", "Hooper questionnaire (7-point Likert)"),
                               ("energy_levels", "Multidimensional Fatigue Inventory - General fatigue", "MFI score"),
                               ("sleep_quality", "PSQI global score", "Pittsburgh Sleep Quality Index"),
                               ("muscle_power", "30-m sprint", "sec"),
                               ("muscle_power", "RSA mean time", "seconds"),
                               ("exercise_endurance", "4 km cycling time trial performance time", "seconds"),
                               ("attention_focus", "PVT Mean reaction time", "ms"),
                               ("exercise_recovery", "Reduction in maximal voluntary contraction (MVC)", "% reduction")):
            self.assertEqual(polarity(oid, raw, unit), "lower_better", raw)

    def test_the_outcome_default_otherwise(self):
        for oid, raw, unit in (("energy_levels", "Cancer-related fatigue (FACIT-F)", "FACIT fatigue questionnaire"),
                               ("energy_levels", "Vigor (Profile of Mood States)", "POMS subscale"),
                               ("muscle_power", "Mean running speed during sprints", "m/s"),
                               ("muscle_power", "Peak power output during 15-s sprint", "Power (W)"),
                               ("muscle_power", "OMBT distance after the optimal individual PAP time", "distance"),
                               ("exercise_endurance", "Time to exhaustion (TTE)", "seconds"),
                               ("exercise_endurance", "3-minute time trial mean power output", "W"),
                               ("attention_focus", "Digit Cancellation Test (DCT) score", "number of targets")):
            self.assertEqual(polarity(oid, raw, unit), OUTCOMES[oid]["polarity"], raw)

    def test_mixed_measures_have_no_direction(self):
        self.assertIsNone(polarity("attention_focus", "Choice reaction time test (percent correct, reaction time)"))
        self.assertIsNone(polarity("energy_levels", "Mood state (vigour and fatigue, Brunel Mood Scale)"))

    def test_the_pool_flips_the_sign_and_refuses_an_unclear_direction(self):
        pv = vocab.population_variants()[0]
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
        arms = [{"label": "CR", "role": "administered", "target_ingredient_presence": "yes", "active_cointerventions": []},
                {"label": "PL", "role": "administered", "target_ingredient_presence": "no", "active_cointerventions": []}]

        def item(raw):
            claim = {"ingredient_arm": "CR", "control_arm": "PL", "contrast": "vs_ingredient_free",
                     "design_kind": "parallel", "estimand": "endpoint", "outcome_raw": raw, "measure": "score"}
            nums = {"mean_ingredient": 2.9, "sd_ingredient": 1.4, "n_ingredient": 14,
                    "mean_control": 3.1, "sd_control": 1.0, "n_control": 14}
            return {"id": "h", "record": {"ingredient": "creatine", "design_rank": 4}, "extraction": {
                "S3": {"population_axes": {a: pv[a] for a in vocab.AXES}, "arms": arms,
                       "comparator": "ingredient_free", "ingredient_isolated": "yes"},
                "outcomes": [{"claim": claim, "outcome_vocab_id": "energy_levels", "discarded": False,
                              "numbers_v2": {"verified": nums, "claim": claim}}]}}
        fatigue = pool_outcomes([item("Hooper fatigue score")], product)["energy_levels"].studies[0]
        self.assertGreater(fatigue["g"], 0)                      # less fatigue on creatine is a benefit
        self.assertIn("polarity_from_measure:lower_better", fatigue["flags"])
        mixed = pool_outcomes([item("Mood state (vigour and fatigue)")], product)["energy_levels"]
        self.assertEqual(mixed.k, 0)
        self.assertTrue(next(iter(mixed.refused)).startswith("direction of this measure is unclear"))


class ReaderSign(unittest.TestCase):
    def test_a_sign_against_the_readers_favoured_arm_is_flagged_not_refused(self):
        claim = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "endpoint",
                 "effect_favours": "ingredient"}
        nums = {"mean_ingredient": 31.98, "sd_ingredient": 2.8, "n_ingredient": 12,
                "mean_control": 33.38, "sd_control": 4.83, "n_control": 11}
        eff, _ = effect_from_claim(claim, nums, polarity="higher_better")
        self.assertIn("sign_disagrees_with_reader", eff.flags)
        eff, _ = effect_from_claim({**claim, "effect_favours": "control"}, nums, polarity="higher_better")
        self.assertNotIn("sign_disagrees_with_reader", eff.flags)


class ExcludedMeasures(unittest.TestCase):
    def test_a_sport_skill_count_is_not_muscle_power(self):
        from pipeline.pool import excluded_measure
        rules = OUTCOMES["muscle_power"].get("exclude_measures")
        self.assertIsNotNone(excluded_measure({"outcome_raw": "Total successful kicks (sum of three bouts)"}, rules))
        self.assertIsNone(excluded_measure({"outcome_raw": "Wingate peak power", "measure": "W"}, rules))
        self.assertIsNone(excluded_measure({"outcome_raw": "Countermovement jump height", "measure": "cm"}, rules))


if __name__ == "__main__":
    unittest.main()
