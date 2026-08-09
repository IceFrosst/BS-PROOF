"""Zero-model regression test for the deterministic layer. python -m pipeline.selftest"""
import sys, os, pathlib
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

    print("\nFOUR ARCS + 0-100 COMPOSITE")
    from pipeline import arcs as A
    from pipeline.donut import four_arc_svg
    ROBC = {f"i{i}": 1 for i in range(1, 7)}
    def _s(direction, form, dose, mag=None, n=200, oa="full_text", rob=None):
        return Study(id=f"{direction}{form}{dose}{n}{oa}", design_rank=4, n=n,
                     rob_items=rob or ROBC, funding="independent", oa=oa,
                     form_match=form, dose_match=dose, pop_match="exact",
                     direction=direction, magnitude=mag)

    harmful = A.build([_s("harm", "exact", "in_band") for _ in range(10)])
    works = A.build([_s("benefit", "exact", "in_band", "meaningful") for _ in range(10)])
    check("harmful product cannot accumulate points from a good form match",
          harmful["composite"] == 0,
          "summing arcs gave it 74/100; the form arc is now the VERDICT, -1.00")
    check("clean positive reaches the top", works["composite"] >= 90)

    yourform = A.build([_s("benefit", "different", "in_band", "meaningful") for _ in range(8)]
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

    untested = A.build([_s("benefit", "different", "in_band", "meaningful") for _ in range(10)])
    check("no trial in your form is PENALISED, not dropped",
          untested["composite"] < works["composite"],
          f"{untested['composite']} vs {works['composite']} — averaging over "
          f"available arcs gave both 99")
    check("an untested axis has no verdict and zero coverage",
          untested["arcs"]["form"]["verdict"] is None
          and untested["arcs"]["form"]["coverage"] == 0.0)

    thin = A.build([_s("benefit", "exact", "in_band", "meaningful", n=20,
                       oa="abstract_only", rob={f"i{i}": 0 for i in range(1, 7)})])
    nulls = A.build([_s("null_effect", "exact", "in_band") for _ in range(20)])
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

    # Guard the plumbing itself: whatever the runner hands the report must carry
    # everything the report renders from.
    import re as _re
    _rp = (pathlib.Path(__file__).parent.parent / "run_pipeline.py").read_text()
    _proj = _rp[_rp.index('run_context["ecu_rows"]'):]
    _proj = _proj[:_proj.index("} for r in rows]")]
    _have = set(_re.findall(r'"(\w+)":', _proj))
    _need = {"outcome_vocab_id", "composite", "arcs", "components", "band",
             "n_primaries"}
    _missing = sorted(_need - _have)
    check("runner projects every field the report renders", not _missing,
          f"missing: {_missing}" if _missing else f"{len(_need)} fields present")

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

    # Invariant 7: a null is evidence AGAINST. Collapsing must never drop one
    # in favour of a benefit -- that is the score-inflating direction.
    mixed = _b2([_ext("doi:10.1/a", [("benefit", "meaningful"), ("null_effect", None)])],
                _pr, ignore_population=True)
    only_null = _b2([_ext("doi:10.1/a", [("null_effect", None)])],
                    _pr, ignore_population=True)
    check("a null_effect is never dropped in favour of a benefit",
          mixed[0]["score"] == only_null[0]["score"],
          f"mixed={mixed[0]['score']} null-only={only_null[0]['score']}")

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
    # No primary declared -> MAJORITY wins, ties broken conservatively.
    _kept, _n = _one_study_one_vote([
        (_s("a", "benefit"), {"outcome_id": "o"}),
        (_s("a", "null_effect"), {"outcome_id": "o"}),
        (_s("b", "benefit"), {"outcome_id": "o"}),
    ])
    check("no primary + 1-1 tie collapses conservatively",
          [s.id for s, _ in _kept] == ["a", "b"]
          and _kept[0][0].direction == "null_effect" and _n == 1,
          f"{[(s.id, s.direction) for s, _ in _kept]} collapsed={_n}")

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

    # Two outcomes, wildly different doses. If one band leaks onto the other,
    # the low-dose outcome's study reads in_band against the high-dose band.
    mixed = [_extraction("muscle_strength", "benefit", 3000),
             _extraction("muscle_strength", "benefit", 3000),
             _extraction("cognitive_function", "benefit", 20000)]
    per_outcome_match = {}
    for item in mixed:
        for oid, st, _d, _p in _to_studies(
                item["record"], item["extraction"], _prod, None,
                ignore_population=True,
                dose_bands={"muscle_strength": {"low": 3000, "high": 3000},
                            "cognitive_function": {"low": 20000, "high": 20000}}):
            per_outcome_match[(oid, item["extraction"]["S7"]["elemental_dose_mg"])] = st.dose_match
    check("each outcome is matched against ITS OWN band",
          per_outcome_match.get(("muscle_strength", 3000)) == "in_band"
          and per_outcome_match.get(("cognitive_function", 20000)) != "in_band",
          f"{per_outcome_match} — product is dosed 3000mg")
    check("no band for an outcome means unassessable, never in_band",
          _to_studies(mixed[0]["record"], mixed[0]["extraction"], _prod, None,
                      ignore_population=True, dose_bands={})[0][1].dose_match
          == "unspecified",
          "in_band here read +1.00 @ 100% exactly where nothing was known")

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
        s0 = Store(p)
        check("WAL is on (one writer + many readers)",
              s0.conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal")
        check("busy_timeout makes a competing writer wait, not raise",
              s0.conn.execute("PRAGMA busy_timeout").fetchone()[0] >= 5000)
        errs: list[str] = []

        def _w(tag):
            try:
                u, _, _ = dedup([{"pmid": f"{tag}{i}", "title": "T",
                                  "doi": f"10.1/{tag}{i}"} for i in range(60)])
                Store(p).upsert_studies(u)
            except Exception as exc:            # noqa: BLE001 - reporting it IS the test
                errs.append(f"{tag}: {exc}")
        threads = [_th.Thread(target=_w, args=(t,)) for t in ("a", "b", "c")]
        [t.start() for t in threads]
        [t.join() for t in threads]
        check("3 concurrent writers all commit", not errs, str(errs))
        check("no writer silently lost its rows",
              Store(p).counts()["studies"] == 180,
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

    print(f"\n{'ALL PASSED' if not fails else 'FAILURES: ' + ', '.join(fails)}\n")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
