#!/usr/bin/env python3
"""
Evidence method v2 spot audit: are the extracted facts behind the pooled
effects RIGHT? (docs/METHOD.md §16.) The benchmark checks only the pooled
average, where extraction errors can cancel out; this checks the facts one by
one against the papers.

Draws a fixed-seed random sample of POOLED effects from a run artifact and
writes a checklist: for each, the study, outcome, chosen measure, the arms,
the effect, and the S4 risk-of-bias items with their evidence spans. A reader
(the founder, or one paper-verifier agent per study) marks each line right or
wrong against the paper's full text. Offline, no model calls.

    .venv/bin/python scripts/experiments/spot_audit.py reports/runs/<id>_context.json
    .venv/bin/python scripts/experiments/spot_audit.py <context.json> --n 20 --seed 1

Pass rule (proposed in docs/DECISIONS.md, founder call): no SYSTEMATIC error,
i.e. no single kind of mistake (wrong arm, wrong measure, wrong number,
wrong RoB item) in more than 2 of the 20.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path


def sample(context: dict, n: int, seed: int) -> list[dict]:
    studies = {s["canonical_id"]: s for s in context["studies_list"]}
    pooled = [(o["outcome"], s) for o in context["evidence_v2"]["outcomes"] for s in o["studies"]]
    pooled.sort(key=lambda x: (x[0], x[1]["study"]))      # stable before the seeded draw
    rows = []
    for outcome, eff in random.Random(seed).sample(pooled, min(n, len(pooled))):
        rec = studies.get(eff["study"], {})
        ext = rec.get("extraction") or {}
        claim = next((c for c in ext.get("s5_claims") or []
                      if c.get("outcome_vocab_id") == outcome and c.get("outcome_raw") == eff.get("measure")), {})
        rows.append({"study": eff["study"], "title": rec.get("title"), "outcome": outcome,
                     "measure": eff.get("measure"), "route": eff.get("route"), "g": eff.get("g"),
                     "n": eff.get("n"), "rob": eff.get("rob"),
                     "arms": [claim.get("ingredient_arm"), claim.get("control_arm")],
                     "timepoint": claim.get("timepoint"), "claim_span": claim.get("evidence_span"),
                     "numbers": (claim.get("numbers_v2") or {}).get("verified"),
                     "s4": {k: v for k, v in (ext.get("s4") or {}).items() if k.startswith("item")},
                     "s4_spans": (ext.get("s4") or {}).get("evidence_spans")})
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("context")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=None, help="default: out/spot_audit_<run id>.md")
    a = ap.parse_args()
    ctx = json.loads(Path(a.context).read_text())
    rows = sample(ctx, a.n, a.seed)
    run_id = Path(a.context).name.split("_creatine")[0].split("_context")[0]
    out = Path(a.out or f"out/spot_audit_{run_id}.md")
    lines = [f"# Spot audit, run {run_id} (n = {len(rows)}, seed {a.seed})", "",
             "Mark each check right / wrong against the paper's full text.", ""]
    for i, r in enumerate(rows, 1):
        lines += [f"## {i}. {r['study']} -- {r['outcome']}", f"{r['title']}", "",
                  f"- [ ] measure: {r['measure']} (timepoint: {r['timepoint']})",
                  f"- [ ] arms: {r['arms'][0]} vs {r['arms'][1]}",
                  f"- [ ] numbers ({r['route']}, g = {r['g']}, n = {r['n']}): {json.dumps(r['numbers'])}",
                  f"- [ ] risk of bias ({r['rob']}): {json.dumps(r['s4'])}",
                  f"- claim span: {r['claim_span']}",
                  f"- S4 spans: {json.dumps(r['s4_spans'], ensure_ascii=False)}", ""]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines))
    print(f"wrote {out} ({len(rows)} pooled effects)")


if __name__ == "__main__":
    main()
