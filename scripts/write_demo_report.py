#!/usr/bin/env python3
"""
Write reports/latest.md so demo / selftest results are visible on GitHub.

    python3 scripts/write_demo_report.py
    python3 scripts/write_demo_report.py --wiring

Does not need an API key. --wiring runs the synthetic pipeline path and embeds
the score table (labelled SYNTHETIC). Pilot DBs, if present, are summarized
only — never presented as production scores.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
OUT = ROOT / "out"


def _run_selftest() -> tuple[bool, str]:
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    p = subprocess.run(
        [sys.executable, "-m", "pipeline.selftest"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=env,
    )
    text = (p.stdout or "") + (p.stderr or "")
    return p.returncode == 0, text


def _run_wiring(ingredient: str, form: str) -> tuple[bool, str]:
    p = subprocess.run(
        [sys.executable, "run_pipeline.py", ingredient, "--form", form, "--wiring"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    text = (p.stdout or "") + (p.stderr or "")
    return p.returncode == 0, text


def _sqlite_ecu_rows(db: Path) -> list[tuple]:
    if not db.exists():
        return []
    try:
        import sqlite3

        con = sqlite3.connect(db)
        # Schema may evolve; try common shapes.
        cols = {r[1] for r in con.execute("PRAGMA table_info(ecu)").fetchall()}
        if not cols:
            return []
        outcome = "outcome_vocab_id" if "outcome_vocab_id" in cols else None
        score = "score" if "score" in cols else None
        band = "band" if "band" in cols else None
        if not (outcome and score):
            return []
        q = f"SELECT {outcome}, {score}" + (f", {band}" if band else "") + " FROM ecu"
        rows = con.execute(q).fetchall()
        con.close()
        return rows
    except Exception as e:
        return [("_error", str(e), "")]


def _md_table(rows: list[tuple], synthetic: bool) -> str:
    if not rows:
        return "_No ECU rows found in that database._\n"
    tag = "SYNTHETIC " if synthetic else ""
    lines = [
        f"| Outcome | Score | Band |",
        f"|---|---:|---|",
    ]
    for r in rows:
        if len(r) >= 3:
            o, s, b = r[0], r[1], r[2]
        else:
            o, s, b = r[0], r[1], ""
        score = "gated" if s is None else s
        lines.append(f"| {tag}{o} | {score} | {b} |")
    return "\n".join(lines) + "\n"

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wiring", action="store_true",
                    help="Also run synthetic end-to-end and include score table")
    ap.add_argument("--ingredient", default="magnesium")
    ap.add_argument("--form", default="magnesium_glycinate")
    args = ap.parse_args()

    REPORTS.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    ok, selftest_out = _run_selftest()
    # Keep the report readable: last 80 lines of selftest is enough.
    st_tail = "\n".join(selftest_out.strip().splitlines()[-80:])

    wiring_section = ""
    if args.wiring:
        w_ok, w_out = _run_wiring(args.ingredient, args.form)
        w_tail = "\n".join(w_out.strip().splitlines()[-60:])
        wiring_db = OUT / "wiring_demo.sqlite"
        rows = _sqlite_ecu_rows(wiring_db)
        wiring_section = f"""
## Wiring demo (SYNTHETIC — not real evidence)

Command: `python3 run_pipeline.py {args.ingredient} --form {args.form} --wiring`

Status: **{'PASS' if w_ok else 'FAIL'}**

### Score table (from terminal / DB)

{_md_table(rows, synthetic=True)}

<details><summary>Terminal tail</summary>

```text
{w_tail}
```

</details>
"""

    # Summarize any local pilot DBs without promoting them to production.
    pilot_bits = []
    if OUT.exists():
        for db in sorted(OUT.glob("pilot*.sqlite")):
            rows = _sqlite_ecu_rows(db)
            pilot_bits.append(
                f"### `{db.name}` (PILOT — not for public claims)\n\n"
                + _md_table(rows, synthetic=False)
            )
    pilot_section = ""
    if pilot_bits:
        pilot_section = (
            "\n## Local pilot DBs found\n\n"
            "These came from `--pilot` (subscription). **Not production.**\n\n"
            + "\n".join(pilot_bits)
        )
    else:
        pilot_section = (
            "\n## Local pilot DBs\n\n"
            "_None found under `out/pilot*.sqlite` on this machine._\n"
        )

    body = f"""# BS-PROOF demo report

Generated: **{now}**

Regenerate: `python3 scripts/write_demo_report.py` optional `--wiring`

---

## Deterministic selftest

Status: **{'ALL PASSED' if ok else 'FAILED'}**

Command: `python3 -m pipeline.selftest`

<details><summary>Output tail</summary>

```text
{st_tail}
```

</details>

{wiring_section}
{pilot_section}

---

## How to read this

| Label | Meaning |
|-------|--------|
| Selftest PASS | Scoring, dedup, vocab, assembly math still green (no AI) |
| SYNTHETIC | Fake extractions — proves plumbing only |
| PILOT | Real model output on subscription — not for public brand claims |
| gated | Not enough evidence for a number |

Design handoff and coverage numbers live in root `CLAUDE.md`, not only here.
"""

    path = REPORTS / "latest.md"
    path.write_text(body, encoding="utf-8")
    print(f"Wrote {path.relative_to(ROOT)} (selftest={'PASS' if ok else 'FAIL'})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
