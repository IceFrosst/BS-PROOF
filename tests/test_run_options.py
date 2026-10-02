"""run_pipeline's argparse options must mean exactly what the old parser meant.

The hand-rolled `"--flag" in args` parser that run_pipeline.main() used until
2026-10-03 is kept below, verbatim in behaviour, as the ORACLE. Every argv in
CASES must produce the same options through both. The one intended difference
-- an unknown flag is now an error instead of becoming the ingredient -- is
pinned separately.
"""
import unittest

from bsproof.run.options import PILOT_REMOVED, parse_args


def legacy_parse(argv):
    """The pre-2026-10-03 parser (logic copied from run_pipeline.main)."""
    args = list(argv)
    wiring = "--wiring" in args
    if wiring:
        args.remove("--wiring")
    if "--pilot" in args:
        return PILOT_REMOVED
    grok = "--grok" in args
    if grok:
        args.remove("--grok")
    demo = "--demo" in args
    if demo:
        args.remove("--demo")
    full_text_only = grok
    if "--all-oa" in args:
        args.remove("--all-oa"); full_text_only = False
    if "--full-text-only" in args:
        args.remove("--full-text-only"); full_text_only = True
    with_sr = "--with-sr" in args
    if with_sr:
        args.remove("--with-sr")
    all_outcomes = "--all-outcomes" in args
    if all_outcomes:
        args.remove("--all-outcomes")
    top_n = 5
    if "--top-outcomes" in args:
        i = args.index("--top-outcomes")
        top_n = int(args[i + 1]); del args[i:i + 2]
    if sum([wiring, grok]) > 1:
        return "Pick only one of --wiring, --grok"
    scope = "intervention" if grok else "broad"
    for flag, value in (("--broad-scope", "broad"), ("--supplement-scope", "supplement"),
                        ("--intervention-scope", "intervention"), ("--per-outcome", "per_outcome")):
        if flag in args:
            args.remove(flag); scope = value
    dose_mg = None
    if "--dose" in args:
        i = args.index("--dose")
        dose_mg = float(args[i + 1]); del args[i:i + 2]
    limit = None
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1]); del args[i:i + 2]
    form = "magnesium_glycinate"
    if "--form" in args:
        i = args.index("--form")
        form = args[i + 1]
        del args[i:i + 2]
    ingredients = args or ["magnesium"]
    return dict(ingredient=ingredients[0], form=form, wiring=wiring, grok=grok, demo=demo,
                full_text_only=full_text_only, with_sr=with_sr, all_outcomes=all_outcomes,
                top_n=top_n, scope=scope, dose_mg=dose_mg, limit=limit)


CASES = [
    [],
    ["creatine", "--form", "creatine_monohydrate", "--wiring"],
    ["creatine", "--form", "creatine_monohydrate"],
    ["magnesium", "--form", "magnesium_glycinate", "--grok", "--per-outcome", "--dose", "400"],
    ["creatine", "--grok", "--all-oa"],
    ["creatine", "--all-oa", "--full-text-only"],
    ["creatine", "--full-text-only", "--all-oa"],
    ["creatine", "--per-outcome", "--broad-scope"],
    ["creatine", "--supplement-scope", "--intervention-scope"],
    ["creatine", "--grok", "--broad-scope"],
    ["creatine", "--limit", "40", "--with-sr", "--demo"],
    ["creatine", "--all-outcomes", "--top-outcomes", "8"],
    ["--form", "creatine_hcl", "creatine", "magnesium"],
    ["--pilot"],
    ["creatine", "--pilot", "--wiring"],
    ["--wiring", "--grok"],
]


class RunOptionsParity(unittest.TestCase):
    def test_every_case_matches_the_legacy_parser(self):
        for argv in CASES:
            with self.subTest(argv=argv):
                new = parse_args(argv)
                old = legacy_parse(argv)
                if isinstance(old, str):
                    self.assertEqual(new, old)
                else:
                    self.assertEqual(new.__dict__, old)

    def test_unknown_flag_is_an_error_not_an_ingredient(self):
        # The old parser ran "--limt" as the INGREDIENT; argparse refuses it.
        with self.assertRaises(SystemExit):
            parse_args(["creatine", "--limt", "40"])


if __name__ == "__main__":
    unittest.main()
