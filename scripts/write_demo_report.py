#!/usr/bin/env python3
"""
Write a FULL audit-trail report to reports/latest.md for viewing on GitHub.

    python3 scripts/write_demo_report.py
    python3 scripts/write_demo_report.py --wiring
    python3 scripts/write_demo_report.py --wiring --ingredient magnesium --form magnesium_glycinate

Goal: document *everything* that is reconstructible without secrets:
  product inputs, corpus size, each study with links, each ECU score, and the
  arithmetic path (weights, transfer factors, d / c / H / E) that produced it.

No API key required for selftest or --wiring. Pilot DBs are summarized only and
always labelled non-production.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

REPORTS = ROOT / "reports"
OUT = ROOT / "out"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _run_selftest() -> tuple[bool, str]:
    p = subprocess.run(
        [sys.executable, "-m", "pipeline.selftest"],
        cwd=ROOT, capture_output=True, text=True,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    return p.returncode == 0, (p.stdout or "") + (p.stderr or "")


def _study_links(s: dict) -> list[str]:
    links = []
    pmid = s.get("pmid")
    pmcid = s.get("pmcid")
    doi = s.get("doi")
    nct = s.get("registration_id")
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
    title = (s.get("title") or "(no title)")[:120]
    year = s.get("year") or "?"
    author = s.get("first_author") or "?"
    rank = s.get("design_rank")
    oa = s.get("oa") or "?"
    links = ", ".join(_study_links(s)) or "_no identifiers_"
    cid = s.get("canonical_id") or s.get("_canonical") or "?"
    return (
        f"| `{cid}` | {author} {year} | {rank} | {oa} | {title.replace('|', '/')} | {links} |"
    )


def _explain_formula() -> str:
    return """
## How a score is built (the recipe)

This is the deterministic path in `pipeline/scoring.py` + `pipeline/assemble.py`.
**No model decides the number** — models only extract fields; arithmetic scores.

```text
1. For each unique primary study that maps to this ECU outcome:
     weight w = design × RoB × size × funding × OA × form_match × dose_match × pop_match
     s        = signed effect value (benefit / null / harm)

2. E       = sum of weights
   d       = weighted average of s  (direction of evidence, −1…+1-ish)
   H       = disagreement among studies (heterogeneity)
   c       = 1 − exp(−E'/k)         confidence from evidence mass
   E'      = E × (1 + 0.3 × synthesis_coverage × quality)   # bounded SR lift

3. raw_score = 100 × d × c × (1 − 0.4 × H)
   score     = clamp(round(raw), −100, +100)
   band      = label from SPEC ranges (e.g. ≥70 strong support)

4. Gate: if there is almost no human clinical weight, score = null ("gated").
```

**Transfer factor (the product moat):** if the bottle is glycinate but the trial
used oxide, `form_match` is not `exact` and the weight collapses — same papers,
different product score.

**Null results count against** the claim (`s ≈ −0.7`), not as “no data.”
"""


def _wiring_full_report(ingredient: str, form: str) -> str:
    """Run synthetic end-to-end and document inputs, studies, and every ECU."""
    from pipeline import vocab
    from pipeline.assemble import build_ecus, to_studies
    from pipeline.storage import Store, DEFAULT_DB
    from pipeline.retrieve import retrieve
    from pipeline.scoring import Study  # noqa: F401 — used via to_studies

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
    lines.append("## Product under test (INPUT)\n")
    lines.append("| Field | Value |")
    lines.append("|---|---|")
    lines.append(f"| Ingredient | `{ingredient}` |")
    lines.append(f"| Form (bottle) | `{form}` |")
    lines.append(f"| Population | `{pv['id']}` |")
    for a in vocab.AXES:
        lines.append(f"| · {a} | `{pv[a]}` |")
    lines.append(f"| Dose band | _unbanded_ (band_version 0 — dose axis not live) |")
    lines.append(f"| Prompt / provenance | `{SYNTHETIC_VERSION}` |")
    lines.append("")
    lines.append(
        "> **SYNTHETIC MODE:** extractions are fixed fakes. Numbers prove the "
        "plumbing. They do **not** describe real efficacy of this ingredient.\n"
    )

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

        lines.append("## Corpus (what entered the machine)\n")
        lines.append("| Metric | Count |")
        lines.append("|---|---:|")
        lines.append(f"| All study rows | {counts['studies']} |")
        lines.append(f"| Syntheses (reviews) | {counts['syntheses']} |")
        lines.append(f"| Registry fact records | {counts['registry_facts']} |")
        lines.append(f"| Unclassified (would need S1) | {counts['unclassified']} |")
        lines.append(f"| RCT-rank primaries (design_rank=4) | {len(primaries)} |")
        lines.append(f"| Database file | `{WIRING_DB.name}` |")
        lines.append("")

        # Cap table size for a readable GitHub page; full list still in DB.
        show = primaries[:40]
        lines.append(f"### Primary studies used for this demo (up to 40 of {len(primaries)})\n")
        lines.append("| Canonical ID | Author year | Design rank | OA tier | Title | Links |")
        lines.append("|---|---|---:|---|---|---|")
        for s in show:
            lines.append(_fmt_study_row(s))
        if len(primaries) > 40:
            lines.append(f"\n_… {len(primaries) - 40} more primaries in `{WIRING_DB.name}`_\n")
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
                    "item1_randomisation_method": 1,
                    "item2_double_blind_placebo": 1,
                    "item3_prospective_registration": None,
                    "item4_outcome_matches_registry": None,
                    "item5_attrition_ok": None,
                    "item6_itt": 1,
                },
                "S7": {"form_vocab_id": None},  # unspecified → transfer penalty
                "S8": {"funding_class": "undisclosed"},
                "outcomes": [
                    {"claim": {"direction": "benefit", "magnitude": None},
                     "outcome_vocab_id": "sleep_onset", "discarded": False},
                    {"claim": {"direction": "null_effect", "magnitude": None},
                     "outcome_vocab_id": "anxiety", "discarded": False},
                ],
            }

        extractions = []
        for p in primaries[:40]:
            rec = {**p, "_canonical": p["canonical_id"], "ingredient": ingredient}
            reg = (store.registry_facts(p["registration_id"])
                   if p.get("registration_id") else None)
            extractions.append({
                "record": rec,
                "registry": reg,
                "extraction": synthetic_extraction(p),
            })

        rows = build_ecus(extractions, product, prompt_version=SYNTHETIC_VERSION)

        lines.append("## ECU scores (OUTPUT)\n")
        lines.append(
            "One row per (ingredient × form × dose_band × outcome × population). "
            "Below: the number, then the components, then every contributing study.\n"
        )

        for row in sorted(rows, key=lambda r: -(r["score"] if r["score"] is not None else -999)):
            o = vocab.outcome(row["outcome_vocab_id"]) or {}
            label = o.get("label", row["outcome_vocab_id"])
            score = row["score"]
            score_s = "gated (null)" if score is None else f"**{score:+d}**"
            lines.append(f"### {label}\n")
            lines.append("| | |")
            lines.append("|---|---|")
            lines.append(f"| **Score** | {score_s} |")
            lines.append(f"| **Band** | {row['band']} |")
            lines.append(f"| Gate fired | {row.get('gate_fired')} |")
            lines.append(f"| ECU key | `{row['ecu_key']}` |")
            lines.append(f"| Primaries in bucket | {row['evidence']['n_primaries']} |")
            lines.append(f"| Syntheses (multiplier only) | {row['evidence']['n_syntheses']} |")
            lines.append(f"| Flags (shown, not double-counted) | {', '.join(row.get('flags') or []) or '—'} |")
            lines.append(f"| Prompt version | `{row['provenance']['prompt_version']}` |")
            lines.append(f"| Scorer version | `{row['provenance'].get('scorer_version')}` |")
            lines.append(f"| Computed at | {row['provenance']['computed_at']} |")
            lines.append("")

            comp = row.get("components") or {}
            if comp:
                lines.append("#### Score components\n")
                lines.append("| Symbol | Value | Plain meaning |")
                lines.append("|---|---:|---|")
                lines.append(f"| d | {comp.get('d', '—')} | Direction of evidence (weighted) |")
                lines.append(f"| c | {comp.get('c', '—')} | Confidence from evidence mass |")
                lines.append(f"| H | {comp.get('H', '—')} | Disagreement across studies |")
                lines.append(f"| E | {comp.get('E', '—')} | Total primary weight |")
                lines.append(f"| E′ | {comp.get('E_prime', '—')} | Weight after bounded SR lift |")
                lines.append(f"| coverage | {comp.get('coverage', '—')} | SR overlap with primaries |")
                lines.append("")

            lines.append("#### Studies that fed this ECU\n")
            lines.append(
                "| Study | w (weight) | s (effect) | form | dose | pop | funding | OA | n | Links |"
            )
            lines.append("|---|---:|---:|---|---|---|---|---|---:|---|")

            # Rebuild Study objects for this outcome to expose the audit numbers.
            for item in extractions:
                pairs = to_studies(
                    item["record"], item["extraction"], product, item.get("registry")
                )
                for outcome_id, study in pairs:
                    if outcome_id != row["outcome_vocab_id"]:
                        continue
                    if study.id not in row["evidence"]["study_ids"]:
                        continue
                    meta = next(
                        (x for x in studies if x.get("canonical_id") == study.id),
                        {},
                    )
                    links = ", ".join(_study_links(meta)) or "—"
                    lines.append(
                        f"| `{study.id}` | {study.weight():.4f} | {study.s_value():+.2f} | "
                        f"{study.form_match} | {study.dose_match} | {study.pop_match} | "
                        f"{study.funding} | {study.oa} | {study.n} | {links} |"
                    )
            lines.append("")

        # Persist so sqlite also matches the report
        for row in rows:
            store.upsert_ecu(row)

    return "\n".join(lines)


def _pilot_db_sections() -> str:
    from pipeline.storage import Store

    if not OUT.exists():
        return "## Pilot databases\n\n_None on this machine._\n"

    blocks = ["## Pilot databases (subscription path — NOT production)\n"]
    found = list(sorted(OUT.glob("pilot*.sqlite")))
    if not found:
        blocks.append("_No `out/pilot*.sqlite` files found._\n")
        return "\n".join(blocks)

    blocks.append(
        "> Real model extractions may live here. **Do not** treat as public "
        "brand scores. Reproducibility is weaker than `--bare` production.\n"
    )

    for db in found:
        blocks.append(f"### `{db.name}`\n")
        try:
            with Store(db) as store:
                c = store.counts()
                blocks.append(
                    f"Studies={c['studies']}, syntheses={c['syntheses']}, "
                    f"ECUs={c['ecus']}, registry={c['registry_facts']}\n"
                )
                # ECUs
                rows = store.conn.execute(
                    "SELECT ecu_key, outcome_vocab_id, score, band, n_primaries, "
                    "n_syntheses, d, c, h, e, e_prime, prompt_version, computed_at "
                    "FROM ecu ORDER BY score DESC NULLS LAST"
                ).fetchall()
                if not rows:
                    blocks.append("_No ECU rows._\n")
                    continue
                blocks.append(
                    "| Outcome | Score | Band | n_pri | n_syn | d | c | H | E | E′ | prompt | when |"
                )
                blocks.append("|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|")
                for r in rows:
                    (key, oc, score, band, np_, ns, d, c, h, e, ep, pv, when) = r
                    sc = "gated" if score is None else score
                    blocks.append(
                        f"| {oc} | {sc} | {band} | {np_} | {ns} | {d} | {c} | {h} | {e} | {ep} | `{pv}` | {when} |"
                    )
                blocks.append("")
                # Evidence + study links for first few ECUs
                for r in rows[:5]:
                    key = r[0]
                    blocks.append(f"#### Evidence trail for `{key}`\n")
                    ev = store.evidence_for(key)
                    if not ev:
                        # Fall back: list n_primaries from ecu only
                        blocks.append(
                            "_No `ecu_evidence` rows stored for this key "
                            "(older runs may not have written the audit join)._\n"
                        )
                        continue
                    blocks.append(
                        "| Study | role | w | s | transfer | form | dose | pop | Links |"
                    )
                    blocks.append("|---|---|---:|---:|---:|---|---|---|---|")
                    for e in ev:
                        st = store.conn.execute(
                            "SELECT * FROM study WHERE canonical_id = ?",
                            (e["canonical_id"],),
                        ).fetchone()
                        meta = dict(st) if st else {}
                        links = ", ".join(_study_links(meta)) or "—"
                        blocks.append(
                            f"| `{e['canonical_id']}` | {e.get('role')} | "
                            f"{e.get('w_study')} | {e.get('s_value')} | "
                            f"{e.get('transfer_factor')} | {e.get('form_match')} | "
                            f"{e.get('dose_match')} | {e.get('pop_match')} | {links} |"
                        )
                    blocks.append("")
        except Exception as ex:
            blocks.append(f"**Error reading {db.name}:** `{ex}`\n")
    return "\n".join(blocks)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wiring", action="store_true",
                    help="Full synthetic end-to-end audit (recommended)")
    ap.add_argument("--ingredient", default="magnesium")
    ap.add_argument("--form", default="magnesium_glycinate")
    args = ap.parse_args()

    REPORTS.mkdir(parents=True, exist_ok=True)
    ok, selftest_out = _run_selftest()
    st_tail = "\n".join(selftest_out.strip().splitlines()[-100:])

    parts = [
        f"# BS-PROOF full demo / audit report\n",
        f"Generated: **{_now()}**\n",
        f"Regenerate: `python3 scripts/write_demo_report.py`"
        + (" `--wiring`" if args.wiring else "") + "\n",
        _explain_formula(),
        "## Deterministic selftest\n",
        f"Status: **{'ALL PASSED' if ok else 'FAILED'}**\n",
        "Command: `python3 -m pipeline.selftest`\n",
        "<details><summary>Selftest output (tail)</summary>\n",
        "```text",
        st_tail,
        "```",
        "</details>\n",
    ]

    if args.wiring:
        try:
            parts.append(_wiring_full_report(args.ingredient, args.form))
        except Exception as e:
            parts.append(f"## Wiring report failed\n\n`{type(e).__name__}: {e}`\n")
    else:
        parts.append(
            "## Wiring / full score audit\n\n"
            "_Not run. Re-run with `--wiring` to embed product inputs, study "
            "tables with links, and per-ECU score decomposition._\n"
        )

    parts.append(_pilot_db_sections())
    parts.append(
        "\n---\n\n## Labels\n\n"
        "| Label | Meaning |\n"
        "|-------|--------|\n"
        "| SYNTHETIC | Fake extractions — plumbing only |\n"
        "| PILOT | Subscription model output — not public claims |\n"
        "| gated | Sufficiency gate — no number |\n"
        "| Production | `--bare` + API key only |\n"
    )

    path = REPORTS / "latest.md"
    path.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {path.relative_to(ROOT)} (selftest={'PASS' if ok else 'FAIL'})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
