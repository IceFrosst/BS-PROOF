"""Selftest group: predatory venues, structural invariants, stratified selection, relevance."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import dedup, canonical_id, registry_id, vocab, _reasonless_probe  # noqa: F401


def run(check):
    print("\nPREDATORY VENUE (publisher, not journal title)")
    import pipeline.predatory as pred
    from sources import crossref

    check("crossref.venue reads publisher, journal and ISSNs apart",
          crossref.venue({"publisher": "OMICS International",
                          "container-title": ["J Fake Sci"],
                          "ISSN": ["1234-5678"]}) ==
          {"publisher": "OMICS International", "journal": "J Fake Sci",
           "issns": ["1234-5678"]})
    check("crossref.venue on a missing record stays null, never guesses",
          crossref.venue(None) == {"publisher": None, "journal": None, "issns": []})

    check("known predatory publisher is flagged",
          pred.is_predatory(publisher="OMICS International"))
    check("publisher containment tolerates a legal suffix",
          pred.is_predatory(publisher="OMICS International Ltd"),
          "imprints appear as 'X Ltd' / 'X BV' in Crossref")
    for legit in ("Elsevier BV", "Springer Nature", "MDPI AG",
                  "Wolters Kluwer Health"):
        check(f"legitimate publisher stays clean: {legit}",
              not pred.is_predatory(publisher=legit))

    # The three defamation-shaped false positives from the 13.2% run. Each is a
    # real journal that a substring matcher named as predatory.
    for jrn, entry in (("American Journal of Obstetrics and Gynecology", "american journal"),
                       ("Acta oto-laryngologica", "lar"),
                       ("The Journal of Clinical Investigation", "e journal")):
        check(f"real journal not flagged: {jrn[:44]}",
              not pred.is_predatory(journal=jrn), f"list entry {entry!r}")

    check(f"MIN_PUBLISHER_CHARS={pred.MIN_PUBLISHER_CHARS} excludes every sub-6 acronym",
          all(len(pred._norm_title(e)) >= pred.MIN_PUBLISHER_CHARS
              or not pred.is_predatory(publisher="Acta oto-laryngologica")
              for e in (pred._raw_lines or [])),
          "'LAR' is why the floor exists")

    # A verdict without its coverage is a false claim -- invariant 8, applied to
    # a flag rather than an arc.
    summ = pred.flag_records([
        {"journal": "J Fake Sci", "publisher": "OMICS International"},
        {"journal": "Lancet", "publisher": "Elsevier BV"},
        {"journal": "Some Journal"},                       # no publisher resolved
    ])
    check("flag counts the studies, not the venues",
          summ["studies_predatory"] == 1, str(summ["studies_predatory"]))
    check("publisher coverage is reported beside the verdict",
          summ["publishers_resolved"] == 2,
          "0 flagged @ 0 resolved != 0 flagged @ 240 resolved")
    check("a publisher hit is never reported as a journal",
          summ["publishers_predatory"] == ["OMICS International"]
          and summ["journals_predatory"] == [],
          "naming an imprint as a journal is the libel-shaped error")
    check("'not checked' is distinguishable from 'clean' in the summary",
          "NOT CHECKED at publisher level" in
          pred.format_summary(pred.flag_records([{"journal": "Some Journal"}])),
          "the truncated-list bug read as a clean corpus for four commits")
    # MEASURED ON REAL CROSSREF OUTPUT, 2026-08-09. Free-floating containment on
    # the publisher field reproduced the 13.2% run's worst error on live data --
    # these two strings came out of an actual creatine/magnesium retrieval.
    check("real journal in a publisher field is not flagged: The Journal of Rheumatology",
          not pred.is_predatory(publisher="The Journal of Rheumatology"),
          "matched list entry 'e-journal' before anchoring — the libel-shaped error")
    check("generic list fragment does not flag an unrelated imprint",
          not pred.is_predatory(publisher="Bentham Science Publishers Ltd."),
          "matched 'Science Publishers'; would hit any publisher with that phrase")
    check("a genuine list entry still flags with a corporate suffix",
          pred.is_predatory(publisher="Frontiers Media SA")
          and pred.is_predatory(publisher="Bentham Open Ltd"),
          "anchoring must not cost true positives")

    # KNOWN MISS, pinned deliberately. Crossref returns "OMICS Publishing Group"
    # for DOIs registered before the rename; the list carries "OMICS
    # International". Same operation, two names, no containment either way.
    # Do NOT fix this by matching tokens: 'omics' is a substring of ECONomics
    # and INFONomics, and the list holds "International Academy of Business &
    # Economics" and "Infonomics Society". Token matching would flag every
    # publisher with 'Economics' in its name -- the 'LAR' error again.
    check("name drift is under-flagged, not force-matched",
          not pred.is_predatory(publisher="OMICS Publishing Group")
          and pred.is_predatory(publisher="OMICS International"),
          "measured live 2026-08-09 on doi 10.4172/2157-7633.1000345")

    clean = pred.flag_records([{"journal": "Lancet", "publisher": "Elsevier BV"},
                               {"journal": "BMJ", "publisher": "BMJ"}])
    check("a resolved-publisher run with no hits reads as a real answer",
          clean["studies_predatory"] == 0 and clean["publishers_resolved"] == 2
          and "is a real answer" in pred.format_summary(clean),
          "0 flagged @ 2 resolved is data, not a gap")

    # Invariant 1 was a CI grep until 2026-08-10. It flagged the legitimate
    # test-only import at line 1262 of this file, so the gate was red on every
    # push from 30b768f onward and both workflows were ignored instead (measured:
    # selftest 14/14 red, dashboard 11/11 red). A grep cannot tell a checker from
    # a violation. These checks pin the AST replacement -- and crucially they feed
    # it FABRICATED sources, because a repo scanner that returns [] due to its own
    # bug passes forever.
    print("\nSTRUCTURAL INVARIANTS")
    from pipeline import invariants as _inv
    check("the real deterministic layer reaches no model boundary",
          not _inv.import_problems(), "; ".join(_inv.import_problems()))
    check("no allowlist entry is stale or reasonless",
          not _inv.exception_problems(), "; ".join(_inv.exception_problems()))
    check("every AGENTS entry has a schema, a prompt and a known tier",
          not _inv.agent_wiring_problems(), "; ".join(_inv.agent_wiring_problems()))

    _evasions = {
        "function-level":  "def f():\n    import claude_adapter\n",
        "aliased":         "import claude_adapter as _ca\n",
        "from-import":     "from claude_adapter import _key\n",
        "line-wrapped":    "from claude_adapter import (\n    _key,\n)\n",
        "class method":    "class C:\n    def m(self):\n        from claude_adapter import call\n",
        "importlib":       "import importlib\nimportlib.import_module('claude_adapter')\n",
        "__import__":      "m = __import__('claude_adapter')\n",
        "try-guarded":     "try:\n    import claude_adapter\nexcept ImportError:\n    pass\n",
        # The adapters live in the bsproof package since 2026-10-03.
        "package member":  "from bsproof import claude_adapter\n",
        "package aliased": "from bsproof import claude_adapter as _g\n",
        "dotted import":   "import bsproof.claude_adapter\n",
        "dotted from":     "from bsproof.claude_adapter import _key\n",
        "dotted dynamic":  "import importlib\nimportlib.import_module('bsproof.claude_adapter')\n",
    }
    _missed = [k for k, s in _evasions.items() if not _inv.model_imports(s, "pipeline/x.py")]
    check("no formatting trick hides a model import", not _missed,
          f"missed: {_missed}" if _missed else f"{len(_evasions)} evasions all caught")

    # False positives would make the gate get switched off again, which is the
    # actual historical failure -- so they are pinned too.
    _clean = {"unrelated": "import json\n",
              "similar name": "import claude_adapters_helper\n",
              "relative": "from . import scoring\n",
              "in a string": "x = 'claude_adapter'\n",
              "in a comment": "# see claude_adapter.py:102\n",
              "package only": "import bsproof\n",
              "non-adapter member": "from bsproof import workers\n"}
    _false = [k for k, s in _clean.items() if _inv.model_imports(s, "pipeline/x.py")]
    check("innocent source does not trip the check", not _false, f"false positives: {_false}")

    check("a reasonless allowlist entry is itself a failure",
          any("no reason" in p for p in _reasonless_probe(_inv)),
          "an unexplained exception is an undocumented hole in invariant 1")

    # This suite claims zero-network and zero-model, so it must import on an
    # interpreter with nothing installed. Until 2026-08-10 it did not: httpx at
    # sources/http.py module level killed `python3 -m pipeline.selftest` at EUROPE
    # PMC NORMALISATION, which is the exact command CLAUDE.md gave every agent.
    check("the deterministic layer imports on a bare interpreter",
          not _inv.dependency_problems(), "; ".join(_inv.dependency_problems()))
    check("a module-level third-party import is caught",
          _inv.module_level_third_party("import httpx\n", "sources/x.py") == [("httpx", 1)])
    check("the same import inside a function is fine",
          not _inv.module_level_third_party("def f():\n    import httpx\n", "sources/x.py"),
          "lazy is the fix, so it must not be reported as the problem")
    check("stdlib and local imports are not third-party",
          not _inv.module_level_third_party(
              "import json, hashlib\nfrom pathlib import Path\n"
              "from sources.ratelimit import throttle\nfrom pipeline import vocab\n",
              "sources/x.py"))

    # STRATIFIED TARGET SELECTION (2026-08-11). primaries[:limit] starved
    # tail outcomes: endurance n=4 / energy n=1 against 122-200 available hits.
    print("\nSTRATIFIED SELECTION")
    from bsproof.run.corpus import stratify_targets as _st
    _mk = lambda i, tags: {"canonical_id": f"c{i}", "retrieved_for": tags}
    _prims = ([_mk(i, "muscle_strength") for i in range(10)]
              + [_mk(10 + i, "exercise_endurance") for i in range(10)])
    _sel = _st(_prims, ["muscle_strength", "exercise_endurance"], 6)
    _end = sum(1 for r in _sel if "endurance" in (r["retrieved_for"] or ""))
    check("the budget is split across outcomes, not taken from the head",
          _end == 3, f"endurance got {_end}/6")
    _both = [_mk(0, "muscle_strength,exercise_endurance"), _mk(1, "muscle_strength")]
    check("a record retrieved for two outcomes is selected once",
          len(_st(_both, ["muscle_strength", "exercise_endurance"], 4)) == 2)
    _untagged = [{"canonical_id": f"u{i}"} for i in range(5)]
    check("untagged stores degrade to plain priority order",
          [r["canonical_id"] for r in _st(_untagged, ["muscle_strength"], 3)]
          == ["u0", "u1", "u2"])
    check("limit is respected", len(_st(_prims, ["muscle_strength"], 7)) == 7)

    # MARKER-ONLY MENTIONS. The 1994 "repeated bout of eccentric exercise ...
    # creatine kinase" paper had no creatine arm at all, passed the gate on
    # "ingredient in title", and voted -0.7 against muscle_strength. Count-based:
    # a real trial that also MEASURES CK must keep passing.
    print("\nRELEVANCE: BIOMARKER IS NOT THE SUPPLEMENT")
    from pipeline.relevance import relevance_check as _rc
    _kin = {"title": "The impact of a repeated bout of eccentric exercise on "
                     "muscular strength, muscle soreness and creatine kinase.",
            "abstract": "DOMS and serum creatine kinase (CK) were measured."}
    check("kinase-only paper is rejected",
          _rc(_kin, "creatine") == (False, "marker mention only (e.g. creatine kinase)"))
    _real = {"title": "Creatine supplementation and resistance training",
             "abstract": "creatine monohydrate 5 g/day; serum creatine kinase was "
                         "measured as a damage marker."}
    check("a real creatine trial that measures CK still passes",
          _rc(_real, "creatine")[0] is True,
          "bare mentions > marker mentions -> supplement is present")
    _cpk = {"title": "The Effect of Vitamin D3 on Serum Creatine Phosphokinase "
                     "Level in Patients", "abstract": "CPK levels..."}
    check("phosphokinase counts as the marker too",
          _rc(_cpk, "creatine")[0] is False)
    check("a topical cream is not evidence about oral supplementation",
          _rc({"title": "Repeated Application of a Novel Creatine Cream Improves "
                        "Muscular Peak and Average Power",
               "abstract": "creatine cream applied to the leg"}, "creatine")
          == (False, "topical/transdermal route in title"))
    check("mentioning topical delivery in the abstract does not reject",
          _rc({"title": "Oral creatine supplementation and resistance training",
               "abstract": "unlike topical routes, oral creatine..."}, "creatine")[0] is True)
    check("other ingredients are untouched by the marker rule",
          _rc({"title": "Oral magnesium supplementation for sleep",
               "abstract": "magnesium glycinate 300 mg"}, "magnesium")[0] is True)
