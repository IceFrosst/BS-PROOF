# BS-PROOF

Evidence grading for dietary supplements, at the resolution the science actually
supports.

Every existing tool scores **ingredients**. "Ashwagandha: 3/5 stars." But
*"ashwagandha works for stress"* is four questions:

- which **preparation**? KSM-66 root extract behaves nothing like leaf powder
- at what **dose**? 600 mg/day has trials behind it; 125 mg does not
- for which **outcome**? cortisol ≠ subjective anxiety ≠ sleep latency
- in **whom**? deficient ≠ replete, and the answer can flip

BS-PROOF grades the product, per outcome:

```
ECU = (ingredient, form, dose, outcome, population)
```

## How a grade is made

The way a Cochrane systematic review works, automated (`docs/METHOD.md`):

1. Retrieve the randomised trials for the ingredient; deduplicate so one trial
   is one unit however many papers it produced.
2. A language model **only reads** each paper into structured facts. Every
   number it copies is checked against the sentence or table it came from;
   anything not found is refused.
3. Deterministic code computes each trial's effect size, pools the trials per
   outcome (random-effects meta-analysis), rates certainty with GRADE (risk of
   bias, consistency, precision, how well the trials match *your* form and dose,
   publication bias) and gives a letter from a fixed table of benefit size ×
   certainty.

A letter always travels with its estimate, confidence interval, number of trials
and certainty. **I** means insufficient evidence, never a low grade: *not
studied* must never look like *studied and failed*.

**Status (2026-10-15):** the pipeline runs this method, but grades are a preview
until they pass a check against published meta-analyses (`docs/METHOD.md` §16).
The app shows no grade yet; it says so.

## Quick start

### The app (`/scan`)

```bash
npm ci
cp .env.example .env.local   # set DEEPSEEK_API_KEY for photo reads
npm run dev                  # http://localhost:3000/scan
```

Photograph a Supplement Facts label, or type ingredient + form + dose. Today the
result shows what the label says plus background clearly badged "unverified"
(literature orientation, form and mix, company and MLM disclosure, funding and
publication-bias disclosures), and a notice that grades are not active yet.
Without a model key the photo path returns 503; the typed path still works.
Details: `docs/APP.md`. On a phone with the live camera: Android
`adb reverse tcp:3000 tcp:3000`, then open `localhost:3000/scan`.

Gates: `npm run typecheck && npm run lint && npm test && npm run build`;
`npm run test:e2e` for the Playwright + axe suite.

### The evidence pipeline

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
python3 -m pipeline.invariants      # structural rules, no model, no network
python3 -m pipeline.selftest        # deterministic checks, no model, no network

.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --wiring   # plumbing only, no model
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate \
    --full-text-only --intervention-scope --all-outcomes                         # Claude subscription
```

Runs land in `reports/runs/` (summary, full report, context JSON). Full guide:
`docs/PIPELINE.md`.

## Docs

| File | What it is |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Rules, invariants, workflow and current state. **Read before changing code.** Other agents: [`AGENTS.md`](AGENTS.md) |
| [`docs/METHOD.md`](docs/METHOD.md) | The evidence method: retrieval → extraction → pooling → GRADE → letters, and how it is validated |
| [`docs/PIPELINE.md`](docs/PIPELINE.md) | How to run the pipeline, its flags and switches, how to check a run |
| [`docs/APP.md`](docs/APP.md) | The app: `/scan`, its API, the model sections, history, sign-in, design system, PWA |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Open founder decisions, the v2 work list, and what has been decided |
| [`docs/history/`](docs/history/) | Archives (including the retired v14 model) and the dated project log — not a task list |
