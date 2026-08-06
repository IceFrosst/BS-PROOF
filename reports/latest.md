# BS-PROOF full demo / audit report

Generated: **placeholder — regenerate on your machine for the full document**

```bash
cd ~/BS-PROOF && git pull
python3 scripts/write_demo_report.py --wiring
git add reports/latest.md
git commit -m "Refresh full demo audit report"
git push
```

Then open this file again on GitHub.

---

## What the full report will contain

1. **How a score is built** — formula in plain language (weights, transfer factors, d/c/H/E).
2. **Selftest** — ALL PASSED / FAILED + log tail.
3. **Product INPUT** — ingredient, form, population axes, unbanded dose.
4. **Corpus stats** — how many studies, syntheses, registry rows, RCT primaries.
5. **Study list with links** — PubMed / PMC / DOI / ClinicalTrials.gov where ids exist.
6. **Each ECU score** — number, band, gate, components table.
7. **Per-study contribution** — weight, effect direction, form/dose/pop match, funding, OA.
8. **Pilot DB summary** (only if `out/pilot*.sqlite` exists) — labelled non-production.

Until you run the command above, only this outline is in the repo. The script writes the full tables from your local corpus and (synthetic) extraction path.
