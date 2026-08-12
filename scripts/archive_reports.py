#!/usr/bin/env python3
"""
Keep reports/runs/ holding ONE scoring model, and only the current one.

    python3 scripts/archive_reports.py            # show what would move
    python3 scripts/archive_reports.py --apply    # move it

WHY THIS EXISTS
A score is only comparable to another score computed the same way. On
2026-08-07 the model changed twice in one afternoon -- form left the weight,
then dose and population followed and the display became a 0-100 composite. A
folder holding runs from before and after looks like a time series and is not
one: the same corpus would produce +30 under one model and 46/100 under the
next.

So reports/runs/ holds only `scoring.SCORING_MODEL` runs. Anything else is swept
to reports/archive/<model>/, which is a record, not a graveyard -- archived runs
stay readable and stay indexed, they are just fenced off from side-by-side
comparison.

HOW A REPORT DECLARES ITS MODEL
A line `scoring_model: <id>` in the first 40 lines. Reports written before the
stamp existed have none, and are treated as `v1-transfer-in-weight` -- correct,
because the stamp was introduced with v2.

Archived files are NEVER edited or deleted, only moved. A run file is evidence
of what the pipeline said on a given day.
"""
from __future__ import annotations
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.scoring import SCORING_MODEL, SCORING_MODEL_HISTORY  # noqa: E402

REPORTS = Path(__file__).resolve().parent.parent / "reports"
RUNS = REPORTS / "runs"
ARCHIVE = REPORTS / "archive"

PRE_STAMP_MODEL = "v1-transfer-in-weight"
_STAMP = re.compile(r"^scoring_model:\s*([\w.\-]+)\s*$", re.M)


def model_of(path: Path) -> str:
    """The model a report was produced under. Unstamped means pre-v2."""
    head = "\n".join(path.read_text(errors="replace").splitlines()[:40])
    m = _STAMP.search(head)
    return m.group(1) if m else PRE_STAMP_MODEL


def plan() -> list[tuple[Path, Path]]:
    """(source, destination) for every run file not matching the current model."""
    moves = []
    for f in sorted(RUNS.glob("*.md")):
        if f.name == "README.md":
            continue
        model = model_of(f)
        if model != SCORING_MODEL:
            moves.append((f, ARCHIVE / model / f.name))
    # The _dashboard.json / _context.json artifacts DELIBERATELY STAY in
    # reports/runs/. Tried moving them alongside their .md reports on
    # 2026-08-12 and REVERTED the same hour: lib/dashboard/catalog.ts reads
    # reports/runs/ as the dashboard's whole catalog and throws on any report
    # path outside it, so the sweep broke the dashboard build and its test
    # suite. The .md/.json "split" a code sweep flagged is by design -- run
    # VALIDITY is carried by reports/run_statuses.json, not by directory
    # placement, and the retained historical Grok artifact (20260807_164410)
    # must stay put per CLAUDE.md. Only .md reports move, because only they
    # invite the cross-model score comparison this script exists to prevent.
    return moves


def _write_archive_readme(model: str) -> None:
    d = ARCHIVE / model
    d.mkdir(parents=True, exist_ok=True)
    (d / "README.md").write_text(
        f"# Archived runs — scoring model `{model}`\n\n"
        f"{SCORING_MODEL_HISTORY.get(model, 'Model predates the SCORING_MODEL stamp.')}\n\n"
        "**Do not compare these numbers with runs under a different model.** The\n"
        "same corpus produces different scores under each, because the formula\n"
        "changed — not because the evidence did.\n\n"
        "Files here are never edited or deleted. They record what the pipeline\n"
        "said on the day they were produced.\n")


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    moves = plan()

    print(f"current scoring model: {SCORING_MODEL}")
    if not moves:
        print(f"reports/runs/ is clean — every run matches.")
        return 0

    by_model: dict[str, int] = {}
    for src, _ in moves:
        by_model[model_of(src)] = by_model.get(model_of(src), 0) + 1
    print(f"\n{len(moves)} run(s) from an older model:")
    for m, n in sorted(by_model.items()):
        print(f"  {m:<28} {n} file(s)")

    if not apply:
        print("\nDry run. Re-run with --apply to move them.")
        for src, dst in moves:
            print(f"  {src.name}  ->  archive/{dst.parent.name}/")
        return 0

    for model in by_model:
        _write_archive_readme(model)
    for src, dst in moves:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        print(f"  moved {src.name} -> archive/{dst.parent.name}/")
    print(f"\nreports/runs/ now holds only {SCORING_MODEL} runs.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
