# Reports — full audit trail on GitHub

Open **[`latest.md`](./latest.md)** in the browser after you regenerate it.

## What is in the report (everything we can document)

| Section | Contents |
|---------|----------|
| **How a score is built** | The recipe: weights, transfer factors, d / c / H / E, gate |
| **Selftest** | Deterministic regression PASS/FAIL + log |
| **Product INPUT** | Ingredient, form (bottle), population axes, dose band status |
| **Corpus** | Study counts, syntheses, registry facts, RCT primaries |
| **Study table** | Canonical id, author/year, design rank, OA tier, title, **links** (PubMed, PMC, DOI, ClinicalTrials.gov) |
| **Each ECU OUTPUT** | Score, band, gate, ECU key, flags, prompt/scorer versions |
| **Score components** | d, c, H, E, E′, coverage with plain-language meanings |
| **Per-study audit** | weight w, effect s, form/dose/pop match, funding, OA, n, links |
| **Pilot DBs** (if present) | Separate section, labelled not-for-public-claims |

## Regenerate (on your machine)

```bash
cd ~/BS-PROOF && git pull
source .venv/bin/activate   # if used

# Full audit (selftest + synthetic end-to-end with study links + score math)
python3 scripts/write_demo_report.py --wiring

git add reports/latest.md
git commit -m "Refresh full demo audit report"
git push
```

View: https://github.com/IceFrosst/BS-PROOF/blob/main/reports/latest.md

`--wiring` uses **SYNTHETIC** extractions (same fixed fake fields for every study).
That still documents the *whole path* and real corpus/links; it does not claim
real efficacy. For pilot model rows, run `--pilot` separately, then re-run the
report script so `out/pilot*.sqlite` is summarized.

## What stays out of GitHub

| Do not commit |
|----------------|
| API keys / OAuth tokens |
| Full paper PDFs / copyrighted full text dumps |
| Unlabelled “this brand scores X” marketing claims from pilot mode |

## CI

Every push runs `pipeline.selftest`. See **Actions → selftest → Artifacts → selftest-log**.
