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


if __name__ == "__main__":
    unittest.main()
