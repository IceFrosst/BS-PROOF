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

### 6. A synthesis DOCUMENT adds no evidence mass — the trials it describes do

**Amended 2026-08-08 (founder). Supersedes "syntheses add no evidence mass."**

The review is not evidence: a meta-analysis of 9 RCTs is not a 10th study, and
30 meta-analyses of those 9 are not 30 corroborations. Both are still prevented,
by canonical-id dedup and by `score_ecu` taking the **max** `cov` rather than a
sum. The review's only contribution to `E′` remains the bounded multiplier,
ceiling **1.30**.

But the trials in its tables are real trials with real patients. If the table
gives the facts S3/S4/S7 would have read off the paper, the trial is scored —
**once**, at the `sr_table` tier: `OA_FACTOR["sr_table"]` 0.85 × `rob_inherited`
0.85 = **0.72** of the weight of the same trial read directly.

Five refusals, none optional (`synthesis.derived_studies`):

| refusal | why |
|---|---|
| no direction → **discard** | `Study.direction` defaults to `null_effect` (−0.7). A missing result would silently become evidence *against* — the most dangerous default in the system |
| `unclear` → **discard** | same |
| no design → **discard** | `design_rank` spans a 250× weight range; assuming RCT because the review said it included RCTs is how a non-randomised trial gets full weight |
| already in corpus → **discard** | we scored the real paper; a second unit is the double-count this invariant exists to stop |
| reviews disagree on direction → **discard** | two teams read the same paper and reported different findings. This is the one fact that cannot be averaged or under-counted |

S2 extracts a `results_table` for this (`PROMPT_VERSION` v1.6). A pooled estimate
is **not** a per-study result and must never be distributed back onto the trials.

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

**Three model boundaries. Everything else is deterministic.**

```
claude_adapter.py     Claude production      --bare + ANTHROPIC_API_KEY
pilot_adapter.py      Claude subscription    development only, never a claim
grok_adapter.py       Grok CLI               separate store, separate report
workers.py            fan-out; `call=` injectable per backend      [MODEL via injection]
```

**Entry points**

```
run_pipeline.py              one ingredient end to end. --wiring / --pilot / --grok
                             default --limit: 100 grok, 40 pilot
run_sr_inheritance.py        measure SR-table uplift alone. --grok / --pilot / --claude
run_coverage.py              measure OA + methods-fact coverage. no model calls
scripts/write_demo_report.py write a human-readable run report
scripts/write_demo_diagram.py regenerate pipeline_v2_demo.excalidraw from the code
scripts/archive_reports.py   sweep old-scoring-model runs into reports/archive/
```

**`pipeline/` — deterministic, NO MODEL, unit-tested**

```
scoring.py       w_study, score_ecu, the bands. The formula lives here
arcs.py          4 arcs + the 0-100 composite
donut.py         arc rendering (SVG + terminal)
assemble.py      worker JSON -> Study objects -> scored ECU rows
dedup.py         canonical id: NCT > DOI > PMID > fingerprint
classify.py      design rank from PubMed tags; S1 only when ambiguous
retrieve.py      orchestrates discovery; scopes incl. per-outcome
synthesis.py     SR resolution, q_s checklist, SR-derived trials
synthesis_bridge.py  S2 batching, marginal-yield stopping    [MODEL via injection]
dose.py          effective dose band from BENEFIT trials
preview.py       small-run projection; refuses below n=20, never rescales k
relevance.py     pre-model gate: is this oral supplementation at all
predatory.py     venue flag (flag-only; the list is currently EMPTY)
showcase.py      top-N outcomes by published RCT count
storage.py       SQLite, postgres-shaped
vocab.py         forms, outcomes, populations, ECU key, polarity
selftest.py      236 checks. Run after ANY pipeline/ change
```

**`sources/` — deterministic, NO MODEL**

```
http.py          the one HTTP client: throttled, retried, disk-cached
europepmc.py     search + normalise; the discovery layer
clinicaltrials.py registry facts (RoB items 3 and 4)
oa.py            OpenAlex + Unpaywall green-OA resolution
fulltext.py      JATS parsing, section + TABLE extraction, PDF/HTML
ratelimit.py     token bucket per domain
```

**Data and output**

```
vocab/*.json     forms, outcomes (+polarity), populations
prompts/*.md     one per subagent; edit -> bump PROMPT_VERSION
schemas/*.json   one per subagent; the model must match these exactly
reports/runs/    immutable run archive, current scoring model
reports/archive/<model>/   runs from superseded scoring models
docs/history/    closed audits. NOT a task list
out/             sqlite stores + HTTP cache (gitignored)
```

## Commands

```bash
python3 -m pipeline.selftest
python3 run_pipeline.py creatine --form creatine_monohydrate --wiring
python3 run_pipeline.py creatine --form creatine_monohydrate --pilot   # limit 40
python3 run_pipeline.py magnesium --form magnesium_glycinate --grok --per-outcome
python3 grok_adapter.py                                               # preflight
python3 -m pipeline.arcs        # (import-only module; see selftest for behaviour)
python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate
python3 scripts/write_demo_diagram.py    # teammate-facing diagram of a run
```

**Run `pipeline.selftest` after any change to `pipeline/`.**

---

### Retrieval scopes

| scope | what it does |
|---|---|
| `broad` | ingredient anywhere. The legacy measurement baseline |
| `supplement` | + supplement terms, NOT clinical drug contexts |
| `intervention` | ingredient forced into TITLE/ABSTRACT as the thing tested |
| **`per_outcome`** | **one query per outcome, each with its own quota** |

`--per-outcome` exists because a single ranked query starves outcomes. Measured
2026-08-07: 62 magnesium sleep RCTs exist; a 20-study run off one generic query
surfaced **sleep_quality n=1**, while serum_magnesium took n=20. Sleep is the
main reason people buy magnesium glycinate.

Retrieval uses `search_terms` from `vocab/outcome.json` — BROAD, deliberately
different from `includes`, which is precise because S6 maps into it. Searching
the precise phrases returned **0** trials for sleep_onset.

### Grok model tiers

| tier | agents | model | why |
|---|---|---|---|
| A | S1, S8 | `grok-4.5` | simple classification; a cheaper id is wanted, see below |
| B | S2, S3, S4, S5, S7 | `grok-4.5` | extraction under adversarial conditions |
| C | S6 | `grok-4.5` | highest-risk agent; wants fewest hallucinations |

**`grok-4.3` is NOT a valid CLI model id.** Setting it made S8 fail 0/80 on the
2026-08-07 creatine run — `Couldn't set model 'grok-4.3': Invalid params` — and
every study read as a partial failure. The **pricing table is not the CLI's id
namespace**; run `grok models` and verify before setting any tier. `preflight`
now blocks placeholder ids.

Override with `SP_GROK_MODEL_A/B/C`. **S6 is ~5 of the ~10 calls per study**, so
tier C is the dominant cost, not tier A — a cheaper reasoning variant there is
worth ~24% *and* is the better model for the job.

Do not move tier B on cost alone: SPEC §15 says tiers are "a prior, not a
measurement" — A/B them on the 28 anchors first.

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
| Retrieve max syntheses | 120 (`SP_RETRIEVE_MAX_SYNTHESES`) |
| Wiring score table | ≤ 40 RCT-rank |
| **Pilot default `--limit`** | **40** RCT-rank primaries |

Retrieval by **ingredient**; form only affects transfer matching.
Reviews (umbrella / MA / SR) are **fetched first** and ranked 1–3, but the main
pilot loop extracts **RCT-rank (4)** primaries.

### Syntheses

`q_s` measures the **review**, never our corpus overlap. It was gated on
`resolved_fraction >= 0.5` until 2026-08-07 — the share of a review's included
studies we already held — which discarded a Cochrane review of 30 trials where
we had 6 (`q_s = 0`) while a thin review of 4 where we had 3 scored `1.00`.
Overlap reaches the score through `cov` in `score_ecu`, smoothly, and always did.
Quality now comes from `synthesis.REVIEW_ITEMS`, an AMSTAR-2-shaped checklist S2
reads off the review. `resolved` means only "S2 found an included-studies list".

`pipeline.synthesis.s2_payload` is the ONE payload builder. There were two, and
only the standalone script sent tables — the scored path sent flattened prose, so
S2 was asked to read a table it had never been shown (12/12 ok, 0 resolved).

```bash
python3 run_sr_inheritance.py creatine --limit 8 --grok    # or --pilot / --claude
```

One file per backend: `out/sr_inheritance_<backend>.json`. Never blended.

Founder 2026-08-07: **retrieve as many reviews as possible.** Query is
`PUB_TYPE:"Meta-Analysis" OR "Systematic Review" OR TITLE:"umbrella review" OR
TITLE:"overview of reviews"` (umbrella reviews have no PUB_TYPE, so they were
never searched for), cap `SP_RETRIEVE_MAX_SYNTHESES` = 400.

`SP_MAX_SRS` = 60 is a **ceiling on a loop that stops itself**, not a budget.
S2 runs in ranked chunks and stops after 2 consecutive chunks that name fewer
than 2 trials no earlier review named. 30 meta-analyses commonly re-analyse the
same 9 RCTs; the stop is on NEW TRIALS, so a rich corpus keeps going and a
repetitive one stops early.

**Scaling SRs cannot double-count evidence**, and only one of the three routes
needed new code:
1. *Evidence mass* — the synthesis DOCUMENT never enters `E` (invariant 6).
   400 reviews add 0.0. The trials they describe are separate units and are
   deduped by canonical id, so a trial named by 30 reviews is still one.
2. *The multiplier* — `score_ecu` takes the MAX `cov`, not a sum. 30 reviews of
   the same trials give ONE lift ≤1.30. Covered by a selftest.
3. *Inherited facts* — the real one. `synthesis.merge_inherited` resolves every
   review's rows to canonical ids, then: **worst RoB band wins**, **disagreeing
   `n` is refused** (different arms, and guessing moves `size_factor`), other
   fields only when unanimous. Conflicts are recorded, never smoothed.
   `n_reviews` is auditing only — reviews copy each other's inclusion lists, so
   counting mentions would be the citation-count trap.

The 12 are chosen by `synthesis_bridge.rank_syntheses`: **readable first**
(no PMC id → no table → the call cannot produce anything), then design rank,
then newest. `store.studies()` has no `ORDER BY`, so the cap used to be an
arbitrary insertion-order slice — measured on a 462-synthesis store, the first
12 rows held 7 unreadable and 3 unclassified.

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

### File ownership

**Founder decision 2026-08-07**, after three agents edited `pipeline/synthesis.py`
inside one hour and produced conflicts in four files plus two different fixes for
the same bug.

| Area | Owner | Others may |
|---|---|---|
| `pipeline/synthesis*.py`, `sources/fulltext.py`, S2 schema + prompt | **Claude Code** | open an issue, not a commit |
| `grok_adapter.py`, Grok tiers/models/CLI flags | **Grok** | read; Claude must not re-guess model ids |
| `pipeline/showcase.py`, report/demo presentation | **Grok** | — |
| `pipeline/scoring.py`, `arcs.py`, `dose.py`, SPEC §13 | **Claude Code** | propose in `docs/REVIEW_PENDING.md` |
| `run_pipeline.py`, `workers.py` | shared — **announce in the commit body first line** | |

Not ownership of ideas — Grok found the invalid `grok-4.3` id and the label
parser, both of which stood. It is ownership of the EDIT, so two agents stop
writing two fixes for one bug.

**Do not delete a comment recording a MEASUREMENT.** Commit `db5e9b9` stripped 52
lines from `sources/europepmc.py`, including the measured 25% clinical-context
rate and the sleep n=1 finding, while adding 14 useful ones. Those numbers cost
hours to obtain and cannot be recovered by reading the code. Restored in
`sources/europepmc.py`; if a refactor makes a docstring inconvenient, move it,
do not drop it.

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
methods-level facts, BELOW the ≥80% target.** Every additional OA resolver has
now been measured head-to-head against OpenAlex and every one adds **0.0pp** —
Unpaywall, Semantic Scholar (a strict subset: 17 vs 19 of 40, 0 new) and CORE
(keyless answered 20/40, 67 × HTTP 429, 0 new). They aggregate the same
repository network and are not independent draws. **Stop adding resolvers.**

**SR-table trials now enter evidence mass (2026-08-08, invariant 6 amended).**
The document still adds nothing; the trials it describes are scored once each at
`sr_table` (0.85 × 0.85 = 0.72 of a directly-read trial). Five refusals gate it
— see invariant 6. This was the largest source of evidence we were discarding,
and it is the reason SRs are now retrieved at scale (cap 400, extraction stops
itself on marginal yield).

**Outcome polarity is recorded** (`vocab/outcome.json`, 26 of 30; 4 deliberately
null). It converts a review's bare numbers into a direction: a CI spanning the
null is `null_effect` for anyone, and a CI excluding it reads as benefit or harm
once the outcome says which way is good. `cortisol`, `testosterone`,
`blood_pressure` and `glycaemic_control` keep refusing — lowering BP in a
normotensive is not a benefit.

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

**Handoff:** consistent as of **2026-08-08**. Anything describing the score
differently is stale — trust `pipeline/scoring.py`, `pipeline/arcs.py`,
`pipeline/synthesis.py` and this section.

Changed 2026-08-08: invariant 6 amended (SR-table trials enter `E`),
`PROMPT_VERSION` v1.6 (S2 `results_table` + per-study `design`), outcome
polarity added, SR retrieval scaled with marginal-yield stopping, file
ownership table added under Multi-agent workflow.

1. **`ANTHROPIC_API_KEY`** — the only unblock for production extraction.
2. **Constrain retrieval to the intervention**, not the document. Gates
   extraction cost, coverage and outcome mapping simultaneously.
3. **SR inheritance uplift is still UNMEASURED** — and it is now the biggest
   unknown in the system, because SR-derived trials MOVE SCORES rather than only
   confidence. Six defects that guaranteed zero are fixed (payload builder,
   table filter, `q_s`, arbitrary cap slice, backend lock-in, missing direction);
   nothing has yet been run end to end on a live backend. Do this before
   trusting any number from a `--with-sr` run.
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
