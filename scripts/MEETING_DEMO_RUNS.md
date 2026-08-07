# Meeting demo — two big Grok runs

**Goal:** results you can put on a slide today.  
**Honest constraint:** “conclusive” needs **form match + usable text**, not only large N (SPEC 13).

| Run | Product | Why | Expectation |
|-----|---------|-----|-------------|
| **A (show)** | Creatine monohydrate | Most trials *are* monohydrate → form weights stay high; muscle outcomes are the strong anchor | Best chance of scores leaving “inconclusive” |
| **B (honest Mg)** | Magnesium glycinate | Harder literature; IV/oxide noise | May stay grey under production rules |
| **B′ (optional slide)** | Magnesium + `--demo` | Exact-form only + pop off | Cleaner numbers for “how the product works” — **watermark DEMO** |

Use **Grok**, not Claude pilot (quota burns large batches).

---

## 0. Once on the Windows machine

```cmd
cd C:\Users\Ignas\BS-PROOF
git pull

set PYTHONUTF8=1
set SP_GROK_CONCURRENCY=48
set SP_GROK_STUDIES_IN_FLIGHT=32
set SP_MAX_SRS=12
```

Optional: wipe cache only if you need a fully live re-extract (slower):

```cmd
del /q out\grok_llm_cache.sqlite
```

Smoke (2 minutes):

```cmd
python -c "import grok_adapter as g; assert g.preflight()"
```

---

## Run A — CREATINE (do this first; this is the meeting headline)

```cmd
cd C:\Users\Ignas\BS-PROOF
git pull
set PYTHONUTF8=1
set SP_GROK_CONCURRENCY=48
set SP_GROK_STUDIES_IN_FLIGHT=32
set SP_MAX_SRS=12

python run_pipeline.py creatine --form creatine_monohydrate --supplement-scope --grok --with-sr --limit 100
```

**Watch for:**

- `form transfer mix` → high **exact** %%
- ECU rows for **muscle strength / power / lean mass** with band ≠ inconclusive
- `Pushed reports/` or manual push if git fails
- Donut lines if printed

**Slide line:** “Creatine monohydrate → muscle outcomes, real Grok pure-function extraction + capped SR boost.”

---

## Run B — MAGNESIUM (production rules)

```cmd
python run_pipeline.py magnesium --form magnesium_glycinate --grok --with-sr --limit 100
```

**Watch for:** form mix (expect many `different` / `unspecified`). Scores may stay inconclusive — that is the ceiling, not a failed demo. Use it to **teach SPEC 13**.

---

## Run B′ — MAGNESIUM demo mode (only if you need a greener slide)

```cmd
python run_pipeline.py magnesium --form magnesium_glycinate --grok --with-sr --demo --limit 80
```

Say out loud: **“Demo flags suspend transfer rules; not a production claim.”**

---

## After each run

Reports auto-push when git identity works. If not:

```cmd
python scripts\auto_report_push.py --ingredient creatine --form creatine_monohydrate --mode grok-sr
git pull --rebase
git push
```

Open: https://github.com/IceFrosst/BS-PROOF/tree/main/reports

---

## Talking points if Mg is still grey

1. Weight of a typical abstract-only, form-unspecified trial ≈ **0.02** → confidence cannot reach “weak support” without form/full text.  
2. Creatine is the control case: same engine, better form alignment → stronger bands.  
3. Donut arcs: evidence vs form vs dose — concentric, not a pie that lets form “cancel” thin evidence.  
4. SRs only lift confidence; they never invent patients.

---

## Do NOT for the meeting

- Claude `--pilot` at n=100 (session quota).  
- Concurrency 64+ if the PC struggled.  
- Present `--demo` Mg scores as production science.  
- Compare Grok 100 vs Claude limit-5 as like-for-like.
