"""The contrast comes from S3's arm facts when both claim arms resolve
(pipeline/eligibility.with_s3_contrast; founder rule 2026-10-28). MEASURED:
S5N labelled add-on controls and once "CREATINE vs PLACEBO" vs_ingredient_arm
on 21 claims at v1.40 and 20 at v1.41, after a prompt fix aimed at exactly that."""
import unittest

from pipeline import vocab
from pipeline.eligibility import with_s3_contrast
from pipeline.pool import pool_outcomes
from pipeline.review import reconcile

ARMS = [{"label": "Creatine + Caffeine", "role": "administered", "target_ingredient_presence": "yes",
         "active_cointerventions": ["caffeine"]},
        {"label": "Placebo + Caffeine", "role": "administered", "target_ingredient_presence": "no",
         "active_cointerventions": ["caffeine"]},
        {"label": "Creatine low", "role": "administered", "target_ingredient_presence": "yes",
         "active_cointerventions": ["caffeine"]}]
CLAIM = {"ingredient_arm": "Creatine + Caffeine", "control_arm": "Placebo + Caffeine",
         "contrast": "vs_ingredient_arm", "design_kind": "parallel", "estimand": "endpoint",
         "outcome_raw": "Wingate peak power", "measure": "W"}
NUMS = {"mean_ingredient": 820.0, "sd_ingredient": 90.0, "n_ingredient": 12,
        "mean_control": 790.0, "sd_control": 95.0, "n_control": 12}


class S3Contrast(unittest.TestCase):
    def test_s3_presence_decides(self):
        claim, decided = with_s3_contrast(CLAIM, {"arms": ARMS})
        self.assertTrue(decided)
        self.assertEqual(claim["contrast"], "vs_ingredient_free")
        both, _ = with_s3_contrast({**CLAIM, "control_arm": "Creatine low", "contrast": "vs_ingredient_free"},
                                   {"arms": ARMS})
        self.assertEqual(both["contrast"], "vs_ingredient_arm")

    def test_unresolved_arms_keep_the_readers_label(self):
        claim, decided = with_s3_contrast({**CLAIM, "control_arm": "PL"}, {"arms": ARMS})
        self.assertFalse(decided)
        self.assertEqual(claim["contrast"], "vs_ingredient_arm")
        unknown = [{**a, "target_ingredient_presence": "unknown"} for a in ARMS]
        self.assertFalse(with_s3_contrast(CLAIM, {"arms": unknown})[1])

    def test_readers_disagreeing_only_on_the_label_agree(self):
        review = {"found": True, **NUMS, "contrast": "vs_ingredient_free", "design_kind": "parallel",
                  "estimand": "endpoint"}
        r = reconcile(CLAIM, {"verified": NUMS}, review, "higher_better", ARMS)
        self.assertEqual((r["status"], r["route"]), ("agreed", "arm_stats"))

    def test_the_pool_pools_the_relabelled_claim_and_flags_it(self):
        pv = vocab.population_variants()[0]
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
        item = {"id": "c", "record": {"ingredient": "creatine", "design_rank": 4}, "extraction": {
            "S3": {"population_axes": {a: pv[a] for a in vocab.AXES}, "arms": ARMS,
                   "comparator": "ingredient_free", "ingredient_isolated": "yes"},
            "outcomes": [{"claim": CLAIM, "outcome_vocab_id": "muscle_power", "discarded": False,
                          "numbers_v2": {"verified": NUMS, "claim": CLAIM}}]}}
        pooled = pool_outcomes([item], product)["muscle_power"]
        self.assertEqual(pooled.k, 1)
        self.assertIn("contrast_from_s3", pooled.studies[0]["flags"])


if __name__ == "__main__":
    unittest.main()
