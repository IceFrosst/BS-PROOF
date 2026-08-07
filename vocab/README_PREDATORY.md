# Predatory journal list (founder)

**Source:** `The Predatory Journals List 2025.xlsx`  
**Site:** https://www.predatoryjournals.org/the-list/publishers

## Install on Windows (once)

Copy the Excel file into the repo vocab folder:

```cmd
copy "C:\path\to\The Predatory Journals List 2025.xlsx" C:\Users\Ignas\BS-PROOF\vocab\
```

Or convert to text:

```cmd
cd C:\Users\Ignas\BS-PROOF
pip install openpyxl
python scripts\import_predatory_xlsx.py
```

## Policy (2026-08-07)

- **Flag + count only** in each run console: how many studies in *this batch* matched.
- **Does not change the score** yet (`pipeline.predatory.ZERO_WEIGHT = False`).
- Later we can set `ZERO_WEIGHT = True` to zero those weights.
