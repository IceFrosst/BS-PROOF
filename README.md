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
displayed   0…100      = 100 × c × mean(effect, form, dose)
internal    −100…+100  = 100 × d × c × (1 − 0.4H)

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

```bash
pip install -r requirements.txt
python3 -m pipeline.selftest        # 236 checks, no model calls, no network
```

Then a real run. Pick exactly one backend:

```bash
# no model at all — proves the plumbing end to end
python3 run_pipeline.py creatine --form creatine_monohydrate --wiring

# Grok backend (grok CLI, signed in)
python3 run_pipeline.py magnesium --form magnesium_glycinate --grok \
        --per-outcome --dose 400 --limit 120

# Claude production — your Claude subscription, no key to provision
python3 run_pipeline.py creatine --form creatine_monohydrate
```

`--dose` is your product's **elemental** mg. Without it the dose arc reads
"not assessable" and means it.

## What is actually verified

`python3 -m pipeline.selftest` — zero cost, no network:

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
| **[`CLAUDE.md`](CLAUDE.md)** | the invariants, the workflow, and current state. **Read before changing code.** |
| **[`docs/SPEC.md`](docs/SPEC.md)** | full design; §13 is every open question and uncalibrated constant |
| **[`docs/ANCHORS.md`](docs/ANCHORS.md)** | the 28-anchor calibration set (not yet run) |
| **[`pipeline_v2_demo.excalidraw`](pipeline_v2_demo.excalidraw)** | how one run works, end to end. The one to show people. Regenerated by `scripts/write_demo_diagram.py`, which imports its constants from `pipeline/scoring.py` so it cannot drift |
| **[`docs/history/`](docs/history/)** | completed audits and sign-offs, kept for the record |

## Status

**Deterministic core: built and tested.** Retrieval, dedup, full-text ladder,
scoring, arcs, storage, reports — 236 selftest checks, no network required.

**Model layer: proven and runnable.** S1–S8 all return schema-valid output with
evidence spans. Both backends run on a signed-in subscription — nothing to
provision, no metered spend. The remaining ceiling is throughput, not access: a
subscription is rate-limited by time, so batch size and concurrency are the
things to tune.

**Not yet true, and load-bearing:**

- **No constant is calibrated.** `k`, the transfer factors, RoB thresholds, the
  OA penalty and the review-quality bands are all guesses awaiting the anchor
  eval. Do not read a score as accurate.
- **Coverage is 77.5%** of methods-level facts against an ≥80% target, measured
  on the full 20 155-record corpus.
- **Retrieval specificity is the gating problem.** `("magnesium") AND RCT` is
  ~25% IV/procedural magnesium. It has already produced a visibly wrong answer:
  creatine scored 22/100 "does not work" for muscle strength, because
  Parkinson's and HIV trials landed in that outcome.
- **SR inheritance is unmeasured.** Six defects that guaranteed it returned zero
  are fixed; it has never run end to end on a live backend.
