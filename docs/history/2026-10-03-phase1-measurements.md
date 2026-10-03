# Evidence method v2 — Phase 1 measurements (2026-10-03)

Phase 1 of `docs/EVIDENCE_METHOD.md` §8: measure before changing anything.
Corpus: the retained creatine run `20260904_185830` (156 studies, 155 extracted).

## 1a. Poolability — DONE

Script: `scripts/experiments/poolability.py` (no model calls; part 2 uses the
free Europe PMC search + full-text services).

### What the CURRENT extractor captured (per mapped claim)

200 claims mapped to an outcome; 165 compare against an ingredient-free control.

| Tier | Claims | Poolable? |
|---|---|---|
| A — signed effect + 95% CI | 23 | yes |
| B — signed standardised effect + exact p | 1 | yes |
| C — raw difference + SD + n | 7 | yes |
| D — standardised effect + total n only | 3 | only by assuming equal arms |
| E — signed effect, no variance | 57 | no |
| no signed effect (unsigned, "neither", missing) | 74 | no |
| not a between-arm contrast | 35 | no (by design) |

Per outcome, trials with at least one poolable claim:

| Outcome | Trials with a mapped controlled contrast | Poolable now |
|---|---|---|
| muscle_strength | 37 | 10 (27%) |
| muscle_power | 32 | 4 (13%) |
| lean_body_mass | 25 | 6 (24%) |
| exercise_endurance | 19 | 1 (5%) |
| energy_levels | 2 | 1 |

### What is IN THE PAPERS (deterministic scan)

| Text available | Studies | Arm-level mean ± SD/SEM or a CI | Exact p | Only "p < x" |
|---|---|---|---|---|
| PMC full text | 85 | **79 (93%)** | 66 | 15 |
| Abstract only | 52 | 28 (54%) | 19 | 10 |
| Unreadable (Europe PMC HTTP 500 on that article) | 18 | — | — | — |

### Conclusion

**The numbers needed for meta-analysis are mostly in the papers; the current
extractor does not capture them.** It extracts one summary effect per claim and
was never asked for per-arm means, SDs and group sizes. The v2 arm-level
extractor (Phase 2) should lift full-text trials from ~13–27% poolable towards
the ~90% the papers support. Abstract-only trials stay weak (~54% at best) —
another reason the method relies on full text.

Limits: the scan is a regex heuristic — a "mean ± SD" in a table may be a
baseline characteristic rather than an outcome, so it over-counts; papers whose
only full text is a PDF/HTML outside PMC were not scanned; 18 articles returned
server errors on every attempt.

## 1b. Extraction stability — harness READY, full run pending

Script: `scripts/experiments/extraction_stability.py`. Extracts the same 25
open-access creatine studies twice (selected deterministically, round-robin
across outcomes), each run with its own empty LLM cache, then compares every
field (agreement and Cohen's kappa), the outcome mapping (Jaccard), per-agent
failure rates, and the resulting scores. Unit tests:
`tests/test_extraction_stability.py`.

**Live smoke (1 study, both runs, 2026-10-03):** the production Claude path works
on this machine (~50 s per study). Even on one paper the runs differed: the S7
agent failed with `max_turns` in run B; one lean-body-mass claim flipped
"unclear" → "null_effect"; study duration, funding class and one p-value
disagreed. One study is not a measurement — the 25-study run is.

**To run (≈ 500 model calls, ~20–25 min per run, on the Claude subscription —
run SOLO, with no other Claude session or extraction active):**

```bash
.venv/bin/python scripts/experiments/extraction_stability.py run --label A
.venv/bin/python scripts/experiments/extraction_stability.py run --label B
.venv/bin/python scripts/experiments/extraction_stability.py compare A B --out out/stability/A_vs_B.json
```
