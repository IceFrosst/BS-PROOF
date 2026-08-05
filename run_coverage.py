#!/usr/bin/env python3
"""
WEEK-1 MEASUREMENT SCRIPT. Run this BEFORE building anything else.

Settles the largest unknown in the project by measuring TWO different rates
that are routinely conflated:

  raw OA full text  -- can we download the PDF/XML?
  methods facts     -- can we answer the RoB questions at all, from ANY source
                       (full text, an SR table, ct.gov results, or a structured
                       abstract)?

The second number is the one that matters and the one that has to clear 80%.
Costs no model calls. Uses no LLM. Just counts.

    python run_coverage.py magnesium creatine ashwagandha
"""
import sys, json, time
from collections import Counter

try:
    import httpx
except ImportError:
    sys.exit("pip install httpx")

sys.path.insert(0, ".")
from sources.ratelimit import throttle

EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
UA = {"User-Agent": "supplement-evidence-pipeline/0.1 (coverage-probe)"}


def epmc(query, page_size=100, pages=3):
    out, cursor = [], "*"
    for _ in range(pages):
        throttle(EPMC)
        r = httpx.get(EPMC, params={"query": query, "format": "json",
                                    "pageSize": page_size, "cursorMark": cursor,
                                    "resultType": "core"},
                      headers=UA, timeout=60)
        r.raise_for_status()
        j = r.json()
        hits = j.get("resultList", {}).get("result", [])
        out.extend(hits)
        nxt = j.get("nextCursorMark")
        if not nxt or nxt == cursor or not hits: break
        cursor = nxt
    return out


def probe(ingredient):
    q = (f'("{ingredient}") AND (SRC:"MED") AND '
         f'(PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Meta-Analysis" '
         f'OR PUB_TYPE:"Systematic Review")')
    recs = epmc(q)
    c = Counter()
    for r in recs:
        c["total"] += 1
        pt = (r.get("pubTypeList", {}) or {}).get("pubType", [])
        is_syn = any("Meta" in p or "Systematic" in p for p in pt)
        c["synthesis" if is_syn else "primary"] += 1

        has_oa = r.get("isOpenAccess") == "Y" or r.get("inEPMC") == "Y"
        has_pmc = bool(r.get("pmcid"))
        if has_oa or has_pmc: c["oa_fulltext"] += 1

        # methods-fact reachability, in priority order
        reachable = has_oa or has_pmc
        if not reachable and is_syn:
            pass  # a paywalled SR is a loss; its tables are what we wanted
        if r.get("hasBook") == "Y": pass
        # registry linkage: EuropePMC exposes accession/trial ids inconsistently,
        # so approximate with abstract mention. Replace with a real ct.gov
        # crosswalk once you have DOIs.
        abst = (r.get("abstractText") or "")
        has_reg = "NCT" in abst or "ISRCTN" in abst or "ChiCTR" in abst
        if has_reg: c["registry_linked"] += 1
        if reachable or has_reg: c["methods_reachable"] += 1
        if abst: c["has_abstract"] += 1
    return c


def main(ingredients):
    grand = Counter()
    print(f"{'ingredient':<16}{'n':>6}{'prim':>6}{'syn':>6}"
          f"{'OA%':>7}{'reg%':>7}{'METHODS%':>10}")
    print("-" * 58)
    for ing in ingredients:
        t0 = time.time()
        c = probe(ing)
        grand.update(c)
        n = max(c["total"], 1)
        print(f"{ing:<16}{c['total']:>6}{c['primary']:>6}{c['synthesis']:>6}"
              f"{100*c['oa_fulltext']/n:>6.1f}%{100*c['registry_linked']/n:>6.1f}%"
              f"{100*c['methods_reachable']/n:>9.1f}%   ({time.time()-t0:.0f}s)")
    n = max(grand["total"], 1)
    print("-" * 58)
    print(f"{'TOTAL':<16}{grand['total']:>6}{grand['primary']:>6}{grand['synthesis']:>6}"
          f"{100*grand['oa_fulltext']/n:>6.1f}%{100*grand['registry_linked']/n:>6.1f}%"
          f"{100*grand['methods_reachable']/n:>9.1f}%")
    print()
    print("Target: METHODS% >= 80. OA% is expected to be lower and that is fine.")
    print("This is a FLOOR, not the real number -- it does not yet include")
    print("Unpaywall green OA (+10-15pp) or SR-table inheritance. Add those next.")
    print(f"\nSynthesis:primary ratio = "
          f"{grand['synthesis']/max(grand['primary'],1):.2f} "
          f"<- if this is high, the dedup layer is load-bearing. It is.")
    json.dump(dict(grand), open("out/coverage.json", "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1:] or ["magnesium", "creatine", "ashwagandha"])
