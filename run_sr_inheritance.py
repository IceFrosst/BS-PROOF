#!/usr/bin/env python3
"""
SR-table inheritance — the last unbuilt rung of the coverage ladder.

    python3 run_sr_inheritance.py magnesium --limit 5

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

Uses pilot_adapter (subscription, non-production) while ANTHROPIC_API_KEY is
declined, so every extraction is labelled pilot and must not back public claims.
"""
from __future__ import annotations
import json
import sys

from pipeline import synthesis as syn
from pipeline.storage import Store
from sources import fulltext as ft
from sources.http import SourceError

MAX_TABLE_ROWS = 60          # a very long table is truncated, and we say so
MAX_METHODS_CHARS = 6000


def s2_payload(record: dict, xml: str) -> dict:
    """
    What S2 sees: the candidate tables WITH their row structure, plus the
    methods section for context.

    Not the whole paper. Flattening a characteristics table to prose loses which
    dose belongs to which trial, and sending the full text costs 10-20x for
    material S2 is told to ignore (it does not evaluate the review).
    """
    tables = ft.extract_tables(xml)
    candidates = [t for t in tables if ft.looks_like_included_studies(t)]
    # If the filter finds nothing, fall back to every table rather than giving
    # S2 nothing -- the heuristic is a filter, not a decision (see fulltext.py).
    chosen = candidates or tables
    trimmed = []
    for t in chosen:
        rows = t["rows"][:MAX_TABLE_ROWS]
        trimmed.append({"label": t["label"], "caption": t["caption"],
                        "rows": rows,
                        "truncated": len(t["rows"]) > MAX_TABLE_ROWS})
    sections = ft.sections(xml)
    return {
        "title": record.get("title"),
        "tables": trimmed,
        "methods": (sections.get("methods") or "")[:MAX_METHODS_CHARS],
        "table_filter_hit": bool(candidates),
    }


def run(ingredient: str, limit: int, *, verbose: bool = True) -> dict:
    import pilot_adapter as pa

    probe = pa.hermeticity_probe()
    print(f"hermeticity: {'PASS' if probe['hermetic'] else 'FAIL'} — {probe['detail']}")
    if not probe["hermetic"]:
        return {"error": "not hermetic"}

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

            payload = s2_payload(s, xml)
            if not payload["tables"]:
                print(f"  {s['pmcid']}: no tables in JATS")
                stats["no_fulltext"] += 1
                continue

            result, meta = pa.call("S2", payload, verified=True, timeout=300)
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
            "rob_inherited": rob_inherited}


def main(argv: list[str]) -> int:
    args = list(argv)
    limit = 5
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1]); del args[i:i + 2]
    ingredient = args[0] if args else "magnesium"
    out = run(ingredient, limit)
    with open("out/sr_inheritance.json", "w") as f:
        json.dump(out, f, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
