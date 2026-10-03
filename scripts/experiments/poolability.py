#!/usr/bin/env python3
"""
Evidence method v2, Phase 1a: how much of the creatine corpus could be POOLED?
NO MODEL MAY ENTER THIS FILE. Zero model calls; part 2 uses the free Europe PMC
search + JATS full-text services through sources/ (throttled, disk-cached).

    .venv/bin/python scripts/experiments/poolability.py [--no-fulltext] [--out FILE]

A random-effects meta-analysis needs, per trial and outcome, a SIGNED
between-arm effect and its sampling variance. Two questions, kept separate:

  Part 1  What did the CURRENT extractor capture? Reads the retained run's
          context (per-claim effect, favoured arm, SD, CI, p) offline.
  Part 2  What is IN THE PAPERS? Scans each open PMC full text deterministically
          for per-arm mean +/- SD (or SEM), confidence intervals and exact
          p-values. This is the ceiling for the v2 arm-level extractor
          (docs/EVIDENCE_METHOD.md §3 stage 3), not a measurement of it.

Part 2 is a regex HEURISTIC: a "mean ± SD" in a table may be baseline
characteristics rather than outcomes, so it over-counts arm data; papers whose
only full text is a PDF/HTML outside PMC are not scanned. Read it as an upper
bound with stated coverage.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

RUN = ROOT / "reports" / "runs" / "20260904_185830_creatine_creatine-monohydrate_claude-sr-ft-top5-suppl_context.json"

STANDARDISED = re.compile(r"cohen|hedges|\bsmd\b|\bd\b|\bg\b|standardi[sz]ed mean|effect size", re.I)
# A stored p equal to a conventional cut-off may be "p < 0.05" copied as 0.05.
THRESHOLD_P = {0.05, 0.01, 0.001, 0.005, 0.1}

MEAN_SD = re.compile(r"\d+(?:\.\d+)?\s*(?:±|\+/-|\+/−|\+−)\s*\d+(?:\.\d+)?")
PAREN_SD_CELL = re.compile(r"^\s*-?\d+(?:\.\d+)?\s*\(\s*\d+(?:\.\d+)?\s*\)\s*$")
SEM = re.compile(r"\bSEM\b|standard error|±\s*SE\b|\bmean\s*±\s*s\.?e", re.I)
CI = re.compile(r"95\s*%\s*(?:CI|confidence interval)|confidence interval", re.I)
P_EXACT = re.compile(r"\bp\s*=\s*0?\.\d+", re.I)
P_THRESH = re.compile(r"\bp\s*[<>≤≥]\s*0?\.\d+", re.I)


# --------------------------------------------------------------------- part 1
def classify_claim(c: dict, n_analysed: int | None) -> str:
    """Poolability tier of one extracted claim (best tier wins)."""
    if c.get("contrast") != "vs_ingredient_free":
        return "not_a_between_arm_contrast"
    signed = c.get("effect_size") is not None and c.get("effect_favours") in ("ingredient", "control")
    if not signed:
        return "no_signed_effect"
    if c.get("ci_low") is not None and c.get("ci_high") is not None:
        return "A_effect+CI"
    p = c.get("p_value")
    std = STANDARDISED.search(c.get("effect_unit") or "") is not None
    if std and isinstance(p, (int, float)) and p not in THRESHOLD_P:
        return "B_smd+exact_p"
    if c.get("effect_sd") is not None and n_analysed:
        return "C_raw+SD+n"
    if std and n_analysed:
        return "D_smd+n_only (variance from n, equal arms assumed)"
    return "E_signed_effect_without_variance"


POOLABLE = ("A_", "B_", "C_")


def part1(ctx: dict) -> dict:
    tiers = collections.Counter()
    per_outcome = collections.defaultdict(lambda: {"studies": set(), "poolable": set(), "with_n": set()})
    for s in ctx["studies_list"]:
        if s.get("skipped"):
            continue
        ex = s.get("extraction") or {}
        n = (ex.get("s3") or {}).get("n_analysed") or (ex.get("s3") or {}).get("n_randomised")
        for c in ex.get("s5_claims") or []:
            oid = c.get("outcome_vocab_id")
            if c.get("discarded") or not oid:
                continue
            tier = classify_claim(c, n)
            tiers[tier] += 1
            if c.get("contrast") == "vs_ingredient_free":
                po = per_outcome[oid]
                po["studies"].add(s["canonical_id"])
                if tier.startswith(POOLABLE):
                    po["poolable"].add(s["canonical_id"])
                if tier.startswith(POOLABLE + ("D_",)):
                    po["with_n"].add(s["canonical_id"])
    return {
        "claim_tiers": dict(tiers.most_common()),
        "per_outcome": {k: {"trials_with_a_mapped_contrast": len(v["studies"]),
                            "poolable_trials": len(v["poolable"]),
                            "poolable_if_equal_arms_assumed": len(v["with_n"])}
                        for k, v in sorted(per_outcome.items(), key=lambda kv: -len(kv[1]["studies"]))},
    }


# --------------------------------------------------------------------- part 2
def _pmcid_for(study: dict) -> tuple[str | None, str | None]:
    """(pmcid, abstract) via Europe PMC, by DOI then PMID."""
    from sources import europepmc as ep
    for query in ([f'DOI:"{study["doi"]}"'] if study.get("doi") else []) + \
                 ([f"EXT_ID:{study['pmid']} AND SRC:MED"] if study.get("pmid") else []):
        recs = ep.search(query, page_size=5, max_records=5)
        if recs:
            r = recs[0]
            return r.get("pmcid"), r.get("abstractText")
    return None, None


def scan_text(text: str, tables: list[dict]) -> dict:
    table_text = " ".join(" ".join(" ".join(map(str, row)) for row in (t.get("rows") or []))
                          + " " + str(t.get("caption") or "") for t in tables)
    paren_sd = any(
        re.search(r"\bSD\b|standard deviation", " ".join(map(str, t.get("columns") or [])) + str(t.get("caption") or ""), re.I)
        and any(PAREN_SD_CELL.match(str(cell)) for row in (t.get("rows") or []) for cell in row)
        for t in tables)
    return {
        "mean_sd_in_tables": bool(MEAN_SD.search(table_text)) or paren_sd,
        "mean_sd_anywhere": bool(MEAN_SD.search(text)) or paren_sd,
        "sem_reported": bool(SEM.search(text + table_text)),
        "ci_reported": bool(CI.search(text + table_text)),
        "exact_p": bool(P_EXACT.search(text + table_text)),
        "threshold_p_only": bool(P_THRESH.search(text + table_text)) and not P_EXACT.search(text + table_text),
    }


def part2(ctx: dict) -> dict:
    from sources import fulltext as ft
    rows = []
    for s in ctx["studies_list"]:
        if s.get("skipped"):
            continue
        try:
            pmcid, abstract = _pmcid_for(s)
            xml = ft.fetch_xml(pmcid) if pmcid else None
        except Exception as exc:  # a transient source error is reported, not fatal
            rows.append({"id": s["canonical_id"], "source": "fetch_error", "error": str(exc)[:120]})
            continue
        if xml:
            secs = ft.sections(xml)
            text = " ".join(v for v in secs.values() if v)
            tables = ft.extract_tables_structured(xml) or []
            source = "pmc_fulltext"
        elif abstract:
            text, tables, source = abstract, [], "abstract_only"
        else:
            rows.append({"id": s["canonical_id"], "source": "none"})
            continue
        rows.append({"id": s["canonical_id"], "source": source, **scan_text(text, tables)})
    by_source = collections.Counter(r["source"] for r in rows)
    out = {"scanned": dict(by_source), "pmc_fulltext": {}, "abstract_only": {}}
    for src in ("pmc_fulltext", "abstract_only"):
        sub = [r for r in rows if r["source"] == src]
        if not sub:
            continue
        keys = ("mean_sd_in_tables", "mean_sd_anywhere", "sem_reported", "ci_reported", "exact_p", "threshold_p_only")
        out[src] = {k: sum(1 for r in sub if r.get(k)) for k in keys} | {"n": len(sub)}
        out[src]["arm_level_or_ci"] = sum(1 for r in sub if r.get("mean_sd_anywhere") or r.get("ci_reported"))
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fulltext", action="store_true", help="part 1 only (offline)")
    ap.add_argument("--out", type=Path, help="write the JSON result here")
    args = ap.parse_args(argv)
    ctx = json.loads(RUN.read_text(encoding="utf-8"))
    result = {"run": RUN.name, "part1_extracted": part1(ctx)}
    if not args.no_fulltext:
        result["part2_in_papers"] = part2(ctx)
    text = json.dumps(result, indent=1, sort_keys=False)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
