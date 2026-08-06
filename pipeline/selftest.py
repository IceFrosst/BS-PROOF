"""Zero-model regression test for the deterministic layer. python -m pipeline.selftest"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.scoring import Study, score_ecu, band_for
from pipeline.dedup import dedup, canonical_id, registry_id

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
    wrong = score_ecu(rcts(9, form_match="different", dose_match="below_50"), [])
    check("wrong form + underdosed collapses score",
          wrong["score"] < a["score"] - 50, f"{a['score']} -> {wrong['score']}")
    fam = score_ecu(rcts(9, form_match="salt_family"), [])
    check("salt family sits between", wrong["score"] < fam["score"] < a["score"],
          f"{wrong['score']} < {fam['score']} < {a['score']}")

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

    print(f"\n{'ALL PASSED' if not fails else 'FAILURES: ' + ', '.join(fails)}\n")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
