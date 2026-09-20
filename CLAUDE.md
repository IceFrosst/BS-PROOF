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
| `claude_adapter.py` | Claude production (subscription + `--safe-mode`) |
| `pilot_adapter.py` | Claude subscription pilot (not production) |
| `grok_adapter.py` | Grok pure-function path (separate backend) |
| `label_adapter.py` | Reads a supplement LABEL off an uploaded image, via the local CLI (added 2026-08-21) |
| `lib/analyze/llm.ts` | **The deployed app's ONE model transport (since 2026-09-07).** Every model call the site makes goes through `chat`/`chatJson` here: the label vision read (prompt and contract in `lib/analyze/vision.ts`, same `prompts/label.md` as `label_adapter`), the ingredient-compatibility fill-in (`prompts/compatibility.md`), the company profile (`prompts/company.md`) and the funding-independence / publication-bias literature disclosures (`prompts/literature_warnings.md`) behind `POST /api/scan`. Default provider is **DeepSeek** (`DEEPSEEK_API_KEY`; `VISION_API_KEY`/`GEMINI_API_KEY` still read); `MODEL_API_URL`/`LABEL_MODEL`/`TEXT_MODEL` swap providers with no code change. Temperature 0, one shot, JSON validated by Ajv against `schemas/*.json`. Model text from the text prompts is displayed under a "model knowledge — unverified" badge and **never enters a score** — see `docs/SYSTEM_DESIGN.md` |

`pipeline.invariants` enforces the Python side by AST and the TS side by scan:
model-API markers (`chat/completions`, provider SDK imports, key env vars) may
appear only in `lib/analyze/llm.ts`; a second call site fails the gate.
Everything else under `lib/analyze/` is deterministic — ports of `pipeline/`
functions, pinned to Python-computed golden values by
`tests/analyze-parity.test.ts` — plus the curated, cited
`vocab/compatibility.json` lookup and the openFDA registry fetch, neither of
which touches a model. Each prompt has its own version constant and cache
domain (`LABEL_PROMPT_VERSION`, `COMPAT_PROMPT_VERSION`,
`COMPANY_PROMPT_VERSION`, `LITERATURE_WARNINGS_PROMPT_VERSION`), the same
discipline as the label domain below.

Everything in `pipeline/` and `sources/` is deterministic. If you find yourself
importing an adapter into `scoring.py` or `dedup.py`, stop.

### 2. Subagents are pure functions, not agents

One shot, no tools, no loop, no ambient project memory when possible. Input JSON,
output JSON matching the schema, exit. If a subagent needs a second turn, the
**prompt** is wrong — do not raise turn limits to paper over it.

Claude production uses `--safe-mode` (not `--bare` — see the backends table).
Grok path must be equivalently pure (no chat memory, fixed prompt version,
temperature 0).

**One call per STUDY is still a pure function; one call per CLAIM was just
expensive.** S6B maps every claim in a study in a single call under the same
rules and the same bar for null, and matches results back BY INDEX so a
reordered or short response cannot shift a mapping onto the wrong claim.

**THE ONE EXEMPTION, and it is not the S1–S8 fleet.** `label_adapter` reads a
photo of a supplement label, and it **must** use the `Read` tool: the Claude CLI
has no flag that passes an image inline (`--file` fetches a remote resource by
id; there is no `--image`), so allowing exactly one tool is the only route to a
vision read. Verified 2026-08-21 on CLI 2.1.237. It is narrowed everywhere else
instead — one tool and no other, `--add-dir` scoped to the image's own directory,
`--safe-mode`, `--max-turns 3` — and invariant 2's reasoning still applies inside
that box: a read needing more turns is a prompt bug, so do not raise the limit.
S1–S8 remain tool-free. Do not cite this exemption for an extractor.

### 3. Bump `PROMPT_VERSION` when you edit any prompt

Shared across Claude and Grok adapters. Forget, and caches silently serve stale
extractions.

**`prompts/label.md` is a SEPARATE cache domain** (`label_adapter
.LABEL_PROMPT_VERSION`), deliberately not this constant. Bumping the shared
version invalidates every cached S1–S8 extraction — ~1000 calls on the current
creatine corpus, hours of re-extraction — and a reworded label prompt has nothing
to do with how a paper was read. Two prompts with unrelated blast radii must not
share a cache key. Invariant 3 still applies *within* the label domain.

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

### 7. Nulls are negative — but only a WELL-RUN null, and only against a real control

Well-run, quantified null trial → evidence against (`s_i = −0.35`), not “no data.”
An unsigned nonsignificant efficacy estimate (including a sub-threshold magnitude)
is `inconclusive_unquantified` with `s_i = 0` before any sign rescue; a signed
measured zero remains negative. Only a typed successful equivalence/non-inferiority
basis with explicit margin value+unit and compatible estimate/CI semantics restores
−0.35. Safety harm and valid observational safety signals bypass this efficacy
counterfactual firewall and retain their existing harm behavior.

**Amended 2026-08-10.** "Well-run" was doing unenforced work. Two classes of
trial were entering at the full −0.7 while answering a different question, and
`pipeline.assemble._ineligible` now refuses both. Measured on the 80-study
creatine corpus: of the 23 null verdicts driving `muscle_strength` and
`muscle_power` negative, five verifiers reading the actual papers found **11
that are not evidence against creatine at all**.

| refusal | why |
|---|---|
| `comparator == "all_arms_get_ingredient"` | every arm took the ingredient. The trial compares morning vs evening, one dosing schedule vs another, or ingredient+X vs ingredient. One such paper states it outright — *"a control group that did not consume the Cr supplement was not considered necessary given the high level of scientific evidence that exists on how Cr improves performance"* — and 1RM rose in **both** creatine arms. We scored it −0.7 against creatine |
| `self_declared_underpowered is True` | the AUTHORS say the trial could not answer the question: a CONSORT pilot/feasibility design (n=8 per arm, no power calculation), or a stated a priori target it missed — 33 of 42, 28 of 48, 22 of 34 |
| `ingredient_isolated == "no"` | **added 2026-08-10 (decision delegated by the founder).** Every ingredient arm co-administers another active — creatine+HMB vs placebo, a MIPS blend vs placebo. The control is genuinely ingredient-free, so the first refusal cannot fire, but the trial tests a COMBINATION and says nothing about the ingredient alone in either direction. 21 of 143 audited studies were this shape; one carried significant strength benefits that were never credited while its null endpoint voted −0.7 |

All three are **scope** rules, the same shape as invariant 6's five refusals,
not discounts — down-weighting would still be counting the wrong answer, quietly.

Two properties that are not optional:

- **The underpowered refusal is SYMMETRIC.** A pilot's *benefit* is dropped too.
  Dropping pilot nulls while keeping pilot benefits is the one-way handling of
  uncertainty this whole investigation was opened to find.
- **Both fields default to KEEP.** `unknown` / `null` / absent never excludes,
  and S3 is told to answer `unknown` when unsure. A hesitant extractor loses no
  evidence; it only fails to gain the refusal.

Never infer either from the numbers. A small trial is not automatically
underpowered, and "placebo-controlled" in a title does not mean the placebo arm
was ingredient-free — *HMB + creatine vs creatine + placebo* is placebo-
controlled and has no creatine-free arm.

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
| **Claude production** `claude_adapter` | Claude subscription + `--safe-mode` | Strongest (hermetic CLI) | Yes |
| **Claude pilot** `pilot_adapter` | Claude subscription | Weaker (empty-cwd trick) | **No** — superseded |
| **Grok pure** `grok_adapter` | Grok CLI, signed in | Strong if pure + pinned model | Only after anchor eval |

**EXTRACTION runs on subscriptions — S1–S8 have no metered model spend and no
key to provision; the only auth question is whether the machine is signed in.**
**The deployed label read is the one call on an external API key (founder
decisions 2026-08-22, in one day: Anthropic → DeepSeek → "find a free api"):**
`lib/analyze/vision.ts` defaults to the **Gemini free tier** (`GEMINI_API_KEY`
from AI Studio, no card, ~1,500 image reads/day — so at the default provider the
whole pipeline is still $0 marginal). `VISION_API_URL`/`LABEL_MODEL` can point
it at any OpenAI-compatible endpoint instead (DeepSeek's
`deepseek-v4-flash-vision-exp`, Groq, OpenRouter), which IS metered — a config
choice, not a code change. Either way: do NOT cite this boundary as precedent
for moving an extractor onto an external API. `--safe-mode` is what makes the
subscription path legitimate: it disables
CLAUDE.md, skills, plugins, hooks, MCP and custom agents while leaving auth
working, so a subscription call is now as hermetic as `--bare` was. Measured
2026-08-09 with the canary experiment `pilot_adapter` documents — see the
`claude_adapter` module docstring for the before/after and the residual
differences.

```bash
# Claude production (subscription)
python3 run_pipeline.py creatine --form creatine_monohydrate

# Grok preflight
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
claude_adapter.py     Claude production      subscription + --safe-mode
pilot_adapter.py      Claude subscription    superseded; kept for --pilot
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
predatory.py     venue flag (flag-only; 1162 PUBLISHERS, matched publisher-side)
showcase.py      top-N outcomes by published RCT count
storage.py       SQLite, postgres-shaped
vocab.py         forms, outcomes, populations, ECU key, polarity
invariants.py    structural invariants: model boundary (AST, not grep), offline
                 imports, agent wiring. Zero tokens. Run with selftest
selftest.py      433 checks. Run after ANY pipeline/ change
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
python3 -m pipeline.invariants   # structural gate; pairs with selftest
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
measurement" — A/B them on the 35 anchors first.

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
| S6 | outcome → vocab (per claim; legacy) | C |
| S6B | outcome → vocab, WHOLE STUDY in one call (default) | C |
| S7 | form / dose | B |
| S8 | funding | A |

Claude tiers: see `claude_adapter.TIER_MODEL` and `TIER_EFFORT`. Tier C is
`claude-sonnet-5` at `--effort high` since 2026-08-09 — measured against
opus-5 and opus-4-8 on 7 studies, same mappings, zero conflicts, −36% on the
agent that dominates cost. `SP_MODEL_C=claude-opus-5` reverts. Grok tiers: `grok_adapter.TIER_MODEL`.

---

## Multi-agent workflow (Claude Code + Grok + Codex)

- **Claude Code** — coding + Claude extractors.
- **Grok** — GitHub agent + **Grok extraction backend** (this file / `grok_adapter`).
- **Codex** — via `AGENTS.md` → here.

Rules: continue in-flight work; keep `Current state` / `Next` live; push completed
units; selftest after `pipeline/` changes; archive reports; **never silent-merge
Claude and Grok extractions.**

**Worktree-first / deploy-on-push** (founder, 2026-08-12): `IceFrosst/BS-PROOF`
is Git-connected to the `bs-proof-dashboard` Vercel project, so every push to
`main` deploys to production automatically. Make changes in a working
tree/worktree first and only push to `main` later, once verified (both gates
green). Never push half-done work to `main`.

### Claude Code helper agents (`.claude/agents/`) — NOT the S1–S8 fleet

"Subagent roster" above means S1–S8, the pure-function extractors. These are
something else: five **read-only** Claude Code helpers. None has `Edit`, `Write` or
`MultiEdit`, so the main session stays the only writer.

A helper costs **~31.5k tokens** to exist, so delegate only when it reads far more
than it reports back. That ratio is the whole test — not whether the role sounds
useful.

| helper | model | use it for |
|---|---|---|
| `run-triage` | haiku | a finished run's artifacts. `*_dashboard.json` is 311 KB and `*_context.json` 333 KB — it projects fields, never `Read`s them |
| `node-gates` | haiku | typecheck → lint → vitest → build → e2e, stop on first failure |
| `paper-verifier` | sonnet | one study vs its actual full text; fan out ~5 at a time |
| `score-tracer` | sonnet | why one number is that number; the interpreter supplies every value |
| `spec-drift` | sonnet | whether a claim in this file or SPEC.md still matches the code |

**Do not delegate:** anything that edits a file, or any deterministic gate — the
hooks in `.claude/settings.json` already run `pipeline.invariants` and
`pipeline.selftest` after every `pipeline/`, `sources/` or `vocab/` edit, in ~0.5s
for zero tokens. A subagent to run a 0.5s script costs 31.5k tokens to save 8k.

Four hooks, all zero-token: the gates above; an invariant-3 warning when a prompt
or schema is edited without a `PROMPT_VERSION` bump; an invariant-4 warning when a
constant in `scoring.py` moves off its last verified value; and a block on running
`run_pipeline.py` (or any network entry point) with bare `python3`, which lacks
`httpx`. Note `python3 -m pipeline.selftest` and `-m pipeline.invariants` are
correct on the bare interpreter — they are offline by design and a check keeps them
that way.

**Agent teams** are enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`). One hard
rule: **never run a team during a production extraction.** Teammates draw on the
same subscription session limit that cost the 2026-08-10 00:06 run ~145 calls, and
a truncated extraction is worthless. Also, a helper definition used as a *teammate*
has its body appended rather than replacing the system prompt, so its "never edit"
rule stops being the only instruction — `score-tracer` and `spec-drift` are
therefore unsafe as teammate types. Use them as subagents.

### File ownership — one owner, verify-after

**Founder decision 2026-08-10. Supersedes the 2026-08-07 peer-ownership table.**

**Claude Code owns every file in this repository.** Grok and Codex are helpers.
They **may write** — no file is off limits to them — but every change they make is
**verified by Claude Code afterwards**. Nothing a helper commits is production
behaviour until it has been through that check.

| | |
|---|---|
| **Owner of record** | Claude Code, all paths |
| **Helpers** | Grok, Codex — write freely, no permission needed |
| **The one duty** | Claude verifies every helper change after the fact |
| **How** | `python3 scripts/verify_helpers.py` — lists unverified helper commits, flags the ones touching scoring or extraction, and runs the deterministic gates |

Why this replaced the table rather than tightening it: the 2026-08-07 incident —
three agents editing `pipeline/synthesis.py` in one hour, four conflicted files,
two different fixes for one bug — was a **concurrency** failure, not an authority
failure. A table of peers arbitrated *who may edit*, which is the wrong axis. One
owner plus after-the-fact verification fixes the actual problem: there is always
exactly one account of what the code should do, and it is checked.

Two things carry over unchanged, because neither was about ownership:

- **Grok model ids must be verified with `grok models` before being set.**
  `grok-4.3` is not a valid CLI id; setting it failed S8 **0/80** on the
  2026-08-07 run, and every study read as a partial failure. The pricing table is
  not the CLI's id namespace. This is a measurement, not a courtesy.
- **Constants still go through `docs/REVIEW_PENDING.md` and SPEC §13** (invariant
  4). Sole ownership is not licence to change `k`, a transfer factor, the RoB
  thresholds, `S_VALUE`, `H_PENALTY` or `H_NORM` — those are founder calls, and
  owning the file does not make them Claude's to decide.

Not ownership of ideas. Grok found the invalid `grok-4.3` id and the label parser,
both of which stood; the verify-after duty exists to catch mistakes, not to
discount contributions.

**Do not delete a comment recording a MEASUREMENT.** Commit `db5e9b9` stripped 52
lines from `sources/europepmc.py`, including the measured 25% clinical-context
rate and the sleep n=1 finding, while adding 14 useful ones. Those numbers cost
hours to obtain and cannot be recovered by reading the code. Restored in
`sources/europepmc.py`; if a refactor makes a docstring inconvenient, move it,
do not drop it.

---

## Current state

- **2026-09-16 (preview branch `preview/restore-four-evidence-lines`, not on main):** `/scan` evidence uses outcome tabs: General score mean tile; outcome bars whose hue runs red→amber→green by score and whose saturation/lightness follows evidence coverage; four full-width tracks inside each outcome. Caveats/disclosures collapse behind one `N warnings` summary while the validity banner stays visible. The lab A/B card matches and keeps Hero + Overlap only. Visible “Test rubric” stamps are removed. **Four founder corrections landed later the same day, presentation only, on BOTH surfaces:** (1) the warnings summary is one clean row — the “disclosure only, no score penalty” / “Open before deciding” sub-lines are deleted and the count alone is the label; (2) a funding or publication-bias warning is built **only for a real concern**, filtered by status at the source in `app/design-lab/ab/evidence-warnings.ts` (unknown / no-concern / not-assessed build nothing, so an outcome with no concern shows no warnings block at all — 2 of the 30 retained audit outcomes now carry one; `literatureDisclosures` on `/scan` already gated on `concern` and is unchanged); (3) the `⚑` gates flag strip is removed from the lab card (`score()` still computes `firedGates`, the caps are still stated in the Evidence row); (4) each outcome row is now ONE unit — name + percentage + a single chevron on line 1, population under it, the full-width bar across the bottom, no lone “More” link, still one focusable 44px+ control with a ring around the whole row. Height @390 4226px, 0px overflow. Refs `docs/design/ref/tabs-preview/`, `public/previews/`; doc `docs/design/2026-09-16-scan-design-system.md`. Tests: `tests/scan-result-state.test.tsx`, `tests/effect-presentation.test.ts`, `tests/evidence-warnings.test.tsx`. **Later the same day, four more warning kinds were added to that same collapsed block on the LAB CARD ONLY** (`app/design-lab/ab/evidence-warnings.ts` + `prototype.tsx`; `/scan` already carried the first three in its own bundle and was left untouched, pinned by a source-text test): `multi_ingredient_product`, `servings_not_stated`, `mlm` (product-level, printed in that order first) and `no_human_controlled_trial` (outcome-level, then funding, then publication bias). The first three reuse the EXACT shipped wording — the two caveat texts out of `lib/analyze/scan.ts` and, for MLM, the title/body returned by calling production `businessModelDisclosure()` — so the two surfaces cannot drift; MLM keeps its production semantics (a disclosure that never changes a number). **The honesty constraint is enforced by construction:** the three product-level facts come only from an optional, per-scenario `ProductDeclarations` that defaults to absent, and the three REAL audits (creatine, vitamin D, magnesium) plus the three effect-only research passes declare nothing, because they are single-ingredient products with a stated daily dose and no known MLM seller — a test renders all 30 retained audit outcomes and asserts none of those three ids or strings ever appears. The flags are set only on clearly-labelled FICTIONAL samples where they are true by construction: the blend (`none`, “Sample blend D · 2 capsules”, a proprietary multi-active whose own text says “amounts per ingredient not printed” and whose dose has no servings per day) carries multi-ingredient + servings-not-stated, and `thin` (“Sample extract C”) carries the MLM flag with its fictional seller named as fictional in the picker, the footnote and a stamp inside the row. `no_human_controlled_trial` is derived from real ledger data (`gates.rctCount === 0`, the same condition that makes `score()` cap certainty at 0 and show no number) so it DOES fire on a real audit — magnesium “Diagnosed anxiety disorder” — which is correct, and it is described as a cap, not a disclosure. Nothing firing still renders no block. Shots `docs/design/ref/tabs-preview/2026-09-16-lab-warning-*.png`; `public/previews/lab-warning-{collapsed,open}.png` refreshed from the blend-D pair.

**Preview-only — `/scan` restores the four prominent evidence tracks without reverting the compact
result state.** On branch `preview/restore-four-evidence-lines`, each outcome card again gives **Does
it work? / In your form? / At your dose? / Well studied?** its own full-width horizontal track,
stacked vertically, with restrained teal / blue / coral / gold identity. The written dimension names,
values and coverage remain the meaning; hue is only a scanning aid. Coverage is printed beside every
value, and exactly 0% is a striped track labelled **“0% · untested”**, so untested evidence cannot
resemble a full, negative result (invariant 8). This changes only `components/scan-flow.tsx`, scoped
`/scan` CSS, result-state tests and design documentation: scoring, API, prompts, schemas and analysis
are untouched. The `8e9f48f` state model remains intact — result replaces capture UI, warnings and
technical facts stay collapsed, `Scan another` stays at both ends, and the report remains far shorter
than the pre-redesign version. Final built-app captures measure **5227px at 390** and **5445px at 360**,
with 0px horizontal overflow (versus 9911px / 10424px before the redesign); references are under
`docs/design/ref/four-lines-preview/`. This is a local preview, not a shipped or deployed change.

**2026-09-16 — `/scan` design pass: a phone-first design system, and the result is now its own
STATE.** Founder brief: "coherent, simplistic but look scientific … world class, not vibecoded … phone
optimised." Two things shipped in `components/scan-flow.tsx` + the `/scan` block of `app/globals.css`
(scoped to `.scan-page` / `.sc-*` / `.scan-*`; shared `.la-*` rules untouched, overridden under
`.scan-page`), with **no change to `lib/analyze/**`, `app/api/**`, any prompt, schema or scoring
constant**:

1. **The "no results after photo" bug.** The staged photo and its three buttons used to stay on top and
   the report rendered below the fold. Now `landing → staged → loading → result | error` each own the
   viewport: on an answer the capture chrome unmounts, a compact scanned-product header (thumbnail or
   typed chip, name, brand, **Scan another**) takes the top, and focus + scroll move to it (instant
   under `prefers-reduced-motion`). Loading is a progress panel (dimmed thumbnail, indeterminate bar,
   stage list with the current step marked; the Google "Save your result" card is its one CTA when
   configured) — never a greyed "Scanning…" pill. `Scan another` is repeated at the end of the report;
   nothing is sticky.
2. **The report halved without losing a fact**: 9911 → 4919 px at 390 wide (10424 → 5137 at 360),
   composite on the second screen, zero horizontal overflow. One "Before you read the score" stack
   holds the run-validity banner (always open, above the first number) and the caveats + funding /
   publication-bias / MLM disclosures as one-line `<details>` rows (same `la-alert la-alert-warn` class,
   `role="note"`, render-only-on-concern — unchanged; MLM moved here from the company card, which now
   points to it). Each outcome card: name, verdict word, the 0–100 as the page's single 40px bold
   moment, and the **four arcs as one-line rows (label, verdict, coverage track, coverage %)**; a 0%
   arc gets a striped track and the words "0%, untested", so `0.00 @ 0%` and `−0.70 @ 100%` cannot look
   alike (invariant 8, pinned). Label facts, the model's recalled company facts, the badge legend and a
   Technical details block (run parameters, models, per-stage timings, prompt versions, `run_id`,
   `app_version`, persistence, /methodology link) are collapsed `<details>`, all still in the DOM.

Tokens: one neutral ramp on pure white (no cream, no shadows on the report) and two accents with one
meaning each — green = a trial measured this, amber = a model recalled this / read before trusting a
number (the dashed amber **Model knowledge** badge is the one marker; every other badge is one quiet
outlined family in sentence case). System type stack, scale 13/15/17/22/28/40, tabular numerals, no
ALL-CAPS eyebrows, no middle-dot meta strings. `app/manifest.ts` `background_color` back to white.
axe: zero violations on landing / sheet / staged / loading / result at Pixel 7 width (the hidden file
inputs gained `aria-label`s). Design doc with tokens, state model, wireframe and the list of template
tells removed: `docs/design/2026-09-16-scan-design-system.md`; screenshots `docs/design/ref/{before,after}/`
(`scripts/design_shots.mjs` now also captures result tiles and the manual / 503 / not-a-label /
not-supported states); `docs/SYSTEM_DESIGN.md` §1e. Tests: `tests/scan-result-state.test.tsx` (capture
chrome gone + focus moved, validity before first score, one warn-alert family, invariant-8 arc
rendering, collapsed facts reachable, typed ≠ read); `tests/pwa.test.ts` re-pinned. **Unverified on a
real phone** — screenshots are Playwright iPhone 13 / Pixel 5 emulation with a fake camera.

**2026-09-16 — durable scan-run history for `POST /api/scan`, and an MLM / direct-selling disclosure
on the company profile.** Two changes, kept separate in scope, landed together:

1. **Every ACCEPTED manual or photo scan is now durably recorded** — not just answered.
   `lib/scan-history/store.ts` (same shape as `lib/waitlist/store.ts`: server-only `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`, plain `fetch`, no SDK) writes one row per run to `public.scan_runs`
   (`docs/scan-history.sql`, idempotent — private bucket, RLS enabled, no anon policies): the
   COMPLETE returned `ScanAnalysis` JSON, the request facts (never image bytes/base64), the terminal
   status/error, and the exact app release (`package.json` version plus, on Vercel, the git
   SHA/ref/deployment id/environment/URL). A photo's original image goes to the **private**
   `scan-images` Storage bucket; only its bucket, path, MIME type, byte size and SHA-256 are stored in
   the row. `app/api/scan/route.ts` generates the run id (`crypto.randomUUID`) **before** calling
   `analyzeScan`/`analyzeManual` and attaches `run_id` / `app_version` / `persistence` to the response
   **after** they return — neither orchestration function knows history exists, so their existing
   tests (`tests/scan.test.ts`, `tests/scan-manual.test.ts`) needed no change. Persistence is honest by
   construction: `persistence.status` and `persistence.image.status` are `stored` / `unavailable` /
   `failed` (`not_applicable` for a manual run's image) and are **never** `stored` unless the write
   actually succeeded, reported separately because a row can be written while its image fails. With no
   Supabase project configured, a scan still answers normally (`unavailable`, local/test builds need no
   credentials); `SCAN_HISTORY_REQUIRED=1` makes it **fail closed** — refuses up front
   (`scan_history_required_unavailable`, 503) when unconfigured, and discards a completed analysis in
   favour of `scan_history_required_failed` (500) when the durable write itself fails. A DB insert
   failure after a successful image upload best-effort deletes the orphaned image. No public read
   endpoint and no signed image URL exist anywhere — reading this data back is a Supabase SQL editor
   job. Design: `docs/SYSTEM_DESIGN.md` §6. Tests: `tests/scan-history.test.ts`,
   `tests/scan-history-route.test.ts` (payload shape, image hashing/storage, app version, orphan
   cleanup, fail-closed route behaviour, no-secret/browser leakage).
2. **The company model profile gained a conservative MLM / direct-selling read**
   (`CompanyProfile.business_model`: `confirmed_mlm` | `suspected_mlm` | `no_evidence` | `unknown`,
   each with a short `basis` and a `confidence`; `unknown` is the mandatory default whenever the model
   is unsure). `COMPANY_PROMPT_VERSION` bumped to `company-v1.1`. `confirmed_mlm` / `suspected_mlm`
   render the **same warning visual language already used elsewhere on `/scan`** for disclosures
   (`.la-alert.la-alert-warn`), titled "MLM / direct-selling business model" — never "pyramid scheme"
   or any claim of illegality — captioned "Model knowledge — unverified" and explicit that it never
   affects the evidence score; `no_evidence` / `unknown` render nothing at all (founder: only show it when
   confirmed or suspected). The type and the pure rendering decision live in the new, browser-safe
   `lib/analyze/business-model.ts` (split out of `lib/analyze/company.ts`, which imports `node:fs`, so
   the client component never pulls a filesystem import into the bundle). Design:
   `docs/SYSTEM_DESIGN.md` §1b. Tests: `tests/company-business-model.test.ts` — schema/defaults,
   rendering wording (asserts neither "pyramid scheme" nor "illegal" ever appears), and a direct proof
   that two runs identical except for `business_model` produce byte-identical
   `product`/`evidence`/`dose_effectiveness`, plus a source-text check that no scoring file (Python or
   TypeScript) mentions the field at all.

Neither change touches scoring constants, prompts other than `company.md`, `app/page.tsx`, `/`, or any
Python file under `pipeline/`. Gates at hand-off: 379 unit tests, typecheck, ESLint, both Python gates,
production build.

**2026-09-16 — two model-decided literature disclosures added to the live `/scan` page: funding &
independence and publication bias, "decided by the system prompt" the same way the MLM disclosure is.**
New module `lib/analyze/literature-warnings.ts` (own prompt `prompts/literature_warnings.md`, own
schema `schemas/literature_warnings.json`, own cache domain `LITERATURE_WARNINGS_PROMPT_VERSION =
"literature-warnings-v1.0"`) asks, per ingredient/form, whether the published trial base looks
industry-funded and whether the published record shows signs of selective reporting; each topic answers
`concern` | `no_concern` | `unknown`, `unknown` being the mandatory default whenever the model is not
sure and `concern` requiring a specific, named reason rather than a general impression. This is a
**DISCLOSURE about the evidence as a whole, never a claim that a result is wrong**, and it is wired into
`analyzeFromLabel` to run for **every** scan — scored, not-scored and ingredient-not-supported — in
parallel with stages 2b/4/5 under the same time-budget gating, and it degrades to `unavailable` on its
own like every other model section. The type and the pure rendering decision
(`literatureDisclosures`) live in the new, browser-safe `lib/analyze/literature-disclosures.ts` (same
split as `business-model.ts` / `company.ts`, so the client component never pulls a filesystem import
into the bundle): only `concern` renders a `.la-alert.la-alert-warn` box, titled "Funding &
independence" or "Publication bias", captioned "Model knowledge — unverified", stating the basis,
listing funders/signals and confidence, and explicit that it does not affect the evidence score;
`no_concern`, `unknown` and every unavailable/skipped state render nothing. Rendered on `/scan`
immediately under the caveat warnings, before the Evidence section, since the disclosures concern the
evidence as a whole. Design: `docs/SYSTEM_DESIGN.md` §1c. Tests: `tests/literature-warnings.test.ts`
(schema/defaults, the pure rendering decision, orchestration proving the section on all three scan
paths, a byte-identical pin of `product`/`evidence`/`dose_effectiveness` with the section present or
unavailable, a time-budget skip, and a source-text check that no scoring file mentions it) and
`tests/literature-warnings-render.test.tsx` (the rendered page, confirming neither "fraud" nor
"fabricated" ever appears). Touches no scoring constant, no other prompt, and no deterministic block.

**2026-09-15 — `/scan` redesigned (founder-approved option 1): pure white, phone-first, scanning owns
the first viewport, plus a real manual search path.** The page is the transparent green-frame /
white-bottle / blue-pixel mark (`public/scan-mark.svg`, derived from the app icon by
`scripts/write_scan_mark.mjs`; a test pins the two together), one headline, **Take a photo**
(primary) and **Upload an image** (secondary), an "or" divider and an expandable **Search for your
supplement** control. Measured on a Pixel 7: the whole stack ends at 666 of 839 px; on a 1280×720
window at 705 px. The white ground is scoped with `body:has(.scan-page)` so the shared header stays
(white here) and the root layout, `/`, `/tester`, `.analyze-hero` and every `.la-*` rule are
untouched. **Camera is the `capture="environment"` file input**: production's
`Permissions-Policy: camera=()` blocks `getUserMedia`, so the in-page viewfinder is gone rather than
silently failing; upload remains the fallback.

The manual path is honest by construction. `lib/analyze/catalog.ts` derives a **slim catalog** from
`vocab/form.json` (labels, aliases, the `*_unspecified` flag, `dose_conversion` ∈ exact / bounded /
refused probed from the real converter, `scored` from the retained runs) — never molar masses or
formulae; `GET /api/scan` exposes it and the page passes it to the client as a prop. The user picks
an ingredient (ARIA combobox, keyboard-tested), then the **exact form** (required, no default), then
an optional per-serving dose in **mg / g / mcg only** plus servings/day; **IU is refused** (its mass
depends on the substance — invariant 5) and CFU-counted ingredients take no mass. The body posts as
`application/json` to the **existing `POST /api/scan`**, which now branches on content type;
`analyzeManual` validates against the catalog and calls **`analyzeFromLabel`**, extracted from
`analyzeScan` so stages 1–5 have exactly one implementation (a typed and a photographed creatine tub
produce identical `product`, `evidence` and `dose_effectiveness` blocks — pinned). Every answer now
carries **`source: "photo" | "manual"`**; a manual answer has an `input` block under the new basis
**`user_input`** ("Typed by you", rank 5, between `label` and `model_prior`), no `label`, no read
confidence, no spans, no vision model, and a standing `typed_not_verified` caveat. The manual path
needs no model key (the score is deterministic; model sections degrade alone), the photo path still
503s without one, and `LABEL_ANALYZER_ENABLED=0` stops both. `product-score.ts`, `llm.ts`, scoring
constants, prompts, schemas, `next.config.ts`, `app/page.tsx` and `vercel.json` are unchanged.
Design: `docs/SYSTEM_DESIGN.md` §1a / §3a. Tests: `tests/scan-manual.test.ts`,
`tests/scan-search.test.tsx` (346 unit tests total). Gates at hand-off: typecheck, ESLint, both
Python gates, production build, front-door + `/scan` / `/tester` axe specs on desktop and mobile.

**2026-09-14 — installable PWA shell implemented.** The Next.js manifest launches the installed app at
`/scan/` in standalone mode, with separate mask-safe Android `any`/`maskable` assets, an opaque
180 px Apple touch icon, dark browser chrome, and the requested one-color white vector mark. The
supplied red scanner artwork was redrawn after an Opus 5 design pass: green frame, white bottle,
blue data pixels on ink. No service worker or offline evidence cache was added; supported browsers
can install from the manifest over HTTPS, while scan analysis remains explicitly network-dependent.
The public manifest intentionally exposes the formerly unlisted `/scan/` start route while `/` stays
the waitlist. Contract and phone
steps: `docs/design/2026-09-14-pwa-install.md`; regression coverage: `tests/pwa.test.ts`.

**2026-09-11 — `/tests/supplements` shipped to `main`. Handoff: `docs/HANDOFF-AYKHAN.md`.**
A public-but-unlisted test page (`app/tests/supplements/page.tsx`) renders the design-lab card
with `publicTest`. Six static fixtures, no API call, no research job, no survey, no user data;
`/scan`, the dashboard and all of `pipeline/` are untouched. Page-level `noindex` plus the
site-wide `robots.ts` disallow. **Two founder decisions are encoded:** (1) funding and publication
bias are clickable disclosure warnings and no longer touch any number — `score()` skips
`publication_bias` and the `allPositiveIndustryOrOneLab` cap is deleted, pinned by
`tests/evidence-warnings.test.tsx` across every outcome of all three audits; the audits' own
limitations prose (calcium harms, 88% heterogeneity, an Expression of Concern, n=55 pools) is still
printed, with the live rule appended separately as `Current rubric:`. (2) The Effect axis means
how much better a healthy person's life gets — `app/design-lab/ab/effect-impact.ts`, ladder
3/2/1/0 where only a cleared **anchor-based** threshold from a comparable population reaches 3, a
surrogate is capped at 1 however large the number, and a threshold from a different population may
demote but never promote. Rung 3 is empty on all six products because anchor-based thresholds for
healthy people barely exist (`docs/design/2026-09-11-effect-ladder-test.md`). Contract is now
**`effect-research-v0.3`** (`raw` metric, required `outcome_kind` and `threshold`).
`docs/design/2026-09-10-evidence-ledger-rubric.md` is **stale** where it describes the
publication-bias deduction and the industry/one-lab cap: `ledger.ts` is rubric v0.2.
The demo rubric in `ledger.ts` remains completely separate from Python `SCORING_MODEL`; do not sync
them. Scores there are heuristic rubric outputs, not probabilities of benefit. Person fit
(`personFit`, `AGE_SLACK`) is still unvalidated. Gates at ship: 305 unit tests, typecheck, ESLint,
both Python gates, build, and the browser smoke at 390/1440px.

**2026-09-11 — Effect bar + Outcomes tab on `/design-lab/ab` (development only).**
See `docs/design/2026-09-11-effect-bar-and-outcomes-tab.md`. The landing tab is
now **Outcomes**: a list of clickable rows keyed by **name + population**, with
**no overall average, no overall number and no overall band** — averaging a
deficiency row, a clinical row and a healthy-adult row produced a number about
nobody. The Effect bar no longer draws `effectPoints / 3`; it has five states
(`reported_interval`, `reported_point`, `not_graded`, `no_evidence`,
`no_meaningful_benefit`) and the three empty ones never render alike. **The three
existing audits were not re-run and not re-scored**: `app/design-lab/ab/audits/*.json`,
`prompts/research_audit.md` and `schemas/research_audit.json` are untouched, their
prior outcome scores show unchanged under "Previous rubric · unchanged", and their
`absolute_effect` / `clinically_meaningful` / `strongest_doubt` / `inventory` text
is reused verbatim under "Previous AI audit · not reverified". **Caffeine is a new,
effect-only, freshly researched pass** (`prompts/effect_research.md`
`effect-research-v0.1`, `schemas/effect_research.json`,
`app/design-lab/ab/effect-contract.ts`, `app/design-lab/ab/effect-research/caffeine.json`,
its own cache domain and its own directory so the audit schema tests are
unaffected): attention g = 0.28 with **no interval** (point drawn, interval
called unavailable), endurance SMD −0.34 (−0.62 to −0.06) at **≤ 3 mg/kg, not
200 mg**, practical importance **unknown** for both, no pooling, no MCID, no unit
conversion, funding as disclosure. It has **no numeric headline** and its other
four bars read "Not assessed in this run". Still deferred, still open: the
**funding penalty in `ledger.ts`**, **person-fit**, and **any production
wiring** — nothing here is reachable outside `NODE_ENV=development`.

**2026-09-11 — independent launch review of `70a3955`.**
See `docs/design/2026-09-11-independent-launch-review.md`. The live-audit
prototype, audit-v0.2 prompt/schema and unused `effect.ts` exist, but the new
methodology points, overlap handling, pooled intervals and effect anchors are
not scientifically validated. Do not wire that module into consumer scores as
is. Funding remains a penalty in the older displayed ledger despite its absence
from the new module. Healthy-population eligibility, prompt/schema alignment,
Overall semantics and demographic extrapolation are unresolved launch risks.
Baseline validation: 238 unit tests and both Python gates pass; no fresh browser
or supplement-source validation in this review. Production remains unchanged.

**2026-09-09 — launch UX prototypes (branch `launch/ai-wrapper-planning`).**
`/design-lab` is a development-only interactive comparison of guided, workspace,
and conversational layouts. Editable sample product confirmation, outcome selection,
simulated research and four-ring result placeholders run entirely in browser state;
no API calls, source claims, scores or production behavior are introduced. Production
requests to this route return 404. Desktop/mobile smoke coverage lives in
`scripts/check_design_lab.mjs` (run against `npm run dev`). The real AI-research
pivot, scoring rubric and deployment consolidation are still pending.

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
signed (−100…+100, internal) = 100 × d × c × (1 − 0.4H)
A (applicability, 0…1)       = mean(form strength, dose closeness or 0.10)
composite (0–100, displayed) = 50 + signed/2 × (A if signed > 0 else 1)
```

**SCORING_MODEL v14-applicability-discount (founder decision 2026-09-04: "it's
too strict, make it make sense"). Supersedes `100 × c × mean(effect, form,
dose)` everywhere below.** The headline is the signed score rescaled so 50 means
"the evidence points nowhere", then pulled back toward 50 by however much of the
evidence is NOT about your product. At full applicability `composite = 50 +
signed/2` exactly, so SPEC §9's signed bands ARE the labels (65 works / 55
probably works / 45 unclear / 30 probably does not work) — no new threshold.

Why the mean had to go, measured on the 155-study creatine run: two
APPLICABILITY terms sat as peers of the one DIRECTION term, so the number was set
mostly by form/dose match. `d = +0.04` read **38 "probably does not work"** because
no benefit dose range existed; the same `d` with a full dose term read 63; `d = 0`
with full form and dose read **77 "works"**; unanimous harm read **60**. Under v14
those read 51 / 52 / 50 / 0. Three properties, all pinned: confidence still
multiplies (inside `signed` — one weak trial lands at ~50 "barely studied", not
3 beside "harmful"); applicability discounts BENEFIT ONLY (a null or harm is
never softened by an untested form — the under-count direction of invariants 6,
7, 9); silence is still not a pass (untested form + no dose range caps a positive
verdict at ~52). No scoring constant changed; v13 rows re-compose from their
retained fields (`scripts/rescore_run.py --recompose`), no re-extraction.

`0–100` does not collapse "useless" into "unstudied": both sit near 50, and the
evidence arc separates them — empty arc, nobody looked; full arc, no effect found.

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

**Model layer proven and UNBLOCKED (2026-08-09).** S1–S8 all return schema-valid
output with evidence spans. `claude_adapter` now runs production extraction on
the **Claude subscription** via `--safe-mode`, which disables CLAUDE.md, plugins,
hooks, MCP and custom agents while auth keeps working — the two leaks
`pilot_adapter` measured on 2026-08-06 and could not close. Re-ran that canary
from a poisoned directory: plain `-p` leaked, `--safe-mode` was clean, and a
full schema-constrained call returned valid JSON with no key in the environment.

Also measured, and it is the reason this is affordable: replacing
`--append-system-prompt` with `--system-prompt` and adding `--tools ""` cut one
S1 call from **29 059 to 755 input tokens (38×)** for an identical answer. The
default prompt is coding-assistant scaffolding a pure function never uses.

**The remaining ceiling is throughput, not access.** A subscription is
rate-limited by time: a 10-study batch burned 43 calls against the session
limit. Retrying a limit error cannot help — it is in `_FATAL` for that reason.
Tune `MAX_CONCURRENCY` and batch size, not auth.

**Population gained a fifth axis, `health_status` (2026-08-08).** Measured: 15
of 80 studies (19%) in the creatine corpus were disease trials — Huntington's,
Parkinson's, HIV, cancer cachexia, haemodialysis, muscular dystrophy. On
age/sex/deficiency/pregnancy each scored `pop_match = "exact"` against a
general-adult product, so their nulls counted at FULL weight as evidence that
creatine does not build muscle in healthy adults. S3 now reports it
(`PROMPT_VERSION` v1.7).

**Every scored run now prints a POPULATION A/B** and — since 2026-08-10,
decision delegated by the founder after the null audit — **stores variant B**.
Disease trials (breast cancer, COPD, ALS, cancer anorexia) were voting at full
weight on healthy-adult claims; `health_status` feeds `vocab.pop_match`, so B
excludes `pop_match == "different"` as a different question. A is still computed
and printed beside it, never blended:

| | policy |
|---|---|
| **A** | everything counts (`ignore_population=True`) — comparison only since 2026-08-10 |
| **B** | `pop_match == "different"` is excluded — a different question, not weaker evidence. **STORED** |

Exclusion, not a discount: invariant 8 keeps population out of `w_study`, and
population is an ECU axis. Extraction is the expensive part and `build_ecus` is
deterministic, so the second pass costs **nothing**. Never blend them — same
discipline as invariant 9.

On a synthetic corpus (8 healthy benefit + 4 disease null) B raised the effect
verdict from **+0.43 to +1.00** but dropped n from 12 to 8, and the composite
moved **28 → 29**. Higher `d`, lower `c`. Which wins is a real question on a
real corpus, which is why it is an A/B and not a switch.

**THE SCORE NO LONGER VOTE-COUNTS. `SCORING_MODEL` v7 → v8-effect-size
(founder decision 2026-08-11, "do i"); now v9-dose-arc-per-study (2026-08-12,
same `s_i` — only the dose arc changed, see the dose-axis block below).**
`s_i` now comes from the REPORTED
EFFECT SIZE wherever a usable number exists, falling back to the direction label
otherwise. What the defect was, measured with
`scripts/vote_counting_investigation.py`:

Each trial is reduced to a direction LABEL, the label to a number, and the score
to a weighted mean of those numbers — so the effect SIZE we extract is discarded
before it reaches the score. Counting how many trials individually cleared
p < 0.05 is vote counting, whose power falls toward **zero** as trials shrink. It
is the failure meta-analysis exists to fix, and supplement literature is exactly
that small-trial regime.

Two independent measurements:

- Of the `null_effect` claims on the four "higher is better" showcase outcomes
  that carry a usable number, **24 of 27 (89%) have a point estimate FAVOURING
  creatine.** They failed to reach significance individually; they did not find
  nothing. Each is scored −0.35 — evidence AGAINST.
- **7 published pooled estimates on muscle strength favour creatine with 95%
  CIs excluding zero** (SMD 0.28–0.46, or 4.4–11.9 kg as a WMD; verbatim-verified,
  and an adversarial pass told to refute them refuted **0 of 24**). Our pipeline
  scores that outcome **−15**. Counted separately, never folded in: one more
  favours creatine at p = 0.001 but reports no CI, and one sits at SMD 0.20
  [0.00, 0.39], whose lower bound touches zero.

So the null share is REAL and the extraction is FAITHFUL — the labels are
correct. What is wrong is reading "this trial alone did not reach significance"
as "this trial is evidence the product does not work." Limits, not buried: the
89% rests on 27 of 139 showcase nulls, units are heterogeneous so only the SIGN
is comparable, and none of it establishes creatine's true effect size.

Consequence for the anchors: **external band derivation is BLOCKED, not
unfinished.** 0 of 14 stored creatine syntheses publish per-trial dichotomous
results usably; an adversarial re-read REFUTED 2 of 3 counts a first pass had
extracted from the one that looked like it did. Syntheses publish pooled effect
sizes because that is what synthesis is — **our model consumes a quantity the
literature does not produce.** The machinery to derive a band the moment a
mixture exists is built and selftested (`calibration.mixture_score`,
`derived_band`, `provenance`); `anchors.csv` has the provenance columns and
**1 of 21** range anchors now cites a source. Three non-equivalent candidate
fixes are in the script's verdict and in SPEC §13.

**How it works, and the one thing not to "simplify":**

```
s = clamp((effect - MID) / (FULL - MID), -1, +1)      MID 0.20 SMD, FULL 0.80
```

The scale is **recentred on the MEANINGFUL threshold, not on zero.** That is the
whole design, because the product's claim is not "the effect differs from zero",
it is "the effect is big enough to matter to you" — and recentring is what keeps
invariant 7 true instead of destroying it:

| measured effect | new `s` | old label `s` |
|---|---|---|
| zero effect | **−0.333** | `null_effect` −0.35 |
| −0.5 SMD | **−1.000** (clamped) | `harm` −1.00 |
| +0.43 SMD (published creatine) | **+0.383** | `null_effect` −0.35 |

So both founder constants are now **derived rather than asserted**, and the
trial that measured +0.43 stops voting against the product. Centring on zero
instead — the obvious implementation — makes 20 measured-zero trials score
**+0 "inconclusive"** where recentring gives **−33 "weak evidence against"**;
`scripts/effect_size_experiment.py` runs that as a control arm (E) precisely so
nobody re-derives it the wrong way.

**EXTRACTION STABILITY IS NOW THE BINDING PROBLEM, NOT THE FORMULA (measured
2026-08-12).** Two clean 149-study runs, same `SCORING_MODEL` v8, differing only
in the WORDING of one prompt field (`effect_favours`, v1.17 → v1.18):

| outcome | v1.17 | v1.18 | delta | n |
|---|--:|--:|--:|--:|
| energy_levels | +0 | −3 | −3 | 2 → 3 |
| muscle_strength | −9 | −10 | −1 | 25 → 24 |
| lean_body_mass | −1 | **+14** | **+15** | 14 → 12 |
| exercise_endurance | −16 | −15 | +1 | 10 → 9 |
| muscle_power | +6 | +9 | +3 | 30 → 26 |

**23 points of total absolute movement from one reworded field, against 2 points
from the scoring-model change it was written to enable.** Studies also enter and
leave each ECU between runs. So the score's run-to-run precision is set by
extraction variance, not by the formula.

Consequence, and it supersedes the band work: **anchor calibration is PREMATURE.**
A band cannot be fitted to a number that moves 15 points when one prompt field is
reworded. Establish extraction stability first — the same corpus scored twice
under an unchanged prompt should reproduce, and that has never been measured.

**MEASURED ON A CLEAN v1.17 RUN (2026-08-12, 149 studies, 5 partial failures,
zero session-limit failures). The honest result: v8 barely moves this corpus.**
Isolated properly — same corpus, measured path off vs on — v8 changes
`muscle_strength` by **+1** and `lean_body_mass` by **+1**, and nothing else. The
larger v7→v8 movement visible in the reports (`muscle_strength` −15 → −9) is
**NOT the scoring model**; it is the extraction changes across v1.14 → v1.17.
Do not attribute it to v8.

Why: the measured path reaches only **26 of 257 (10%)** mapped claims. What
blocks the rest, in order, and the middle one is now the biggest lever:

| blocker | share | what it is |
|---|--:|---|
| `no_effect_size` | 48% | S5 reported no number at all |
| `favours_neither_but_above_threshold` | 17% | S5 reported a LARGE magnitude but said it favours neither arm — self-contradictory, so refused |
| `raw_unit_needs_sd` | 15% | kg/W/points; not standardisable without an SD we never extract |

**The 17% is an extraction defect worth fixing next.** 44 claims report a big
effect and answer "neither", which suggests S5 is using `neither` to mean "the
difference was not significant" rather than "the magnitude is negligible". A
non-significant large effect still favours an arm. That is a prompt fix, and it
is the single largest remaining unlock.

**A sub-threshold magnitude is SIGN-PROOF**, which is why unsigned claims are not
all refused: below the meaningful threshold both possible signs give a negative
`s` (+0.05 → −0.25, −0.05 → −0.42), so the unknown sign cannot change the verdict
and the positive reading is the conservative one. Above the threshold the sign
decides everything, so those stay refused. This recovered coverage 7% → 10% with
no sign risk.

The refusals
are deliberate and each one occurs in the corpus: `% change vs baseline` is a
within-group change (10 claims), `partial eta-squared` is unsigned (26), odds
and risk ratios have a null of 1 not 0 (5), and `kg`/`W`/`points` cannot be
standardised without an SD we never extract (89). Refusing costs a magnitude;
accepting could invert a sign.

**The number is used ONLY when S5 names the arm** (`effect_favours`,
PROMPT_VERSION v1.17). This is the single most important guard in the change, and
it was added after an adversarial design review measured why:

**The stored `effect_size` is an ABSOLUTE MAGNITUDE, not a signed contrast.** Of
54 standardised values only 3 are negative, and **24 of 24 standardised
`null_effect` values are positive** — a genuine treatment-minus-control
convention would put about half below zero, so P(all 24 one sign) ≈ 1e-7. Papers
print |d| beside "no significant difference" and S5 copies it faithfully. Taking
that at face value would read a null reporting |g| = 0.88 as **+1.0** when the
truth may be −1.0 — the change meant to remove an upward-biasing error would
have introduced a bigger one, on exactly the claims where the number decides.

So an unstated sign is REFUSED, and so is `favours: neither` (a large effect
favouring neither arm is a self-contradiction, not a reading). Consequence, and
it is a feature: **v8 scores every pre-contract corpus identically to v7** —
measured, 0 of 227 mapped claims activate the measured path. No stored score can
move until re-extraction under v1.17.

v1.17 also demands the BETWEEN-ARM contrast: 28 of 67 percent-family claims had
stored one arm's own change while the span showed both ("CR +13.8%, PLA −3.5%"
stored as 13.8, true contrast 17.3pp), and 4 unit strings embedded the
comparator's own value ("kg post CR vs 32.0 kg placebo post").

**PROMPT_VERSION v1.15 fixed half of what that decision needs (2026-08-11).** S5
was describing `effect_size` / CI / `p_value` only as inputs to `magnitude`, and
magnitude is benefit-only, so a null read as "no numbers needed" and the point
estimate was discarded. Replaying S5 alone on 8 affected studies
(`scripts/null_numbers_experiment.py` — surgical, because a version bump makes a
full re-extraction ~900 cold calls):

| | before | after |
|---|---|---|
| nulls carrying a number | 14% | **62%** |
| nulls carrying a CI | 0% | **9%** |

The CI ceiling is the **literature**, not us: **6 of those 8 papers mention a
confidence interval zero times in their whole full text**, and the two that do
are exactly the two S5 extracted CIs from (PMC2646129 reports 7, S5 returned 7).
So candidate (i) is unblocked and candidate (ii) is not — refusing a
*measured*-underpowered null needs the interval, and the interval is mostly
unpublished. The route to (ii) is reconstructing it from the point estimate, the
p-value and n (Altman & Bland): arithmetic on reported numbers, not invention of
an unreported one — still a founder call.

Watch on the next full run: claim counts churned per study (8→14, 12→8 nulls).
v1.15 was meant to add numbers, not move direction or claim splitting, so the
null share and the population A/B must be **re-measured, not assumed stable.**

**THE DOSE AXIS WAS BROKEN THREE WAYS; FIXED 2026-08-12 (SCORING_MODEL v9 +
PROMPT_VERSION v1.19).** Founder question: "why is the dosage band scored so low
or not at all? are you putting the amount of creatine in the tests?" The dose IS
passed in; what was broken:

1. **The dose arc was degenerate.** `dose_match` held the product-vs-derived-band
   comparison — one value per outcome stamped on every study — so the arc was
   either an exact clone of the effect arc or EMPTY, rendering "not tested" when
   the product sat outside the band (invariant-8 violation: a 4.4 g product vs a
   4.8–5.0 g band displayed the same as never studied). Now per study, per SPEC:
   muscle_power reads −0.35 @ 2.7% with `product_match: below_50` — "at your dose
   the sparse evidence is null; the benefit came from 20 g loading protocols."
2. **`dose.product_match` reported the wrong field** (a `dose_basis` string).
   Now the real product-vs-band tier — the warning axis.
3. **Extraction lost 51% of doses** (76 of 148 studies): 25 per-kg dosing with no
   schema field, 12 truncated out of S7's slice, 2 misses, 37 genuinely absent.
   v1.19: `dose_per_kg_mg` + `mean_body_mass_kg` (the paper's OWN stated mass
   only — assuming a body weight is invariant-5 inventing; the multiplication is
   deterministic in `study_dose`), plus regex-harvested `dose_snippets` from the
   FULL text, ingredient-ranked so junk mentions cannot crowd out the real dose.

**The 20 g muscle_power band is REAL, not a bug** — loading-only trials with no
maintenance phase. The literature's power benefits sit at 20 g/day; a 4.4 g
product is genuinely below them, and the report now says so instead of hiding it.

**THE DOSE AXIS IS CONTINUOUS since v10-dose-ramp (founder decision 2026-08-12,
"your approach is good. implement it").** Flat 1.00 inside the observed band —
the midpoint is NOT a peak, because every in-band dose was directly measured and
dose-response is sigmoid with a plateau, not triangular — with linear ramps
outside whose knots are the existing `DOSE_FACTOR` values (no new constants):
1.00 at band-low → 0.10 at half of it; 1.00 at band-high → 0.60 at twice it,
clamped beyond. Two cliffs died: 4 g against a 5 g band-low reads **0.64**
(tier gave 0.45, and 4999 vs 5000 mg doubled the credit); and the dose ARC now
grades each study by its continuous `dose_factor`, so a trial at 99% of the
product's dose counts ~99% instead of zero. Straddling intervals are priced at
their pessimistic endpoint instead of refused. `dose.product_factor` joins
`product_match` on the row. Signed score unchanged; composite moves.

Measured consequence to know about: muscle_power's dose arc flipped to
**+0.42 @ 25%**, because 20 g loading BENEFIT trials now enter at the
`above_200` tail credit (0.60) instead of being excluded. That is the founder's
own constant behaving as written — and it makes the direction-blind-window
question in SPEC §13 live in the numbers, not just the window: a null above
your dose argues against it, a benefit above it establishes nothing, and
telling those apart needs a new constant. Founder call, recorded, not made.

(The adversarial verification of v9 — 4 skeptics, 0 refutations, arithmetic
hand-replayed — had flagged the binary window's 99%-out/200%-in cliff; v10's
grading resolved that. Its direction-blindness finding is the one that remains,
absorbed into the paragraph above and SPEC §13.)

**THE DOSE TERM IS CLOSENESS-TO-WHERE-IT-WORKED — SCORING_MODEL
v12-dose-closeness (founder design 2026-08-12).** Take every dose at which a
positive effect occurred; the composite's dose term is how close the product's
dose sits to that range (the same continuous ramp, reported as
`dose.product_factor`). Same role-split as the form arc: verdict/coverage stay
as the *picture* of what near-your-dose trials found, closeness is the *score
input*, direction lives in the effect term alone. The decisive property:
**benefit trials far from your dose stop voting FOR you and become the
yardstick you are measured against** — 20 g loading benefits gave a 4.4 g
product composite 62 under v11; under v12 they define a ~20 g range the product
is far below (closeness 0.10, composite 44), while lean_body_mass rose 46 → 57
because 4.4 g sits just under its 4.8–5 g range.

Two founder calls recorded with it: the score deliberately does NOT distinguish
"dosed where trials failed" from "dosed where nobody looked" (both are outside
the range that worked; `null_range` and the arc still show a reader the
difference), and the KNOWN FRAGILITY stands unfixed — the range is a min–max of
benefit doses, so one extreme benefit trial stretches it and a 2-trial range
reads identically to a 15-trial one. Also verified the same day: the 20–21 g
muscle_power range is an extraction artifact, not the literature — 14 of 22
benefit trials carried no dose (7 abstract-only, 4 dosed per-kg at 0.07–0.3
g/kg ≈ 5–24 g/day), so the v1.19 run should pull the range's floor down toward
3 g.

**UNIVERSAL NEGATIVE CONTRACT — `SCORING_MODEL` v13-universal-negative-contract
(2026-08-25; no scoring constants changed).** S3 is staged before S5/S7 and passes
the target ingredient plus exact arm facts/labels. `PROMPT_VERSION` v1.26 emits
the v1.24 extraction contract; fresh contracts require explicit version metadata and all nullable/unknown fields; modern omissions refuse,
while legacy is accepted only with explicit legacy metadata. The efficacy firewall
accepts only an evidenced target-vs-control counterfactual, including isolated
factorial A+B vs B when non-target active cointerventions match; unmatched
combinations refuse. Group×time interaction F tests may establish direction, but
an omnibus F cannot supply effect magnitude. `outcome_role` travels on the exact
S5 claim through `to_studies`, never by outcome-id rejoin. Run
`20260825_072759_creatine_creatine-monohydrate_claude-sr-ft-top5-suppl` is invalid
for claims; no extraction/network run was performed.

**V8 COHERENCE CLOSED — SCORING_MODEL v11-number-coherent (founder: "fix v8",
2026-08-12).** Every consumer of a study's contribution now reads `s_value`, not
the direction label: the form ladder credits a null that MEASURED a positive
effect and refuses a benefit that measured sub-threshold; the dose band admits a
measured-positive null's dose and exiles a measured-negative benefit's. The
stale sign-agreement guard is gone — since v1.17 `effect_s` is favours-oriented,
so a negative `s` on a benefit claim means SUB-THRESHOLD and is trusted, and the
genuine contradictions (benefit + favours control, harm + favours ingredient)
are refused in `assemble._effect_s` as `label_number_contradiction`. Unsized
corpora score identically; on the v1.18 corpus only lean_body_mass moved
(+14 → +12 — one sub-threshold benefit no longer over-credited).

**Anchor bands can now be derived ON THE v8 SCALE** (`calibration.pooled_score`,
`derived_band` route `pooled_smd_ci`): the centre is the formula applied to
trials measuring the published pooled SMD, the width comes from its CI. The
result for anchor 1 is the most consequential number in the file: **0.43 SMD
[0.25, 0.61] — the strongest published creatine-strength estimate — implies
38 (8..68), against the hand-written 80..95.** The written band was never
reachable on this scale, and that now prints as a disagreement on every
`python3 -m pipeline.calibration` run. `effect_route`/`effect_s` also now
survive into the dashboard artifact per contribution (allowlisted, spans stay
out), so a score's measured-vs-label share is auditable there.

**Open constants awaiting Tier-3 calibration:** `k`, transfer factors, RoB
thresholds, OA penalty. See `docs/SPEC.md` §13.

**Private evidence dashboard built (2026-08-09).** The root Next.js App Router
application statically renders immutable `DashboardRunV1` artifacts from
`reports/runs/`. It has no pipeline controls, no Supabase, and no public release
path. Validated runs and the Lab archive are separated; the only retained
creatine/Grok run is explicitly invalid and cannot support product claims. Full
Markdown reports render with raw HTML disabled.

**LABEL UPLOAD IS NOW THE FRONT DOOR, and it added the dashboard's FIRST runtime
API (founder decision 2026-08-21). The "no runtime API, no uploads" line above
was true until then — anything still asserting it is stale.** Upload a photo of a
Supplement Facts panel; the answer is that product's rows.

```
POST /api/analyze-label   (multipart, one image)
  -> lib/analyze/vision.readLabel            image    -> printed COMPOUND dose  [MODEL, free-tier API]
  -> lib/analyze/vocab.elementalDoseRangeMg  compound -> elemental mg           [exact]
  -> lib/analyze/product-score.scoreProduct  elemental-> rows + four arcs       [exact]
  -> Europe PMC hitCount (fetch)             on a miss-> evidence census        [count]
```

Measured 2026-08-21 end to end on a synthetic label: **21.6 s**, of which 17.7 s
is the vision read (CLI backend; the API backend sends the same prompt to its
own provider). The route is `nodejs` + `force-dynamic`; every other page still
prerenders.

**REWORKED FOR VERCEL 2026-08-22 (founder: "i don't want it to be local and i
want it work on vercel").** The route originally shelled out to
`scripts/analyze_label.py`, which needs Python + the repo + a signed-in Claude
CLI — none of which a serverless function has. It now runs entirely in-process:

- **The vision read is a 5th model boundary, `lib/analyze/vision.ts`** — an
  OpenAI-compatible chat-completions call whose provider is CONFIG, not code.
  Default: the **Gemini free tier** (`GEMINI_API_KEY` from AI Studio, no card,
  ~1,500 image reads/day; the founder's provider choices moved
  Anthropic → DeepSeek → "find a free api" within 2026-08-22, and the env
  triple `VISION_API_URL`/`VISION_API_KEY`/`LABEL_MODEL` is what makes the next
  such move a config change — DeepSeek's `deepseek-v4-flash-vision-exp`
  (shipped 2026-08-21), Groq and OpenRouter all speak the same envelope). It
  renders the SAME `prompts/label.md` with the same `{VOCAB}` block as
  `label_adapter`, so a label reads identically on either backend and
  invariant 3 has one prompt to version. Purity bar matches the Grok adapter:
  stateless single request, temperature 0, zero tools (the API takes the image
  inline, so the CLI backend's `Read`-tool exemption does not extend here). The
  prompt travels as the leading text part of the one user message — some vision
  endpoints (DeepSeek's, per its docs) 400 on images paired with system
  messages. The CLI backend and `scripts/analyze_label.py` remain for local
  use.
- **The deterministic pieces are TypeScript PORTS** —
  `lib/analyze/scoring.ts` (`dose_factor_for`, `dose_match_for`, `composite`,
  `label`), `lib/analyze/vocab.ts` (elemental conversion, vocab block),
  `lib/analyze/product-score.ts` (`score_product`, same refusals). Two copies of
  a formula is how they disagree later, so `tests/analyze-parity.test.ts` pins
  every port to golden values COMPUTED BY THE PYTHON ORIGINALS
  (`tests/golden_scoring_parity.json`, 47 cases) plus the no-dose round-trip
  against the real retained artifact. Retune a constant in Python and the
  parity suite fails until the TS port is re-synced — a loud disagreement.
  Python stays canonical; the ports move only when Python moves.
- **Deploy needs two things:** env `GEMINI_API_KEY` (or `VISION_API_KEY`),
  and the `outputFileTracingIncludes` block in `next.config.ts` (run artifacts,
  `run_statuses.json`, `vocab/form.json`, `prompts/label.md`) — without tracing,
  the files the route reads via `fs` do not exist inside the function bundle.
  Without a key, POSTs return `analyzer_unavailable` (503) and the static site
  is unaffected; a free-tier 429 surfaces as "quota exhausted, try again in a
  minute", never as a broken upload. `GET /api/analyze-label` reports
  availability plus the scored-product catalogue.
- **Collaborator deploy bridge added 2026-09-08.** Vercel rejects a private-repo
  commit authored by `aykhanstoic` because GitHub collaborator access is not
  Vercel team membership. The `dashboard` GitHub workflow now calls a main-branch
  Deploy Hook only for that GitHub actor, only on the first push attempt, and
  only after the deterministic, unit, typecheck, lint, build, browser, and
  accessibility gates pass. The hook URL lives only in the repository Actions
  secret `VERCEL_DEPLOY_HOOK_URL`; never print or commit it. Rerunning the
  Actions workflow does not retrigger deployment; recovery is a new commit or
  a manual hook trigger. Other actors retain the normal Vercel Git deployment
  and do not get a duplicate hook deployment.
- **The demand queue is best-effort on Vercel** (`/tmp`, warm invocations only,
  reported as `durable: false`) because the filesystem is read-only and this app
  deliberately has no database. A durable queue is a founder infrastructure
  decision, not something to improvise here.

Five properties that are the whole design, not polish:

1. **It does not run the pipeline, and does not pretend to.** Scoring a new
   ingredient is retrieval + full text + ~10 calls per study over ~180 studies —
   ~40 min and ~1000 subscription calls. An unscored product gets a COUNT of what
   exists (explicitly `is_a_score: false`) plus a queued request in
   `out/analysis_queue.json`. **Nothing drains that queue automatically**, by
   design: an upload that silently began an extraction would compete with a run
   in progress for the same session limit — the failure that cost the 2026-08-10
   run 364 of 906 calls. `python3 scripts/analyze_label.py --drain` lists demand,
   most-asked first, and a human starts the run SOLO.
2. **The dose term is RECOMPUTED per product; nothing else is.** Under v12 the
   dose term is closeness to the range where benefit occurred, so it is a
   property of the tub, not of the run. Effect, form strength and `c` come from
   the retained artifact unchanged. Regression pinned in `selftest`: passing NO
   dose must reproduce the run's own composite exactly (45 → 45). Measured on the
   177-study run, creatine monohydrate: **1 g reads 47/100 on muscle_power, 5 g
   reads 76** — the axis finally discriminates products, which is the
   differentiator this project exists for.
3. **The printed dose is CONVERTED, never copied.** A label prints compound mass
   ("Creatine Monohydrate 4400 mg"); corpus doses are elemental
   (`assemble.study_dose`). Comparing them directly is wrong by the salt's mass
   fraction — 12% for monohydrate, **2.1×** for magnesium chloride hexahydrate.
   4400 mg compound → **3868 mg** elemental, and that moved `muscle_strength`
   closeness from 1.00 to 0.94. The conversion refuses when hydration is
   unstated, which surfaces as "dose axis unavailable" rather than a guess.
4. **Refusals are scope, the same shape as invariants 6 and 7.** A form we never
   ran returns `form_not_scored` and no number — reusing monohydrate's exact-form
   arc for an HCl product would answer a different question at full confidence.
   An artifact predating `arcs.form.strength` returns `recompute_refused` rather
   than inverting the strength out of the rounded composite: measured on run
   `20260812_072850`, strengths 0.800–0.810 all round to 43, so the inversion
   invents ±0.005 of precision on the term the headline depends on.
5. **`not_scored` is never rendered as a low score,** and every returned number
   ships with its four arcs and its validity block. Every retained run is
   `public_claims_allowed: false`, so the UI banner is load-bearing, not
   decoration — a selftest asserts no offered product claims approval it was not
   granted, and says to flip it the day a run is genuinely validated.

Two supporting fixes landed with it:

- **`arcs.form.strength` now survives into the artifact** (plus `basis`,
  `n_in_form`). It was the one composite input the deploy boundary dropped, which
  is what made the inversion above the only alternative. Schema updated.
- **Artifact generation was BROKEN for every run after 2026-08-12** and this is
  why no newer artifact existed: S4 names unverifiable RoB items by NUMBER
  (ints), the schema has always said `type: string`, and the writer passed them
  through raw — `/corpus/studies/0/extraction/s4/unverifiable_items/0 2 is not of
  type 'string' (+681 more)`. It killed the 177-study run's artifact entirely.
  Coerced in the writer, since an item id is a label and the TS types downstream
  say string.

`scripts/dashboard_artifact.py` is the deploy boundary. It preserves complete
ECU audit fields, canonical Python verdict labels, corpus and extraction facts,
and a versioned usage ledger while allowlisting deployable fields. New runs
default to `experimental`. ECU counts, token components, call outcomes, and
complete agent/tier/model breakdowns must reconcile or artifact generation and
the dashboard build fail.

Telemetry keeps two different facts separate: `metered_run_spend` is recorded
marginal spend; `api_equivalent_cost` is the retained CLI/API-rate equivalent.
Subscription model calls have zero marginal metered spend without erasing their
API-equivalent cost. Unknown tokens, prices, and latency stay null. Vercel
hosting, free literature APIs, and any future database are outside model-run
cost. The current historical Grok artifact proves 797 live attempts and retained
latency, but it did not retain token or API-equivalent price fields.

## Current repair state — universal negative effects (2026-08-25)

The universal negative-effect repair is deterministic and ingredient-agnostic.
S3 arm facts now identify target presence, active cointerventions, evidenced arm
text, and administered versus measurement-only/biomarker/unclear roles. S7 facts
are arm-keyed, and S5 names the target/control arms and test provenance. The
assembler firewall refuses invalid counterfactuals and routes a nonsignificant
efficacy claim without a usable signed between-arm estimate or explicit valid
equivalence/non-inferiority basis to `inconclusive_unquantified` with zero
signed contribution. Arm-keyed S7 facts join only to the uniquely evidenced
administered target arm from S3; control-only and ambiguous rows refuse rather
than falling back to array position. Measured zero still uses the current effect
scale; harm is unchanged. Primary endpoint hierarchy leads, mixed unknown-role
siblings collapse unclear, and safety harm ties remain protected.

Run `20260825_072759` is invalid for claims pending verification of the 32-study
incident ledger in `docs/history/2026-08-25-universal-negative-incident-ledger.md`.
An audit delta is not a corrected score or evidence mass.

**Targeted v1.25 live check (2026-08-25, after two reviewer passes): blocked.**
The fixed 32-study negative-contributor set was extracted cold, then replayed from
cache. The replay completed 22/32 cleanly but retained 10 partial studies: 9 S7
`max_turns` failures and 2 S3 `max_turns` failures (one study failed both). The
Claude session then had about one hour remaining after 15 quota requeues and
4,500 seconds of enforced pauses. Among available corrected contributions, 0/43
old negative rows remained negative, but this is **not validation** because the
10 partials include both known wrong-intervention sentinels. No full-corpus rerun
was started.

Stream diagnostics then identified the exact one-turn failure: the model called
the CLI schema channel with `{StructuredOutput: "{...json...}"}` or
`{$PARAMETER_NAME: "{...json...}"}` instead of passing the schema object directly.
The validator rejected the wrapper and asked for a second turn, which
`--max-turns 1` correctly refused. `PROMPT_VERSION` v1.26 makes the direct-object
contract explicit. A first live v1.26 pass improved to 24/32 clean but retained
8 wrapper-driven partials, proving wording alone was insufficient.

The Claude adapter now retains verbose first-turn schema-tool arguments. On a
`max_turns` exit it may unwrap only those two exact one-key string wrappers or
the observed S7 redundant array container `arms:{arms:[...]}`, parse the model's
own values, and accept them only after full local Draft-7 schema validation. The
S7 flatten changes no arm, dose, form, label, or value. This repairs transport,
never a scientific field; malformed, additional, or schema-invalid content still
refuses. The turn limit and schemas
remain unchanged.

**Live gate completed 2026-08-25.** The fixed 32-study roster replayed 32/32
clean under v1.26 with S3/S5/S7 contract metadata at v1.24. Reconciliation
against all 43 original negative rows found 25 now refused/gated, 18 retained
with nonnegative signed contribution, and **0 still negative**. A warm-cache
full-corpus continuation then completed 155/156 usable studies with one no-text
skip and zero partial failures; all scored contributions were nonnegative. This
is a transport/contract validation result, not evidence that creatine works:
the run remains experimental, has no product dose, has not passed anchors, and
cannot support public claims.

The generated full-run artifact was not retained because its mode said `sr`
while its own counters said `requested: 0, s2_ok: 0, resolved: 0`. Production
`--with-sr` was gated on a non-`None` injected call while production relied on
the workers default (`call_fn = None`), so retaining that artifact would have
falsely labelled a primary-only run as SR-backed. **Fixed 2026-08-25, same
day:** production now injects `ca.call` explicitly (identical for extraction,
live for the SR gate), and `tests/test_sr_wiring.py` pins the shape by AST --
no backend branch may assign `call_fn = None`, production must inject the
Claude adapter, and the SR gate must keep both conditions. No live SR
extraction was spent on the fix; the first real `--with-sr` production run is
still the unmeasured SR-uplift experiment (Next item 3).

## Next

**Handoff (2026-09-16): the dark camera-first /scan redesign and Google sign-in / email capture are
implemented and gate-clean, but UNVERIFIED on a real phone, a real camera and a real Supabase/Google
project.** Before relying on this in production:

1. **`vercel.json`'s `Permissions-Policy` now sends `camera=(self)`** (was `camera=()`). Confirm this
   actually reaches production on the next deploy and that `getUserMedia` opens on one real iOS Safari
   and one real Android Chrome, over HTTPS — every test here runs in jsdom, which has no camera and no
   Permissions-Policy enforcement at all.
2. **Sign-in needs THREE real credentials nobody has set yet**: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (docs/SYSTEM_DESIGN.md §7 has the exact
   Supabase/Google Cloud console steps). Until all three are set, the sign-in card, the Google script load
   and the result lock never appear — which is also exactly what every current test exercises; nobody has
   watched a real Google credential turn into a real Supabase session yet.
3. **`docs/scan-history.sql`'s new `user_id`/`user_email` columns and `scan_users` table need to be run**
   in the Supabase SQL editor (same project as the rest of the file) before `POST /api/scan/claim` can
   write anything real — it currently only has fake-`fetch` test coverage (`lib/auth/claim.ts`).
4. **`scan_users.scans` is a best-effort read-then-write counter, not an atomic increment** — plain
   PostgREST has no arithmetic UPDATE, and this module stayed on plain fetch like its siblings rather than
   introduce an RPC function. A rare simultaneous double sign-in from the same person can undercount by
   one; nothing else is affected. Fix with a Postgres function + `rpc()` call if this ever matters at scale.
5. **No Playwright coverage of the live camera exists** — Chromium's fake-camera flag
   (`--use-fake-device-for-media-stream`) was NOT wired into `tests/e2e/`; the screenshots taken for this
   change used a DENIED-permission run to capture the fallback state only. Add a fake-camera Playwright
   run before trusting the live-video path beyond manual phone testing.
6. **@supabase/supabase-js was added as a new runtime dependency** (pinned exact version, matching every
   other entry in `package.json`) — it is imported by exactly one file, `lib/auth/supabase-browser.ts`;
   every server-side store stays on plain `fetch` (see that file's header comment).

**Handoff (2026-09-16): scan-run history and the MLM disclosure are implemented and gate-clean, but
unverified against a real Supabase project.** Before relying on this in production:

1. **Run `docs/scan-history.sql`** in the project's Supabase SQL editor (same project as
   `docs/waitlist.sql`) and confirm `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set on the
   deployment. Every test here uses a fake `fetch` against a fake project — no run has hit a real
   Supabase Storage bucket or table yet.
2. **Decide whether to turn on `SCAN_HISTORY_REQUIRED=1`.** Off (default) matches every other
   optional integration in this app (waitlist, label analyzer) — usable with no credentials, honest
   `unavailable` otherwise. On makes durability a hard requirement and will turn a Supabase outage into
   a scan outage; that trade is a founder call, not one made here.
3. **The MLM disclosure has had no live model run.** `prompts/company.md` and `schemas/company.json`
   are updated and unit-tested against fixtures, but no real DeepSeek call has been observed choosing
   between `confirmed_mlm` / `suspected_mlm` / `no_evidence` / `unknown` on a real brand. Spot-check a
   handful of known MLM brands (e.g. a brand you can independently confirm) once a provider key is
   live, the same way any other prompt is anchor-checked before being trusted.
4. **No new Playwright/browser coverage was added for the yellow warning box.** `tests/scan-mlm-warning.test.tsx`
   drives the real `<ScanFlow>` component in jsdom and asserts the warning box, its class
   (`la-alert la-alert-warn`, the same one every other `/scan` disclosure uses) and its wording land in
   the DOM; nobody has looked at it on a real phone screen or run it through the axe/Playwright suite yet.

**Handoff (2026-09-15): the `/scan` redesign and manual search path are implemented and verified.**
After the validated `main` deploy, verify on one iOS and one
Android device: the `capture="environment"` button opens the platform camera from the installed app,
upload still works, and the search combobox is usable with a screen reader. **Option 2 — a search
over a catalogue of specific BRANDED PRODUCTS — is DEFERRED** until the algorithmic score satisfies
LithuaniaBio acceptance. Those acceptance criteria are **not yet documented** anywhere in this repo,
and nothing here claims the gate is met: every retained run is still `public_claims_allowed: false`
and the composite has not passed anchor calibration. Do not start a branded catalogue, a product
database or a barcode lookup before the criteria are written down and the score is measured against
them. The manual path searches the ingredient × form *vocabulary* only, on purpose.

**Earlier handoff: the PWA install shell is implemented; after the validated `main` deploy, verify the icon,
standalone launch, and `/scan/` photo-capture/upload flow on one iOS and one Android device.** The narrow
effect contract remains IMPLEMENTED for the design lab only
(`docs/design/2026-09-11-effect-bar-and-outcomes-tab.md`). `effect-research-v0.1`
(prompt + schema + `effect-contract.ts` + the caffeine fixture) and the honest
Effect presentation ship behind `/design-lab/ab`, which 404s outside development.
Next, in this order and none of it done here: (1) decide whether the **funding
penalty in `ledger.ts`** survives at all, since the new surface treats funding as
disclosure and the legacy numbers were computed with the penalty; (2) settle
**person-fit** (`personFit`, `AGE_SLACK`) or drop the bar; (3) only then discuss
production wiring — there is still no endpoint, no job and no consumer score
reading any of this. Do **not** back-fill the three existing audits into
`effect-research-v0.1` by transcription: that file family requires quotes,
intervals and overlap status read from sources, and the audits do not carry them.
Do not tune bands to a desired caffeine/creatine ranking or start a catalogue
batch. Findings from the review that opened this work are in
`docs/design/2026-09-11-independent-launch-review.md`; the earlier prototype
handoff below is historical and partly superseded.

**Earlier handoff: launch UI design review.**
Choose A/B/C in the local `/design-lab` before building the real research flow.
`/design-lab/ab` compares the result card as WORDS vs a computed SCORE on the
same hypothetical ledger; the proposed rubric (`prompts/research_audit.md`,
`docs/design/2026-09-10-evidence-ledger-rubric.md`, demo `app/design-lab/ab/ledger.ts`,
pinned by `tests/evidence-ledger-demo.test.ts`) is NOT approved and not wired.
`/design-lab/mobile` adds the Claude Fable 5.1 "Field Notebook" phone concept
(brief: `docs/design/2026-09-09-mobile-field-notebook-brief.md`; smoke:
`scripts/check_mobile_design_lab.mjs`). Prototype validation: TypeScript, scoped
ESLint, both Python gates and browser smoke at 1440px/390px (and 320px for the
phone concept, incl. 44px touch targets) passed; unit/build validation is recorded in the commit body.
No real upload, durable research job, AI scoring or provider configuration is wired.
Keep the existing production scanner and historical scoring unchanged during review.

**Changed 2026-09-08: EVERY supplement gets an answer — stage 2b, the no-run
fallback.** Founder: "the retained runs, you can access them if you have them,
but even if you don't, do the analysis through the system prompt of the API
itself." Exactly one product has a retained run (creatine monohydrate), so a
magnesium scan used to dead-end at "no evidence run exists" beside a census of
1195 trials — measured live on production 2026-09-08, and the refusal was
CORRECT (no magnesium run exists; the selftest pins it) but useless. Now
`scoreProduct` returning not_scored / form_not_scored / recompute_refused
triggers `lib/analyze/evidence-prior.ts`: DeepSeek reports, per outcome, a
DIRECTION (benefit / no effect / harm / insufficient) and the STRENGTH of the
literature (strong / moderate / limited / none), plus the effective daily dose
range and any pooled effect it recalls. It runs for ingredients OUTSIDE the
vocabulary too, so an unknown botanical still gets an orientation, a
compatibility read and a company background.

**It deliberately mints no 0-100.** That number means "computed from extracted
trials with quoted spans"; a model-derived one would be indistinguishable on
screen from a measured one, which is the failure this project exists to
prevent. Direction and evidence-strength are what a model can honestly recall,
and they separate "large well-replicated null" from "three small trials
pointing up". The dose comparison stays OURS: the model supplies the effective
range, `dose.doseFactorFor` — the same pinned ramp the scored path uses —
places the label's dose against it, and the dose sent is the ELEMENTAL daily
amount (2000 mg of magnesium bisglycinate is 282 mg of magnesium, inside a
200–400 mg range; comparing the printed salt mass would have read as wildly
above it). `prompts/evidence_prior.md` / `schemas/evidence_prior.json`, own
cache domain `EVIDENCE_PRIOR_PROMPT_VERSION`. Rendered dashed under a "model
estimate — unverified" badge, never as a scored card.

**Changed 2026-09-07: the SCAN is the product surface (`/scan`, `POST
/api/scan`; design in `docs/SYSTEM_DESIGN.md`).** Founder: "a finalized version
of the product where users scan a supplement and they get a result through
deepseek api … dose effectiveness, company background, supplement type
compatibility". One photo → five blocks, each stamped with its basis: what the
label says (`label`), the evidence verdicts with their arcs (`evidence_run`),
dose effectiveness — your DAILY dose (per-serving × printed servings/day) against
the range where trials found benefit (`evidence_run`), form and combination
compatibility (a curated, cited table in `vocab/compatibility.json` plus a
DeepSeek fill-in for uncovered pairs, `model_prior`), and company background
(printed seals, openFDA recalls as `registry`, a DeepSeek profile as
`model_prior`, cross-checked so an asserted recall the registry does not hold is
marked uncorroborated). Stages 4 and 5 run in parallel inside the 60 s budget
and each degrades alone; below 6 s of remaining budget the text calls are
skipped with a caveat, so a slow label read never costs the score. The one rule:
**a model's recollection never becomes a measurement** — only the evidence run
produces a number. `lib/analyze/llm.ts` replaced `vision.ts` as the TS model
boundary; `prompts/label.md` is **label-v1.1** (whole-panel fields: actives,
certifications, manufacturer, country, warnings, claims — bumped in both
`vision.ts` and `label_adapter.py`). `/scan` is unlisted like `/tester`; wiring
it into the front door is one link and a founder call. Not built, on purpose: no
FDA warning-letter lookup (no API), no drug interactions, no per-user "what else
do you take" input yet. The whole orchestration is unit-tested against fakes
(`tests/scan.test.ts`), zero model calls.

**Changed 2026-09-04: SCORING_MODEL v14-applicability-discount** (see the
composite block under Current state). The creatine run `20260825_175339` was
re-composed as `20260904_185830`: muscle_strength 38 → 51 "unclear",
muscle_power 35 → 54, lean_body_mass 30 → 51, exercise_endurance 30 → 60
"probably works". Signed scores are unchanged, so this is a display repair, not
new evidence. What is now visibly the binding problem is the funnel, not the
formula: of 45 studies with a mapped muscle_strength claim, 19 are refused as
ineligible (11 self-declared underpowered, 5 combination arms, 3 no
ingredient-free arm), 8 as off-population, 6 more at the arm firewall / S7
join, leaving 12 — of which 10 are `inconclusive_unquantified` nulls at s = 0
(raw kg/N/Nm differences with no SD). Only 3 of those 16 nulls carry a stated
sign, a numeric p and an n, so the Altman–Bland SMD reconstruction (SPEC §13)
would recover few of them; the SD lever (v1.20) and the S7 replay are the real
unlocks. **`scripts/rescore_run.py --verify` cannot re-assemble a v13 run**:
the `studies_list` projection in `run_pipeline._study_extraction` drops
`extraction_version` and the per-arm S3/S5/S7 facts, so every study fails the
contract check and gates. `--recompose` (display only) is the workaround; the
projection needs those fields before the next assembly-level fix can be
re-scored from a retained run.

**Clean resume point (2026-08-25):** `origin/main` is clean with no open PRs,
no stashes, and no topic branches or extra worktrees. Historical merged or
cherry-picked helper branches were removed locally and from GitHub. An unrelated
uncommitted score-visualization experiment found during cleanup was discarded at
the founder's request; do not look for or revive a WIP branch. Obsolete untracked
v1.23 generated reports and the completed local repair plan were also deleted;
canonical retained runs remain under `reports/runs/`. Next scientific work is
the S7-only replay below, not a cold all-agent run.

Changed 2026-08-09: production extraction moved to the **Claude subscription**
via `--safe-mode` (`claude_adapter`); `--bare` and the API-key gate are gone,
`pilot_adapter` is superseded but kept. Anything saying production needs a key
is stale.

Changed 2026-08-09: the protected, Git-backed evidence/cost dashboard and
`DashboardRunV1` export contract were added. The 2026-08-07 creatine/Grok run is
an invalid historical Lab artifact, not a current score. Future committed run
artifacts appear on the next preview deployment.

Changed 2026-08-08: invariant 6 amended (SR-table trials enter `E`),
`PROMPT_VERSION` v1.6 (S2 `results_table` + per-study `design`), outcome
polarity added, SR retrieval scaled with marginal-yield stopping, file
ownership table added under Multi-agent workflow.

1. **DONE 2026-08-12.** Production extraction ran end to end on the Claude
   subscription: 150 targeted, 149 usable, 5 partial agent failures, zero
   session-limit failures, 388 fresh calls + 542 cache hits, $0 marginal spend.
   The lesson that cost one wasted run: **never run workflows or teammates
   alongside an extraction.** Two analysis workflows (~2.6M subagent tokens)
   immediately beforehand exhausted the session limit mid-run and killed 364 of
   906 calls; S5 failed 44%, which HIDES NULLS and biases the score upward, and
   `muscle_strength` came back n=12 against a baseline n=26. Marked `invalid` in
   `reports/run_statuses.json`. Run extractions SOLO.

   **Next unlock is extraction coverage, not the model.** The effect-size path
   reaches only ~16% of mapped claims; `no_effect_size` is 48%.
   **The SD lever is BUILT (v1.20, 2026-08-12):** S5 reports the endpoint's
   PRINTED SD (`effect_sd` + basis; never derived from SE/CI/n), and
   `standardise_effect` divides raw-unit differences by it (route
   `smd_from_sd`, distinguishable from a printed SMD; guards pinned — a
   printed SMD is never divided twice, an SD never rescues within-group/ratio
   claims, zero/negative SDs refuse). Expected to convert most of the 15%
   raw-unit share on the next run.
2. **S7 body-mass dosage regression FIXED + surgically measured 2026-08-25
   (`PROMPT_VERSION` v1.28); full S7 corpus replay still pending.** v1.24 moved
   `mean_body_mass_kg` per-arm, but the first prompt-only fix recovered **0/32**.
   Root cause was upstream: S7's strict prompt+schema grew to ~14k chars against
   a hardcoded **14,500-char GROK wall**, so `_fit_text` clamped every paper to
   1,000 chars and table room went negative — **zero tables shipped** across the
   156-study corpus. The mass was not in the payload. Claude is now separately
   budgeted at 26k text / 30k total (measured safe below same-day 38k+ S5
   envelopes); Grok must be re-measured before revival. The prompt explicitly
   allows the paper's stated whole-sample baseline mean on a target arm when
   per-arm means are absent — still the paper's OWN number, invariant 5 intact.
   Final v1.28 surgical S7 replay on all 32 affected studies recovered mass on
   **15/32, 0 failures**, including **12/13 known regressions**; the remaining
   known paper (`doi:103390nu13072303`) returned null despite its mass being in
   the payload. v1.28 also closes two audit holes found in review: final envelope
   size is computed from the COMPLETE serialized payload (form vocabulary, S3
   arms and JSON overhead included; explicit runtime guard ≤30k), and drift compares the
   full arm-label multiset so renamed/added/removed/duplicate arms cannot hide.
   Non-mass S7 fields drifted on 12 studies under the richer payload.
   Deterministic hybrid rescore: lean_body_mass band restored to **5.10 g
   (1 benefit trial)** and composite 30→44; muscle_strength dosed coverage rose
   4→6 but its benefit band remains empty because surviving benefit trials have
   no absolute convertible dose
   (restoring the old 2.67 g band would require an assumed body weight or a now-
   ineligible claim). The surgical result is validation, not a production
   mixed-version corpus.
   Next: replay S7 on all 155 usable studies under v1.28, review drift, then
   rescore from the unchanged S3/S5 corpus; no need to cold-run every agent.
3. **Constrain retrieval to the intervention**, not the document. Gates
   extraction cost, coverage and outcome mapping simultaneously.
4. **SR inheritance uplift MEASURED 2026-08-25 (first live end-to-end run,
   retained as `20260825_173541`): approximately ZERO on the creatine corpus.**
   S2 ran live on 60 ranked syntheses (54 ok, 47 resolved, 431 distinct trials
   named; 64 live calls, 903 cache hits, $0 marginal). Of 32 SR-derived trial
   candidates, **0 entered evidence mass**: 18 were already held directly (the
   dedup working as designed), 12 had no design in any review table, 2 no
   direction, 0 conflicts. The only movement was the bounded cov multiplier:
   muscle_strength 37→38, lean_body_mass 29→30. So on a corpus this saturated
   with directly-read trials, SR inheritance adds ~nothing — its value, if any,
   is on THIN corpora where the trials behind reviews are unreachable, and that
   is now a hypothesis to test on a second ingredient, not an unknown blocking
   this one.
5. **Anchor eval** — 35 anchors in `docs/anchors.csv` (NOT 28; the doc said 28 until 2026-08-06); running them needs
   extraction. Do this before trusting any constant. **All 35 are now scoreable**
   (the 14 pair anchors ran nowhere until 2026-08-11), but **20 of 21 range bands
   are still uncited judgement**, and they cannot be derived externally until the
   vote-counting decision above is made — the literature does not publish the
   per-trial split a vote-count band needs.
6. **Derive dose bands at scale** and bump `band_version` 0 → 1.
7. **Grok/Claude agreement table** on a fixed paper set. Never merge scores.
8. **Grok-owned telemetry follow-up.** `DashboardRunV1` already preserves token
   and price fields when a Grok context contains them, but `grok_adapter.py` still
   needs its owner to capture those fields from the CLI envelope. Do not infer
   them for historical runs.
9. Venue factor (`Study.venue_ok` is still a boolean; SJR quartiles have nowhere
   to go until a real factor exists — new constant, so SPEC §13 first).
10. **Right-size dashboard CI.** The current GitHub dashboard workflow ran **802
    Playwright browser/accessibility tests in ~33 minutes** even for a
    documentation-only push. Add path filtering so docs-only changes skip the
    dashboard workflow; run a small desktop/mobile browser smoke suite on normal
    pushes; reserve the complete Playwright matrix for dashboard/UI changes,
    nightly runs, and pre-release validation. Keep Python invariants/selftest,
    unit tests, typecheck, lint, and production build on relevant code pushes.
    Do not reduce release coverage—only avoid repeating the full browser matrix
    when changed paths cannot affect it.
11. **DONE 2026-09-08 — collaborator deploy bridge.** A Vercel Deploy Hook for
    `main` is stored as the GitHub Actions secret `VERCEL_DEPLOY_HOOK_URL` and is
    triggered after the full dashboard gate only for direct pushes by
    `aykhanstoic`. Normal owner pushes continue through the Git integration.

---

## Conventions

- Deterministic → unit tests. Model → anchor evals (per **provider**).
- Evidence spans on every model output.
- New constants → SPEC §13.
- Demo results → `reports/runs/` + push.
- Dual backends → separate runs, separate labels, no silent merge.
