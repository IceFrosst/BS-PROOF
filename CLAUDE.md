# BS-PROOF — project instructions

Read this before touching anything. It holds the rules that are not obvious from
the code and that a well-meaning refactor will destroy. It is deliberately short.
The current docs, one per topic and none duplicating another:

| Doc | Topic |
|---|---|
| `docs/METHOD.md` | the evidence method, section-numbered (code cites `METHOD §N`) |
| `docs/PIPELINE.md` | running the pipeline, flags, switches, checking a run |
| `docs/APP.md` | the app, section-numbered (code cites `APP §N`) |
| `docs/DECISIONS.md` | open founder decisions, the v2 work list, decided items |
| `docs/history/` | archives and the dated project log; never current |

A change that makes any doc untrue updates that doc in the same commit.

**Do not append dated change notes here.** Log them in
`docs/history/project-log.md` (newest first) and only update `Current state` /
`Next` below if the snapshot itself changed.

## What this is

Evidence grading for dietary supplements. Every competitor scores
*ingredients*; this grades the **ECU** —
`(ingredient, form, dose, outcome, population)` — and treats evidence that
doesn't match the specific product as weaker (GRADE indirectness). Two parts:

1. **Evidence pipeline** (Python, offline): retrieve papers → extract facts with
   model "subagents" → deterministic **evidence method v2** (random-effects
   meta-analysis + GRADE + a letter per outcome) → immutable run artifacts in
   `reports/runs/`.
2. **App** (Next.js 16 on Vercel): `/scan` reads a supplement label (photo or
   typed). **Evidence grading is not active in the app yet**: it shows the
   label facts and model-written background badged "unverified", plus a
   notice that grades are not active.

v2 replaced the v14 scoring model on 2026-10-15 (founder decision). v14 —
its scorer, runs, `/runs` dashboard, TS ports and the Evidence Ledger — is
recorded in `docs/history/v14-scoring-model.md`; its code is at tag `v14-final`.
`lib/analyze/grade-v2.ts` (the v2 letter re-matched to a product) is built and
parity-pinned but **deliberately not called** until v2 is validated
(`docs/APP.md` §4).

---

## Hard invariants — do not violate these

### 1. Only these files may talk to a model

| File | Role |
|---|---|
| `bsproof/claude_adapter.py` | Claude production extraction (subscription + `--safe-mode`) |
| `lib/analyze/llm.ts` | **The app's one model transport.** Label vision read (`vision.ts`), compatibility, company profile, literature warnings, evidence prior. DeepSeek by default (`DEEPSEEK_API_KEY`); `MODEL_API_URL` / `LABEL_MODEL` / `TEXT_MODEL` swap provider without code changes |

`python3 -m pipeline.invariants` enforces this (AST for Python, a text scan for
TS). Everything in `pipeline/`, `sources/` and the rest of `lib/analyze/` is
deterministic. If you find yourself importing the adapter into `pipeline/`, stop.

**Model text in the app never enters a grade.** Model-written sections render
under a "model knowledge — unverified" badge; only an evidence run produces a
grade (none is shown until grading is switched on).

### 2. Subagents are pure functions

One shot, no tools, no loop, temperature 0, JSON in → schema-valid JSON out. If
a subagent needs a second turn, the **prompt** is wrong — do not raise turn
limits.

### 3. Bump the prompt version when you edit a prompt

| prompts | constant |
|---|---|
| S3–S8, S5N, S5R, S6B (`prompts/s*.md`, `_shared.md`) | `PROMPT_VERSION` in `bsproof/claude_adapter.py` |
| `prompts/label.md` | `LABEL_PROMPT_VERSION` in `lib/analyze/vision.ts` |
| compatibility / company / literature_warnings / evidence_prior | their own `*_PROMPT_VERSION` in `lib/analyze/` |

Separate cache domains on purpose: bumping `PROMPT_VERSION` invalidates ~1000
cached extractions (the cache key is version + model + effort + payload, not the
prompt text — so an edit without a bump silently serves stale answers). A hook
warns when a prompt or schema changes without a bump.

### 4. Never invent or move a constant

The GRADE rules and letter table (`grade.RULES`, `TABLE`, `LEVELS`,
`OFF_DOSE`, `VARIANTS`), the second-reviewer tolerances (`review.RULES`), study
selection (`pool.ROUTE_RANK`, `CONFIDENCE`), the benchmark pass rule
(`benchmark.RULES`) and every per-outcome MCID in `vocab/outcome.json` —
founder calls. Propose in `docs/DECISIONS.md`. A hook warns when a watched
one moves (`scripts/verify_helpers.WATCHED_CONSTANTS`).

### 5. `null` is a valid answer everywhere

Never infer a field you cannot see. "Unknown" must never silently become a value
(e.g. IU is refused as a mass; unstated hydration refuses the dose conversion).

### 6. A review is never a study

A systematic review / meta-analysis is never pooled as if it were a trial, and a
pooled estimate is never distributed back onto trials. Published meta-analyses
enter only as the **benchmark** (`vocab/benchmarks.json`, `pipeline/benchmark.py`):
our CI must overlap theirs. (v14's SR-table route was removed with v14.)

### 7. Only a real contrast against a real control

`pipeline.eligibility._ineligible` refuses a study, symmetrically (benefits
too): all arms get the ingredient; ingredient not isolated (combination arm —
except a matched add-on pair, `matched_addon_claim`). v2 drops v14's
"self-declared underpowered" refusal: pooling already gives a tiny trial a tiny
weight. Unknown/absent always defaults to KEEP. Never infer these fields from
the numbers. A null is not "evidence against" by label: it enters the pool as
its measured effect with its variance, and an effect that cannot be computed is
refused and **counted with its reason**, never silently dropped.

### 8. A letter never travels without its parts

Form, dose and population are **not** study weight (weight = inverse variance);
a mismatch is GRADE indirectness. So a letter is always shown with its pooled
estimate, CI, k and certainty, and "no data" (`I`, k = 0) must never render like
"tested and found nothing".

### 9. One extraction backend; never silent-merge

Claude is the only extraction backend (Grok was removed 2026-10-15). Any second
reader — the S5R reviewer, or a future backend — is stored separately and on
disagreement the claim is refused for human review, never averaged or "pick the
higher" (`pipeline/review.py`).

---

## Grading in one screen (evidence method v2; full detail `docs/METHOD.md`)

```
per trial, per outcome   ONE effect, chosen by a fixed order (measure hierarchy,
                         primary outcome, route), from numbers verified against
                         their quoted span → Hedges' g + variance   (effect_size, span_check)
per outcome              REML random effects, Hartung–Knapp CI (k ≥ 3),
                         prediction interval, leave-one-out          (pool, meta_effects)
certainty                GRADE: High for RCTs, downgraded for RoB, inconsistency,
                         imprecision, indirectness (form/dose/population) (grade)
letter                   benefit size vs the outcome's MCID × certainty (grade.TABLE)
```

Things that look simplifiable and are not:

- **The threshold is the MCID, not zero.** Benefit size is judged against the
  outcome's meaningful-change threshold (default 0.2 SD, flagged), at M, M/2
  and 2M so a reader sees how sensitive the letter is.
- **One effect per trial per outcome**, by a fixed order. Pooling two endpoints
  of one trial counts it twice; run-to-run differences came from *which* measure
  was picked (measured 2026-10-03).
- **Population variant B is stored**: off-target populations (`pop_match ==
  "different"`) are refused, "adjacent" is noted.
- **Python is canonical.** `lib/analyze/grade-v2.ts` is a port pinned by
  `tests/grade-v2-parity.test.ts` to `scripts/golden_grade_v2.py` goldens.
  Change Python first, then re-sync. The dose conversion and dose tiers the
  scan still runs are pinned by `tests/vocab-parity.test.ts` /
  `tests/test_vocab_goldens.py` to `tests/golden_vocab_parity.json`.
- **Status is `shadow`** (`evidence_v2.STATUS`) until validation passes
  (`docs/METHOD.md` §16).

---

## Extraction

| Path | Auth | Public claims? |
|---|---|---|
| `claude_adapter` (production) | Claude subscription + `--safe-mode` | Only after validation passes (METHOD §16) |

Per study: S3 (design, arms) first, then S4 (RoB), S5 (lists outcomes), S7 (form +
dose), S8 (funding) in parallel, then S6B (outcome mapping, one call per study)
and S5N (the numbers v2 pools), then S5R (second reviewer, Opus; on by
default, `SP_SECOND_REVIEWER=0` turns it off). About 7–8 calls per study.

Extraction has no metered spend; the limit is subscription **throughput**.
Never run agent teams, workflows or other heavy sessions alongside an
extraction — it truncates the run (failed calls hide refusals and bias the
result). Retrying a rate-limit error does not help.

Claude tiers: `claude_adapter.TIER_MODEL` / `TIER_EFFORT` (A haiku-4.5,
B/C sonnet-5, R opus-5; `SP_MODEL_A/B/C/R` override).

---

## Layout

```
bsproof/                the extraction layer (may call a model; pipeline/ may not import it)
  claude_adapter.py     the model boundary: AGENTS, tiers, cache, PROMPT_VERSION
  workers.py            per-study fan-out (extract_study / extract_corpus); call= injectable
  worker_payload.py     what each agent is sent, fitted to the input budget
  worker_quota.py       subscription-limit detection
  run/                  run_pipeline stages: options, corpus, extract, evidence, report
run_pipeline.py         one ingredient end to end (--wiring for no model; --help)

pipeline/   deterministic, NO MODEL, unit-tested
  retrieve.py classify.py dedup.py relevance.py predatory.py storage.py showcase.py   retrieval
  span_check.py effect_size.py   verify extracted numbers; numbers -> signed effect + variance
  meta_effects.py                Hedges' g, REML random effects, Hartung-Knapp CIs
  pool.py                        per-outcome study selection and pooling
  grade.py                       GRADE certainty + the letter table
  review.py registry_bias.py     second-reviewer rule; registered-but-unpublished trials
  eligibility.py dose.py         invariant-7 scope refusals; the tested arm's dose
  evidence_v2.py                 pool + GRADE per outcome -> run artifact `evidence_v2`
  benchmark.py                   our pooled estimates vs published meta-analyses
  vocab.py                       vocabularies, dose conversion, form/population matching
  invariants.py selftest/        the two gates (selftest is a package; run with -m)
sources/    deterministic HTTP layer: europepmc, clinicaltrials, oa, fulltext, crossref

app/        Next.js routes: /scan (product), /api/scan, /methodology, / (waitlist)
components/ scan/ (the /scan UI), site shell, waitlist form
lib/analyze/        the scan: llm.ts (model transport), vision.ts, scan.ts, vocab.ts,
                    grade-v2.ts (built, not connected), model-written sections
lib/scan-history/ lib/auth/   optional Supabase history + Google sign-in

prompts/*.md  schemas/*.json  vocab/*.json
reports/runs/          immutable run archive: <id>_summary.md, _full.md, _context.json
docs/                  METHOD, PIPELINE, APP, DECISIONS, history/ (+ the Supabase SQL)
scripts/               report writer, benchmark, replay_from_cache, goldens, helper checks, experiments/
tests/                 vitest (TS) + Python tests; tests/e2e/ Playwright
```

## Commands

```bash
# Python gates — run after ANY change to pipeline/, sources/ or vocab/
python3 -m pipeline.invariants
python3 -m pipeline.selftest          # ~180 checks, offline, ~0.5 s
.venv/bin/python -m pytest -q tests/  # Python tests

# Pipeline (needs the .venv interpreter — bare python3 lacks httpx; a hook blocks it)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --wiring   # no model
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate \
    --full-text-only --intervention-scope --all-outcomes                         # Claude production
.venv/bin/python scripts/benchmark_v2.py compare reports/runs/<id>_context.json
.venv/bin/python scripts/replay_from_cache.py <outdir> -- <run args>         # cache-only regression replay

# App
npm ci && cp .env.example .env.local   # set DEEPSEEK_API_KEY for photo reads
npm run dev                            # http://localhost:3000/scan
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e                       # Playwright (slow)
```

Without a model key the photo path returns 503 `analyzer_unavailable`; the typed
(manual) path still works. `LABEL_ANALYZER_ENABLED=0` disables both.

---

## Workflow rules

- **Every push to `main` deploys to production** (`IceFrosst/BS-PROOF` →
  Vercel `bs-proof-dashboard`). Work on a branch/worktree, get all gates green,
  then merge. Non-`main` branches do not build on Vercel (`vercel.json`
  `ignoreCommand`).
- **Ownership:** Claude Code owns every file; other agents (e.g. Codex) may write
  anything, and Claude verifies their commits afterwards (`python3 scripts/verify_helpers.py`).
  Shared agent rules: `AGENTS.md`.
- **Do not delete a comment recording a MEASUREMENT.** Move it if inconvenient.
- **Reports:** every human-facing run goes under `reports/runs/` with a row in `INDEX.md`,
  stamped with `scoring_model:` (now `evidence-v2`) and the provider. Never
  overwrite an old run. A run writes its files locally; `SP_AUTO_PUSH=1` also
  commits and pushes `reports/` on the current branch (never with `main`
  checked out — a push to `main` deploys).
- **Claude Code helper agents** (`.claude/agents/`: run-triage, node-gates,
  paper-verifier, spec-drift) are read-only and cost ~30k tokens
  each — use them only when they read far more than they report. Don't delegate
  deterministic gates; hooks in `.claude/settings.json` already run them.
  `spec-drift` is unsafe as an agent-team teammate.

---

## Current state (snapshot, 2026-10-16)

- **Method:** evidence method v2 is the pipeline's only method; v14 retired.
  `evidence_v2.STATUS = "shadow"` until validation passes. `main` and the live
  site still run v14 until the simplification branches merge.
- **Latest v2 run** `20261014_185045` (v1.36, 138/139 studies). Replayed from
  cache with the 2026-10-16 fixes: strength **k = 10, C−** (+0.17
  [+0.03, +0.31]), lean mass k = 11 D+ **passes** the benchmark (coverage
  65 %); strength coverage 42 % (not testable, needs ≥ 50 %). The stored
  run's own numbers (strength k = 7, I) predate the fetch-failure fix.
- **Known v2 problems:** the work list in `docs/DECISIONS.md`. Done: items
  1 (imprecision scales with information size), 2, 3 (offline part), 6, 10
  (prompts trimmed, `PROMPT_VERSION` v1.37, not yet run); decided: 5 (healthy
  adults only), 7 (second reviewer on). Open: coverage, stability,
  negative-control benchmarks.
- **Working baseline: `Jans_attempt`, not `main`** (founder, 2026-10-15).
  `origin/main` has diverged (68 commits since `d9cedc4`, 2026-09-22: live
  research worker, live result card, research-jobs SQL, scan-history UI,
  localisation) and conflicts with this line. Until the founder schedules the
  "big merge", treat `Jans_attempt` as main: branch from it, merge into it,
  never merge to or from `origin/main`, never resolve those conflicts.
- **Binding limit:** readable open-access full text (295/386 creatine RCTs are
  abstract-only), then off-target populations and figure-only results.
- **App:** `/scan` answers `not_graded` for every supported product and says
  grades are not active yet; it shows label facts and model-written sections
  badged unverified (`docs/APP.md`). Label reads: DeepSeek, thinking disabled,
  prompt `label-v1.3`.
- **Optional infra, unverified:** Supabase scan history, Google sign-in. PWA
  installable, no offline cache.

## Next

1. The 2026-10-15 simplification is complete and merged into `Jans_attempt`
   (`docs/history/project-log.md`, 2026-10-15 entries).
2. **v2 work list** (`docs/DECISIONS.md`), then connect `grade-v2.ts` in
   `lib/analyze/scan.ts`, build the grade card and remove the notice.
3. Verify on a real phone (live camera, busy-label read, PWA install) and
   against real Supabase / Google projects.

## Conventions

- Deterministic code → unit tests. Model output → the benchmark and stability
  checks (`docs/METHOD.md` §16).
- Evidence spans on every model output.
- New constants → `docs/DECISIONS.md` first.
