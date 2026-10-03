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

**Caveat found in Phase 2 (same day):** the S5 schema already asks for per-arm
n / mean / SD on every claim, but the retained run's per-study record DROPPED
those fields, so this table only sees the summary-effect route and understates
what the extractor captures. The record now keeps them (`bsproof/run/extract.py`);
re-measure after the next extraction.

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

### 1b result so far (2026-10-03)

Run A completed 25/25; run B hit the subscription session limit midway (91
calls failed with "You've hit your session limit"), so the A-vs-B comparison
(`out/stability/A_vs_B.json`, 5 clean study pairs) is NOT a valid measurement.
Indicative only: comparator, n randomised, registration 100% agreement; claim
direction 70%, favoured arm 60%, p 60%; 3 of 4 effect sizes present in both runs
matched within 0.05. Rerun B after a limit reset, solo.

**`max_turns` diagnosis (run A: S1 6/25, S7 4/25, S5 1/25).** Captured raw
outputs showed correct objects with one free-text field a few characters over
its schema `maxLength` (S1 `rationale` > 300; S7 arm `evidence_span` > 200);
the CLI then requests a second turn that `--max-turns 1` forbids. Intermittent:
re-running the same calls passed. Fix: free-text limits raised ~1.5–2x in
S1/S3/S5/S6/S6B/S7 schemas (prompts keep the shorter targets); no
`PROMPT_VERSION` bump because a looser limit cannot invalidate a cached answer
(reasoning beside the constant). The adapter now records the shape of every
unrecovered failure (`failure_shape` in the call meta; raw stream in
`out/claude_failures/`). Pinned by `tests/test_schema_headroom.py`. Live
confirmation: the run-B rerun.
