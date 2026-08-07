# Pending Claude review — 2026-08-07

Founder decisions pushed by Grok. Claude should confirm or push back before these are treated as production invariants.

## 1. Form is applicability, not a center-score penalty

**Change:** `pipeline/scoring.py` — `APPLY_FORM_IN_WEIGHT = False`.

Center score ("Does it work?") no longer multiplies `FORM_FACTOR`.
Form lives only on the **form arc** of the 3-arc donut = share of evidence that used the *exact* product form.

Rationale (founder):
> We have an actual form score. The general science score should not be penalized if the form is different.

**SPEC tension:** SPEC §8 treats form as part of the transfer moat inside `w_study`. Claude should confirm or restore form into weight.

## 2. Reports are run-scoped

`scripts/auto_report_push.py` — this-run-only reports.

## 3. Retrieve broad, extract top-ranked

`RETRIEVE_MAX_PRIMARIES` default **600**.

## 4. Predatory still flag-only

`ZERO_WEIGHT = False`.

**Note:** `pipeline/predatory_b64/` was accidentally truncated during a fix attempt. Restore founder list to `vocab/predatory_journals.txt` (or re-chunk b64) before trusting predatory counts.

---

## 5. CRITICAL FIX — S8 model id invalid (creatine run 2026-08-07)

**Report:** `reports/runs/20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_*`

| Stat | Value |
|------|-------|
| Targeted | 80 |
| S3–S7 | ~80 OK |
| **S8** | **0 OK / 80 FAIL** |
| Partial fails | 80 (all from S8) |
| SR resolved | 0 / 12 S2 ok |

**Root cause:** default `SP_GROK_MODEL_A = "grok-4.3"` is **not a valid CLI model id**.

```
Couldn't set model 'grok-4.3': Invalid params: "unknow...
```

**Fix on main:** all Grok tiers default to `grok-4.5`. Preflight blocks placeholder/invalid ids.

**S3 status:** This run S3 was **80/80 OK**. Earlier truncation fixed by `PROMPT_BUDGET_CHARS=14000` + not shipping population vocab into S3. No further S3 change required for that failure mode.

---

## 6. Why creatine scores look "horrible"

muscle_strength / muscle_power ~22–32 ("does not work") — **not** what sports-nutrition literature says about creatine monohydrate.

Stacked causes for Claude:

1. **Retrieval mix** — recent OA top-N includes many *disease* trials (Parkinson, Huntington, arsenic, HIV, cancer) where creatine is often null (`s = -0.7`).
2. **null_effect = -0.7 is harsh** when those nulls map into consumer muscle outcomes via S6.
3. **Magnitude default** — unstated benefit → trivial (+0.3).
4. **S6 mapping risk** — disease endpoints → consumer ids (silent).
5. **SR multiplier dead** — 12 S2 ok, 0 resolved.
6. **S8 missing** — funding defaulted undisclosed (secondary).

**Next steps (not in this patch):** claim-scope filter vs disease-drug trials; audit S5/S6 on muscle_strength rows; fix SR join keys; restore predatory list; re-run creatine after S8 fix + cache clear.
