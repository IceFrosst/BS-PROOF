"""Zero-model regression test for the deterministic layer. python -m pipeline.selftest"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.scoring import Study, score_ecu
from pipeline.dedup import dedup

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
                         direction="null_effect") for i in range(12)], [])
    check("12 null RCTs -> negative", n["score"] < -40, f"score {n['score']}")
    h = score_ecu(rcts(6, direction="harm", magnitude=None), [])
    check("harm -> strong negative", h["score"] <= -70, f"score {h['score']}")

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

    print(f"\n{'ALL PASSED' if not fails else 'FAILURES: ' + ', '.join(fails)}\n")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
