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
