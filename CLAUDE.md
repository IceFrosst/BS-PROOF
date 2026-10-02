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
*ingredients*; this scores the **ECU** —
`(ingredient, form, dose_band, outcome, population)` — and discounts evidence
that doesn't match the specific product. Two parts:

1. **Evidence pipeline** (Python, offline): retrieve papers → extract facts with
   model "subagents" S1–S8 → deterministic scoring → immutable run artifacts in
   `reports/runs/`. Design: `docs/SPEC.md` (method), `docs/PIPELINE.md` (how to run).
2. **App** (Next.js 16 on Vercel): `/scan` reads a supplement label (photo or
   typed) and scores the product against the retained runs. Design:
   `docs/SYSTEM_DESIGN.md`.

Scores are signed −100…+100 internally, displayed 0–100, and always carry four
arcs (effect / form / dose / evidence), each a verdict plus its coverage.

---

## Hard invariants — do not violate these

### 1. Only these files may talk to a model

| File | Role |
|---|---|
| `claude_adapter.py` | Claude production extraction (subscription + `--safe-mode`) |
| `grok_adapter.py` | Grok extraction (separate backend, separate store) |
| `label_adapter.py` | Local CLI read of a label image |
| `lib/analyze/llm.ts` | **The app's one model transport.** Label vision read (`vision.ts`), compatibility, company profile, literature warnings, evidence prior. DeepSeek by default (`DEEPSEEK_API_KEY`); `MODEL_API_URL` / `LABEL_MODEL` / `TEXT_MODEL` swap provider without code changes |

`python3 -m pipeline.invariants` enforces this (AST for Python, a text scan for
TS). Everything in `pipeline/`, `sources/` and the rest of `lib/analyze/` is
deterministic. If you find yourself importing an adapter into `scoring.py` or
`dedup.py`, stop.

**Model text in the app never enters a score.** Model-written sections render
under a "model knowledge — unverified" badge; only an evidence run produces a
number.

### 2. Subagents are pure functions

One shot, no tools, no loop, temperature 0, JSON in → schema-valid JSON out. If
a subagent needs a second turn, the **prompt** is wrong — do not raise turn
limits. The single exemption is `label_adapter` (needs the `Read` tool to see an
image; `--max-turns 3`, one tool, scoped dir). Do not cite it for an extractor.

### 3. Bump the prompt version when you edit a prompt

| prompts | constant |
|---|---|
| S1–S8 (`prompts/s*.md`, `_shared.md`) | `PROMPT_VERSION` in `claude_adapter.py` (shared with Grok) |
| `prompts/label.md` | `LABEL_PROMPT_VERSION` in **both** `lib/analyze/vision.ts` and `label_adapter.py` |
| compatibility / company / literature_warnings / evidence_prior | their own `*_PROMPT_VERSION` in `lib/analyze/` |
| research_audit / effect_research (design lab only) | version stamped in the prompt / `lib/evidence-ledger/effect-contract.ts` |

Separate cache domains on purpose: bumping `PROMPT_VERSION` invalidates ~1000
cached extractions. A hook warns when a prompt or schema changes without a bump.

### 4. Never invent or move a constant

`k`, transfer factors, RoB thresholds, `S_VALUE`, `H_PENALTY`, `H_NORM`, OA
penalty, dose ramp knots, effect-size `MID`/`FULL` — founder calls. Propose in
`docs/REVIEW_PENDING.md` and SPEC §13. A hook warns when one in `scoring.py`
moves.

### 5. `null` is a valid answer everywhere

Never infer a field you cannot see. "Unknown" must never silently become a value
(e.g. IU is refused as a mass; unstated hydration refuses the dose conversion).

### 6. A synthesis document adds no evidence mass

A meta-analysis is not another study; dedup by canonical id and `score_ecu`
takes the **max** review `cov` (multiplier ≤ 1.30). Trials read out of a
review's tables do count, once, at the `sr_table` tier (0.72 of a directly read
trial), and only if they pass five refusals in `synthesis.derived_studies`: no
direction, `unclear`, no design, already in corpus, reviews disagree → discard.
Never distribute a pooled estimate back onto trials.

### 7. Nulls count against — only well-run nulls against a real control

`pipeline.assemble._ineligible` refuses, symmetrically (benefits too):
all arms get the ingredient; authors declare it underpowered; ingredient not
isolated (combination arm). Unknown/absent always defaults to KEEP. A
nonsignificant result without a usable signed estimate is
`inconclusive_unquantified` (s = 0), not evidence against. Never infer these
fields from the numbers.

### 8. The centre number never travels without its arcs

Form, dose and population are **not** in the study weight
(`w = design × RoB × size × funding × OA`), so two products differing only in
form/dose share a centre number; the arcs carry the difference. No ranked table,
API field or headline without arcs. `0.00 @ 0%` ("untested") and `−0.70 @ 100%`
("tested and failed") must never render alike.

### 9. Dual backends: never silent-merge

Claude and Grok extractions run, store and report separately
(`claude` / `grok`). On disagreement: discard or human review,
never average or pick the higher.

---

## Scoring in one screen (`SCORING_MODEL = v14-applicability-discount`)

```
d = Σwᵢsᵢ / Σwᵢ       c = 1 − e^(−E′/k)       H = weighted var(sᵢ)
signed    (−100…+100) = 100 × d × c × (1 − 0.4H)
A         (0…1)       = mean(form strength, dose closeness)
composite (0…100)     = 50 + signed/2 × (A if signed > 0 else 1)
```

Things that look simplifiable and are not:

- **`sᵢ` comes from the reported effect size, recentred on the meaningful
  threshold** (`s = clamp((effect − 0.20)/(0.80 − 0.20))`), so a measured zero is
  negative and a sub-threshold positive is not a win. The number is used only
  when S5 names the favoured arm; an unsigned magnitude is refused. Centring on
  zero instead is the obvious wrong fix.
- **Applicability discounts benefit only.** A null or harm is never softened by
  an untested form.
- **Dose term = closeness to the dose range where benefit was found**
  (`pipeline/dose.py`), flat inside the range, linear ramps outside. Label doses
  are converted compound → elemental before comparison, never copied.
- **Population variant B is stored** (`pop_match == "different"` excluded);
  variant A is printed beside it, never blended.
- **Python is canonical.** `lib/analyze/{scoring,vocab,product-score}.ts` are
  ports pinned by `tests/analyze-parity.test.ts` to Python-computed goldens
  (`scripts/golden_parity.py`). Change Python first, then re-sync.

---

## Extraction backends

| Path | Auth | Public claims? |
|---|---|---|
| `claude_adapter` (production) | Claude subscription + `--safe-mode` | Yes |
| `grok_adapter` | Grok CLI, signed in | Only after anchor eval |

Extraction has no metered spend; the limit is subscription **throughput**.
Never run agent teams, workflows or other heavy sessions alongside an
extraction — it truncates the run (S5 failures hide nulls and bias scores up).
Retrying a rate-limit error does not help.

Claude tiers: `claude_adapter.TIER_MODEL` / `TIER_EFFORT` (A haiku-4.5,
B/C sonnet-5; `SP_MODEL_A/B/C` override). Grok tiers: `grok_adapter.TIER_MODEL`.
**Verify any Grok model id with `grok models` before setting it** (`grok-4.3`
is not a valid CLI id and failed a run 0/80).

---

## Layout

```
claude_adapter.py grok_adapter.py label_adapter.py   model boundaries
workers.py              fan-out; model injected via call=
run_pipeline.py         one ingredient end to end (--wiring / --grok / --with-sr)
run_sr_inheritance.py   SR-table uplift alone
run_coverage.py         OA + methods-fact coverage, no model

pipeline/   deterministic, NO MODEL, unit-tested
  scoring.py arcs.py donut.py      formula, arcs, rendering
  assemble.py                      worker JSON → Study → scored ECU rows; eligibility firewall
  dedup.py classify.py relevance.py retrieve.py predatory.py
  synthesis.py synthesis_bridge.py SR resolution, SR-derived trials
  dose.py product_score.py         dose bands; product lookup behind the app
  calibration.py                   anchor harness
  meta_effects.py effect_harvest.py  effect-size utilities
  v13_shadow.py                    shadow analysis, NOT imported by production scoring
  storage.py vocab.py preview.py showcase.py
  invariants.py selftest.py        the two gates
sources/    deterministic HTTP layer: europepmc, clinicaltrials, oa, fulltext

app/        Next.js routes: /scan (product), /api/scan, /tester, /tests/supplements,
            /runs, /methodology, /design-lab (dev only, 404 in production), / (waitlist)
components/ scan-flow.tsx + scan-camera.tsx (the /scan UI), label-analyzer.tsx (/tester)
lib/analyze/        the scan: llm.ts (model transport), vision.ts, scan.ts, TS scoring ports
lib/evidence-ledger/  rubric + retained audits used by /scan for exact matches
lib/scan-history/ lib/auth/   optional Supabase history + Google sign-in

prompts/*.md  schemas/*.json  vocab/*.json
reports/runs/          immutable run archive (current SCORING_MODEL only)
reports/archive/<model>/  runs from superseded scoring models
docs/                  SPEC (method), PIPELINE (running it), SYSTEM_DESIGN (app), ANCHORS, history/
scripts/               report/artifact writers, rescoring, experiments
tests/                 vitest (TS) + Python tests; tests/e2e/ Playwright
```

## Commands

```bash
# Python gates — run after ANY change to pipeline/, sources/ or vocab/
python3 -m pipeline.invariants
python3 -m pipeline.selftest          # ~510 checks, offline, ~0.5 s

# Pipeline (needs the .venv interpreter — bare python3 lacks httpx; a hook blocks it)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --wiring   # no model
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate            # Claude production
.venv/bin/python grok_adapter.py                                                 # Grok preflight

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
- **Ownership:** Claude Code owns every file; Grok and Codex may write anything,
  and Claude verifies their commits afterwards (`python3 scripts/verify_helpers.py`).
  Shared agent rules: `AGENTS.md`.
- **Do not delete a comment recording a MEASUREMENT.** Move it if inconvenient.
- **Reports:** every human-facing run goes under `reports/runs/` + `INDEX.md` +
  `latest.md`, stamped with `scoring_model:` and the provider. Never overwrite an
  old run. After changing `SCORING_MODEL`, run
  `python3 scripts/archive_reports.py --apply`.
- **Claude Code helper agents** (`.claude/agents/`: run-triage, node-gates,
  paper-verifier, score-tracer, spec-drift) are read-only and cost ~30k tokens
  each — use them only when they read far more than they report. Don't delegate
  deterministic gates; hooks in `.claude/settings.json` already run them.
  `score-tracer` and `spec-drift` are unsafe as agent-team teammates.

---

## Current state (snapshot, 2026-10-02)

- **Evidence:** exactly one retained run — creatine monohydrate
  (`20260904_185830`, v14 re-composition of `20260825_175339`, which is now only in git history). Every run is
  `public_claims_allowed: false`; anchors are not calibrated. Run-to-run
  extraction variance (not the formula) is the binding precision problem.
- **App:** `/scan` is the product surface. Photo (live camera via
  `getUserMedia`, with a `capture="environment"` file-input fallback) or typed
  ingredient + form + dose → `POST /api/scan`. Exact single-ingredient matches
  to three retained audits (creatine monohydrate 4000 mg/day, vitamin D3
  2000 IU/day, magnesium glycinate 300 mg/day) show the Evidence Ledger card;
  everything else shows the same card shell as "Not assessed", with the
  continuous v14 `evidence.rows` kept in the API as a backup. Model-written
  sections (compatibility, company + MLM disclosure, funding/publication-bias
  disclosures, evidence prior for unscored ingredients) are badged unverified.
- **Label reads** run on DeepSeek with thinking mode disabled
  (`ChatRequest.disableThinking`, DeepSeek only); prompt `label-v1.3` states
  the schema's list limits.
- **Optional infra, unverified against real projects:** Supabase scan history
  (`docs/scan-history.sql`, `SCAN_HISTORY_REQUIRED`), Google sign-in
  (`NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
- **PWA:** installable, starts at `/scan/`, no offline cache.

## Next

1. Verify on a real phone: live camera, a busy label read after the
   thinking-mode fix, PWA install.
2. Check whether the text calls (`deepseek-chat`) also need thinking disabled
   (`literature_warnings` at 1024 max tokens may degrade to `unavailable`).
3. Set up Supabase (run `docs/scan-history.sql`) and Google credentials, then
   verify history and sign-in end to end.
4. Pipeline: replay S7 under v1.28 on all 155 usable creatine studies, review
   drift, rescore from the unchanged S3/S5 corpus. `rescore_run.py --verify`
   cannot re-assemble v13 runs (the `studies_list` projection drops per-arm
   facts) — fix the projection first.
5. Constrain retrieval to the intervention, not the document.
6. Measure extraction stability (same corpus, same prompt, twice) before any
   anchor calibration.
7. Right-size dashboard CI (path filters; full Playwright matrix only for UI
   changes).

Later: Grok/Claude agreement table, Grok telemetry capture, dose bands at scale,
venue factor (needs a SPEC §13 constant first).

## Conventions

- Deterministic code → unit tests. Model output → anchor evals, per provider.
- Evidence spans on every model output.
- New constants → SPEC §13 first.
- Separate backends → separate runs and labels, no silent merge.
