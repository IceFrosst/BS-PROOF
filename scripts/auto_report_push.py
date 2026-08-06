#!/usr/bin/env python3
"""
After a live extraction run: write reports/runs/*.md from out/*.sqlite and
push reports/ to GitHub (source of truth).

    python scripts/auto_report_push.py --ingredient magnesium --form magnesium_glycinate --mode grok

Env:
  SP_AUTO_PUSH=0   skip git push (still writes local report)
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


def _update_index(rel: str, meta: dict) -> None:
    index = REPORTS / "INDEX.md"
    header = (
        "# Report runs index\n\n"
        "| When (UTC) | Mode | Ingredient | Form | File |\n"
        "|---|---|---|---|---|\n"
    )
    row = (
        f"| {meta['when']} | {meta['mode']} | `{meta['ingredient']}` | "
        f"`{meta['form']}` | [{rel}]({rel}) |\n"
    )
    if index.exists() and "| When (UTC) |" in index.read_text(encoding="utf-8"):
        parts = index.read_text(encoding="utf-8").splitlines(keepends=True)
        out, inserted = [], False
        for line in parts:
            out.append(line)
            if not inserted and line.startswith("|---"):
                out.append(row)
                inserted = True
        index.write_text("".join(out), encoding="utf-8")
    else:
        index.write_text(header + row, encoding="utf-8")


def write_report(ingredient: str, form: str, mode: str) -> Path:
    REPORTS.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(parents=True, exist_ok=True)

    body = "\n".join([
        f"# BS-PROOF run report ({mode})\n",
        f"Generated: **{_now()}**\n",
        f"Ingredient: `{ingredient}` · Form: `{form}` · Mode: **{mode}**\n",
        "Auto-written after extraction so GitHub stays the source of truth.\n",
        _ecu_section("grok_*.sqlite", "Grok databases"),
        _ecu_section("pilot*.sqlite", "Claude pilot databases"),
    ])
    fname = f"{_stamp()}_{_slug(ingredient)}_{_slug(form)}_{_slug(mode)}.md"
    path = RUNS / fname
    path.write_text(body, encoding="utf-8")
    (REPORTS / "latest.md").write_text(body, encoding="utf-8")
    rel = f"runs/{fname}"
    _update_index(rel, {
        "when": _now(), "mode": mode,
        "ingredient": ingredient, "form": form,
    })
    print(f"Wrote reports/{rel}")
    print("Wrote reports/latest.md")
    return path


def git_push_reports() -> int:
    if os.environ.get("SP_AUTO_PUSH", "1") in ("0", "false", "no"):
        print("SP_AUTO_PUSH disabled — report is local only.")
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
        msg = f"Auto-report {_now()}"
        subprocess.run(
            ["git", "-C", str(ROOT), "commit", "-m", msg],
            check=True,
        )
        subprocess.run(["git", "-C", str(ROOT), "push"], check=True)
        print("Pushed reports/ to GitHub.")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"git push failed: {e}")
        print("Report is on disk under reports/ — push manually if needed.")
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
