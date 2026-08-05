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

An RCT on 400 mg magnesium citrate, applied to a 100 mg magnesium oxide product,
carries `0.15 × 0.10 × 1.00 = 0.015` of its original weight. That discount is the
product.

## Output

A signed score, −100 to +100, per ECU.

```
d = Σ(wᵢ·sᵢ) / Σ(wᵢ)      direction      −1 … +1
c = 1 − e^(−E′/k)          confidence      0 … 1
H = weighted var(sᵢ)       heterogeneity   0 … 1

SCORE = 100 · d · c · (1 − 0.4H)
```

**A null result scores −0.7, not 0.** A product claims a benefit; a well-run
trial finding no effect is disconfirming evidence for that claim. This is what
lets `0` mean "inconclusive" and nothing else — no-data is caught by the
sufficiency gate, disagreement by `H`.

## The two traps this is built around

**Deduplication.** Thirty meta-analyses routinely re-analyse the same nine RCTs.
Counting them as independent breaks everything downstream — and an LLM asked to
merge similar conclusions will *correctly* observe they agree, reading one trial
pool as thirty corroborations. Dedup therefore happens at ingestion, in
deterministic code, keyed on `NCT > DOI > PMID > fingerprint`. Syntheses never
enter evidence mass; they contribute a multiplier capped at +30%.

**Transfer.** A single ingredient might have 360 possible ECUs of which the
literature populates 15. The other 345 are reached only by discounting evidence
across form, dose, and population distance. Those factors do most of the work in
the system and are its largest error source.

## Quick start

```bash
npm install -g @anthropic-ai/claude-code
claude login
pip install -r requirements.txt

python claude_adapter.py                                 # preflight
python -m pipeline.selftest                              # zero model calls
python run_coverage.py magnesium creatine ashwagandha    # zero model calls
```

Subagents run through Claude Code headless mode, so a Claude subscription is
enough for development. Set concurrency to 2 on subscription auth — it's built
for interactive work and 5+ concurrent agents hits limits within hours.
Production serving wants API billing (`ANTHROPIC_API_KEY=...`, nothing else
changes).

## Verified behaviour

`python -m pipeline.selftest` — all zero-cost, no network:

| Test | Result |
|---|---|
| 3 papers sharing one NCT + 2 distinct trials | 5 → **3 units** |
| 9 clean RCTs | +95 |
| 9 RCTs + **30 syntheses over the same 9** | E′/E = **1.24** (ceiling 1.30) |
| 12 null-result RCTs | **−69** "does not work" |
| Same 9 trials, wrong form + underdosed | +95 → **+4** |
| Same 9 trials, salt-family form | +78 (between, correctly) |
| Animal + in vitro only | gate fires, no number |
| Retracted | zero weight |

## Docs

- **[`CLAUDE.md`](CLAUDE.md)** — architectural invariants + multi-agent workflow. Read before changing code.
- **[`docs/SPEC.md`](docs/SPEC.md)** — full design, living document with changelog
- **[`docs/ANCHORS.md`](docs/ANCHORS.md)** — 28-anchor calibration set
- **[`pipeline_v1.excalidraw`](pipeline_v1.excalidraw)** — pipeline diagram

## Status

Design + deterministic core. Not production.

Untested against live endpoints: `run_coverage.py`, `sources/ratelimit.py`.
