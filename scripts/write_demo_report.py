#!/usr/bin/env python3
"""
Write a FULL audit-trail report under reports/ so every run is kept on GitHub.

    python3 scripts/write_demo_report.py
    python3 scripts/write_demo_report.py --wiring
    python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate

Layout:
  reports/runs/<timestamp>_<ingredient>_<form>_<mode>.md   # immutable per run
  reports/latest.md                                         # copy of the newest run
  reports/INDEX.md                                          # table of all runs

Agents: after any demo/selftest/wiring/pilot summary intended for humans,
commit the new file under reports/runs/ plus INDEX.md and latest.md.
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
1. For each unique primary study mapped to this ECU outcome:
     weight w = design × RoB × size × funding × OA × form_match × dose_match × pop_match
     s        = signed effect (benefit / null / harm)

2. E = sum(w);  d = weighted mean(s);  H = disagreement;  c = 1 − exp(−E'/k)
   E' = E × (1 + 0.3 × synthesis_coverage × quality)   # bounded SR lift

3. score = clamp(round(100 × d × c × (1 − 0.4 × H)), −100, +100)

4. Gate: almost no human clinical weight → score null ("gated").
```

**Transfer factor:** wrong form/dose/population collapses weight (product moat).
**Null results count against** the claim (`s ≈ −0.7`), not as missing data.
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

    lines: list[str] = []
    lines += [
        "## Product under test (INPUT)\n",
        "| Field | Value |",
        "|---|---|",
        f"| Ingredient | `{ingredient}` |",
        f"| Form (bottle) | `{form}` |",
        f"| Population | `{pv['id']}` |",
    ]
    for a in vocab.AXES:
        lines.append(f"| · {a} | `{pv[a]}` |")
    lines += [
        "| Dose band | _unbanded_ (band_version 0) |",
        f"| Prompt / provenance | `{SYNTHETIC_VERSION}` |",
        "",
        "> **SYNTHETIC MODE:** fixed fake extractions. Proves plumbing, not efficacy.\n",
        "",
        "### Demo caps (this build)\n",
        "| Stage | Cap |",
        "|---|---:|",
        "| Retrieve max primaries | 150 |",
        "| Retrieve max syntheses | 50 |",
        "| Registry lookups | 50 (retrieve default) |",
        "| Wired into synthetic scoring | min(40, RCT-rank primaries) |",
        "",
        "Retrieval is by **ingredient name**, not form. Form only changes transfer "
        "matching at score time (`creatine_monohydrate` vs unspecified, etc.).\n",
    ]

    with Store(WIRING_DB) as store:
        if store.counts()["studies"] == 0:
            lines.append("_Corpus empty — running retrieval (network)…_\n")
            try:
                retrieve(ingredient, store, max_syntheses=50, max_primaries=150)
            except Exception as e:
                lines.append(f"**Retrieval failed:** `{e}`\n")
                return "\n".join(lines)

        counts = store.counts()
        studies = store.studies(syntheses=False)
        syntheses = store.studies(syntheses=True)
        primaries = [s for s in studies if s.get("design_rank") == 4]
        used = primaries[:40]

        lines += [
            "## Corpus (what entered the machine)\n",
            "| Metric | Count |",
            "|---|---:|",
            f"| All study rows in this DB | {counts['studies']} |",
            f"| Syntheses (reviews) | {counts['syntheses']} |",
            f"| Registry fact records | {counts['registry_facts']} |",
            f"| Unclassified (need S1) | {counts['unclassified']} |",
            f"| RCT-rank primaries (design_rank=4) | {len(primaries)} |",
            f"| **Actually scored this run** | **{len(used)}** |",
            f"| Database file | `{WIRING_DB.name}` |",
            "",
            f"### Primary studies scored ( {len(used)} of {len(primaries)} RCT-rank )\n",
            "| Canonical ID | Author year | Design rank | OA tier | Title | Links |",
            "|---|---|---:|---|---|---|",
        ]
        for s in used:
            lines.append(_fmt_study_row(s))
        if len(primaries) > 40:
            lines.append(f"\n_… {len(primaries) - 40} more RCT primaries in DB, not scored this run_\n")
        lines.append("")

        if syntheses:
            lines.append(f"### Syntheses in store (up to 15 of {len(syntheses)})\n")
            lines.append("| Canonical ID | Author year | Design rank | Title | Links |")
            lines.append("|---|---|---:|---|---|")
            for s in syntheses[:15]:
                lines.append(_fmt_study_row(s))
            lines.append("")

        def synthetic_extraction(record: dict) -> dict:
            return {
                "S3": {"n_randomised": 100, "population_axes": axes},
                "S4": {
                    "item1_randomisation_method": 1, "item2_double_blind_placebo": 1,
                    "item3_prospective_registration": None,
                    "item4_outcome_matches_registry": None,
                    "item5_attrition_ok": None, "item6_itt": 1,
                },
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
            reg = (store.registry_facts(p["registration_id"])
                   if p.get("registration_id") else None)
            extractions.append({
                "record": rec, "registry": reg,
                "extraction": synthetic_extraction(p),
            })

        rows = build_ecus(extractions, product, prompt_version=SYNTHETIC_VERSION)

        lines.append("## ECU scores (OUTPUT)\n")
        for row in sorted(rows, key=lambda r: -(r["score"] if r["score"] is not None else -999)):
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            label = o.get("label", row["outcome_vocab_id"])
            score = row["score"]
            score_s = "gated (null)" if score is None else f"**{score:+d}**"
            lines += [
                f"### {label}\n",
                "| | |", "|---|---|",
                f"| **Score** | {score_s} |",
                f"| **Band** | {row['band']} |",
                f"| Gate fired | {row.get('gate_fired')} |",
                f"| ECU key | `{row['ecu_key']}` |",
                f"| Primaries in bucket | {row['evidence']['n_primaries']} |",
                f"| Syntheses (multiplier) | {row['evidence']['n_syntheses']} |",
                f"| Flags | {', '.join(row.get('flags') or []) or '—'} |",
                f"| Prompt version | `{row['provenance']['prompt_version']}` |",
                f"| Scorer version | `{row['provenance'].get('scorer_version')}` |",
                f"| Computed at | {row['provenance']['computed_at']} |",
                "",
            ]
            comp = row.get("components") or {}
            if comp:
                lines += [
                    "#### Score components\n",
                    "| Symbol | Value | Plain meaning |",
                    "|---|---:|---|",
                    f"| d | {comp.get('d', '—')} | Direction of evidence |",
                    f"| c | {comp.get('c', '—')} | Confidence from mass |",
                    f"| H | {comp.get('H', '—')} | Disagreement |",
                    f"| E | {comp.get('E', '—')} | Total primary weight |",
                    f"| E′ | {comp.get('E_prime', '—')} | After bounded SR lift |",
                    f"| coverage | {comp.get('coverage', '—')} | SR overlap |",
                    "",
                ]
            lines += [
                "#### Studies that fed this ECU\n",
                "| Study | w | s | form | dose | pop | funding | OA | n | Links |",
                "|---|---:|---:|---|---|---|---|---|---:|---|",
            ]
            for item in extractions:
                for outcome_id, study in to_studies(
                    item["record"], item["extraction"], product, item.get("registry")
                ):
                    if outcome_id != row["outcome_vocab_id"]:
                        continue
                    if study.id not in row["evidence"]["study_ids"]:
                        continue
                    meta = next((x for x in studies if x.get("canonical_id") == study.id), {})
                    links = ", ".join(_study_links(meta)) or "—"
                    lines.append(
                        f"| `{study.id}` | {study.weight():.4f} | {study.s_value():+.2f} | "
                        f"{study.form_match} | {study.dose_match} | {study.pop_match} | "
                        f"{study.funding} | {study.oa} | {study.n} | {links} |"
                    )
            lines.append("")

        for row in rows:
            store.upsert_ecu(row)

    return "\n".join(lines)


def _pilot_db_sections() -> str:
    from pipeline.storage import Store

    blocks = ["## Pilot databases (subscription — NOT production)\n"]
    if not OUT.exists():
        blocks.append("_None on this machine._\n")
        return "\n".join(blocks)
    found = list(sorted(OUT.glob("pilot*.sqlite")))
    if not found:
        blocks.append("_No `out/pilot*.sqlite` files._\n")
        return "\n".join(blocks)
    blocks.append("> Real model rows may be here. **Not** public brand scores.\n")
    for db in found:
        blocks.append(f"### `{db.name}`\n")
        try:
            with Store(db) as store:
                c = store.counts()
                blocks.append(
                    f"Studies={c['studies']}, syntheses={c['syntheses']}, "
                    f"ECUs={c['ecus']}, registry={c['registry_facts']}\n"
                )
                rows = store.conn.execute(
                    "SELECT ecu_key, outcome_vocab_id, score, band, n_primaries, "
                    "n_syntheses, d, c, h, e, e_prime, prompt_version, computed_at "
                    "FROM ecu ORDER BY score DESC"
                ).fetchall()
                if not rows:
                    blocks.append("_No ECU rows._\n")
                    continue
                blocks += [
                    "| Outcome | Score | Band | n_pri | n_syn | d | c | H | E | E′ | prompt | when |",
                    "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
                ]
                for r in rows:
                    key, oc, score, band, np_, ns, d, c, h, e, ep, pv, when = r
                    sc = "gated" if score is None else score
                    blocks.append(
                        f"| {oc} | {sc} | {band} | {np_} | {ns} | {d} | {c} | {h} | {e} | {ep} | `{pv}` | {when} |"
                    )
                blocks.append("")
        except Exception as ex:
            blocks.append(f"**Error reading {db.name}:** `{ex}`\n")
    return "\n".join(blocks)


def _update_index(run_rel: str, meta: dict) -> None:
    """Prepend a row to reports/INDEX.md."""
    index = REPORTS / "INDEX.md"
    header = (
        "# Report runs index\n\n"
        "Every demo / selftest / wiring audit kept under `reports/runs/`.\n\n"
        "| When (UTC) | Mode | Ingredient | Form | Selftest | File |\n"
        "|---|---|---|---|---|---|\n"
    )
    row = (
        f"| {meta['when']} | {meta['mode']} | `{meta['ingredient']}` | "
        f"`{meta['form']}` | {meta['selftest']} | [{run_rel}]({run_rel}) |\n"
    )
    if index.exists():
        text = index.read_text(encoding="utf-8")
        if "| When (UTC) |" in text:
            # Insert after header separator line
            parts = text.splitlines(keepends=True)
            out = []
            inserted = False
            for i, line in enumerate(parts):
                out.append(line)
                if (not inserted) and line.startswith("|---"):
                    out.append(row)
                    inserted = True
            if not inserted:
                out.append(row)
            index.write_text("".join(out), encoding="utf-8")
            return
    index.write_text(header + row, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wiring", action="store_true",
                    help="Full synthetic end-to-end audit (recommended)")
    ap.add_argument("--ingredient", default="magnesium")
    ap.add_argument("--form", default="magnesium_glycinate")
    args = ap.parse_args()

    REPORTS.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(parents=True, exist_ok=True)

    ok, selftest_out = _run_selftest()
    st_tail = "\n".join(selftest_out.strip().splitlines()[-100:])
    mode = "wiring" if args.wiring else "selftest-only"

    parts = [
        f"# BS-PROOF full demo / audit report\n",
        f"Generated: **{_now()}**\n",
        f"Mode: **{mode}** · Ingredient: `{args.ingredient}` · Form: `{args.form}`\n",
        _explain_formula(),
        "## Deterministic selftest\n",
        f"Status: **{'ALL PASSED' if ok else 'FAILED'}**\n",
        "Command: `python3 -m pipeline.selftest`\n",
        "<details><summary>Selftest output (tail)</summary>\n",
        "```text", st_tail, "```", "</details>\n",
    ]

    if args.wiring:
        try:
            parts.append(_wiring_full_report(args.ingredient, args.form))
        except Exception as e:
            parts.append(f"## Wiring report failed\n\n`{type(e).__name__}: {e}`\n")
    else:
        parts.append(
            "## Wiring / full score audit\n\n"
            "_Not run. Use `--wiring` for corpus + study links + score math._\n"
        )

    parts.append(_pilot_db_sections())
    parts.append(
        "\n---\n\n## Labels\n\n"
        "| Label | Meaning |\n|-------|--------|\n"
        "| SYNTHETIC | Fake extractions — plumbing only |\n"
        "| PILOT | Subscription model — not public claims |\n"
        "| gated | Sufficiency gate — no number |\n"
        "| Production | `--bare` + API key only |\n"
    )

    body = "\n".join(parts)
    fname = (
        f"{_stamp()}_{_slug(args.ingredient)}_{_slug(args.form)}_{mode}.md"
    )
    run_path = RUNS / fname
    run_path.write_text(body, encoding="utf-8")
    latest = REPORTS / "latest.md"
    latest.write_text(body, encoding="utf-8")

    rel = f"runs/{fname}"
    _update_index(rel, {
        "when": _now(),
        "mode": mode,
        "ingredient": args.ingredient,
        "form": args.form,
        "selftest": "PASS" if ok else "FAIL",
    })

    print(f"Wrote reports/{rel}")
    print(f"Wrote reports/latest.md (same content)")
    print(f"Updated reports/INDEX.md (selftest={'PASS' if ok else 'FAIL'})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
