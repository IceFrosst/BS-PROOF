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

## 5. CRITICAL FIX — S8 model id invalid (creatine run 2026-08-07) — DONE

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

**Action for next run:** `git pull`, delete/clear `out/grok_llm_cache.sqlite` so S8 is not served from empty fails, re-run creatine.

---

## 6. Why creatine scores look "horrible"

muscle_strength / muscle_power ~22–32 ("does not work") — **not** what sports-nutrition literature says about creatine monohydrate.

Stacked causes for Claude:

1. **Retrieval mix** — recent OA top-N includes many *disease* trials (Parkinson, Huntington, arsenic, HIV, cancer) where creatine is often null (`s = -0.7`).
2. **null_effect = -0.7 is harsh** when those nulls map into consumer muscle outcomes via S6.
3. **Magnitude default** — unstated benefit → trivial (+0.3).
4. **S6 mapping risk** — disease endpoints → consumer ids (silent).
5. **SR multiplier dead** — 12 S2 ok, 0 resolved (see §7).
6. **S8 missing** — funding defaulted undisclosed (secondary; fixed in §5).

**Still open (not this patch):** claim-scope filter vs disease-drug trials; audit S5/S6 on muscle_strength rows; restore predatory list.

---

## 7. SR resolution path — FIXED (pending Claude confirm)

**Problem:** creatine `--with-sr` had S2 ok=12, **resolved=0**. Confidence multiplier never fired.

**Causes:**
- Characteristics tables name trials as `"Smith 2019"` with empty `first_author`/`year` fields; only `label` was filled.
- `MIN_RESOLVED_FRACTION = 0.5` was too high when extract batch is ~80 of hundreds of RCTs.
- S2 full text was not budget-capped (could truncate mid-table).

**Changes (`pipeline/synthesis.py`, `synthesis_bridge.py`):**
1. Parse author+year from **label** (`Smith 2019`, `Smith et al. 2019`).
2. `MIN_RESOLVED_FRACTION` **0.5 → 0.25**, plus `MIN_RESOLVED_COUNT = 2`.
3. S2 text trimmed to same `SP_PROMPT_BUDGET` wall as per-study agents.
4. Print why each SR failed resolve (sample unresolved labels).

Still fails under-count when we cannot place trials (SPEC §6). Claude: confirm 0.25 bar or restore 0.5.

---

## 8. S3 truncation on long full texts — HARDENED (pending Claude confirm)

**Magnesium 15:41:** S3 **42 OK / 12 FAIL** with `"schema and study input look truncated"` even after 14k budget.

**Creatine 16:44:** S3 80/80 OK (shorter texts / luck) — does **not** prove S3 was fixed.

**Changes:**
1. Default `SP_PROMPT_BUDGET` **14000 → 12000**.
2. Extra 1500-char trim reserved for S3 only (`AGENT_BUDGET_TRIM`).
3. S3 prompt shortened; removed false claim that population vocabulary is attached.
4. `PROMPT_VERSION` **v1.4 → v1.5** (cache key; forces fresh extractions).

Claude: if S3 still fails after this, next lever is abstract-only for S3 on full texts >N chars, not a higher budget.
