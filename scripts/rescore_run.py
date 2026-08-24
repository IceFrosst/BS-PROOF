#!/usr/bin/env python3
"""Re-score a retained run from its OWN cached extractions. No model calls.

Why this exists
---------------
Extraction is the expensive half (~10 calls per study, ~40 min for a corpus);
scoring is deterministic and free. So when a scoring defect is fixed, the right
move is to re-score what we already extracted -- CLAUDE.md has said
"re-scoring from cached extractions is cheap afterward" since the constants
freeze, but no tool did it, so in practice a scoring fix could only reach the
dashboard behind a full re-extraction.

That gap had teeth on 2026-08-24: PROMPT_VERSION moved to v1.23, invalidating
the v1.22 cache, so the dose-bracket fix (muscle_power 44 -> 67) could not be
published without hours of re-extraction competing with a live run.

What it does NOT do
-------------------
It never calls a model, never touches the store, and never edits the parent
run -- runs are immutable. It writes a NEW run whose extractions are the
parent's, through the same writer a real run uses, so schema and reconciliation
apply unchanged.

Telemetry is deliberately dropped rather than copied. The parent's calls were
spent once; re-reporting them here would double-count them in every cost
aggregate. The artifact takes its honest "telemetry unavailable" path, and the
run records `rescored_from`.

Fidelity check, and it is not optional
--------------------------------------
`--verify` re-scores with the CURRENT code and compares against the parent's
published rows. Run it BEFORE trusting a delta: if the reconstruction cannot
reproduce the parent's own numbers, any difference you see afterwards is the
reconstruction, not your fix. (The context artifact does not retain
`design_rank`; it is grafted from the dashboard artifact's per-study
contributions. Without it every study defaults to rank 14, which is beyond
human evidence, and every outcome gates.)

    python scripts/rescore_run.py 20260824_113359 --verify
    python scripts/rescore_run.py 20260824_113359 --write
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.assemble import build_ecus            # noqa: E402

RUNS = ROOT / "reports" / "runs"


def _find(run_prefix: str) -> tuple[Path, Path | None]:
    matches = sorted(RUNS.glob(f"{run_prefix}*_context.json"))
    if not matches:
        raise SystemExit(f"no context artifact matches {run_prefix!r} in {RUNS}")
    if len(matches) > 1:
        raise SystemExit("prefix is ambiguous; it matches:\n  "
                         + "\n  ".join(p.name for p in matches))
    context = matches[0]
    dashboard = context.with_name(
        context.name.replace("_context.json", "_dashboard.json"))
    return context, (dashboard if dashboard.exists() else None)


def _design_ranks(dashboard: Path | None) -> dict:
    """canonical id -> design_rank, from the dashboard's per-study contributions."""
    ranks: dict = {}
    if dashboard is None:
        return ranks

    def walk(node) -> None:
        if isinstance(node, dict):
            if node.get("id") and "design_rank" in node:
                ranks[node["id"]] = node["design_rank"]
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(json.loads(dashboard.read_text(encoding="utf-8")))
    return ranks


def _extractions(context: dict, ranks: dict) -> list:
    """The context stores a FLATTENED projection; build_ecus wants the raw shape."""
    built = []
    for study in context.get("studies_list", []):
        if study.get("skipped"):
            continue
        record = {k: v for k, v in study.items() if k != "extraction"}
        record["_canonical"] = study.get("canonical_id")
        record["ingredient"] = context.get("ingredient")
        if study.get("canonical_id") in ranks:
            record["design_rank"] = ranks[study["canonical_id"]]

        source = study.get("extraction") or {}
        outcomes = [{
            "outcome_vocab_id": claim.get("outcome_vocab_id"),
            "discarded": claim.get("discarded"),
            "claim": {k: v for k, v in claim.items()
                      if k not in ("outcome_vocab_id", "discarded")},
        } for claim in (source.get("s5_claims") or [])]

        built.append({
            "record": record,
            "extraction": {
                "S3": source.get("s3"), "S4": source.get("s4"),
                "S7": source.get("s7"), "S8": source.get("s8"),
                "outcomes": outcomes,
            },
        })
    return built


def _score(context: dict, ranks: dict, dose_mg) -> list:
    product = dict(context["product"])
    if dose_mg is not None:
        product["dose_low_mg"] = product["dose_high_mg"] = dose_mg
    # Variant B is the STORED population policy (2026-08-10).
    return build_ecus(
        _extractions(context, ranks), product,
        prompt_version=context.get("prompt_version", "unknown"),
        ignore_population=False,
        exclude_offtarget_population=True,
        searched_outcomes=context.get("showcase_outcomes") or None,
    )


def _table(published: dict, rows: list):
    got = {row["outcome_vocab_id"]: row for row in rows}
    lines = ["%-20s %9s %9s %8s %8s"
             % ("outcome", "comp_old", "comp_new", "sig_old", "sig_new")]
    identical = 0
    keys = sorted(set(published) | set(got))
    for key in keys:
        old, new = published.get(key) or {}, got.get(key) or {}
        if old.get("composite") == new.get("composite"):
            identical += 1
        lines.append("%-20s %9s %9s %8s %8s" % (
            key[:20], old.get("composite"), new.get("composite"),
            old.get("score"), new.get("score")))
    return "\n".join(lines), identical, len(keys)


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run", help="run id or unambiguous prefix")
    parser.add_argument("--verify", action="store_true",
                        help="compare against the parent's published rows and stop")
    parser.add_argument("--write", action="store_true",
                        help="write a new run (summary, full, dashboard artifact)")
    parser.add_argument("--dose", type=float, default=None,
                        help="override the product dose in ELEMENTAL mg")
    args = parser.parse_args(argv)

    context_path, dashboard_path = _find(args.run)
    context = json.loads(context_path.read_text(encoding="utf-8"))
    ranks = _design_ranks(dashboard_path)

    print("parent:       ", context_path.name)
    print("design ranks: ", f"{len(ranks)} recovered"
          + ("" if dashboard_path else "   (NO dashboard artifact -- expect gating)"))
    print("studies:      ", len(context.get("studies_list", [])))
    print("prompt:       ", context.get("prompt_version"),
          "  (unchanged: nothing was re-extracted)")
    print()

    rows = _score(context, ranks, args.dose)
    published = {row["outcome_vocab_id"]: row for row in context.get("ecu_rows", [])}
    table, identical, total = _table(published, rows)
    print(table)
    print()
    print(f"composites identical to parent: {identical}/{total}")

    if args.verify:
        print()
        if identical == total:
            print("VERIFIED: the reconstruction reproduces the parent exactly, so a")
            print("delta measured after a scoring change is that change.")
        else:
            print("NOT identical. Before reading this as a scoring delta, re-run")
            print("--verify with the scoring change reverted: whatever fails to")
            print("reproduce there is reconstruction error, not your fix.")
        return 0

    if not args.write:
        print("\n(nothing written -- pass --write to publish, --verify to check fidelity)")
        return 0

    from scripts.auto_report_push import write_report      # noqa: E402

    out = dict(context)
    out["ecu_rows"] = rows
    out["rescored_from"] = context_path.name.replace("_context.json", "")
    out["rescore_note"] = (
        "Deterministic re-score of the parent run's cached extractions. No model "
        "calls were made, so the parent's telemetry is NOT repeated here -- those "
        "calls were spent once and counting them again would double-count them."
    )
    # Telemetry belongs to the parent. Dropping these routes the artifact to its
    # honest "unavailable" path instead of claiming calls this pass never made.
    for key in ("usage", "speed_report", "agent_stats"):
        out.pop(key, None)

    written = write_report(
        context["ingredient"],
        context.get("form") or context["product"].get("form_vocab_id"),
        context.get("mode") or "claude",
        run_context=out,
    )
    print()
    for path in written:
        print("wrote", Path(path).name)
    print("\nNOT pushed. Review, then commit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
