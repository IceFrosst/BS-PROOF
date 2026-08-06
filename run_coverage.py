#!/usr/bin/env python3
"""
COVERAGE MEASUREMENT. Costs no model calls.

Measures the two rates that are routinely conflated:

  raw OA full text  -- can we download the PDF/XML?
  methods facts     -- can we answer the RoB questions AT ALL, from ANY source?

The second is the one that matters and the one that has to clear 80%.

Rewritten 2026-08-06 to use the real source modules. Three things changed and
all three move the number:

  1. NO 3-PAGE CAP. The old script stopped at 300 records, so magnesium and
     creatine were truncated at exactly 300 and the sample was biased toward
     whatever the relevance ordering surfaced first.
  2. REAL REGISTRY CROSSWALK. The old script approximated registry linkage by
     grepping the abstract for "NCT". This resolves the ID and asks
     ClinicalTrials.gov whether structured design or results data actually
     exists -- which is what "methods facts without the paper" really means.
  3. GREEN OA LADDER. Measures the OpenAlex uplift over Europe PMC alone.
     Unpaywall is included only when BSPROOF_CONTACT_EMAIL is set, and its
     absence is REPORTED rather than silently folded into the result.

    python run_coverage.py magnesium creatine ashwagandha
    python run_coverage.py --sample 60 magnesium
"""
from __future__ import annotations
import json
import sys
from collections import Counter

from sources import clinicaltrials as ct
from sources import europepmc as ep
from sources import oa as oamod
from sources.http import CONTACT_EMAIL, SourceError

# Per-ingredient cap on the EXPENSIVE per-record checks (one HTTP call each).
# The cheap counts run over the whole corpus.
DEFAULT_SAMPLE = 40


MAX_SYNTHESES, MAX_PRIMARIES = 300, 1200


def probe(ingredient: str, sample: int) -> Counter:
    found = ep.discover(ingredient, max_syntheses=MAX_SYNTHESES,
                        max_primaries=MAX_PRIMARIES)
    recs = found["syntheses"] + found["primaries"]
    c = Counter()
    c["total"] = len(recs)
    # A capped corpus is a truncated corpus. Record it, because any ratio
    # computed over a capped fetch measures the cap, not the literature.
    if (len(found["syntheses"]) >= MAX_SYNTHESES
            or len(found["primaries"]) >= MAX_PRIMARIES):
        c["capped"] = 1

    for r in recs:
        c["synthesis" if r["is_synthesis"] else "primary"] += 1
        if r["oa"] == "full_text":
            c["oa_epmc"] += 1
        if r.get("registration_id"):
            c["registry_id_present"] += 1
        if r.get("abstract"):
            c["has_abstract"] += 1

    # --- expensive checks, on a bounded sample of the non-OA records ---------
    closed = [r for r in recs if r["oa"] != "full_text"]
    c["closed_total"] = len(closed)
    # Stride, do NOT take the head. Results come back in relevance order, so
    # closed[:sample] measures whatever the search ranked first -- the exact
    # truncation bias this rewrite exists to remove. A fixed stride keeps the
    # sample spread across the corpus and keeps the run reproducible.
    step = max(1, len(closed) // sample) if sample else 1
    probe_set = closed[::step][:sample]
    c["sampled"] = len(probe_set)

    for r in probe_set:
        # Green OA ladder
        res = oamod.resolve(r)
        if res["oa"] == "full_text":
            c["oa_recovered_green"] += 1
        if "unpaywall:SKIPPED_NO_EMAIL" in res["checked"]:
            c["unpaywall_skipped"] += 1

        # Registry crosswalk: does structured data actually exist?
        nct = (r.get("registration_id") or "")
        if nct.upper().startswith("NCT"):
            try:
                facts = ct.facts_for(nct)
            except SourceError:
                c["registry_unreachable"] += 1
                continue
            if facts:
                c["registry_resolved"] += 1
                d, a = facts["design"], facts["attrition"]
                # Methods facts the registry can supply even when the paper is shut:
                # allocation and masking answer RoB 1-2, participant flow answers 5.
                if d.get("allocation") or d.get("masking"):
                    c["registry_design_facts"] += 1
                if a.get("dropout_rate") is not None:
                    c["registry_attrition_facts"] += 1
                if facts["item3_prospective_registration"] is not None:
                    c["registry_item3"] += 1
    return c


def report(rows: list[tuple[str, Counter]]) -> None:
    print(f"\n{'ingredient':<14}{'n':>6}{'prim':>6}{'syn':>6}"
          f"{'OA(epmc)':>10}{'reg id':>8}{'sample':>8}{'green+':>8}{'ct.gov':>8}")
    print("-" * 76)
    grand = Counter()
    for ing, c in rows:
        grand.update(c)
        n = max(c["total"], 1)
        s = max(c["sampled"], 1)
        print(f"{ing:<14}{c['total']:>6}{c['primary']:>6}{c['synthesis']:>6}"
              f"{100*c['oa_epmc']/n:>9.1f}%{100*c['registry_id_present']/n:>7.1f}%"
              f"{c['sampled']:>8}{100*c['oa_recovered_green']/s:>7.1f}%"
              f"{100*c['registry_resolved']/s:>7.1f}%")
    print("-" * 76)

    n = max(grand["total"], 1)
    s = max(grand["sampled"], 1)
    epmc_oa = 100 * grand["oa_epmc"] / n
    green_rate = grand["oa_recovered_green"] / s          # of the CLOSED ones
    closed_frac = grand["closed_total"] / n
    projected_oa = epmc_oa + 100 * closed_frac * green_rate

    print(f"\nOA LADDER")
    print(f"  Europe PMC alone            {epmc_oa:5.1f}%")
    print(f"  + green OA (OpenAlex)       {projected_oa:5.1f}%   "
          f"(projected from a {grand['sampled']}-record sample of the "
          f"{grand['closed_total']} closed records)")
    if grand["unpaywall_skipped"]:
        print(f"  + Unpaywall                 NOT MEASURED -- "
              f"BSPROOF_CONTACT_EMAIL unset, {grand['unpaywall_skipped']} records skipped")
    else:
        print(f"  + Unpaywall                 included above")

    # Methods facts = OA full text, OR the registry can answer the RoB items.
    reg_useful = grand["registry_design_facts"] + grand["registry_attrition_facts"]
    reg_rate = grand["registry_design_facts"] / s
    projected_methods = projected_oa + 100 * closed_frac * (1 - green_rate) * reg_rate

    print(f"\nMETHODS-LEVEL FACTS   target >= 80%")
    print(f"  reachable (projected)       {projected_methods:5.1f}%")
    print(f"  registry design facts       {100*reg_rate:5.1f}% of sampled closed records")
    print(f"  registry attrition facts    {100*grand['registry_attrition_facts']/s:5.1f}%")
    print(f"  RoB item 3 answerable       {100*grand['registry_item3']/s:5.1f}%")
    if grand["registry_unreachable"]:
        print(f"  registry unreachable        {grand['registry_unreachable']} "
              f"(counted as a loss, not as 'not registered')")

    print(f"\nNOT YET IN THIS NUMBER: SR-table inheritance. One OA systematic")
    print(f"review carries characteristics + RoB for ~15 primaries.")
    if grand["capped"]:
        print(f"  synthesis:primary ratio NOT REPORTED -- {grand['capped']} ingredient(s)")
        print(f"  hit a fetch cap, so the ratio would measure the caps, not the")
        print(f"  literature. Raise MAX_SYNTHESES/MAX_PRIMARIES to measure it.")
    else:
        print(f"  synthesis:primary ratio "
              f"{grand['synthesis']/max(grand['primary'],1):.2f} (uncapped, meaningful)")

    with open("out/coverage.json", "w") as f:
        json.dump({"totals": dict(grand),
                   "projected_oa_pct": round(projected_oa, 1),
                   "projected_methods_pct": round(projected_methods, 1),
                   "unpaywall_measured": not bool(grand["unpaywall_skipped"])}, f, indent=1)


def main(argv: list[str]) -> int:
    sample = DEFAULT_SAMPLE
    args = list(argv)
    if "--sample" in args:
        i = args.index("--sample")
        sample = int(args[i + 1])
        del args[i:i + 2]
    ingredients = args or ["magnesium", "creatine", "ashwagandha"]

    if not CONTACT_EMAIL:
        print("note: BSPROOF_CONTACT_EMAIL unset -- Unpaywall will be skipped and")
        print("      reported as unmeasured. OpenAlex needs no credentials.\n")

    report([(ing, probe(ing, sample)) for ing in ingredients])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
