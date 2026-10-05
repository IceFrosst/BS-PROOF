"""Evidence method v2 reviewer 1 for numbers: S5N (bsproof/workers._extract_numbers),
the merge rule (pipeline/review.numbers_claim) and what the reviewer and the pool
do with its claims. Fake model only."""
import os
import unittest
from unittest import mock

from pipeline.review import numbers_claim

# What S5 does on the RSMOKE3 papers: the claim framed as a change score, numbers
# it computed (printed nowhere) or none at all.
S5_CLAIM = {"outcome_raw": "bench press 1-RM", "measure": "kg", "timepoint": "week 8",
            "ingredient_arm": "CR", "control_arm": "PL", "estimand": "change_from_baseline",
            "contrast": "vs_ingredient_free", "design_kind": "parallel", "effect_favours": "ingredient",
            "is_primary_outcome": True, "direction": "benefit", "evidence_span": "CR gained more",
            "mean_ingredient": 5.0, "mean_control": 0.0, "sd_ingredient": None, "sd_control": None,
            "n_ingredient": 20, "n_control": 20, "effect_size": None, "ci_low": None, "ci_high": None,
            "p_value": 0.03, "p_value_kind": "bounded", "table_provenance": None, "standard_error": 1.1}
SPAN = "Bench press 1-RM at week 8: CR 85.0 ± 10.0 kg (n = 20), PL 80.0 ± 10.0 kg (n = 20)."
ENTRY = {"found": True, "evidence_span": SPAN, "table_provenance": None,
         "n_ingredient": 20, "n_control": 20, "mean_ingredient": 85.0, "mean_control": 80.0,
         "sd_ingredient": 10.0, "sd_control": 10.0, "effect_size": None, "effect_unit": "kg",
         "effect_favours": "ingredient", "estimate_kind": None, "ci_low": None, "ci_high": None,
         "ci_level": None, "p_value": None, "estimand": "endpoint", "design_kind": "parallel",
         "contrast": "vs_ingredient_free"}
ARMS = {"mean_ingredient", "mean_control", "sd_ingredient", "sd_control", "n_ingredient", "n_control"}


class Merge(unittest.TestCase):
    def test_s5n_replaces_every_number_and_keeps_s5_identity(self):
        m = numbers_claim(S5_CLAIM, ENTRY)
        self.assertEqual((m["mean_ingredient"], m["estimand"], m["evidence_span"]), (85.0, "endpoint", SPAN))
        self.assertEqual((m["outcome_raw"], m["ingredient_arm"], m["is_primary_outcome"]),
                         ("bench press 1-RM", "CR", True))

    def test_s5_numbers_never_leak_into_the_merge(self):
        m = numbers_claim(S5_CLAIM, {**ENTRY, "n_ingredient": None})
        self.assertIsNone(m["n_ingredient"])          # S5's 20 is NOT carried over
        self.assertIsNone(m["standard_error"])        # nor a field S5N does not read
        self.assertIsNone(m["p_value_kind"])

    def test_p_is_exact_by_contract(self):
        self.assertEqual(numbers_claim(S5_CLAIM, {**ENTRY, "p_value": 0.012})["p_value_kind"], "exact")

    def test_no_entry_no_claim(self):
        self.assertIsNone(numbers_claim(S5_CLAIM, None))


REC = {"_canonical": "doi:10.1/n", "ingredient": "creatine", "title": "t",
       "abstract": "oral creatine supplementation 5 g/day", "design_rank": 4}


class Wiring(unittest.TestCase):
    def fake(self, n_claims=1, numbers=None, reviews=None, s5n_fails=False):
        calls = []

        def _c(agent, payload):
            calls.append((agent, payload))
            if agent == "S5":
                return {"claims": [dict(S5_CLAIM) for _ in range(n_claims)]}, {}
            if agent == "S6B":
                return {"mappings": [{"index": i, "outcome_vocab_id": "muscle_strength",
                                      "confidence": 0.9, "rationale": "1rm"} for i in range(n_claims)]}, {}
            if agent == "S5N":
                if s5n_fails:
                    return None, {"error": "boom"}
                asked = [c["index"] for c in payload["claims"]]
                rows = numbers(asked) if callable(numbers) else [{"index": i, **ENTRY} for i in asked]
                return {"numbers": rows}, {}
            if agent == "S5R":
                return {"reviews": reviews or []}, {}
            return {}, {}
        return _c, calls

    def run_study(self, env=None, **kw):
        from bsproof import workers
        call, calls = self.fake(**kw)
        base = {"SP_NUMERIC_TABLES": "0", "SP_V13_SHADOW": "0", "SP_SECOND_REVIEWER": "0",
                "SP_NUMBERS_EXTRACTOR": "1"}
        with mock.patch.dict(os.environ, {**base, **(env or {})}):
            out = workers.extract_study(REC, "x" * 500 + SPAN, call=call)
        return out, calls

    def test_s5n_numbers_make_the_effect_s5_could_not(self):
        out, _ = self.run_study()
        nums = out["outcomes"][0]["numbers_v2"]
        self.assertEqual((nums["reader"], nums["found"]), ("S5N", True))
        self.assertEqual(set(nums["verified"]), ARMS)
        self.assertEqual(out["numbers_extraction_v2"], {"sent": 1, "returned": 1, "found": 1, "calls": 1})

    def test_s5n_is_blind_to_s5_numbers_and_estimand(self):
        _, calls = self.run_study()
        claim = dict(calls)["S5N"]["claims"][0]
        self.assertEqual(set(claim), {"index", "outcome_raw", "measure", "timepoint",
                                      "ingredient_arm", "control_arm"})

    def test_s5n_meta_is_one_dict_like_every_agent(self):
        from bsproof import workers
        from bsproof.run.extract import _agent_stats
        with mock.patch.object(workers, "S5N_CHUNK", 3):
            out, _ = self.run_study(n_claims=7)
        meta = out["_meta"]["S5N"]
        self.assertIsInstance(meta, dict)
        self.assertEqual((meta["calls"], len(meta["chunks"]), meta["error"]), (3, 3, None))
        stats = _agent_stats([{"record": REC, "extraction": out}])      # crashed on a list
        self.assertEqual(stats["S5N"]["ok"], 1)
        failed, _ = self.run_study(s5n_fails=True)
        self.assertEqual(failed["_meta"]["S5N"]["error"], "boom")

    def test_every_mapped_claim_is_read_in_chunks(self):
        from bsproof import workers
        with mock.patch.object(workers, "S5N_CHUNK", 3):
            out, calls = self.run_study(n_claims=7)
        asked = [[c["index"] for c in p["claims"]] for a, p in calls if a == "S5N"]
        self.assertEqual(asked, [[0, 1, 2], [3, 4, 5], [6]])
        self.assertEqual(out["numbers_extraction_v2"]["returned"], 7)

    def test_an_omitted_or_foreign_index_falls_back_to_s5(self):
        # Claim 1 omitted; an entry for an index never asked (5) is ignored.
        out, _ = self.run_study(n_claims=2, numbers=lambda asked: [{"index": 0, **ENTRY},
                                                                   {"index": 5, **ENTRY}])
        self.assertEqual([o["numbers_v2"]["reader"] for o in out["outcomes"]], ["S5N", "S5"])
        self.assertEqual(out["numbers_extraction_v2"]["returned"], 1)

    def test_a_failed_call_is_recorded_and_keeps_s5_numbers(self):
        out, _ = self.run_study(s5n_fails=True)
        self.assertEqual(out["outcomes"][0]["numbers_v2"]["reader"], "S5")
        self.assertIn("S5N", [f["agent"] for f in out["_failed"]])

    def test_a_number_not_in_the_span_is_refused(self):
        out, _ = self.run_study(numbers=lambda asked: [{"index": 0, **ENTRY, "sd_control": 3.2}])
        nums = out["outcomes"][0]["numbers_v2"]
        self.assertIn("sd_control", nums["rejected"])
        self.assertNotIn("sd_control", nums["verified"])

    def test_off_switch(self):
        out, calls = self.run_study(env={"SP_NUMBERS_EXTRACTOR": "0"})
        self.assertNotIn("S5N", [a for a, _ in calls])
        self.assertNotIn("numbers_extraction_v2", out)

    def test_the_reviewer_reads_s5n_estimand_and_the_pool_uses_s5n_numbers(self):
        from pipeline import vocab
        from pipeline.pool import pool_outcomes
        review = {"index": 0, **ENTRY, "evidence_span": SPAN}
        out, calls = self.run_study(env={"SP_SECOND_REVIEWER": "1"}, reviews=[review])
        self.assertEqual(dict(calls)["S5R"]["claims"][0]["estimand"], "endpoint")   # S5N's, not S5's
        self.assertEqual(out["outcomes"][0]["numbers_v2"]["review"]["status"], "agreed")
        pv = vocab.population_variants()[0]
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
        out["S3"] = {"population_axes": {a: pv[a] for a in vocab.AXES},
                     "comparator": "ingredient_free", "ingredient_isolated": "yes"}
        p = pool_outcomes([{"id": "n", "record": REC, "extraction": out}], product)["muscle_strength"]
        self.assertEqual(p.k, 1)
        self.assertTrue(p.studies[0]["reviewed"])
        self.assertAlmostEqual(p.studies[0]["g"], 0.49, places=2)   # (85-80)/10, Hedges-corrected


BASE = {"contrast": "vs_ingredient_free", "design_kind": "parallel", "estimand": "change_from_baseline"}
MEANS = {"mean_ingredient": 7.6, "mean_control": 3.3, "n_ingredient": 11, "n_control": 11}


class DerivedSD(unittest.TestCase):
    """Per-arm SD from a printed SE or CI (Cochrane Handbook 6.5.2.2)."""

    def effect(self, claim=None, **v):
        from pipeline.effect_size import effect_from_claim
        return effect_from_claim({**BASE, **(claim or {})}, {**MEANS, **v}, polarity="higher_better")

    def test_sd_from_se(self):
        from pipeline import meta_effects as me
        eff, route = self.effect(se_ingredient=1.0, se_control=2.0)
        self.assertEqual(route, "arm_stats_derived")
        self.assertEqual(eff.flags, ("sd_from_se:ingredient", "sd_from_se:control"))
        g = me.hedges_g(7.6, 11 ** 0.5, 11, 3.3, 2 * 11 ** 0.5, 11)
        self.assertAlmostEqual(eff.smd, g.g)

    def test_sd_from_a_per_arm_ci_uses_t(self):
        from pipeline import meta_effects as me
        eff, route = self.effect({"arm_ci_level": 0.95}, ci_ingredient_low=0.7, ci_ingredient_high=14.4,
                                 ci_control_low=0.5, ci_control_high=6.0)
        t = me.student_t_ppf(0.975, 10)
        sd_i, sd_c = 11 ** 0.5 * 13.7 / (2 * t), 11 ** 0.5 * 5.5 / (2 * t)
        self.assertAlmostEqual(sd_i, 10.198, places=2)
        self.assertEqual(route, "arm_stats_derived")
        self.assertAlmostEqual(eff.md_variance, sd_i ** 2 / 11 + sd_c ** 2 / 11)

    def test_a_ci_without_a_stated_level_derives_nothing(self):
        eff, why = self.effect(ci_ingredient_low=0.7, ci_ingredient_high=14.4,
                               ci_control_low=0.5, ci_control_high=6.0)
        self.assertIsNone(eff)

    def test_a_printed_sd_is_never_replaced(self):
        eff, route = self.effect(sd_ingredient=3.0, sd_control=2.0, se_ingredient=9.0, se_control=9.0)
        self.assertEqual((route, eff.flags), ("arm_stats", ()))

    def test_no_arm_n_no_derivation(self):
        from pipeline.effect_size import effect_from_claim
        v = {**MEANS, "se_ingredient": 1.0, "se_control": 2.0}
        del v["n_control"]
        self.assertIsNone(effect_from_claim(BASE, v, polarity="higher_better")[0])

    def test_printed_sd_outranks_derived_in_the_pool(self):
        from pipeline.pool import ROUTE_RANK
        self.assertLess(ROUTE_RANK["arm_stats"], ROUTE_RANK["arm_stats_derived"])
        self.assertLess(ROUTE_RANK["arm_stats_derived"], ROUTE_RANK["reported_smd_ci"])

    def test_the_reviewer_compares_the_printed_se_never_the_derived_sd(self):
        from pipeline.review import reconcile
        claim = {**BASE, "arm_ci_level": None}
        nums = {"verified": {**MEANS, "se_ingredient": 1.0, "se_control": 2.0}}
        ok = reconcile(claim, nums, {"found": True, **BASE, **MEANS, "se_ingredient": 1.0, "se_control": 2.0},
                       "higher_better")
        self.assertEqual((ok["status"], ok["route"]), ("agreed", "arm_stats_derived"))
        self.assertNotIn("sd_ingredient", ok["verified"])
        bad = reconcile(claim, nums, {"found": True, **BASE, **MEANS, "se_ingredient": 3.3, "se_control": 2.0},
                        "higher_better")
        self.assertEqual(bad["status"], "disagreed")


class BothArmRows(unittest.TestCase):
    def test_a_span_quoting_both_arm_rows_verifies_the_control(self):
        from pipeline.span_check import verify_claim_numbers
        span = "SJ (cm) | CrM | 28.8 ± 5.3 | 33.3 ± 4.9 | 4.5 ± 3.0 ; SJ (cm) | CON | 30.1 ± 4.0 | 33.8 ± 4.2 | 3.7 ± 2.1"
        r = verify_claim_numbers({"evidence_span": span, "mean_ingredient": 4.5, "sd_ingredient": 3.0,
                                  "mean_control": 3.7, "sd_control": 2.1})
        self.assertEqual(set(r["verified"]), {"mean_ingredient", "sd_ingredient", "mean_control", "sd_control"})

    def test_per_arm_se_and_ci_are_span_checked(self):
        from pipeline.span_check import verify_claim_numbers
        r = verify_claim_numbers({"evidence_span": "Leg press | 7.6 (0.7, 14.4) | 14.4 (1.5, 27.3)",
                                  "ci_ingredient_low": 0.7, "ci_ingredient_high": 14.4,
                                  "ci_control_low": 1.5, "ci_control_high": 27.9, "se_control": 0.4})
        self.assertEqual(set(r["rejected"]), {"ci_control_high", "se_control"})


# Real RSMOKE5 rows (doi:10.1080/15502783.2022.2108683 Table 2, n 12 / 11).
SJ = {"pre_ingredient": 28.8, "post_ingredient": 33.3, "mean_ingredient": 4.5, "sd_ingredient": 3.0,
      "pre_control": 32.8, "post_control": 36.5, "mean_control": 3.7, "sd_control": 2.1,
      "n_ingredient": 12, "n_control": 11}
CMJ = {"pre_ingredient": 31.1, "post_ingredient": 35.2, "mean_ingredient": 0.5, "sd_ingredient": 0.4,
       "pre_control": 33.6, "post_control": 36.7, "mean_control": 0.3, "sd_control": 0.2,
       "n_ingredient": 12, "n_control": 11}          # the swapped ∆ cells


class ConsistencyGuard(unittest.TestCase):
    def effect(self, v, estimand="change_from_baseline", **kw):
        from pipeline.effect_size import effect_from_claim
        return effect_from_claim({**BASE, "estimand": estimand}, v, polarity="higher_better", **kw)

    def test_a_consistent_change_row_passes(self):
        self.assertEqual(self.effect(SJ)[1], "arm_stats")

    def test_a_swapped_change_cell_is_refused(self):
        eff, why = self.effect(CMJ)
        self.assertIsNone(eff)
        self.assertIn("inconsistent", why)
        self.assertIn("ingredient change 0.5 != 35.2 - 31.1", why)

    def test_rounding_is_not_an_inconsistency(self):
        # 4.1 printed for 41.1 - 37.0 = 4.1 (ABJ); 1.64 - 1.25 = 0.39 printed as 0.4
        v = {**SJ, "pre_ingredient": 1.25, "post_ingredient": 1.64, "mean_ingredient": 0.4}
        self.assertIsNotNone(self.effect(v)[0])

    def test_unknown_pre_or_post_checks_nothing(self):
        v = {k: x for k, x in CMJ.items() if not k.startswith("pre_")}
        self.assertIsNotNone(self.effect(v)[0])

    def test_an_endpoint_mean_must_be_the_post_value(self):
        # control post is 36.5. (36.0 would pass: JSON stores it as 36, so the
        # guard allows whole-number rounding of +/-0.5 -- permissive by design.)
        v = {**SJ, "mean_ingredient": 33.3, "mean_control": 36.1}
        self.assertIsNone(self.effect(v, "endpoint")[0])

    def test_reviewer_one_numbers_still_guard_after_review(self):
        reviewed = {k: x for k, x in CMJ.items() if not k.startswith(("pre_", "post_"))}
        self.assertIsNone(self.effect(reviewed, checks=CMJ)[0])

    def test_the_reviewer_compares_baselines(self):
        from pipeline.review import reconcile
        claim = {**BASE}
        r = reconcile(claim, {"verified": SJ}, {"found": True, **BASE, **SJ, "pre_control": 23.8},
                      "higher_better")
        self.assertEqual(r["status"], "disagreed")


# Whole-body FFM (doi:10.1007/BF02982622): post 65.4 vs 67.6, baselines 62.9 vs 68.0, ± SE, n 10 / 10.
FFM = {"mean_ingredient": 65.4, "mean_control": 67.6, "post_ingredient": 65.4, "post_control": 67.6,
       "pre_ingredient": 62.9, "pre_control": 68.0, "se_ingredient": 2.3, "se_control": 2.2,
       "n_ingredient": 10, "n_control": 10}


class BaselineImbalance(unittest.TestCase):
    def test_a_gap_larger_than_the_endpoint_difference_is_flagged_not_refused(self):
        from pipeline.effect_size import effect_from_claim
        eff, route = effect_from_claim({**BASE, "estimand": "endpoint"}, FFM, polarity="higher_better")
        self.assertEqual(route, "arm_stats_derived")
        self.assertIn("baseline_imbalance", eff.flags)

    def test_an_endpoint_mean_may_be_given_as_the_post_value_only(self):
        from pipeline.effect_size import effect_from_claim
        post_only = {k: x for k, x in FFM.items() if not k.startswith("mean_")}
        eff, route = effect_from_claim({**BASE, "estimand": "endpoint"}, post_only, polarity="higher_better")
        self.assertEqual(route, "arm_stats_derived")
        self.assertAlmostEqual(eff.md, 65.4 - 67.6)
        self.assertIn("baseline_imbalance", eff.flags)
        # a change score is never read from post values
        self.assertIsNone(effect_from_claim(BASE, post_only, polarity="higher_better")[0])

    def test_a_small_gap_or_a_change_score_is_not_flagged(self):
        from pipeline.effect_size import effect_from_claim
        small = {**FFM, "pre_control": 64.0}
        eff, _ = effect_from_claim({**BASE, "estimand": "endpoint"}, small, polarity="higher_better")
        self.assertNotIn("baseline_imbalance", eff.flags)
        eff, _ = effect_from_claim({**BASE}, SJ, polarity="higher_better")       # change scores
        self.assertNotIn("baseline_imbalance", eff.flags)

    def test_the_pool_caps_risk_of_bias_at_unclear(self):
        from pipeline import vocab
        from pipeline.pool import pool_outcomes
        pv = vocab.population_variants()[0]
        product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
                   "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}

        def item(v):
            claim = {**BASE, "estimand": "endpoint", "outcome_raw": "FFM", "effect_unit": "kg"}
            return {"id": "f", "record": REC, "extraction": {
                "S3": {"population_axes": {a: pv[a] for a in vocab.AXES},
                       "comparator": "ingredient_free", "ingredient_isolated": "yes"},
                "S4": {"item1_randomisation_method": 1, "item2_double_blind_placebo": 1, "item5_attrition_ok": 1},
                "outcomes": [{"claim": claim, "outcome_vocab_id": "lean_body_mass", "discarded": False,
                              "numbers_v2": {"verified": v, "claim": claim}}]}}
        flagged = pool_outcomes([item(FFM)], product)["lean_body_mass"].studies[0]
        self.assertEqual((flagged["rob"], "baseline_imbalance" in flagged["flags"]), ("unclear", True))
        clean = pool_outcomes([item({**FFM, "pre_control": 64.0})], product)["lean_body_mass"].studies[0]
        self.assertEqual(clean["rob"], "low")


if __name__ == "__main__":
    unittest.main()
