"""Zero-model regression test for the deterministic layer. python -m pipeline.selftest"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.scoring import Study, score_ecu, band_for
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
    check("12 null RCTs -> negative", n["score"] < -40, f"score {n['score']}")
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
          by_outcome["anxiety"]["score"] < -40,
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
    _, st_def, _ = to_studies(with_pop(deficient)["record"] | {"ingredient": "magnesium"},
                           with_pop(deficient)["extraction"], product)[0]
    _, st_match, _ = to_studies(with_pop(axes)["record"] | {"ingredient": "magnesium"},
                             with_pop(axes)["extraction"], product)[0]
    check("population axes are still EXTRACTED and recorded",
          st_def.pop_match != st_match.pop_match,
          f"deficient vs general-adult: {st_def.pop_match} — recorded even though "
          f"APPLY_POP_IN_WEIGHT is off, so re-enabling costs one line")
    _, st_unknown, _ = to_studies(
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
        check("relative pair anchors skipped, not judged on a range",
              ev["skipped_pair_anchors"] == [pair["id"]])

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

    mostly_unknown = {"extraction_complete": True, "included_studies":
                      [{"label": f"X{i}"} for i in range(9)]
                      + [{"label": "Y", "nct": "NCT00000001"}]}
    r2 = syn.resolve_included(mostly_unknown, idx)
    check("an SR we cannot resolve is UNRESOLVED, not partial credit",
          r2["resolved"] is False and syn.quality(mostly_unknown, r2) == 0.0,
          f"{r2['resolved_fraction']:.0%} resolved — score_ecu ignores it")

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

    check("complete SR with a RoB table scores highest quality",
          syn.quality(s2_good, r) == syn.Q_COMPLETE_WITH_ROB)
    check("incomplete extraction is downgraded",
          syn.quality({**s2_good, "extraction_complete": False}, r) == syn.Q_PARTIAL)
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
          len(oamod.referenced_dois(oa_work)) == 3,
          "narrows S2's search space; never decides membership")
    check("europepmc full_text short-circuits the lookup",
          oamod.resolve({"oa": "full_text", "doi": "10.1/x"})["checked"] == ["europepmc"],
          "free answer wins")
    check("no DOI -> nothing to resolve against",
          oamod.resolve({"oa": "abstract_only", "doi": None})["checked"] == [])
    try:
        oamod.unpaywall("10.1/x")
        gated = False
    except oamod.ContactEmailMissing:
        gated = True
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

    print("\nSR-TABLE INHERITANCE PAYLOAD")
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import run_sr_inheritance as sri
    pay = sri.s2_payload({"title": "An SR"}, jats)
    check("only the included-studies table is sent when the filter hits",
          pay["table_filter_hit"] and len(pay["tables"]) == 1
          and "included" in (pay["tables"][0]["caption"] or "").lower(),
          "the adverse-events table is not S2's job")
    check("table row structure survives into the payload",
          pay["tables"][0]["rows"][1][2] == "400 mg",
          "prose would lose which dose belongs to which trial")
    check("methods included, discussion not",
          "double-blind" in pay["methods"] and "conclude" not in pay["methods"])
    no_match = """<article><body><table-wrap><caption><p>Baseline data</p></caption>
      <table><tr><th>Age</th></tr><tr><td>44</td></tr></table></table-wrap></body></article>"""
    pay2 = sri.s2_payload({"title": "x"}, no_match)
    check("filter miss falls back to all tables, never to nothing",
          pay2["table_filter_hit"] is False and len(pay2["tables"]) == 1,
          "the heuristic filters; S2 decides")

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
    check("projected c exceeds sample c", pm["c_projected"] > pm["c_sample"])
    check("projection lands nearer the truth than the raw sample score",
          abs(pm["projected"] - big["score"]) <= abs(pm["sample_score"] - big["score"]),
          f"raw {pm['sample_score']:+d} -> projected {pm['projected']:+d} "
          f"vs true {big['score']:+d}")
    check("error bar shrinks with sample size",
          preview._expected_error(5) > preview._expected_error(40) > preview._expected_error(200))
    check("cheap evidence needs far more of it",
          preview.studies_needed(0.023) > 10 * preview.studies_needed(0.56),
          f"{preview.studies_needed(0.023)} vs {preview.studies_needed(0.56)} studies for c=0.9")

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

    print(f"\n{'ALL PASSED' if not fails else 'FAILURES: ' + ', '.join(fails)}\n")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
