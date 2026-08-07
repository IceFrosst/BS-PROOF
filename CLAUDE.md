# BS-PROOF — project instructions

Read this before touching anything. It encodes invariants that are not obvious
from the code and that a well-meaning refactor will destroy.

## What this is

A pipeline that scores supplement evidence at the level of
`(ingredient, form, dose_band, outcome, population)` — the **ECU** — and emits a
signed score from −100 to +100.

The differentiator: every competitor scores *ingredients*. This scores
ingredient × form × dose, and discounts evidence that doesn't match the specific
product. Full design in `docs/SPEC.md`.

---

## Hard invariants — do not violate these

### 1. Only **adapter** files may talk to a model

Allowed model boundaries (nothing else):

| File | Role |
|------|------|
| `claude_adapter.py` | Claude production (`--bare` + API key) |
| `pilot_adapter.py` | Claude subscription pilot (not production) |
| `grok_adapter.py` | Grok pure-function path (separate backend) |

Everything in `pipeline/` and `sources/` is deterministic. If you find yourself
importing an adapter into `scoring.py` or `dedup.py`, stop.

### 2. Subagents are pure functions, not agents

One shot, no tools, no loop, no ambient project memory when possible. Input JSON,
output JSON matching the schema, exit. If a subagent needs a second turn, the
**prompt** is wrong — do not raise turn limits to paper over it.

Claude production uses `--bare`. Grok path must be equivalently pure (no chat
memory, fixed prompt version, temperature 0).

### 3. Bump `PROMPT_VERSION` when you edit any prompt

Shared across Claude and Grok adapters. Forget, and caches silently serve stale
extractions.

### 4. Never invent a constant

`k`, transfer factors, RoB thresholds, OA penalty — guesses awaiting calibration.
Change → PR + `docs/SPEC.md`.

### 5. `null` is a valid answer everywhere

Never infer a field you cannot see.

### 6. Syntheses are data, not evidence

Meta-analyses add no evidence mass; bounded multiplier only (ceiling 1.30).

### 7. Nulls are negative

Well-run null trial → evidence against (`s_i = −0.7`), not “no data.”

### 8. The centre number never travels without its arcs

**Founder decision 2026-08-07.** Form, dose and population are OUT of `w_study`
(`APPLY_*_IN_WEIGHT = False`). The weight is study QUALITY only:
`design × RoB × size × funding × OA`.

Consequence, and it is not optional to state it: **two products differing only
in form or dose share a centre number.** The difference is carried by the arcs.
So a score published without its arcs is a false claim — no ranked table, no API
field, no "magnesium glycinate scores 52" in isolation.

Each arc carries a VERDICT and its COVERAGE. `0.00 @ 0%` ("nobody tested your
form") and `-0.70 @ 100%` ("your form was tested and failed") are opposite
messages and must never render the same.

The signed −100…+100 score is retained internally — bands, `docs/ANCHORS.md` and
every stored row depend on it. Only the DISPLAY is 0–100.

### 9. Dual backends: test separately, never silent-merge

**Founder decision 2026-08-06:** Claude and Grok extraction setups both exist and
must be **run and evaluated separately**.

- Same prompts/schemas/`PROMPT_VERSION`.
- Separate stores / report labels (`claude-pilot` vs `grok` vs production).
- **Never** blend field-level outputs from two providers into one Study without
  an explicit, logged rule. Default on disagreement: **discard or human review**
  (under-count), never “average” or “pick the higher score.”

---

## Extraction backends (three paths)

| Path | Auth | Reproducibility | Use for public claims? |
|------|------|-----------------|------------------------|
| **Claude production** `claude_adapter` | `ANTHROPIC_API_KEY` + `--bare` | Strongest (hermetic CLI) | Yes, when ready |
| **Claude pilot** `pilot_adapter` | Claude Pro/Max subscription | Weaker (no `--bare`) | **No** |
| **Grok pure** `grok_adapter` | `XAI_API_KEY` | Strong if API is pure + pinned model | Only after anchor eval |

```bash
# Claude pilot (subscription)
python3 run_pipeline.py creatine --form creatine_monohydrate --pilot

# Grok preflight (scaffold until XAI_API_KEY set)
python3 grok_adapter.py

# Wiring / no model
python3 run_pipeline.py creatine --form creatine_monohydrate --wiring
```

Wire `run_pipeline --grok` when the adapter is live; until then call
`grok_adapter.call` from a small pilot script or inject `call=` into workers.
Archive each backend’s run under `reports/runs/` with mode in the filename.

---

## Layout

```
claude_adapter.py          Claude production model boundary
pilot_adapter.py           Claude subscription pilot
grok_adapter.py            Grok pure-function boundary (separate tests)
workers.py                 fan-out; `call=` injectable per backend
run_pipeline.py            --wiring / --pilot (default limit 40)
scripts/write_demo_report.py
reports/runs/              immutable human-readable run archive
pipeline/arcs.py           4 arcs + the 0-100 composite            [NO MODEL]
pipeline/donut.py          arc rendering (SVG + terminal)          [NO MODEL]
pipeline/dose.py           effective dose band from benefit trials [NO MODEL]
pipeline/preview.py        small-run projection (never rescales k) [NO MODEL]
pipeline/*                 deterministic only
```

## Commands

```bash
python3 -m pipeline.selftest
python3 run_pipeline.py creatine --form creatine_monohydrate --wiring
python3 run_pipeline.py creatine --form creatine_monohydrate --pilot   # limit 40
python3 grok_adapter.py                                               # preflight
python3 -m pipeline.arcs        # (import-only module; see selftest for behaviour)
python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate
```

**Run `pipeline.selftest` after any change to `pipeline/`.**

---

## Reports archive

`reports/runs/` holds runs from the CURRENT `scoring.SCORING_MODEL` only;
`reports/archive/<model>/` holds earlier ones. Every report is stamped with a
`scoring_model:` line. After changing the scoring model, run
`python3 scripts/archive_reports.py --apply` — comparing runs across models is
reading a formula change as an evidence change.

Every human-facing demo goes under `reports/runs/` + `INDEX.md` + `latest.md`.
Commit and push. Never overwrite an old run file. Label provider in the report.

### Demo caps

| Stage | Cap |
|-------|----:|
| Retrieve max primaries | 150 |
| Retrieve max syntheses | 50 |
| Wiring score table | ≤ 40 RCT-rank |
| **Pilot default `--limit`** | **40** RCT-rank primaries |

Retrieval by **ingredient**; form only affects transfer matching.
Reviews (umbrella / MA / SR) are **fetched first** and ranked 1–3, but the main
pilot loop extracts **RCT-rank (4)** primaries. SR tables: `run_sr_inheritance.py`.

---

## Subagent roster

| ID | Job | Tier |
|---|---|---|
| S1 | design when tags ambiguous | A |
| S2 | synthesis / SR tables | B |
| S3 | study facts | B |
| S4 | RoB | B |
| S5 | conclusions | B |
| S6 | outcome → vocab | C |
| S7 | form / dose | B |
| S8 | funding | A |

Claude tiers: see `claude_adapter.TIER_MODEL`. Grok tiers: `grok_adapter.TIER_MODEL`.

---

## Multi-agent workflow (Claude Code + Grok + Codex)

- **Claude Code** — coding + Claude extractors.
- **Grok** — GitHub agent + **Grok extraction backend** (this file / `grok_adapter`).
- **Codex** — via `AGENTS.md` → here.

Rules: continue in-flight work; keep `Current state` / `Next` live; push completed
units; selftest after `pipeline/` changes; archive reports; **never silent-merge
Claude and Grok extractions.**

---

## Current state

**Scoring was redesigned 2026-08-07 (founder decisions). This supersedes any
earlier description of the score anywhere in the repo.**

`w_study = design × RoB × size × funding × OA` — study QUALITY only. Form, dose
and population are no longer in the weight; they are arcs.

**Four arcs**, each carrying a verdict AND the coverage behind it:

| arc | verdict | coverage |
|---|---|---|
| effect | d over all evidence | 1.0 |
| form | d over trials using YOUR form | share of evidence weight |
| dose | d over trials in YOUR dose band | share of evidence weight |
| evidence | — (pure quantity) | c |

```
composite (0–100, displayed) = 100 × c × mean(effect, form, dose)
signed (−100…+100, internal) = 100 × d × c × (1 − 0.4H)
```

A missing subset is penalised at its transfer tier, never dropped. Confidence
multiplies rather than averaging in — both were measured, see `docs/SPEC.md` §9.

`0–100` does not collapse "useless" into "unstudied", because the evidence arc
separates them: 1 weak trial → **3** with an empty evidence arc; 20 solid null
trials → **15** with a full one.

**Demo runs are FULL-TEXT ONLY** (`--pilot` / `--grok` default on). An
abstract-only study lands near `w = 0.023` and needs ~300 of its kind to reach
`c = 0.9`; a full-text study needs ~50. Same token cost, 6× the confidence.
`--all-oa` opts back in.

**Dose band is DERIVED** from the trials, not assumed: the observed min–max of
doses among *benefit* trials (`pipeline/dose.py`). Null-effect doses are reported
alongside — a product dosed where trials found nothing is the most useful warning
the axis can give.

**Coverage measured on the FULL corpus (20 155 records, 100%): 77.5%
methods-level facts, BELOW the ≥80% target.** Unpaywall adds exactly 0.0pp over
OpenAlex (measured head-to-head; they are not independent). SR-table inheritance
is the only remaining rung.

**Retrieval specificity is the gating problem.** `("magnesium") AND RCT` is 25%
IV/procedural magnesium; the supplement-scoped variant trades that for
wrong-ingredient noise (Astragalus, whey protein). Neither scope is right — the
ingredient must be constrained to the INTERVENTION, not the document.

**Model layer proven, production blocked.** S1–S8 all return schema-valid output
with evidence spans via `pilot_adapter` (subscription, non-production). `--bare`
reads only `ANTHROPIC_API_KEY`, never OAuth, so production extraction is blocked
on that key. The subscription has a hard throughput ceiling: a 10-study batch
burned 43 calls against the session limit.

**Open constants awaiting Tier-3 calibration:** `k`, transfer factors, RoB
thresholds, OA penalty. See `docs/SPEC.md` §13.

## Next

**Handoff:** scoring/reports/storage are consistent as of 2026-08-07. Anything
describing the score differently is stale — trust `pipeline/scoring.py`,
`pipeline/arcs.py` and this section.

1. **`ANTHROPIC_API_KEY`** — the only unblock for production extraction.
2. **Constrain retrieval to the intervention**, not the document. Gates
   extraction cost, coverage and outcome mapping simultaneously.
3. **SR-table inheritance uplift** — built, still UNMEASURED. The only path left
   to the 80% coverage target.
4. **Anchor eval** — 34/34 in-scope anchors have vocabulary; running them needs
   extraction. Do this before trusting any constant.
5. **Derive dose bands at scale** and bump `band_version` 0 → 1.
6. **Grok/Claude agreement table** on a fixed paper set. Never merge scores.
7. Venue factor (`Study.venue_ok` is still a boolean; SJR quartiles have nowhere
   to go until a real factor exists — new constant, so SPEC §13 first).

---

## Conventions

- Deterministic → unit tests. Model → anchor evals (per **provider**).
- Evidence spans on every model output.
- New constants → SPEC §13.
- Demo results → `reports/runs/` + push.
- Dual backends → separate runs, separate labels, no silent merge.
