"""
Evidence method v2 for one run: pool + GRADE per outcome, in the shape the run
artifact stores and the app reads. NO MODEL MAY ENTER THIS FILE.

The pooled estimate does not depend on the product (form and dose are GRADE
indirectness, never study weight -- the v2 counterpart of invariant 8), so each
outcome is stored ONCE:

  pool       the random-effects estimate, CI, prediction interval, I², refusals
  record     pipeline/grade.grade_record: per threshold variant (M, M/2, 2M) the
             benefit category and every downgrade EXCEPT indirectness
  studies    each pooled trial's weight, form id and daily elemental dose, so a
             reader can re-match them against ANY product
             (lib/analyze/grade-v2.ts) and add indirectness
  run_grade  the letter for the run's own product (form, dose), for reports

The run's population variant is fixed (the stored v14 policy, variant B):
"different" populations are left out of the pool, "adjacent" ones are noted.
"""
from __future__ import annotations

from pipeline import vocab
from pipeline.grade import grade_record, letter_from_record, study_weights
from pipeline.pool import pool_outcomes

METHOD = "evidence-v2"
STATUS = "shadow"          # until the Phase 4 benchmark passes (docs/EVIDENCE_METHOD.md §8)


def corpus_ncts(items: list[dict]) -> set[str]:
    """Registry ids our corpus already holds, from the record or S3."""
    out = set()
    for it in items:
        rec = it.get("record") or {}
        s3 = (it.get("extraction") or {}).get("S3") or {}
        for v in (rec.get("registration_id"), s3.get("registration_id") if isinstance(s3, dict) else None):
            if isinstance(v, str) and v.upper().startswith("NCT"):
                out.add(v.upper())
    return out


def _round(x, n=4):
    return round(x, n) if isinstance(x, (int, float)) else x


def summarise(items: list[dict], product: dict, registry: dict | None = None) -> dict:
    """items: [{"id", "record", "extraction"}] (worker format). product: the
    run's {"ingredient", "form_vocab_id", "population", "dose_low_mg",
    "dose_high_mg"}. registry: {outcome_id: registry_check result} or None."""
    outcomes = {o["id"]: o for o in vocab.load("outcome")["outcomes"]}
    pools = pool_outcomes(items, product)
    out = []
    for oid, pool in pools.items():
        meta = outcomes.get(oid) or {}
        rec = grade_record(pool, meta.get("mcid"), (registry or {}).get(oid))
        weights = iter(study_weights(pool))
        studies = []
        for s in pool.studies:
            w = next(weights) if s.get("g_variance") is not None else None
            studies.append({
                "study": s["study"], "measure": s.get("measure"), "route": s["route"],
                "g": _round(s.get("g")), "g_variance": _round(s.get("g_variance"), 6),
                "weight": _round(w, 6), "md": _round(s.get("md")), "unit": s.get("unit"),
                "n": s.get("n"), "rob": s.get("rob"), "pop_match": s.get("pop_match"),
                "form_id": s.get("form_id"), "dose_low_mg": s.get("dose_low_mg"),
                "dose_high_mg": s.get("dose_high_mg"), "reviewed": bool(s.get("reviewed")),
                "estimand": s.get("estimand"), "flags": s.get("flags") or [],
                # matches against the RUN's product, for run_grade only
                "form_match": s.get("form_match"), "dose_match": s.get("dose_match"),
            })
        pooled = [s for s in studies if s["weight"] is not None]
        run_grade = letter_from_record(rec, pooled, [s["weight"] for s in pooled])
        smd = pool.smd and {"estimate": _round(pool.smd["estimate"]),
                            "ci": [_round(x) for x in pool.smd["ci"]],
                            "prediction": pool.smd["prediction"] and [_round(x) for x in pool.smd["prediction"]],
                            "i2": _round(pool.smd["i2"]), "tau2": _round(pool.smd["tau2"], 6),
                            "method": pool.smd["method"]}
        md = pool.md and {"estimate": _round(pool.md["estimate"]), "ci": [_round(x) for x in pool.md["ci"]],
                          "unit": pool.md["unit"], "method": pool.md["method"]}
        out.append({
            "outcome": oid, "label": meta.get("label") or oid, "polarity": meta.get("polarity"),
            "k": pool.k, "smd": smd, "md": md, "estimand_mix": pool.estimand_mix,
            "leave_one_out": pool.leave_one_out and [_round(x) for x in pool.leave_one_out],
            "refused": pool.refused, "note": pool.note,
            "record": rec, "studies": [{k: v for k, v in s.items() if k not in ("form_match", "dose_match")}
                                       for s in studies],
            "run_grade": run_grade,
        })
    pop = (product.get("population") or {}).get("id")
    return {"method": METHOD, "status": STATUS, "population": pop,
            "registry_checked": registry is not None, "outcomes": out}
