"""Selftest group: Dedup, registry ids, the signed score, bands, transfer, gate, penalties, vocabularies, dose and population matching.

Moved verbatim out of the single pipeline/selftest.py main() on 2026-10-03;
run order is preserved by pipeline/selftest/__init__.py."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import Study, score_ecu, band_for, S_VALUE, standardise_effect, dedup, canonical_id, registry_id, vocab, ROB_CLEAN, rcts, _reasonless_probe  # noqa: F401


def run(check):
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
    # in scripts/experiments/effect_size_experiment.py arm E, which exists as the control.
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
    return {"_sc": _sc}
