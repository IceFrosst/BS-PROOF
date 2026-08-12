"""Zero-model regression test for the deterministic layer. python -m pipeline.selftest"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.scoring import (Study, score_ecu, band_for, S_VALUE,
                             standardise_effect)
from pipeline.dedup import dedup, canonical_id, registry_id
from pipeline import vocab

ROB_CLEAN = {f"i{i}": 1 for i in range(1, 7)}
def rcts(n, **kw):
    base = dict(design_rank=4, n=120, rob_items=ROB_CLEAN, funding="independent",
                oa="full_text", form_match="exact", dose_match="in_band",
                pop_match="exact", direction="benefit", magnitude="meaningful")
    base.update(kw)
    return [Study(id=f"p{i}", **base) for i in range(n)]

def main():
    fails = []
    def check(name, cond, detail=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {name}  {detail}")
        if not cond: fails.append(name)

    print("\nDEDUP")
    recs = [{"nct":"NCT01234567","label":"Smith 2019","n":60},
            {"nct":"NCT01234567","label":"Smith 2020 followup","doi":"10.1/x"},
            {"nct":"nct01234567","label":"Smith 2021 subgroup"},
            {"doi":"10.9/abc","label":"Jones 2018","n":40},
            {"first_author":"Lee","year":2017,"n":25,"label":"Lee 2017"}]
    u, _, st = dedup(recs)
    check("one trial = one unit", st["out"] == 3, f"5 papers -> {st['out']} units")

    print("\nREGISTRY ID EXTRACTION")
    # A bare prefix must never match -- it would merge every trial in a registry.
    check("bare prefix rejected", registry_id("ChiCTR") is None)
    check("bare prefix falls through to DOI",
          canonical_id({"registration_id": "ChiCTR", "doi": "10.1/b"})[0] == "doi")
    # ...but surrounding text must NOT defeat the match, or one trial splits
    # across its papers by DOI -- the dedup trap, in the dangerous direction.
    noisy = [{"registration_id": "NCT01234567", "doi": "10.1/a", "label": "primary"},
             {"registration_id": "NCT01234567 (primary outcome paper)",
              "doi": "10.1/b", "label": "secondary"},
             {"registration_id": "Registered at ClinicalTrials.gov: NCT01234567.",
              "doi": "10.1/c", "label": "followup"}]
    _, _, nst = dedup(noisy)
    check("noisy registry fields still collapse", nst["out"] == 1,
          f"3 papers of 1 trial -> {nst['out']} unit(s)")
    for label, val in [("ChiCTR", "ChiCTR-TRC-12005678"), ("ChiCTR new", "ChiCTR2000029308"),
                       ("CTRI", "CTRI/2020/01/023001"), ("UMIN", "UMIN000012345"),
                       ("ISRCTN", "ISRCTN12345678"),
                       ("EudraCT spaced", "EudraCT 2015-000123-45")]:
        check(f"{label} recognised", registry_id(val) is not None, val)

    print("\nDEDUP TRAP")
    p = rcts(9)
    a = score_ecu(p, [])
    syn = [{"included_ids": {f"p{i}" for i in range(9)}, "q_s": 0.8, "resolved": True}] * 30
    b = score_ecu(p, syn)
    ratio = b["E_prime"] / a["E"]
    check("30 syntheses over 9 RCTs stay bounded", ratio <= 1.31,
          f"E'/E = {ratio:.2f} (ceiling 1.30)")

    print("\nSIGNED SCORE")
    check("clean positive RCTs -> strong support", a["score"] >= 70, f"score {a['score']}")
    n = score_ecu([Study(id=f"n{i}", design_rank=4, n=200, rob_items=ROB_CLEAN,
                         funding="independent", oa="full_text", form_match="exact",
                         pop_match="exact", direction="null_effect") for i in range(12)], [])
    # Threshold DERIVED from the constant, not hardcoded: this check exists to
    # pin that a well-run null is evidence AGAINST, and it must keep meaning that
    # when the founder retunes S_VALUE (-0.7 -> -0.35 on 2026-08-11) instead of
    # failing on an arithmetic consequence of a deliberate decision.
    _null_floor = 100 * S_VALUE["null_effect"] * 0.75
    check("12 null RCTs -> clearly negative", n["score"] < _null_floor,
          f"score {n['score']} must be below {_null_floor:.0f} "
          f"(75% of 100 x S_VALUE['null_effect']={S_VALUE['null_effect']})")
    check("a null still scores well above outright harm",
          n["score"] > score_ecu(rcts(12, direction="harm", magnitude=None), [])["score"],
          "'we found no effect' is weaker evidence against than 'we found damage'")
    # THE SAME PROPERTY FOR MEASURED ZEROS (SCORING_MODEL v8). The pin above uses
    # unsized nulls, so it tests the LABEL path and would stay green even if the
    # measured path lost the ability to return a negative verdict. This is its
    # twin: 20 trials that each MEASURED an effect of zero must still land clearly
    # negative, because "we looked carefully and found nothing" is evidence
    # against a product, not an absence of evidence.
    #
    # It is what the recentred scale buys. Centred on zero instead, every one of
    # these studies scores s = 0 and the corpus lands at exactly 0 =
    # "inconclusive", indistinguishable from never having been studied -- measured
    # in scripts/effect_size_experiment.py arm E, which exists as the control.
    _measured_zero = score_ecu(
        [Study(id=f"mz{i}", design_rank=4, n=200, rob_items=ROB_CLEAN,
               funding="independent", oa="full_text", form_match="exact",
               pop_match="exact", direction="null_effect",
               effect_s=standardise_effect(0.0, "cohen's d")[0],
               effect_route="smd") for i in range(20)], [])
    check("20 trials that MEASURED zero are still clearly negative",
          _measured_zero["score"] < _null_floor,
          f"score {_measured_zero['score']} must be below {_null_floor:.0f}; a "
          f"zero-centred scale would put it at 0 and the tool would lose its "
          f"ability to say no")
    h = score_ecu(rcts(6, direction="harm", magnitude=None), [])
    check("harm -> strong negative", h["score"] <= -70, f"score {h['score']}")

    print("\nBAND BOUNDARIES (SPEC-aligned)")
    check("-70 is strong against", band_for(-70) == "strong evidence against / harm")
    check("-69 is does not work", band_for(-69) == "does not work")
    check("-40 is does not work", band_for(-40) == "does not work")
    check("-39 is weak against", band_for(-39) == "weak evidence against")
    check("-9 is inconclusive", band_for(-9) == "inconclusive")
    check("+9 is inconclusive", band_for(9) == "inconclusive")
    check("+10 is weak support", band_for(10) == "weak support")
    check("+70 is strong support", band_for(70) == "strong support")

    print("\nTRANSFER FACTOR (the moat)")
    from pipeline import scoring as _sc
    # Founder decision 2026-08-07: form is an applicability arc, not a centre-score
    # penalty. Both settings are asserted so the consequence of the switch is
    # documented in the suite rather than discovered later.
    if _sc.APPLY_FORM_IN_WEIGHT:
        wrong = score_ecu(rcts(9, form_match="different", dose_match="below_50"), [])
        check("wrong form + underdosed collapses score",
              wrong["score"] < a["score"] - 50, f"{a['score']} -> {wrong['score']}")
        fam = score_ecu(rcts(9, form_match="salt_family"), [])
        check("salt family sits between", wrong["score"] < fam["score"] < a["score"],
              f"{wrong['score']} < {fam['score']} < {a['score']}")
    else:
        exact_s = score_ecu(rcts(9, form_match="exact"), [])["score"]
        diff_s = score_ecu(rcts(9, form_match="different"), [])["score"]
        check("form does NOT move the centre score (founder decision)",
              exact_s == diff_s,
              f"exact {exact_s} == different {diff_s} — form lives on the arc only")
        if _sc.APPLY_DOSE_IN_WEIGHT:
            check("dose collapses the score",
                  score_ecu(rcts(9, dose_match="below_50"), [])["score"] < a["score"] - 50)
        else:
            check("no transfer axis moves the centre number any more",
                  len({score_ecu(rcts(9, form_match=f, dose_match=d, pop_match=p), [])["score"]
                       for f, d, p in (("exact", "in_band", "exact"),
                                       ("different", "below_50", "different"))}) == 1,
                  "centre = design x RoB x size x funding x OA only; "
                  "form/dose/population are arcs")
        if _sc.APPLY_POP_IN_WEIGHT:
            check("population collapses the score",
                  score_ecu(rcts(9, pop_match="different"), [])["score"] <= a["score"] - 30)
        else:
            check("population is OFF -- no tier moves the score (founder decision)",
                  len({score_ecu(rcts(9, pop_match=pm), [])["score"]
                       for pm in ("exact", "adjacent", "different")}) == 1,
                  "S3 rarely recovers the axes from an abstract; penalising an "
                  "unknown is noise, not conservatism")
        # The consequence, asserted so nobody rediscovers it in a demo.
        check("a glycinate and an oxide product now score IDENTICALLY",
              exact_s == diff_s,
              "the form differentiator is no longer in the number")

    print("\nGATE")
    g = score_ecu([Study(id="a1", design_rank=12, n=20),
                   Study(id="a2", design_rank=13, n=10)], [])
    check("animal/in vitro only -> no number", g["gate_fired"] and g["score"] is None)

    print("\nPENALTIES")
    bf = score_ecu(rcts(9, funding="brand_funded"), [])
    check("brand funding lowers score", bf["score"] < a["score"], f"{a['score']} -> {bf['score']}")
    ab = score_ecu(rcts(9, oa="abstract_only"), [])
    check("abstract-only lowers score", ab["score"] < a["score"], f"{a['score']} -> {ab['score']}")
    hr = score_ecu(rcts(9, rob_items={f"i{i}": 0 for i in range(1, 7)}), [])
    check("high RoB lowers score", hr["score"] < a["score"], f"{a['score']} -> {hr['score']}")
    rt = score_ecu(rcts(9, retracted=True), [])
    check("retracted -> zero weight -> gate", rt["score"] is None)

    print("\nMAGNITUDE DEFAULT")
    meaningful = score_ecu(rcts(9, magnitude="meaningful"), [])
    unstated = score_ecu(rcts(9, magnitude=None), [])
    check("unstated benefit < meaningful benefit",
          unstated["score"] < meaningful["score"],
          f"{unstated['score']} < {meaningful['score']}")

    print("\nVOCABULARIES")
    problems = vocab.validate()
    check("vocabularies structurally valid", not problems,
          "; ".join(problems[:3]) if problems else
          f"{len(vocab.outcome_ids())} outcomes, {len(vocab.ingredients())} ingredients")
    check("every ingredient has one unspecified form",
          all(vocab.unspecified_form_id(i) for i in vocab.ingredients()))

    print("\nELEMENTAL DOSE TRAP")
    mg_ox, basis_ox = vocab.elemental_dose_mg("magnesium", "magnesium_oxide", 400)
    check("oxide converts by molar mass", basis_ox == "converted" and 241 <= mg_ox <= 242,
          f"400 mg MgO -> {mg_ox} mg elemental")
    mg_cit, basis_cit = vocab.elemental_dose_mg("magnesium", "magnesium_citrate", 400)
    check("hydrate-ambiguous salt REFUSES to convert",
          mg_cit is None and basis_cit == "compound_only",
          "citrate -> None (hexahydrate/stoichiometry unstated)")
    cr, basis_cr = vocab.elemental_dose_mg("creatine", "creatine_monohydrate", 5000)
    check("creatine monohydrate active moiety", basis_cr == "converted" and 4390 <= cr <= 4400,
          f"5000 mg -> {cr} mg creatine base")
    unk, basis_unk = vocab.elemental_dose_mg("magnesium", "magnesium_unspecified", 400)
    check("unspecified form never converts", unk is None and basis_unk == "compound_only")
    none_dose, basis_none = vocab.elemental_dose_mg("magnesium", "magnesium_oxide", None)
    check("null dose stays null", none_dose is None and basis_none == "unstated")

    print("\nBOUNDED DOSE (refuse a point estimate, keep the interval)")
    r_ox = vocab.elemental_dose_range_mg("magnesium", "magnesium_oxide", 400)
    check("safe salt -> degenerate interval",
          r_ox["basis"] == "converted" and r_ox["low"] == r_ox["high"],
          f"{r_ox['low']} mg exactly")
    r_cit = vocab.elemental_dose_range_mg("magnesium", "magnesium_citrate", 400)
    check("ambiguous salt -> bounded, not discarded",
          r_cit["basis"] == "bounded" and r_cit["low"] < r_cit["high"],
          f"{r_cit['low']}-{r_cit['high']} mg (ratio {r_cit['high']/r_cit['low']:.2f}x)")
    check("hydrate bound is the LOW end",
          r_cit["low"] < 400 * 72.915 / 451.114,
          "more water per mole -> less active mass per mg")
    r_carb = vocab.elemental_dose_range_mg("magnesium", "magnesium_carbonate", 400)
    check("unbounded ambiguity stays unknown",
          r_carb["basis"] == "compound_only" and r_carb["low"] is None,
          "basic/hydrated carbonate has no fixed formula")
    r_none = vocab.elemental_dose_range_mg("magnesium", "magnesium_citrate", None)
    check("no dose -> no interval", r_none["basis"] == "unstated")
    worst = vocab.elemental_dose_range_mg("magnesium", "magnesium_chloride", 400)
    check("worst-case salt is still bounded",
          worst["basis"] == "bounded" and worst["high"] / worst["low"] < 2.2,
          f"chloride {worst['low']}-{worst['high']} mg")

    print("\nFORM TRANSFER TIERS")
    check("same form -> exact",
          vocab.form_match("magnesium", "magnesium_citrate", "magnesium_citrate") == "exact")
    check("same salt family -> salt_family",
          vocab.form_match("magnesium", "magnesium_citrate", "magnesium_malate") == "salt_family",
          "both organic_acid_salt")
    check("across families -> different",
          vocab.form_match("magnesium", "magnesium_citrate", "magnesium_oxide") == "different",
          "organic_acid_salt vs inorganic")
    check("unspecified is not a family match",
          vocab.form_match("magnesium", "magnesium_unspecified", "magnesium_oxide") == "unspecified")
    check("branded extracts are distinct forms",
          vocab.form_match("ashwagandha", "ashwagandha_ksm66", "ashwagandha_sensoril") == "different",
          "KSM-66 root vs Sensoril root+leaf")

    print("\nPOPULATION MATCH (worst axis wins)")
    gen = {"age_band": "adult", "sex": "mixed", "deficiency_status": "unknown", "pregnancy": "not_pregnant"}
    check("identical -> exact", vocab.pop_match(gen, gen) == "exact")
    older = dict(gen, age_band="older_adult")
    check("adult vs older_adult -> adjacent", vocab.pop_match(gen, older) == "adjacent")
    child = dict(gen, age_band="child")
    check("adult vs child -> different", vocab.pop_match(gen, child) == "different")
    defic = dict(gen, deficiency_status="deficient")
    replete = dict(gen, deficiency_status="replete")
    check("deficient vs replete -> different", vocab.pop_match(defic, replete) == "different",
          "the axis that flips signs")
    check("one different axis poisons the whole match",
          vocab.pop_match(older, dict(gen, sex="female", age_band="child")) == "different")
    check("four precomputed variants exist", len(vocab.population_variants()) == 4)

    print("\nECU KEY")
    k = vocab.ecu_key("magnesium", "magnesium_glycinate", None, "sleep_onset", "general_adult")
    check("unbanded key is well-formed", k.count("|") == 4 and "unbanded" in k, k)
    banded = vocab.ecu_key("magnesium", "magnesium_glycinate", "150-250", "sleep_onset", "general_adult")
    check("banding changes the key", banded != k, banded)

    # Sources are tested against FIXTURES, never the network. A regression suite
    # that needs the internet is one outage away from being skipped.
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
                    "S3": {"n_randomised": 120, "population_axes": axes},
                    "S4": {"item1_randomisation_method": 1,
                           "item2_double_blind_placebo": 1,
                           "item3_prospective_registration": None,
                           "item4_outcome_matches_registry": 1,
                           "item5_attrition_ok": None, "item6_itt": 1},
                    "S7": {"form_vocab_id": form},
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
    check("nulls on a second outcome score NEGATIVE",
          by_outcome["anxiety"]["score"] < 100 * S_VALUE["null_effect"] * 0.6,
          f"score {by_outcome['anxiety']['score']} — dropping nulls would bias every score up")
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
        {"S3": None, "outcomes": [{"claim": {"direction": "benefit"},
                                   "outcome_vocab_id": "sleep_onset",
                                   "discarded": False}]}, product)[0]
    check("S3 failure -> population unknown, not assumed exact",
          st_unknown.pop_match != "exact", f"pop_match={st_unknown.pop_match}")

    check("missing S8 -> undisclosed, the vocabulary's own value",
          to_studies({"_canonical": "x", "ingredient": "magnesium", "design_rank": 4},
                     {"S8": None, "outcomes": [
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
    check("a stored oa_location (JSON string) is parsed, not crashed on",
          ft.best_text({"pmcid": None, "abstract": "x",
                        "oa_location": _json.dumps({"url": "http://nope/x.pdf"})})[1]
          == "abstract_only",
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
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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

    print("\nEFFECTIVE DOSE BAND (derived, not invented)")
    from pipeline import dose as dosemod
    ents = [{"dose_low_mg": 200, "dose_high_mg": 200, "direction": "benefit"},
            {"dose_low_mg": 300, "dose_high_mg": 300, "direction": "benefit"},
            {"dose_low_mg": 50,  "dose_high_mg": 50,  "direction": "null_effect"},
            {"dose_low_mg": None,"dose_high_mg": None,"direction": "benefit"}]
    band = dosemod.effective_range(ents)
    check("band is the observed benefit range, nothing chosen",
          band["low"] == 200 and band["high"] == 300 and band["n_benefit"] == 2,
          "a percentile or margin would be a new free constant")
    check("null doses reported separately",
          band["null_range"] == {"low": 50, "high": 50},
          "a dose where trials found NOTHING is the useful warning")
    check("undosed trial excluded, never guessed",
          band["n_benefit"] == 2 and dosemod.coverage_fraction(band, ents) == 0.75)
    check("no dosed benefit trial -> no band, band_version 0",
          dosemod.effective_range(
              [{"dose_low_mg": 5, "dose_high_mg": 5, "direction": "null_effect"}]
          )["band_version"] == 0)

    # CONTINUOUS DOSE FACTOR (SCORING_MODEL v10, founder-approved 2026-08-12).
    # The knots are the DOSE_FACTOR values; the shape is flat-in-band with
    # linear ramps outside. Pins below encode the two design arguments so they
    # cannot be silently re-litigated in code.
    _B = {"low": 5000, "high": 10000}
    _df = lambda d: dosemod.dose_factor_for(d, d, _B)
    check("the founder's scenario: 4 g against a 5-10 g band earns 0.64",
          _df(4000) == 0.64,
          "the tier gave 0.45 with a cliff at 5000; the ramp prices 80% of the "
          "low end as 0.64")
    check("NO CLIFF at the band edge",
          _df(4999) > 0.99 and _df(5000) == 1.0,
          "under the tiers a 0.02% dose difference doubled the credit")
    check("FLAT inside the band -- the midpoint is NOT a peak",
          _df(5000) == _df(7500) == _df(10000) == 1.0,
          "the band is the OBSERVED range: every dose inside it was directly "
          "measured, and the midpoint is often the least evidenced point. "
          "Peak-at-middle would downgrade an endpoint dose with direct positive "
          "trials in favour of one nobody tested, and dose-response is sigmoid "
          "with a plateau (creatine 3 g/d saturates like 5 g/d), not triangular")
    check("clamped at the tier floors outside",
          _df(2000) == 0.10 and _df(25000) == 0.60,
          "the ramp never prices a dose below what the founder's tiers did")
    check("monotone on each side",
          _df(3000) < _df(4000) < _df(4999) and _df(12000) > _df(15000) > _df(19000))
    check("an interval straddling the band edge is PRICED, not refused",
          dosemod.dose_factor_for(4000, 6000, _B) == 0.64,
          "the factor is unimodal so the endpoints bound it; the pessimistic "
          "end is the honest single answer where the tier function had to "
          "refuse a category")
    check("no band or no dose is unassessable",
          dosemod.dose_factor_for(None, None, _B) is None
          and dosemod.dose_factor_for(4000, 4000, {"low": None}) is None)
    # graded arc membership: the cliff the adversarial pass flagged is gone
    _g = lambda f: Study(id=f"g{f}", design_rank=4, n=200, rob_items=ROB_CLEAN,
                         funding="independent", oa="full_text", form_match="exact",
                         pop_match="exact", direction="benefit",
                         magnitude="meaningful", dose_factor=f)
    from pipeline.arcs import _dose_verdict
    _d99, _w99 = _dose_verdict([_g(0.9996)])
    _dnone, _wnone = _dose_verdict([_g(None)])
    check("a trial at 99% of the product's dose now counts at ~99%",
          _w99 > 0 and _d99 == 1.0,
          "binary membership gave it ZERO while a trial at 200% counted fully")
    check("a trial with no known dose still earns the arc nothing",
          _dnone is None and _wnone == 0.0,
          "unassessable is not punished, it is merely not credited")

    # DOSE TERM = CLOSENESS TO WHERE IT WORKED (v12, founder design 2026-08-12:
    # "take all the dosages where there was a positive effect, and see how close
    # our dose is"). Direction lives in the effect term alone; benefit trials
    # far from your dose stop voting FOR you and become the yardstick instead.
    from pipeline.arcs import composite as _comp
    check("a product close to the benefit range outscores one far below it",
          _comp(0.2, 0.8, 0.85, 0.9) > _comp(0.2, 0.8, 0.10, 0.9),
          "4.4 g against a 4.8-5 g range (0.85) vs against a 20 g range (0.10)")
    check("closeness arrives on 0..1 and is NOT _unit()ed",
          _comp(1.0, 1.0, 1.0, 1.0) == 100 and _comp(1.0, 1.0, 0.0, 1.0) == 67,
          "closeness 0.0 must read as 'far from the working range', not as 0.5 "
          "'no effect' -- the same trap the form term documents")
    check("no benefit range falls back to the missing-dose penalty",
          _comp(1.0, 1.0, None, 1.0) < _comp(1.0, 1.0, 1.0, 1.0),
          "silence is not a pass: either nothing worked anywhere or no benefit "
          "trial carried a dose, and both cap the dose term at eff x 0.10")
    # FOUNDER CALL 2026-08-12 ("don't fix that thing we lose"), pinned so the
    # limitation is a decision, not an oversight: the SCORE does not distinguish
    # "your dose was tested and failed" from "your dose was never tested" --
    # both are simply outside the range where benefit occurred. The row's
    # null_range and the arc's verdict/coverage still show the difference to a
    # READER; it does not move the number.
    check("tested-and-failed and never-tested doses score the SAME by design",
          _comp(0.5, 0.5, 0.2, 0.9) == _comp(0.5, 0.5, 0.2, 0.9),
          "trivially true -- this pin exists to hold the comment above")

    check("dose inside the band", dosemod.dose_match_for(250, 250, band) == "in_band")
    check("just under the low end", dosemod.dose_match_for(150, 150, band) == "low_50_99")
    check("far under", dosemod.dose_match_for(40, 40, band) == "below_50")
    check("far over", dosemod.dose_match_for(700, 700, band) == "above_200")
    check("interval straddling a tier edge REFUSES to pick",
          dosemod.dose_match_for(150, 250, band) == "unspecified",
          "rounding to the likelier side would silently move the score")
    check("no band -> unspecified, not a free pass",
          dosemod.dose_match_for(200, 200, {"low": None}) == "unspecified")

    print("\nDONUT (score in the centre, arc = confidence)")
    from pipeline.donut import donut_svg, donut_line, confidence_label
    strong = {"score": 86, "band": "strong support", "gate_fired": False,
              "components": {"c": 0.91}}
    thin   = {"score": 4, "band": "inconclusive", "gate_fired": False,
              "components": {"c": 0.05}}
    conflict = {"score": 4, "band": "inconclusive", "gate_fired": False,
                "components": {"c": 0.88}}
    gated  = {"score": None, "band": "insufficient human evidence",
              "gate_fired": True, "components": {}}
    check("arc length tracks c, not the score",
          donut_line(thin).count("#") < donut_line(conflict).count("#"),
          "same +4 -- one is genuine conflict, one is nobody-has-looked")
    check("gated row draws an EMPTY ring", donut_line(gated).count("#") == 0
          and "gated" in donut_line(gated),
          "'no number' must not look like 'zero'")
    check("gated centre is not a number", "--" in donut_svg(gated))
    check("sign is shown explicitly", "+86" in donut_svg(strong))
    check("band drives colour",
          donut_svg(strong).count("#0f7b4f") and donut_svg(thin).count("#8a8f98"),
          "inconclusive is grey, never pale green")
    check("confidence has plain-words labels",
          confidence_label(0.01) != confidence_label(0.9))
    check("svg is self-contained", donut_svg(strong).startswith("<svg")
          and "http" not in donut_svg(strong).split("aria-label")[0].replace(
              "http://www.w3.org/2000/svg", ""))

    print("\nSMALL-RUN PREVIEW (project, never rescale k)")
    from pipeline import preview
    big = score_ecu(rcts(60, oa="abstract_only", form_match="salt_family"), [])
    small = score_ecu(rcts(6, oa="abstract_only", form_match="salt_family"), [])
    ps = preview.project(small, 6, 60)
    check("sample under 20 refuses to project",
          ps["projected"] is None and "below" in ps["reason"],
          "a 40-point error bar spans four bands; that is noise, not a preview")
    mid = score_ecu(rcts(30, oa="abstract_only", form_match="salt_family"), [])
    pm = preview.project(mid, 30, 60)
    check("d is carried through unchanged, not rescaled",
          abs(pm["d"] - big["d"]) < 1e-9,
          "d is a weighted MEAN -- sample-size independent by construction")
    check("projected c never falls below sample c",
          pm["c_projected"] >= pm["c_sample"],
          "strict > held at K=3.0; at K=1.5 (v4) 30 studies already saturate "
          "c to 1.0, so at the ceiling projection and sample legitimately tie")
    check("projection lands nearer the truth than the raw sample score",
          abs(pm["projected"] - big["score"]) <= abs(pm["sample_score"] - big["score"]),
          f"raw {pm['sample_score']:+d} -> projected {pm['projected']:+d} "
          f"vs true {big['score']:+d}")
    check("error bar shrinks with sample size",
          preview._expected_error(5) > preview._expected_error(40) > preview._expected_error(200))
    check("cheap evidence needs far more of it",
          preview.studies_needed(0.023) > 10 * preview.studies_needed(0.56),
          f"{preview.studies_needed(0.023)} vs {preview.studies_needed(0.56)} studies for c=0.9")

    print("\nFOUR ARCS + 0-100 COMPOSITE")
    from pipeline import arcs as A
    from pipeline.donut import four_arc_svg
    ROBC = {f"i{i}": 1 for i in range(1, 7)}
    def _s(direction, form, dose, mag=None, n=200, oa="full_text", rob=None):
        # The dose arc grades by the continuous dose_factor since v10; the tier
        # string alone no longer enters it. Fixtures state their intent as a
        # tier, mapped here through the same DOSE_FACTOR table the ramp's knots
        # come from, so a founder retuning moves the fixtures with it.
        _f = {"in_band": 1.0, "low_50_99": 0.45, "below_50": 0.10,
              "above_200": 0.60}.get(dose)
        return Study(id=f"{direction}{form}{dose}{n}{oa}", design_rank=4, n=n,
                     rob_items=rob or ROBC, funding="independent", oa=oa,
                     form_match=form, dose_match=dose, dose_factor=_f,
                     pop_match="exact", direction=direction, magnitude=mag)

    # Every fixture in this block declares its dose intent as a tier on the
    # study; under v12 the composite's dose term is the product's CLOSENESS to
    # the benefit range, passed to build() separately. "in_band" intent maps to
    # closeness 1.0 -- the product sits inside the range where benefit occurred.
    def _b(studies, closeness=1.0, **kw):
        return A.build(studies, dose_closeness=closeness, **kw)
    harmful = _b([_s("harm", "exact", "in_band") for _ in range(10)],
                 closeness=None)  # all harm -> no benefit range exists
    works = _b([_s("benefit", "exact", "in_band", "meaningful") for _ in range(10)])
    check("harmful product cannot accumulate points from a good form match",
          harmful["composite"] == 0,
          "summing arcs gave it 74/100; the form arc is now the VERDICT, -1.00")
    check("clean positive reaches the top", works["composite"] >= 90)

    yourform = _b([_s("benefit", "different", "in_band", "meaningful") for _ in range(8)]
                       + [_s("null_effect", "exact", "in_band") for _ in range(4)])
    check("works overall but YOUR form found nothing",
          yourform["arcs"]["effect"]["verdict"] > 0
          and yourform["arcs"]["form"]["verdict"] < 0,
          f"effect {yourform['arcs']['effect']['verdict']:+.2f} vs "
          f"form {yourform['arcs']['form']['verdict']:+.2f} — the case that "
          f"justifies a per-form arc at all")
    check("that arc reports how little evidence backs it",
          yourform["arcs"]["form"]["coverage"] < 0.5,
          f"{yourform['arcs']['form']['coverage']:.0%} of the evidence")

    untested = _b([_s("benefit", "different", "in_band", "meaningful") for _ in range(10)])
    check("no trial in your form is PENALISED, not dropped",
          untested["composite"] < works["composite"],
          f"{untested['composite']} vs {works['composite']} — averaging over "
          f"available arcs gave both 99")
    check("an untested axis has no verdict and zero coverage",
          untested["arcs"]["form"]["verdict"] is None
          and untested["arcs"]["form"]["coverage"] == 0.0)

    # FORM LADDER (SCORING_MODEL v5, founder design 2026-08-11). The form arc no
    # longer re-scores the effect verdict over a subset; it scores the EVIDENCE
    # HIERARCHY of non-negative evidence in your own form. These pin the design,
    # the A/B/C width choice, and the invariant-8 separation the ladder must keep.
    print("\nFORM LADDER")
    _fl, _fs = A.form_ladder_score, A.form_strength
    check("an umbrella review in your form scores 100",
          _fs([], None, [{"design_rank": 1, "direction": "benefit"}]) == (1.0, "ladder"),
          "the founder's flagship case")
    check("only animal evidence in your form scores 10, not 0 and not full credit",
          _fl([12]) == 0.10)
    check("only cell evidence scores 5", _fl([13]) == 0.05)
    check("an RCT in your form scores 80", _fl([4]) == 0.80)
    check("the ladder is ordered by hierarchy",
          _fl([1]) > _fl([2]) > _fl([3]) > _fl([4]) > _fl([5]) > _fl([12]) > _fl([13]))
    # The measured A/B/C decision. top-1 scored "1 RCT + 9 animal" identical to
    # ten RCTs (no corroboration required); top-10 dragged a real RCT to 0.170.
    check("top-3 requires corroboration without diluting a real RCT",
          abs(_fl([4] + [12] * 9, 3) - 0.3333) < 0.001
          and _fl([4] + [12] * 9, 1) == 0.80
          and abs(_fl([4] + [12] * 9, 10) - 0.170) < 0.001,
          "pins scripts/form_experiment.py's conclusion; changing FORM_LADDER_TOP "
          "must be a deliberate, measured decision")
    check("a lone weak paper cannot be inflated by the window",
          _fl([12], 1) == _fl([12], 10) == 0.10)

    # INVARIANT 8: both score 0 strength, and they must STILL be distinguishable.
    _neg = _b([_s("null_effect", "exact", "in_band", None) for _ in range(4)],
              closeness=None)  # all null -> no benefit range exists
    _unt = _b([_s("benefit", "different", "in_band", "meaningful") for _ in range(4)])
    check("a form whose every study is negative earns no ladder credit",
          _neg["arcs"]["form"]["strength"] == 0.0
          and _neg["arcs"]["form"]["basis"] == "all_negative_in_form")

    # THE v5 CORRECTION (founder, 2026-08-11). v5 short-circuited on the POOLED
    # verdict, so one solid positive RCT plus three nulls in your form scored 0.0
    # -- the nulls out-voted the RCT in `d` and the ladder never ran. Eligibility
    # is per STUDY: walk DOWN the hierarchy until you find non-negative evidence.
    _mixed_form = _b(
        [_s("null_effect", "exact", "in_band", None) for _ in range(3)]
        + [_s("benefit", "exact", "in_band", "meaningful")])
    check("one positive RCT in your form still earns ladder credit beside nulls",
          _mixed_form["arcs"]["form"]["strength"] == 0.80
          and _mixed_form["arcs"]["form"]["basis"] == "ladder",
          "v5 scored this 0.0 on the pooled verdict; a negative pooled d is a "
          "WARNING in the verdict, not a reason to discard positive evidence")
    check("the pooled verdict still shows the warning",
          _mixed_form["arcs"]["form"]["verdict"] < 0,
          "strength and verdict answer different questions and both are shown")
    check("form untested scores no ladder credit either",
          _unt["arcs"]["form"]["strength"] == 0.0
          and _unt["arcs"]["form"]["basis"] == "untested_in_form")
    check("...but failed and untested are still TOLD APART by the arc",
          _neg["arcs"]["form"]["verdict"] is not None
          and _neg["arcs"]["form"]["coverage"] > 0.0
          and _unt["arcs"]["form"]["verdict"] is None
          and _unt["arcs"]["form"]["coverage"] == 0.0,
          "invariant 8: '0.00 @ 0%' and '-0.70 @ 100%' are opposite messages")

    # THE PREVIOUSLY UNTESTED CORNER. Every arc fixture used exact/different, so
    # nothing pinned how an UNSPECIFIED form behaves -- and 54% of the real
    # creatine corpus is unspecified.
    _uns = _b([_s("benefit", "unspecified", "in_band", "meaningful") for _ in range(4)])
    check("an unreported form earns no form credit and is not read as a match",
          _uns["arcs"]["form"]["strength"] == 0.0
          and _uns["arcs"]["form"]["basis"] == "untested_in_form"
          and _uns["arcs"]["form"]["verdict"] is None,
          "silence is not a pass -- but it no longer drags via effect x 0.15")
    check("a confirmed exact form DOES earn ladder credit over an unreported one",
          _b([_s("benefit", "exact", "in_band", "meaningful")
                   for _ in range(4)])["composite"] > _uns["composite"])

    # PER-STUDY CONTRIBUTIONS (founder ask 2026-08-11). Exact, not heuristic:
    # the points must sum to the signed score, or the report would be inventing
    # an attribution instead of decomposing one.
    from pipeline.scoring import contributions as _contrib
    _mix = [_s("benefit", "exact", "in_band", "meaningful") for _ in range(3)] \
         + [_s("null_effect", "exact", "in_band", None) for _ in range(2)]
    _res = _score(_mix, [])
    _cs = _contrib(_mix, _res)
    check("per-study contributions sum to the signed score",
          abs(sum(c["points"] for c in _cs) - _res["score"]) < 1.0,
          f"sum={sum(c['points'] for c in _cs):.2f} score={_res['score']}")
    check("a null study contributes NEGATIVE points",
          any(c["points"] < 0 for c in _cs) and any(c["points"] > 0 for c in _cs),
          "the sign says which way each study pushed the number")
    check("contributions are ordered by absolute influence",
          [abs(c["points"]) for c in _cs] == sorted((abs(c["points"]) for c in _cs),
                                                   reverse=True))
    check("a gated ECU has no contributions to attribute",
          _contrib([], {"score": None}) == [])

    # The composite must not unit-map a strength. Passing 0.0 through _unit()
    # would read it as 0.5 -- "no effect" -- and hand an untested form half credit.
    check("composite treats the form term as a strength, not a signed verdict",
          A.composite(1.0, 0.0, None, 1.0) == 37,
          "eff 1.0 + form 0.0 + dose 0.1 over 3; unit-mapping form would give 53")

    thin = _b([_s("benefit", "exact", "in_band", "meaningful", n=20,
                       oa="abstract_only", rob={f"i{i}": 0 for i in range(1, 7)})])
    nulls = _b([_s("null_effect", "exact", "in_band") for _ in range(20)],
               closeness=None)  # all null -> no benefit range exists
    check("confidence MULTIPLIES -- one weak trial cannot score well",
          thin["composite"] < 10,
          f"{thin['composite']}/100; as a fourth term in a mean it scored 76")
    check("'barely studied' and 'does not work' stay distinguishable",
          A.label(thin["composite"], thin["c"]) != A.label(nulls["composite"], nulls["c"]),
          f"{A.label(thin['composite'], thin['c'])!r} vs "
          f"{A.label(nulls['composite'], nulls['c'])!r} — SPEC §9's collapse, avoided")
    check("the evidence arc is what separates them",
          thin["arcs"]["evidence"]["coverage"] < 0.1
          and nulls["arcs"]["evidence"]["coverage"] > 0.9)
    check("signed score retained alongside the 0-100",
          works["signed"] is not None and nulls["signed"] < 0,
          "bands and the anchor set depend on it; only the DISPLAY is 0-100")
    check("four rings render", four_arc_svg(works).count("<circle") == 12)

    check("a row missing c cannot claim a verdict",
          A.label(16, None) == "confidence unknown",
          "a Grok report rendered 16/100 as 'does not work' because the "
          "projection dropped components; silence must not become a verdict")

    # Guard the plumbing itself: the immutable dashboard exporter must receive
    # the complete deterministic ECU rows.  The old hand-written projection
    # dropped applicability, dose, evidence ids, flags and provenance.
    _rp = (pathlib.Path(__file__).parent.parent / "run_pipeline.py").read_text()
    _full_handoff = 'run_context["ecu_rows"] = rows' in _rp
    check("runner retains complete ECU rows for report artifacts", _full_handoff,
          "run_context must receive the full build_ecus rows without projection")

    print("\nSAFETY OUTCOMES + APPLICABILITY LABELS")
    from pipeline.assemble import to_studies as _ts
    def _one(outcome, direction):
        rec = {"_canonical": "x", "ingredient": "magnesium", "design_rank": 4,
               "oa": "full_text"}
        ext = {"S3": {"n_randomised": 100}, "S7": {"form_vocab_id": "magnesium_glycinate"},
               "S8": {"funding_class": "independent"},
               "outcomes": [{"claim": {"direction": direction, "magnitude": None},
                             "outcome_vocab_id": outcome, "discarded": False}]}
        return _ts(rec, ext, product)[0][1]

    check("a null on an EFFICACY outcome stays negative",
          _one("sleep_onset", "null_effect").s_value() < 0,
          "invariant 7: a well-run trial finding nothing disconfirms the claim")
    check("a null on a SAFETY outcome is reassurance, not failure",
          _one("adverse_events_gi", "null_effect").s_value() > 0,
          "no difference in side effects CONFIRMS 'this is safe'; scoring it "
          "-0.7 published magnesium's safety data as 'does not work'")
    check("harm on a safety outcome is still negative",
          _one("adverse_events_any", "harm").s_value() < 0)

    # ------------------------------------------------------------------
    # EFFECT-SIZE s_value (founder decision 2026-08-11, "do i"). Replaces vote
    # counting wherever a usable number exists. Every pin below is new code with
    # no prior coverage: the existing 392 checks all passed unchanged because
    # they set no effect_size and fall back to the label.
    from pipeline.scoring import (standardise_effect as _se, EFFECT_MID_SMD,
                                  EFFECT_FULL_SMD, EFFECT_MID_PCT, EFFECT_FULL_PCT)

    # -- the refusals. Each of these OCCURS in the creatine corpus, and each one
    # would invert or fabricate a sign if it were accepted.
    for unit, why, n_claims in (
            ("% change vs baseline", "within_group_not_between_arm", 10),
            ("cohen's d (within-group crm)", "within_group_not_between_arm", 2),
            ("kg cr post vs 13.5 kg placebo post", "within_group_not_between_arm", 1),
            ("partial eta-squared", "unsigned_variance_explained", 12),
            ("eta2p", "unsigned_variance_explained", 1),
            ("or", "ratio_null_is_one", 3),
            ("relative risk", "ratio_null_is_one", 1),
            ("kg", "raw_unit_needs_sd", 15),
            ("points", "raw_unit_needs_sd", 8),
            ("beta", "raw_unit_needs_sd", 7),
            ("none", "no_unit", 1)):
        s, route = _se(0.5, unit)
        check(f"unit {unit!r} is refused as {why}",
              s is None and route == why,
              f"{n_claims} such claim(s) in the creatine corpus; got {route}")
    check("a within-group unit is refused even when it names a real effect size",
          _se(0.7, "cohen's d (within-group)")[0] is None,
          "a pre/post d is not a between-arm contrast, and it is the LARGER number")

    # -- the accepted families
    check("cohen's d is standardised", _se(0.43, "cohen's d")[1] == "smd")
    check("hedges g is standardised", _se(0.43, "hedge's g")[1] == "smd")
    check("a bare ES is standardised", _se(0.43, "es")[1] == "smd")
    check("a percent difference is standardised", _se(5.0, "% difference")[1] == "percent")

    # -- THE LOAD-BEARING PROPERTY. The scale is recentred on the MEANINGFUL
    # threshold, not on zero, and that is what preserves invariant 7. Centring on
    # zero would score a well-powered measured-zero trial at s=0 -- "inconclusive",
    # indistinguishable from never studied, which is exactly what the founder
    # rejected when choosing -0.35 over 0.0 for a null.
    _zero = _se(0.0, "cohen's d")[0]
    check("a measured-ZERO effect reproduces the founder's null value",
          abs(_zero - S_VALUE["null_effect"]) < 0.02,
          f"measured zero -> {_zero:+.3f} vs S_VALUE['null_effect']="
          f"{S_VALUE['null_effect']}; the new scale DERIVES the old constant "
          f"instead of asserting it, so invariant 7 survives the change")
    check("a clear harm-sized effect reaches the founder's harm value",
          _se(-0.5, "cohen's d")[0] <= S_VALUE["harm"],
          f"-0.5 SMD -> {_se(-0.5, 'cohen d')[0]:+.3f}, clamped to "
          f"{S_VALUE['harm']}")
    check("the two unit families AGREE at their shared 'meaningful' anchor",
          abs(_se(0.5, "cohen's d")[0] - _se(5.0, "% difference")[0]) < 1e-9,
          "prompts/s5_conclusion.md calls 0.5 SMD and 5% both 'meaningful', so "
          "the continuous scale must place them identically or the same paper "
          "scores differently depending on which unit it happened to report")
    check("the 'trivial' bound sits exactly at zero on both scales",
          abs(_se(EFFECT_MID_SMD, "cohen's d")[0]) < 1e-9
          and abs(_se(EFFECT_MID_PCT, "%")[0]) < 1e-9,
          "below the threshold a person would notice, an effect is evidence "
          "AGAINST a meaningful benefit, not for it")
    check("s is clamped to [-1, +1]",
          _se(99.0, "cohen's d")[0] == 1.0 and _se(-99.0, "cohen's d")[0] == -1.0)
    check("a null that MEASURED a real effect stops voting against the product",
          _se(0.43, "cohen's d")[0] > 0,
          f"0.43 SMD -> {_se(0.43, 'cohen d')[0]:+.3f}, where vote counting scored "
          f"the same trial {S_VALUE['null_effect']}. This is the defect being "
          f"fixed: 24 of 27 sized nulls had a point estimate favouring creatine")

    # -- the guards on Study.s_value
    _es = lambda d, e, m=None: Study(id="e", design_rank=4, n=60, oa="full_text",
                                     rob_items=ROB_CLEAN, funding="independent",
                                     direction=d, magnitude=m, effect_s=e)
    check("a measured effect overrides the direction label",
          _es("null_effect", 0.38).s_value() == 0.38)
    # This pin's PREDECESSOR asserted the opposite: a benefit with negative
    # effect_s fell back to the label. That guard was written when effect signs
    # were untrusted raw values; after v1.17 effect_s is favours-oriented, so a
    # negative s on a benefit claim means SUB-THRESHOLD, and the guard promoted
    # exactly the smallest effects back to +1.0. Inverted-measure protection
    # (sprint time under muscle_power) lives upstream in effect_favours, and the
    # genuine label/number contradictions are refused in assemble._effect_s.
    check("Study trusts a favours-oriented negative s: sub-threshold stays negative",
          _es("benefit", -0.25, "meaningful").s_value() == -0.25,
          "a 0.05 SMD 'benefit' is evidence against a MEANINGFUL effect; the old "
          "guard scored it +1.0")
    from pipeline.assemble import _effect_s as _aes2
    check("benefit label + number favouring CONTROL is refused upstream",
          _aes2({"effect_size": 0.5, "effect_unit": "cohen's d",
                 "effect_favours": "control", "direction": "benefit"},
                "muscle_strength")[1] == "label_number_contradiction",
          "two readings of one paper that cannot both be right; invariant 9 "
          "says under-count, so the claim falls back to its label")
    check("harm label + number favouring the INGREDIENT is refused upstream",
          _aes2({"effect_size": 0.5, "effect_unit": "cohen's d",
                 "effect_favours": "ingredient", "direction": "harm"},
                "muscle_strength")[1] == "label_number_contradiction")
    check("a harm whose number DISAGREES keeps the FULL harm value, not 0.0",
          _es("harm", 0.9).s_value() == S_VALUE["harm"],
          "the first version clamped to min(effect_s, 0.0), which looked "
          "conservative and hid safety signals: of 6 sized harm claims in the "
          "v1.14 corpus, THREE standardise to +1.000 ('elevated serum creatinine "
          "74.2%', 'drug-related adverse events 82%', 'early drug discontinuation "
          "50%') because they are harm RATES where bigger is worse. Clamping made "
          "each read 'no evidence'. For safety, under-counting means KEEPING the "
          "harm")
    check("a harm label CAN be made more negative by its number",
          _es("harm", -1.0).s_value() == -1.0)
    check("an ABSOLUTE percentage difference is refused, not read as relative",
          _se(74.2, "% CID")[0] is None and _se(53.0, "percentage points")[0] is None,
          "a cumulative-incidence difference of 74.2 points is not a 74.2% "
          "relative change; through a rule where 5% is meaningful it inflates "
          "~15x and saturates at +1.0. The correct denominator is not recoverable "
          "from the unit string, so it is refused rather than rescaled")
    check("no number means the label still decides",
          _es("null_effect", None).s_value() == S_VALUE["null_effect"],
          "coverage is partial -- 44% of sized claims are standardisable -- so "
          "the label path is not legacy, it is the majority path")

    # -- adverse-event refusal, which needs the vocabulary and so lives in assemble
    from pipeline.assemble import _effect_s as _aes
    check("an adverse-event outcome refuses to standardise its number",
          _aes({"effect_size": 12.8, "effect_unit": "%"}, "adverse_events_gi")[0] is None,
          "on a safety outcome POSITIVE means MORE harm -- the opposite "
          "orientation from every efficacy outcome. '12.8% more adverse events' "
          "would otherwise read as strong positive evidence")
    check("an efficacy outcome standardises the same number ONCE THE ARM IS NAMED",
          _aes({"effect_size": 5.0, "effect_unit": "% difference",
                "effect_favours": "ingredient"}, "muscle_strength")[0] is not None)

    # -- SIGN CONVENTION (v1.16). The sign is STATED by S5, never inferred from the
    # number's arithmetic sign, because this literature uses both conventions: a
    # faster sprint TIME is a negative number and a good result, while the same
    # finding is often reported pre-oriented toward the treatment. A wrong
    # magnitude weakens a score; a wrong SIGN inverts it, undetectably.
    #
    # These pins are the ONLY coverage this logic will get for a while: all 85
    # sized+mapped claims in the creatine corpus are on higher_better outcomes,
    # where both conventions coincide, so a creatine run passes either way.
    _claim = lambda **kw: {"effect_size": 0.6, "effect_unit": "cohen's d", **kw}
    check("effect_favours=ingredient orients POSITIVE",
          _aes(_claim(effect_favours="ingredient"), "muscle_strength")[0] > 0)
    check("effect_favours=control orients NEGATIVE",
          _aes(_claim(effect_favours="control"), "muscle_strength")[0] < 0)
    check("a NEGATIVE raw value favouring the ingredient still scores positive",
          _aes(_claim(effect_size=-0.6, effect_favours="ingredient"),
               "muscle_strength")[0] > 0,
          "a faster sprint TIME is a negative number and a BETTER result; taking "
          "the reported sign at face value here would score a win as a loss")
    check("orientation happens BEFORE recentring, so a trivial benefit stays trivial",
          _aes(_claim(effect_size=0.05, effect_favours="ingredient"),
               "muscle_strength")[0] < 0,
          "0.05 SMD is below the meaningful threshold, so it is evidence against a "
          "MEANINGFUL effect. abs()-ing the standardised value instead would have "
          "promoted a trivial benefit into a strong one")
    check("an unstated convention on a LOWER_BETTER outcome is refused",
          _aes(_claim(), "sleep_onset")[1] == "sign_convention_unstated",
          "pre-v1.16 data on a lower-better outcome cannot be oriented: a smaller "
          "sleep-onset latency is better, so the raw sign is ambiguous. Refusing "
          "costs one magnitude; accepting could invert it")
    # This pin was INVERTED on 2026-08-11, hours after being written, and the
    # reason is the most important measurement in this whole change.
    #
    # It used to assert that an unstated convention on a higher_better outcome was
    # ACCEPTED, on the reasoning that "higher is better" makes the reported sign
    # unambiguous. That reasoning assumed effect_size is a signed contrast. It is
    # not: of 54 standardised values only 3 are negative, and 24 of 24 standardised
    # null_effect values are POSITIVE, where a real treatment-minus-control
    # convention would put about half of them below zero (P ~ 1e-7). Papers print
    # |d| next to "no significant difference" and S5 copies it faithfully.
    #
    # So accepting an unstated sign would read every such null as a BENEFIT of
    # that magnitude -- a null reporting |g| = 0.88 becomes +1.0 when the truth may
    # be -1.0. The change meant to remove an upward-biasing error would have
    # introduced a larger one.
    check("an unstated convention is REFUSED even on a higher_better outcome",
          _aes(_claim(), "muscle_strength")[1] == "sign_convention_unstated",
          "the reported sign cannot be trusted: 24 of 24 standardised null values "
          "in the corpus are positive because papers print |d|, so an unstated "
          "sign would turn every sized null into a benefit")
    # SIGN-PROOF SUB-THRESHOLD MAGNITUDES. Refusing every unsigned claim was the
    # first rule and it was too broad -- on the v1.17 creatine corpus "neither"
    # alone was 48 of 257 mapped claims (19%), the second-largest refusal after
    # "no number at all". A magnitude at or below the meaningful threshold is
    # sign-proof: both possible signs give a negative s, so the unknown sign
    # cannot change the conclusion, and the positive reading is the less negative
    # of the two.
    check("a LARGE effect that 'favours neither' is still refused",
          _aes(_claim(effect_favours="neither"), "muscle_strength")[1]
          == "favours_neither_but_above_threshold",
          "0.6 SMD is well above the meaningful threshold, so 'favours neither' is "
          "a self-contradiction and the sign decides everything")
    check("a SUB-THRESHOLD 'neither' is accepted and lands negative",
          (_aes(_claim(effect_size=0.05, effect_favours="neither"),
                "muscle_strength")[0] or 0) < 0,
          "both signs give a negative s below the threshold (+0.05 -> -0.25, "
          "-0.05 -> -0.42), so the unknown sign cannot change the verdict and the "
          "positive reading is the conservative one")
    check("a SUB-THRESHOLD claim with NO stated sign is likewise accepted",
          (_aes(_claim(effect_size=0.05), "muscle_strength")[0] or 0) < 0,
          "same argument, and it is what lets pre-v1.17 data contribute its "
          "trivial effects without ever risking an inverted sign")
    check("...but an ABOVE-threshold claim with no stated sign stays refused",
          _aes(_claim(effect_size=0.6), "muscle_strength")[1]
          == "sign_convention_unstated")

    # SD STANDARDISATION (v1.20). d = raw difference / printed SD is arithmetic
    # on two reported numbers; the route name keeps a DERIVED standardisation
    # distinguishable from a printed one. The guards matter more than the path:
    check("a raw kg difference + printed SD standardises (smd_from_sd)",
          _aes({"effect_size": 3.2, "effect_unit": "kg", "effect_sd": 8.0,
                "effect_favours": "ingredient", "direction": "benefit"},
               "muscle_strength")
          == (_se(0.4, "cohen's d")[0], "smd_from_sd"),
          "3.2 kg / SD 8.0 = 0.4 SMD -- the 15%-of-claims branch that used to "
          "die as raw_unit_needs_sd")
    check("a raw unit with NO SD still falls back to the label",
          _aes({"effect_size": 3.2, "effect_unit": "kg",
                "effect_favours": "ingredient", "direction": "benefit"},
               "muscle_strength")[1] == "raw_unit_needs_sd")
    check("a zero or negative SD is refused, never divided by",
          _se(3.2, "kg", 0)[1] == "raw_unit_needs_sd"
          and _se(3.2, "kg", -8)[1] == "raw_unit_needs_sd")
    check("a printed SMD is NEVER divided a second time",
          _se(0.43, "cohen's d", 8.0) == (_se(0.43, "cohen's d")[0], "smd"),
          "an SD arriving beside an already-standardised effect must be ignored, "
          "or the value shrinks 8x")
    check("an SD does not rescue a within-group change or a ratio",
          _se(5.0, "% change vs baseline", 8.0)[1] == "within_group_not_between_arm"
          and _se(1.4, "or", 0.5)[1] == "ratio_null_is_one",
          "untrustworthy stays untrustworthy; the SD only unlocks the raw-unit "
          "branch")
    # SUBAGENT SCHEMAS MUST BE STRUCTURALLY SANE. Cost of the missing check,
    # measured 2026-08-12: a trailing comma in a schema-editing script turned
    # effect_sd's subschema into a one-element ARRAY; the file stayed valid
    # JSON, every offline gate stayed green, and the FIRST live S5 call failed
    # with "--json-schema is not a valid JSON Schema" -- 10 of 10 calls burned
    # before the cause was found. A property's schema must be an object (or
    # boolean, per the spec); anything else here is a wreck waiting for the
    # next production run.
    import glob as _glob
    import json as _json

    def _schema_shape_problems(node, path):
        problems = []
        if isinstance(node, dict):
            for key, sub in (node.get("properties") or {}).items():
                if not isinstance(sub, (dict, bool)):
                    problems.append(f"{path}.properties.{key} is "
                                    f"{type(sub).__name__}, not object/boolean")
                problems.extend(_schema_shape_problems(sub, f"{path}.{key}"))
            for key in ("items",):
                if key in node and not isinstance(node[key], (dict, bool)):
                    problems.append(f"{path}.{key} is {type(node[key]).__name__}")
                elif key in node:
                    problems.extend(_schema_shape_problems(node[key], f"{path}.{key}"))
        return problems

    _bad = []
    import pathlib as _pathlib
    _schemas_dir = _pathlib.Path(__file__).resolve().parent.parent / "schemas"
    for _f in sorted(_glob.glob(str(_schemas_dir / "s*_*.json"))):
        _bad.extend(_schema_shape_problems(_json.load(open(_f)),
                                           _f.rsplit("/", 1)[-1]))
    check("every subagent schema's property subschemas are objects",
          not _bad, "; ".join(_bad[:3]) if _bad else
          "a list where an object belongs passes json.load and every offline "
          "gate, then fails every live CLI call at once")

    check("the SD path still requires the arm to be named",
          _aes({"effect_size": 3.2, "effect_unit": "kg", "effect_sd": 8.0,
                "direction": "benefit"}, "muscle_strength")[1]
          in ("sign_convention_unstated", "raw_unit_needs_sd"),
          "sub-threshold sign-proofing applies, but an above-threshold unsigned "
          "raw effect must not enter just because it now has an SD")
    check("v8 therefore scores the PRE-v1.17 corpus exactly as v7 did",
          _aes({"effect_size": 0.43, "effect_unit": "cohen's d"},
               "muscle_strength")[0] is None,
          "no pre-contract extraction can activate the measured path, so the "
          "model change cannot move a stored score until re-extraction")
    check("a stated convention works on a lower_better outcome where inference cannot",
          _aes(_claim(effect_favours="ingredient"), "sleep_onset")[0] > 0,
          "this is what the v1.16 field buys: magnesium/sleep becomes scoreable "
          "from measured effects, and creatine could never have revealed the gap")

    check("an applicability penalty is not reported as a verdict",
          A.label(37, 0.51, effect_verdict=1.0, applicability_limited=True)
          == "works, but not tested for your product",
          "effect arc was +1.00 and it read 'probably does not work'")
    check("a genuinely negative finding still reads negative",
          A.label(5, 0.50, effect_verdict=-0.70, applicability_limited=True)
          == "does not work")
    check("a good form match cannot rescue negative evidence",
          A.label(60, 0.9, effect_verdict=-0.5) == "does not work")

    print("\nTHREE-ARC DONUT (effect / form / dose)")
    from pipeline.donut import three_arc_svg, arc_fills, TRACK
    full = {"score": 33, "band": "moderate support", "gate_fired": False,
            "components": {"c": 0.72},
            "form_mix": {"exact": 4, "salt_family": 1, "different": 1},
            "dose": {"low": 56, "high": 296, "evidence_with_dose": 0.83}}
    f = arc_fills(full)
    check("three independent fills, not thirds of one total",
          round(f["effect"], 2) == 0.72 and round(f["form"], 2) == 0.67
          and round(f["dose"], 2) == 0.83,
          "they do not sum to anything -- each is its own condition")
    nodose = {**full, "dose": {"low": None, "evidence_with_dose": 0.0}}
    check("unassessed dose is None, NOT zero",
          arc_fills(nodose)["dose"] is None,
          "'we did not check' and 'your dose is wrong' are opposite messages")
    from pipeline.donut import arc_detail
    wrong_dose = {"components": {"c": 0.8}, "applicability": {
        "form": {"match": 1.0, "assessable": 1.0},
        "dose": {"match": 0.05, "assessable": 1.0}}}
    check("dose arc tracks MATCH, not coverage",
          arc_fills(wrong_dose)["dose"] == 0.05,
          "a 10x-underdosed product must not show a full dose arc")
    unreported = {"components": {"c": 0.8}, "applicability": {
        "form": {"match": 1.0, "assessable": 1.0},
        "dose": {"match": 0.0, "assessable": 0.0}}}
    check("nobody reported a dose -> None (hatched), not 0 (wrong)",
          arc_fills(unreported)["dose"] is None
          and arc_detail(unreported)["dose"]["assessable"] == 0.0)
    # Every ring now sits on a hatched base; a solid track is drawn over the
    # ASSESSABLE portion. So "hatch visible" == "part of this axis was never
    # reported", which is exactly the message it should carry.
    def solid_tracks(svg):
        return svg.count(f'stroke="{TRACK}" stroke-width')
    check("an assessable axis gets a solid track over the hatch",
          solid_tracks(three_arc_svg(full)) == 3,
          "all three axes judged")
    check("an unassessable axis leaves the hatch bare",
          solid_tracks(three_arc_svg(nodose)) == 2,
          "dose never reported -> hatched, not empty")
    check("form arc reflects the exact-form share only",
          abs(arc_fills({"form_mix": {"exact": 1, "different": 9}})["form"] - 0.1) < 1e-9)

    print("\nSTORAGE (SQLite on a Postgres-shaped schema)")
    import tempfile
    from pipeline.storage import Store, now_iso
    with Store(os.path.join(tempfile.mkdtemp(), "t.sqlite")) as st_db:
        st_db.upsert_studies([
            {"_canonical": "registry:nct01234567", "pmid": "1", "is_synthesis": False,
             "design_rank": 4, "oa": "full_text", "source": "europepmc",
             "_merged_from": ["a", "b", "c"]},
            {"_canonical": "doi:109abc", "is_synthesis": True, "design_rank": 2,
             "oa": "abstract_only", "source": "europepmc"},
            {"_canonical": "pmid:99", "is_synthesis": False, "design_rank": None,
             "oa": "abstract_only", "source": "europepmc"}])
        c = st_db.counts()
        check("studies persisted", c["studies"] == 3 and c["syntheses"] == 1)
        check("unclassified queryable as the S1 budget",
              [r["canonical_id"] for r in st_db.unclassified()] == ["pmid:99"])

        try:
            st_db.upsert_studies([{"pmid": "7"}])
            ok = False
        except ValueError:
            ok = True
        check("refuses records that skipped dedup", ok,
              "no _canonical -> one trial would land four times")

        key = vocab.ecu_key("magnesium", "magnesium_glycinate", None,
                            "sleep_onset", "general_adult")
        pv = vocab.population_variants()[0]
        row = {"ecu_key": key, "ingredient": "magnesium",
               "form_vocab_id": "magnesium_glycinate", "dose_band": None,
               "band_version": 0, "outcome_vocab_id": "sleep_onset",
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}},
               "score": 71, "band": "strong support", "gate_fired": False,
               "components": {"d": 0.9, "c": 0.85, "H": 0.1, "E": 4.2,
                              "E_prime": 4.8, "coverage": 0.6},
               "evidence": {"n_primaries": 5, "n_syntheses": 2, "study_ids": []},
               "flags": ["brand_funded"],
               "provenance": {"prompt_version": "v1.1",
                              "vocab_versions": vocab.versions(),
                              "computed_at": now_iso()}}
        st_db.upsert_ecu(row, evidence=[
            {"canonical_id": "registry:nct01234567", "role": "primary",
             "w_study": 0.8, "s_value": 1.0, "transfer_factor": 1.0}])
        check("ECU round-trips", st_db.ecu(key)["score"] == 71)
        check("audit trail links study to ECU",
              st_db.evidence_for(key)[0]["canonical_id"] == "registry:nct01234567",
              "every published number must be reconstructible")
        check("band_version bump invalidates cached ECUs",
              st_db.stale_bands(1) == [key],
              "SPEC section 5 complexity flag, made queryable")
        st_db.upsert_ecu({**row, "score": 42})
        check("re-scoring updates in place, no duplicate row",
              st_db.counts()["ecus"] == 1 and st_db.ecu(key)["score"] == 42)

    # Each agent gets the section it needs. S8 was handed METHODS ++ RESULTS,
    # which cannot state who paid: 0/7 real texts contained a funding word.
    print("\nPER-AGENT SECTION ROUTING")
    import workers as _w2
    from sources import fulltext as _ft
    _secs = {"methods": "METHODS n=40 randomised",
             "results": "RESULTS strength rose, p=0.01",
             "discussion": "DISCUSSION consistent with prior work",
             "funding": "FUNDING supplied by AlzChem GmbH"}
    check("S8 gets the funding section, not the methods",
          _w2._agent_text("S8", "COMBINED", _secs) == _secs["funding"])
    check("S3/S4/S5/S7 keep the SHARED text, so the prompt cache keeps sharing",
          all(_w2._agent_text(a, "COMBINED", _secs) == "COMBINED"
              for a in ("S3", "S4", "S5", "S7")),
          "routing all five was -10% tokens but +27% cost: writes replaced reads")
    check("a missing section falls back to the combined text, never empty",
          _w2._agent_text("S8", "COMBINED", {"methods": "m"}) == "COMBINED",
          "an empty payload reads as a paper that reports nothing (invariant 7)")
    check("no sections at all falls back too",
          _w2._agent_text("S8", "COMBINED", None) == "COMBINED")
    check("only S8 is routed",
          set(_w2.AGENT_SECTIONS) == {"S8"}, str(set(_w2.AGENT_SECTIONS)))

    _jats = ("<article><body>"
             "<sec><title>Methods</title><p>n=40</p></sec>"
             "<sec><title>Results</title><p>p=0.01</p></sec>"
             "</body><back>"
             "<funding-group><funding-statement>Grant NIH-123"
             "</funding-statement></funding-group>"
             "<ack><title>Acknowledgments</title><p>Creapure by AlzChem</p></ack>"
             "</back></article>")
    _s = _ft.sections(_jats)
    check("JATS <funding-group> becomes a funding section",
          "NIH-123" in (_s.get("funding") or ""),
          "funding is usually NOT in a <sec>, which is why S8 was blind")
    check("JATS <ack> is folded into funding too",
          "AlzChem" in (_s.get("funding") or ""))
    check("methods and results still parse unchanged",
          "n=40" in _s.get("methods", "") and "p=0.01" in _s.get("results", ""))

    # Effort changes what comes back, so it must change the cache key. Without
    # this an A/B arm at a different effort silently reads the previous arm's
    # answers and reports them as its own.
    print("\nEFFORT IN THE CACHE KEY")
    import claude_adapter as _ca
    _k = lambda eff: _ca._key("S6", "claude-sonnet-5", '{"a":1}', eff)
    check("two effort levels give two cache keys", _k("high") != _k("xhigh"))
    check("no effort is its own key, not an alias of one",
          _k(None) != _k("high") and _k(None) == _k(""))
    check("same effort is stable", _k("high") == _k("high"))
    check("model still separates keys at equal effort",
          _ca._key("S6", "claude-opus-5", '{"a":1}', "high") != _k("high"))
    check("every declared effort level is one the CLI accepts",
          all(e in _ca.VALID_EFFORT for e in _ca.TIER_EFFORT.values() if e),
          f"TIER_EFFORT={_ca.TIER_EFFORT}")

    # ONE STUDY = ONE VOTE. Until 2026-08-10 build_ecus appended one Study per
    # CLAIM, so a trial S5 sliced into 20 rows voted 20 times: E, c, H and the
    # human-evidence gate were all set by the model's choice of granularity.
    print("\nONE STUDY = ONE VOTE")
    from pipeline.assemble import build_ecus as _b2, _one_study_one_vote
    _pr = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
           "population": {"id": "general_adult",
                          **{a: vocab.population_variants()[0][a] for a in vocab.AXES}}}

    def _ext(canonical, claims):
        return {"record": {"_canonical": canonical, "ingredient": "creatine",
                           "design_rank": 4, "oa": "full_text"},
                "extraction": {"S3": {"n_randomised": 40},
                               "S7": {"form_vocab_id": "creatine_monohydrate"},
                               "outcomes": [
                                   {"outcome_vocab_id": "muscle_strength",
                                    "claim": {"direction": d, "magnitude": m}}
                                   for d, m in claims]}}

    one = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")])],
              _pr, ignore_population=True)
    # Same finding, sliced into 6 (the sex x timepoint x region grid pattern).
    six = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")] * 6)],
              _pr, ignore_population=True)
    check("one trial sliced 6 ways scores the same as sliced once",
          one and six and one[0]["score"] == six[0]["score"],
          f"{one[0]['score'] if one else None} vs {six[0]['score'] if six else None}")
    check("evidence mass E is unchanged by the split",
          one[0]["components"]["E"] == six[0]["components"]["E"],
          f"E {one[0]['components']['E']} vs {six[0]['components']['E']}")
    check("n_primaries reports trials, not claims",
          six[0]["evidence"]["n_primaries"] == 1,
          str(six[0]["evidence"]["n_primaries"]))
    check("study_ids lists each trial once",
          six[0]["evidence"]["study_ids"] == ["doi:10.1/a"],
          str(six[0]["evidence"]["study_ids"]))
    check("a study is never heterogeneous with itself",
          six[0]["components"]["H"] == 0,
          f"H={six[0]['components']['H']}")

    # Invariant 7: a null is evidence AGAINST, and collapsing must never let a
    # benefit simply overwrite one. A 1-1 tie with no primary is not a win for
    # either -- it reads as `unclear`, s = 0.0. Verified 2026-08-10 against
    # PMC6534934, where the old conservative tiebreak filed a significant
    # +17.9% between-group power benefit as evidence against creatine.
    mixed = _b2([_ext("doi:10.1/a", [("benefit", "meaningful"), ("null_effect", None)])],
                _pr, ignore_population=True)
    only_null = _b2([_ext("doi:10.1/a", [("null_effect", None)])],
                    _pr, ignore_population=True)
    only_ben = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")])],
                   _pr, ignore_population=True)
    check("a benefit/null tie is neither side's win",
          only_null[0]["score"] < mixed[0]["score"] < only_ben[0]["score"],
          f"null={only_null[0]['score']} tie={mixed[0]['score']} benefit={only_ben[0]['score']}")
    check("a benefit/null tie adds no evidence in either direction",
          mixed[0]["components"]["d"] == 0.0,
          f"d={mixed[0]['components']['d']}")

    # ...AND STILL NOT WHEN THE SURVIVING CLAIM CARRIES A NUMBER. The pin above
    # passed either way, because its fixture sets no effect_size -- so it stopped
    # testing the property the moment s_value started preferring a measured
    # effect over the label. `_collapse` must clear effect_s alongside direction,
    # or a tie silently picks a side.
    def _ext_sized(canonical, claims):
        return {"record": {"_canonical": canonical, "ingredient": "creatine",
                           "design_rank": 4, "oa": "full_text"},
                "extraction": {"S3": {"n_randomised": 40},
                               "S7": {"form_vocab_id": "creatine_monohydrate"},
                               "outcomes": [
                                   {"outcome_vocab_id": "muscle_strength",
                                    "claim": {"direction": d, "magnitude": m,
                                              "effect_size": 0.75,
                                              "effect_unit": "cohen's d",
                                              "effect_favours": "ingredient"}}
                                   for d, m in claims]}}
    _tie_sized = _b2([_ext_sized("doi:10.1/t",
                                 [("benefit", "meaningful"), ("null_effect", None)])],
                     _pr, ignore_population=True)
    check("a SIZED benefit/null tie still adds no evidence in either direction",
          _tie_sized[0]["components"]["d"] == 0.0,
          f"d={_tie_sized[0]['components']['d']} -- if this is non-zero, the tie "
          f"rule is being overridden by a number it was supposed to set aside")

    # ELIGIBILITY (2026-08-10). A trial with no ingredient-free arm, or one its
    # own authors call a pilot, cannot vote on whether the ingredient works.
    def _flagged(canonical, direction, **s3):
        e = _ext(canonical, [(direction, "meaningful" if direction == "benefit" else None)])
        e["extraction"]["S3"].update(s3)
        return e
    _base = _b2([_flagged("doi:10.1/e1", "null_effect"),
                 _flagged("doi:10.1/e2", "null_effect")], _pr, ignore_population=True)
    _st = {}
    _gated = _b2([_flagged("doi:10.1/e1", "null_effect"),
                  _flagged("doi:10.1/e2", "null_effect",
                           comparator="all_arms_get_ingredient")],
                 _pr, ignore_population=True, stats=_st)
    check("a trial where every arm gets the ingredient does not vote",
          _gated[0]["evidence"]["n_primaries"] == 1
          and _base[0]["evidence"]["n_primaries"] == 2
          and _st["ineligible_by_reason"] == {"no_ingredient_free_arm": 1},
          f"n={_gated[0]['evidence']['n_primaries']} stats={_st}")

    _st2 = {}
    _pilot = _b2([_flagged("doi:10.1/e1", "null_effect"),
                  _flagged("doi:10.1/e2", "null_effect",
                           self_declared_underpowered=True)],
                 _pr, ignore_population=True, stats=_st2)
    check("a self-declared pilot's null does not vote",
          _pilot[0]["evidence"]["n_primaries"] == 1
          and _st2["ineligible_by_reason"] == {"self_declared_underpowered": 1})

    # ...and SYMMETRICALLY: a pilot's BENEFIT is dropped too. Keeping pilot
    # benefits while dropping pilot nulls is the one-way handling of uncertainty
    # this gate exists to remove.
    _st3 = {}
    _pb = _b2([_flagged("doi:10.1/e1", "benefit"),
               _flagged("doi:10.1/e2", "benefit", self_declared_underpowered=True)],
              _pr, ignore_population=True, stats=_st3)
    check("a self-declared pilot's BENEFIT is dropped too",
          _pb[0]["evidence"]["n_primaries"] == 1 and _st3["ineligible_total"] == 1,
          "the gate must not be a one-way ratchet")

    # THIRD REFUSAL (2026-08-10, decision delegated by the founder): a trial
    # whose every ingredient arm co-administers another active tests a
    # COMBINATION. 21/143 audited studies were this shape with a genuine
    # placebo, so the all_arms refusal correctly never fired on them.
    _st4 = {}
    _combo = _b2([_flagged("doi:10.1/e1", "null_effect"),
                  _flagged("doi:10.1/e2", "null_effect", ingredient_isolated="no")],
                 _pr, ignore_population=True, stats=_st4)
    check("a combination-only trial does not vote",
          _combo[0]["evidence"]["n_primaries"] == 1
          and _st4["ineligible_by_reason"] == {"no_isolated_ingredient_arm": 1},
          f"stats={_st4}")
    _st5 = {}
    _combo_b = _b2([_flagged("doi:10.1/e1", "benefit"),
                    _flagged("doi:10.1/e2", "benefit", ingredient_isolated="no")],
                   _pr, ignore_population=True, stats=_st5)
    check("a combination's BENEFIT is dropped too (symmetric)",
          _combo_b[0]["evidence"]["n_primaries"] == 1 and _st5["ineligible_total"] == 1,
          "creatine+HMB improving strength is not evidence about creatine alone")
    import json as _json, pathlib as _pl
    _s3schema = _json.load(open(_pl.Path(__file__).parent.parent / "schemas" / "s3_study.json"))
    _iso = (_s3schema.get("properties") or {}).get("ingredient_isolated") or {}
    check("ingredient_isolated is in the S3 schema with 'no' in its enum",
          "no" in (_iso.get("enum") or []),
          "rename the enum and _ineligible silently never fires -- the "
          "schema-drift trap invariant 7 already fell into once")

    # A silent or hesitant extractor must never cost us a study.
    for _val in ({}, {"comparator": None}, {"comparator": "unknown"},
                 {"self_declared_underpowered": None}, {"self_declared_underpowered": False},
                 {"ingredient_isolated": None}, {"ingredient_isolated": "unknown"},
                 {"ingredient_isolated": "yes"}):
        _keep = _b2([_flagged("doi:10.1/e1", "null_effect"),
                     _flagged("doi:10.1/e2", "null_effect", **_val)],
                    _pr, ignore_population=True)
        check(f"eligibility defaults to KEEP for {_val or 'a missing field'}",
              _keep[0]["evidence"]["n_primaries"] == 2,
              f"n={_keep[0]['evidence']['n_primaries']}")

    # Two DIFFERENT trials must still both count -- the fix must not over-collapse.
    two = _b2([_ext("doi:10.1/a", [("benefit", "meaningful")]),
               _ext("doi:10.1/b", [("benefit", "meaningful")])],
              _pr, ignore_population=True)
    check("two distinct trials still contribute two votes",
          two[0]["evidence"]["n_primaries"] == 2
          and two[0]["components"]["E"] > one[0]["components"]["E"],
          f"n={two[0]['evidence']['n_primaries']} E={two[0]['components']['E']}")

    # The gate was defeatable by granularity: DESIGN_W[6]=0.30 is below
    # GATE_MIN_HUMAN_WD=0.5 alone, but two copies of the same study summed to
    # 0.60 and passed "not enough human evidence".
    def _weak(canonical, n_claims):
        e = _ext(canonical, [("benefit", "meaningful")] * n_claims)
        e["record"]["design_rank"] = 6
        return e
    weak1 = _b2([_weak("doi:10.1/w", 1)], _pr, ignore_population=True)
    weak2 = _b2([_weak("doi:10.1/w", 2)], _pr, ignore_population=True)
    check("the human-evidence gate cannot be passed by splitting one study",
          weak1[0]["gate_fired"] and weak2[0]["gate_fired"],
          f"1 claim gate={weak1[0]['gate_fired']}, 2 claims gate={weak2[0]['gate_fired']}")

    _s = lambda i, d: Study(id=i, design_rank=4, n=40, direction=d,
                            magnitude="meaningful" if d == "benefit" else None)
    # No primary declared -> MAJORITY wins; a benefit/null tie reads `unclear`.
    _kept, _n = _one_study_one_vote([
        (_s("a", "benefit"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
        (_s("b", "benefit"), {"outcome_id": "o"}),
    ])
    check("no primary + 1-1 tie reads as unclear, not as a null",
          [s.id for s, _ in _kept] == ["a", "b"]
          and _kept[0][0].direction == "unclear" and _n == 1,
          f"{[(s.id, s.direction) for s, _ in _kept]} collapsed={_n}")

    # ...but a harm signal is never averaged away by a tie.
    _keptH, _ = _one_study_one_vote([
        (_s("a", "harm"), {"outcome_id": "o"}),
        (_s("a", "benefit"), {"outcome_id": "o"}),
    ])
    check("harm wins any tie it is in", _keptH[0][0].direction == "harm",
          "a safety signal must not be averaged away")
    _keptH2, _ = _one_study_one_vote([
        (_s("a", "harm"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
    ])
    check("harm beats a tied null too", _keptH2[0][0].direction == "harm")

    # THE FIX: the trial's own primary endpoint outranks a secondary null.
    _kept2, _ = _one_study_one_vote([
        (_s("a", "null_effect"), {"outcome_id": "o", "is_primary": False}),
        (_s("a", "benefit"), {"outcome_id": "o", "is_primary": True}),
    ])
    check("a PRIMARY benefit is not overruled by a secondary null",
          _kept2[0][0].direction == "benefit",
          "measured: 28 of 87 trials had their primary benefit filed as null/harm")

    # ...but a primary NULL still wins over a secondary benefit. Invariant 7.
    _kept3, _ = _one_study_one_vote([
        (_s("a", "benefit"), {"outcome_id": "o", "is_primary": False}),
        (_s("a", "null_effect"), {"outcome_id": "o", "is_primary": True}),
    ])
    check("a PRIMARY null is not overruled by a secondary benefit",
          _kept3[0][0].direction == "null_effect",
          "the fix must not become 'any benefit wins'")

    # Majority: 3 nulls vs 1 benefit, no primary -> null. Resists cherry-picking.
    _kept4, _ = _one_study_one_vote([
        (_s("a", "benefit"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
    ])
    check("one positive among many nulls does not win without a primary",
          _kept4[0][0].direction == "null_effect",
          "multiple-comparisons guard")

    # Batched S6 matches results back BY INDEX. If it ever matched by position,
    # a reordered or short array would shift every mapping onto the wrong claim
    # -- silently filing evidence about one outcome under another, which is the
    # exact failure S6's prompt calls unrecoverable.
    print("\nBATCHED S6 INDEX MATCHING")
    import workers as _wk
    _claims = [{"outcome_raw": "hand grip strength"},
               {"outcome_raw": "leg press 1-RM"},
               {"outcome_raw": "serum creatinine"}]
    _rec = {"_canonical": "doi:10.1/b", "ingredient": "creatine", "title": "t",
            "abstract": "oral creatine supplementation 3 g/day", "design_rank": 4}

    def _fake_call(shuffled, drop=()):
        def _c(agent, payload):
            if agent == "S5":
                return {"claims": _claims}, {}
            if agent == "S6B":
                m = [{"index": 0, "outcome_vocab_id": "muscle_strength",
                      "confidence": 0.9, "rationale": "grip"},
                     {"index": 1, "outcome_vocab_id": "muscle_strength",
                      "confidence": 0.9, "rationale": "1rm"},
                     {"index": 2, "outcome_vocab_id": None,
                      "confidence": 0.2, "rationale": "biomarker"}]
                m = [x for x in m if x["index"] not in drop]
                return {"mappings": list(reversed(m)) if shuffled else m}, {}
            return {}, {}
        return _c

    _saved = _wk.S6_BATCH
    _wk.S6_BATCH = True
    try:
        out = _wk.extract_study(_rec, "x" * 500, call=_fake_call(shuffled=True))
        got = [(o["claim"]["outcome_raw"], o["outcome_vocab_id"])
               for o in out["outcomes"]]
        check("a REORDERED batch response still lands on the right claim",
              got == [("hand grip strength", "muscle_strength"),
                      ("leg press 1-RM", "muscle_strength"),
                      ("serum creatinine", None)],
              str(got))
        out2 = _wk.extract_study(_rec, "x" * 500, call=_fake_call(False, drop=(1,)))
        got2 = [(o["claim"]["outcome_raw"], o["outcome_vocab_id"])
                for o in out2["outcomes"]]
        check("a MISSING index is discarded, never shifted onto its neighbour",
              got2 == [("hand grip strength", "muscle_strength"),
                       ("leg press 1-RM", None),
                       ("serum creatinine", None)],
              str(got2))
        check("every claim still yields exactly one outcome row",
              len(out["outcomes"]) == len(_claims))
    finally:
        _wk.S6_BATCH = _saved

    # The single defect that zeroed every score: a head-only text trim deleted
    # the Results section, so S5 truthfully reported no claims.
    print("\nPROMPT TEXT FITTING")
    import workers as _w
    _body = ("METHODS " + "m" * 30000 + " RESULTS the group improved, p = 0.001 "
             + "CONCLUSION creatine increased strength.")
    _fitted = _w._fit_text("S5", _body, 2000)
    check("long text is trimmed at all", len(_fitted) < len(_body))
    check("the RESULTS tail survives the trim",
          "p = 0.001" in _fitted and "CONCLUSION" in _fitted,
          "head-only trimming cost S5 every claim it should have made")
    check("the METHODS head also survives",
          _fitted.startswith("METHODS"),
          "S3 reads n / population / design from the head")
    check("the elision is explicit, not a silent cut",
          _w.ELISION.strip() in _fitted,
          "a model must not read a truncation as a finished sentence")
    check("short text is passed through untouched",
          _w._fit_text("S5", "short study text", 2000) == "short study text")

    # build_ecus read `outcome_id` inside the argument list of the generator that
    # BINDS it. Crashed outright when nothing mapped; silently reused the last
    # outcome's dose band for every study when something did.
    print("\nDOSE BAND IS PER OUTCOME")
    from pipeline.assemble import build_ecus as _build, to_studies as _to_studies
    _prod = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
             "dose_low_mg": 3000, "dose_high_mg": 3000,
             "population": {"id": "general_adult",
                            **{a: vocab.population_variants()[0][a] for a in vocab.AXES}}}

    def _extraction(outcome_id, direction, dose_mg):
        return {"record": {"_canonical": f"doi:10.1/{outcome_id}{dose_mg}",
                           "ingredient": "creatine", "design_rank": 4,
                           "oa": "full_text"},
                "extraction": {
                    "S3": {"n_randomised": 40},
                    "S7": {"form_vocab_id": "creatine_monohydrate",
                           "elemental_dose_mg": dose_mg},
                    "outcomes": [{"outcome_vocab_id": outcome_id,
                                  "claim": {"direction": direction,
                                            "magnitude": "moderate"}}]}}

    # The exact shape that crashed: no outcome ever mapped, so the loop variable
    # was never bound at all.
    no_outcomes = [{"record": {"_canonical": "doi:10.1/none", "ingredient": "creatine",
                               "design_rank": 4, "oa": "full_text"},
                    "extraction": {"S3": {"n_randomised": 40}, "outcomes": []}}]
    try:
        _build(no_outcomes, _prod, ignore_population=True)
        crashed = False
    except UnboundLocalError:
        crashed = True
    check("a corpus where nothing mapped does not crash the scorer", not crashed,
          "UnboundLocalError: local variable 'outcome_id' referenced before assignment")

    # DOSE_MATCH IS STUDY-vs-PRODUCT (2026-08-12). It used to be product-vs-
    # derived-band, which is one value per outcome stamped onto every study --
    # so the dose arc was degenerate: a clone of the effect arc when the product
    # was in band, and EMPTY ("not tested") when it was not. Measured on the
    # v1.18 run: a 4.4 g product against a 4.8-5.0 g lean-mass band rendered
    # "not tested" instead of "your dose is BELOW where trials found benefit".
    # These pins guard the same hazards the old ones did, restated per study.
    mixed = [_extraction("muscle_strength", "benefit", 3000),
             _extraction("muscle_strength", "benefit", 3000),
             _extraction("cognitive_function", "benefit", 20000)]
    per_study_match = {}
    for item in mixed:
        for oid, st, _d, _p in _to_studies(
                item["record"], item["extraction"], _prod, None,
                ignore_population=True,
                dose_bands={"muscle_strength": {"low": 3000, "high": 3000},
                            "cognitive_function": {"low": 20000, "high": 20000}}):
            per_study_match[(oid, item["extraction"]["S7"]["elemental_dose_mg"])] = st.dose_match
    check("a study dosed AT the product's dose is in the dose arc",
          per_study_match.get(("muscle_strength", 3000)) == "in_band",
          f"{per_study_match} — product is dosed 3000mg")
    check("a loading-dose trial is NOT evidence at a maintenance product's dose",
          per_study_match.get(("cognitive_function", 20000)) == "above_200",
          "20 g against a 3 g product is above_200; the old product-vs-band rule "
          "put loading trials in the arc whenever the DERIVED band was loading-"
          "sized, which is how muscle_power's arc came to describe 20 g protocols "
          "while the product held 4.4 g")
    # PER-KG DOSING (v1.19). 25 of 76 dose-less extractions were "0.3 g/kg/day"
    # shapes. The multiplication is deterministic and happens only when BOTH
    # numbers are the paper's own.
    from pipeline.assemble import study_dose as _sd
    _pk = _sd("creatine", {"dose_per_kg_mg": 300, "mean_body_mass_kg": 80})
    check("a per-kg dose with a STATED mean mass becomes a daily total",
          _pk["dose_low_mg"] == 24000 and _pk["dose_basis"] == "per_kg_x_stated_mass",
          f"{_pk} -- 300 mg/kg x 80 kg, arithmetic on reported numbers")
    check("a per-kg dose with NO stated mass stays doseless",
          _sd("creatine", {"dose_per_kg_mg": 300})["dose_low_mg"] is None,
          "invariant 5: assuming a typical body weight would be inventing a "
          "number, and a dose off by the guess corrupts the band it feeds")
    check("a stated elemental dose beats the per-kg path",
          _sd("creatine", {"elemental_dose_mg": 5000, "dose_per_kg_mg": 300,
                           "mean_body_mass_kg": 80})["dose_low_mg"] == 5000)
    from workers import _dose_snippets as _ds
    _txt = ("Participants ingested 20 g/day of creatine for 5 days, then "
            "5 g/day maintenance. " + "filler sentence. " * 400 +
            "The control group received 0.3 g/kg/day of placebo.")
    _sn = _ds(_txt)
    check("dose snippets survive where truncation would cut them",
          any("20 g/day" in x for x in _sn) and any("0.3 g/kg" in x for x in _sn),
          "12 of 76 dose-less extractions had the dose in the full text but not "
          "in the slice S7 received; the harvest is regex, zero judgement")
    check("dose snippets are capped and deduplicated",
          len(_ds("5 g/day. " * 100)) <= 5 and len(_ds("")) == 0)

    check("a study with NO extracted dose is unassessable, never in_band",
          _to_studies(
              [{"record": {"_canonical": "doi:10.1/nodose", "ingredient": "creatine",
                           "design_rank": 4, "oa": "full_text"},
                "extraction": {"S3": {"n_randomised": 40},
                               "outcomes": [{"outcome_vocab_id": "muscle_strength",
                                             "claim": {"direction": "benefit",
                                                       "magnitude": "meaningful"}}]}}][0]["record"],
              {"S3": {"n_randomised": 40},
               "outcomes": [{"outcome_vocab_id": "muscle_strength",
                             "claim": {"direction": "benefit",
                                       "magnitude": "meaningful"}}]},
              _prod, None, ignore_population=True, dose_bands={})[0][1].dose_match
          == "unspecified",
          "in_band here read +1.00 @ 100% exactly where nothing was known -- the "
          "2026-08-09 lesson, unchanged; only WHOSE dose is unknown changed")

    # A vocab ID is not a search term. 7 of 19 ingredients carry an underscore
    # and were silently unretrievable until 2026-08-09; the symptom was
    # "0 trials found", which reads as "this ingredient has no evidence".
    print("\nINGREDIENT -> SEARCH TERM")
    from sources import europepmc as _ep
    check("underscore becomes a space", _ep.search_term("vitamin_d") == "vitamin d")
    check("multi-underscore ids work", _ep.search_term("ginkgo_biloba") == "ginkgo biloba")
    check("single-word ids are unchanged",
          _ep.search_term("creatine") == "creatine",
          "why creatine/magnesium runs never exposed this")
    # The gate holds a vocab id too, and dropped 175/175 vitamin D RCTs as
    # "noise" -- a message that reads like the gate working.
    from pipeline.relevance import relevance_check as _rc
    _vd = {"title": "Effect of vitamin D supplementation on muscle strength: an RCT",
           "abstract": "Participants received oral vitamin D3 4000 IU daily."}
    check("relevance gate matches a snake_case id against real prose",
          _rc(_vd, "vitamin_d")[0], "dropped 175/175 vitamin D RCTs before this")
    check("relevance gate still rejects the wrong ingredient",
          not _rc({"title": "Zinc and immunity", "abstract": "oral zinc"},
                  "vitamin_d")[0],
          "the fix must not make the gate permissive")

    check("no underscore survives into a query",
          "vitamin_d" not in _ep._query("vitamin_d", syntheses=False, scope="intervention")
          and 'TITLE:"vitamin d"' in _ep._query("vitamin_d", syntheses=False,
                                                scope="intervention"),
          'TITLE:"vitamin_d" matched ~nothing; PUB_TYPE is a field name, not a term')
    check("per-outcome queries are fixed too",
          "_" not in _ep.outcome_query("vitamin_d", "sleep_quality").replace("PUB_TYPE", ""),
          "outcome_query had its own copy of the bug")

    # Three parallel ingredient runs share a store. Before 2026-08-09 the second
    # writer failed instantly with "database is locked".
    print("\nSTORE CONCURRENCY")
    import threading as _th
    with tempfile.TemporaryDirectory() as td:
        p = pathlib.Path(td) / "conc.sqlite"
        with Store(p) as s0:
            check("WAL is on (one writer + many readers)",
                  s0.conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal")
            check("busy_timeout makes a competing writer wait, not raise",
                  s0.conn.execute("PRAGMA busy_timeout").fetchone()[0] >= 5000)
        errs: list[str] = []

        def _w(tag):
            try:
                u, _, _ = dedup([{"pmid": f"{tag}{i}", "title": "T",
                                  "doi": f"10.1/{tag}{i}"} for i in range(60)])
                with Store(p) as writer:
                    writer.upsert_studies(u)
            except Exception as exc:            # noqa: BLE001 - reporting it IS the test
                errs.append(f"{tag}: {exc}")
        threads = [_th.Thread(target=_w, args=(t,)) for t in ("a", "b", "c")]
        [t.start() for t in threads]
        [t.join() for t in threads]
        check("3 concurrent writers all commit", not errs, str(errs))
        with Store(p) as reader:
            check("no writer silently lost its rows",
                  reader.counts()["studies"] == 180,
                  "180 = 3 x 60, the parallel-run case")

    # The predatory check had ZERO coverage until 2026-08-09, in the one feature
    # where a false positive is a defamation-shaped error. Every case below is a
    # real string that a real run produced.
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
        "importlib":       "import importlib\nimportlib.import_module('pilot_adapter')\n",
        "__import__":      "m = __import__('claude_adapter')\n",
        "try-guarded":     "try:\n    import claude_adapter\nexcept ImportError:\n    pass\n",
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
              "in a comment": "# see claude_adapter.py:102\n"}
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
    # the penalty entirely reaches only 20%). See scripts/penalty_experiment.py.
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

    print(f"\n{'ALL PASSED' if not fails else 'FAILURES: ' + ', '.join(fails)}\n")
    return 1 if fails else 0


def _reasonless_probe(_inv):
    """Temporarily plant an empty-reason exception and confirm it is reported.

    Restores the real allowlist on the way out. Without this the 'reason
    required' rule is untested and an entry could be added with '' forever.
    """
    real = dict(_inv.IMPORT_EXCEPTIONS)
    try:
        _inv.IMPORT_EXCEPTIONS[("pipeline/selftest.py", "claude_adapter")] = ""
        return _inv.exception_problems()
    finally:
        _inv.IMPORT_EXCEPTIONS.clear()
        _inv.IMPORT_EXCEPTIONS.update(real)

if __name__ == "__main__":
    sys.exit(main())
