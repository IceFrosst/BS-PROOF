"""
Scoring stage: score the stored variant (population B), print the population
and confidence (K) A/B comparisons beside it -- never blended -- and print the
result. NO MODEL. Moved out of run_pipeline.py on 2026-10-03.
"""
from __future__ import annotations

import os

from pipeline import arcs as arcsmod
from pipeline import showcase as show
from pipeline import vocab
from pipeline.assemble import build_ecus
from pipeline.donut import four_arc_lines

def _shadow_context_summary(extractions: list[dict]) -> dict:
    """Run the opt-in measured-effect path and retain only compact audit data."""
    from pipeline.v13_shadow import analyze_shadow, SHADOW_ONLY_WARNING
    records = []
    for item in extractions:
        rec, ext = item.get("record") or {}, item.get("extraction") or {}
        study_id = rec.get("_canonical") or rec.get("doi") or rec.get("pmid")
        for outcome in ext.get("outcomes") or []:
            if outcome.get("discarded") or not outcome.get("outcome_vocab_id"):
                continue
            claim = outcome.get("claim")
            if not isinstance(claim, dict):
                continue
            records.append({**claim, "study_id": study_id or "unknown",
                            "outcome": outcome["outcome_vocab_id"]})
    result = analyze_shadow(records)
    summaries = []
    # Prefer strata that actually measured something (then the most eligible)
    # so the capped summary shows the pooling frontier, not the first eight
    # stratum names alphabetically.
    for row in sorted(result.outcomes,
                      key=lambda r: (-r.measured_count, -r.eligible_count,
                                     r.stratum))[:8]:
        summaries.append({
            "outcome": row.outcome,
            "stratum": row.stratum,
            "pooled_g": row.pooled_g,
            "ci": [row.ci_lower, row.ci_upper],
            "pi": [row.prediction_lower, row.prediction_upper],
            "k": row.k, "tau2": row.tau2, "i2": row.i2,
            "measured": row.measured_count, "eligible": row.eligible_count,
            "top_refusals": sorted(row.refusal_reasons.items(),
                                    key=lambda item: (-item[1], item[0]))[:5],
            "study_audit": [
                {"study_id": str(study_id), "measure": str(measure),
                 "timepoint": str(timepoint), "g": g}
                for study_id, measure, timepoint, g in row.study_audit[:24]
            ],
        })
    return {"warning": SHADOW_ONLY_WARNING, "outcomes": summaries,
            "measured": result.measured_count, "eligible": result.eligible_count}


def score_stage(store, opts, product, db, extracted, outcome_allowlist,
                run_context, n_available) -> list[dict]:
    """Score, persist and print. Returns the stored (variant B) ECU rows."""
    extractions, prompt_version, tag, syntheses_for_score, sr_derived = extracted
    ingredient, form, scope, demo = opts.ingredient, opts.form, opts.scope, opts.demo
    if outcome_allowlist:
        searched = list(outcome_allowlist)
    elif scope == "per_outcome":
        searched = sorted(vocab.outcome_ids())
    else:
        searched = None

    # A/B, founder 2026-08-08: score the SAME extractions twice. Extraction
    # is the expensive part; build_ecus is deterministic and free, so the
    # second pass costs nothing.
    #
    #   A  everything counts   (ignore_population=True)
    #   B  route on population (a disease trial is a DIFFERENT question)
    #
    # DECIDED 2026-08-10 (delegated by the founder the same day): B is what
    # gets STORED. The null audit (docs/REVIEW_PENDING.md #4) found disease
    # trials -- breast cancer, COPD, ALS, cancer anorexia -- voting at full
    # weight on healthy-adult claims; health_status feeds vocab.pop_match,
    # so B excludes them as a different QUESTION, not weaker evidence
    # (invariant 8: exclusion on an ECU axis, never a weight discount).
    # A is still computed, printed and reported beside it, never blended --
    # same discipline as invariant 9 for backends.
    def _score(variant_b: bool, stats: dict | None = None):
        return build_ecus(
            extractions, product, syntheses=syntheses_for_score,
            prompt_version=prompt_version,
            exact_form_only=demo,
            ignore_population=not variant_b,
            exclude_offtarget_population=variant_b,
            searched_outcomes=searched, sr_derived=sr_derived,
            stats=stats,
        )

    _elig: dict = {}
    rows = _score(True, stats=_elig)     # B: STORED since 2026-08-10
    run_context["eligibility"] = _elig
    run_context["population_policy"] = "B_exclude_offtarget"
    try:
        rows_b = _score(False)           # A: comparison only
    except Exception as e:
        print(f"  population A/B unavailable: {e}")
        rows_b = []
    if rows_b:
        _b = {r["outcome_vocab_id"]: r for r in rows_b}
        print("\n" + "=" * 74)
        print("POPULATION A/B — same studies, two policies. B is STORED (2026-08-10).")
        print("  B = off-target populations excluded (stored)   A = everything counts")
        print("-" * 74)
        # NOTE since 2026-08-10: `rows` is variant B (stored), `_b` holds
        # variant A (comparison). Column names below say which is which so
        # the swap cannot mislabel the table.
        print(f"  {'outcome':<24}{'B*':>5}{'A':>6}{'B-A':>8}   {'n B':>4}{'n A':>5}")
        for r in rows:
            b = _b.get(r["outcome_vocab_id"])
            if not b:
                continue
            stored_s, cmp_s = r.get("composite"), b.get("composite")
            ns = (r.get("evidence") or {}).get("n_primaries", 0)
            nc = (b.get("evidence") or {}).get("n_primaries", 0)
            d = ("" if stored_s is None or cmp_s is None
                 else f"{stored_s - cmp_s:+d}")
            print(f"  {r['outcome_vocab_id']:<24}"
                  f"{'--' if stored_s is None else stored_s:>5}"
                  f"{'--' if cmp_s is None else cmp_s:>6}{d:>8}   {ns:>4}{nc:>5}")
        print("-" * 74)
        print("  B* is stored. A positive B-A means A was dragged down by trials")
        print("  asking a different question. n_B far below n_A means B is")
        print("  starving the row -- check S3 health_status before trusting it.")
        print("=" * 74)
        run_context["population_ab"] = [
            {"outcome": r["outcome_vocab_id"],
             "b_stored": r.get("composite"),
             "a": (_b.get(r["outcome_vocab_id"]) or {}).get("composite"),
             "n_b": (r.get("evidence") or {}).get("n_primaries", 0),
             "n_a": ((_b.get(r["outcome_vocab_id"]) or {}).get("evidence") or {}).get("n_primaries", 0)}
            for r in rows if r["outcome_vocab_id"] in _b]
    # K SENSITIVITY A/B (founder ask 2026-08-11: "the algo may be too
    # punishing by the amount of studies we get... we fragment so much").
    # Measured: ECU granularity fragments 143 studies into cells of 4-17,
    # while K=3.0 needs ~51 studies/cell for c=0.8 -- so confidence, not
    # direction, caps every score. K is a SPEC 13 constant awaiting external
    # calibration; until then every run PRINTS both, never blends (same
    # discipline as the population A/B above).
    try:
        import pipeline.scoring as _sc
        _k0 = _sc.K
        _sc.K = 3.0   # the pre-2026-08-11 value, kept visible
        rows_k = _score(True)
    except Exception as e:
        print(f"  K sensitivity unavailable: {e}")
        rows_k = []
    finally:
        _sc.K = _k0
    if rows_k:
        _kb = {r["outcome_vocab_id"]: r for r in rows_k}
        print(f"\nCONFIDENCE A/B -- same evidence, K={_k0} (stored) vs K=3.0 (old).")
        print("  If these diverge wildly, fragmentation is the binding constraint,")
        print("  not the evidence. K change needs external calibration (SPEC 13).")
        print(f"  {'outcome':<24}{'stored':>7}{'K=3.0':>7}   {'c':>6}{'c@1.5':>7}")
        for r in rows:
            kk = _kb.get(r["outcome_vocab_id"])
            if not kk: continue
            c0 = (r.get("components") or {}).get("c")
            c1 = (kk.get("components") or {}).get("c")
            print(f"  {r['outcome_vocab_id']:<24}"
                  f"{str(r.get('composite')):>7}{str(kk.get('composite')):>7}   "
                  f"{str(c0):>6}{str(c1):>7}")
        run_context["k_ab"] = [
            {"outcome": r["outcome_vocab_id"], "stored": r.get("composite"),
             "k_old": (_kb.get(r["outcome_vocab_id"]) or {}).get("composite")}
            for r in rows if r["outcome_vocab_id"] in _kb]

    if os.environ.get("SP_V13_SHADOW") == "1":
        try:
            run_context["v13_shadow"] = _shadow_context_summary(extractions)
        except Exception as exc:
            # The opt-in audit must never change production scoring; retain
            # a bounded failure marker rather than aborting the run.
            run_context["v13_shadow"] = {
                "warning": "SHADOW ONLY: analysis failed; production scores unchanged.",
                "outcomes": [], "error": str(exc)[:300]}

    rows = show.filter_ecu_rows(rows, outcome_allowlist)
    for row in rows:
        store.upsert_ecu(row)

    # The immutable DashboardRunV1 export needs the complete deterministic
    # ECU result: dose, applicability, study ids, flags and provenance are
    # all required to explain the centre number and its arcs.  The old
    # abbreviated projection made those facts unrecoverable after the
    # gitignored SQLite store was gone.
    run_context["ecu_rows"] = rows

    print(f"\n{tag}ECU ROWS — {ingredient}, form={form}, scope={scope}")
    if outcome_allowlist:
        print(f"  showcase top-{len(outcome_allowlist)} by published RCT count")
    print("  0-100 = 50 + signed/2, a positive signal discounted by applicability "
          "A = mean(form strength, dose closeness)")
    print("-" * 74)
    for row in rows:
        o = vocab.outcome(row["outcome_vocab_id"]) or {}
        comp = row.get("composite")
        shown = "gated" if comp is None else f"{comp:>3}/100"
        verdict = arcsmod.label(
            comp, (row.get("components") or {}).get("c"),
            effect_verdict=((row.get("arcs") or {}).get("effect") or {}).get("verdict"),
            applicability_limited=any(
                ((row.get("arcs") or {}).get(k) or {}).get("verdict") is None
                for k in ("form", "dose")),
            applicability_score=(row.get("components") or {}).get("applicability"))
        print(f"{tag}{o.get('label', row['outcome_vocab_id']):<30}{shown:>9}  "
              f"{verdict:<24} n={row['evidence']['n_primaries']}"
              f"   (signed {row.get('score')})")
        try:
            print(four_arc_lines(row))
        except Exception:
            pass
    print("-" * 74)

    scored = [r for r in rows if r.get("composite") is not None]
    print("\n" + "=" * 74)
    print(f"{tag}RESULT — {ingredient} / {form}")
    if not scored:
        print("  no scored outcomes (every ECU gated, or extraction failed)")
    else:
        top = max(scored, key=lambda r: r["composite"])
        o = vocab.outcome(top["outcome_vocab_id"]) or {}
        c = (top.get("components") or {}).get("c")
        a = top.get("arcs") or {}

        def _a(k):
            arc = a.get(k) or {}
            v, cov = arc.get("verdict"), arc.get("coverage")
            if arc.get("is_quantity"):
                return f"{cov:.0%}" if cov is not None else "n/a"
            if v is None:
                return "not tested"
            return f"{v:+.2f}@{cov:.0%}"

        print(f"  best outcome   : {o.get('label', top['outcome_vocab_id'])}")
        _lab = arcsmod.label(
            top["composite"], c,
            effect_verdict=(a.get("effect") or {}).get("verdict"),
            applicability_limited=any((a.get(k) or {}).get("verdict") is None
                                      for k in ("form", "dose")),
            applicability_score=(top.get("components") or {}).get("applicability"))
        print(f"  SCORE          : {top['composite']}/100   {_lab}")
        print(f"  arcs           : effect {_a('effect')} | form {_a('form')} "
              f"| dose {_a('dose')} | evidence {_a('evidence')}")
        print(f"  outcomes shown : {len(rows)} showcase  "
              f"scored {len(scored)}  range "
              f"{min(r['composite'] for r in scored)}-"
              f"{max(r['composite'] for r in scored)}/100")

        # A capped run is a SAMPLE of the corpus, and the score it produces
        # is not an estimate of the full-corpus score: d and H are
        # sample-size independent, c grows with n by construction. Printing
        # the sample score with no note invites reading a --limit 40 run as
        # the answer. preview.py has done this arithmetic since it was
        # written and nothing called it.
        _n_avail = n_available or len(extractions)
        if _n_avail > len(extractions):
            from pipeline import preview as _prev
            _best = {"score": top.get("score"),
                     **{k: (top.get("components") or {}).get(k)
                        for k in ("c", "d", "H", "E")}}
            if _best.get("E"):
                print("\n" + _prev.summarise(_best, len(extractions), _n_avail))
    print("=" * 74)
    print(f"\nWritten to {db}")
    return rows
