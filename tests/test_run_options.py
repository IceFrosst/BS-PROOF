"""run_pipeline's command-line options (bsproof/run/options.py)."""
import unittest

from bsproof.run.options import parse_args


class RunOptionsTests(unittest.TestCase):
    def test_defaults(self):
        o = parse_args([])
        self.assertEqual((o.ingredient, o.form, o.scope), ("magnesium", "magnesium_glycinate", "broad"))
        self.assertFalse(o.wiring or o.full_text_only or o.all_outcomes)
        self.assertIsNone(o.limit)
        self.assertIsNone(o.dose_mg)
        self.assertEqual(o.top_n, 5)

    def test_flags(self):
        o = parse_args(["creatine", "--form", "creatine_monohydrate", "--full-text-only",
                        "--intervention-scope", "--all-outcomes", "--dose", "3000", "--limit", "40"])
        self.assertEqual((o.ingredient, o.scope, o.dose_mg, o.limit), ("creatine", "intervention", 3000.0, 40))
        self.assertTrue(o.full_text_only and o.all_outcomes)

    def test_scope_precedence_is_fixed_not_positional(self):
        self.assertEqual(parse_args(["--per-outcome", "--broad-scope"]).scope, "per_outcome")
        self.assertEqual(parse_args(["--intervention-scope", "--supplement-scope"]).scope, "intervention")

    def test_unknown_flag_is_an_error_not_an_ingredient(self):
        for argv in (["creatine", "--frm", "x"], ["--grok"], ["--with-sr"]):
            with self.assertRaises(SystemExit):
                parse_args(argv)

    def test_demo_flag(self):
        self.assertFalse(parse_args(["creatine"]).demo)
        self.assertTrue(parse_args(["creatine", "--demo"]).demo)

    def test_a_demo_writes_no_report(self):
        from unittest.mock import patch
        from bsproof.run.report import finish
        with patch("scripts.auto_report_push.write_report") as write:
            finish(parse_args(["creatine", "--demo"]), None, {}, 0.0)
        write.assert_not_called()

    def test_demo_summary_flags_failed_calls(self):
        import io
        from contextlib import redirect_stdout
        from bsproof.run.extract import _demo_summary
        raw = [{"record": {}, "extraction": {"_meta": {"S3": {"cache": False}},
                                             "_failed": [{"agent": "S4", "error": "timeout"}]}}]
        out = io.StringIO()
        with redirect_stdout(out):
            _demo_summary(raw)
        self.assertIn("DEMO summary", out.getvalue())


if __name__ == "__main__":
    unittest.main()


class OutcomeScreen(unittest.TestCase):
    """--outcome (2026-11-03): grade one outcome, extract only studies that name it."""
    def test_flag(self):
        self.assertIsNone(parse_args(["creatine"]).outcome)
        self.assertEqual(parse_args(["vitamin_d", "--outcome", "muscle_strength"]).outcome,
                         "muscle_strength")

    def test_screen_uses_every_vocabulary_name(self):
        from pipeline.relevance import outcome_pattern, outcome_screen
        p = outcome_pattern("muscle_strength")
        for text in ("Knee extensor strength after 12 weeks", "Handgrip dynamometry",
                     "1RM leg press", "peak torque at 60 deg/s"):
            self.assertTrue(outcome_screen({"title": text}, p), text)
        self.assertFalse(outcome_screen({"title": "Serum 25(OH)D after vitamin D3",
                                         "abstract": "Bone mineral density and PTH."}, p))
        self.assertTrue(outcome_screen({"title": "Vitamin D3 in older adults",
                                        "abstract": "Secondary outcome: grip strength."}, p))
        self.assertIsNone(outcome_pattern("not_an_outcome"))

    def test_corpus_drops_studies_that_do_not_name_it(self):
        from unittest.mock import patch
        from bsproof.run import corpus
        recs = [{"design_rank": 4, "oa": "pmc", "title": "Vitamin D supplementation and grip strength"},
                {"design_rank": 4, "oa": "pmc", "title": "Vitamin D supplementation and mood"}]

        class Store:
            def counts(self): return {}
            def studies(self, syntheses=False): return recs

        ctx = {}
        opts = parse_args(["vitamin_d", "--outcome", "muscle_strength"])
        with patch.object(corpus, "relevance_check", lambda s, i: (True, "")), \
             patch.object(corpus, "RETRIEVE_MAX_PRIMARIES", 0), \
             patch("pipeline.predatory.flag_records", lambda rows: {}), \
             patch("pipeline.predatory.format_summary", lambda s: ""), \
             patch("pipeline.retrieve.retrieve") as retrieve:
            kept, n = corpus.load_corpus(Store(), opts, None, ["muscle_strength"], ctx)
        # --outcome always runs that outcome's own, uncapped search.
        kw = retrieve.call_args.kwargs
        self.assertEqual((kw["scope"], kw["outcome_ids"], kw["per_outcome_quota"]),
                         ("per_outcome", ["muscle_strength"], corpus.OUTCOME_QUOTA))
        self.assertEqual([r["title"] for r in kept], [recs[0]["title"]])
        self.assertEqual(ctx["outcome_screen"],
                         {"outcome": "muscle_strength", "kept": 1, "dropped": 1,
                          "dropped_without_abstract": 1})
