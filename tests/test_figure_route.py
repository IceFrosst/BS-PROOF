"""The figure route (founder 2026-10-28; pipeline/figure.py, workers._figure_numbers,
pool route `figure_means`): two agreeing readings of a figure, ranked last,
always reported with and without."""
import unittest

from bsproof import workers
from pipeline import vocab
from pipeline.evidence_v2 import summarise
from pipeline.figure import accept, pick_figure
from pipeline.pool import pool_outcomes

CLAIM = {"outcome_raw": "1RM back squat strength", "measure": "kg", "timepoint": "6 days",
         "ingredient_arm": "Creatine", "control_arm": "Placebo", "contrast": "vs_ingredient_free",
         "design_kind": "parallel", "estimand": "endpoint"}
FIGS = [{"id": "f1", "caption": "Study design and flow of participants.", "href": "g1.jpg"},
        {"id": "f2", "caption": "Maximum muscle strength of back squat following creatine or placebo "
                                "supplementation. Data are the mean ± SD.", "href": "g2.jpg"},
        {"id": "f3", "caption": "Percent change in back squat strength.", "href": "g3.jpg"}]


def reading(ingredient=(102.0, 110.0), control=(98.0, 106.0), base=(95.0, 96.0), *,
            kind="values_at_timepoints", bar="sd"):
    rows = [{"arm": "Creatine", "timepoint": "6 days", "mean": ingredient[0], "error_bar_top": ingredient[1]},
            {"arm": "Placebo", "timepoint": "6 days", "mean": control[0], "error_bar_top": control[1]},
            {"arm": "Creatine", "timepoint": "baseline", "mean": base[0], "error_bar_top": None},
            {"arm": "Placebo", "timepoint": "baseline", "mean": base[1], "error_bar_top": None}]
    return {"panel_found": True, "plotted_quantity": kind, "y_axis_min": 0, "y_axis_max": 150,
            "error_bar": bar, "readings": [{**r, "error_bar_bottom": None, "points": None,
                                            "points_complete": None} for r in rows], "evidence": "legend"}


class PickFigure(unittest.TestCase):
    def test_the_caption_that_names_the_measure_never_a_design_or_percent_figure(self):
        self.assertEqual(pick_figure(CLAIM, FIGS)["id"], "f2")
        self.assertIsNone(pick_figure({**CLAIM, "outcome_raw": "Wingate peak power"}, FIGS))
        self.assertIsNone(pick_figure(CLAIM, [FIGS[0], FIGS[2]]))


class Accept(unittest.TestCase):
    def test_agreeing_readers_give_reader_ones_numbers(self):
        out, why = accept(CLAIM, reading(), reading(ingredient=(103.0, 111.0)))
        self.assertEqual(why, "")
        self.assertEqual((out["mean_ingredient"], out["sd_ingredient"], out["pre_ingredient"]), (102.0, 8.0, 95.0))
        self.assertEqual(out["estimand"], "endpoint")

    def test_disagreement_beyond_two_percent_of_the_axis_refuses(self):
        out, why = accept(CLAIM, reading(), reading(ingredient=(106.0, 114.0)))   # 4 / 150 = 2.7 %
        self.assertIsNone(out)
        self.assertIn("disagree", why)

    def test_what_is_plotted_and_the_bars_must_be_known_and_shared(self):
        self.assertIsNone(accept(CLAIM, reading(kind="percent_change"), reading(kind="percent_change"))[0])
        self.assertIsNone(accept(CLAIM, reading(), reading(kind="change_from_baseline"))[0])
        self.assertIsNone(accept(CLAIM, reading(bar="sd"), reading(bar="se"))[0])
        out, why = accept(CLAIM, reading(bar="unstated"), reading(bar="unstated"))
        self.assertIsNone(out)
        self.assertIn("no SD", why)

    def test_se_and_ci_bars_go_through_effect_sizes_own_conversion(self):
        out, _ = accept(CLAIM, reading(bar="se"), reading(bar="se"))
        self.assertEqual(out["se_ingredient"], 8.0)
        out, _ = accept(CLAIM, reading(bar="ci95"), reading(bar="ci95"))
        self.assertEqual((out["ci_ingredient_low"], out["ci_ingredient_high"], out["arm_ci_level"]), (94.0, 110.0, 0.95))


class Pool(unittest.TestCase):
    def setUp(self):
        pv = vocab.population_variants()[0]
        self.product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                        "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
        arms = [{"label": "Creatine", "n": 10, "role": "administered", "target_ingredient_presence": "yes",
                 "active_cointerventions": []},
                {"label": "Placebo", "n": 10, "role": "administered", "target_ingredient_presence": "no",
                 "active_cointerventions": []}]
        self.item = {"id": "s", "record": {"ingredient": "creatine", "design_rank": 4}, "extraction": {
            "S3": {"population_axes": {a: pv[a] for a in vocab.AXES}, "arms": arms,
                   "comparator": "ingredient_free", "ingredient_isolated": "yes"},
            "outcomes": [{"claim": CLAIM, "outcome_vocab_id": "muscle_strength", "discarded": False,
                          "numbers_v2": {"found": True, "verified": {}, "claim": CLAIM},
                          "figure_v1": {"figure": "f2", "readings": {"S5F": reading(), "S5FR": reading()}}}]}}

    def test_the_route_is_figure_means_and_the_outcome_is_shown_without_it(self):
        pooled = pool_outcomes([self.item], self.product)["muscle_strength"]
        self.assertEqual((pooled.k, pooled.studies[0]["route"]), (1, "figure_means"))
        self.assertIn("from_figure", pooled.studies[0]["flags"])
        sens = summarise([self.item], self.product)["outcomes"][0]["sensitivity"]
        self.assertEqual(sens["without_figure_means"]["k"], 0)

    def test_a_disagreement_is_refused_with_its_reason(self):
        self.item["extraction"]["outcomes"][0]["figure_v1"]["readings"]["S5FR"] = reading(ingredient=(120.0, 128.0))
        pooled = pool_outcomes([self.item], self.product)["muscle_strength"]
        self.assertEqual(pooled.k, 0)
        self.assertTrue(any("readers disagree" in why for why in pooled.refused))


class Worker(unittest.TestCase):
    class Source:
        def figures(self, pmcid):
            return FIGS

        def image(self, pmcid, href):
            return ("image/jpeg", b"\xff\xd8\xffpixels")

    def test_only_claims_without_a_text_effect_are_read_and_both_readers_run(self):
        calls = []

        def call(agent, payload, images=None):
            calls.append((agent, payload["timepoints"], len(images or [])))
            return reading(), {}
        s3 = {"arms": [{"label": "Creatine", "n": 10, "role": "administered", "target_ingredient_presence": "yes"},
                       {"label": "Placebo", "n": 10, "role": "administered", "target_ingredient_presence": "no"}]}
        with_numbers = {"mean_ingredient": 102.0, "sd_ingredient": 8.0, "n_ingredient": 10,
                        "mean_control": 98.0, "sd_control": 8.0, "n_control": 10}
        out = {"outcomes": [
            {"claim": CLAIM, "outcome_vocab_id": "muscle_strength", "discarded": False,
             "numbers_v2": {"found": True, "verified": {}, "claim": CLAIM}},
            {"claim": {**CLAIM, "outcome_raw": "Leg press 1RM"}, "outcome_vocab_id": "lean_body_mass",
             "discarded": False, "numbers_v2": {"found": True, "verified": with_numbers, "claim": CLAIM}}]}
        workers._figure_numbers(out, {"pmcid": "PMC1"}, s3, call, figure_source=self.Source())
        self.assertEqual([c[0] for c in calls], ["S5F", "S5FR"])
        self.assertEqual(calls[0][1:], (["baseline", "6 days"], 1))
        self.assertEqual(out["outcomes"][0]["figure_v1"]["figure"], "f2")
        self.assertNotIn("figure_v1", out["outcomes"][1])

    def test_no_pmc_article_no_reading(self):
        out = {"outcomes": [{"claim": CLAIM, "outcome_vocab_id": "muscle_strength", "discarded": False,
                             "numbers_v2": {"found": True, "verified": {}, "claim": CLAIM}}]}
        workers._figure_numbers(out, {}, {"arms": []}, lambda *a, **k: (None, {}), figure_source=self.Source())
        self.assertNotIn("figure_v1", out["outcomes"][0])


if __name__ == "__main__":
    unittest.main()
