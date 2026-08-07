"""
Retrieval pipeline: discover -> classify -> dedup -> registry facts -> persist.
NO MODEL MAY ENTER THIS FILE.

This is the whole deterministic half of the system, wired end to end. It runs
with zero model calls and produces the corpus that per-study workers consume.

Order matters and is not arbitrary:

  1. DISCOVER syntheses before primaries. One open-access systematic review
     carries characteristics-of-included-studies and a RoB table for ~15
     primaries that cannot be read directly (SPEC section 4).
  2. CLASSIFY from PubMed tags before anything else touches the records, so the
     non-human override fires early -- a randomised blinded rat study is rank 12,
     and letting it through as rank 4 is a 250x weight error.
  3. DEDUP BEFORE CONCLUSIONS EXIST. This is architectural, not an optimisation.
     Thirty meta-analyses over nine RCTs must collapse to nine evidence units,
     and a model asked to merge conclusions later would correctly observe that
     they agree -- reading 30 corroborations into one trial (SPEC section 6).
  4. REGISTRY FACTS last, because only deduplicated units have a trial identity
     worth looking up.

    python -m pipeline.retrieve magnesium creatine ashwagandha
"""
from __future__ import annotations
import os
import sys
import time

from pipeline.classify import classify_all
from pipeline.dedup import dedup
from pipeline.storage import Store
from sources import clinicaltrials as ct
from sources import europepmc as ep
from sources import oa
from sources.http import SourceError


def retrieve(ingredient: str, store: Store, *, max_syntheses: int = 200,
             max_primaries: int = 800, registry_lookups: int = 50,
             scope: str = "broad", oa_lookups: int = 250,
             verbose: bool = True) -> dict:
    """
    One ingredient, end to end. Returns a stats dict.

    Nothing here invents data. A source that cannot be reached raises; a record
    that has no registry ID simply has none. The distinction is preserved all
    the way to storage, because "not registered" and "we could not check" carry
    different weight in RoB item 3.
    """
    t0 = time.time()
    log = (lambda *a: print(*a)) if verbose else (lambda *a: None)

    log(f"\n=== {ingredient} (scope={scope}) ===")
    if scope == "per_outcome":
        # One query per outcome, each with its own quota. A single generic query
        # ranked by relevance starves whole outcomes: measured 2026-08-07, sleep
        # had 62 magnesium RCTs available and the run surfaced ONE, because
        # sleep trials do not rank highly for a generic "magnesium" search.
        from pipeline import vocab
        oids = sorted(vocab.outcome_ids())
        # The quota is PER OUTCOME and is NOT max_primaries split 30 ways.
        # Dividing a single-query budget starved everything: 600/30 = 20 each,
        # which after dedup and the full-text filter left 1.8 studies per
        # outcome. Two multipliers eat this budget and both are large:
        #   ~60% of rows are duplicates -- one trial matches sleep AND anxiety
        #   ~65% of RCTs are dropped by full-text-only (35% survive, measured)
        # So a quota of N yields roughly N/7 usable studies per outcome.
        per = int(os.environ.get("SP_PER_OUTCOME_QUOTA", "60"))
        byo = ep.discover_by_outcome(ingredient, oids, per_outcome=per)
        pri = byo["primaries"]
        covered = {k: v for k, v in byo["by_outcome"].items() if v}
        log(f"  per-outcome  {len(covered)}/{len(oids)} outcomes returned trials "
            f"(quota {per} each, ~{per // 7} expected usable after dedup+full-text)")
        thin = sorted(k for k, v in byo["by_outcome"].items() if v < 5)
        if thin:
            log(f"    thin (<5 trials): {', '.join(thin[:8])}"
                + (" ..." if len(thin) > 8 else ""))
        syn = ep.discover(ingredient, max_syntheses=max_syntheses,
                          max_primaries=1, scope="intervention")["syntheses"]
        found = {"syntheses": syn, "primaries": pri}
    else:
        found = ep.discover(ingredient, max_syntheses=max_syntheses,
                            max_primaries=max_primaries, scope=scope)
    syn, pri = found["syntheses"], found["primaries"]
    log(f"  discovered  {len(syn)} syntheses, {len(pri)} primaries")

    classified, cstats = classify_all(syn + pri)
    log(f"  classified  {cstats['deterministic_pct']}% from tags, "
        f"{cstats['needs_model']} need S1")

    # Syntheses are separated here and NEVER enter evidence mass (invariant 6).
    # They are kept because they are the highest-value fetch target, not because
    # they count.
    syntheses = [r for r in classified if r["is_synthesis"]]
    primaries = [r for r in classified if not r["is_synthesis"]]

    unique_pri, _, dstats = dedup(primaries)
    unique_syn, _, sstats = dedup(syntheses)
    log(f"  deduped     {dstats['in']} -> {dstats['out']} primary units "
        f"({dstats['collapsed']} collapsed, by kind {dstats['by_kind']})")

    # GREEN OA RESOLUTION. sources/oa.py was built and then never called by the
    # pipeline -- it was only used by run_coverage.py, so `oa` reflected PubMed
    # Central membership rather than actual open access. Measured 2026-08-07: of
    # 100 intervention-scoped magnesium RCTs only 37 had a pmcid, while 20% of
    # the remainder had a reachable OA copy nobody was looking for.
    #
    # One HTTP call per closed record, bounded, and the disk cache makes reruns
    # free. A record whose OA copy we cannot actually READ keeps oa=abstract_only
    # -- finding a URL is not the same as extracting text, and inflating the OA
    # tier would inflate every score built on it.
    if oa_lookups:
        closed = [r for r in unique_pri if r.get("oa") != "full_text" and r.get("doi")]
        upgraded = 0
        for rec in closed[:oa_lookups]:
            try:
                res = oa.resolve(rec)
            except SourceError:
                continue
            if res.get("location"):
                rec["oa_location"] = res["location"]
                upgraded += 1
        log(f"  green OA    {upgraded}/{min(len(closed), oa_lookups)} closed records "
            f"have a reachable copy (text extracted at read time)")

    stored = store.upsert_studies(unique_pri + unique_syn)
    log(f"  stored      {stored} unique records")

    # Registry facts for the units that carry an NCT. Bounded per run: this is a
    # per-trial HTTP call and the corpus is large.
    ncts = [r["registration_id"] for r in unique_pri
            if (r.get("registration_id") or "").upper().startswith("NCT")]
    facts, unreachable = [], 0
    for nct in ncts[:registry_lookups]:
        try:
            f = ct.facts_for(nct)
        except SourceError:
            # "Could not reach the registry" is not "not registered". Count it
            # and move on; RoB items 3-4 stay null for this study.
            unreachable += 1
            continue
        if f:
            facts.append(f)
    if facts:
        store.upsert_registry_facts(facts)

    prospective = sum(1 for f in facts if f["item3_prospective_registration"] == 1)
    retro = sum(1 for f in facts if f["item3_prospective_registration"] == 0)
    unknown = sum(1 for f in facts if f["item3_prospective_registration"] is None)
    flagged = sum(1 for f in facts if f["unpublished"]["flagged"])
    log(f"  registry    {len(facts)}/{len(ncts)} looked up"
        + (f", {unreachable} unreachable" if unreachable else ""))
    log(f"    RoB item 3: {prospective} prospective, {retro} retrospective, "
        f"{unknown} unverifiable")
    log(f"    unpublished-trial flags: {flagged}  (shown, never scored)")

    return {
        "ingredient": ingredient,
        "discovered_syntheses": len(syn), "discovered_primaries": len(pri),
        "unique_primaries": dstats["out"], "unique_syntheses": sstats["out"],
        "collapsed": dstats["collapsed"], "by_kind": dstats["by_kind"],
        "needs_s1": cstats["needs_model"],
        "deterministic_pct": cstats["deterministic_pct"],
        "registry_looked_up": len(facts), "registry_unreachable": unreachable,
        "item3_prospective": prospective, "item3_retrospective": retro,
        "item3_unverifiable": unknown, "unpublished_flags": flagged,
        "seconds": round(time.time() - t0, 1),
    }


def main(ingredients: list[str]) -> int:
    with Store() as store:
        results = [retrieve(i, store) for i in ingredients]
        print("\n" + "=" * 66)
        print(f"{'ingredient':<14}{'uniq':>6}{'syn':>6}{'collapsed':>11}"
              f"{'needsS1':>9}{'prospctv':>10}{'flags':>7}")
        print("-" * 66)
        for r in results:
            print(f"{r['ingredient']:<14}{r['unique_primaries']:>6}"
                  f"{r['unique_syntheses']:>6}{r['collapsed']:>11}"
                  f"{r['needs_s1']:>9}{r['item3_prospective']:>10}"
                  f"{r['unpublished_flags']:>7}")
        print("-" * 66)
        print("db:", store.counts())
        print("\nZero model calls. Everything above is deterministic and replayable.")
        print("Next boundary is the per-study workers, which need ANTHROPIC_API_KEY.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["magnesium", "creatine", "ashwagandha"]))
