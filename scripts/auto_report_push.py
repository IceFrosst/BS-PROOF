#!/usr/bin/env python3
"""
After every live extraction: write BOTH reports and push reports/ to GitHub.

  1) Summary  → reports/latest.md + reports/runs/*_summary.md
  2) Full     → reports/latest_full.md + reports/runs/*_full.md

Reports are RUN-SCOPED: only the ingredient/DB from this run, never mixed
with other ingredients (no creatine rows inside a magnesium report).

Called automatically from run_pipeline.py — no extra steps for the founder.

Env: SP_AUTO_PUSH=0 skips git push (still writes both reports locally).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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


def _formula() -> str:
    return """## How the score is built

Deterministic (`pipeline/scoring.py`). Models extract fields only.

```text
1. weight w = design × RoB × size × funding × OA        (study QUALITY only)
   form / dose / population are NOT in the weight — they are arcs
2. E = Σw ; E' adds a capped synthesis lift (ceiling 1.30)
3. d = Σ(w·s)/Σw      direction, −1…+1
   H = weighted var(s)/1.5
   c = 1 − e^(−E'/k)  confidence, k = 3
4. signed  = clamp(round(100 × d × c × (1 − 0.4 × H)), −100, +100)   [internal]
5. FOUR ARCS, each carrying a verdict AND its coverage:
     effect    d over ALL evidence
     form      d over trials using YOUR form      + share of evidence
     dose      d over trials in YOUR dose band    + share of evidence
     evidence  c (pure quantity, no direction)
6. composite = 100 × c × mean(effect, form, dose)   [the 0–100 shown]
   a MISSING subset is penalised at its transfer tier, never dropped
7. Gate if almost no human clinical weight → no number at all
```

4-arc donut — every arc carries a VERDICT and the COVERAGE behind it:
- **effect** — what all the evidence says
- **form** — what trials using *your* form found, and how many there were
- **dose** — what trials in *your* dose band found, and how many
- **evidence** — how much trustworthy evidence exists at all (c)

Centre = the 0–100 composite. A low number with a full evidence arc means
"does not work"; a low number with an empty one means "barely studied".

SRs (`--with-sr`) only raise confidence E′, never invent patients.
Predatory list: https://www.predatoryjournals.org/the-list/publishers
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


def _section_run_stats(ctx: dict) -> str:
    lines = ["## This run — extraction stats\n"]
    lines.append(f"- Targeted studies: **{ctx.get('studies_targeted', '?')}**")
    lines.append(f"- Succeeded (usable): **{ctx.get('studies_ok', '?')}**")
    lines.append(f"- Skipped (no text): **{ctx.get('studies_skipped', 0)}**")
    lines.append(f"- Partial agent failures: **{ctx.get('studies_failed_partial', 0)}**")
    lines.append(f"- Prompt version: `{ctx.get('prompt_version', '?')}`")
    lines.append(f"- Concurrency: {ctx.get('concurrency', '?')}  |  "
                 f"studies in flight: {ctx.get('studies_in_flight', '?')}")
    lines.append("")
    return "\n".join(lines)


def _section_predatory(ctx: dict) -> str:
    p = ctx.get("predatory") or {}
    lines = ["## Predatory journal check (flag only — not in score)\n"]
    lines.append(f"- List entries loaded: **{p.get('list_entries', 0)}**")
    lines.append(f"- Studies checked: **{p.get('studies_checked', 0)}**")
    lines.append(f"- Studies flagged predatory: **{p.get('studies_predatory', 0)}**")
    lines.append(f"- Distinct journals flagged: **{p.get('journals_predatory_n', 0)}**")
    lines.append(f"- Affects score: **{'YES' if p.get('zero_weight') else 'NO (count only)'}**")
    for j in (p.get("journals_predatory") or [])[:30]:
        lines.append(f"  - {j}")
    lines.append("")
    return "\n".join(lines)


def _section_studies(ctx: dict) -> str:
    studies = ctx.get("studies_list") or []
    lines = [f"## Studies extracted this run ({len(studies)})\n"]
    if not studies:
        lines.append("_No study list captured._\n")
        return "\n".join(lines)
    lines += [
        "| # | Year | Title | DOI / PMID | Journal | OA | Predatory |",
        "|---:|---:|---|---|---|---|---|",
    ]
    for i, s in enumerate(studies, 1):
        title = (s.get("title") or "?")[:80].replace("|", "/")
        doi = s.get("doi") or ""
        pmid = s.get("pmid") or ""
        link = f"https://doi.org/{doi}" if doi else (f"PMID:{pmid}" if pmid else "—")
        if doi:
            link = f"[{doi}](https://doi.org/{doi})"
        elif pmid:
            link = f"[PMID {pmid}](https://pubmed.ncbi.nlm.nih.gov/{pmid}/)"
        journal = (s.get("journal") or "—")[:40].replace("|", "/")
        oa = s.get("oa") or "?"
        pred = "YES" if s.get("predatory_venue") else "no"
        year = s.get("year") or ""
        lines.append(
            f"| {i} | {year} | {title} | {link} | {journal} | {oa} | {pred} |"
        )
    lines.append("")
    return "\n".join(lines)


def _section_sr(ctx: dict) -> str:
    sr = ctx.get("sr") or {}
    lines = ["## Systematic reviews / meta-analyses (S2)\n"]
    lines.append(f"- Requested (cap): **{sr.get('requested', 0)}**")
    lines.append(f"- S2 extractions ok: **{sr.get('s2_ok', 0)}**")
    lines.append(f"- Resolved for multiplier: **{sr.get('resolved', 0)}**")
    lines.append("_SRs never add patients; only a capped confidence boost (≤ +30%)._\n")
    return "\n".join(lines)


def _section_agents(ctx: dict) -> str:
    agents = ctx.get("agent_stats") or {}
    lines = ["## Per-agent success rates (this run)\n"]
    if not agents:
        lines.append("_Agent stats not captured._\n")
        return "\n".join(lines)
    lines += ["| Agent | OK | Fail | Cache |", "|---|---:|---:|---:|"]
    for name in sorted(agents.keys()):
        a = agents[name]
        lines.append(
            f"| {name} | {a.get('ok', 0)} | {a.get('fail', 0)} | {a.get('cache', 0)} |"
        )
    lines.append("")
    return "\n".join(lines)


def _section_speed(ctx: dict) -> str:
    text = ctx.get("speed_report") or ""
    if not text:
        return "## SPEED REPORT\n_Not available._\n"
    return f"## SPEED REPORT\n\n```text\n{text.strip()}\n```\n"


def _section_ecu_this_run(ctx: dict) -> str:
    rows = ctx.get("ecu_rows") or []
    lines = ["## ECU scores — this run only\n"]
    if not rows:
        lines.append("_No ECU rows from this run._\n")
        return "\n".join(lines)
    lines += [
        "| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |",
        "|---|---:|---|---|---|---|---|---:|",
    ]

    def arc(row, key):
        """verdict @ coverage, or an explicit 'not tested' -- never a blank."""
        a = (row.get("arcs") or {}).get(key) or {}
        v, cov = a.get("verdict"), a.get("coverage")
        if a.get("is_quantity"):
            return f"{cov:.0%}" if cov is not None else "—"
        if v is None:
            return "not tested"
        return f"{v:+.2f} @ {cov:.0%}" if cov is not None else f"{v:+.2f}"

    from pipeline import arcs as _arcs
    for r in sorted(rows, key=lambda x: -(x.get("composite")
                                          if x.get("composite") is not None else -999)):
        comp = r.get("composite")
        shown = "gated" if comp is None else comp
        verdict = _arcs.label(comp, ((r.get("components") or {}).get("c")))
        lines.append(
            f"| {r.get('outcome_vocab_id')} | {shown} | {verdict} | "
            f"{arc(r, 'effect')} | {arc(r, 'form')} | {arc(r, 'dose')} | "
            f"{arc(r, 'evidence')} | "
            f"{r.get('n_primaries', r.get('evidence_n', (r.get('evidence') or {}).get('n_primaries', '?')))} |"
        )
    lines.append("")
    lines.append("_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its "
                 "verdict and the share of evidence behind it. A low number with a "
                 "FULL evidence arc means 'does not work'; with an EMPTY one it "
                 "means 'barely studied'._\n")
    lines.append("")
    lines.append("_Old rows from previous runs are not shown here._\n")
    return "\n".join(lines)


def _section_db_snapshot(ingredient: str, form: str) -> str:
    """Only the matching grok/pilot DB for this ingredient — never other ingredients."""
    from pipeline.storage import Store

    lines = [f"## Database snapshot (`{ingredient}`)\n"]
    if not OUT.exists():
        lines.append("_No out/ directory._\n")
        return "\n".join(lines)

    patterns = [
        f"grok_{ingredient}*.sqlite",
        f"pilot_{ingredient}*.sqlite",
    ]
    found = []
    for pat in patterns:
        found.extend(sorted(OUT.glob(pat)))

    # Never include other ingredients or the shared cache in the human report.
    found = [p for p in found if "cache" not in p.name and ingredient in p.name]

    if not found:
        lines.append(f"_No `{ingredient}` database files found._\n")
        return "\n".join(lines)

    for db in found:
        lines.append(f"### `{db.name}`\n")
        try:
            with Store(db) as store:
                c = store.counts()
                lines.append(
                    f"Studies stored (corpus): **{c['studies']}** · "
                    f"ECUs: **{c['ecus']}** · syntheses: **{c['syntheses']}\n"
                )
        except Exception as e:
            lines.append(f"**Error reading {db.name}:** `{e}`\n")
    return "\n".join(lines)


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


def write_report(ingredient: str, form: str, mode: str,
                 run_context: dict | None = None) -> list[Path]:
    """Write summary + full for THIS run only; update latest*; index both."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(parents=True, exist_ok=True)
    stamp = _stamp()
    base = f"{stamp}_{_slug(ingredient)}_{_slug(form)}_{_slug(mode)}"
    ctx = run_context or {}

    summary_parts = [
        f"# BS-PROOF summary report ({mode})\n",
        f"Generated: **{_now()}**\n",
        f"Ingredient: `{ingredient}` · Form: `{form}` · Mode: **{mode}**\n",
        "Auto-written after every extraction (no extra steps).\n",
        "Full audit: matching `*_full.md` in `reports/runs/`.\n",
        _section_run_stats(ctx),
        _section_predatory(ctx),
        _section_sr(ctx),
        _section_ecu_this_run(ctx),
        _section_db_snapshot(ingredient, form),
    ]

    full_parts = [
        f"# BS-PROOF full audit report ({mode})\n",
        f"Generated: **{_now()}**\n",
        f"Ingredient: `{ingredient}` · Form: `{form}` · Mode: **{mode}**\n",
        "Auto-written with the summary after every extraction.\n",
        _formula(),
        _selftest_tail(),
        _section_run_stats(ctx),
        _section_predatory(ctx),
        _section_sr(ctx),
        _section_agents(ctx),
        _section_speed(ctx),
        _section_studies(ctx),
        _section_ecu_this_run(ctx),
        _section_db_snapshot(ingredient, form),
        "## Notes\n",
        "- Claude and Grok scores are **never merged**.\n",
        "- Form does **not** penalize the center score; it is the form arc only.\n",
        "- Predatory venues: flagged + counted; weight zero is OFF for now.\n",
        "- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.\n",
        "- This report is **this run only** — other ingredients are not mixed in.\n",
    ]

    summary = "\n".join(summary_parts)
    full = "\n".join(full_parts)

    path_sum = RUNS / f"{base}_summary.md"
    path_full = RUNS / f"{base}_full.md"
    path_sum.write_text(summary, encoding="utf-8")
    path_full.write_text(full, encoding="utf-8")
    (REPORTS / "latest.md").write_text(summary, encoding="utf-8")
    (REPORTS / "latest_full.md").write_text(full, encoding="utf-8")

    # Machine-readable run context for later tooling
    ctx_path = RUNS / f"{base}_context.json"
    try:
        ctx_path.write_text(json.dumps(ctx, indent=2, default=str), encoding="utf-8")
    except Exception:
        pass

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
    ap.add_argument("--context-json", default=None,
                    help="Optional path to run_context JSON")
    args = ap.parse_args()
    ctx = None
    if args.context_json and Path(args.context_json).exists():
        ctx = json.loads(Path(args.context_json).read_text(encoding="utf-8"))
    write_report(args.ingredient, args.form, args.mode, run_context=ctx)
    if args.no_push:
        return 0
    return git_push_reports()


if __name__ == "__main__":
    sys.exit(main())
