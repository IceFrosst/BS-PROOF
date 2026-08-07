# Pending Claude review — 2026-08-07

Founder decisions pushed by Grok. Claude should confirm or push back before these are treated as production invariants.

## 1. Form is applicability, not a center-score penalty

**Change:** `pipeline/scoring.py` — `APPLY_FORM_IN_WEIGHT = False`.

Center score ("Does it work?") no longer multiplies `FORM_FACTOR`.
Form lives only on the **form arc** of the 3-arc donut = share of evidence that used the *exact* product form.

Rationale (founder):
> We have an actual form score. The general science score should not be penalized if the form is different.

This aligns the arithmetic with `pipeline/donut.py` commentary (effect = science; form/dose = applicability).

**Still in weight:** dose, population, RoB, size, funding, OA (dose/pop currently also OFF via flags).

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
Full `vocab/predatory_journals.txt` restored (was PLACEHOLDER → 0 entries in reports).

---

## 5. CRITICAL FIX 2026-08-07 — S8 model id invalid (creatine run)

**Report:** `reports/runs/20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_*`

| Stat | Value |
|------|-------|
| Targeted | 80 |
| S3–S7 | ~80 OK |
| **S8** | **0 OK / 80 FAIL** |
| Partial fails | 80 (because S8 failed every study) |
| SR resolved | 0 / 12 S2 ok |
| Predatory list entries | 0 (placeholder file — fixed this commit) |

**Root cause (S8):** default `SP_GROK_MODEL_A = "grok-4.3"` is **not a valid CLI model id**.

```
Couldn't set model 'grok-4.3': Invalid params: "unknow...
```

**Fix pushed:** all tiers default to `grok-4.5` (known-good on this machine's CLI). Preflight **blocks** if any tier still uses `grok-4.3` or a `*-*` placeholder. After `grok models`, set `SP_GROK_MODEL_A` to a verified cheaper id if desired.

**S3 status:** In *this* run S3 was **80/80 OK**. Earlier S3 truncation was fixed by `PROMPT_BUDGET_CHARS=14000` and not shipping the population vocab into S3. No further S3 prompt change required for that failure mode.

---

## 6. Why creatine scores look "horrible" (not only S8)

Even with successful extractions, muscle_strength / muscle_power landed ~22–32 ("does not work" / "probably does not work"). That is **not** what the sports-nutrition literature says about creatine monohydrate.

Likely stacked causes (Claude should prioritise):

1. **Retrieval mix** — top-N recent OA hits include many *disease* trials (Parkinson, Huntington, arsenic methylation, HIV, cancer anorexia, CK with atorvastatin) where creatine is a drug candidate and often null. Those nulls (`s = -0.7`) dominate direction `d` when mixed with sparse meaningful benefits.

2. **null_effect = -0.7 is harsh** when many trials are null on *non-consumer* endpoints that still map via S6 into `muscle_strength` / related ids.

3. **Magnitude default** — benefit with magnitude unstated → trivial (+0.3), so weak positives cannot outweigh a few nulls.

4. **S6 mapping risk** — disease motor scores / biomarkers may be mapping into consumer muscle outcomes (silent, unrecoverable).

5. **SR multiplier dead** — 12 S2 ok, **0 resolved** → no confidence lift from metas that would usually support creatine for strength.

6. **S8 missing** — funding defaulted to `undisclosed` (0.80). Secondary; does not invert the science sign by itself.

**Suggested next product steps (not done in this patch):**
- Stricter retrieval / relevance for *consumer supplement* claims vs disease-drug trials (or separate claim scopes).
- Audit a sample of S5 directions + S6 mappings on the 24 muscle_strength studies in this run.
- Fix SR resolution join keys so metas actually resolve.
- Re-run creatine after S8 model fix + clear Grok cache for S8 keys.

Claude: confirm or reject the model default, the score diagnosis, and whether retrieval filtering belongs in relevance.py vs a new claim-scope flag.
