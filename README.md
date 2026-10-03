# BS-PROOF

Evidence grading for dietary supplements, at the resolution the science actually
supports.

Every existing tool scores **ingredients**. "Ashwagandha: 3/5 stars." But
*"ashwagandha works for stress"* is not a statement that can be true or false —
it's four questions in a trenchcoat:

- which **preparation**? KSM-66 root extract behaves nothing like leaf powder
- at what **dose**? 600 mg/day has trials behind it; 125 mg does not
- for which **outcome**? cortisol ≠ subjective anxiety ≠ sleep latency
- in **whom**? deficient ≠ replete, and the sign can flip

This scores the tuple, not the ingredient.

```
ECU = (ingredient, form, dose_band, outcome, population)
```

One ECU per outcome. Five outcomes means five scores — there is no single
product number, and there deliberately cannot be one.

## Output: a number and four arcs, never the number alone

```
internal    −100…+100  = 100 × d × c × (1 − 0.4H)
displayed   0…100      = 50 + internal/2 × (A if internal > 0 else 1)
A = mean(form strength, dose closeness)   applicability to YOUR product, 0 … 1

d = Σ(wᵢ·sᵢ) / Σ(wᵢ)      direction       −1 … +1
c = 1 − e^(−E′/k)          confidence       0 … 1
H = weighted var(sᵢ)       heterogeneity    0 … 1
```

**The weight is study QUALITY only** — `design × RoB × size × funding × OA`.
Form, dose and population are *not* in it. That is a deliberate decision
(founder, 2026-08-07) with a consequence that has to be stated every time:

> Two products differing only in form or dose **share a centre number**. The
> difference is carried by the arcs. A score published without its arcs is a
> false claim.

Each arc carries a **verdict** and the **coverage** behind it:

| arc | verdict | coverage |
|---|---|---|
| **effect** | what all the evidence says | 1.0 |
| **form** | what trials using *your* preparation found | their share of evidence weight |
| **dose** | what trials in *your* dose band found | their share of evidence weight |
| **evidence** | — (pure quantity) | `c` |

`0.00 @ 0%` ("nobody tested your form") and `−0.70 @ 100%` ("your form was
tested and failed") are opposite messages and never render the same.

This is also why a low number isn't automatically bad news:

```
1 weak positive trial   →   3/100   with an EMPTY evidence arc  ("barely studied")
20 solid null trials    →  15/100   with a FULL  evidence arc  ("does not work")
```

**A null result scores −0.7, not 0.** A product claims a benefit; a well-run
trial finding no effect is disconfirming evidence for that claim. The one
exception is adverse-event outcomes, where the claim is "this is safe" and a
null is reassurance — scoring those −0.7 once published magnesium's safety data
as the worst row on the board.

## The three traps this is built around

**Deduplication.** Thirty meta-analyses routinely re-analyse the same nine RCTs.
An LLM asked to merge similar conclusions will *correctly* observe they agree,
reading one trial pool as thirty corroborations. Dedup therefore happens at
ingestion, in deterministic code, keyed on `NCT > DOI > PMID > fingerprint`, and
`score_ecu` takes the **maximum** synthesis coverage rather than a sum.

**Transfer.** A single ingredient might have 360 possible ECUs of which the
literature populates 15. The other 345 are reached only by discounting evidence
across form, dose and population distance. Those factors are the system's
largest error source and are all uncalibrated — see `docs/SPEC.md` §13.

**Reachability.** Most trials are paywalled. An abstract-only study lands near
`w = 0.023` and would need ~300 of its kind to reach `c = 0.9`; a full-text
study needs ~50. So a systematic review's tables are not a footnote — they are
often the only route to a trial at all, and since 2026-08-08 the trials
described in them are **scored**, once each, at 0.72 of the weight of a paper we
read ourselves.

## Quick start

### The app (`/scan`)

```bash
npm ci
cp .env.example .env.local   # set DEEPSEEK_API_KEY for photo reads
npm run dev                  # http://localhost:3000/scan
```

Photograph a Supplement Facts label (or type ingredient + form + dose) and get
that product's evidence: verdicts with their four arcs, dose effectiveness,
form compatibility and company background. Without a model key the photo path
returns 503; the typed path still scores. Supabase history and Google sign-in
are optional (`docs/SYSTEM_DESIGN.md` §6–§7). Testing on a phone with the live
camera: Android `adb reverse tcp:3000 tcp:3000` then open `localhost:3000/scan`
(the camera needs HTTPS or localhost).

Gates: `npm run typecheck && npm run lint && npm test && npm run build`;
`npm run test:e2e` for the Playwright + axe suite.

### The evidence pipeline

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
python3 -m pipeline.invariants      # structural invariants, no model, no network
python3 -m pipeline.selftest        # ~510 checks, no model, no network

# no model at all — proves the plumbing end to end
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --wiring
# Claude production — your Claude subscription, no key to provision
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate
# Grok backend (grok CLI, signed in) — stored and reported separately
.venv/bin/python run_pipeline.py magnesium --form magnesium_glycinate --grok --per-outcome --dose 400
```

`--dose` is your product's **elemental** mg. Without it the dose arc reads
"not assessable" and means it. Full guide: `docs/PIPELINE.md`.

Runs land in `reports/runs/` as immutable artifacts; the app serves the newest
non-invalid `*_dashboard.json` per ingredient × form, and the reviewer pages at
`/runs/<id>` render them. Every retained run is `public_claims_allowed: false`
until validated.

## What is actually verified

Examples from `python3 -m pipeline.selftest` (~510 checks, zero cost, no network):

| Test | Result |
|---|---|
| 3 papers sharing one NCT + 2 distinct trials | 5 → **3 units** |
| 9 clean RCTs | **+95** |
| 9 RCTs + **30 syntheses over the same 9** | E′/E = **1.24** (ceiling 1.30) |
| 9 RCTs + **1** synthesis vs **30** | **identical score** |
| 12 null-result RCTs | **−69** "does not work" |
| Works overall, but your form found nothing | effect **+0.43** vs form **−0.70** |
| No trial in your form | **69** vs 96 — penalised, not dropped |
| One weak trial | **3/100** — confidence multiplies, it does not average in |
| SR-table trial vs the same trial read directly | **0.72×** the weight |
| Animal + in vitro only | gate fires, **no number** |
| Retracted | zero weight |

## Docs

| file | what it is |
|---|---|
| **[`CLAUDE.md`](CLAUDE.md)** | the rules, workflow and current state. **Read before changing code.** (`AGENTS.md` points other agents there) |
| **[`docs/SPEC.md`](docs/SPEC.md)** | the scoring method in production (v14); §13 is every open question and uncalibrated constant |
| **[`docs/EVIDENCE_METHOD.md`](docs/EVIDENCE_METHOD.md)** | **adopted** successor (in progress): meta-analysis + GRADE certainty + letter grades, with phases and open decisions |
| **[`docs/PIPELINE.md`](docs/PIPELINE.md)** | what one extraction run does and how to run one |
| **[`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)** | the app: `/scan`, the API, the Evidence Ledger card, design system, history, sign-in, PWA |
| **[`docs/ANCHORS.md`](docs/ANCHORS.md)** | the 35-anchor calibration set (`docs/anchors.csv` is authoritative) |
| **[`docs/REVIEW_PENDING.md`](docs/REVIEW_PENDING.md)** | open questions and proposed constant changes awaiting the founder |
| **[`pipeline_v2_demo.excalidraw`](pipeline_v2_demo.excalidraw)** | how one run works, end to end; regenerated from the code by `scripts/write_demo_diagram.py` |
| **[`docs/history/`](docs/history/)** | closed audits, archives and the dated project log — not a task list |

## Status

**Deterministic core: built and tested** — retrieval, dedup, full-text ladder,
scoring, arcs, storage, reports. **Model layer: proven and runnable** on
subscriptions (S1–S8 schema-valid with evidence spans); the ceiling is
throughput, not access. **App: live** at `/scan` with one retained evidence run
(creatine monohydrate) and three exact Evidence Ledger audits.

**A method change was adopted 2026-10-03** (`docs/EVIDENCE_METHOD.md`, being implemented): the current score
is not yet a valid measurement — it fails its own creatine-strength sanity check —
and the proposal replaces its aggregation with standard meta-analysis + GRADE.

**Not yet true, and load-bearing:**

- **No constant is calibrated.** `k`, transfer factors, RoB thresholds, the OA
  penalty and the review-quality bands await the anchor eval. Do not read a
  score as accurate.
- **Extraction stability is unmeasured** and is the binding precision problem:
  rewording one prompt field moved scores by up to 15 points.
- **Coverage is 77.5%** of methods-level facts against an ≥80% target.
- **Retrieval specificity is the gating problem** — the ingredient must be
  constrained to the intervention, not the document.
- **SR inheritance adds ~nothing on creatine** (measured 2026-08-25; 0 of 32
  candidates entered evidence mass). Its value on thin corpora is untested.
