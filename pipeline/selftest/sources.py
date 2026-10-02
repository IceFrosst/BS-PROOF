"""Selftest group: Europe PMC, design classification, ClinicalTrials.gov, assembly, calibration and anchors, synthesis resolution, OA and full text, SR-table inheritance.

Moved verbatim out of the single pipeline/selftest.py main() on 2026-10-03;
run order is preserved by pipeline/selftest/__init__.py."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import Study, score_ecu, band_for, S_VALUE, standardise_effect, dedup, canonical_id, registry_id, vocab, ROB_CLEAN, rcts, _reasonless_probe  # noqa: F401


def run(check, *, _sc):
    print("\nEUROPE PMC NORMALISATION")
    from sources import europepmc as ep
    raw = {"pmid": "123", "doi": "10.1/x", "title": "A trial",
           "authorString": "Smith J, Jones K", "pubYear": "2019",
           "abstractText": "Registered as NCT01234567. Magnesium 400 mg daily.",
           "pubTypeList": {"pubType": ["Randomized Controlled Trial", "Journal Article"]},
           "isOpenAccess": "N", "journalInfo": {"journal": {"title": "J Test"}}}
    n = ep.normalise(raw)
    check("registry id recovered from abstract", n["registration_id"] == "NCT01234567")
    check("primary not misread as synthesis", n["is_synthesis"] is False)
    check("no OA -> abstract_only", n["oa"] == "abstract_only")
    check("fields with no source stay null",
          n["n"] is None and n["country"] is None and n["dose_text"] is None,
          "no invented defaults")
    syn = ep.normalise({**raw, "pubTypeList": {"pubType": ["Meta-Analysis"]},
                        "pmcid": "PMC1"})
    check("meta-analysis classified as synthesis", syn["is_synthesis"] is True)
    check("PMC id -> full_text", syn["oa"] == "full_text")

    print("\nDESIGN CLASSIFICATION (deterministic; S1 is the fallback)")
    from pipeline.classify import classify, classify_all
    def rec(types=(), mesh=(), title=""):
        return {"pub_types": list(types), "mesh_terms": list(mesh), "title": title}

    check("RCT tag -> rank 4",
          classify(rec(["Randomized Controlled Trial"], ["Humans"]))["design_rank"] == 4)
    check("meta-analysis -> rank 2",
          classify(rec(["Meta-Analysis", "Systematic Review"], ["Humans"]))["design_rank"] == 2)
    check("SR without MA -> rank 3",
          classify(rec(["Systematic Review"], ["Humans"]))["design_rank"] == 3)
    check("umbrella review from title -> rank 1",
          classify(rec(["Systematic Review"], ["Humans"], "An umbrella review of..."))["design_rank"] == 1)
    # The rule that saves the most weight: a rigorous animal study is still 12.
    animal = classify(rec(["Randomized Controlled Trial"], ["Animals", "Rats"]))
    check("randomised RAT trial -> rank 12, not 4", animal["design_rank"] == 12,
          "design weight 0.004 vs 1.00 — a 250x error if missed")
    check("animal tag with Humans present stays a trial",
          classify(rec(["Randomized Controlled Trial"], ["Animals", "Humans"]))["design_rank"] == 4,
          "co-tagged translational papers are not animal studies")
    check("editorial -> rank 14", classify(rec(["Editorial"], ["Humans"]))["design_rank"] == 14)
    check("case-control from MeSH -> rank 8",
          classify(rec(["Journal Article"], ["Humans", "Case-Control Studies"]))["design_rank"] == 8)

    amb = classify(rec(["Clinical Trial"], ["Humans"]))
    check("bare 'Clinical Trial' -> needs S1, not a guess",
          amb["needs_model"] and amb["design_rank"] is None,
          "randomised vs not is 1.00 vs 0.55")
    bare = classify(rec())
    check("untagged record -> needs S1", bare["needs_model"] and bare["design_rank"] is None)
    _, cstats = classify_all([rec(["Randomized Controlled Trial"], ["Humans"]), rec()])
    check("classify_all reports S1 call volume",
          cstats["needs_model"] == 1 and cstats["deterministic_pct"] == 50.0,
          f"{cstats['deterministic_pct']}% settled without a model")

    print("\nCLINICALTRIALS.GOV (RoB items 3+4, unpublished flag)")
    from sources import clinicaltrials as ct
    from datetime import date as _date

    def ctrec(reg, start, **kw):
        return {"protocolSection": {"statusModule": {
            "studyFirstSubmitDate": reg,
            "startDateStruct": {"date": start}, **kw}}}

    check("registered before enrolment -> 1",
          ct.item3_prospective_registration(ctrec("2019-04-30", "2019-09-01"))[0] == 1)
    check("registered after enrolment -> 0",
          ct.item3_prospective_registration(ctrec("2016-03-22", "2008-01-01"))[0] == 0)
    check("missing start date -> null, not a guess",
          ct.item3_prospective_registration(ctrec("1999-11-03", None))[0] is None)
    check("same month at month precision -> null",
          ct.item3_prospective_registration(ctrec("2019-04-15", "2019-04"))[0] is None,
          "the answer would depend on a day we do not have")

    done = {"protocolSection": {"statusModule": {
        "overallStatus": "COMPLETED",
        "completionDateStruct": {"date": "2014-12-01"}}}}
    check("completed, no results, overdue -> flagged",
          ct.unpublished_flag(done, today=_date(2026, 8, 6))["flagged"] is True)
    check("results posted -> not flagged",
          ct.unpublished_flag({**done, "hasResults": True},
                              today=_date(2026, 8, 6))["flagged"] is False)
    check("recently completed -> not flagged",
          ct.unpublished_flag(done, today=_date(2015, 1, 1))["flagged"] is False)

    flow = {"resultsSection": {"participantFlowModule": {"periods": [{"milestones": [
        {"type": "STARTED", "achievements": [{"numSubjects": "800"}, {"numSubjects": "805"}]},
        {"type": "COMPLETED", "achievements": [{"numSubjects": "760"}, {"numSubjects": "747"}]}]}]}}}
    a = ct.attrition(flow)
    check("attrition computed from participant flow",
          a["n_started"] == 1605 and a["dropout_rate"] == 0.061,
          f"{a['n_started']} started, dropout {a['dropout_rate']}")
    check("no posted results -> attrition all null",
          ct.attrition({})["dropout_rate"] is None)

    print("\nASSEMBLY (worker JSON -> scored ECU rows)")
    from pipeline.assemble import build_ecus, to_studies, _rob_items
    pv0 = vocab.population_variants()[0]
    axes = {a: pv0[a] for a in vocab.AXES}
    product = {"ingredient": "magnesium", "form_vocab_id": "magnesium_glycinate",
               "population": {"id": pv0["id"], **axes}}

    def ext(cid, form="magnesium_glycinate", direction="benefit", mag="meaningful"):
        return {"record": {"_canonical": cid, "ingredient": "magnesium",
                           "design_rank": 4, "oa": "full_text"},
                "registry": {"item3_prospective": 1, "dropout_rate": 0.05,
                             "n_enrolled": 120},
                "extraction": {
                    "S3": {"extraction_version": "legacy-v1.23",
                           "n_randomised": 120, "population_axes": axes},
                    "S5": {"extraction_version": "legacy-v1.23"},
                    "S4": {"item1_randomisation_method": 1,
                           "item2_double_blind_placebo": 1,
                           "item3_prospective_registration": None,
                           "item4_outcome_matches_registry": 1,
                           "item5_attrition_ok": None, "item6_itt": 1},
                    "S7": {"extraction_version": "legacy-v1.23",
                           "form_vocab_id": form},
                    "S8": {"funding_class": "independent"},
                    "outcomes": [
                        {"claim": {"direction": direction, "magnitude": mag},
                         "outcome_vocab_id": "sleep_onset", "discarded": False},
                        {"claim": {"direction": "null_effect", "magnitude": None},
                         "outcome_vocab_id": "anxiety", "discarded": False},
                        {"claim": {"direction": "benefit", "magnitude": "meaningful"},
                         "outcome_vocab_id": None, "discarded": True}]}}

    corpus = [ext(f"registry:nct{i:08d}") for i in range(6)]
    rows = build_ecus(corpus, product, prompt_version="v1.1")
    by_outcome = {r["outcome_vocab_id"]: r for r in rows}
    check("one ECU row per surviving outcome", set(by_outcome) == {"sleep_onset", "anxiety"},
          "the unmapped claim was DISCARDED, not bucketed")
    check("benefit outcome scores positive", by_outcome["sleep_onset"]["score"] >= 70,
          f"score {by_outcome['sleep_onset']['score']}")
    check("unquantified efficacy nulls are inconclusive, not fixed-negative",
          by_outcome["anxiety"]["score"] == 0,
          f"score {by_outcome['anxiety']['score']} — no signed estimate means zero signed contribution")
    check("provenance stamped on every row",
          by_outcome["sleep_onset"]["provenance"]["vocab_versions"] == vocab.versions())

    # The differentiator, end to end. Founder decision 2026-08-07 moved form OUT
    # of the centre weight, so the same evidence now yields the SAME number for a
    # glycinate and an oxide product; the difference is carried by form_mix and
    # the form arc instead. Asserted either way so the switch stays visible.
    oxide = build_ecus(corpus, {**product, "form_vocab_id": "magnesium_oxide"},
                       prompt_version="v1.1")
    ox_score = {r["outcome_vocab_id"]: r["score"] for r in oxide}["sleep_onset"]
    gly_score = by_outcome["sleep_onset"]["score"]
    if _sc.APPLY_FORM_IN_WEIGHT:
        check("transfer factor discounts a different salt family",
              ox_score < gly_score - 40, f"glycinate {gly_score} -> oxide {ox_score}")
    else:
        check("form no longer changes the number, only the arc",
              ox_score == gly_score,
              f"glycinate {gly_score} == oxide {ox_score}")
        ox_mix = {r["outcome_vocab_id"]: r["form_mix"] for r in oxide}["sleep_onset"]
        gly_mix = by_outcome["sleep_onset"]["form_mix"]
        check("form_mix still records the mismatch the score no longer shows",
              ox_mix != gly_mix, f"{gly_mix} vs {ox_mix}")

    check("registry overrides S4's null on item 3",
          _rob_items({"item3_prospective_registration": None},
                     {"item3_prospective": 1})["i3"] == 1,
          "a date comparison has a right answer")
    check("S4 null with no registry stays null",
          _rob_items({"item3_prospective_registration": None}, None)["i3"] is None)
    check("attrition threshold applied in code, not by a model",
          _rob_items({"item5_attrition_ok": None}, {"dropout_rate": 0.35})["i5"] == 0)
    # S3 now emits the four axes directly (PROMPT_VERSION v1.2). Verify the
    # population axis actually reaches the transfer factor.
    def with_pop(pop):
        e = ext("registry:nct99999999")
        e["extraction"]["S3"]["population_axes"] = pop
        return e
    deficient = {**axes, "deficiency_status": "deficient"}
    _, st_def, _, _ = to_studies(with_pop(deficient)["record"] | {"ingredient": "magnesium"},
                           with_pop(deficient)["extraction"], product)[0]
    _, st_match, _, _ = to_studies(with_pop(axes)["record"] | {"ingredient": "magnesium"},
                             with_pop(axes)["extraction"], product)[0]
    check("population axes are still EXTRACTED and recorded",
          st_def.pop_match != st_match.pop_match,
          f"deficient vs general-adult: {st_def.pop_match} — recorded even though "
          f"APPLY_POP_IN_WEIGHT is off, so re-enabling costs one line")
    _, st_unknown, _, _ = to_studies(
        {"_canonical": "x", "ingredient": "magnesium", "design_rank": 4},
        {"S3": {"extraction_version": "legacy-v1.23"},
         "S5": {"extraction_version": "legacy-v1.23"},
         "S7": {"extraction_version": "legacy-v1.23"},
         "outcomes": [{"claim": {"direction": "benefit"},
                        "outcome_vocab_id": "sleep_onset",
                        "discarded": False}]}, product)[0]
    check("S3 failure -> population unknown, not assumed exact",
          st_unknown.pop_match != "exact", f"pop_match={st_unknown.pop_match}")

    check("missing S8 -> undisclosed, the vocabulary's own value",
          to_studies({"_canonical": "x", "ingredient": "magnesium", "design_rank": 4},
                     {"S3": {"extraction_version": "legacy-v1.23"},
                      "S5": {"extraction_version": "legacy-v1.23"},
                      "S7": {"extraction_version": "legacy-v1.23"},
                      "S8": None, "outcomes": [
                         {"claim": {"direction": "benefit"},
                          "outcome_vocab_id": "sleep_onset", "discarded": False}]},
                     product)[0][1].funding == "undisclosed")

    print("\nCALIBRATION HARNESS (face validity, not magnitude)")
    from pipeline import calibration as cal
    anchors = cal.load()
    check("anchor set structurally valid", not cal.validate(anchors),
          "; ".join(cal.validate(anchors)[:2]) or f"{len(anchors)} anchors")
    ready = cal.readiness(anchors)
    check("every in-scope anchor has a vocabulary entry",
          not ready["missing_ingredients"],
          f"{ready['runnable']}/{ready['in_scope']} runnable"
          + (f", missing {ready['missing_ingredients']}"
             if ready["missing_ingredients"] else ""))
    check("multi-ingredient anchors deferred, not counted as a gap",
          ready["deferred_out_of_scope"] == 1
          and ready["in_scope"] == ready["total"] - 1,
          "v1 is 1-2 ingredient products (SPEC §2)")

    pos = next(a for a in anchors
               if a["band"] == "strong_positive" and a["expected_min"])
    ev = cal.evaluate({pos["id"]: -50}, anchors)
    check("wrong side of zero is a SIGN error, the fatal class",
          len(ev["sign_errors"]) == 1 and not ev["face_valid"],
          "telling users the opposite of the evidence")
    ev = cal.evaluate({pos["id"]: None}, anchors)
    check("gating a well-studied anchor is fatal too",
          ev["gate_errors"] == [pos["id"]] and not ev["face_valid"])
    ev = cal.evaluate({pos["id"]: pos["expected_min"] - 20}, anchors)
    check("right sign, wrong magnitude is NOT fatal",
          len(ev["range_misses"]) == 1 and ev["face_valid"],
          "expected while k and the transfer factors are uncalibrated")
    ev = cal.evaluate({pos["id"]: pos["expected_min"]}, anchors)
    check("in-range anchor passes", ev["passed"] == 1 and ev["face_valid"])
    pair = next((a for a in anchors if a["band"] in cal.PAIR_BANDS), None)
    if pair:
        ev = cal.evaluate({pair["id"]: 0}, anchors)
        check("a pair anchor is not judged against a range",
              ev["skipped_pair_anchors"] == [pair["id"]],
              "it is scored by evaluate_pairs instead")
    # A TYPO used to take the same branch as a pair anchor, so a malformed id was
    # indistinguishable from a deliberately-skipped one and disappeared silently.
    ev = cal.evaluate({"not-an-anchor-id": 50}, anchors)
    check("an unknown anchor id is reported, not silently skipped",
          ev["unknown_ids"] == ["not-an-anchor-id"] and not ev["skipped_pair_anchors"])

    # RELATIONAL ANCHORS (2026-08-11). 14 of 35 rows -- 40% of the set, and the only
    # SCALE-FREE ones -- were merely skipped before this, so ANCHORS.md's "cleanest
    # available tests of the moat" had never once run.
    print("\nRELATIONAL ANCHORS (the moat tests)")
    check("every pair row carries a machine-readable relationship",
          all((a.get("pair_id") or "").strip()
              and (a.get("pair_expect") or "").strip() in cal.PAIR_EXPECT
              for a in anchors if a["band"] in cal.PAIR_BANDS),
          "the expectation used to live only in ANCHORS.md prose")
    check("all 7 pairs are complete and internally consistent",
          not [p for p in cal.validate(anchors) if p.startswith("pair ")])
    # D3 must beat D2. ANCHORS.md:203: if these come out equal "the form factor is
    # not being applied and the product's core differentiator is dead."
    check("a correct form pair passes",
          cal.evaluate_pairs({"22a": 20, "22b": 60}, anchors)["relationally_valid"])
    _inv = cal.evaluate_pairs({"22a": 60, "22b": 20}, anchors)
    check("an INVERTED form pair is a fatal pair_error",
          not _inv["relationally_valid"] and _inv["pair_errors"][0]["pair"] == "22",
          "D3 below D2 means the transfer model is backwards, not imprecise")
    # #26 reads the OPPOSITE way: it fires when the higher dose scores higher.
    check("the dose false-positive guard passes when doses score alike",
          cal.evaluate_pairs({"26a": 40, "26b": 45}, anchors)["relationally_valid"])
    check("the dose false-positive guard FIRES when the loading dose scores higher",
          not cal.evaluate_pairs({"26a": 20, "26b": 80}, anchors)["relationally_valid"],
          "a monotone dose factor would penalise correctly-dosed products")
    check("a gated pair member is incomplete, not an error",
          cal.evaluate_pairs({"22a": None, "22b": 60}, anchors)["relationally_valid"]
          and cal.evaluate_pairs({"22a": None, "22b": 60}, anchors)["incomplete"],
          "a gate is already fatal in evaluate(); never count it twice")

    # EXTERNAL BAND DERIVATION (2026-08-11). A band derived from a published
    # mixture is the only non-circular kind: this module's docstring forbids
    # tuning to make an anchor pass, and until today every range in anchors.csv
    # was uncited judgement.
    _m = [cal.mixture_score(p, 20 - p)["score"] for p in (0, 5, 10, 15, 20)]
    check("a derived band rises monotonically with the positive share",
          all(a < b for a, b in zip(_m, _m[1:])), str(_m))
    check("a unanimous null mixture derives a NEGATIVE band",
          cal.mixture_score(0, 20)["score"] < 0,
          f"{cal.mixture_score(0, 20)['score']} -- if this ever goes >= 0 the "
          f"score cannot say 'no' and the tool is not measuring")
    check("unsized benefits derive a far lower band than sized ones",
          cal.mixture_score(20, 0, magnitude="trivial")["score"]
          < cal.mixture_score(20, 0)["score"] / 2,
          f"{cal.mixture_score(20, 0, magnitude='trivial')['score']} vs "
          f"{cal.mixture_score(20, 0)['score']} -- an all-positive corpus of "
          f"UNSIZED benefits caps near +30, which is why anchors 1-5 look unreachable")
    _row = {"id": "T", "band": "strong_positive", "expected_min": 80,
            "expected_max": 95, "source_doi": "10.x/y", "source_kind": "cochrane"}
    _big = cal.derived_band({**_row, "n_positive": 18, "n_null": 2})
    _small = cal.derived_band({**_row, "n_positive": 3, "n_null": 1})
    check("band WIDTH is derived from the evidence, not chosen",
          (_big["max"] - _big["min"]) < (_small["max"] - _small["min"]),
          f"20 trials -> {_big['min']}..{_big['max']}, "
          f"4 trials -> {_small['min']}..{_small['max']}; one reclassified trial "
          f"moves a small review much further, so precision follows the corpus")
    check("an unfilled anchor row derives nothing rather than guessing",
          cal.derived_band(_row) is None,
          "a row with no recorded mixture must keep its hand-written range and "
          "be reported as uncited")
    _partial = cal.validate([{**_row, "tests": [], "pair_id": "", "pair_expect": "",
                              "n_trials": "", "n_positive": "18", "n_null": ""}])
    check("a HALF-FILLED positive/null pair is a loud validation error",
          any("must be filled together" in p for p in _partial),
          "derived_band silently returns None on a partial row, so a row that "
          "looks cited would keep grading against its uncited range")
    # The normal state of a cited row: the review says how many trials it pooled
    # and publishes a pooled effect, but never a per-trial split. Measured
    # 2026-08-11: 0 of 14 creatine syntheses publish the split. If this state were
    # invalid, the next person filling anchors.csv would be pushed into inventing it.
    check("n_trials WITHOUT a per-trial split is a legal cited row",
          not cal.validate([{**_row, "tests": [], "pair_id": "", "pair_expect": "",
                             "n_trials": "21", "n_positive": "", "n_null": ""}]),
          "'21 trials, pooled SMD 0.43, split not published' is what syntheses "
          "actually report; requiring the split would invite fabricating it")
    _uncited = cal.validate([{**_row, "tests": [], "pair_id": "", "pair_expect": "",
                              "n_trials": "20", "n_positive": "18", "n_null": "2",
                              "source_doi": ""}])
    check("a mixture with no source_doi is rejected",
          any("no source_doi" in p for p in _uncited),
          "an uncited mixture is judgement wearing a number's clothes")

    # V8-COHERENT BAND DERIVATION (2026-08-12). Deriving a band by counting
    # labels is vote counting -- the defect v8 removed from the run path -- so a
    # label-derived band and a v8+ run sit on DIFFERENT scales. The pooled route
    # puts them on the same one, and it is the only route the literature feeds:
    # 0 of 14 syntheses publish a per-trial split; nearly all publish a pooled
    # effect with a CI.
    _ps = cal.pooled_score(0.43)
    check("a published pooled SMD derives a centre on the v8 scale",
          _ps["score"] == 38 and abs(_ps["d"] - 0.383) < 1e-9,
          "0.43 SMD -> s +0.383 -> 38: what our formula says about trials that "
          "MEASURE the strongest published creatine-strength estimate")
    _row_p = {"id": "1", "band": "strong_positive", "expected_min": 80,
              "expected_max": 95, "source_doi": "10.x", "source_kind": "meta_analysis",
              "pooled_effect": "0.43 SMD [0.25,0.61]", "n_trials": "14"}
    _db = cal.derived_band(_row_p)
    check("the band WIDTH comes from the published CI",
          _db["route"] == "pooled_smd_ci" and _db["min"] == 8 and _db["max"] == 68,
          "edges are the scores at the CI bounds, so the width is the published "
          "estimate's own precision -- and 80..95 sits entirely outside it")
    check("the pooled route beats the label mixture when both exist",
          cal.derived_band({**_row_p, "n_positive": 18, "n_null": 2})["route"]
          == "pooled_smd_ci",
          "a label mixture is vote counting; prefer the same-scale derivation")
    check("a WMD row falls back rather than being misread as SMD",
          cal.derived_band({**_row_p, "pooled_effect": "4.43 WMD kg [3.12,5.75]",
                            "n_positive": "", "n_null": ""}) is None,
          "4.43 read as an SMD would derive a +100..+100 band from a kg number")

    # V8-COHERENT LADDER AND DOSE BAND (2026-08-12). Both used to read the
    # direction LABEL; once effects are measured, label and contribution
    # disagree in both directions.
    from pipeline.arcs import form_strength as _fs
    _lad = lambda d, e: Study(id=f"l{d}{e}", design_rank=4, n=60, rob_items=ROB_CLEAN,
                              funding="independent", oa="full_text",
                              form_match="exact", pop_match="exact", direction=d,
                              magnitude="meaningful" if d == "benefit" else None,
                              effect_s=e, effect_route="smd" if e is not None else "label")
    check("a null that MEASURED a positive effect earns form-ladder credit",
          _fs([_lad("null_effect", 0.38)], None)[1] == "ladder",
          "the label rule filed 'tested in your form, effect favoured it' as "
          "all_negative_in_form")
    check("a benefit that MEASURED a sub-threshold effect earns none",
          _fs([_lad("benefit", -0.25)], None)[1] == "all_negative_in_form",
          "s < 0 is evidence against a MEANINGFUL effect in this form, whatever "
          "the significance label said")
    check("unsized studies ladder exactly as before",
          _fs([_lad("benefit", None)], None)[1] == "ladder"
          and _fs([_lad("null_effect", None)], None)[1] == "all_negative_in_form",
          "pre-v1.17 corpora must produce identical ladders")
    _ent = lambda d, s_, dose: {"dose_low_mg": dose, "dose_high_mg": dose,
                                "direction": d, "weight": 1.0, "s": s_}
    from pipeline import dose as _dosemod
    _er = _dosemod.effective_range(
        [_ent("null_effect", 0.68, 5000), _ent("benefit", -0.25, 9000),
         _ent("benefit", None, 3000)])
    check("the dose band is s-aware: a measured-positive null joins the band",
          _er["low"] == 3000 and _er["high"] == 5000,
          f"{_er} -- 5000 (null label, s +0.68) is a dose at which the "
          f"ingredient worked; 9000 (benefit label, s -0.25) is not; 3000 "
          f"(unsized benefit) falls back to its label")

    # ORDINAL STRATA. Replaces testing the numeric window, which ANCHORS.md:274 says
    # was judgement, and which measurement showed unsatisfiable for anchors 1-5.
    _st = cal.evaluate_strata({"1": 6}, anchors)
    check("a 3-tier stratum miss is reported",
          _st["off_by_more"] and _st["off_by_more"][0]["tiers_off"] == -3,
          "anchor 1 claims 'strong support'; +6 is 'inconclusive'")
    check("one tier of slack is tolerated while constants are uncalibrated",
          cal.evaluate_strata({"6": 75}, anchors)["off_by_more"] == [],
          "anchor 6 claims moderate support; strong support is one tier off")

    print("\nSYNTHESIS RESOLUTION (the dedup trap, from the SR side)")
    from pipeline import synthesis as syn
    corpus_rows = [{"canonical_id": "registry:nct00000001", "registration_id": "NCT00000001"},
                   {"canonical_id": "doi:101abc", "doi": "10.1/ABC"},
                   {"canonical_id": "pmid:555", "pmid": "555"}]
    idx = syn.known_index(corpus_rows)
    s2_good = {"extraction_complete": True,
               "rob_table": [{"study_label": "Smith 2019", "overall": "low"},
                             {"study_label": "Jones 2018", "overall": "unclear"}],
               "included_studies": [{"label": "Smith 2019", "nct": "NCT00000001"},
                                    {"label": "Jones 2018", "doi": "10.1/abc"},
                                    {"label": "Lee 2017", "pmid": "555"},
                                    {"label": "Unknown 2016"}]}
    r = syn.resolve_included(s2_good, idx)
    check("included studies map to the SAME canonical ids as the primaries",
          r["included_ids"] == {"registry:nct00000001", "doi:101abc", "pmid:555"},
          "otherwise the SR row and the paper are two units")
    check("unresolvable rows counted, never approximated",
          r["unresolved_labels"] == ["Unknown 2016"])
    check("resolved when most rows map", r["resolved"] is True,
          f"{r['resolved_fraction']:.0%} resolved")

    # Founder 2026-08-07: q_s must NOT depend on how much of the review we
    # already hold. A Cochrane review of 30 trials where we have 6 was scored 0
    # and DISCARDED, while a thin review of 4 where we had 3 scored 1.00 -- the
    # better review was punished for covering more than our retrieval reached.
    # Overlap belongs to `cov` in score_ecu, which handles it smoothly.
    mostly_unknown = {"extraction_complete": True, "included_studies":
                      [{"label": f"X{i}"} for i in range(9)]
                      + [{"label": "Y", "nct": "NCT00000001"}],
                      "review_methods": {"protocol_registered": True,
                                         "databases_searched": 4,
                                         "duplicate_selection": True,
                                         "rob_assessed": True,
                                         "heterogeneity_assessed": True,
                                         "publication_bias_assessed": True,
                                         "review_funding": "independent"}}
    r2 = syn.resolve_included(mostly_unknown, idx)
    check("low corpus overlap does NOT reduce a review's quality",
          r2["resolved"] is True and syn.quality(mostly_unknown, r2) == syn.Q_REVIEW["high"],
          f"{r2['resolved_fraction']:.0%} of its trials are ours — irrelevant to q_s")
    check("overlap still reaches the score, through cov not q_s",
          "included_ids" in r2 and len(r2["included_ids"]) == 1,
          "score_ecu computes cov = |included ∩ P| / |P|")

    no_list = syn.resolve_included({"extraction_complete": True,
                                    "included_studies": []}, idx)
    check("a document with NO included list is not a synthesis",
          no_list["resolved"] is False
          and syn.quality({"included_studies": []}, no_list) == syn.Q_UNRESOLVED)

    # The checklist reads the REVIEW's reported methodology, and an unreported
    # item is dropped rather than failed (invariant 5).
    thin = {"extraction_complete": True, "rob_table": [],
            "included_studies": [{"label": "A", "nct": "NCT00000001"}],
            "review_methods": {"protocol_registered": None,
                               "databases_searched": 1,
                               "duplicate_selection": None,
                               "rob_assessed": False,
                               "heterogeneity_assessed": None,
                               "publication_bias_assessed": False,
                               "review_funding": "industry"}}
    tr = syn.resolve_included(thin, idx)
    band, hits, answered = syn.review_band(syn.review_items(thin))
    check("a review reporting little scores the LOW band",
          band == "low" and syn.quality(thin, tr) == syn.Q_REVIEW["low"],
          f"{hits} items passed of {answered} answered")
    check("unreported items are dropped, not counted as failures",
          answered == 4, "3 nulls stayed out of the denominator")
    check("an S2 output with no review_methods is LOW, never assumed good",
          syn.quality({"extraction_complete": True, "rob_table": [],
                       "included_studies": [{"label": "A"}]},
                      {"resolved": True}) == syn.Q_NO_METHODS_REPORTED)

    # SR characteristics tables name trials "Smith 2019", not by DOI. Measured:
    # 36 included studies from 3 real reviews resolved ZERO without this tier.
    ay_corpus = [{"canonical_id": "doi:jones", "first_author": "Jones A", "year": 2018},
                 {"canonical_id": "doi:smith1", "first_author": "Smith J", "year": 2019},
                 {"canonical_id": "doi:smith2", "first_author": "Smith K", "year": 2019}]
    ay_idx = syn.known_index(ay_corpus)
    ay_res = syn.resolve_included(
        {"extraction_complete": True, "included_studies": [
            {"label": "Jones 2018", "first_author": "Jones A", "year": 2018},
            {"label": "Smith 2019", "first_author": "Smith", "year": 2019}]}, ay_idx)
    check("author+year resolves an SR row with no DOI",
          "doi:jones" in ay_res["included_ids"],
          "without this tier SR inheritance yields nothing")
    check("ambiguous author+year REFUSES rather than merging two trials",
          ay_res["unresolved_labels"] == ["Smith 2019"],
          "two different Smith 2019 studies exist in the corpus")

    s2_strong = {**s2_good,
                 "review_methods": {"protocol_registered": True,
                                    "databases_searched": 3,
                                    "duplicate_selection": True,
                                    "rob_assessed": True,
                                    "heterogeneity_assessed": True,
                                    "publication_bias_assessed": None,
                                    "review_funding": "undisclosed"}}
    check("a well-conducted review scores the HIGH band",
          syn.quality(s2_strong, r) == syn.Q_REVIEW["high"])
    check("a present RoB table proves rob_assessed without the model saying so",
          syn.review_items({"rob_table": [{"study_label": "A", "overall": "low"}],
                            "review_methods": {}})["rob_assessed"] is True)
    check("incomplete extraction caps quality however good the review",
          syn.quality({**s2_strong, "extraction_complete": False}, r)
          == syn.Q_INCOMPLETE_CAP)
    check("'unclear' RoB is dropped, not mapped to a band",
          syn.inherited_rob(s2_good) == {"Smith 2019": "low"},
          "an unclear judgment is not a judgment")

    # The trap itself, from the synthesis side: many SRs over the same trials.
    p9 = rcts(9)
    thirty = [syn.to_scoring_input(
        {"extraction_complete": True, "rob_table": [],
         "included_studies": [{"label": f"p{i}", "pmid": f"{i}"} for i in range(9)]},
        {str(i): f"p{i}" for i in range(9)}) for _ in range(30)]
    trapped = score_ecu(p9, thirty)
    check("30 RESOLVED syntheses over 9 RCTs still bounded",
          trapped["E_prime"] / trapped["E"] <= 1.31,
          f"E'/E = {trapped['E_prime']/trapped['E']:.2f}")

    print("\nSEARCHED-BUT-UNSCORABLE OUTCOMES")
    empty = build_ecus([], product, prompt_version="t",
                       searched_outcomes=["sleep_quality", "anxiety"])
    check("an outcome we searched for still gets a row", len(empty) == 2,
          "sleep vanished from the magnesium table entirely -- indistinguishable "
          "from an outcome nobody had ever asked about")
    check("it reports no evidence rather than a score",
          all(r["composite"] is None and r["gate_fired"] for r in empty))
    check("its arcs are empty, not zero",
          all(a["verdict"] is None and a["coverage"] == 0.0
              for r in empty for a in r["arcs"].values()),
          "'looked and found nothing' must not render as 'scored zero'")
    check("it is flagged for the reader",
          all("searched_no_usable_evidence" in r["flags"] for r in empty))
    mixed = build_ecus(corpus, product, prompt_version="t",
                       searched_outcomes=["sleep_onset", "muscle_cramps"])
    by_id = {r["outcome_vocab_id"]: r for r in mixed}
    check("a searched outcome that WAS scored is not duplicated",
          by_id["sleep_onset"]["composite"] is not None,
          "already scored -- must not be overwritten by an empty row")
    check("a searched outcome with no evidence is added alongside",
          by_id["muscle_cramps"]["composite"] is None
          and "searched_no_usable_evidence" in by_id["muscle_cramps"]["flags"])

    print("\nGREEN OA RESOLUTION")
    from sources import oa as oamod
    oa_work = {"best_oa_location": {"is_oa": True, "pdf_url": "http://x/y.pdf",
                                    "version": "publishedVersion", "license": "cc-by",
                                    "source": {"type": "repository"}},
               "referenced_works": ["W1", "W2", "W3"]}
    closed = {"best_oa_location": {"is_oa": False}}
    check("OA location normalised",
          oamod.oa_location(oa_work)["url"] == "http://x/y.pdf")
    check("closed access -> None, a real answer",
          oamod.oa_location(closed) is None)
    check("reference list available for SR resolution",
          len(oamod.referenced_work_ids(oa_work)) == 3,
          "narrows S2's search space; never decides membership")
    check("reference ids are OPENALEX ids, and the name now says so",
          oamod.referenced_work_ids({"referenced_works": ["W1"]}) == ["W1"]
          and not oamod.referenced_work_ids({"referenced_works": ["W1"]})[0].startswith("10."),
          "the old name promised DOIs and returned W-ids")
    check("europepmc full_text short-circuits the lookup",
          oamod.resolve({"oa": "full_text", "doi": "10.1/x"})["checked"] == ["europepmc"],
          "free answer wins")
    check("no DOI -> nothing to resolve against",
          oamod.resolve({"oa": "abstract_only", "doi": None})["checked"] == [])
    # Force the unconfigured state. Reading it from the ambient environment made
    # this check pass only on machines with no BSPROOF_CONTACT_EMAIL set -- it
    # failed for anyone who had actually configured OA resolution, which is
    # backwards. The selftest must not depend on the shell it is run from.
    _saved = oamod.CONTACT_EMAIL
    try:
        oamod.CONTACT_EMAIL = None
        try:
            oamod.unpaywall("10.1/x")
            gated = False
        except oamod.ContactEmailMissing:
            gated = True
    finally:
        oamod.CONTACT_EMAIL = _saved
    check("Unpaywall RAISES without an email, never returns 'no OA'", gated,
          "a silent miss is indistinguishable from a paywalled paper")

    print("\nFULL TEXT (JATS parsing, SR tables)")
    from sources import fulltext as ft
    jats = """<article><front><article-meta><abstract><p>Short abstract.</p>
      </abstract></article-meta></front><body>
      <sec><title>Materials and Methods</title><p>Randomised, double-blind.</p></sec>
      <sec><title>Results</title><p>PSQI improved by 2.1 points.</p></sec>
      <sec><title>Discussion</title><p>We conclude it works.</p></sec>
      <table-wrap><label>Table 1</label><caption><p>Characteristics of included
        studies</p></caption><table><tr><th>Author</th><th>Year</th><th>Dose</th>
        <th>Duration</th></tr><tr><td>Smith</td><td>2019</td><td>400 mg</td>
        <td>8 wk</td></tr></table></table-wrap>
      <table-wrap><label>Table 2</label><caption><p>Adverse events</p></caption>
        <table><tr><th>Event</th><th>n</th></tr><tr><td>Nausea</td><td>3</td></tr>
        </table></table-wrap></body></article>"""
    sec = ft.sections(jats)
    check("JATS sections parsed", set(sec) == {"methods", "results", "discussion"})
    check("'Materials and Methods' matched as methods",
          "double-blind" in sec["methods"],
          "S4 must see methods, not the discussion's confidence")
    check("results kept separate from discussion",
          "PSQI" in sec["results"] and "PSQI" not in sec["discussion"],
          "S5 reads numbers; spin lives in the discussion")
    tabs = ft.extract_tables(jats)
    check("tables keep row structure", len(tabs) == 2 and tabs[0]["rows"][1][2] == "400 mg",
          "flattening a characteristics table loses which dose is whose")
    inc = [t for t in tabs if ft.looks_like_included_studies(t)]
    check("included-studies table identified, adverse-events table not",
          len(inc) == 1 and "included" in (inc[0]["caption"] or "").lower(),
          "a FILTER for S2, not a decision")
    check("unparseable XML -> empty, never a partial guess",
          ft.sections("<not xml") == {} and ft.extract_tables(None) == [])
    txt, tier = ft.best_text({"pmcid": None, "abstract": "Only an abstract."})
    check("no full text -> abstract tier is REPORTED, not assumed",
          tier == "abstract_only" and txt == "Only an abstract.",
          "silently calling an abstract full_text inflates every score on it")

    print("\nFULL-TEXT LADDER (3 sources, not 1)")
    import json as _json
    check("free Europe PMC URLs are captured, subscription ones dropped",
          [u["style"] for u in ep.free_fulltext_urls({"fullTextUrlList": {"fullTextUrl": [
              {"availability": "Subscription required", "documentStyle": "doi", "url": "a"},
              {"availability": "Free", "documentStyle": "pdf", "url": "b"},
              {"availability": "Open access", "documentStyle": "html", "url": "c"}]}})]
          == ["pdf", "html"],
          "a link we cannot open is not a source; counting it inflates the OA rate")
    check("pdf extraction is OPTIONAL at runtime",
          isinstance(ft.pdf_available(), bool),
          "a machine without pypdf must still run the pipeline")
    # This gate is offline. A fake URL is still a real network attempt when
    # optional PDF support is installed; stub the transport, not the parser.
    from unittest.mock import patch
    with patch.object(ft, "fetch_pdf_text", return_value=None) as pdf_fetch:
        check("a stored oa_location (JSON string) is parsed, not crashed on",
              ft.best_text({"pmcid": None, "abstract": "x",
                            "oa_location": _json.dumps({"url": "http://nope/x.pdf"})})[1]
              == "abstract_only"
              and pdf_fetch.call_args is not None
              and pdf_fetch.call_args.args == ("http://nope/x.pdf",),
              "storage round-trips it as text; an unreadable copy stays abstract_only")
    check("a too-short extraction is REFUSED",
          ft.MIN_USABLE_CHARS >= 1000,
          "a 200-char PDF is a cover page; handing it to S4 as methods "
          "produces confident nonsense")

    # The wiring that made the ladder matter: the filter must accept records
    # whose full text is reachable OFF PubMed Central.
    import run_pipeline as _rp
    kept = _rp._prioritize_primaries(
        [{"oa": "full_text", "year": 2020},
         {"oa": "abstract_only", "year": 2020, "oa_location": {"url": "x.pdf"}},
         {"oa": "abstract_only", "year": 2020}],
        full_text_only=True)
    check("green-OA records survive the full-text filter", len(kept) == 2,
          "they were being dropped BEFORE best_text could read them, "
          "which made the whole ladder dead weight")

    print("\nSR-TABLE INHERITANCE PAYLOAD")
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    # ONE payload builder, shared by run_sr_inheritance and the scored pipeline.
    # They had drifted: only the script sent tables, so every S2 call inside a
    # scored run was reading flattened prose and resolved 0 of 12.
    pay = syn.s2_payload({"title": "An SR"}, jats)
    inc = [t for t in pay["tables"] if "included" in (t["caption"] or "").lower()]
    check("the included-studies table reaches S2 with its rows intact",
          pay["table_filter_hit"] and inc and inc[0]["rows"][1][2] == "400 mg",
          "prose would lose which dose belongs to which trial")
    check("methods included, discussion not",
          "double-blind" in pay["methods"] and "conclude" not in pay["methods"])
    no_match = """<article><body><table-wrap><caption><p>Baseline data</p></caption>
      <table><tr><th>Age</th></tr><tr><td>44</td></tr></table></table-wrap></body></article>"""
    pay2 = syn.s2_payload({"title": "x"}, no_match)
    check("filter miss falls back to all tables, never to nothing",
          pay2["table_filter_hit"] is False and len(pay2["tables"]) == 1,
          "the heuristic filters; S2 decides")
    check("no full text -> no tables, and the caller must not read that as "
          "'this review lists no studies'",
          syn.s2_payload({"title": "x"}, None)["tables"] == [])

    # A cap of 12 must buy 12 USABLE reviews. store.studies() has no ORDER BY,
    # so the cap was an arbitrary slice: measured on a 462-synthesis store, the
    # first 12 rows held 7 with no PMC id and 3 never classified.
    from pipeline.synthesis_bridge import rank_syntheses
    ranked = rank_syntheses([
        {"canonical_id": "closed-umbrella", "pmcid": "", "design_rank": 1, "year": 2024},
        {"canonical_id": "unclassified-oa", "pmcid": "PMC3", "design_rank": None, "year": 2024},
        {"canonical_id": "oa-sr-old", "pmcid": "PMC1", "design_rank": 3, "year": 2015},
        {"canonical_id": "oa-ma-new", "pmcid": "PMC2", "design_rank": 2, "year": 2024},
    ])
    check("unreadable reviews sort LAST however good they are",
          ranked[-1]["canonical_id"] == "closed-umbrella",
          "no full text -> no table -> the call cannot produce anything")
    check("among readable ones, the strongest design wins",
          [r["canonical_id"] for r in ranked[:3]]
          == ["oa-ma-new", "oa-sr-old", "unclassified-oa"],
          "unclassified sorts after real ranks, not before")

    # SCALING SRs WITHOUT DUPLICATING EVIDENCE. Two reviews describe the same
    # trial and disagree. Resolution already collapses them to one canonical id;
    # merge_inherited decides which facts survive that collapse.
    revA = {"review_id": "sr:A", "included_ids_by_row": {0: "doi:t1"},
            "s2": {"included_studies": [{"label": "Smith 2019", "n": 40,
                                         "form": "magnesium_glycinate",
                                         "dose_text": "400 mg"}],
                   "rob_table": [{"study_label": "Smith 2019", "overall": "low"}]}}
    revB = {"review_id": "sr:B", "included_ids_by_row": {0: "doi:t1"},
            "s2": {"included_studies": [{"label": "Smith 2019", "n": 44,
                                         "form": "magnesium_glycinate",
                                         "dose_text": "400 mg"}],
                   "rob_table": [{"study_label": "Smith 2019", "overall": "high"}]}}
    m = syn.merge_inherited([revA, revB])["doi:t1"]
    check("two reviews describing one trial stay ONE unit",
          len(syn.merge_inherited([revA, revB])) == 1,
          "canonical id collapses them; that is the dedup")
    check("disagreeing RoB takes the WORST band, and says it disagreed",
          m["rob"] == "high" and "rob" in m["conflicts"],
          "the kinder judgement would let a product shop for a friendly review")
    check("disagreeing n is REFUSED, not averaged",
          m["n"] is None and "n" in m["conflicts"],
          "40 vs 44 usually means different arms; guessing changes size_factor")
    check("unanimous facts survive",
          m["form"] == "magnesium_glycinate" and m["dose_text"] == "400 mg")
    check("provenance recorded for every merged trial",
          m["sources"] == ["sr:A", "sr:B"] and m["n_reviews"] == 2,
          "n_reviews is auditing, NEVER a corroboration signal — "
          "reviews copy each other's inclusion lists")

    # Invariant 6 restated as a test: syntheses cannot add mass however many
    # we read. 30 reviews of the same 9 trials must not move E.
    from pipeline.scoring import Study as _S, score_ecu as _score
    prim = [_S(id=f"t{i}", design_rank=4, n=100, oa="full_text",
               rob_items={"a": 1, "b": 1, "c": 1, "d": 1, "e": 1},
               direction="benefit", magnitude="meaningful") for i in range(9)]
    one_sr = [{"included_ids": {f"t{i}" for i in range(9)}, "q_s": 1.0,
               "resolved": True}]
    many_sr = one_sr * 30
    check("30 reviews of the same trials lift E exactly as much as 1",
          _score(prim, one_sr)["score"] == _score(prim, many_sr)["score"],
          "score_ecu takes the MAX cov, not a sum — invariant 6 by construction")

    print("\nSR-TABLE TRIALS ENTER EVIDENCE MASS (invariant 6 amended 2026-08-08)")
    _sr_w = _S(id="x", design_rank=4, n=60, rob_items={}, rob_band_direct="low",
               rob_inherited=True, funding="undisclosed", oa="sr_table").weight()
    _direct_w = _S(id="y", design_rank=4, n=60, rob_items={}, rob_band_direct="low",
                   funding="undisclosed", oa="full_text").weight()
    check("second-hand facts cost 28% of the weight",
          abs(_sr_w / _direct_w - 0.85 * 0.85) < 1e-9,
          f"{_sr_w / _direct_w:.4f} = oa sr_table 0.85 x rob_inherited 0.85")
    check("a review's overall RoB band is used WITHOUT inventing six items",
          _S(id="x", design_rank=4, n=60, rob_items={}, rob_band_direct="high",
             rob_inherited=True).weight()
          < _S(id="x", design_rank=4, n=60, rob_items={}, rob_band_direct="low",
               rob_inherited=True).weight(),
          "synthesising items to hit a hit-count would be inventing data")

    facts = {"t1": {"design": "randomised, double-blind", "n": 40, "rob": "low",
                    "sources": ["sr:A"], "conflicts": []},
             "t2": {"design": "randomised", "n": 20, "sources": ["sr:A"],
                    "conflicts": []},
             "t3": {"design": None, "n": 30, "sources": ["sr:A"], "conflicts": []},
             "t4": {"design": "randomised", "n": 10, "sources": ["sr:A"],
                    "conflicts": []}}
    dirs = {"t1": {"PSQI": {"direction": "benefit", "magnitude": "meaningful"}},
            "t2": {},
            "t3": {"PSQI": {"direction": "benefit"}},
            "t4": {"PSQI": {"direction": None, "_conflict": True}}}
    recs, st = syn.derived_studies(facts, held_ids={"t9"}, directions=dirs)
    got = {r["_canonical"] for r in recs}
    check("a trial with a direction and a design is emitted",
          got == {"t1"}, f"emitted {sorted(got)}")
    check("NO DIRECTION is discarded, never defaulted to null_effect",
          st["no_direction"] == 1,
          "Study.direction defaults to -0.7 — the most dangerous default here")
    check("NO DESIGN is discarded", st["no_design"] == 1,
          "design_rank spans a 250x weight range; assuming RCT is not free")
    check("reviews disagreeing about what a trial FOUND is discarded",
          st["direction_conflict"] == 1,
          "the one fact that cannot be averaged or under-counted")
    held_out, _ = syn.derived_studies(facts, held_ids={"t1"}, directions=dirs)
    check("a trial we already hold is NOT added a second time",
          not held_out, "this is the double-count invariant 6 exists to stop")

    check("non-randomised is not promoted to RCT by substring",
          syn.design_rank_from_text("non-randomised open trial") == 5
          and syn.design_rank_from_text("randomised crossover") == 4,
          "'randomis' is inside 'non-randomis' — order is load-bearing")
    check("a design we cannot read stays None",
          syn.design_rank_from_text("multi-centre") is None)

    r2t = syn.results_by_trial([
        {"review_id": "A", "included_ids_by_row": {0: "t1"},
         "s2": {"included_studies": [{"label": "Smith 2019"}],
                "results_table": [{"study_label": "Smith 2019", "outcome_raw": "PSQI",
                                   "direction": "benefit"}]}},
        {"review_id": "B", "included_ids_by_row": {0: "t1"},
         "s2": {"included_studies": [{"label": "Smith 2019"}],
                "results_table": [{"study_label": "Smith 2019", "outcome_raw": "PSQI",
                                   "direction": "harm"}]}}])
    check("two reviews reporting opposite findings cancel to a conflict",
          r2t["t1"]["PSQI"]["_conflict"] and r2t["t1"]["PSQI"]["direction"] is None,
          "picking one would manufacture a result for a trial nobody can check")

    # A review often gives a trial's numbers without ever saying in words
    # whether it worked. "The CI spans the null" is arithmetic, not judgement.
    check("a CI spanning zero is a NULL RESULT, recovered from the numbers",
          syn.direction_from_effect_text("MD -0.30 (95% CI -1.10 to 0.50)")
          == "null_effect")
    check("a ratio is null at 1, not at 0",
          syn.direction_from_effect_text("RR 1.02 (95% CI 0.88 to 1.18)")
          == "null_effect"
          and syn.direction_from_effect_text("RR 1.60 (95% CI 1.20 to 2.10)") is None,
          "reading a ratio against 0 makes every RR a benefit")
    check("with no outcome, a CI excluding the null returns None",
          syn.direction_from_effect_text("MD -1.40 (95% CI -2.20 to -0.60)") is None,
          "the sign is meaningless until you know which way is good")
    check("the SAME numbers read opposite ways on opposite outcomes",
          syn.direction_from_effect_text("MD -1.40 (95% CI -2.20 to -0.60)",
                                         "sleep_onset") == "benefit"
          and syn.direction_from_effect_text("MD -1.40 (95% CI -2.20 to -0.60)",
                                             "muscle_strength") == "harm",
          "fell asleep 1.4 min sooner vs lost 1.4 units of strength")
    check("an outcome with deliberately null polarity still REFUSES",
          all(syn.direction_from_effect_text("MD -1.40 (95% CI -2.20 to -0.60)", o)
              is None for o in ("cortisol", "blood_pressure", "testosterone",
                                "glycaemic_control")),
          "lowering BP in a normotensive is not a benefit")
    check("every outcome carries a polarity decision, none left undecided",
          all("polarity" in o for o in vocab.load("outcome")["outcomes"]),
          "a missing key and a deliberate null must not look the same")
    # health_status, added 2026-08-08. The first four axes cannot express
    # "this trial was in patients", so a Huntington's trial matched a
    # general-adult product EXACTLY and its null counted at full weight.
    _prod_pop = {"age_band": "adult", "sex": "mixed", "deficiency_status": "unknown",
                 "pregnancy": "not_pregnant", "health_status": "healthy"}
    check("a disease-population trial no longer matches a healthy product",
          vocab.pop_match({**_prod_pop, "health_status": "disease"}, _prod_pop)
          == "different",
          "19% of the creatine corpus; on four axes every one scored 'exact'")
    check("a trial that did not say is ADJACENT, not excluded",
          vocab.pop_match({**_prod_pop, "health_status": "unknown"}, _prod_pop)
          == "adjacent",
          "treating silence as disease would strand most of the corpus")
    check("health_status is a real axis, not a loose field",
          "health_status" in vocab.AXES and not vocab.validate())

    check("polarity is a DEFINITION, and the obvious ones are right",
          vocab.outcome_polarity("sleep_onset") == "lower_better"
          and vocab.outcome_polarity("muscle_strength") == "higher_better"
          and vocab.outcome_polarity("anxiety") == "lower_better"
          and vocab.outcome_polarity("adverse_events_any") == "lower_better")
    check("no numbers -> no invented direction",
          syn.direction_from_effect_text("favoured the intervention") is None
          and syn.direction_from_effect_text(None) is None)

    check("free-text form resolves to the right arc",
          vocab.form_id_for_text("magnesium", "magnesium bisglycinate 400mg")
          == "magnesium_glycinate"
          or vocab.form_id_for_text("magnesium", "magnesium oxide") == "magnesium_oxide")
    check("an ambiguous form REFUSES rather than picking the longer match",
          vocab.form_id_for_text("magnesium", "magnesium citrate malate")
          in (vocab.unspecified_form_id("magnesium"), "magnesium_citrate")
          and vocab.form_id_for_text("magnesium", "some novel chelate")
          == vocab.unspecified_form_id("magnesium"),
          "a wrong resolution puts another salt's evidence on YOUR form arc")

    # Measured 2026-08-07 on three real OA reviews: the old filter returned
    # False on 14 of 14 tables. These are verbatim headers/captions it missed.
    check("'included systematic reviews' matches, not just 'included studies'",
          ft.looks_like_included_studies(
              {"caption": "Results of the quality assessment of included "
                          "systematic reviews with AMSTAR-2", "rows": [["REFERENCE"]]}))
    check("a header saying 'Patient' counts like 'participants'",
          ft.looks_like_included_studies(
              {"caption": None, "label": None,
               "rows": [["Sr. No", "Treatment option", "Reviews (n)",
                         "Patient (n)", "Author, year"]]}))
    check("a search-terms table is still rejected",
          not ft.looks_like_included_studies(
              {"caption": "", "label": None,
               "rows": [["", "Search terms"], ["1", "Achillea"]]}),
          "over-matching is cheap, but not free")
    return {"product": product, "_score": _score}
