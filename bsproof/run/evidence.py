"""
Evidence method v2 stage: pool + GRADE per outcome (pipeline/evidence_v2.py)
beside the v14 scores, plus the ClinicalTrials.gov registry check for
unpublished trials. NO MODEL. SHADOW until the Phase 4 switch
(docs/EVIDENCE_METHOD.md §8): v14 rows are untouched; the app shows the v2
grade only where a run carries this block.
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
    return {o["id"]: registry_check(records, ingredient, o.get("search_terms") or [], ncts)
            for o in vocab.load("outcome")["outcomes"]}


def evidence_stage(opts, product: dict, extracted, run_context: dict) -> dict:
    extractions = extracted[0]
    items = [{"id": (e.get("record") or {}).get("_canonical") or str(i),
              "record": e.get("record") or {}, "extraction": e.get("extraction") or {}}
             for i, e in enumerate(extractions)]
    registry = None if opts.wiring else _registry(opts.ingredient, items)
    summary = summarise(items, product, registry)
    run_context["evidence_v2"] = summary
    print("\nEVIDENCE METHOD v2 (shadow: pooled effect + GRADE, not the v14 score)")
    for o in summary["outcomes"]:
        g, s = o["run_grade"], o["smd"]
        head = (f"g = {s['estimate']:+.2f} [{s['ci'][0]:+.2f}, {s['ci'][1]:+.2f}]" if s else "no poolable effect")
        print(f"  {o['outcome']:<22} {g['letter']:<3} {g['benefit']:<12} {g['label']:<9} k={o['k']:<3} {head}")
    return summary
