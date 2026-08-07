# Pending Claude review — 2026-08-07

Founder decisions pushed by Grok. Claude should confirm or push back before these are treated as production invariants.

## 1. Form is applicability, not a center-score penalty

**Change:** `pipeline/scoring.py` — `APPLY_FORM_IN_WEIGHT = False`.

Center score ("Does it work?") no longer multiplies `FORM_FACTOR`.
Form lives only on the **form arc** of the 3-arc donut = share of evidence that used the *exact* product form.

Rationale (founder):
> We have an actual form score. The general science score should not be penalized if the form is different.

This aligns the arithmetic with `pipeline/donut.py` commentary (effect = science; form/dose = applicability).

**Still in weight:** dose, population, RoB, size, funding, OA.

**SPEC tension:** SPEC §8 treats form as part of the transfer moat inside `w_study`. This change moves form out of `w` into a pure display/applicability axis. Claude should confirm this is intentional for product messaging, or restore form into weight.

## 2. Reports are run-scoped

`scripts/auto_report_push.py` rewritten:
- Only the current ingredient DB (no creatine rows in a magnesium report)
- Success/fail counts for the batch
- Predatory flag counts
- Study list with titles / DOI / PMID links
- SR / S2 resolution counts
- SPEED REPORT
- Per-agent ok/fail/cache
- ECU table = **this run only**

## 3. Retrieve broad, extract top-ranked

`RETRIEVE_MAX_PRIMARIES` default **600** (was 300).
Extraction still uses `--limit` on the ranked list (full-text/green OA first, then newer year).
Store size ≠ evidence mass. Makes sense for production.

## 4. Predatory still flag-only

`ZERO_WEIGHT = False`. Count in reports. Do not zero score yet.
