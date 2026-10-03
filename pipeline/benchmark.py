"""
Evidence method v2, stage 8 (validation): compare a run's pooled estimates with
published meta-analyses. NO MODEL AND NO NETWORK IN THIS FILE.

docs/EVIDENCE_METHOD.md §3 stage 8 / §8: "our CI must overlap theirs" -- the
Phase 2 exit is the pooled creatine-strength estimate overlapping the published
strength CIs; Phase 4 needs >= 10 published meta-analyses.

The published rows live in vocab/benchmarks.json, each with a verbatim quote
(`scripts/benchmark_v2.py verify` re-fetches every source). `check_row` is the
offline half of that check: every number of the row must be printed in its own
quote (pipeline/span_check.find_number), the same rule a trial number obeys.

LIKE FOR LIKE ONLY. A standardised row (SMD) is compared with our SMD pool; a
mean-difference row only with our natural-unit pool in the SAME unit. Anything
else is "not comparable", with the reason -- a kg row is never read against an
SD-unit pool. Population and measure are printed beside each comparison and
never used to filter: an older-adult or a squat-only benchmark is evidence
about a different question, which the reader weighs (§3 stage 6 indirectness).
"""
from __future__ import annotations

import json
from pathlib import Path

from pipeline import vocab
from pipeline.span_check import find_number

PATH = Path(__file__).resolve().parents[1] / "vocab" / "benchmarks.json"
SCALES = ("smd", "md")


def load(ingredient: str | None = None, path: Path = PATH) -> list[dict]:
    rows = json.loads(path.read_text(encoding="utf-8"))["benchmarks"]
    return [r for r in rows if ingredient is None or r.get("ingredient") == ingredient]


def check_row(row: dict) -> list[str]:
    """Offline integrity problems of one benchmark row ([] when sound)."""
    problems = []
    if row.get("scale") not in SCALES:
        problems.append(f"scale {row.get('scale')!r} not in {SCALES}")
    if row.get("scale") == "md" and not row.get("unit"):
        problems.append("a mean-difference row needs its unit")
    est, lo, hi = row.get("estimate"), row.get("ci_low"), row.get("ci_high")
    if not all(isinstance(x, (int, float)) for x in (est, lo, hi)):
        problems.append("estimate and both interval bounds are required")
    elif not lo <= est <= hi:
        problems.append(f"estimate {est} outside its interval [{lo}, {hi}]")
    for field in ("estimate", "ci_low", "ci_high"):
        v = row.get(field)
        if isinstance(v, (int, float)) and find_number(v, row.get("quote") or "") is None:
            problems.append(f"{field} {v} is not printed in the quote")
    if row.get("outcome") not in {o["id"] for o in vocab.load("outcome")["outcomes"]}:
        problems.append(f"outcome {row.get('outcome')!r} is not in vocab/outcome.json")
    return problems


def _unit(u) -> str:
    return str(u or "").strip().lower()


def _sign(x: float) -> int:
    return (x > 0) - (x < 0)


def compare(block: dict | None, rows: list[dict]) -> list[dict]:
    """One result per benchmark row against an `evidence_v2` block
    (pipeline/evidence_v2.summarise): {"id", "outcome", "measure", "population",
    "scale", "theirs": (est, lo, hi), "ours": (est, lo, hi) | None, "k",
    "comparable", "overlap", "same_direction", "reason"}."""
    outcomes = {o["outcome"]: o for o in (block or {}).get("outcomes") or []}
    out = []
    for r in rows:
        res = {"id": r["id"], "outcome": r["outcome"], "measure": r.get("measure"),
               "population": r.get("population"), "scale": r["scale"], "unit": r.get("unit"),
               "theirs": (r["estimate"], r["ci_low"], r["ci_high"]), "ours": None, "k": None,
               "comparable": False, "overlap": None, "same_direction": None, "reason": None}
        o = outcomes.get(r["outcome"])
        pool = (o or {}).get(r["scale"])
        if o is None:
            res["reason"] = "no pooled outcome in this run"
        elif not pool:
            res["reason"] = f"no {r['scale'].upper()} pool for this outcome"
        elif r["scale"] == "md" and _unit(pool.get("unit")) != _unit(r.get("unit")):
            res["reason"] = f"units differ ({pool.get('unit')!r} vs {r.get('unit')!r})"
        else:
            est, (lo, hi) = pool["estimate"], pool["ci"]
            res.update(ours=(est, lo, hi), k=o.get("k"), comparable=True,
                       overlap=lo <= r["ci_high"] and r["ci_low"] <= hi,
                       same_direction=_sign(est) == _sign(r["estimate"]))
        out.append(res)
    return out


def summary(results: list[dict]) -> dict:
    """Per outcome: rows, comparable, overlapping."""
    by: dict[str, dict] = {}
    for r in results:
        s = by.setdefault(r["outcome"], {"rows": 0, "comparable": 0, "overlap": 0})
        s["rows"] += 1
        s["comparable"] += r["comparable"]
        s["overlap"] += bool(r["overlap"])
    return by
