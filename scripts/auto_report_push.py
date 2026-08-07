#!/usr/bin/env python3
"""
After every live extraction: write BOTH reports and push reports/ to GitHub.

  1) Summary  → reports/latest.md + reports/runs/*_summary.md
  2) Full     → reports/runs/*_full.md  (formula, selftest, ECU tables, notes)

Called automatically from run_pipeline.py — no extra steps for the founder.

    python scripts/auto_report_push.py --ingredient magnesium --form magnesium_glycinate --mode grok

Env: SP_AUTO_PUSH=0 skips git push (still writes both reports locally).
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

REPORTS = ROOT / "reports"
RUNS = REPORTS / "runs"
OUT = ROOT / "out"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


def _ecu_section(pattern: str, title: str) -> str:
    from pipeline.storage import Store

    lines = [f"## {title}\n"]
    if not OUT.exists():
        lines.append("_No out/ directory._\n")
        return "\n".join(lines)
    found = sorted(OUT.glob(pattern))
    if not found:
        lines.append(f"_No `{pattern}` files._\n")
        return "\n".join(lines)
    for db in found:
        lines.append(f"### `{db.name}`\n")
        try:
            with Store(db) as store:
                c = store.counts()
                lines.append(
                    f"Studies={c['studies']}, ECUs={c['ecus']}, "
                    f"syntheses={c['syntheses']}\n"
                )
                rows = store.conn.execute(
                    "SELECT outcome_vocab_id, score, band, n_primaries, "
                    "prompt_version, computed_at FROM ecu ORDER BY score DESC"
                ).fetchall()
                if not rows:
                    lines.append("_No ECU rows._\n")
                    continue
                lines += [
                    "| Outcome | Score | Band | n | prompt | when |",
                    "|---|---:|---|---:|---|---|",
                ]
                for oc, score, band, np_, pv, when in rows:
                    sc = "gated" if score is None else score
                    lines.append(
                        f"| {oc} | {sc} | {band} | {np_} | `{pv}` | {when} |"
                    )
                lines.append("")
        except Exception as e:
            lines.append(f"**Error reading {db.name}:** `{e}`\n")
    return "\n".join(lines)


def _formula() -> str:
    return """## How the score is built

Deterministic (`pipeline/scoring.py`). Models extract fields only.

```text
w = design × RoB × size × funding × OA × form × dose × pop
    (0 if retracted or predatory venue)
score = clamp(round(100 × d × c × (1 − 0.4 × H)), −100, +100)
```

SRs (`--with-sr`) only raise confidence E′, never invent patients.
Predatory list: human ref https://www.predatoryjournals.org/the-list/publishers
"""


def _selftest_tail() -> str:
    try:
        p = subprocess.run(
            [sys.executable, "-m", "pipeline.selftest"],
            cwd=ROOT, capture_output=True, text=True, timeout=120,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        ok = p.returncode == 0
        tail = "\n".join(((p.stdout or "") + (p.stderr or "")).strip().splitlines()[-40:])
        return f"## Selftest: **{'PASS' if ok else 'FAIL'}**\n\n```text\n{tail}\n```\n"
    except Exception as e:
        return f"## Selftest\n_skipped: {e}_\n"


def _update_index(rows: list[tuple[str, dict]]) -> None:
    index = REPORTS / "INDEX.md"
    header = (
        "# Report runs index\n\n"
        "| When (UTC) | Mode | Ingredient | Form | Kind | File |\n"
        "|---|---|---|---|---|---|\n"
    )
    new_lines = []
    for rel, meta in rows:
        new_lines.append(
            f"| {meta['when']} | {meta['mode']} | `{meta['ingredient']}` | "
            f"`{meta['form']}` | {meta['kind']} | [{rel}]({rel}) |\n"
        )
    if index.exists() and "| When (UTC) |" in index.read_text(encoding="utf-8"):
        parts = index.read_text(encoding="utf-8").splitlines(keepends=True)
        out, inserted = [], False
        for line in parts:
            out.append(line)
            if not inserted and line.startswith("|---"):
                out.extend(new_lines)
                inserted = True
        index.write_text("".join(out), encoding="utf-8")
    else:
        index.write_text(header + "".join(new_lines), encoding="utf-8")


def write_report(ingredient: str, form: str, mode: str) -> list[Path]:
    """Write summary + full; update latest.md to summary; index both."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(parents=True, exist_ok=True)
    stamp = _stamp()
    base = f"{stamp}_{_slug(ingredient)}_{_slug(form)}_{_slug(mode)}"

    ecu_grok = _ecu_section("grok_*.sqlite", "Grok databases")
    ecu_pilot = _ecu_section("pilot*.sqlite", "Claude pilot databases")

    summary = "\n".join([
        f"# BS-PROOF summary report ({mode})\n",
        f"Generated: **{_now()}**\n",
        f"Ingredient: `{ingredient}` · Form: `{form}` · Mode: **{mode}**\n",
        "Auto-written after every extraction (no extra steps).\n",
        "Full audit for this run: see matching `*_full.md` in `reports/runs/`.\n",
        ecu_grok,
        ecu_pilot,
    ])

    full = "\n".join([
        f"# BS-PROOF full audit report ({mode})\n",
        f"Generated: **{_now()}**\n",
        f"Ingredient: `{ingredient}` · Form: `{form}` · Mode: **{mode}**\n",
        "Auto-written with the summary after every extraction.\n",
        _formula(),
        _selftest_tail(),
        ecu_grok,
        ecu_pilot,
        "## Notes\n",
        "- Claude and Grok scores are **never merged**.\n",
        "- Predatory venues (list) get weight 0 when journal/publisher matches.\n",
        "- Inconclusive scores with low n are often the confidence ceiling (SPEC 13), not a bug.\n",
    ])

    path_sum = RUNS / f"{base}_summary.md"
    path_full = RUNS / f"{base}_full.md"
    path_sum.write_text(summary, encoding="utf-8")
    path_full.write_text(full, encoding="utf-8")
    (REPORTS / "latest.md").write_text(summary, encoding="utf-8")
    (REPORTS / "latest_full.md").write_text(full, encoding="utf-8")

    meta_base = {"when": _now(), "mode": mode,
                 "ingredient": ingredient, "form": form}
    _update_index([
        (f"runs/{path_sum.name}", {**meta_base, "kind": "summary"}),
        (f"runs/{path_full.name}", {**meta_base, "kind": "full"}),
    ])
    print(f"Wrote reports/runs/{path_sum.name}")
    print(f"Wrote reports/runs/{path_full.name}")
    print("Wrote reports/latest.md (summary)")
    print("Wrote reports/latest_full.md (full)")
    return [path_sum, path_full]


def git_push_reports() -> int:
    if os.environ.get("SP_AUTO_PUSH", "1") in ("0", "false", "no"):
        print("SP_AUTO_PUSH disabled — reports local only.")
        return 0
    try:
        subprocess.run(["git", "-C", str(ROOT), "add", "reports"], check=True)
        st = subprocess.run(
            ["git", "-C", str(ROOT), "status", "--porcelain", "reports"],
            capture_output=True, text=True, check=True,
        )
        if not (st.stdout or "").strip():
            print("No report changes to commit.")
            return 0
        subprocess.run(
            ["git", "-C", str(ROOT), "commit", "-m", f"Auto-report {_now()}"],
            check=True,
        )
        subprocess.run(["git", "-C", str(ROOT), "push"], check=True)
        print("Pushed reports/ to GitHub.")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"git push failed: {e}")
        print("Reports are on disk under reports/ — push manually if needed.")
        return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingredient", required=True)
    ap.add_argument("--form", required=True)
    ap.add_argument("--mode", default="grok")
    ap.add_argument("--no-push", action="store_true")
    args = ap.parse_args()
    write_report(args.ingredient, args.form, args.mode)
    if args.no_push:
        return 0
    return git_push_reports()


if __name__ == "__main__":
    sys.exit(main())
