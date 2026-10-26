#!/usr/bin/env python3
"""
Evidence method v2 spot audit: are the extracted facts behind the pooled
effects RIGHT? (docs/METHOD.md §16.) The benchmark checks only the pooled
average, where extraction errors can cancel out; this checks the facts one by
one against the papers.

Draws a fixed-seed random sample of POOLED effects and writes a checklist: for
each, the study, outcome, chosen measure, the arms (with their co-interventions
and the contrast S5N read), the effect, and the S4 risk-of-bias items with
their evidence spans. A reader (the founder, or one paper-verifier agent per
study) marks each line right or wrong against the paper's full text. Offline,
no model calls.

    .venv/bin/python scripts/experiments/spot_audit.py reports/runs/<id>_context.json
    .venv/bin/python scripts/experiments/spot_audit.py <context.json> --n 20 --seed 1
    .venv/bin/python scripts/experiments/spot_audit.py <context.json> \\
        --extractions out/<dump>.json      # re-pool the dump with the CURRENT code

With --extractions the sample is drawn from the pool the current code builds
from that SP_DUMP_EXTRACTIONS dump (so a rule changed since the run applies),
and the facts come from the dump itself. Use it when the method changed after
the run, or for a run whose context predates item 7 and the arm
co-interventions (before 2026-10-26).

Pass rule (founder 2026-10-25, METHOD §16): count CONSEQUENTIAL errors only (a
wrong number, arm, measure, or a flipped risk-of-bias rating). 0-1 in 20
passes; 2-3: sample 20 more (--seed 2) and pass if the 40 hold at most 3; 4 or
more fails. One reversed direction (benefit read as harm or back) fails alone.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
S4_ITEMS = ("item1_randomisation_method", "item2_double_blind_placebo",
            "item3_prospective_registration", "item4_outcome_matches_registry",
            "item5_attrition_ok", "item6_itt", "item7_attrition_problem")


def _repool(dump: Path) -> tuple[list[dict], dict]:
    """(evidence outcomes, {study id: raw extraction}) from the current code."""
    sys.path.insert(0, str(ROOT))
    from pipeline import vocab
    from pipeline.evidence_v2 import summarise
    raw = json.loads(dump.read_text(encoding="utf-8"))
    items = [{"id": s["record"]["canonical_id"], "record": s["record"], "extraction": s["extraction"]}
             for s in raw]
    pv = vocab.population_variants()[0]
    product = {"ingredient": "creatine", "form_vocab_id": "creatine_monohydrate",
               "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}}}
    return summarise(items, product)["outcomes"], {i["id"]: i["extraction"] for i in items}


def _facts(ext: dict, from_dump: bool) -> tuple[dict, dict, list[dict]]:
    """(S3, S4, claims) from a raw extraction or a context's exported one."""
    if from_dump:
        claims = [{**(o.get("claim") or {}), "outcome_vocab_id": o.get("outcome_vocab_id"),
                   "numbers_v2": o.get("numbers_v2")} for o in ext.get("outcomes") or []]
        return ext.get("S3") or {}, ext.get("S4") or {}, claims
    return ext.get("s3") or {}, ext.get("s4") or {}, ext.get("s5_claims") or []


def _arm(s3: dict, label) -> dict:
    hits = [a for a in s3.get("arms") or [] if a.get("label") == label]
    return hits[0] if len(hits) == 1 else {}


def sample(context: dict, n: int, seed: int, dump: Path | None = None) -> list[dict]:
    studies = {s["canonical_id"]: s for s in context["studies_list"]}
    outcomes, raw = _repool(dump) if dump else (context["evidence_v2"]["outcomes"], {})
    pooled = [(o["outcome"], s) for o in outcomes for s in o["studies"]]
    pooled.sort(key=lambda x: (x[0], x[1]["study"]))      # stable before the seeded draw
    rows = []
    for outcome, eff in random.Random(seed).sample(pooled, min(n, len(pooled))):
        rec = studies.get(eff["study"], {})
        s3, s4, claims = _facts(raw[eff["study"]] if dump else rec.get("extraction") or {}, bool(dump))
        i = eff.get("claim_index")
        if isinstance(i, int) and i < len(claims):
            claim = claims[i]
        else:   # runs before 2026-10-26 record no claim index: the first claim with that measure
            claim = next((c for c in claims if c.get("outcome_vocab_id") == outcome
                          and c.get("outcome_raw") == eff.get("measure")), {})
        nclaim = (claim.get("numbers_v2") or {}).get("claim") or {}
        arms = [claim.get("ingredient_arm"), claim.get("control_arm")]
        rows.append({"study": eff["study"], "title": rec.get("title"), "outcome": outcome,
                     "measure": eff.get("measure"), "route": eff.get("route"), "g": eff.get("g"),
                     "n": eff.get("n"), "rob": eff.get("rob"), "arms": arms,
                     "cointerventions": [_arm(s3, a).get("active_cointerventions") for a in arms],
                     "contrast": nclaim.get("contrast"), "estimand": nclaim.get("estimand"),
                     "timepoint": claim.get("timepoint"), "claim_span": claim.get("evidence_span"),
                     "numbers": (claim.get("numbers_v2") or {}).get("verified"),
                     "s4": {k: s4.get(k) for k in S4_ITEMS},
                     "s4_spans": s4.get("evidence_spans")})
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("context")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--extractions", default=None, help="an SP_DUMP_EXTRACTIONS dump to re-pool")
    ap.add_argument("--out", default=None, help="default: out/spot_audit_<run id>.md")
    a = ap.parse_args()
    ctx = json.loads(Path(a.context).read_text())
    rows = sample(ctx, a.n, a.seed, Path(a.extractions) if a.extractions else None)
    run_id = Path(a.context).name.split("_creatine")[0].split("_context")[0]
    out = Path(a.out or f"out/spot_audit_{run_id}.md")
    source = f"re-pooled from {a.extractions} with the current code" if a.extractions else "as stored"
    lines = [f"# Spot audit, run {run_id} (n = {len(rows)}, seed {a.seed}; {source})", "",
             "Mark each check right / wrong against the paper's full text.", ""]
    for i, r in enumerate(rows, 1):
        lines += [f"## {i}. {r['study']} -- {r['outcome']}", f"{r['title']}", "",
                  f"- [ ] measure: {r['measure']} (timepoint: {r['timepoint']}; estimand: {r['estimand']})",
                  f"- [ ] arms: {r['arms'][0]} {r['cointerventions'][0]} vs {r['arms'][1]} "
                  f"{r['cointerventions'][1]} (contrast: {r['contrast']})",
                  f"- [ ] numbers ({r['route']}, g = {r['g']}, n = {r['n']}): {json.dumps(r['numbers'])}",
                  f"- [ ] risk of bias ({r['rob']}): {json.dumps(r['s4'])}",
                  f"- claim span: {r['claim_span']}",
                  f"- S4 spans: {json.dumps(r['s4_spans'], ensure_ascii=False)}", ""]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines))
    print(f"wrote {out} ({len(rows)} pooled effects)")


if __name__ == "__main__":
    main()
