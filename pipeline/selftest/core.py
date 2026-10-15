"""Selftest group: dedup, registry ids, vocabularies, dose conversion, form and population matching."""
import sys, os, pathlib  # noqa: F401  (sections use them)
from pipeline.selftest._common import dedup, canonical_id, registry_id, vocab, _reasonless_probe  # noqa: F401


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
