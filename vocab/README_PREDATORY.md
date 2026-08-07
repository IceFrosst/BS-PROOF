# Predatory journal list (founder)

**Source:** The Predatory Journals List 2025  
**Site:** https://www.predatoryjournals.org/the-list/publishers

## After `git pull` (preferred)

The list is embedded as compressed chunks under `pipeline/predatory_b64/`.
On first import of `pipeline.predatory` it expands automatically to
`vocab/predatory_journals.txt`. **No download, no extra command.**

## One-time fallback (only if expand fails)

If the b64 chunks are incomplete, copy the founder xlsx once:

```cmd
copy "path\to\The Predatory Journals List 2025.xlsx" vocab\
```

Then either run the pipeline (it will auto-expand) or:

```cmd
pip install openpyxl
python scripts\import_predatory_xlsx.py
```

## Policy (2026-08-07)

- **Flag + count only** in each run console: how many studies in *this batch* matched.
- **Does not change the score** yet (`pipeline.predatory.ZERO_WEIGHT = False`).
- Later we can set `ZERO_WEIGHT = True` to zero those weights.
