# BS-PROOF — project instructions

Read this before touching anything. It holds the rules that are not obvious from
the code and that a well-meaning refactor will destroy. It is deliberately short:
the reasoning and measurements behind each rule live in `docs/SPEC.md` and
`docs/history/` (the full pre-2026-10-02 version of this file, with every dated
entry, is `docs/history/2026-10-02-claude-md-archive.md`).

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
   `reports/runs/`. Method: `docs/EVIDENCE_METHOD.md`; how to run: `docs/PIPELINE.md`.
2. **App** (Next.js 16 on Vercel): `/scan` reads a supplement label (photo or
   typed) and grades the product against the retained runs. Design:
   `docs/SYSTEM_DESIGN.md`.

v2 replaced the v14 scoring model on 2026-10-15 (founder decision). v14 is
recorded in `docs/history/v14-scoring-model.md`; its code is at tag `v14-final`.
**Transitional:** the app's TS ports (`lib/analyze/{scoring,vocab,product-score}.ts`)
and the live site (`main`) still show the v14 run; moving the app is section F of
the 2026-10-15 simplification plan. `SPEC.md`, `PIPELINE.md`, `SYSTEM_DESIGN.md`
still describe v14 in places until the docs pass.

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
grade.

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
| research_audit / effect_research (design lab only) | version stamped in the prompt / `lib/evidence-ledger/effect-contract.ts` |

Separate cache domains on purpose: bumping `PROMPT_VERSION` invalidates ~1000
cached extractions (the cache key is version + model + effort + payload, not the
prompt text — so an edit without a bump silently serves stale answers). A hook
warns when a prompt or schema changes without a bump.

### 4. Never invent or move a constant

The GRADE rules and letter table (`grade.RULES`, `TABLE`, `LEVELS`,
`OFF_DOSE`, `VARIANTS`), the second-reviewer tolerances (`review.RULES`), study
selection (`pool.ROUTE_RANK`, `CONFIDENCE`), the benchmark pass rule
(`benchmark.RULES`) and every per-outcome MCID in `vocab/outcome.json` —
founder calls. Propose in `docs/REVIEW_PENDING.md`. A hook warns when a watched
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
"tested and found nothing". (The v14 rule — the centre number never travels
without its four arcs — still binds the app until it moves to v2.)

### 9. One extraction backend; never silent-merge

Claude is the only extraction backend (Grok was removed 2026-10-15). Any second
reader — the S5R reviewer, or a future backend — is stored separately and on
disagreement the claim is refused for human review, never averaged or "pick the
higher" (`pipeline/review.py`).

---

## Grading in one screen (evidence method v2, `docs/EVIDENCE_METHOD.md`)

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
  Change Python first, then re-sync. (The v14 ports' goldens are frozen; their
  generator was removed with v14.)
- **Status is `shadow`** (`evidence_v2.STATUS`) until the benchmark passes;
  until then the app labels the grade card "preview, not validated".

---

## Extraction

| Path | Auth | Public claims? |
|---|---|---|
| `claude_adapter` (production) | Claude subscription + `--safe-mode` | Only after the benchmark passes |

Per study: S3 (design, arms) first, then S4 (RoB), S5 (claims), S7 (form +
dose), S8 (funding) in parallel, then S6B (outcome mapping, one call per study)
and S5N (the numbers v2 pools). S5R (second reviewer, Opus) is opt-in
(`SP_SECOND_REVIEWER=1`). About 7 calls per study.

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

app/        Next.js routes: /scan (product), /api/scan, /runs (run archive) and
            /runs/<id>, /tests/supplements, /methodology, /design-lab (dev only,
            404 in production), / (waitlist)
components/ scan/ (the /scan UI), evidence-ledger/ (lab card), run/dashboard components
lib/analyze/        the scan: llm.ts (model transport), vision.ts, scan.ts, grade-v2.ts, v14 TS ports
lib/evidence-ledger/  rubric + retained audits used by /scan for exact matches
lib/scan-history/ lib/auth/   optional Supabase history + Google sign-in

prompts/*.md  schemas/*.json  vocab/*.json
reports/runs/          immutable run archive
docs/                  EVIDENCE_METHOD (method), SPEC (v14-era spec), PIPELINE, SYSTEM_DESIGN, history/
scripts/               report/artifact writers, benchmark, goldens, experiments/
tests/                 vitest (TS) + Python tests; tests/e2e/ Playwright
```

## Commands

```bash
# Python gates — run after ANY change to pipeline/, sources/ or vocab/
python3 -m pipeline.invariants
python3 -m pipeline.selftest          # ~180 checks, offline, ~0.5 s

# Pipeline (needs the .venv interpreter — bare python3 lacks httpx; a hook blocks it)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --wiring   # no model
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate \
    --full-text-only --intervention-scope --all-outcomes                         # Claude production
.venv/bin/python scripts/benchmark_v2.py compare reports/runs/<id>_dashboard.json

# App
npm ci && cp .env.example .env.local   # set DEEPSEEK_API_KEY for photo reads
npm run dev                            # http://localhost:3000/scan
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e                       # Playwright (slow)
```

Without a model key the photo path returns 503 `analyzer_unavailable`; the typed
(manual) path still scores. `LABEL_ANALYZER_ENABLED=0` disables both.

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
  overwrite an old run. **A finished run auto-commits and pushes `reports/`
  on the current branch** (`SP_AUTO_PUSH=0` to keep it local) — never run one
  while `main` is checked out. `scripts/archive_reports.py --apply` would move
  the v14 `.md` reports to `reports/archive/`; not done yet (section E).
- **Claude Code helper agents** (`.claude/agents/`: run-triage, node-gates,
  paper-verifier, score-tracer, spec-drift) are read-only and cost ~30k tokens
  each — use them only when they read far more than they report. Don't delegate
  deterministic gates; hooks in `.claude/settings.json` already run them.
  `score-tracer` and `spec-drift` are unsafe as agent-team teammates.
  **`score-tracer`, `run-triage` and `paper-verifier` were written for v14** and
  need revising before use.

---

## Current state (snapshot, 2026-10-15)

- **Method:** evidence method v2 is the pipeline's only method (branch
  `simplify/v2-only`, 2026-10-15); v14 retired (`docs/history/v14-scoring-model.md`,
  tag `v14-final`). `evidence_v2.STATUS = "shadow"` until the benchmark passes.
  `main` and the live site still run v14 (`20260904_185830`).
- **Latest v2 run** `20261014_185045` (v1.36, 138/139 studies). A cache-only
  replay of the same extraction on 2026-10-15 gives strength **k = 9, C-**
  (+0.17 [+0.02, +0.32]) where the stored run says k = 7, I: two trials' table
  numbers failed to verify in the original run (a network fetch at span-check
  time), so a fetch hiccup moves a letter. Lean mass k = 10 D+ **passes** the
  benchmark; strength coverage 29–38 % (< 50 %, not testable).
- **Known v2 problems** (the algorithm pass): a single trial can earn an **A**
  (muscle soreness, sleep quality: k = 1, "Moderate"); span-check verification
  depends on live table fetches; 64 refusals are "no verified effect estimate";
  v14's claim-level arm firewall (`_resolve_claim_arms`) never ran in v2.
- **Binding limit:** readable open-access full text (295/386 creatine RCTs are
  abstract-only), then off-target populations and figure-only results.
- **App:** `/scan` is the product surface (photo or typed → `POST /api/scan`).
  Exact matches to three retained audits show the Evidence Ledger card; a
  retained run with an `evidence_v2` block shows the v2 grade card; everything
  else "Not assessed". Model-written sections are badged unverified. Label
  reads: DeepSeek, thinking disabled, prompt `label-v1.3`.
- **Optional infra, unverified:** Supabase scan history, Google sign-in. PWA
  installable, no offline cache.

## Next (the 2026-10-15 simplification plan)

Done on `simplify/a-dead-weight` → `simplify/v2-only`: A (dead weight), B/C/D
(v2 only: v14 scoring, table route, SR route, Grok, label CLI removed; replay of
the v1.36 run gives byte-identical `evidence_v2`).

- **E** Run archive / dashboard (`/runs`, `lib/dashboard`, `dashboard_artifact.py`,
  `auto_report_push.py`): keep, shrink or drop; auto-push policy; archive the v14 reports.
- **F** App: move `/scan` to v2 only (retire v14 TS ports, Evidence Ledger,
  design lab); decide each model-written section; scan history / auth.
- **G** Tests, hooks, CI right-sized to what is left; revise the v14-era helper agents.
- **H** Docs: SPEC / EVIDENCE_METHOD / PIPELINE / SYSTEM_DESIGN / AGENTS.md / README.
- **v2 algorithm pass:** the known problems above, then MCIDs (REVIEW_PENDING
  0b), the benchmark, and a stability measurement (same corpus twice).

## Conventions

- Deterministic code → unit tests. Model output → anchor evals, per provider.
- Evidence spans on every model output.
- New constants → SPEC §13 first.
- Separate backends → separate runs and labels, no silent merge.
