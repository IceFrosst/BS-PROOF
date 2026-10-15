"""
Evidence stage: pool + GRADE per outcome (pipeline/evidence_v2.py), plus the
ClinicalTrials.gov registry check for unpublished trials. NO MODEL.
"""
from __future__ import annotations

from pipeline import vocab
from pipeline.evidence_v2 import corpus_ncts, summarise


def _registry(ingredient: str, items: list[dict]) -> dict | None:
    """{outcome: registry_check} or None when the registry cannot be read. A
    failed search is reported as unchecked, never as "no unpublished trials"."""
    from pipeline.registry_bias import registry_check
    from sources.clinicaltrials import search_completed
    from sources.http import SourceError
    try:
        records = search_completed(ingredient)
    except SourceError as exc:
        print(f"  registry check unavailable ({exc}); publication bias left to Egger")
        return None
    ncts = corpus_ncts(items)
    outcomes = vocab.load("outcome")["outcomes"]
    first = {o["id"]: registry_check(records, ingredient, o.get("search_terms") or [], ncts)
             for o in outcomes}
    # Second pass: a flagged trial a primary paper cites by NCT id is published.
    # A failed lookup leaves the trial counted (never shrinks the count by error).
    from sources.europepmc import publications_for_registration
    published = set()
    for nct in sorted({n for r in first.values() for n in r["unpublished"]}):
        try:
            if publications_for_registration(nct):
                published.add(nct)
        except SourceError:
            pass
    return {o["id"]: registry_check(records, ingredient, o.get("search_terms") or [], ncts,
                                    published=published)
            for o in outcomes}


def evidence_stage(opts, product: dict, extractions: list[dict], run_context: dict) -> dict:
    items = [{"id": (e.get("record") or {}).get("_canonical") or str(i),
              "record": e.get("record") or {}, "extraction": e.get("extraction") or {}}
             for i, e in enumerate(extractions)]
    registry = None if opts.wiring else _registry(opts.ingredient, items)
    summary = summarise(items, product, registry)
    run_context["evidence_v2"] = summary
    print("\nEVIDENCE METHOD v2 (pooled effect + GRADE per outcome)")
    for o in summary["outcomes"]:
        g, s = o["run_grade"], o["smd"]
        head = (f"g = {s['estimate']:+.2f} [{s['ci'][0]:+.2f}, {s['ci'][1]:+.2f}]" if s else "no poolable effect")
        print(f"  {o['outcome']:<22} {g['letter']:<3} {g['benefit']:<12} {g['label']:<9} k={o['k']:<3} {head}")
    return summary
