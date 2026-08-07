#!/usr/bin/env python3
"""
Write audit reports under reports/runs/ (immutable) + latest.md + INDEX.md.

    python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate
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


def _run_selftest() -> tuple[bool, str]:
    p = subprocess.run(
        [sys.executable, "-m", "pipeline.selftest"],
        cwd=ROOT, capture_output=True, text=True,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    return p.returncode == 0, (p.stdout or "") + (p.stderr or "")


def _study_links(s: dict) -> list[str]:
    links = []
    pmid, pmcid, doi, nct = s.get("pmid"), s.get("pmcid"), s.get("doi"), s.get("registration_id")
    if pmid:
        links.append(f"[PubMed {pmid}](https://pubmed.ncbi.nlm.nih.gov/{pmid}/)")
    if pmcid:
        links.append(f"[PMC {pmcid}](https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/)")
    if doi:
        links.append(f"[DOI {doi}](https://doi.org/{doi})")
    if nct:
        n = str(nct).upper()
        if n.startswith("NCT"):
            links.append(f"[{n}](https://clinicaltrials.gov/study/{n})")
        else:
            links.append(f"registry `{n}`")
    return links


def _fmt_study_row(s: dict) -> str:
    title = (s.get("title") or "(no title)")[:120].replace("|", "/")
    year = s.get("year") or "?"
    author = s.get("first_author") or "?"
    rank = s.get("design_rank")
    oa = s.get("oa") or "?"
    links = ", ".join(_study_links(s)) or "_no identifiers_"
    cid = s.get("canonical_id") or s.get("_canonical") or "?"
    return f"| `{cid}` | {author} {year} | {rank} | {oa} | {title} | {links} |"


def _explain_formula() -> str:
    return """
## How a score is built (the recipe)

Deterministic path in `pipeline/scoring.py` + `pipeline/assemble.py`.
**No model decides the number** — models extract fields; arithmetic scores.

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
"""


def _wiring_full_report(ingredient: str, form: str) -> str:
    from pipeline import vocab
    from pipeline.assemble import build_ecus, to_studies
    from pipeline.storage import Store, DEFAULT_DB
    from pipeline.retrieve import retrieve

    WIRING_DB = DEFAULT_DB.parent / "wiring_demo.sqlite"
    SYNTHETIC_VERSION = "SYNTHETIC-NOT-REAL"

    if vocab.form(ingredient, form) is None:
        return f"_Unknown form `{form}` for `{ingredient}`._\n"

    pv = vocab.population_variants()[0]
    product = {
        "ingredient": ingredient,
        "form_vocab_id": form,
        "population": {"id": pv["id"], **{a: pv[a] for a in vocab.AXES}},
    }
    axes = {a: pv[a] for a in vocab.AXES}

    lines: list[str] = [
        "## Product under test (INPUT)\n",
        "| Field | Value |", "|---|---|",
        f"| Ingredient | `{ingredient}` |",
        f"| Form | `{form}` |",
        f"| Population | `{pv['id']}` |",
        "", "> **SYNTHETIC** extractions — plumbing only.\n",
    ]

    with Store(WIRING_DB) as store:
        if store.counts()["studies"] == 0:
            try:
                retrieve(ingredient, store, max_syntheses=50, max_primaries=150)
            except Exception as e:
                return "\n".join(lines) + f"\n**Retrieval failed:** `{e}`\n"

        counts = store.counts()
        studies = store.studies(syntheses=False)
        primaries = [s for s in studies if s.get("design_rank") == 4]
        used = primaries[:40]

        lines += [
            "## Corpus\n", "| Metric | Count |", "|---|---:|",
            f"| Studies | {counts['studies']} |",
            f"| Syntheses | {counts['syntheses']} |",
            f"| RCT-rank | {len(primaries)} |",
            f"| Scored this run | {len(used)} |",
            "",
            "| Canonical ID | Author year | Rank | OA | Title | Links |",
            "|---|---|---:|---|---|---|",
        ]
        for s in used:
            lines.append(_fmt_study_row(s))

        def synthetic_extraction(_record: dict) -> dict:
            return {
                "S3": {"n_randomised": 100, "population_axes": axes},
                "S4": {"item1_randomisation_method": 1, "item2_double_blind_placebo": 1,
                       "item3_prospective_registration": None,
                       "item4_outcome_matches_registry": None,
                       "item5_attrition_ok": None, "item6_itt": 1},
                "S7": {"form_vocab_id": None},
                "S8": {"funding_class": "undisclosed"},
                "outcomes": [
                    {"claim": {"direction": "benefit", "magnitude": None},
                     "outcome_vocab_id": "sleep_onset", "discarded": False},
                    {"claim": {"direction": "null_effect", "magnitude": None},
                     "outcome_vocab_id": "anxiety", "discarded": False},
                ],
            }

        extractions = []
        for p in used:
            rec = {**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
            reg = store.registry_facts(p["registration_id"]) if p.get("registration_id") else None
            extractions.append({"record": rec, "registry": reg,
                                "extraction": synthetic_extraction(p)})

        rows = build_ecus(extractions, product, prompt_version=SYNTHETIC_VERSION)
        lines.append("\n## ECU scores (OUTPUT)\n")
        for row in rows:
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            score = row["score"]
            score_s = "gated" if score is None else f"**{score:+d}**"
            lines.append(f"### {o.get('label', row['outcome_vocab_id'])}\n")
            lines.append(f"Score {score_s} · band `{row['band']}` · n={row['evidence']['n_primaries']}\n")
            for r in rows:
                store.upsert_ecu(r)

    return "\n".join(lines)


def _sqlite_ecu_section(title: str, pattern: str, note: str) -> str:
    from pipeline.storage import Store

    blocks = [f"## {title}\n", f"> {note}\n"]
    if not OUT.exists():
        blocks.append("_No out/ directory._\n")
        return "\n".join(blocks)
    found = list(sorted(OUT.glob(pattern)))
    if not found:
        blocks.append(f"_No `{pattern}` files._\n")
        return "\n".join(blocks)
    for db in found:
        blocks.append(f"### `{db.name}`\n")
        try:
            with Store(db) as store:
                c = store.counts()
                blocks.append(
                    f"Studies={c['studies']}, ECUs={c['ecus']}, syntheses={c['syntheses']}\n"
                )
                rows = store.conn.execute(
                    "SELECT outcome_vocab_id, score, band, n_primaries, prompt_version, computed_at "
                    "FROM ecu ORDER BY score DESC"
                ).fetchall()
                if not rows:
                    blocks.append("_No ECU rows._\n")
                    continue
                blocks += [
                    "| Outcome | Score | Band | n | prompt | when |",
                    "|---|---:|---|---:|---|---|",
                ]
                for oc, score, band, np_, pv, when in rows:
                    sc = "gated" if score is None else score
                    blocks.append(f"| {oc} | {sc} | {band} | {np_} | `{pv}` | {when} |")
                blocks.append("")
        except Exception as ex:
            blocks.append(f"**Error:** `{ex}`\n")
    return "\n".join(blocks)


def _update_index(run_rel: str, meta: dict) -> None:
    index = REPORTS / "INDEX.md"
    header = (
        "# Report runs index\n\n"
        "| When (UTC) | Mode | Ingredient | Form | Selftest | File |\n"
        "|---|---|---|---|---|---|\n"
    )
    row = (
        f"| {meta['when']} | {meta['mode']} | `{meta['ingredient']}` | "
        f"`{meta['form']}` | {meta['selftest']} | [{run_rel}]({run_rel}) |\n"
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiring", action="store_true")
    ap.add_argument("--ingredient", default="magnesium")
    ap.add_argument("--form", default="magnesium_glycinate")
    args = ap.parse_args()

    REPORTS.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(parents=True, exist_ok=True)

    ok, selftest_out = _run_selftest()
    st_tail = "\n".join(selftest_out.strip().splitlines()[-80:])
    mode = "wiring" if args.wiring else "selftest-only"

    parts = [
        f"# BS-PROOF audit report\n",
        f"Generated: **{_now()}** · mode **{mode}** · `{args.ingredient}` / `{args.form}`\n",
        _explain_formula(),
        f"## Selftest: **{'ALL PASSED' if ok else 'FAILED'}**\n",
        "```text", st_tail, "```\n",
    ]
    if args.wiring:
        try:
            parts.append(_wiring_full_report(args.ingredient, args.form))
        except Exception as e:
            parts.append(f"## Wiring failed\n`{type(e).__name__}: {e}`\n")

    parts.append(_sqlite_ecu_section(
        "Grok batch databases", "grok_*.sqlite",
        "Grok Build CLI pure-function path — test separately from Claude; not merged scores."))
    parts.append(_sqlite_ecu_section(
        "Claude pilot databases", "pilot*.sqlite",
        "Claude subscription pilot — not production public claims."))

    body = "\n".join(parts)
    fname = f"{_stamp()}_{_slug(args.ingredient)}_{_slug(args.form)}_{mode}.md"
    (RUNS / fname).write_text(body, encoding="utf-8")
    (REPORTS / "latest.md").write_text(body, encoding="utf-8")
    rel = f"runs/{fname}"
    _update_index(rel, {
        "when": _now(), "mode": mode,
        "ingredient": args.ingredient, "form": args.form,
        "selftest": "PASS" if ok else "FAIL",
    })
    print(f"Wrote reports/{rel}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
