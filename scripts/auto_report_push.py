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
from pipeline.scoring import SCORING_MODEL as _SCORING_MODEL

OUT = ROOT / "out"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def _source_commit() -> str | None:
    """Commit containing the code that produced this run, when available."""
    try:
        value = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip().lower()
        return value if re.fullmatch(r"[0-9a-f]{40}", value) else None
    except Exception:
        return None


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
6. composite = 50 + signed/2 × (A if signed > 0 else 1)   [the 0–100 shown]
   A = mean(form strength, dose closeness) — applicability to YOUR product;
   a MISSING axis is priced at its transfer tier, never dropped
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
    checked = p.get("studies_checked", 0)
    resolved = p.get("publishers_resolved", 0)
    lines.append(f"- Studies checked: **{checked}**")
    # Coverage beside the verdict. Without it "0 flagged" is unreadable: it
    # means "clean" or "never asked" and the reader cannot tell which.
    lines.append(f"- Publisher resolved for: **{resolved}/{checked}** "
                 f"(the list is PUBLISHERS, so this is the real coverage)")
    lines.append(f"- Studies flagged predatory: **{p.get('studies_predatory', 0)}**")
    lines.append(f"- Distinct publishers flagged: **{p.get('publishers_predatory_n', 0)}**")
    lines.append(f"- Distinct journals flagged: **{p.get('journals_predatory_n', 0)}**")
    lines.append(f"- Affects score: **{'YES' if p.get('zero_weight') else 'NO (count only)'}**")
    if checked and not resolved:
        lines.append("- **NOT CHECKED at publisher level** — 0 flagged above is "
                     "an absence of data, not a clean corpus.")
    for pub in (p.get("publishers_predatory") or [])[:30]:
        lines.append(f"  - [publisher] {pub}")
    for j in (p.get("journals_predatory") or [])[:30]:
        lines.append(f"  - [journal] {j}")
    lines.append("")
    return "\n".join(lines)


def _section_cost(ctx: dict) -> str:
    """
    Tokens and price, per subagent, with the model that produced them.

    The two numbers are NOT the same claim and are never merged. This pipeline
    runs on a Claude subscription, so the metered spend for the run is $0. What
    the CLI reports as `total_cost_usd` is the API-EQUIVALENT price -- what the
    identical work would have cost billed per token. That is the number worth
    publishing, because it is what someone reproducing this on metered access
    would pay, and it is the only honest basis for "what does a score cost".
    """
    u = ctx.get("usage") or {}
    if not u or not u.get("calls"):
        return ""
    t = u.get("tokens") or {}
    tiers = ctx.get("agent_tiers") or {}
    token_parts = [t.get("input"), t.get("cache_write"), t.get("cache_read")]
    tokens_complete = all(isinstance(value, (int, float)) for value in
                          (*token_parts, t.get("output")))
    total_in = sum(token_parts) if tokens_complete else None
    api_equivalent = u.get("api_equivalent_cost", u.get("api_equivalent_usd"))
    lines = ["## Token + cost accounting\n"]
    lines.append(f"- Extraction backend: **Claude subscription** "
                 f"(`--safe-mode`, `--max-turns 1`, one shot per call)")
    lines.append(f"- Model calls: **{u.get('calls', 0)}** "
                 f"(cache hits {u.get('cache_hits', 0)}, failures {u.get('failures', 0)})")
    if tokens_complete:
        lines.append(f"- Input tokens: **{total_in:,}** "
                     f"(fresh {t['input']:,} · cache-write {t['cache_write']:,} "
                     f"· cache-read {t['cache_read']:,})")
        lines.append(f"- Output tokens: **{t['output']:,}**")
    else:
        lines.append("- Input tokens: **unavailable** (not recorded for every call)")
        lines.append("- Output tokens: **unavailable** (not recorded for every call)")
    lines.append(f"- **Spent on this run: $0.00** — subscription, not metered.")
    api_text = (f"${api_equivalent:.3f}"
                if isinstance(api_equivalent, (int, float)) else "unavailable")
    lines.append(f"- **API-equivalent cost: {api_text}** "
                 f"— what the same work would cost billed per token.")
    n_ok = ctx.get("studies_ok") or 0
    if n_ok:
        per_study_cost = (
            f"${api_equivalent / n_ok:.4f}"
            if isinstance(api_equivalent, (int, float)) else "unavailable")
        lines.append(f"- Per study: **{u['calls'] / n_ok:.1f} calls**, "
                     f"**{per_study_cost}** API-equivalent across {n_ok} scored studies.")
    lines.append("")
    lines.append("| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |")
    lines.append("|---|---|---|--:|--:|--:|--:|--:|--:|")
    for a, v in sorted((u.get("by_agent") or {}).items()):
        agent_tokens = v.get("tokens") if isinstance(v.get("tokens"), dict) else {}
        complete = agent_tokens.get("total") is not None
        a_in = (agent_tokens.get("fresh_input", 0)
                + agent_tokens.get("cache_write", 0)
                + agent_tokens.get("cache_read", 0)) if complete else None
        agent_out = agent_tokens.get("output") if complete else None
        agent_cost = v.get("api_equivalent_cost")
        lines.append(
            f"| {a} | {tiers.get(a, '-')} | `{v.get('model') or '-'}` | {v.get('calls', 0)} "
            f"| {v.get('hits', 0)} | {v.get('fail', 0)} "
            f"| {'unavailable' if a_in is None else format(a_in, ',')} "
            f"| {'unavailable' if agent_out is None else format(agent_out, ',')} "
            f"| {'unavailable' if not isinstance(agent_cost, (int, float)) else '$' + format(agent_cost, '.3f')} |")
    lines.append("")
    lines.append("Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never "
                 "aliases: an alias floats to a new model while the cache key does not "
                 "change). Tier A = classification, B = extraction, C = the "
                 "highest-risk agent.")
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


def reconcile_agent_views(by_agent: dict | None, agent_stats: dict | None) -> list[str]:
    """
    Problems between the two per-agent views of one run. Empty means consistent.

    The two views count DIFFERENT DENOMINATORS and must never be compared for
    equality:

        by_agent      claude_adapter.Usage   -> one row per CLI ATTEMPT (retries
                                                included; `call()` retries twice,
                                                so up to 3 attempts per study)
        agent_stats   workers                -> one row per STUDY

    Measured on the 2026-08-10 creatine run: the cost table reported 493 calls /
    214 failures and the success table 253 ok / 147 failures. That looks like a
    contradiction and was briefly read as one. It is not -- every agent's
    ok+fail was exactly 80, the study count, and the excess in the cost table is
    the retry count (S3 +3, S4 +17, S5 +6, S7 +17, S8 +0).

    So equality is the wrong test. Two things must hold instead, and both did
    catch something real:

      * every agent in one view appears in the other. S6B did NOT: 50 attempts
        and 24 failures were invisible in the success table, because agent_stats
        is built from the per-study worker records and the batched S6 path did
        not register there.
      * attempts >= studies, and failed attempts >= failed studies. A study can
        only fail after every attempt fails, so the reverse is impossible.
    """
    by_agent = by_agent or {}
    agent_stats = agent_stats or {}
    if not by_agent or not agent_stats:
        return []  # nothing to reconcile; the report already says "not captured"

    out: list[str] = []
    for name in sorted(set(by_agent) - set(agent_stats)):
        out.append(f"{name}: {by_agent[name].get('calls', 0)} attempts in the cost "
                   f"table but no row in the success table -- its failures are "
                   f"invisible to anyone reading success rates")
    for name in sorted(set(agent_stats) - set(by_agent)):
        out.append(f"{name}: has a success row but made no recorded model calls")
    for name in sorted(set(by_agent) & set(agent_stats)):
        attempts = by_agent[name].get("calls", 0)
        st = agent_stats[name]
        studies = st.get("ok", 0) + st.get("fail", 0)
        if attempts < studies:
            out.append(f"{name}: {attempts} attempts for {studies} studies -- "
                       f"impossible, every study needs at least one attempt")
        if by_agent[name].get("fail", 0) < st.get("fail", 0):
            out.append(f"{name}: {by_agent[name].get('fail', 0)} failed attempts "
                       f"but {st.get('fail', 0)} failed studies -- a study only "
                       f"fails once all of its attempts have failed")
    return out


def _section_agents(ctx: dict) -> str:
    agents = ctx.get("agent_stats") or {}
    by_agent = ((ctx.get("usage") or {}).get("by_agent")) or {}
    lines = ["## Per-agent success rates (this run)\n"]
    if not agents:
        lines.append("_Agent stats not captured._\n")
        return "\n".join(lines)
    # Column names say what they count. Both tables used to say "Fail" over
    # different denominators (attempts here, studies there), which is how 214
    # failed attempts get read as 214 unusable studies when 147 were.
    lines += ["| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |",
              "|---|---:|---:|---:|---:|---|"]
    for name in sorted(agents.keys()):
        a = agents[name]
        studies = a.get("ok", 0) + a.get("fail", 0)
        attempts = by_agent.get(name, {}).get("calls")
        retries = "—" if attempts is None else max(0, attempts - studies)
        lines.append(
            f"| {name} | {a.get('ok', 0)} | {a.get('fail', 0)} | {a.get('cache', 0)} "
            f"| {retries} | "
            + ("; ".join(f"{k} (x{v})" for k, v in
                        sorted((a.get("errors") or {}).items(),
                               key=lambda kv: -kv[1])[:2]) or "—") + " |"
        )
    lines.append("")
    lines.append("_One row per STUDY. The cost table above counts CLI ATTEMPTS, so "
                 "its totals are higher by exactly the retries column._")
    problems = reconcile_agent_views(by_agent, agents)
    if problems:
        lines.append("")
        lines.append("**Telemetry does not reconcile — do not quote these rates:**")
        for p in problems:
            lines.append(f"- {p}")
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
        # FORM shows the ladder STRENGTH -- the number the composite uses since
        # v5 -- with the signed verdict kept beside it as the caveat. Printing
        # only the verdict made the table disagree with its own headline.
        if key == "form" and "strength" in a:
            st = a.get("strength") or 0.0
            basis = a.get("basis")
            if basis == "untested_in_form":
                return "not tested in your form"
            if basis == "all_negative_in_form":
                return f"all negative ({v:+.2f} @ {cov:.0%})" if v is not None else "all negative"
            tail = f" (pooled {v:+.2f} @ {cov:.0%})" if v is not None and cov is not None else ""
            return f"{st:.2f}{tail}"
        if v is None:
            return "not tested"
        return f"{v:+.2f} @ {cov:.0%}" if cov is not None else f"{v:+.2f}"

    from pipeline import arcs as _arcs
    for r in sorted(rows, key=lambda x: -(x.get("composite")
                                          if x.get("composite") is not None else -999)):
        comp = r.get("composite")
        shown = "gated" if comp is None else comp
        verdict = _arcs.label(
            comp, ((r.get("components") or {}).get("c")),
            effect_verdict=((r.get("arcs") or {}).get("effect") or {}).get("verdict"),
            applicability_limited=any(
                ((r.get("arcs") or {}).get(k) or {}).get("verdict") is None
                for k in ("form", "dose")),
            applicability_score=(r.get("components") or {}).get("applicability"))
        lines.append(
            f"| {r.get('outcome_vocab_id')} | {shown} | {verdict} | "
            f"{arc(r, 'effect')} | {arc(r, 'form')} | {arc(r, 'dose')} | "
            f"{arc(r, 'evidence')} | "
            f"{r.get('n_primaries', r.get('evidence_n', (r.get('evidence') or {}).get('n_primaries', '?')))} |"
        )
    lines.append("")
    lines.append("_0–100 = 50 + signed/2, with a positive signal discounted by "
                 "applicability A = mean(form strength, dose closeness); a negative "
                 "signal is never softened. 50 means the evidence points nowhere. "
                 "Each arc shows its verdict and the share of evidence behind it; a "
                 "number near 50 with a FULL evidence arc means 'no effect found', "
                 "with an EMPTY one it means 'barely studied'._\n")
    lines.append("")
    lines.append("_Old rows from previous runs are not shown here._\n")

    # WHICH STUDIES MADE THE NUMBER. Exact decomposition, not an attribution
    # guess: signed = 100 x d x c x (1 - 0.4H) and d = sum(w_i x s_i)/E, so each
    # study owns `100 x c x (1-0.4H) x w_i x s_i / E` points and the column sums
    # to the signed score. Founder ask 2026-08-11.
    lines.append("## Which studies made each number\n")
    any_contrib = False
    for r in sorted(rows, key=lambda x: -(x.get("composite")
                                          if x.get("composite") is not None else -999)):
        cons = ((r.get("evidence") or {}).get("contributions")) or []
        if not cons:
            continue
        any_contrib = True
        signed = r.get("score")
        lines.append(f"### {r.get('outcome_vocab_id')} — signed {signed:+d}"
                     if isinstance(signed, int) else
                     f"### {r.get('outcome_vocab_id')}")
        lines.append("")
        lines.append("| Study | points | w (quality) | s (direction) | rank | form |")
        lines.append("|---|--:|--:|--:|--:|---|")
        for csx in cons[:15]:
            lines.append(f"| `{csx.get('id','?')}` | {csx.get('points'):+.2f} | "
                         f"{csx.get('w')} | {csx.get('s')} | "
                         f"{csx.get('design_rank')} | {csx.get('form_match')} |")
        tot = sum(c.get("points") or 0 for c in cons)
        lines.append(f"| **sum of all {len(cons)}** | **{tot:+.2f}** | | | | |")
        lines.append("")
    if not any_contrib:
        lines.append("_No scored ECU had attributable contributions._\n")
    lines.append("_`points` sum to the signed score. NEGATIVE points mean that "
                 "study pushed the score down. `w` is quality (design × RoB × size "
                 "× funding × OA); `s` is what it found (+1.0 meaningful benefit, "
                 "+0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate "
                 "on purpose: how good a study is and what it found are different "
                 "facts._\n")
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
    """Write summary, full and DashboardRunV1 for this immutable run."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(parents=True, exist_ok=True)
    stamp = _stamp()
    base = f"{stamp}_{_slug(ingredient)}_{_slug(form)}_{_slug(mode)}"
    # Copy so report-only provenance does not mutate the caller's live object.
    ctx = dict(run_context or {})
    ctx.setdefault("mode", mode)
    ctx.setdefault("provider", (
        "grok" if "grok" in mode else
        "claude-pilot" if "pilot" in mode else
        "claude" if "claude" in mode else None
    ))
    ctx.setdefault("scoring_model", _SCORING_MODEL)
    ctx.setdefault("source_commit", _source_commit())

    summary_parts = [
        f"# BS-PROOF summary report ({mode})\n",
        f"Generated: **{_now()}**\n",
        f"\nscoring_model: {_SCORING_MODEL}\n",
        f"Ingredient: `{ingredient}` · Form: `{form}` · Mode: **{mode}**\n",
        "Auto-written after every extraction (no extra steps).\n",
        "Full audit: matching `*_full.md` in `reports/runs/`.\n",
        _section_run_stats(ctx),
        _section_cost(ctx),
        _section_predatory(ctx),
        _section_sr(ctx),
        _section_ecu_this_run(ctx),
        _section_db_snapshot(ingredient, form),
    ]

    full_parts = [
        f"# BS-PROOF full audit report ({mode})\n",
        f"Generated: **{_now()}**\n",
        f"\nscoring_model: {_SCORING_MODEL}\n",
        f"Ingredient: `{ingredient}` · Form: `{form}` · Mode: **{mode}**\n",
        "Auto-written with the summary after every extraction.\n",
        _formula(),
        _selftest_tail(),
        _section_run_stats(ctx),
        _section_cost(ctx),
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

    # THE MARKDOWN REPORTS ARE NOW ON DISK AND MUST STAY THERE.
    #
    # Everything below is derived: a JSON copy of the context and the deployable
    # dashboard artifact. Both can fail on data the reports themselves render
    # fine -- a non-serialisable object in the context, a telemetry
    # inconsistency the artifact contract refuses, a run id that already has an
    # immutable artifact. A multi-hour extraction must not lose its INDEX entry
    # and its push because a derived file could not be built, so each derived
    # write degrades on its own and says so loudly. Nothing here is swallowed
    # silently: the reason is printed with the name of what failed.
    written = [path_sum, path_full]

    # Machine-readable run context for later tooling
    ctx_path = RUNS / f"{base}_context.json"
    try:
        ctx_path.write_text(json.dumps(ctx, indent=2, default=str),
                            encoding="utf-8")
    except Exception as exc:
        print(f"!! WARNING: run context {ctx_path.name} NOT written: "
              f"{type(exc).__name__}: {exc}")
        print("!! The markdown reports above are complete; only the machine-"
              "readable copy is missing.")

    # Deployable data contract. It is deliberately produced from the in-memory
    # full ECU rows, not reconstructed later from the lossy SQLite projection.
    dashboard_path = None
    try:
        from scripts.dashboard_artifact import write_dashboard_artifact
        dashboard_path = write_dashboard_artifact(
            ctx,
            run_id=base,
            mode=mode,
            source_commit=ctx.get("source_commit"),
            reports={
                "summary": f"reports/runs/{path_sum.name}",
                "full": f"reports/runs/{path_full.name}",
                "context": f"reports/runs/{ctx_path.name}",
                "dashboard": f"reports/runs/{base}_dashboard.json",
            },
        )
        written.append(dashboard_path)
    except Exception as exc:
        print(f"!! WARNING: dashboard artifact {base}_dashboard.json NOT "
              f"written: {type(exc).__name__}: {exc}")
        print("!! This run cannot be deployed to the dashboard until that is "
              "fixed. The markdown reports above are complete and unaffected.")

    meta_base = {"when": _now(), "mode": mode,
                 "ingredient": ingredient, "form": form}
    _update_index([
        (f"runs/{path_sum.name}", {**meta_base, "kind": "summary"}),
        (f"runs/{path_full.name}", {**meta_base, "kind": "full"}),
    ])
    print(f"Wrote reports/runs/{path_sum.name}")
    print(f"Wrote reports/runs/{path_full.name}")
    if dashboard_path is not None:
        print(f"Wrote reports/runs/{dashboard_path.name}")
    print("Wrote reports/latest.md (summary)")
    print("Wrote reports/latest_full.md (full)")
    return written


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
        # Two agents share this repo, so the remote has almost certainly moved
        # since this run started. Rebase before pushing rather than failing --
        # the 14:59 run committed a report, was rejected, and the reports sat
        # unpushed until someone noticed.
        #
        # --autostash because a Windows checkout carries line-ending churn that
        # would otherwise block the rebase. Report commits never conflict with
        # code: they only add files under reports/.
        pull = subprocess.run(
            ["git", "-C", str(ROOT), "pull", "--rebase", "--autostash"],
            capture_output=True, text=True)
        if pull.returncode != 0:
            # Do NOT retry destructively. Leave the commit local and say so.
            print("Pull --rebase failed; reports are committed locally but NOT pushed.")
            print((pull.stderr or pull.stdout or "")[-400:])
            print("Resolve by hand, then: git push")
            return 1

        push = subprocess.run(["git", "-C", str(ROOT), "push"],
                              capture_output=True, text=True)
        if push.returncode != 0:
            print("Push failed after a successful rebase — reports are local only.")
            print((push.stderr or push.stdout or "")[-400:])
            return 1
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
