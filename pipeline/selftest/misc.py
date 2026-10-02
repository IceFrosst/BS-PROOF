"""Selftest group: Predatory venues, structural invariants, anchor band feasibility, stratified selection, relevance, product lookup.

Moved verbatim out of the single pipeline/selftest.py main() on 2026-10-03;
run order is preserved by pipeline/selftest/__init__.py."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import Study, score_ecu, band_for, S_VALUE, standardise_effect, dedup, canonical_id, registry_id, vocab, ROB_CLEAN, rcts, _reasonless_probe  # noqa: F401


def run(check, *, _b2, _ext, _pr):
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
        "class method":    "class C:\n    def m(self):\n        from grok_adapter import call\n",
        "importlib":       "import importlib\nimportlib.import_module('grok_adapter')\n",
        "__import__":      "m = __import__('claude_adapter')\n",
        "try-guarded":     "try:\n    import claude_adapter\nexcept ImportError:\n    pass\n",
        # The adapters live in the bsproof package since 2026-10-03.
        "package member":  "from bsproof import claude_adapter\n",
        "package aliased": "from bsproof import grok_adapter as _g\n",
        "dotted import":   "import bsproof.label_adapter\n",
        "dotted from":     "from bsproof.claude_adapter import _key\n",
        "dotted dynamic":  "import importlib\nimportlib.import_module('bsproof.grok_adapter')\n",
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

    # ANCHOR BAND FEASIBILITY. evaluate() grades a miss but cannot tell you the
    # band was never reachable, so a contradiction between the anchor set and the
    # constants reads as "uncalibrated pipeline". calibration.ceiling_score answers
    # that -- and because it re-derives score_ecu's arithmetic, it must be pinned
    # AGAINST score_ecu or the two drift and the report starts lying.
    print("\nANCHOR BAND FEASIBILITY")
    from pipeline import calibration as _cal
    import pipeline.scoring as _sc

    def _mixed(n_total, n_null):
        base = dict(design_rank=4, n=120, rob_items=ROB_CLEAN, funding="independent",
                    oa="full_text", form_match="exact", dose_match="in_band",
                    pop_match="exact")
        out = [Study(id=f"b{i}", direction="benefit", magnitude="meaningful", **base)
               for i in range(n_total - n_null)]
        out += [Study(id=f"n{i}", direction="null_effect", magnitude="meaningful", **base)
                for i in range(n_null)]
        return out

    _drift = []
    for _p in (0.0, 0.05, 0.10, 0.25, 0.50):
        _r = score_ecu(_mixed(200, int(200 * _p)))
        # score_ecu's c-free part, which is exactly what ceiling_score models
        _actual = 100 * _r["d"] * (1 - _sc.H_PENALTY * _r["H"])
        if abs(_actual - _cal.ceiling_score(_p)) > 0.5:
            _drift.append(f"p={_p}: score_ecu {_actual:.1f} vs ceiling {_cal.ceiling_score(_p):.1f}")
    check("ceiling_score reproduces score_ecu's own arithmetic", not _drift,
          "; ".join(_drift) or "checked at 0/5/10/25/50% null mass")

    check("H rises with disagreement rather than being a free parameter",
          score_ecu(_mixed(200, 0))["H"] == 0.0
          and score_ecu(_mixed(200, 20))["H"] > 0.0,
          "a unanimous corpus has no spread; varying H independently of the null "
          "share overstates every reachable score")

    # PINNED, not asserted as correct. These five tolerances are what the SHIPPED
    # constants imply, and they are the open question in docs/REVIEW_PENDING.md:
    # anchor #1 wants creatine >= +80, which needs >=91% of all extracted claims to
    # be strongest-benefit on the most-studied sports supplement in existence.
    # If S_VALUE, H_PENALTY, H_NORM or a band moves, this goes red ON PURPOSE --
    # that is a founder decision and it must not land silently.
    _feas = {f["id"]: f["max_null_share"] for f in _cal.feasibility()}
    # Re-measured 2026-08-11 after S_VALUE['null_effect'] -0.7 -> -0.35. The
    # tolerances LOOSENED and the anchors are still unreachable, which is the
    # finding: no value of this constant makes a +80 floor achievable (removing
    # the penalty entirely reaches only 20%). See scripts/experiments/penalty_experiment.py.
    _pinned = {"1": 0.1165, "2": 0.086, "3": 0.086, "4": 0.086, "5": 0.1485}
    _moved = [f"anchor {k}: {_feas.get(k)} != {v}" for k, v in _pinned.items()
              if _feas.get(k) is None or abs(_feas[k] - v) > 0.002]
    check("the five confidence-A anchor floors still imply their measured null "
          "tolerances", not _moved,
          "; ".join(_moved) or "6.4-11.1% null mass; see docs/REVIEW_PENDING.md")

    # CLAIM-LEVEL CONTRAST (v1.13). A claim comparing two ingredient arms is
    # about the co-ingredient, not the ingredient -- in either direction.
    _st6 = {}
    _c1 = _ext("doi:10.1/f1", [("null_effect", None)])
    _c1["extraction"]["outcomes"][0]["claim"]["contrast"] = "vs_ingredient_arm"
    _c2 = _ext("doi:10.1/f2", [("null_effect", None)])
    _both_f = _b2([_c1, _c2], _pr, ignore_population=True, stats=_st6)
    check("a vs_ingredient_arm claim does not vote",
          _both_f[0]["evidence"]["n_primaries"] == 1,
          "coingestion-vs-creatine is evidence about the co-ingredient")
    _c3 = _ext("doi:10.1/f3", [("benefit", "meaningful")])
    _c3["extraction"]["outcomes"][0]["claim"]["contrast"] = "vs_ingredient_arm"
    _ben_f = _b2([_c3, _c2], _pr, ignore_population=True)
    check("a vs_ingredient_arm BENEFIT is dropped too (symmetric)",
          _ben_f[0]["evidence"]["n_primaries"] == 1)
    for _cv in (None, "unclear", "vs_ingredient_free", "within_group"):
        _c4 = _ext("doi:10.1/f4", [("null_effect", None)])
        _c4["extraction"]["outcomes"][0]["claim"]["contrast"] = _cv
        _keep_f = _b2([_c4, _c2], _pr, ignore_population=True)
        check(f"contrast={_cv} keeps the claim",
              _keep_f[0]["evidence"]["n_primaries"] == 2)

    # STRATIFIED TARGET SELECTION (2026-08-11). primaries[:limit] starved
    # tail outcomes: endurance n=4 / energy n=1 against 122-200 available hits.
    print("\nSTRATIFIED SELECTION")
    from run_pipeline import stratify_targets as _st
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

    check("no anchor floor is unreachable at zero nulls",
          all(f["max_null_share"] is not None for f in _cal.feasibility()),
          "a floor above +100 would be a typo, not a calibration question")

    print("\nPRODUCT LOOKUP: RECOMPUTING ONE PRODUCT'S DOSE TERM")
    # pipeline/product_score.py answers the label-upload flow. It reuses a
    # retained run's dose-INDEPENDENT arcs and recomputes only the dose term for
    # the dose on the tub, because under SCORING_MODEL v12 that term is the
    # product's closeness to the range where benefit occurred -- a property of
    # the product, not of the run.
    from pipeline import product_score as _ps
    from pipeline import arcs as _A

    # THE REGRESSION THAT MATTERS. Passing no dose must reproduce the run's own
    # composite exactly. If this drifts, the recompute has stopped agreeing with
    # arcs.composite and every number the upload flow shows is its own invention.
    _row = {"outcome_vocab_id": "x", "composite": 45, "outcome": {},
            "components": {"c": 0.9, "H": 0.0}, "evidence": {"n_primaries": 30},
            "arcs": {"effect": {"verdict": 0.1, "coverage": 1.0},
                     "form": {"verdict": 0.2, "coverage": 0.5, "strength": 0.8},
                     "dose": {"verdict": None, "coverage": 0.0, "closeness": None},
                     "evidence": {"coverage": 0.9}},
            "dose": {"low": 5000.0, "high": 20000.0},
            "dose_range_mg": {"low": 5000.0, "high": 20000.0,
                              "basis": "observed_benefit_doses"}}
    _band = _ps._benefit_range(_row)
    check("benefit range is read off the row",
          (_band["low"], _band["high"]) == (5000.0, 20000.0))
    check("no dose reproduces the run's own composite",
          _A.composite(0.1, 0.8, None, 0.9, 0.0)
          == _A.composite(0.1, 0.8, _ps.dosemod.dose_factor_for(None, None, _band), 0.9, 0.0),
          "a missing dose must take MISSING_DOSE_PENALTY, not a recomputed term")

    # The dose axis must actually discriminate, or the whole feature is theatre.
    _inb = _A.composite(0.1, 0.8, _ps.dosemod.dose_factor_for(6000, 6000, _band), 0.9, 0.0)
    _low = _A.composite(0.1, 0.8, _ps.dosemod.dose_factor_for(1000, 1000, _band), 0.9, 0.0)
    check("a dose inside the benefit range outscores one far below it",
          _inb > _low, f"6000 mg -> {_inb}, 1000 mg -> {_low}")

    # A synthetic fixture must never answer a product question. Every number in
    # the demo artifact is invented; it is marked invalid AND caught by name.
    check("the synthetic demo artifact can never back a product answer",
          _ps._is_demo({"run": {"mode": "demo"}, "product": {}})
          and _ps._is_demo({"run": {}, "product": {"ingredient": "demo-creatine"}}))
    check("a real run is not mistaken for the demo",
          not _ps._is_demo({"run": {"mode": "claude-top5-suppl"},
                            "product": {"ingredient": "creatine",
                                        "form": "creatine_monohydrate"}}))
    check("invalid runs cannot back a displayed score",
          "invalid" in _ps.UNUSABLE_STATUSES)

    # Refusals are scope, not discounts. A row that predates arcs.form.strength
    # is refused rather than having the strength inverted out of the rounded
    # composite -- that inversion is lossy (0.800..0.810 all round to 43).
    _stale = dict(_row)
    _stale["arcs"] = dict(_row["arcs"], form={"verdict": 0.2, "coverage": 0.5})
    check("a row with no form strength is refused, not inverted",
          _stale["arcs"]["form"].get("strength") is None)

    # An unscored ingredient and a wrong form are DIFFERENT answers, and neither
    # is a number. Reusing one form's arc for another form would answer a
    # different question at full confidence.
    _mag = _ps.score_product("magnesium", "magnesium_glycinate", 200.0)
    check("an ingredient with no run returns not_scored, never a number",
          _mag["status"] == "not_scored" and "rows" not in _mag)
    # Exercise the compound conversion boundary against a retained artifact
    # without depending on the repository's current run inventory.
    from unittest.mock import patch as _patch
    _art = {"run": {}, "product": {}, "ecu_rows": [_row]}
    with _patch.object(_ps, "_pick_artifact", return_value=(_art, {})):
        _bounded = _ps.score_product("magnesium", "magnesium_citrate", 400.0,
                                     dose_basis="compound")
        _exact = _ps.score_product("magnesium", "magnesium_oxide", 400.0,
                                   dose_basis="compound")
    check("bounded compound product conversion is refused",
          _bounded["status"] == "recompute_refused",
          "never pass a bounded low endpoint as an exact elemental dose")
    check("known compound product conversion is accepted",
          _exact["status"] == "scored",
          "known-form compound input is converted inside score_product")
    # v14: the composite is the signed score rescaled, and the signed score
    # carries the heterogeneity discount. A row without H is refused on the
    # same footing as one without a form strength -- defaulting H to 0 would
    # silently inflate a disputed outcome.
    _no_h = dict(_row, components={"c": 0.9})
    with _patch.object(_ps, "_pick_artifact",
                       return_value=({"run": {}, "product": {}, "ecu_rows": [_no_h]}, {})):
        _refused_h = _ps.score_product("magnesium", "magnesium_oxide", 400.0,
                                       dose_basis="compound")
    check("a row without heterogeneity is refused, not scored at H = 0",
          _refused_h["status"] == "recompute_refused"
          and _refused_h["refused"][0]["reason"] == "artifact_lacks_heterogeneity",
          str(_refused_h.get("refused")))
    check("a recomposed row reports the applicability it was discounted by",
          all(0.0 <= r["applicability"] <= 1.0 for r in _exact["rows"]))
    _hcl = _ps.score_product("creatine", "creatine_hcl", 3000.0)
    check("a form with no run is distinguished from an ingredient with no run",
          _hcl["status"] == "form_not_scored", str(_hcl.get("scored_forms")))

    # Every scored answer carries its validity. Each retained run is currently
    # public_claims_allowed=false, and a caller that cannot see that would
    # publish a claim the registry withheld.
    _av = _ps.available_products()
    check("available products all carry a validity status",
          all(p.get("status") for p in _av), f"{len(_av)} product(s) offered")
    check("no available product claims public-claim approval it was not granted",
          all(p["public_claims_allowed"] is False for p in _av),
          "flip this test the day a run is genuinely validated")
    return {}
