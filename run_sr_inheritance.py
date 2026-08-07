#!/usr/bin/env python3
"""
SR-table inheritance — the last unbuilt rung of the coverage ladder.

    python3 run_sr_inheritance.py magnesium --limit 5 --grok
    python3 run_sr_inheritance.py magnesium --limit 5 --pilot   # default

WHY THIS IS THE REMAINING WORK
Coverage on the full corpus is 77.5% methods-level facts against a >=80% target.
Green OA was expected to close it and does not: Unpaywall's marginal gain over
OpenAlex measured 0.0pp (they are not independent sources). The only rung left
is this one -- one open-access systematic review carries a
characteristics-of-included-studies table and a risk-of-bias table covering
~15 primaries whose own full text is unreachable.

WHAT IT MEASURES
For each OA synthesis: fetch JATS, pull the candidate tables, run S2 over them,
resolve the included studies against the stored corpus, and count how many
primaries gained methods facts they did not already have. That last number is
the uplift, and it is the point of the exercise.

WHAT IT DOES NOT DO
Syntheses never enter evidence mass (invariant 6). Nothing here changes E.
Inherited RoB carries the 0.85 penalty -- it is another team's judgement.

BACKENDS
--grok / --pilot / --claude, one per run, never blended (invariant 9). Results
are written to out/sr_inheritance_<backend>.json. The pilot backend is a
subscription and must not back public claims.
"""
from __future__ import annotations
import json
import sys

from pipeline import synthesis as syn
from pipeline.storage import Store
from sources import fulltext as ft
from sources.http import SourceError

# The payload builder lives in pipeline.synthesis so this script and the scored
# pipeline cannot drift apart again -- they had, and only this one sent tables.


def backend(name: str):
    """
    (call, label) for one extraction backend.

    This script was pilot-only, which meant the one measurement standing between
    us and the 80% coverage target could not be run on the backend actually in
    use. Backends stay SEPARATE (invariant 9) -- this picks one, labels the
    output with it, and never blends two.
    """
    if name == "grok":
        import grok_adapter as ga
        if not ga.preflight():
            return None, "grok"
        return (lambda agent, payload: ga.call(agent, payload, timeout=300)), "grok"
    if name == "claude":
        import claude_adapter as ca
        return (lambda agent, payload: ca.call(agent, payload)), "claude-production"
    import pilot_adapter as pa
    probe = pa.hermeticity_probe()
    print(f"hermeticity: {'PASS' if probe['hermetic'] else 'FAIL'} — {probe['detail']}")
    if not probe["hermetic"]:
        return None, "claude-pilot"
    return (lambda agent, payload: pa.call(agent, payload, verified=True, timeout=300)), \
        "claude-pilot"


def run(ingredient: str, limit: int, *, mode: str = "pilot",
        verbose: bool = True) -> dict:
    call, label = backend(mode)
    if call is None:
        return {"error": f"backend {mode} unavailable"}
    print(f"backend: {label}\n")

    with Store() as store:
        all_studies = store.studies()
        index = syn.known_index(all_studies)
        primaries = {s["canonical_id"]: s for s in all_studies if not s["is_synthesis"]}
        # Which primaries currently have NO route to methods facts: not open
        # access, and no registry record to fall back on.
        starved = {cid for cid, s in primaries.items()
                   if s.get("oa") != "full_text"
                   and not store.registry_facts(s["registration_id"] or "")}
        print(f"corpus: {len(primaries)} primaries, {len(starved)} with no route "
              f"to methods facts today")

        syntheses = [s for s in all_studies
                     if s["is_synthesis"] and s.get("pmcid")][:limit]
        print(f"running S2 over {len(syntheses)} open-access syntheses\n")

        rescued: set[str] = set()
        rob_inherited = 0
        stats = {"syntheses_tried": 0, "s2_ok": 0, "s2_failed": 0,
                 "no_fulltext": 0, "included_listed": 0, "included_resolved": 0}

        for s in syntheses:
            stats["syntheses_tried"] += 1
            try:
                xml = ft.fetch_xml(s["pmcid"])
            except SourceError as e:
                print(f"  {s['pmcid']}: fetch failed ({e})")
                stats["no_fulltext"] += 1
                continue
            if not xml:
                stats["no_fulltext"] += 1
                continue

            payload = syn.s2_payload(s, xml)
            if not payload["tables"]:
                print(f"  {s['pmcid']}: no tables in JATS")
                stats["no_fulltext"] += 1
                continue

            result, meta = call("S2", payload)
            if not result:
                print(f"  {s['pmcid']}: S2 failed — {meta.get('error')}")
                stats["s2_failed"] += 1
                continue
            stats["s2_ok"] += 1

            res = syn.resolve_included(result, index)
            stats["included_listed"] += res["n_listed"]
            stats["included_resolved"] += res["n_resolved"]
            newly = (res["included_ids"] & starved) - rescued
            rescued |= newly
            rob = syn.inherited_rob(result)
            rob_inherited += len(rob)

            print(f"  {s['pmcid']}: {res['n_listed']} included, "
                  f"{res['n_resolved']} resolved ({res['resolved_fraction']:.0%}), "
                  f"{len(rob)} RoB rows, +{len(newly)} primaries rescued"
                  + ("" if result.get("extraction_complete") else "  [partial]"))

    uplift = 100 * len(rescued) / max(len(starved), 1)
    print("\n" + "=" * 66)
    print(f"S2 succeeded on {stats['s2_ok']}/{stats['syntheses_tried']} syntheses")
    print(f"included studies: {stats['included_resolved']}/{stats['included_listed']} "
          f"resolved to canonical ids")
    print(f"inherited RoB judgements: {rob_inherited}")
    print(f"PRIMARIES RESCUED: {len(rescued)} of {len(starved)} starved "
          f"({uplift:.1f}pp of the starved set)")
    print("\nA rescued primary is one with no open full text and no registry")
    print("record, whose methods facts now come from someone else's SR table.")
    print("Inherited RoB carries the 0.85 penalty; syntheses still add no")
    print("evidence mass (invariant 6).")
    return {**stats, "starved": len(starved), "rescued": len(rescued),
            "rob_inherited": rob_inherited, "backend": label}


def main(argv: list[str]) -> int:
    args = list(argv)
    limit = 5
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1]); del args[i:i + 2]
    mode = "pilot"
    for flag in ("--grok", "--pilot", "--claude"):
        if flag in args:
            args.remove(flag); mode = flag[2:]
    ingredient = args[0] if args else "magnesium"
    out = run(ingredient, limit, mode=mode)
    # One file per backend. Overwriting a Grok measurement with a Claude one and
    # calling the result "the uplift" is the silent-merge failure (invariant 9).
    path = f"out/sr_inheritance_{out.get('backend', mode)}.json"
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"\nwrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
