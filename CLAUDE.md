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

**2026-10-06 — Live research: FIX THE CAUSE of the Vitamin D failures (+ ONE attempt per job + MEDIUM effort). A CANDIDATE on the local branch `medium-one-attempt-research-f7664b2` (base `f7664b2`, worktree `/tmp/bsproof-medium-one-attempt`); NOT on `main`, NOT pushed; the migrations are NOT applied, the new runtime is NOT built or installed, the website is NOT deployed with it, and NO model has run any of it.** **Objective, as the user restated it:** not "cap the retries" but *why would an attempt fail* -- make one invocation yield a usable audit; a cap-only release is NOT acceptable. **Root cause (replayed through the real guard from the three immutable raw captures, sha256-pinned; `docs/research/pc-research-worker.md` "Why the Vitamin D job failed three times"):** 33 inventory ids were cited over the three attempts (10, 13, 10); the guard refused 18 (10, 5, 3 per attempt -- the worker's message names only the first). **14 of the 18 WERE retrieved and printed in returned tool text** but not recognised: 13 PMIDs printed as Markdown-bold `**PMID:** 123` by the small summariser model (the old pattern recognised 0 labelled PMIDs in run 1's returned text, 18 now) and 1 DOI read from a URL ending `/full` (`/pdf` likewise). **4 were the model's own assertions** that no returned result printed (an id typed into its Europe PMC request; a bare number from a "PMID list" line; a number in a third-party link address; a DOI assembled from two publisher link addresses) -- there the guard is RIGHT and stays. So: not hallucinated papers in these runs, not a bad guard; a too-narrow id recognition plus a model that did not know the check exists (the grounded records were fetched with "give PMID, title…", the refused ones with "title, authors, journal, year…"). The extraction fix alone rescues none of the three (1, 1 and 2 rows still refused). **What changed:** (1) id recognition, IN LOCKSTEP in the worker (`PMID_RE`, `DOI_WEB_VIEW_SUFFIXES`) and the server (`idsIn` in `lib/scan-research/source-access-v2.ts`, which recomputes grounding on `complete` and 422s a disagreement), pinned by ONE shared fixture (`tests/fixtures/id-extraction-cases.json`) and by NEGATIVES (bare numbers, "PMID list", link addresses, request-only ids, other URL tails, a different DOI, a failed/missing/other-paper receipt, an invented id all stay ungrounded); (2) prompt `live-research-v0.2` -> `live-research-v0.3` = v0.2 + ONE rule block (L7: the check is an exact text match on returned results, ask WebFetch to print the identifier, verify every row before answering, delete what you cannot find and the claims that rested on it, a shorter honest audit is a complete answer) -- proved by test to be the only difference (verbatim v0.2 kept in `tests/fixtures/research_audit_live_v0.2.md`); every tier accepts v0.2 AND v0.3 (worker serves both, the server and `schemas/source_access_v2.json` accept both, the website stamps v0.3 on new jobs) so no queued job and no old runtime is stranded; (3) `EFFORT` `xhigh` -> `medium`, `MODEL` `claude-sonnet-5-5` unchanged, no turn/token/budget/runtime cap; (4) ONE attempt per job in the SQL (`docs/research-jobs.sql`: claim sweep/filter and the fail requeue guard 3 -> 1; a posted `fail` is final whatever `retryable` says; an expired lease is final) via migration 001 (claim + fail; text byte-identical to the current file; read-only guard that refuses on a foreign project or on a job `queued` with `attempts >= 1`), and `bsproof_research_complete` accepting the v0.3 job version via migration 002 (one function, one literal; independent of 001, either order); neither touches a table, grant, revoke, owner, RLS, comment or any job (tested against the byte-for-byte applied baseline `tests/fixtures/research-jobs-baseline-48783cd3.sql`, sha256 `48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb`); (5) the one known grounding refusal is `audit_contract_violation`, not retryable (every other adapter refusal stays `worker_internal_error`); the guard is untouched; nothing is whitelisted, repaired, stripped or re-run; Haiku summaries stay summaries. **Hashes:** `docs/research-jobs.sql` `7fb43b838f6191072ffe268704ea7a30ce13fcfe7aefd5ff48751080e078e9ec`; migration 001 `9d147ecf30bd5ba4c47c33e50dd18fc11bbca10e5371354240eb919aff33fb41`; migration 002 `1f2368e155e5c36cf79b27eba8d05e7b7aac4d62b9cd084e1e88a5ec392c46fb`. **Verified (offline: no model, no network, no database):** replay of the three originals (old extraction patched back in reproduces the recorded failures exactly; fixed extraction grounds exactly the printed ids and refuses the four assertions; originals byte-identical before and after); real-SQL execution (PGlite PostgreSQL 17) of the current file, the baseline + 001 + 002, parity with the route fake, mutants; route tests; worker tests (spawned argv `--model claude-sonnet-5-5 --effort medium`; one model run per job; v0.2 job served; v0.3 prompt text proof). **Gates (final tree):** `vitest` 1189/1189 (72 files), `tsc`, `eslint` (0 errors; 6 older warnings in untouched files), `next build` (ordinary and the mock-sign-in build), `npm audit --omit=dev` 0 vulnerabilities, `pipeline.invariants` + `pipeline.selftest` ALL PASSED, `git diff --check`, Python worker + adapter + replay + label 87 OK and supervisor 54 OK in the repo `.venv`, mock-API research lifecycle e2e 14 passed / 2 skipped; the ordinary full browser suite was not re-run (one copy line changed). **UNPROVEN, say so:** whether rule L7 changes what the model does (no model ran it), that `medium` grounds better or worse than `xhigh`, any live behaviour. One invocation can still fail and that job then ends `failed`; there is no retry path (a transient local fault -- quota, expired login, missing CLI, PC sleep, `stop` mid-job -- now ends the job). Research stays EXPERIMENTAL and UNGRADED, never scored. **Install order (owner-run; a WRONG order loses jobs -- table in the worker doc):** `stop --drain` and leave the worker stopped -> read-only queue check (no `running`, no `queued` with `attempts >= 1`) -> apply migrations 001 and 002 -> push `main`, confirm the Vercel deploy -> build + install the runtime -> `start` -> `status`. Never run the OLD worker against the NEW website. Rollback in the worker doc.

**2026-10-05 (live-only /scan UI, RELEASED to `main` as UI-only commits `0670ae3` + the Lithuanian copy fix `a2b60d3` + this docs-status commit, fast-forward off `bb166d4`; the independent Opus review PASSed `0670ae3`; the actual Claude Code owner returned OWNER_NEEDS_WORK on `0670ae3` for ONE Lithuanian copy blocker, fixed in `a2b60d3`, and then OWNER_PASS on the read-only DELTA `0670ae3..a2b60d3`; no signed-in production look and no real job of the new UI has happened yet) — `/scan` now shows LIVE RESEARCH ONLY, with a progress-bar loading screen between the label read and the result.** Trigger: a vitamin D scan drew the retained lab card's "No evidence run exists for this ingredient"; the user asked for ONLY live-research results and a loading screen with a progress bar between the label read and the final results. UI only: `components/scan-flow.tsx`, `components/scan-research-panel.tsx` (now `ScanResearchScreen`, presentational), NEW `lib/scan-research/use-live-research.ts` (the old panel's request/poll state machine, moved UNCHANGED IN BEHAVIOUR into a hook that `ScanFlow` calls at its top level so the poll is never unmounted by a change of what is drawn), `lib/i18n/copy/{research,flow,result}.ts`, `app/scan-workspace.css`, tests. NO API, backend, worker, SQL, model, prompt, schema, scorer, constant, provider or env change; `lib/scan-research/client.ts` is untouched; `app/tests/supplements`, the retained run pages and `app/design-lab` are untouched; the PC worker and the public flag were not touched. **State contract:** upload/typed entry -> actual label-analysis loading (its stage list now says only what that step does: read the label / dose, form and servings / save the scan, and that live research comes next) -> persisted OWNED scan (research is requested only with a run id the server reported as `stored` for this signed-in owner; an unsaved scan asks for nothing and gets an actionable "was not saved" screen with "Scan this photo again") -> `loading` (queued / running): ONE top-level screen, "Researching your supplement live", with an INDETERMINATE bar (`role=progressbar` with a name and NO value, no style, no number: the API has no reliable percentage), the job's real status, the server's own timestamps, the stalled-worker observation, EXPERIMENTAL / UNGRADED tags, and the read-label facts beside it; no ETA, no percentage, no "studies found" -> `result`: ONE switch to the completed live audit and ONLY that (focus moves to its status line). Every other outcome is a `problem` screen (failed with its safe code, refused / unavailable / busy / not eligible / off / signed out / not found / client-refused result) that says what happened, says that NO saved, cached or model-recalled evidence is shown in its place, and offers the safe action (Check again / Request live research / Scan this photo again / Scan another); never blank, never raw server text. KNOWN LIMIT (not fixed here): only a RUNNING job gets the stalled-worker observation (`isStalled`, `lib/scan-research/client.ts`); a job stuck QUEUED (worker down) shows the sliding bar with no stalled note, so "never a hang" is NOT claimed. **History replay:** a saved scan shows "Live research not requested" and a deliberate button; opening it never POSTs (it GETs a job only when this page already knows one), and the server's one-job-per-scan idempotency means pressing again cannot start a second job. **Removed from `/scan` as evidence:** the retained `LabTabs` / ledger audit, the "No evidence run exists" / "That form has not been run" cards, the legacy `evidence.rows` fallback, `evidence_prior` (model recall), dose bars, compatibility, the company profile + MLM warning, the model-written funding / publication-bias disclosures, the caveat bundle and the legend (the server still produces and stores all of them; `literatureDisclosures`, `businessModelDisclosure` and the retained-audit modules are unchanged and still unit-tested for their other surfaces). **Kept:** the read-label facts (exact numbers: 0.05 mg stays "0.05 mg", not rounded; the unit as printed; read confidence; the quoted label spans), and every unknown said out loud: form not stated, dose not stated, "servings per day not stated (not assumed)" (no default serving, no elemental / compound / EPA basis inferred; Lithuanian "prielaida nedaroma" / "jokių prielaidų nedaroma" = "no assumption is made" — the first draft said "nepripažįstama" = "not recognised", which changed the meaning of this caveat and was corrected after owner verification); the research's own missing-facts list and blend note; source / access caveats (snippets and Haiku summaries are not papers, errors / walls / refusals are "no content"); the original study quotations, IDs and numbers verbatim (model text is never machine-translated and is tagged `lang="en"` in Lithuanian under a note). New research stays EXPERIMENTAL and UNGRADED: no score, bar, arc or verdict is derived from an audit. Sign-out, language switch, History and "Scan another" stay usable while it waits; sign-out, an account switch, "Scan another" and unmount abort the request and a late reply is dropped; a 401 refreshes the token once. **Checked on `0670ae3` (the full-tree gates; `a2b60d3` changed only copy strings and two assertion strings, its own gates are listed after the owner-blocker paragraph):** `npx tsc --noEmit` clean; `npx eslint .` 0 errors (6 pre-existing warnings in untouched files); `npx vitest run` 71 files / 1072 tests pass (NEW `tests/scan-live-only-flow.test.tsx` 26 tests with mocked jobs and a frozen clock, plus rewritten legacy assertions in 8 existing test files that asserted the removed cached cards); ORDINARY build + `playwright test` (full ordinary run 840 passed, 22 configured-only skipped; after one last copy-string change the scan-affecting specs were re-run on a fresh build: 222 passed, 24 skipped); CONFIGURED (mock Google / Supabase) build + focused `scan-research`, `scan-workspace`, `tester-auth` specs 32 passed, 6 ordinary-only skipped, including axe on the loading, problem, completed and Lithuanian-loading screens at desktop and Pixel 7, keyboard operation, no horizontal overflow; `python3 -m pipeline.invariants` and `python3 -m pipeline.selftest` (ALL PASSED); `npm audit --omit=dev` 0 vulnerabilities; `git diff --check` clean. **Owner blocker and its copy-only fix (follow-up commit):** the Lithuanian `servingsNotStated` / `servingsValueNotStated` (`lib/i18n/copy/flow.ts`) and the end of the LT `missingHow` (`lib/i18n/copy/research.ts`) said `nepripažįstama` ("not recognised") where the English says "not assumed". Now `(prielaida nedaroma)` ×2 and `kol kas jokių prielaidų nedaroma.`; the two matching assertions (`tests/scan-live-only-flow.test.tsx`, `tests/e2e/scan-research.spec.ts`) changed wording only; English, logic, layout, numbers and IDs untouched. Re-run after the fix: full `npx vitest run` 71 files / 1072 pass, `npx tsc --noEmit` clean, eslint on the 4 changed files clean, `git diff --check` clean, `pipeline.invariants` + `pipeline.selftest` pass, CONFIGURED (mock Google / Supabase) build + `scan-research` spec 14 passed / 2 ordinary-only skipped; the release operator re-ran the same set independently on `a2b60d3` with the same results (all three full vitest runs on `a2b60d3`, two by the fixer and one by the operator, passed 71 files / 1072; a grep of the built `.next` output finds the new Lithuanian strings and zero occurrences of the old word). The 840 / 222-and-24 / 32-and-6 figures above belong to `0670ae3` (the 840 to an earlier tree still); on `a2b60d3` the ordinary build, the full ordinary Playwright run and the `scan-workspace` / `tester-auth` configured specs were NOT repeated (no application code changed). Disclosure: once, in an independent full vitest run on `0670ae3`, `tests/scan-translate-client.test.tsx` ("drops what the previous owner fetched…", a file this change does not touch, timing-sensitive) failed; alone it passed 10/10 three times, two later full runs passed, and it did not recur in the full runs on `a2b60d3` — it is NOT proven pre-existing and NOT claimed fixed. **NOT done / not claimed:** no real model, real research, real job or real Google sign-in was used (every API answer was mocked); no phone or live-browser check; the independent Opus PASS is NOT owner verification; the actual owner (read-only Read / Grep / Glob, `claude-sonnet-5-5` xhigh on the subscription, no cap, no fallback, ran nothing) returned OWNER_PASS ONLY on the DELTA `0670ae3..a2b60d3` (5 files, 7 lines; git tree ids equal everywhere else) and did NOT re-review the other 19 files; the Lithuanian wording is the owner's own suggestion checked by a model, NOT by a native speaker; every screenshot and test is a MOCKED local e2e frame, so there has been no signed-in production look at the new screen, no real job of it and no phone check (the earlier real-job proof in older entries is unchanged). Deployment: every push to `main` deploys; the Vercel deployment of the pushed SHA is the record and this entry asserts nothing about its status. Screenshots (private, not committed): `/tmp/bsproof-live-only-screens/`.

**2026-10-05 (earlier same day) — Live research: RELEASED_EVERYONE under a USER-ACCEPTED HELD-OPEN hosting condition. Production `SCAN_LIVE_RESEARCH_ENABLED=on`: research is open to every signed-in Google user (never anonymous); gate G4 was NOT performed and is NOT claimed.** The user explicitly decided to finish research for everyone now and move to the VPS later, and accepted the hosting condition: keep one Ubuntu/WSL terminal open, the PC awake and online (two tabs confirmed open; a read-only check saw three interactive shells on pts/0-2). That condition REPLACES G4 for this temporary period; it is NOT a pass of G4 (the closed-terminal test does not apply to the mode the user chose and was not run). Nothing here claims survival with every terminal closed, a PC sleep, a reboot, a Windows restart or an autostart. No Windows, systemd, user-bus, dbus, sudoers, linger or WSL setting was touched. **Verified before the flip:** (1) the supervisor READY on the same pids (supervisor `80921`, worker `80922`, 0 restarts, no duplicate process; polls 74 at the first read, 132 about 22 minutes later); (2) the actual Claude Code owner, read-only (`claude-sonnet-5-5` xhigh, Read/Grep/Glob only, subscription `apiKeySource: none`, no turn/budget/deadline cap, no fallback, 31 turns) read the mode parser, the POST/GET/worker routes, the Google gate, the amendment and its earlier supervisor PASS and returned `VERDICT: PASS`, no Critical (its conditions are in this commit: the panel queues automatically, the flag stops queueing only, the operator rules below, every "G4 hard gate" statement rewritten, the restart/READY wording corrected); (3) the focused existing tests `tests/scan-research-owner-smoke.test.ts` + `tests/scan-research.test.ts` 50/50 (`on`/`1`/`true`/`yes` -> everyone, only `owners` -> owners, all else off). **The one production change:** Vercel Production `SCAN_LIVE_RESEARCH_ENABLED` `owners` -> `on`, by a single-entry API `PATCH` after a metadata lookup (value passed as plain input); read back with the single-entry `GET /v1/projects/{id}/env/{envId}` (not the deprecated bulk decrypt): `on`, Production only, type unchanged. `SCAN_LIVE_RESEARCH_OWNER_IDS` and `BS_PROOF_RESEARCH_WORKER_TOKEN` (both Sensitive) untouched (their `updatedAt` unchanged; values never read) and the owner-id variable stays as the one-step rollback; no other variable, code, SQL, model, constant or cap changed. The unchanged production deployment of `273c2d5` was redeployed (`dpl_2TGnxu8kASXBaEVjjLVTrgDXi4TV`): READY, canonical alias on it. **Live proof (read-only, no new model job):** unauthenticated and bogus-bearer `POST /api/scan/research/` and `GET /api/scan/research/<id>/` -> 401 `no-store`; the worker door with no/wrong token -> 401; the earlier real job through the designated test account's existing genuine Google session: History replay -> "Look up live research" -> one `POST` -> 200 `created:false`, job `succeeded` (the per-scan key makes it idempotent: nothing was queued), the same EXPERIMENTAL / UNGRADED audit (24 snippets, 11 Haiku page summaries, 0 original documents). **What users get:** the panel queues research AUTOMATICALLY for every stored fresh scan of every signed-in Google user (not opt-in); each job spends the founder's subscription (no budget/turn/deadline cap, no fallback model); 3 open jobs per user is the only brake, no global cap; the output is experimental, ungraded, not approved and never scored, and its sources are search snippets and page summaries written by a small model (Haiku), not the papers. **What the held-open condition means:** when the last terminal closes, the PC sleeps or reboots, or WSL stops, the worker stops and every job stays `queued` until someone runs `start` by hand; the supervisor is temporary (not systemd, no autostart, no service). **Operator rules (from the owner pass):** before ending the held-open period for long, set the flag to `owners`/`off` and redeploy FIRST; the flag stops QUEUEING only, the worker door ignores it, so a queued backlog keeps running (one job at a time, about 400 s each) while the worker is up: `stop` the worker to stop that spend; a user with 3 queued jobs sees a misleading "research running" 429 while the PC is down; never `kill` the worker (it restarts after ANY exit; `stop` is the only stop); READY proves a fresh status of this worker's pid with two poll writes (it is polling), not a heartbeat during a running job. **Not proved:** G4 (not performed); a live non-allow-listed Google identity (none exists; `on` is shown by the parser tests and the read-back, not by a second account); the phone; that the audit's studies or conclusions are right. Rollback: Vercel Production `SCAN_LIVE_RESEARCH_ENABLED=owners` (or `off`) + redeploy. **Handoff:** keep the terminal open while research is open; the VPS is next and needs its own permission; the Git deploy of this docs commit is checked after its push (READY at its SHA, flag metadata re-read) and reported in the release report, not in this file; details in `docs/research/pc-research-worker.md` "Held-open hosting mode".

**2026-10-05 (later) — Live research: temporary main-PC supervisor INSTALLED, STARTED and READY in `owners` mode; the public flag was NOT flipped at that time (BLOCKED on the WSL-survival gate G4, not performed) — HISTORY, superseded by the RELEASED_EVERYONE entry above.** Owner pass done: the actual Claude Code owner (read-only, `claude-sonnet-5-5` xhigh, Read/Grep/Glob only, no turn/budget/deadline cap, subscription, 55 turns, 494 s, `stop_reason end_turn`, no permission denials) read the 4 files of `6374cb6` and the activation plan and returned `VERDICT: PASS` (covers the push and starting the supervisor once in `owners` mode; not the public flag). Pushed to `main` as a fast-forward `9af0ef4..6374cb6` (author = the noreply identity; counts-only privacy scan of the diff: handle/UID/e-mail/JWT/`sk-ant`/bearer all 0); Vercel production deployment of `6374cb6` READY (commit status `success`; app tree byte-identical to `9e9c0d3`). Installed from the git object (not `/tmp`): `supervisor/pc_research_supervisor.py` sha256 `53de648a…bfb9b`, `reviewed-unit.service` sha256 `11067226…85c0`, 0500/0400 in a 0700 dir; `describe`/`check` ok (runtime `9e9c0d30becd` 6/6 checksums, worker `check` ok); `start --wait-ready 90` run ONCE: supervisor and worker running as the user (no root, `NoNewPrivs 1`, worker env = exactly 7 non-secret names), `status` READY; production request logs (read-only, `vercel logs`) show the worker's claim cycle `POST /api/scan/research/worker/` -> 200 about every 20 s; bad/no worker token -> 401, unauthenticated research POST -> 401. No model call, no new paid job: the one earlier owned real job (subscription, `claude-sonnet-5-5` xhigh) remains the functional proof of this runtime. **Why the flag stayed `owners` at that time:** the fix card made G4 a HARD gate: the worker must be shown to survive a session-free window. An agent cannot perform it (the only session reaching this distro is the agent's own; closing it ends the agent; agents never run `wsl --shutdown`/`-t` or touch `.wslconfig`, Windows startup/scheduler/power settings, systemd, `user@1000` or dbus). Read-only findings: `Ubuntu-22.04` is held by exactly one Windows terminal (the one that hosts the Pi session); Docker Desktop runs its own `wsl.exe ... /wsl-keepalive` for its distros; no `.wslconfig`, `/etc/wsl.conf` is only `systemd=true`. By WSL's documented behaviour the worker is therefore EXPECTED to die when that last terminal closes (inferred, not measured), which would leave public jobs `queued` with no ETA. Nothing was faked: `~/.local/share/bsproof-wsl-gate/gate.py` recorded a baseline (supervisor/worker pids, PID 1 start, boot id, polls, sessions) at 10:05Z and its `verify` correctly FAILS while a session is attached. **Corrections to the committed text (docs-only, code frozen):** the worker is restarted after ANY exit while the supervisor runs (exit 0 included), `stop` is the only way to stop it (the launcher's `describe` line "on unexpected exit only" understates this); run `start` once, sequentially; READY while `running` has no heartbeat-age check. **Human step (smallest):** close every Ubuntu-22.04 terminal for 6+ minutes (PC awake and online), reopen ONE terminal, run `python3 ~/.local/share/bsproof-wsl-gate/gate.py verify`; PASS -> the flag may be flipped (`SCAN_LIVE_RESEARCH_ENABLED=on`, owner-id variable kept); FAIL -> stays `owners` and the owner chooses (a) keep one window open, research only while it is, or (b) an owner-reviewed host keepalive plan; the VPS removes the problem. Not systemd, not boot-persistent (after a PC/WSL/Windows restart run `start` again), `SCAN_LIVE_RESEARCH_OWNER_IDS` untouched, worker token unchanged, no new caps, no fallback. Rollback: nothing to roll back in Vercel (flag unchanged); `stop --drain` stops the worker. **Not proved:** G4; a live non-allow-listed Google identity (none exists); phone; everyone-mode behaviour beyond the offline test pin of `liveResearchMode`. **Handoff (historical, superseded by the entry above: the user accepted the held-open condition instead of G4 and the flag is `on`):** G4 (human, above) -> if PASS, set Vercel Production `SCAN_LIVE_RESEARCH_ENABLED=on`, redeploy, verify READY at the intended commit, then update this entry and the milestone.

**2026-10-05 — Live research: TEMPORARY main-PC supervisor for the SAME promoted runtime (code + runbook + 54 offline tests; NOT installed, NOT started, no Vercel/production change in this commit; research for everyone is NOT enabled by it).** Founder decision (2026-10-05): open research to every signed-in Google user now, VPS later. The persistent service is still blocked (`sudo -n` needs a password; the user manager's private socket is still orphaned) and nothing about `user@1000`, dbus, WSL, sudoers, linger or the global service/socket is touched or may be. `deploy/pc_research_supervisor.py` (Python stdlib, one file; no app, scorer, model, prompt, schema, SQL, auth or provider change) is a launcher + supervisor that runs the installed, reviewed `bsproof-research-worker-9e9c0d30becd` (NOT the stale `f8e8df821`) as an ordinary detached process of the user `icefrost`: command parsed as data from the owner-reviewed user-unit template (launch refused without its sha256 pin) and refused if anything differs; runtime pinned to the expected commit and its six files checksum-verified before every (re)start; environment built from nothing (no `ANTHROPIC_*`/`CLAUDE_CODE_*`/cloud/OpenAI/DeepSeek/Google/Supabase/Vercel variable, no `XDG_RUNTIME_DIR`); `setsid -f` (survives a closed terminal / dropped Pi session) + `setpriv --no-new-privs --pdeathsig TERM`, `umask 0077`, never root, no listening socket; supervisor flock + pid file (0700/0600) beside the worker's own lock (a hand-run worker blocks `start`); restart after ANY worker exit, exit 0 included, with exponential back-off (corrected 2026-10-05; `stop` is the only stop; stderr EOF is not an exit); whole-tree stop incl. a CLI in its own session, SIGKILL escalation, orphan sweep; `stop` refuses while a job runs unless `--now`, `stop --drain` waits for idle; logs 0600 with token/bearer/JWT/e-mail/UUID/opaque-string masking and tracebacks reduced to an exception type; readiness = pid+lock+fresh `status.json` of THIS worker + two poll writes (no model call; it proves the worker is polling, not by itself that the server answered); the supervisor never runs `claude` (the worker + adapter stay the only model boundary) and never extracts the worker token. **Honest state:** NOT boot-persistent and NOT a managed service: after a PC/WSL/Windows restart, a sleep or a network loss nothing runs until `start` is run again; persistent host startup stays UNAVAILABLE until the VPS or an owner-installed unit. **Checked (offline, no model):** `tests.test_pc_research_supervisor` 54 tests x3 green incl. the REAL unchanged worker + the repo's fake API/CLI under the supervisor, 26 mutants caught; `tests.test_pc_research_worker tests.test_source_access_v2 tests.test_label_elemental_dose` green; `pipeline.invariants` + `pipeline.selftest` ALL PASSED; supervisor `describe`/`check`/`status` run read-only against the real installed runtime (checksums match the 9e9c0d3 blobs; the worker's `check` ok; nothing started). `app/`, `lib/`, SQL, the release script and the unit template are byte-identical; TypeScript typecheck/lint/Vitest/`next build`/Playwright were NOT re-run (no TS file changed). **Not proved:** a real model run under the supervisor (the one owned job already passed on the same runtime), survival of a WSL idle shutdown, an independent review. **Handoff:** (1) independent review + the Claude Code owner's read-only verification of this file; (2) install the one file per `docs/research/pc-research-worker.md` "Temporary main-PC background worker", `check`, `start --wait-ready`, `status` READY; (3) only then Production `SCAN_LIVE_RESEARCH_ENABLED=on` + redeploy (the Sensitive owner-id variable is kept, never echoed; the worker token already matches and is not rotated); (4) append the real worker pid/state here; the VPS migration needs its own permission.

**2026-10-04 (evening, UTC) — Live research: RELEASED_RESTRICTED (HISTORY: superseded by the RELEASED_EVERYONE entry at the top of this section). The privacy-clean commit is on `main`, production runs it in the private `owners` mode, ONE real owned job passed end to end; the persistent service is NOT active; research for everyone is NOT enabled.** `main` = `9e9c0d30becd1cc70fff2f115205dfbdeb8d7514` (fast-forward from `224715a`, pushed after the Claude Code owner's SECOND read-only verification said OWNER_PASS: `claude-sonnet-5-5`, effort `xhigh`, subscription login, no budget/turn/deadline/fallback flags; the private candidate `8eccc35` was never pushed and is not an ancestor; a counts-only privacy scan found 0 occurrences of the designated handle or id in any commit, message or tree). **Production (verified 2026-10-04):** the canonical alias was READY on that exact SHA twice: first from the push with every research setting UNSET (`POST /api/scan/research/` 503 `research_disabled` before auth, owner `GET` 401, worker door 503), then after `BS_PROOF_RESEARCH_WORKER_TOKEN` (Sensitive, the existing main-PC token passed by stdin, not regenerated), `SCAN_LIVE_RESEARCH_OWNER_IDS` (Sensitive) and `SCAN_LIVE_RESEARCH_ENABLED=owners` were added and the deployment was redeployed; afterwards anonymous/bogus-bearer calls answer 401 `no-store` and the worker door 401 for a missing or wrong token. No service-role key is on any PC and no SQL was applied (`docs/research-jobs.sql` sha256 `48783cd3…9a4fb` unchanged; no other app, provider, redirect or Google setting was touched). **Main PC:** runtime `bsproof-research-worker-9e9c0d30becd` reinstalled from the promoted commit (every runtime file equals the commit blob; jsonschema 4.26.0 Draft 2020-12; `check` ok; the old `f8e8df821` release kept as `previous`). **The one job:** the designated test account (genuine Google sign-in on production, no password/MFA/challenge) saved a manual scan through "Search your supplement": creatine, form NOT stated, 4000 mg per serving, servings per day left blank; the panel queued one job (201); the target had `servings_per_day: null` (never assumed 1). Attempt 1 (376 s) was refused by the worker's own grounding guard (a cited DOI was in no tool output) and requeued as `worker_internal_error`; attempt 2 (397 s) completed and the strict canonical result is stored. Actual model: `claude-sonnet-5-5` primary (53,350 output tokens), effort `xhigh`, `apiKeySource` none, CLI 2.1.287, WebSearch/WebFetch only, 47 turns; the CLI's own fetch summariser `claude-haiku-4-5` also ran, as documented. Real access: 24 search snippets + 11 fetch summaries, 5 walls, 5 errors, 0 original documents, 14 source IDs (all `derived_snippet`), 7 outcomes. Stored provenance: `affects_score`/`human_verified`/`clinically_approved` all false, `experimental_unvalidated`, SourceAccessV2, `subscription_no_api_spend`. Owner `GET` 200 `no-store`; the live panel went Queued -> Completed without any percentage/ETA/progress bar; History replay opened the saved scan with ZERO POSTs and showed the same audit tagged EXPERIMENTAL and UNGRADED. This proves mechanics, ownership and provenance, NOT that the audit's studies or conclusions are right (nobody checked them), and it does not score anything. **Tradeoff the owner accepted:** the CLI run has no budget/turn/time cap; the app-side queue caps (3 open jobs per user, no global cap) are separate and are the only brake, so opening to everyone stays a SEPARATE explicit founder decision. **NOT done / blocked:** (1) the persistent service: `systemctl --user` fails ("Failed to connect to bus"; no `dbus-user-session`) because `systemd-analyze --user verify` was run against the REAL runtime dir (by the fix worker twice and, earlier, once by the release operator), which orphaned the live user manager's private socket; nothing was restarted (rule), `sudo -n` needs a password, so the owner chooses: install the byte-identical reviewed SYSTEM unit with sudo (`install` + `systemd-analyze verify` + `enable --now`; exact commands in `docs/research/pc-research-worker.md` "Owner-only install path") or deliberately recover the user manager; (2) the phone check and a live cross-owner 404 (no second genuine identity exists; offline-tested only, UNTESTED live); (3) opening research to everyone. **Handoff:** nothing is in flight in code; the owner installs the service (commands in the worker doc), then optional phone/second-identity checks, then decides on everyone; delete the unused `smoke.env`; never run `systemd-analyze --user verify` against the real `XDG_RUNTIME_DIR`; never push `component/final-release-live-research-20261004` (its tip carries a real account handle).

**2026-10-04 (later) — Live research: PRIVACY-CLEAN re-issue of the integration; a genuine production Google sign-in is proven; (state BEFORE the release; superseded by the RELEASED_RESTRICTED entry above: that candidate was then pushed, deployed and used for one real job).** The Claude Code owner's read-only verification of the first integrated candidate (a local commit on `component/final-release-live-research-20261004`) found the code, SQL, security, model boundary, gating and gates clean and returned NEEDS_WORK on exactly ONE blocker: a real designated Google account handle had been written into one status sentence of this file. It is not a credential, but a push would publish it permanently, and deleting it in a child commit would still publish it inside the ancestor. So that candidate is kept UNCHANGED and PRIVATE (never amended, rewritten, deleted or force-pushed; NEVER to be pushed), and the publishable chain was rebuilt as a new LOCAL branch `component/final-release-live-research-20261004-clean` (worktree `/tmp/bsproof-final-live-release-clean`): reviewed `a6be3f8` -> backend `0e9b6a4` -> UI `89c9a49` (the safe parent, no handle) -> ONE new integration commit that replays the candidate's tree diff through the working tree (the raw handle was never committed) and does not have the private candidate as an ancestor. Apart from three allowed docs/config files the tree is byte-identical to the private candidate: nothing under `app/`, `lib/`, `components/`, `tests/`, `pipeline/`, `scripts/`, `prompts/`, `schemas/`, `sources/`, `vocab/`, `docs/SPEC.md` or `docs/research-jobs.sql` differs (SQL sha256 `48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb` unchanged; no constant, model prompt or test changed). The three: (a) this file — the handle is removed and no handle, e-mail or user id of the designated account is anywhere in the repo, a commit message or a log; (b) `docs/research/pc-research-worker.md` — the owner's non-blocking corrections: "shutdown never finishes a job" means the WORKER posts nothing, but on the final attempt the claim sweep ends the job as `failed`/`lease_expired`; the kill switch is the literal `off` plus a redeploy (`1`/`true`/`yes` also enable research) and a token revoke needs a redeploy too; the genuine Google sign-in and the verified user id are an explicit numbered step BEFORE the owner flag; an OFF deployment still shows the Experimental/Ungraded panel (one POST answered 503 per stored fresh scan) and History replay shows a look-up button; widening to everyone is a SEPARATE explicit founder decision and is NOT activated (the panel auto-POSTs per stored fresh scan, 3 open jobs per user is the only cap, there is no global cap); the stale "NOT RUN YET / set the flag to 1" header of the hash-locked SQL is corrected in the doc, not in the SQL; (c) `deploy/bsproof-research-worker.service.example` — CONFIGURATION, not documentation: the USER unit gains `WorkingDirectory=` on the current runtime and the same credential `UnsetEnvironment=` scrub the reviewed system unit already has, every other directive (absolute `%h` `EnvironmentFile`, `NoNewPrivileges=yes`, `UMask=0077`, `KillMode=control-group`, `TimeoutStopSec=60`, `Restart=on-failure`, `RestartSec=30`) is unchanged and identical to the owner-reviewed privately staged unit, and the stale "user manager unreachable" comment is replaced. It passed `systemd-analyze --user verify` but is NOT installed; the owner must review it again before any install. **Production facts (2026-10-04, nothing secret printed):** a genuine Google sign-in of the designated test account SUCCEEDED on production (last sign-in 2026-10-04T21:10:51Z, through the fixed Google button; Google asked for no password, MFA or challenge; Supabase `auth.users` has exactly one Google identity for it). Its user id is saved ONLY in a private 0600 file outside the repo (`/tmp/bsproof-release-private/designated-owner-uid.txt`) for `SCAN_LIVE_RESEARCH_OWNER_IDS`. The main-PC user systemd manager was found working (`Linger=yes`), so the worker installs as a USER unit and sudo is NOT needed (the system unit stays a fallback). **Hazard found while verifying the unit:** `systemd-analyze --user verify` starts a throw-away manager that re-binds `$XDG_RUNTIME_DIR/systemd/private`; against the real runtime dir it orphans the live user manager's socket, which then keeps running but is unreachable and `systemctl --user` fails with "Failed to connect to bus" (reproduced in an isolated test; the likely cause of the 2026-10-03 "orphaned private socket"). The verification of this unit ran against the real runtime dir BEFORE that was understood, and `systemctl --user` was afterwards observed to fail, so the live manager's socket must be re-checked and, if orphaned, recovered by a deliberate restart decided by the human owner (nothing was restarted); verify only with `XDG_RUNTIME_DIR=$(mktemp -d)`, as the docs and the unit comment now say. **Context:** the two component branches `component/final-backend-live-research-20261004` (`62714cf`) and `final-ui-live-research-20261004` (`de169b8`) were already pushed to `origin` as separate component branches before the owner review (they contain neither the handle nor the owner-smoke gate), so any older "not pushed" wording about those two components is stale; this integration branch is NOT pushed, `origin/main` is still `224715a`. GATES on this clean tree (logs `/tmp/bsproof-final-live-release-clean-logs/`): `git diff --check`; `tsc --noEmit`; `eslint .` 0 errors / 6 pre-existing warnings; research-focused Vitest 10 files / 211 tests; full Vitest unit run 70 files / 1054 tests green; `python3 -m pipeline.invariants` and `pipeline.selftest` ALL PASSED; worker/adapter/native-CLI offline Python 61 tests OK in the repo `.venv`; `bash -n` on the release script; `docs/research-jobs.sql` sha256 unchanged; the privacy scan (case-insensitive, counts only) found 0 occurrences of the designated handle or user id in any commit, message or tree from `origin/main` to this head, and the private candidate is not an ancestor. Full e2e and `next build` were NOT re-run: the code tree is byte-identical to the candidate whose e2e/build gates are listed in the entry below. **Handoff:** see the Handoff sentence of the entry below and `Next`; the next step is a fresh Claude Code owner verification of this clean commit, which must say OWNER_PASS.

**2026-10-04 — Live research: the captured LAPTOP backend + UI WIP is finished and INTEGRATED onto the reviewed release `a6be3f8` (privacy-clean re-issue: branch `component/final-release-live-research-20261004-clean`, worktree `/tmp/bsproof-final-live-release-clean`; research still OFF, nothing deployed or provisioned, no model called).** The laptop's uncommitted work (31 files across a backend and a UI worktree) was captured read-only first: `/tmp/bsproof-laptop-live-snapshot/` (`manifest.json`, `SHA256SUMS` verified; stable pre/post manifests; the laptop WIP itself is untouched). 24 of the 31 files were already byte-identical to `a6be3f8`; the 7 that differ carry only OLDER status/CSS text that `a6` supersedes, so `a6`'s versions stand and the old competing `e7` backend was not used. The two finished components were cherry-picked in turn onto `a6be3f8` with no conflict, which keeps `origin/main` `224715a` (and `a6`'s security, dose, referrer and translation-cache fixes) as ancestors: backend `62714cf3510070d8c7171470bdd4f51c00fc0235` (from `/tmp/bsproof-final-backend`; executed-SQL tests on PGlite PostgreSQL 17.5 incl. a 20-mutant suite, route-vs-SQL parity test, worker shutdown never finishes a job, real `ResearchJobV1` daily-dose/blend checks, `BS_PROOF_RESEARCH_DATA_DIR` absolute, `compileStrict2020` fail-closed Ajv) -> `0e9b6a4`; UI `de169b8393adfb6bc5102ad6c0fceaa839ea725f` (from `/tmp/bsproof-final-ui`; panel rebuilt on the `SourceAccessSummaryV2` contract: real queued/running/succeeded/failed stages, no percentage/ETA, EXPERIMENTAL + UNGRADED, no score/bar/verdict, facts the scan did NOT record are listed and never defaulted, model narrative never machine-translated, History replay asks for nothing by itself) -> `89c9a49`. Integrator-owned additions in THIS commit: (1) the private owner-smoke gate (`SCAN_LIVE_RESEARCH_ENABLED=owners` + `SCAN_LIVE_RESEARCH_OWNER_IDS`, `lib/scan-research/contract.ts` `liveResearchMode` / `researchOwnerIds`, `app/api/scan/research/route.ts`): the flag was all-or-nothing and the panel asks for research on every stored scan, so there was no way to run the single genuine-Google smoke in production without opening the queue to every signed-in user; now OFF stays the default for unset/typo values, `owners` admits only the Supabase-verified user ids listed (UUIDs only, at most 20, never an e-mail or anything the client sends), an empty/malformed list admits nobody, a non-listed verified user gets the byte-identical `research_disabled` answer OFF gives, the check is after authentication and before the body/scan read/queue, and the owner GET and worker door are unchanged (`tests/scan-research-owner-smoke.test.ts`, 15 tests, 6 mutants caught); (2) a cross-module wire test (`tests/scan-research-wire.test.ts`): one job through the REAL routes, every owner-facing reply through the panel's own parsers (queued/running/succeeded/failed all parse; model text, summary counters and inventory ids arrive unchanged; no receipt text/hash/lease/owner id/worker message leaks; over-claiming results are refused by the reader; a renamed provenance field was shown to fail it); (3) `docs/research/pc-research-worker.md` "Staged rollout" (settings, owner-id lookup, token-match probe, sequence, kill switches). NATIVE SQL: no additive delta is needed — `docs/research-jobs.sql` is unchanged, the laptop WIP copy is identical, sha256 `48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb` is exactly what was applied, and a SELECT-only re-check through the Management API's read-only endpoint (2026-10-04) found the live schema as proven: table with RLS on, 0 policies, no table privilege for anon/authenticated/service_role, 8 `bsproof_research_*` functions with pinned `search_path`, six SECURITY DEFINER with EXECUTE for service_role only, 0 jobs. No live SQL, provider, DNS, Google or site change was made. GATES (logs `/tmp/bsproof-final-live-release-logs/`, run on the first private candidate whose code tree is byte-identical to this commit's; the clean re-issue's own re-run is in the next entry up): `git diff --check`; `tsc --noEmit`; `eslint .` 0 errors / 6 pre-existing warnings; Vitest 70 files / 1054 tests (3 consecutive green runs on a loaded machine), research-focused 10 files / 211 tests; `next build` ordinary + `/api/scan/research`, `/[id]`, `/worker` present; FULL ordinary Playwright e2e 840 passed / 18 skipped (configured-only); configured-auth (mocked Google) build + focused e2e (scan-research, scan-workspace, tester-auth) 26 passed / 6 skipped; `python3 -m pipeline.invariants` and `pipeline.selftest` ALL PASSED; worker/adapter/native-CLI offline Python (`tests.test_source_access_v2 tests.test_pc_research_worker tests.test_label_elemental_dose`) 61 tests OK in the repo `.venv` (jsonschema 4.26.0; under the system `python3`, jsonschema 3.2.0 cannot validate Draft 2020-12 so those tests FAIL by design instead of skipping); `bash -n` on the release script; `systemd-analyze verify` of the system unit has no finding for it; `npm audit --omit=dev` 0 vulnerabilities. NOT proved by any of this gate list: a real model call, the production deployment, the service unit, clinical accuracy (a genuine production Google sign-in was proven separately, see the next entry up). Facts for the release operator (read-only, 2026-10-04, no secret printed): Vercel Production has the six sign-in/Supabase variables and `SUPABASE_SERVICE_ROLE_KEY` (sensitive) but NO `SCAN_LIVE_RESEARCH_*` and NO `BS_PROOF_RESEARCH_WORKER_TOKEN`; the main-PC runtime is still the OLDER `bsproof-research-worker-f8e8df82117e` (predates the shutdown/target-contract fixes; needs `deploy/pc_research_worker_release.sh build` + `install` from the promoted commit); `worker.env` is 0600 in a 0700 dir; no unit is installed (the plan is now the USER unit and sudo is not needed, see the next entry up); `claude` 2.1.287 is logged in via `claude.ai` on a `team` subscription with the API variables unset; an unrelated, unused 0600 `~/.config/bsproof-research-worker/smoke.env` from an earlier attempt exists (the later owner check found it holds only a URL-shaped value, not a key; deleting it is hygiene). **Handoff (2026-10-04, live research):** this branch is a LOCAL clean-chain commit only (no push, no merge, no deploy, no install, no job; root `main` and `.pi/subagents` untouched; `origin/main` is still `224715a`). Next owners, in order: (1) the Claude Code owner's fresh read-only verification of THIS clean commit — it must say OWNER_PASS, including the user-unit CONFIG change and the privacy proof (no designated handle, e-mail or user id in any ancestor from `origin/main`); NEVER push the older private branch `component/final-release-live-research-20261004`; (2) fetch/integrate current upstream `main` safely, re-run the relevant gates, push `main` (founder permission already granted), deploy with the research settings UNSET and verify READY at the intended commit; (3) set the worker token (stdin, never printed, preserve the existing `worker.env` value), `SCAN_LIVE_RESEARCH_ENABLED=owners` and `SCAN_LIVE_RESEARCH_OWNER_IDS` from the private 0600 id file (the designated test account has already signed in genuinely on production), then redeploy; (4) rebuild and install the runtime from the promoted commit and install the USER unit from the repo example (identical directives to the privately staged one) after the owner's review; verify only with a throwaway `XDG_RUNTIME_DIR`, re-check `systemctl --user is-system-running` first, no sudo; (5) one genuine-Google smoke on the designated test account (manual creatine 4000 mg with the servings recorded by the person, never assumed); (6) widening to everyone is a SEPARATE explicit founder decision after that job passes and is NOT activated. Any Google failure blocks general use.

**2026-10-03 — Live Sonnet research: reviewed code INTEGRATED on current main `224715a` (WIP branch `feat/live-research-release-20261003`; research OFF, nothing provisioned).** Offline backend (research queue/consumer, SourceAccessV2 TypeScript validation + Python emission, owner-only POST/GET `/api/scan/research`, token-gated worker route, SQL file, pinned deploy examples, `claude_research_adapter` boundary in `pipeline/` with invariant/selftest coverage of every import spelling) and the owner-private `ScanResearchPanel` UI are ported onto the dose, Google-referrer, translation-cache, desktop-CSS (`b30b017`) and `5dcee28` state. Both lanes were independently reviewed and ACCEPTED before this integration (backend: its one blocker, reading the producer field `printed_elemental_dose_mg`, was fixed and re-accepted; UI: 14 tests). Integrated gates, run in this worktree: 36 Vitest files / 547 tests covering research, History, localization, referrer/Google/auth, analyze-label/dose and retained-scan paths; the six research files alone 89 tests; Python `tests.test_source_access_v2 tests.test_pc_research_worker tests.test_label_elemental_dose` 49 tests, 0 skips, in the isolated research venv; typecheck; changed-TS ESLint (23 files); `pipeline.invariants` and `pipeline.selftest` ALL PASSED; `bash -n deploy/pc_research_worker_release.sh`; `git diff --check`; `npm audit --omit=dev --audit-level=high` 0 vulnerabilities; production build, which lists `/api/scan/research`, `/api/scan/research/[id]` and `/api/scan/research/worker`. Integration changes beyond the copy: the research CSS block was appended once (the desktop `b30b017` block already on main was kept, not duplicated), and `tests/scan-signin.test.tsx` / `tests/scan-auth-history-integration.test.tsx` now exclude the panel's `/api/scan/research` probe from their *scan-request* assertions (the probe's own contract is covered in `tests/scan-research-panel.test.tsx`). **Known, not introduced here:** `tests/plain-language-prompts.test.ts` expects `compat-v1.1` while main `224715a` ships `compat-v1.2`, so a full `vitest run` has that one failing test on pristine `224715a` as well (confirmed in `/tmp/bsproof-current`); the deployment-prep change (independently reviewed, committed on the WIP branch) updates only that test's expected string to the current approved `compat-v1.2`, with no prompt or constant change. **Deployment prep (not executed on the mainPC):** `deploy/bsproof-research-worker.service.example` gained the nvm node dir in PATH; new `deploy/bsproof-research-worker.system.service.example` runs as `User=icefrost` against the isolated `~/.local/share/bsproof-research-worker` runtime, 0600 env file and 0700 data dir; the release script's rollback hint is unit-neutral; `docs/research/pc-research-worker.md` has the owner-only install/daemon-reload/enable/start/status/rollback commands for that one unit (never restart user@1000/dbus/WSL/session; the sudo password is never given to an agent). Nothing installed, no env/token, no service, no SQL, no model call. **Not done / not claimed:** research flag is OFF; no SQL executed, no worker token, systemd/service, or model provisioned; no live model call or job smoke; the mainPC runtime check found the user systemd socket orphaned with no user DBus and sudo needing a password, so a persistent service install needs owner action; no owner Claude Code verification, real-phone, Google-consent/Supabase session roundtrip or clinical validation was performed. **SUPERSEDES** these older statuses (left in place below as history): research branches `00b17d9`/`a74160e`/`e0aa0fb` as 'pending review'; the dose-fix 'publish this verified milestone' handoff (the dose release is on `main` `224715a`); and the Google 'origin still rejected / button not yet verified' notes (production now returns GSI HTTP 200 with a clickable button; the full consent→session→History roundtrip is still unverified). **Handoff:** parent inspects this WIP branch and promotes it only after a scoped provision + model smoke; main was not touched.

**2026-10-03 (later) — mainPC runtime STAGED, still not activated (research OFF).** From the laptop, over key-only SSH to the main PC (`icefrost`), the reviewed runtime `bsproof-research-worker-f8e8df82117e` (commit `f8e8df82117e403e0611849d077d737c402e2c74`, tarball SHA256 `427138350fe6f20f99f58d859c21dc0555f32c95943feef9df8f11455d116287`) was installed as the unprivileged user with the reviewed `deploy/pc_research_worker_release.sh install`: `~/.local/share/bsproof-research-worker/releases/bsproof-research-worker-f8e8df82117e` (dedicated venv, Python 3.10.12, jsonschema 4.26.0; `current` -> that release; all six `SHA256SUMS` OK; both schemas load; worker and adapter import) with `data/` and `~/.config/bsproof-research-worker/` (the latter EMPTY, no `worker.env`, no token). The setup directory `~/.cache/bsproof-research-setup-20261003` (0700) holds only the checksummed tarball, the release script, the system-unit template and `docs/research-jobs.sql` (SHA256 `48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb`). `systemd-analyze verify` of the staged unit (copied to a `.service` name in /tmp, then removed) exits 0 now that the real paths exist; only unrelated host warnings appear (`netplan-ovs-cleanup.service ... Permission denied`, `snapd.service:23 Unknown key name 'RestartMode'`). Absolute Claude CLI `/home/icefrost/.local/bin/claude` -> `2.1.287`; primary group of `icefrost` is `icefrost`. NOT done: no service installed/enabled/started (`/etc/systemd/system/bsproof-research-worker.service` does not exist), no sudo, no worker token or `worker.env`, no `check` (it can only PASS once `worker.env` exists), no model call. **Read-only database preflight on the shared Supabase project (Management API `SELECT`s only, no DDL):** PostgreSQL 17.6; `gen_random_uuid()` and `sha256(bytea)` available; `public.bsproof_research_jobs`, every `bsproof_research_*` function/relation, index `bsproof_research_jobs_open_idx` and trigger `bsproof_research_jobs_guard` are ABSENT (no foreign object); prerequisite `public.scan_runs` and `public.scan_users` exist with RLS on, 0 policies and no `anon`/`authenticated`/PUBLIC privilege. So `docs/research-jobs.sql` is READY to apply as a first provisioning (not applied). **Preview:** the Vercel `ignoreCommand` skips every non-`main` branch (status 'Canceled by Ignored Build Step' for `f8e8df8`), so NO preview URL exists for this WIP branch; production (`main` `224715a`) answers an unauthenticated POST to `/api/scan/research/worker/` with a 404 HTML page because the route is not on `main`. A real smoke therefore needs either a deliberate non-`main` deployment (no Vercel setting changes were made) or promotion of the WIP branch. **Owner step still required (sudo password, never given to an agent):** `sudo install -o root -g root -m 0644 /home/icefrost/.cache/bsproof-research-setup-20261003/bsproof-research-worker.system.service.example /etc/systemd/system/bsproof-research-worker.service && sudo systemd-analyze verify /etc/systemd/system/bsproof-research-worker.service && sudo systemctl daemon-reload` (enable/start only when the single smoke is authorized). **Handoff:** parent applies the SQL and provisions the dedicated token (Vercel + `worker.env` 0600), then runs `check`, installs/starts the unit via the owner step and runs the one smoke; service, token, SQL and model remain NOT activated.

**2026-10-03 (later still) — scoped DB provision DONE + worker config created; private live smoke BLOCKED, no model call made (research still OFF, `main` untouched at `224715a`).** (1) The exact reviewed `docs/research-jobs.sql` (SHA256 `48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb`, byte-identical to the staged copy) was applied once to the shared Supabase project through the Management API after the absence guard was re-run (HTTP 201, no error; the script's own single transaction). Verified afterwards: `public.bsproof_research_jobs` with RLS on, 0 policies, 0 table privileges for anon/authenticated/PUBLIC/service_role, guard trigger and open-index present, 8 `bsproof_research_*` functions all carrying the `BS-PROOF research jobs:` comment, `search_path=pg_catalog, pg_temp`, six SECURITY DEFINER with EXECUTE only for service_role (`get` STABLE, the rest volatile), helpers executable by nobody, no PUBLIC execute; extension count unchanged (5), no auth/storage/provider/exposed-schema change. The PostgREST schema cache reloaded (the script's own `notify pgrst`): an anon `rpc/bsproof_research_get` call returned 401 `42501 permission denied for function` and an anon table GET 401 `42501`. (2) A new dedicated random worker token (64 hex) and `API_BASE=https://bs-proof-dashboard.vercel.app`, the pinned Claude binary and the data dir were written ONLY to the mainPC `~/.config/bsproof-research-worker/worker.env` (0600 in a 0700 dir, created with no-clobber; the token was never printed, logged, put on a command line or committed). The reviewed `check` passed with the API credential variables unset (config, jsonschema 4.26.0, prompt `live-research-v0.2`, Claude CLI `2.1.287`, data dir writable); `claude auth status --json` (API variables unset) reported loggedIn, auth method `claude.ai`, provider firstParty, subscription type `team`. No model was called. (3) BLOCKERS found before any server or job existed, so NOTHING of steps 3-5 ran (no local API, no SSH tunnel, no test identity, no job, no worker run, no model call): (a) the Management API token the agent holds is refused (HTTP 403 'does not have the necessary privileges') for `GET /v1/projects/{ref}/api-keys?reveal=true`, and no other authorized store holds `SUPABASE_SERVICE_ROLE_KEY` (mainPC env has only the Management token, project ref, public URL and anon key; the laptop repo `.env.local` only a Vercel OIDC token), so the private API cannot verify users, read `scan_runs` or call the queue RPCs; deriving or minting a service key was not attempted because it is outside the authorization. (b) By code the research routes (`app/api/scan/research/route.ts`, `[id]/route.ts`) call `authenticateRequest(..., requireGoogle: true)` and `hasGoogleIdentity` accepts only a Supabase user whose `identities[].provider` or `app_metadata` is `google`, so an ordinary email/password test identity would be rejected 401 and a Google-flagged one could only be made by forging provider metadata, which is prohibited; a genuine Google session needs the agent-owned Google account sign-in. Not proved by anything here: source/model clinical accuracy, real Google/phone flow, any live Sonnet behaviour. Smoke resumes only when the supervisor supplies the service-role credential by an authorized route and decides the identity path.

**2026-10-03 — Printed elemental label-dose correction, verified release.** Label-v1.5 distinguishes printed elemental mineral amount from compound mass, including active rows; declared 200 mg stays 200, while printed magnesium glycinate compound 200 mg retains its existing 28.192 mg conversion. Scan/API/Python use the same `elemental_stated` basis, compatibility-v1.2 carries honest dose basis, and EN/LT displays and legacy History replay are covered. Six regression groups passed fresh independent source review: API parity, retained-audit refusal/control, TS/Python contradictory rows, compatibility prompt basis, stubbed CLI scoring and actual EN/LT replay chips with no new scan call. Integrated checks passed: 88 tests in nine focused Vitest files, four Python validator/CLI tests, typecheck, changed-file ESLint, both Python gates, diff check and 296-page build. Upstream `c9730cf` camera cropping/top-bar, logo, Google origin fix, cache isolation and benchmark publication are preserved. No scoring constants, retained fixtures or exact-match rules changed. **Handoff:** publish this verified milestone; owner Claude Code verification and real vision read remain distinct unperformed checks. Google button is verified live (HTTP 200), not yet independently verified through a full Supabase session/History roundtrip. Next: live Sonnet 5.5 queue/consumer/provenance and UI integration is in flight on isolated WIP branches; user explicitly requested reviewed provisioning and actual job smoke, runtime remains inactive until those checks.

**2026-10-03 — Google origin/referrer fix:** Google Cloud origin settings were correct; production's `no-referrer` policy removed the Referer from GSI button requests. A controlled browser test on the canonical domain changed only document policy to `strict-origin`: request sent only `https://bs-proof-dashboard.vercel.app/`, Google returned 200 instead of 400 and rendered a clickable button. Owner approved a narrow permanent fix: `/scan` metadata is `strict-origin`, root metadata explicitly restores `no-referrer`; Vercel's restrictive global headers stay unchanged. Focused policy/Google tests (16), typecheck, scoped ESLint, both Python gates and build (296 pages) passed. Fresh independent source/security review accepted the narrow fix. **Handoff:** publish the verified change, then check hard-load/soft-navigation metadata and Google consent → Supabase session → private Scan/History/replay. Button success is not proof of the full flow. No cookies, credentials, provider settings or authentication enforcement changed.

**2026-10-03 — Original-contract research comparison PUBLISHED (docs and assets only; NO app, scorer, constant, schema,
prompt, SQL, env, provider or service change).** `docs/design/research-original-contract-comparison/` (README,
`manifest.json`, `report.csv`, `SHA256SUMS`, `scripts/verify_publication.py`, 16 images, 10 raw audits) is the actual
comparison of the original `audit-v0.4` contract run by Sonnet 5.5 xhigh (`claude-sonnet-5-5`) and Opus 5.5 high
(`claude-opus-5-5`) on five frozen typed cases (elemental Mg and Zn; 1000 mg EPA+DHA, not total oil; vitamin C chemical form
unspecified; adult, health status and serving count unknown), 10 of 10 captures complete, no reruns, no turn/time/budget
caps. It **supersedes** the "research comparison preview shared" entry below and the redo request; the old preview under
`docs/design/research-benchmark-preview/` is kept only as an archive with an OBSOLETE banner (no asset deleted).
- **What is published.** Only the 16 fully annotated compositions (1 overview + 5 side-by-side + 10 individual), byte-identical
  to the reviewed `parallel-render` set (sha256 preserved), and the 10 raw `audit.json` byte-identical to the immutable
  `parallel-v2` captures (recorded hashes equal; canonical 2020-12 schema; the CLI wire copy is canonical minus only
  `$schema`). NOT published: raw CLI streams/stderr/system prompts/request files/per-capture reports (cost, session ids), the
  108 card-crop and supplemental captures (non-standalone), any "General score" tile or ranking. `report.csv` carries the
  actual wall time and aggregate access counts per capture, labelled contention-affected, not an SLA, no ranking.
- **How far to trust it (kept in every image and in the README).** Experimental, unvalidated rubric, not clinical advice, no
  provider winner, no ranking, no clinical source validation, no formal stopping rule or exhaustiveness claim. Access
  numbers: 311 WebFetch = 116 non-access + 21 Haiku refusals + AT MOST 174 content-bearing Haiku 4.5 summaries (an upper bound,
  not papers read). Case 5 shows only `outcomes[0]` (exact combination); its other rows are DO_NOT_GRADE and never averaged.
  W4 ledger inconsistencies are recorded, NOT repaired (Opus case 1 row 3, Opus case 2 row 2; Sonnet case 5 rows 2-5 are
  hidden), so those displays are untrustworthy; W6 (Opus case 2 Lopresti 2019, abstract via search) is borderline. Unresolved
  and not-string-found IDs stay plain text with no fabricated link. The cards are the unchanged `/scan` card at `4a87e22`
  (runtime identical to `6a1734d`) fed through a non-production fixture that bypasses the production matcher: **not**
  production retained audits (the "Retained audit - not reverified" wording is the existing card text), not an
  end-to-end photo scan, not today's `/scan`; installed Next 16.3.8 versus that commit's 16.3.0 lock (React 19.2.8) is
  disclosed. No scientific-grade authorization changed; the three approvable cached datasets are separate; no new production
  score exists.
- **Reviews (independent, read-only).** Fidelity: first review NEEDS WORK, overlay/metadata fix, fresh recheck PASS; source
  and method: capture integrity PASS (its reporting-layer NEEDS WORK was closed by the addendum); access addendum: PASS.
- **One disclosure choice for the owner pass.** 15 of the 16 images print the raw audit's location in the private build
  scratch area (no user name, no credential). They were NOT altered, because the byte hashes and the fidelity PASS are the
  point of the set; the README says so and points at `audits/`.
- **Gates at publication (fresh, this tree; private logs under the publisher's build scratch):**
  `docs/design/research-original-contract-comparison/scripts/verify_publication.py` 35/35 (36/36 with `--source-dir` against
  the private immutable captures) and `--self-test` 21/21 mutations caught (the exclusive ones prove one named check bites);
  an independent Ajv 2020 (strict, the repo's ajv 8.18.0) check of the 10 audits: 10 valid, four mutated copies rejected;
  `pipeline.invariants` and `pipeline.selftest` ALL PASSED; `git diff --cached --check` clean; `npm run typecheck` 0 errors;
  `npm run lint` 0 errors / 6 pre-existing warnings; `npm run test:unit` 58 files / 848 passed (the tree includes the 13:27 translation-cache commit); ordinary `npm run build` OK;
  `npm audit --omit=dev --audit-level=high` 0 vulnerabilities. Playwright e2e was NOT run (docs and assets only, no UI/API
  change); the earlier release's 838 passed / 10 skipped belongs to that earlier tree and is not claimed for this one. The
  Claude Code OWNER verification (read-only, `claude-sonnet-5-5` at xhigh, credential-free snapshot; a full pass and a delta
  confirmation) and its verdict are recorded in the commit body, not here.
- **Handoff (publication, 2026-10-03):** the root publication writer is COMPLETE with the commit that carries this text
  (`git log -1 -- docs/design/research-original-contract-comparison/manifest.json`). No other LOCAL process wrote to the root
  checkout (a point-in-time check of process working directories); other people do push to `main` (the founder account and
  Ignas pushed 19 new commits to `main` after the `3ef1218` record, which is why the root was fast-forwarded to `eb30db0`
  before anything was edited). Three
  independent components remain in PRIVATE worktrees, each unmerged, unpushed to `main` and not deployed, besides other old
  unmerged worktrees (see the reconciliation below). Not done and not claimed: any clinical or source validation of the audits,
  a re-render at today's `/scan`, any change to production behaviour.

**Status reconciliation (2026-10-03, 13:08-13:38 EEST). Commits, branches and worktree states below were read from `git`; the Vercel
status from the GitHub commit-status/deployments API; HTTP 200s from `curl`; run ids and the provider-timeout note are as
reported by the parent orchestrator (not independently checked); none of it comes from the older entries.**
`main` = `origin/main` = `d89bf92` (the founder account's 13:27 translation-cache release, listed just below this entry; this
publication not yet included at the time of the check); Vercel Production status "success" for `700557a`, `eb30db0` and
`d89bf92`; canonical `/scan/`, `/` and `/tests/supplements/` return 200 (curl, 13:37). **The older statements
that the PR3 landing and the EN/LT localization are "NOT merged to main and NOT deployed", and that PR3 / full EN-LT had "not
started", are SUPERSEDED:** Ignas' PR3 landing and the shared EN/LT localization were merged to `main` by others at `700557a`
(12:11; checks recorded in `docs/TEAM-STATUS-2026-10-03.md`: typecheck, lint, vitest 844/844, build; NOT run: Playwright e2e,
a real phone, real Google sign-in). This entry re-assesses none of that: the founder-account entry below (13:27) calls the older WIP notes historical
checkpoints and says the LT copy was proofread by a teammate, and the review gates (C1/C2/W1-W6 above) are not claimed
closed here. **Google sign-in:** the 12:30 team status recorded `origin_mismatch`; its 13:27 update says the user saved the
exact canonical origin on the deployed Google client, but the last fresh browser check (theirs, not repeated here) still
returned HTTP 400 origin-not-allowed, and propagation plus a real consent/session/scan/History verification remain open, so
scans stay blocked until a person observes it working. Separate PRIVATE component worktrees at the time of the check (not `main`, not
deployed, whatever their commits say): PR3 / full EN-LT worker run `197cdde3`, branch `pi-subagents/pr3-enlt-3ef1218-s0-t0` at
`4f71da7` plus about 30 uncommitted files (a different, unmerged variant than what Ignas merged); PC research backend, branch `pc-research-backend-2555166-s0-t0`, local commits
`f1a8b3b` then `5019164` (12:55, "no default run limits; strict 2020-12 local schema check fails closed (review fix)"; fresh
review/fix run `71458ad6`; unpushed, not owner-verified), distinct from the pushed WIP branches
`feat/scan-research-queue-20261003` and `feat/pc-research-worker-20261003` that the team status lists as deliberately NOT
merged; Google PKCE alternative component in `/tmp/bsproof-benchmark-preview-publication` (branch
`pi-subagents/google-pkce-component-3ef1218`, base `3ef1218`, about 30 uncommitted files; run `c505591f`, reported as resumed
after a provider request timeout). Other unmerged worktrees also exist and are not part of this: the old
`preview/restore-four-evidence-lines` preview worktree (13 commits ahead of `main`), `bs-proof-aykhan` (2 commits ahead, 2
uncommitted files) and the finished render worktree (branch `pi-subagents/benchmark-visuals-75a7b4f-2971-s0-t0`, clean, at `4a87e22`). **The pending PKCE assessment concerns the CANONICAL `bs-proof-dashboard.vercel.app`**, not the other account's
`bs-proof.vercel.app` (that one is only the separate redirect-retirement question in `Next`). It awaits a HUMAN approval, as
reported by the parent orchestrator and NOT applied by anyone here: an EXACT add-only Supabase redirect entry
`https://bs-proof-dashboard.vercel.app/auth/callback/`, preserving the existing 18 entries, the site URL and the providers.
That alternative needs no edit to the shared Google Cloud client, but a real Google consent and token exchange is still
unverified; it may prove unnecessary if the origin the user saved on the Google client takes effect. Nothing in the Google, Supabase or Vercel configuration was changed by this publication.

**2026-10-03 — Translation cache isolation release:** `translateTexts` scopes reusable entries to the authenticated Supabase user ID supplied by the server route; callers without verified identity bypass cache reads and writes. Serialized tuple keys prevent scope/text collisions; identities never enter model prompts, responses or logs. Focused translation/client tests passed (85), typecheck, changed-file ESLint, both Python gates, diff check, and production build (296 pages) passed. Fresh independent Anthropic source/security review accepted the patch; owner Claude Code verification and live model translation remain separate, unperformed checks. Numeric/unit guards and visible unverified disclosure remain unchanged: word-level mistranslation is still possible. Ignas's logo commit `eb30db0` is preserved. **Handoff:** this is the reviewed cache-only release; the separate magnesium patch is still uncommitted and needs regression completion/review. Research provisioning/activation remains prohibited by the current owner handoff; Google origin was saved by the user but last fresh browser check still returned origin rejection.


**2026-10-03 — Shared persisted EN/LT localization of the whole `/scan` workspace, integrated with Ignas PR3 and the local UI
merge `17359c5`: IMPLEMENTED on branch `fix/scan-localization-20261003`; the localization continuation below is an UNREVIEWED WIP checkpoint, pushed only to this branch, NOT merged to main and NOT deployed.**
Merges on this branch: `origin/main` `3ef1218` (docs), `origin/ignas-pr3` `1f86403` (Ignas ancestry kept) and the local
UI merge `17359c5` (`/tmp/bsproof-ui-en-lt`, branch `fix/scan-ignas-en-lt-20261003`, itself UNPUBLISHED and with an
open independent verification -- the external reviewer's "NEEDS WORK" had no diff, so it means *unverified*, not a
found defect). A separate fresh UI fixer/verifier owns that worktree; if it moves `17359c5`, re-merge it here (the
only conflict surface is `components/scan-flow.tsx`). **Handoff:** actual-source review of this branch + the
UI branch, a Lithuanian proofread of `lib/i18n/copy/*` and `prompts/translate.md`, then push; nothing is published.

- **2026-10-03 localization WIP checkpoint (not a fix/review PASS).** Partial pre-existing uncommitted edits were preserved and checkpointed: translation route, server guard/client limits, AI translation disclosure, locale/UI wiring, vision limits, and scan/translation tests. A narrow translation test passed (71 tests), along with `pipeline.invariants`, `pipeline.selftest`, and `git diff --check`; these do not amount to full localization verification. Source review report `locale-source-review.md` (session output `e80b1614-372a-4941-9ea8-5c46fa6ab284`) previously found C1 (successful model translations lacked an always-visible unverified disclosure) and C2 (sign/comparator/unit safety guard incomplete), plus W1-W6: translator kill-switch, request byte cap, blocked-storage locale fallback, dose-string clip edge cases, oversized-client batch loop, and stale failure state after auth changes. Current partial edits exist in the C1/C2/route/client/locale/vision surfaces, but have NOT been independently reviewed against each issue; treat every cited finding as unverified until a fresh source review and focused tests confirm it. Lithuanian proofreading, broader changed-file tests/typecheck/lint, and end-to-end behavior remain undone. This is a private WIP branch save only; no production/release claim.
- **Next for localization:** verify deployed cache release; retain display-only/unverified caveats, and run real signed-in EN/LT scan → History → replay once Google origin authorization propagates. Prior UI/localization work is merged and LT copy was teammate-proofread; older WIP notes below are historical checkpoints, not current release blockers.

- **Integration decisions (PR3 + UI + localization).** `scan-flow.tsx` keeps the released auth/History/replay code and
  the UI merge's behaviour: static "This check covers" list (no timer, no done ticks, no determinate bar -- `/api/scan`
  streams no progress), `runKind`, one-shot `shrinkForUpload` before POST (reused across a 401 retry), top bar not drawn
  for a replay, sign-in hint under the control row. Only the *words* moved: PR3's `COPY`/`useState` language is gone;
  its landing/camera/loading strings live in `FLOW_COPY` and `useLang()` (same `bsproof.lang` key, English default,
  stored choice carries over). **Exactly one language switch is visible:** the PR3 top bar's `.sc-lang` on the Scan
  tab, the workspace's `.sw-lang` only while History shows (the Scan panel is merely `hidden`, so it is not counted).
  `ScanCamera` takes PR3's `labels` (`CameraLabels`) plus `viewfinder` (the viewfinder's accessible name).
- **One persisted choice.** `lib/i18n/locale.ts`: `useLang()` over `localStorage["bsproof.lang"]` with values
  `"en" | "lt"` and **English default -- exactly PR3's key/values** (read from `origin/ignas-pr3`, whose state lived inside
  `<ScanFlow>`). It is a tiny `useSyncExternalStore` (server snapshot `"en"`, so no hydration mismatch; blocked storage still
  switches for the visit). `<ScanWorkspace>` owns the only toggle (`.sw-lang`, `data-testid="lang-toggle"`), sets
  `<html lang>`, and provides `TranslationProvider`; the Scan tab, History list, a replayed scan, the sign-in card, the
  Google button, the search sheet/forms, the camera labels, and the shared header/footer/skip link all read it.
  `useScanLang()` keeps the shared chrome and the Google button English on every other route (`/`, `/methodology`,
  `/tester`). Errors, auth notices and refusals are held as CODES, not text, so switching language rewords one already on
  screen.
- **Copy** lives in `lib/i18n/copy/{flow,result,history,search}.ts` (typed `Record<Lang, T>`; a missing LT key fails
  `tsc` and `tests/localization-deterministic.test.ts`, which also fails if any LT string equals its EN twin). EN is the
  wording the app always had (every existing test is unchanged and green); LT is informal "tu" like PR3's landing.
- **What is deterministic (no model, no network).** Dose readings and the dose note are re-rendered in LT from the
  STORED numbers (`lib/i18n/deterministic.ts`; its EN twin is pinned byte-for-byte to `dose-effectiveness.ts` by test).
  Fixed server sentences (caveats, evidence-prior disclaimer, registry/seal notes, "no model provider configured"
  reasons, manual-form validation messages, prior dose readings) have exact-match LT. Funding / publication-bias / MLM
  disclosure templates and the retained-audit concern notices have LT templates (`literatureDisclosures(data, locale)`,
  `businessModelDisclosure(model, locale)` take an optional locale; no argument = unchanged English). Ledger words
  (effect / certainty / form / dose words, band labels, gates), badges, legend, enum display words
  (confidence, direction, strength, checklist states...) are lookups applied at render to the stored value.
- **What goes through the model boundary.** Model-authored and retained PROSE (company summary and notes, evidence-prior
  text, compatibility notes, disclosure `basis`/`signals`, the retained audit's plain-language rewrite, outcome and population
  names, `effective_daily_range`, `strongest_doubt`, validity notes, server `error` text) is translated at READ time by
  `POST /api/scan/translate` -> `lib/analyze/translate.ts` -> `chatJson` in `lib/analyze/llm.ts` (the only model file).
  New prompt `prompts/translate.md` + `schemas/translate.json`, **`TRANSLATE_PROMPT_VERSION = "translate-lt-v1.0"`**
  (also the cache key; no other prompt or version changed). Same Google gate as `/api/scan` (SCAN_REQUIRE_AUTH ->
  bearer, checked before the body is read), <= 24 strings / 4,000 chars each / 24,000 total, `no-store`, nothing
  stored. **A translation is accepted only if every number token and every quoted span of the source survives byte-for-byte**
  (`guardTranslation`); otherwise that string stays English. The client (`lib/i18n/translate-client.tsx`) queues only
  the strings actually rendered, one batched POST per tick, and shows "Translating…" / a "some text is in English" note.
- **Never translated, by design:** product, brand, firm, ingredient and form names; raw FDA recall records (product,
  reason, firm, class, dates); label `evidence_spans` and the audit's "Exact wording from the audit" (original, with a
  translated label); run ids, model names, prompt versions, DOIs/PMIDs/source titles; all numbers, units, scales
  (-3..+3 effect, /4 axes, /100), ranges, closeness and counts. **No score constant, enum value, exact-match rule or
  stored analysis changed**; `tests/localization-deterministic.test.ts` asserts the scoring/ledger/dose/catalog modules
  import none of the i18n/translate code, and `tests/scan-localization.test.tsx` compares every number on an EN vs LT
  card token-for-token. No servings/day and no audit score is ever invented.
- **Known untranslated dynamic seams (NOT claimed complete):** (1) `/tester` (`label-analyzer.tsx`) is English-only; (2)
  `/methodology` and the PWA manifest/`<title>` stay English; (3) names listed above, plus catalog/vocab labels
  (`entry.form_label`, `words(form_vocab_id)`, interaction pair names, seal chips, `scored_forms`); (4) if the translator is
  down, unavailable or rejected by the guard, the original English prose shows (with the note) -- there is no offline
  corpus for model prose; English fallback text is not marked `lang="en"`; (5) unknown future server statuses/enums fall
  back to their English `words()`; (6) the LT strings were written for review by a Lithuanian speaker -- not yet proofread.
- **Checked after the integration (focused; no full suite, no Playwright matrix/e2e, zero live model calls):** `tsc --noEmit`;
  eslint on every changed `.ts/.tsx`; `git diff --cached --check`; `python3 -m pipeline.invariants` / `pipeline.selftest`
  ALL PASSED; ONE `npm run build` (incl. `/api/scan/translate`, `/scan`); vitest on the 34 scan / history / auth / google /
  disclosure / label / plain-language / ledger / camera / localization / translate files = **461 passed**, including the
  UI merge's `tests/scan-landing-lang.test.tsx` and the new "exactly one language switch" test. 390 px EN + LT of the
  merged landing and the History tab, measured on `next start`: scrollWidth 390, one visible switch (`sc-lang` on Scan,
  `sw-lang` on History). The earlier 14-capture result/History/replay overflow run predates the PR3 merge and was NOT
  repeated (result/History/replay code did not change). Real phone and real Google sign-in: not tested. Known edge: a
  browser whose `localStorage.setItem` throws but `getItem` works (old private Safari) will not switch language; blocked
  reads fall back to an in-memory choice.


**2026-10-03 — (UI worker, now merged into the localization branch) Ignas PR3 UI merged onto the released Google-required scan: BRANCH `fix/scan-ignas-en-lt-20261003`
(base `2555166`), NOT pushed, NOT deployed.** `origin/ignas-pr3` (`53dc036` label clipping, `1f86403` /scan landing)
was merged with `git merge --no-ff` so Ignas's commits keep their authorship; the one conflict was
`components/scan-flow.tsx`, resolved against the released auth/private-History code. What is in: own top bar (scan
mark, EN/LT switch persisted in `localStorage` key `bsproof.lang`, English default, account initial only when
signed in; not drawn for a saved scan opened from History), headline above a framed camera, optional torch (only
where the track reports it), camera asks for 3840x2160 and captures at 2560 px, uploads over 3.5 MB are re-encoded
to a 2560 px JPEG before POST (Vercel refuses bodies over 4.5 MB), and one control row (Upload / shutter / Search).
**Preserved from the release, re-verified:** the Google gate (no request and no anonymous request until a session
exists; hint and "session ended / signed out" notices still shown under the control row), the live bearer token with
the one-shot 401 refresh, sign-out/expiry/account-switch aborting the request and discarding the photo and result,
the sign-out line on a result, the A/B result card, and private Scan/History replay. **Deliberate deviations from the
PR, with reasons:** (1) the PR's timer-driven loading steps and determinate bar are gone -- `/api/scan` answers once
and streams no progress, so ticking steps "done" on a 2.2 s timer claimed backend work had finished that nobody
knew had; the loading view is now an indeterminate bar over a STATIC "this check covers" list (EN/LT), and
real per-step progress still needs a streamed `/api/scan`; (2) the PR's `clipToLabelSchema` is narrowed in
`lib/analyze/vision.ts`: it still shortens over-long printed text and the supporting lists (evidence spans,
certifications, warnings, claims) to the schema's own limits, but it cuts strings back to a whole word and never
leaves a bare trailing number (no invented dose), never touches `ingredient_vocab_id`/`form_vocab_id`, and NEVER
shortens `actives`/`other_actives` -- silently dropping a 31st/41st dosed active would hide multi-active evidence
from the compatibility check, so those still fail closed, as do wrong types, enums, required fields and
negative numbers (`servings_per_day` is never assumed). No schema, prompt, version, scoring constant or
`pipeline/` change. **Language scope, honestly: translation is the LANDING (headline, control row, camera
hints, staged step, loading, sign-in hint) ONLY.** The result report, History, sign-in cards and session notices stay
English until the separate expanded-results/History translation (worktree `/tmp/bsproof-localization`, not touched
here) ships; do not describe the product as translated before that release. Tests:
`tests/scan-landing-lang.test.tsx` (new), `tests/scan.test.ts`, `tests/camera-capture.test.ts`,
`tests/scan-search.test.tsx`. Gates run: tsc, changed-file eslint, `git diff --check`, 14 focused vitest files plus
the new one, one production build, `pipeline.invariants` and `pipeline.selftest`, and a 390 px Chromium smoke
(EN/LT camera, staged, loading, signed-out gate, signed-in bearer) against that build with a fake camera and a mocked
`/api/scan` -- NO model call and no real Google sign-in. Not run: full vitest, lint of the whole tree, Playwright
e2e matrix (`tests/e2e/scan-workspace.spec.ts` pins "Search your supplement" and the Scan button by role name,
both unchanged, but was not run on this layout). **Handoff:** push only after the founder/owner pass; then verify on
a real phone that the 4K camera request, torch and the large-photo re-encode behave, and that a real
signed-in scan still sends the token.
**Latest team checkpoint — 2026-10-03 11:48:57 EEST (Europe/Vilnius), docs-only, verified against fetched `origin/main` at `3ef1218`.** The working branch publishes readable WIP receipts; it does not merge feature code. **Production (last deployed app code):** Google-required scan + private Scan/History from `2555166` is deployed and provisioned, but production scans/auth remain blocked: the Google sign-in attempt returned an origin refusal (`origin_mismatch`/origin-not-allowed). The public OAuth client was changed to `42984642369`, the accepted Supabase audience was updated while preserving the prior primary/secret, and the resulting production redeploy is READY; this has NOT resolved sign-in. Human owner action: add `https://bs-proof-dashboard.vercel.app` to the NEW client's Authorized JavaScript origins, then verify button, real Google consent/session, phone scan and History/replay. Do not expose client secrets or credential values here.

**Separate WIP branches (published, not on main; no production claim):** [UI](https://github.com/IceFrosst/BS-PROOF/tree/fix/scan-ignas-en-lt-20261003) at `c898d03b9571533270d6bb95bf19dc7c21009fb3` is explicitly NEEDS WORK: malformed/non-array active inputs may be silently hidden by vision normalization; History/signout reachability evidence is outstanding. [EN–LT/localization safeguards](https://github.com/IceFrosst/BS-PROOF/tree/fix/scan-localization-20261003) at `e3a748bc04ff35c5c9194356e563150e08088097` is partial and review-pending, not a pass: verify visible unverified-AI-translation disclosure (C1), sign/unit-preserving guard gaps (C2), and all remaining source-review findings. Private research queue [branch](https://github.com/IceFrosst/BS-PROOF/tree/feat/scan-research-queue-20261003) `00b17d9e7034ff7087e5bc23f642d1290b63e5eb` and separate PC consumer [branch](https://github.com/IceFrosst/BS-PROOF/tree/feat/pc-research-worker-20261003) `a74160e54839e6e179f176969805021c48a7e8e5` are implementation checkpoints only; end-to-end contract/client/UI integration and security/owner review remain incomplete. No SQL was applied for research, token generated, mainPC worker installed, or feature activated; flag remains OFF and research is not part of user scans.

**Provider/session blocker:** Claude usage was exhausted; the observed reset time is 12:40 Europe/Vilnius, so Luna is continuing the handoff until then. This explains the WIP checkpoints; it does not waive review or user verification. Research comparison benchmark ran 10 runs and corrected reporting was reviewed; actual UI captures exist, but no experimentally validated model winner is established. Final presentation/disclosure work remains a mainPC handoff. Development is on one laptop; mainPC is only the planned research runtime. Preserve this separation and historical code evidence.

**Handoff:** first unblock Google sign-in via the owner-only Authorized JavaScript origin edit and verify a real session/scan/history replay. Then resume each isolated branch at its recorded review gate; do not merge WIP or alter cloud config from this checkpoint. Other product work still open: real-phone auth/history replay, full Lithuanian quality, live scan→job→research→A/B integration, demo Remotion and Claude Design deck (user-owned), and retention/deletion decision. See `## Next` below.

**2026-10-03 — Google-required scan + private Scan/History: IMPLEMENTED, on `main` (`2555166`), PROVISIONED (SQL applied,
Vercel production env set), DEPLOYED -- but Google sign-in is BROKEN in production: `400 origin_mismatch` (see "Release stage").** Founder: real results depend on a Google login, and a signed-in person can
reopen their own saved results. Two isolated worktree commits were cherry-picked `--no-commit` onto
`main` `6a1734d` (component base `4a87e22`; no conflicts; committed together with the later fix passes in the release commit):
backend `8da4137dd994bd1ef4274f6b82037701f3ef06d5` (server auth, owner binding, history API, SQL) and
UI `61ca4bf92895608409970ed5dbbd5f99fff7ffc8` (Scan | History tabs, sign-in gate); plus the
integration seam `tests/scan-auth-history-integration.test.tsx` and one selector fix in
`tests/e2e/scan-workspace.spec.ts`. Design: `docs/SYSTEM_DESIGN.md` §6–§7.

- **Release stage (2026-10-03, auth-release; durable logs `/tmp/bsproof-release/logs/`).** Landed on `main` as ONE
  commit on top of `6a1734d` (the commit carrying this text; find it with `git log -1 -- docs/scan-history.sql`).
  Before it: a fresh native review PASS; the full gate set re-run on the exact tree (`pre-owner/`: `git diff --check`,
  `typecheck`, `lint` 0 errors / 6 pre-existing warnings, `test:unit` 53 files / 704 passed, ordinary `npm run build`,
  `test:e2e` 838 passed / 10 skipped / 0 failed, `pipeline.invariants`, `pipeline.selftest` ALL PASSED,
  `npm audit --omit=dev --audit-level=high` 0 vulnerabilities; the PGlite SQL harness regenerated against the final
  file, 36/36); and a Claude Code OWNER verification of that tree: `claude-sonnet-5-5`, `--effort xhigh`, `--safe-mode
  --strict-mcp-config --tools Read,Grep,Glob`, run in a credential-free snapshot (no `.env*` but `.env.example`, no
  `.claude`), 76 turns, **VERDICT PASS, CRITICAL none** (private log `logs/owner/owner-verify-sonnet.{json,result.txt}`;
  the FIRST owner pass was NEEDS WORK and the owner-fix pass below answered it). Native-review W3 (the SQL guard counts a
  `storage.objects` policy as scoped if EITHER `qual` or `with_check` names `bucket_id`) was left as a documented limit:
  the PREFLIGHT requires a human read of the policies, and that read was done at release (below).
  **Provisioned on the SHARED Supabase project `icefrosst-apps` (ref `qcsyihymmaktkbqfxlkl`) BEFORE any Vercel
  variable, through the Management API (token never logged):** a fresh preflight (no relation named `*scan*` in any
  schema, only bucket `republic-selfies` and it is private, exactly two `storage.objects` policies and both name
  `republic-selfies` -- one INSERT for anon/authenticated, one authenticated SELECT also gated on `republic.is_ministry()`)
  -> applied `docs/scan-history.sql` (sha256 prefix `9a036eaa8f031938`) -> verified read-only: `public.scan_runs` and
  `public.scan_users` exist with RLS on and ZERO policies; `anon` and `authenticated` hold NO privilege on either (the
  project's default privileges would have granted them; `service_role` keeps all four); private bucket `scan-images`
  (`public=false`) with still no policy for it; every other app's tables, all policies, extensions and default
  privileges identical to the baseline (diffed); a second apply is a no-op with identical verification output; 0 rows.
  Then **Vercel PRODUCTION only** on the canonical project `bs-proof-dashboard` (`prj_LVkNjXw2Sw96J18MUbGOx5AUkCMx`,
  team `team_kIvQLqbrh2Qk9d9gYQcCDA98`; Preview untouched, no other project): `SCAN_REQUIRE_AUTH=1`,
  `SCAN_HISTORY_REQUIRED=1`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (sensitive), `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Checked without printing any value:
  `SUPABASE_URL` equals `NEXT_PUBLIC_SUPABASE_URL`; the service key returns HTTP 200 and the anon key 401 on
  `/rest/v1/scan_runs`; the anon key is that project's legacy anon key; the client id equals the existing Google
  provider's client id (sha256-12 `f98873ac6ff8`). The Google provider, site URL, redirect allow-list and sign-up
  settings were only READ, never changed; `disable_signup` is `false`, so open Google sign-up IS on in the shared
  project (accepted by the operator; there is no allow-list or quota). Retention is indefinite with no notice or deletion
  path (open owner decisions, `docs/SYSTEM_DESIGN.md` §7e).
  **Pushed and deployed (checked at release):** `main` = remote = `2555166422e0636efbf0c3428e0db04329103cfe` (`ls-remote`);
  the canonical deployment `dpl_CAex4bCP4rw3ivQPhw9yWt3i78td` (project `prj_LVkNjXw2Sw96J18MUbGOx5AUkCMx`, target
  production, READY, `githubCommitSha` = that SHA) is aliased to `https://bs-proof-dashboard.vercel.app`. Production
  (log `/tmp/bsproof-release/logs/prod-checks.txt`): `/scan/`, `/tester/`, `/tests/supplements/` and retained run pages 200;
  unauthenticated `POST /api/scan/` and `POST /api/analyze-label/` -> 401 `unauthorized` `no-store` (bodies empty, so no
  model call), also with a bogus bearer (never anonymous); unauthenticated `GET /api/scan/history/` and
  `/api/scan/history/<uuid>/` -> 401 `no-store`; public capability `GET`s 200. (Routes use trailing slashes: without one
  Vercel answers a 308.)
  **REAL Google sign-in was ATTEMPTED and FAILS (2026-10-03, Pi browser profile, user-designated agent account, no
  secret typed): clicking the Google button on `https://bs-proof-dashboard.vercel.app/scan/` (History tab) opens
  `accounts.google.com/signin/oauth/error` -> "Access blocked: authorization error ... Error 400: origin_mismatch" (screenshot kept
  privately outside the repo; not published). The button renders, the origin is simply not an Authorized JavaScript
  origin of the Google OAuth client (the one the shared Supabase provider uses, client id sha256-12 `f98873ac6ff8`). Fix is a
  Google Cloud Console edit of that SHARED client by its owner: add `https://bs-proof-dashboard.vercel.app` (and any other
  production alias people will use) to Authorized JavaScript origins. NOT done by the release stage on purpose (shared client
  setting / permission expansion; no replacement of the provider). Until then NO ONE can sign in from that origin, so with
  `SCAN_REQUIRE_AUTH=1` every scan/`/tester` analysis is refused (fail closed; the retained pages and the public GETs are fine).
  The only mitigation identified without the shared client owner's edit is removing `SCAN_REQUIRE_AUTH` from Vercel production, which re-opens anonymous model use --
  an owner decision, deliberately not taken.**
  **Docs-only follow-up (2026-10-03):** the `origin_mismatch` finding in this and the sections below, and in
  `docs/SYSTEM_DESIGN.md` §7d, was recorded in a LATER commit that changes only `CLAUDE.md` and `docs/SYSTEM_DESIGN.md`:
  no app code, scientific constant, SQL, Vercel env, shared OAuth/Supabase provider setting or provider/deployment setting was
  touched, so the deployed APP is unchanged (`2555166` is the last code commit; if the Git integration redeploys production from the
  docs commit, it builds identical app code on the same canonical project -- check the production SHA instead of assuming).
  Doc gates for it, all passed on the final diff: `git diff --check`, `python3 -m pipeline.invariants`,
  `python3 -m pipeline.selftest`. The runtime TypeScript gates are N/A for a docs-only change and were NOT re-run; the
  704 unit / 838 browser (10 mode-gated skipped) / 18 configured-build focused (4 skipped) / 0 production-audit-vulnerability
  figures recorded for `2555166` come from its actual logs (`/tmp/bsproof-release/logs/final/`, `/tmp/bsproof-owner-fix/logs/`),
  not from this pass.
  No patient, phone-session or Google-session proof exists or is claimed: nothing was typed into Google, and the only
  real sign-in outcome observed is the failure above.
  **Still NOT done / not verified:** a real Google credential -> Supabase session (blocked by the above); one phone
  sign-in -> scan -> History -> replay; the live PostgREST list query; authenticated live owner queries.
- **Server is the protection** (`lib/auth/server-auth.ts`). With `SCAN_REQUIRE_AUTH` on (fail-closed:
  anything but unset/0/false/no/off), `POST /api/scan` **and the legacy `POST /api/analyze-label` (what
  `/tester` calls; see the owner-fix entry below)** demand a Supabase-VERIFIED Google bearer token
  (401 `unauthorized` / 503 `auth_unavailable`) **before the body is read and before any model call**.
  Identity comes only from Supabase `GET /auth/v1/user`; never a decoded JWT, never a client
  user id/email, Google is read from `identities`/`app_metadata` and never `user_metadata`; an invalid
  bearer is a 401, never silently anonymous. The verified owner is written **in the same INSERT** as
  the run (photo, manual, terminal failure) and is never reassigned.
- **`/api/scan/claim` no longer transfers anything**: it only acknowledges a run already owned by the
  caller (`claimed` = "already yours"); unowned/legacy/cross-owner/missing are one 404. The UI no
  longer calls it. `GET /api/scan/history` (newest 20, metadata) and `GET /api/scan/history/[id]`
  (saved analysis verbatim, strict UUID) always require a Google bearer, filter on `user_id` in the
  query AND per row (the service role bypasses RLS, so that filter IS the access control), return the
  same 404 for not-yours/legacy/missing, and never return photos, paths, hashes, request or email.
- **Browser** (`components/scan-workspace.tsx`, `history-tab.tsx`, `scan-flow.tsx`): where all three
  `NEXT_PUBLIC_*` sign-in vars are set, a signed-out person can stage a photo but no request is sent
  (the Google card replaces the scan button); photo and typed scans carry `Authorization: Bearer`;
  sign-out / expiry / account switch aborts the request, discards a late reply and REMOVES the held
  result. History replays the saved analysis through the same four-axis result renderer with its saved
  date — no new `POST /api/scan`, no model call, no new row. Unconfigured builds behave as before.
  The old "Save your result" card, the blurred result lock and the late `/api/scan/claim` call are gone.
- **Gates** (logs `/tmp/bsproof-integration-gates/`): `typecheck` pass; `lint` 0 errors / 6 pre-existing
  warnings; `test:unit` 49 files / 648 passed; `npm run build` pass; `test:e2e` 836 passed / 6 skipped
  on the ordinary build (the 6 are the 3 Google-required tests × 2 projects, which need a
  sign-in-configured build); a focused second build with clearly fake public env
  (`https://e2e.supabase.invalid`, `e2e-anon`, `e2e.apps.googleusercontent.com`) + `E2E_AUTH_CONFIGURED=1`
  ran `scan-workspace.spec.ts` 14 passed / 2 skipped (the 2 are the not-configured-only tests); mobile
  Scan/History mock screenshots (Pixel 7 + iPhone 13, 12 views) have 0 px horizontal overflow;
  `pipeline.invariants` / `pipeline.selftest` pass; `git diff --check` clean. **`npm audit --omit=dev
  --audit-level=high` FAILED at that point (exit 1: next 16.3.0 critical, fast-uri/sharp high,
  ajv/sanitize-html moderate) and was PRE-EXISTING/environmental** (`package.json` / lockfile were
  byte-identical to `HEAD`). [SUPERSEDED the same day by the dependency pass below: it now exits 0.]
- **Dependency/security + review fix pass 1 (2026-10-03, landed in the release commit; gate logs
  `/tmp/bsproof-security-pass1/logs/`).** Direct pins, exact like every other entry, no major/minor
  churn: `next` 16.3.0 -> **16.3.8** (16.3.6 is the first fix for the `next/og` RCE and 16.3.3 for the other two
  criticals; 16.3.8 is the newest 16.3.x and per its release notes also carries the 2026-09-30 SSRF-in-image-optimization
  and cache advisories that `npm audit` does not index yet; 16.3.7 is a bug-fix backport only), `sanitize-html` 2.17.6 ->
  **2.17.7** (first patched; the suggested 2.18.0 is a needless minor), `ajv` 8.17.1 -> **8.18.0** (first patched; the suggested
  8.20.0 is not needed). Lockfile-only transitive moves: `sharp` 0.35.3 -> 0.35.5 (+ libvips 1.3.2 -> 1.3.4; fix is 0.35.4),
  `fast-uri` 3.1.5 -> 3.1.8 (via `npm update fast-uri`, in range), `@swc/helpers` 0.5.15 -> 0.5.23 (next's own pin).
  Nothing was force-updated; `npm audit fix --force` was never run. Relevance, honestly: this app configures no
  `images`/`remotePatterns`, never imports `next/og`, uses no `use cache`, and `sanitize-html` is called with no SVG tags
  allowed and `ajv` without `$data`, so these were mostly not reachable here -- they were patched because a clean
  production audit is the gate and the patches are same-line. **Result: `npm audit --omit=dev --audit-level=high`
  exit 0, "found 0 vulnerabilities".** The full `npm audit` (dev tools included) still exits 1 with 10 DEV-ONLY
  findings (js-yaml, undici via jsdom, brace-expansion, and the `eslint-config-next` -> `@next/eslint-plugin-next` ->
  fast-glob -> micromatch -> braces chain; vitest/@vitest/mocker moderate). None is in the production tree
  (`npm ls --omit=dev` is empty for them); the `eslint-config-next` "fix" npm offers is a DOWNGRADE to 14.2.35 and
  16.3.8's plugin still pins `fast-glob`, so it was NOT applied. Left as is; do not describe the full audit as clean.
  **Review fixcard item 3 (P2) done:** `getScanRun` (`lib/scan-history/reader.ts`) now rebuilds a replayed analysis from an
  explicit top-level allow-list, `lib/scan-history/analysis-keys.ts`, instead of spreading the stored payload and deleting
  three keys. `persistence` (private photo bucket/path/sha), `run_id` and `app_version` are never copied from the stored JSON
  (the last two are restated from the row); a field added to the stored payload later is NOT returned until listed. The file
  has only an erased `import type { ScanAnalysis }` and a compile-time coverage check, so `npm run typecheck` and `next build`
  fail if `ScanAnalysis` gains a key that is neither listed nor one of those three, or the list names a key that no longer exists
  (both directions proved to bite by temporarily editing the list). `tests/scan-history-reader.test.ts` +2 tests (planted
  `image_url`/`debug_trace`/`user_email`/`request`/`persistence` never leave; every listed key passes through verbatim; the file's
  import surface is pinned) -- the first was shown to FAIL against the old deny-list. No route, response shape, UI, prompt, schema,
  scorer, constant, threshold, transfer factor or OA penalty changed. **Gates on this tree** (ordinary build with the three
  `NEXT_PUBLIC_*` vars unset): `typecheck` pass; `lint` 0 errors / the same 6 pre-existing warnings; `test:unit` 49 files /
  **650** passed; `npm run build` pass (Next 16.3.8, BUILD_ID `QXEkDv191Exjc9bGUMsk-`, no inlined Supabase URL/key found in
  `.next`); `test:e2e` **836 passed / 6 skipped** (the 6 = 3 Google-required tests x 2 projects, which need a configured
  build); configured build with fake public env + `E2E_AUTH_CONFIGURED=1`, `scan-workspace.spec.ts` **14 passed / 2 skipped** (the 2
  are the not-configured-only tests; all three Google-required tests passed on both projects, all against a mocked Supabase/Google,
  never a real credential); `pipeline.invariants` / `pipeline.selftest` pass; `git diff --check` clean; `npm ci --dry-run` pass.
  The ordinary `.next` was moved out of the repo during the fake-env build and put back; its build-output fingerprint is unchanged
  (`94f0a198...`, BUILD_ID unchanged). The only difference from a naive whole-directory hash is `.next/server/route-cache/`
  (1014 files `next start` writes at request time during the ordinary e2e run, i.e. AFTER the pre-e2e fingerprint was taken).
  **Still NOT verified:** real Google credential -> real Supabase session, a real Supabase table/bucket, the PostgREST JSON-path `select`,
  a real phone camera, and the production env (`SCAN_REQUIRE_AUTH=1`, `SCAN_HISTORY_REQUIRED=1`, Supabase vars -- review P2: with the
  flag unset the server does not enforce Google at scan time). [At the time of pass 1 nothing was committed, pushed or
  deployed; the release stage above supersedes that.]
- **Owner-fix pass (2026-10-03, landed in the release commit; Claude Code owner verdict on the
  prior diff was NEEDS WORK, log `/tmp/bsproof-owner-release/logs/owner-verify-sonnet.result.txt`; gate
  logs `/tmp/bsproof-owner-fix/logs/`).** The one CRITICAL: `POST /api/analyze-label` ran the same
  DeepSeek label read and returned evidence rows with NO auth, and `/tester` sent no bearer, so
  `SCAN_REQUIRE_AUTH=1` protected `/api/scan` only and the docs' "strangers cannot spend the model
  budget" was false. Fixed, not documented away (the operator requires Google for scans):
  - **Server:** `app/api/analyze-label/route.ts` takes the same `authenticateRequest(request,
    { tokenRequired: scanAuthRequired(), requireGoogle: scanAuthRequired() })` gate as `/api/scan`,
    after the existing kill-switch/no-key 503 and BEFORE `formData()` and any model, census or queue
    call (401/503 bodies `{status,error}` only, `no-store`; flag off keeps anonymous local/CI use,
    and a bearer that IS sent is verified, a bad one is 401). Its `GET` (capabilities, no model) and
    the static retained runs stay public. `tests/analyze-label-auth-route.test.ts` (17): no token /
    malformed / invalid / forged / non-Google / spoofed `user_metadata` / no or half config / Auth
    outage -> 401 or 503 with `bodyUsed === false`, zero model calls, zero storage/history I/O, no
    key/provider/owner leak; a verified Google user is served; fail-closed flag spelling; flag-off
    compatibility; kill switch and public GET. 10 of the 17 FAIL with the gate removed.
  - **Browser:** `components/label-analyzer.tsx` (`/tester`) reuses `useSupabaseSession`, the Google
    `SignInCard` and `getAccessToken({ userId })`: staged photo allowed, but no request and no anonymous
    request until a session exists; "checking" while a returning session is read; live bearer at send
    time; 401 -> refresh once -> retry once -> else sign out on screen; sign-out / expiry / account
    switch aborts the request, discards a late reply and removes the result and the photo being
    analyzed. Unconfigured builds are unchanged. `tests/label-analyzer-auth.test.tsx` (19).
    `app/tester/page.tsx` imports `scan-workspace.css` (card states) and `.la-gate` in `globals.css`
    hands the card its tokens; `tests/scan-client-boundary.test.ts` now also covers this entry.
  - **Honest scope:** this is IDENTITY, NOT A BUDGET. Any Google account can still spend model
    calls; there is deliberately no per-user quota, rate limit or allow-list (operator wants open
    Google login), and the shared project's Google sign-up settings were neither read nor changed.
    `.env.example`, `docs/SYSTEM_DESIGN.md` §7a/§8 say so.
  - **Blank "Result" card fixed:** `scan_history_required_failed`, `scan_history_required_unavailable`
    and `payload_too_large` now render an error alert with a fixed plain sentence (what happened, not
    the user's fault, try again; never the server's env-var detail) on the photo and typed paths
    (`SERVER_REFUSALS` in `components/scan-flow.tsx`; `tests/scan-flow-refusals.test.tsx`, 8).
  - **`docs/scan-history.sql` on a shared project:** removed the unused `create extension pgcrypto`;
    added a PREFLIGHT (inspect `scan_*` tables, the `scan-images` bucket, every `storage.objects`
    policy) and a read-only guard block that aborts before creating anything if a same-named table
    lacks a BS-PROOF comment (never adopt another app's `scan_*`), the bucket exists public or
    without our tables, or a `storage.objects` policy for anon/authenticated/public names no
    `bucket_id` (it never creates/alters/drops a storage policy, so other apps' policies are never
    clobbered); added `revoke all ... from anon, authenticated` on both tables (additive, private,
    still no policies). Stale text fixed: no UI calls `/api/scan/claim`, so `scan_users` is
    UNPOPULATED and emails live in `scan_runs.user_email` (comments in the SQL, `claim/route.ts`,
    `lib/auth/claim.ts`; the SQL now carries a "who has scanned" query on `scan_runs`).
    Verified by executing the real file in an in-memory Postgres (PGlite, a throwaway harness
    outside the repo: `/tmp/bsproof-owner-fix/logs/sqlcheck.mjs`, 36/36 checks, log
    `sql-pglite-check.log`) with stand-ins for the Supabase roles/`storage` schema -- clean apply,
    idempotent re-run, upgrade of the earlier revision's tables, anon/authenticated privileges gone and
    service_role's kept, other apps' policies untouched, and each guard refusal (foreign table,
    public bucket, unowned bucket, unscoped policy) leaving everything unchanged. Plus
    `tests/scan-history-sql.test.ts` (8 static guards in CI). **At the time of this pass it had never run against the real
    project** (the release stage above is what applied it).
  - **Retention (stated plainly, nothing promised):** with `SCAN_HISTORY_REQUIRED=1` every scan
    (result, Google email, photo) is kept INDEFINITELY; there is no expiry job, deletion endpoint,
    "delete my data" control or in-app notice. Deciding the notice and building deletion are open
    owner decisions (`docs/SYSTEM_DESIGN.md` §7e).
  - **Runbook (`docs/SYSTEM_DESIGN.md` §7d, `.env.example`):** SQL (after the preflight) BEFORE the
    Vercel variables; `SUPABASE_URL` must EXACTLY equal `NEXT_PUBLIC_SUPABASE_URL` and the service key
    be that project's (a wrong pair is a 401 that looks like an expired session -- check these first;
    two shell checks that print no secret are given); `SCAN_HISTORY_REQUIRED` only counts as exactly `1`.
  - **Test-guard fix:** `tests/scan-client-boundary.test.ts`'s `node:fs|path` regex had doubled
    backslashes (`\\s`), matched nothing and could never fire; replaced by a specifier-based check
    (static, `export ... from`, side-effect, dynamic `import()`, `require`, type-only skipped) with a
    self-test that feeds it real offenders and clean look-alikes.
  - **Gates on this tree** (logs `/tmp/bsproof-owner-fix/logs/`; ordinary build with the three
    `NEXT_PUBLIC_*` vars unset -- this shell exports two of them, so every build/test/e2e command used
    `env -u`): `typecheck` pass; `lint` 0 errors / the same 6 pre-existing warnings; `test:unit` 53 files /
    **704** passed (+54 over pass 1); `npm run build` pass (ordinary, no inlined fake or real Supabase value in
    `.next/static` or `.next/server`); `test:e2e` **838 passed / 10 skipped / 0 failed** (the 10 = the
    configured-only tests: 3 Google-required `/scan` + 2 `/tester`, x 2 projects); configured build with fake public env
    (`https://e2e.supabase.invalid`, `e2e-anon`, `e2e.apps.googleusercontent.com`) + `E2E_AUTH_CONFIGURED=1`:
    `scan-workspace.spec.ts` + new `tester-auth.spec.ts` **18 passed / 4 skipped** (the 4 = not-configured-only tests),
    all against mocked Google/Supabase/`/api/analyze-label`, never a real credential or model; `pipeline.invariants` /
    `pipeline.selftest` pass; `git diff --check` clean; `npm audit --omit=dev --audit-level=high` exit 0, "found 0
    vulnerabilities". The ordinary `.next` was moved out during the fake-env build and restored; its fingerprint
    (all files except `cache/`, `dev/`, `server/route-cache/`, `diagnostics/`, `trace*`) is `9f53760f83e66ddd`,
    BUILD_ID `HajkfBvOw7D0ZKtL6cjeX`, identical before and after. The full `npm audit` still has the same 10 dev-only
    findings (unchanged, see pass 1). **Skipped/absent, honestly:** nothing run against a real Supabase, Google, DeepSeek
    or Vercel; the SQL was executed only on in-memory Postgres; no phone/camera test; the mutation checks (gate removed
    -> 10/17 route tests fail; `SERVER_REFUSALS` disabled -> 8/8 fail; label-analyzer gate/abort removed -> 6-7/19 fail;
    pgcrypto re-added / revoke removed -> SQL guard tests fail) were run once by hand and reverted.
  - **No** constant, threshold, transfer factor, OA penalty, prompt, schema, scorer, model boundary
    (`lib/analyze/llm.ts`), DeepSeek, retained-audit authorization, serving/day default or
    elemental/compound handling was touched (`git diff HEAD` over `pipeline/ lib/analyze/ prompts/ schemas/
    vocab/ sources/ .claude/` is empty).
- **Pitfall found on this machine:** the shell exports `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `next build` inlines them. Build the ORDINARY artifact with the
  `NEXT_PUBLIC_*` sign-in vars unset (`env -u ...`), or it silently becomes a configured build.
- **Not verified:** a real Google credential → real Supabase session (a real attempt failed with `400 origin_mismatch`);
  the PostgREST JSON-path `select` in the history list against the live project (the structure it reads now exists, with 0
  rows); a real phone camera. The Google client's Authorized JavaScript origins do NOT include the production origin. (Superseded at release: the
  preflight snapshot WAS re-taken on 2026-10-03 and is clean; the real tables/bucket/grants now exist and were checked
  read-only; open Google sign-up is ON, `disable_signup=false`, read not changed -- all in "Release stage" above.) A parent probe that the canonical origin renders the Google button
  is NOT token-exchange proof: Google's origin refusal appears only after the click, and it did (`origin_mismatch`). `outputFileTracingIncludes` was left unchanged (the new routes read no
  files); note the History routes inherit the same ~32 MB `/api/scan/*` trace overlap the existing
  `/api/scan/claim` route already has.

**2026-10-03 — research comparison preview shared.**
`docs/design/research-benchmark-preview/overview.png` shows the actual saved
Sonnet 5.5 xhigh and Opus 5.5 high categorical outputs for all five benchmark
cases; `magnesium.png` includes the first detailed side-by-side result.
These are preliminary static previews, not live scan results, validated clinical
scores or an end-to-end scan benchmark. Model timings exclude retrieval.
Full per-case visual/source-context review remains in progress. **Caveat
(2026-10-03):** those earlier categorical benchmark outputs were not produced
through the exact four-axis UI format, so they are NOT a valid exact-UI
comparison, and a redo of the original audit has been requested — do not quote
them as one. **Handoff:** Google-required scan results and private Scan/History
are IMPLEMENTED, committed to `main` (release commit, `git log -1 -- docs/scan-history.sql`), and provisioned: the
SQL is applied on the shared project and the production env is set on the canonical Vercel project (entry
"Release stage", above). What remains is human/real-service verification: one phone Google sign-in -> scan ->
History -> replay, a signed-in `/tester` attempt and the live list query are BLOCKED until the production origin is added to
the Google OAuth client (real attempt: `400 origin_mismatch`, "Release stage" above); the signed-out `/tester` attempt (Google
card, nothing sent) needs no sign-in and can still be checked.
**Handoff (2026-10-03, owner-fix):** the legacy `/api/analyze-label` + `/tester` gate, the blank-result fix, the shared-project SQL
hardening and the runbook/retention docs ("Owner-fix pass", above) are in the same release commit; snapshot
`/tmp/bsproof-auth-owner-needswork.patch` is the PRIOR (pre-fix) diff, retained only for audit.
Multi-ingredient implementation remains paused; its fifth benchmark case is
frozen test data. **Handoff (2026-10-03):** the dependency/security fix and the
reader allow-list ("Dependency/security + review fix pass 1", above) are
in the same release commit as the auth/history diff; the later benchmark phase (it must also reuse the reviewed
`parallel-render` capture manifest once it exists, grade only case 5 row 0, never average a formula score, and quote
the 311 / 116 non-access / 21 refusal / 174 upper-bound access caveat -- see `Next`; no model reruns or duplicate capture) must reuse the immutable
`parallel-v2` captures/method review rather than re-running successful cases
(see `Next`).


**2026-10-02 — multi-ingredient visual options.**
`docs/design/multi-ingredient-options.jpg` is an illustrative, generated design
comparison: ingredient tabs, an expandable ingredient list, and outcome-first
navigation. It is not implemented UI or clinical evidence. Placeholder states
are not scores; implementation must use neutral/hatched unknown tracks and
keep formula-level evidence separate from ingredient findings.

**2026-10-02 — Vercel project consolidation (owner-authorized).** Keep only
`bs-proof-dashboard` (`prj_LVkNjXw2Sw96J18MUbGOx5AUkCMx`) in the IceFrost team.
The independently reviewed obsolete projects were deleted only after their ID,
name and team were verified immediately beforehand: `bs-proof-preview`
(`prj_FVlObLwXHx4Sgw6M5k0vjwmsqjjz`) and `bs-proof-four-lines`
(`prj_5pMDVAdYGan28RGmG3iVvfmPQFZC`). Both old URLs now return 404. Canonical
`/scan/` and `/tests/supplements/` both return 200. The local
`.vercel/project.json` was explicitly checked and links the canonical
`bs-proof-dashboard` / `prj_LVkNjXw2Sw96J18MUbGOx5AUkCMx`. In the 2026-10-02
check before this docs commit, production's verified Git SHA was
`d9cedc44fdbfe3cd58d2cf3dcaf860b88451bd24`; that is a point-in-time record,
not a claim about current `main`. Deployment age alone was misleading, not
evidence of a stale release. `bs-proof.vercel.app`
is still live under another account and cannot be removed with the current
IceFrost access. Unrelated projects and canonical deployment aliases were not
touched. **Handoff:** subscription-backed live research is not implemented yet;
source-constrained five-case Sonnet 5.5 xhigh versus Opus 5.5 high benchmarking
is in progress. DeepSeek remains the photo reader. Never assume servings/day;
read an explicit daily regimen from the photo or ask the user to confirm it.


- **2026-09-22 (later) — label reads switch DeepSeek's thinking mode OFF.** The `label-v1.3` re-scan still failed with `finish_reason: length after emitting reasoning_content`. Cause, per DeepSeek's own docs (guides/vision, guides/thinking_mode): `deepseek-v4-flash-vision-exp` is **retired** and served by the current `deepseek-flash`, which is a thinking model by default (effort `high`), and reasoning tokens count against `max_tokens` — so the 8192 budget from `acc0887` could be spent entirely on `reasoning_content`. Thinking mode also ignores `temperature`, so the "temperature 0" in `llm.ts` was not in effect for these reads. Fix: `ChatRequest.disableThinking` in `lib/analyze/llm.ts` sends the documented `{"thinking": {"type": "disabled"}}` **only to `api.deepseek.com`** (other OpenAI-compatible providers get an unchanged request), and it is dropped with `response_format` on the existing one-shot HTTP 400 retry. `readLabel` sets it: a label read is transcription. `DEFAULT_VISION_MODEL` is now `deepseek-flash` (same model, current id; Vercel's explicit `LABEL_MODEL` still names the legacy id, which DeepSeek still accepts). The empty-content error now states tokens used vs budget and whether thinking was disabled. **The three text calls (company, compatibility, literature warnings, evidence prior) are unchanged** and still run with the provider default — check whether `deepseek-chat` thinks and whether `literature_warnings` (max_tokens 1024) is degrading to `unavailable` before extending the switch. No prompt, schema, scoring or version constant changed. Tests: `tests/llm-thinking.test.ts` (fake fetch, zero model calls), `tests/vision-json.test.ts`. Handoff: re-scan the same busy label after deploy; if it still fails, the error now says whether thinking was off and how many tokens were used.

- **2026-09-22 — label reads no longer fail on an unstated schema cap (`label-v1.3`).** A real `/scan` of a busy panel returned `model output violates schemas/label.json: /evidence_spans must NOT have more than 12 items`: the prompt asked for spans "enough to justify each non-null field" and for every dosed active, but never said `schemas/label.json` caps `evidence_spans` at 12, so a faithful model broke the schema and the whole read was refused. `prompts/label.md` now states every list/length limit the schema enforces (spans 12 × <200 chars, actives 40, other_actives 30, certifications 12 × <80, warnings/claims 10 × <160), a priority order for spans (main active line, servings line, other actives in panel order), and that a cut list never changes `is_multi_ingredient`. **Prompt wording only**: `schemas/label.json`, the fail-closed validation (no truncation or coercion in code) and every field's meaning are unchanged. `LABEL_PROMPT_VERSION` bumped to `label-v1.3` in both `lib/analyze/vision.ts` and `label_adapter.py` (invariant 3, label cache domain; the shared `PROMPT_VERSION` is untouched). Same scan, earlier attempt: `finish_reason: length after emitting reasoning_content` at `maxTokens` 8192 — not addressed here. Handoff: re-scan the same busy label after deploy.

- **2026-09-22 (same day, later) — fidelity pass on that port, measured against the shipped lab card at 390, plus two defects the earlier captures hid.** Presentation only; no scoring, API, prompt, schema or pipeline change and no new number. Closed deltas: the result header stopped inheriting the old report's `.sc-scanned` band (56px column, 12px gutter and a rule the reference has no equivalent for) and is the card's own 44px `.ab-top`; the photo hero is the reference's **262px** at every width and its flat fill is gone, so the dotted paper panel shows around a still-`contain`, never-cropped photo; the card keeps 14px padding / 22px radius at 360 instead of shrinking; `.ab-listhead` closes at the "Outcomes" heading so its hairline divides heading from list instead of falling under the last row (`components/scan-flow.tsx`); the per-outcome headline is tinted from the SAME `scoreSignalColor` ramp at the same 13% as the General tile (the inline `--ab-score-color` was computed and never used, so every headline rendered identical); and a section summary is title + chevron on line 1 with the basis badges wrapping below, not a ragged stacked column. **Two real defects:** (1) the whole warnings bundle was **clipped off-screen** — every element from `.ab-warnings` down to the row `summary` is a grid/flex item and the one-line lede is `nowrap`, so automatic minimum sizing blew the card to **990px inside a 358px column** and `overflow:hidden` cut the disclosure bodies; `min-width: 0` along the chain restores every body, the 100px truncated lede ("This is abo…") is dropped from the collapsed row, and the row gained the chevron it never had; (2) `.scan-page .la-alert` was still re-applying the old gold left rule and one-sided radius to each warning row, which is now the reference's hairline box on paper. The typed/failed-preview fallback tub grows to contain its `FORM` footer and ellipsizes a long form name. Unchanged and still true: actual scanned photo hero with the jar fallback, no invented value, exact matches show the real rubric, unmatched keeps the same shell with `—`/Not assessed, no "Studied in you", validity before the first number, warnings/details/API/capture/error states all reachable, roving-tab keyboard order. Intentional deltas from the lab: the validity stamp opens the card; the outcome tile prints `/100` and the rows print a bare number where the lab prints `58%`, which would be a false unit. Heights 1678px@390 / 1693px@360 unmatched, 2871px / 3035px matched, **0px horizontal overflow**. `scripts/design_shots.mjs` gained an `-11-matched-*` pass mocking the exact body the route returns for a 4 g single-active creatine label, so the fully scored card is reviewable at all (every previous review shot was the unmatched shell). Shots `docs/design/ref/tabs-preview/2026-09-22-scan-actual-ab-*`, `public/previews/scan-tabs-{outcomes,outcome}-390.png`; doc `docs/design/2026-09-16-scan-design-system.md`; test `tests/scan-result-state.test.tsx` pins the list-head rule placement (478 tests). No live scan was exercised: no model API key exists in this environment.

- **2026-09-22 — `/scan` now uses the Evidence Ledger lab-card presentation for every successful scan (presentation only).** Exact retained matches remain the existing `LedgerOutcomeTabs` with real Effect, Evidence certainty, Form and Dose values, wording, warnings and sources. Unmatched scans use the same ledger shell and outcome names only as a measured-outcomes list: General, scores and all four dimensions are `— · Not assessed`, and expansions state that no source-verified /4 audit matches the exact form/daily dose and that the legacy continuous result was not converted into quarters. The continuous `evidence.rows` API and scoring mechanism remain documented internal backups; the legacy `OutcomeTabs` UI is removed and unreachable from `/scan`. Capture/error states, validity banner, facts, warnings, company, dose, sign-in and technical details remain unchanged. No scoring, API, prompt or pipeline change.

- **2026-09-21 — production label reads now request native JSON output and carry a typed output template (`label-v1.2`).** Two real `/scan` attempts reached `POST /api/scan` but the vision provider returned prose (`no JSON object in model output`); a synthetic retry also exposed a quoted/string boolean. `lib/analyze/vision.ts` now sets `jsonMode: true` (the shared transport still retries once without `response_format` only when a compatible endpoint rejects it with HTTP 400), and `prompts/label.md` shows every key with its exact JSON type. The label remains fail-closed against `schemas/label.json`: no truncated-JSON repair and no coercion of quoted booleans or numbers. `LABEL_PROMPT_VERSION` is `label-v1.2` in both the deployed reader and `label_adapter.py`. Handoff: verify one real phone photo after production deploy; if the provider still emits prose, capture the returned prefix/provider model before considering any retry policy.

- **2026-09-17 (preview branch `preview/restore-four-evidence-lines`, not on main) — founder decision shipped the retained Evidence Ledger on real `/scan` for exact products only.** `lib/evidence-ledger/` is the browser-safe canonical rubric/types used by both the lab compatibility entry point and scan. Server-only `lib/evidence-ledger/retained-audits.ts` sends only the matched audit plus its plain sidecar: creatine monohydrate 4000 mg printed compound/day, vitamin D3/cholecalciferol 0.05 mg (50 mcg / 2000 IU)/day, or magnesium glycinate 300 mg printed compound/day. Matching requires exact normalized printed mass, exact form, single ingredient, and a stated servings/day so the printed daily dose can be computed; no nearby dose/form fallback. Matched scans show retained-audit provenance before the first number, Effect on its real −3..+3 scale, certainty/form/dose on their native x/4 scales or `—`, exact wording and source inventory expansions, and no person-fit row. Person fit is dropped from the shared scorer and design-lab card as well; retained `studied_in` fields are source context only. Unmatched scans retain the continuous v14 `evidence.rows` API as a documented backup and show “No /4 audit for this exact form and daily dose yet”; coverage is never converted to /4. The retained audits remain heuristic/unvalidated, and arbitrary-product live audits require a source-retrieval service because the deployed model transport cannot open sources. Added production selector/score tests; no scoring constants or legacy scorer changes.

- **2026-09-16 (same preview branch, not on main) — the design-lab A/B card's DESIGN now ships on `/scan`, wired to the real scan API and the real retained run.** Founder: ship the lab card's look on the live scanner. `ab.css` remains the visual reference and is **not** imported into production; the prototype now uses the shared scorer without person fit (the route still works). Changed files: `components/scan-flow.tsx`, the `/scan` block of `app/globals.css` (scoped `.scan-page` / `.sc-*`), `tests/scan-result-state.test.tsx`, design docs and reference shots. **Adopted:** the calm paper card shell around the tab panel (`--sp-paper #fafbfa`, 18px radius, one hairline, still no cream and no shadow); the outcome tab strip and the Outcomes landing list with its compact General score tile; the per-outcome headline — the composite in its own rounded white tile beside the outcome name, on a tint mixed from the SAME `scoreSignalColor` ramp (no second ramp); and **each dimension as ONE tappable line** (label, the plain word production really computes, the signed value, a chevron) with the full-width coloured track under it, the coverage under that, **expanding in place** into a detail block. **Dropped or remapped, because production does not measure it:** (1) the lab's 5th bar **“Studied in you”** comes from its own unvalidated person-fit term — **dropped entirely**, no profile input and no invented population match; the run's recorded `evidence.population` is printed as a plain FACT line (once above the list, once in the outcome headline), never as a scored bar; (2) the lab's **ordinals (“2/4”, “Exact match”)** are its rubric's ladders — each row shows the run's real **signed verdict AND its real coverage** instead (invariant 8: `0.00 @ 0%` keeps the striped “0% · untested” track, `−0.70 @ 100%` is a full track with a red value, and the evidence row has no verdict because it is a quantity); (3) the lab's **reported confidence interval** comes from audit prose — a retained run carries no pooled estimate or CI, so **no axis is drawn** and the expansion says so in words; (4) the lab's “Found / Missing / Would move it” audit prose does not exist on this path, so the expansion is built only from facts the answer carries (trials, polarity, coverage, form strength + ladder basis, form-fit status and forms run, your daily dose, benefit band, the band where nothing was found, closeness, the server's own dose sentence, applicability, the composite, run id + scoring model). **No scoring, API, prompt, schema or pipeline change, and no new number:** the General score is still the labelled plain mean of the outcome composites. Everything else is unchanged and still reachable — capture flow, search sheet, loading panel, sign-in card, the state machine with focus moving to the result, the validity banner before any number, basis badges, label/entry facts, company + recalls + certifications, the dose bar, technical details, the badge legend, and every empty/error state. Result height at 390: **4226 → 4325 px** (360: 4437 → 4511 px), 0px horizontal overflow at both. **axe (wcag2a/aa, 2.1, 2.2) on the result at Pixel 7: 0 violations** across the outcomes list, one outcome, one outcome fully expanded and every `<details>` open — which also fixed a PRE-EXISTING WCAG 1.4.3 failure: the score ramp's fill lightness is 2.6–2.9:1 as 22–40px type, so `scoreSignalColor` gained a `usage: "fill" | "text"` argument that keeps the same hue and only darkens it (still one ramp; bars and tints unchanged, pinned by a test). A class collision was caught by looking at the shots — the new outcome headline was first called `.sc-headline`, which is the live-camera overlay's `<h1>` class, so the name rendered white and ghosted; renamed to `.sc-outcome-headline`. Shots `docs/design/ref/tabs-preview/2026-09-16-shipped-*` (including the lab card at the same width for side-by-side, and the `0% untested` / `100% negative` pair); `public/previews/scan-tabs-{outcomes,outcome}-390.png` refreshed; doc `docs/design/2026-09-16-scan-design-system.md`. Tests: `tests/scan-result-state.test.tsx` gained the four-rows-with-verdict-and-coverage pin, the expansion/no-lab-affordance pin and an every-empty-and-error-state pin. **A live scan was NOT exercised: no model API key exists in this environment** — the mocked fixture in `scripts/design_shots.mjs` is the substitute.

- **2026-09-16 (preview branch `preview/restore-four-evidence-lines`, not on main):** `/scan` evidence uses outcome tabs: General score mean tile; outcome bars whose hue runs red→amber→green by score and whose saturation/lightness follows evidence coverage; four full-width tracks inside each outcome. Caveats/disclosures collapse behind one `N warnings` summary while the validity banner stays visible. The lab A/B card matches and keeps Hero + Overlap only. Visible “Test rubric” stamps are removed. **Four founder corrections landed later the same day, presentation only, on BOTH surfaces:** (1) the warnings summary is one clean row — the “disclosure only, no score penalty” / “Open before deciding” sub-lines are deleted and the count alone is the label; (2) a funding or publication-bias warning is built **only for a real concern**, filtered by status at the source in `app/design-lab/ab/evidence-warnings.ts` (unknown / no-concern / not-assessed build nothing, so an outcome with no concern shows no warnings block at all — 2 of the 30 retained audit outcomes now carry one; `literatureDisclosures` on `/scan` already gated on `concern` and is unchanged); (3) the `⚑` gates flag strip is removed from the lab card (`score()` still computes `firedGates`, the caps are still stated in the Evidence row); (4) each outcome row is now ONE unit — name + percentage + a single chevron on line 1, population under it, the full-width bar across the bottom, no lone “More” link, still one focusable 44px+ control with a ring around the whole row. Height @390 4226px, 0px overflow. Refs `docs/design/ref/tabs-preview/`, `public/previews/`; doc `docs/design/2026-09-16-scan-design-system.md`. Tests: `tests/scan-result-state.test.tsx`, `tests/effect-presentation.test.ts`, `tests/evidence-warnings.test.tsx`. **Later the same day, four more warning kinds were added to that same collapsed block on the LAB CARD ONLY** (`app/design-lab/ab/evidence-warnings.ts` + `prototype.tsx`; `/scan` already carried the first three in its own bundle and was left untouched, pinned by a source-text test): `multi_ingredient_product`, `servings_not_stated`, `mlm` (product-level, printed in that order first) and `no_human_controlled_trial` (outcome-level, then funding, then publication bias). The first three reuse the EXACT shipped wording — the two caveat texts out of `lib/analyze/scan.ts` and, for MLM, the title/body returned by calling production `businessModelDisclosure()` — so the two surfaces cannot drift; MLM keeps its production semantics (a disclosure that never changes a number). **The honesty constraint is enforced by construction:** the three product-level facts come only from an optional, per-scenario `ProductDeclarations` that defaults to absent, and the three REAL audits (creatine, vitamin D, magnesium) plus the three effect-only research passes declare nothing, because they are single-ingredient products with a stated daily dose and no known MLM seller — a test renders all 30 retained audit outcomes and asserts none of those three ids or strings ever appears. The flags are set only on clearly-labelled FICTIONAL samples where they are true by construction: the blend (`none`, “Sample blend D · 2 capsules”, a proprietary multi-active whose own text says “amounts per ingredient not printed” and whose dose has no servings per day) carries multi-ingredient + servings-not-stated, and `thin` (“Sample extract C”) carries the MLM flag with its fictional seller named as fictional in the picker, the footnote and a stamp inside the row. `no_human_controlled_trial` is derived from real ledger data (`gates.rctCount === 0`, the same condition that makes `score()` cap certainty at 0 and show no number) so it DOES fire on a real audit — magnesium “Diagnosed anxiety disorder” — which is correct, and it is described as a cap, not a disclosure. Nothing firing still renders no block. Shots `docs/design/ref/tabs-preview/2026-09-16-lab-warning-*.png`; `public/previews/lab-warning-{collapsed,open}.png` refreshed from the blend-D pair. **Later still the same day, the LAB CARD's expandable rows were switched to a plain-language body with the audit's exact wording one tap away** (`app/design-lab/ab/plain-language.ts` + `prototype.tsx` + `ab.css`; `/scan` untouched). Each dimension row now renders shop-floor English with jargon explained inline ("1RM (the heaviest weight you can lift once)", "I2 = 0% (the trials agreed with each other)") and, under it, one quiet native `<details>` "Exact wording from the audit" holding the audit's own sentences verbatim for the same fields, plus the same treatment for the reported-effect / meaningfulness / strongest-doubt lines. **The plain layer is MODEL-WRITTEN**, read from sidecars `app/design-lab/ab/audits/plain/{creatine,vitamin-d,magnesium}.json` keyed `"<name>||<population>"` then dimension then field (plus a `summary` group), validated at module load (a blank or unknown field throws). **The audit original is retained verbatim and reachable**, and **no number was changed**: every figure, unit, interval, p-value, sample size and direction is carried across unchanged, and the layer is presentation only — no score, ledger, gate, cap or warning reads it, and the `Previous AI audit · not reverified` stamp, the `Found / Missing / Would move it` labels, the source links and the warnings block are unchanged. A missing sidecar key falls back to the audit text (one real case: creatine `form.move`, which the audit itself records as "—"), and the details block is drawn only where a row actually differs. Shots `docs/design/ref/tabs-preview/2026-09-16-plain-*.png`; tests `tests/plain-language.test.tsx`.

- **2026-09-16 (same preview branch) — the plain-language rule now lives IN THE PROMPTS, not only in the display layer, and both warning surfaces were rewritten to match.** The earlier pass rewrote audit prose in a display-side sidecar; the model still WROTE in journal English and every sentence `/scan` gets live from a model was untouched. One shared block — 2 to 4 short sentences, active voice, sentence case, every number/unit/CI/p-value/sample size kept exactly, each technical term explained inline in parentheses on first use, no softening or strengthening (a hedge stays a hedge), no advice, no markdown/bullets/emoji/em-dash connectors/marketing voice, uncertainty as a plain fact ("nobody has tested this") rather than jargon — is pasted **byte-identically** into the five prompts whose free text a person reads, with the version of each bumped in the same change (invariant 3): `prompts/compatibility.md` **compat-v1.0 → compat-v1.1**, `prompts/company.md` **company-v1.1 → company-v1.2**, `prompts/literature_warnings.md` **literature-warnings-v1.0 → literature-warnings-v1.1**, `prompts/evidence_prior.md` **evidence-prior-v1.0 → evidence-prior-v1.1**, `prompts/research_audit.md` **audit-v0.2 → audit-v0.3**. **`prompts/_shared.md` is deliberately NOT the carrier**: it is prepended by `claude_adapter._system_prompt()` to the S1–S8 extraction agents only, while the app's loaders read each prompt file directly with no preamble — putting the block there would have missed every user-facing prompt and invalidated ~1000 cached extractions for nothing. `prompts/label.md` and the S1–S8 prompts were left alone: their free text is verbatim label/paper copy and enums, never rendered to an end user as prose. The three retained audits still record `audit-v0.2`, the prompt they were actually run against. **Code-authored warning prose was rewritten to the same rules, meaning and every qualifier intact**, in `lib/analyze/literature-disclosures.ts`, `lib/analyze/business-model.ts`, the five caveats in `lib/analyze/scan.ts` and the six explanations in `app/design-lab/ab/evidence-warnings.ts`: a funding/publication row still says it is a disclosure and "does not affect the evidence score", the MLM row still opens "Model knowledge — unverified" and still says a distribution model is not a legal judgement and changes no number, and the no-human-controlled-trial row is still "a cap, not a disclosure". The `/scan` and lab strings that were byte-identical still are (the lab reuses production `businessModelDisclosure()` and copies the two caveat sentences out of `lib/analyze/scan.ts`; re-pinned by `tests/evidence-warnings.test.tsx`). **Nothing about scoring, gating or which condition fires a warning changed**, and no schema or pipeline maths moved. **Cache finding:** the deployed app keys no model-response cache at all (nothing in `lib/analyze/` or `app/api/scan` stores a reply; the route is `Cache-Control: no-store`), so the bumps invalidate nothing stale — the constants are provenance stamps in `meta.prompt_versions`; the only old-version prose lives in stored artifacts and fixtures, each carrying its own stamp. Shots `docs/design/ref/tabs-preview/2026-09-16-plainwarn-*.png` (the `/scan` warnings bundle expanded at 390 and 360 via `scripts/design_shots.mjs`, which gained the expand-and-shoot step, plus four lab rows); doc `docs/design/2026-09-16-scan-design-system.md`; tests `tests/plain-language-prompts.test.ts` plus the updated wording/version assertions across `tests/evidence-warnings.test.tsx`, `tests/company-business-model.test.ts`, `tests/literature-warnings*.test.*`, `tests/scan.test.ts`, `tests/scan-manual.test.ts`, `tests/scan-mlm-warning.test.tsx`, `tests/research-audit-schema.test.ts` and `tests/fixtures/scan-photo-rich.json`. A live `/scan` model call was NOT exercised: no model API key exists in this environment.

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
   stage list with the current step marked; the Google "Save your result" card is its one CTA when [SUPERSEDED 2026-10-03: that card is gone; where sign-in is configured a scan is not sent until a person is signed in]
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
   job [SUPERSEDED 2026-10-03: the owner-only `GET /api/scan/history[/id]` now reads it; still no image URL]. Design: `docs/SYSTEM_DESIGN.md` §6. Tests: `tests/scan-history.test.ts`,
   `tests/scan-history-route.test.ts` (payload shape, image hashing/storage, app version, orphan
   cleanup, fail-closed route behaviour, no-secret/browser leakage).
2. **The company model profile gained a conservative MLM / direct-selling read**
   (`CompanyProfile.business_model`: `confirmed_mlm` | `suspected_mlm` | `no_evidence` | `unknown`,
   each with a short `basis` and a `confidence`; `unknown` is the mandatory default whenever the model
   is unsure). `COMPANY_PROMPT_VERSION` bumped to `company-v1.1` (now `company-v1.2` after the 2026-09-16 plain-language pass below). `confirmed_mlm` / `suspected_mlm`
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
"literature-warnings-v1.0"`, now `"literature-warnings-v1.1"`) asks, per ingredient/form, whether the published trial base looks
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
them. Scores there are heuristic rubric outputs, not probabilities of benefit. Person fit is
 dropped; retained `studied_in` data is source context only. Gates at ship: 305 unit tests, typecheck, ESLint,
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

- **Handoff (2026-10-06) -- READ FIRST: the objective is to make ONE research invocation produce a usable audit, not merely to cap retries. A candidate on the local branch `medium-one-attempt-research-f7664b2` (base `f7664b2`; NOT on `main`, NOT pushed; migrations NOT applied; runtime NOT installed; website NOT deployed with it; no model run) fixes the replayed root cause (id recognition missed 14 of 18 refused ids that WERE printed in returned text; 4 were the model's own unprinted assertions), ships prompt `live-research-v0.3` (rule L7, unproven), `medium` effort and one attempt per job. Production is still the 3-attempt `xhigh` v0.2 state of `273c2d5`.** Owner, in THIS order (wrong order loses jobs): (1) review; (2) `$SUP stop --drain`, leave the worker STOPPED (never `stop --now`: with one attempt a cut job is lost); (3) read-only: no `running` job and no `queued` job with `attempts >= 1` (else start the OLD runtime, let it finish, drain again); (4) apply migration 001 then 002 (sha256 in `docs/research/pc-research-worker.md`; each refuses atomically if unsafe; run each VERIFY query); (5) push `main` and confirm the Vercel deploy is READY on that commit (no env/flag/token change); (6) `deploy/pc_research_worker_release.sh build` from that commit, `install`, `check`, `start --wait-ready`, `status` READY; (7) no model call is needed to verify; one scoped test job is the owner's call (it is the only way to learn whether L7 works). Reviewers/owner: re-read the user's objective above before judging scope; a cap-only release does not satisfy it. Rollback and the tier-order table are in the worker doc. The 2026-10-05 handoff below still describes the live PC/flag state.
- **Handoff (2026-10-05): live-only `/scan` UI is RELEASED to `main` (UI only: `0670ae3` + the Lithuanian copy fix `a2b60d3` + this docs-status commit, fast-forward off `bb166d4`); OWNER_NEEDS_WORK on `0670ae3` for one LT copy blocker, then OWNER_PASS on the delta; the PC worker, the public flag / env and every backend file are untouched, and research stays open to every signed-in Google user under the user-accepted held-open hosting condition (G4 not performed).** Remaining, in order: (1) one honest look at the shipped `/scan` with a genuine signed-in Google session — read-only: a History replay of an existing completed job is a GET and does not create a job; no new test job just to look — NOT done; (2) a native Lithuanian reader's look at the "no assumption is made" caveat (`prielaida nedaroma`, `jokių prielaidų nedaroma`); (3) owner non-blocking warnings deliberately NOT fixed: a job stuck QUEUED (worker down) shows the sliding bar with no stalled note (`isStalled` covers only `running`; a later uncapped "queued for a long time" note from `created_at` would be honest); under `prefers-reduced-motion` the pre-existing `app/globals.css` rule makes the bar a static full-width track that can read as done (its ARIA name and text say indeterminate); the auth problem state has no in-card action; the History title "Live research not requested" can read as "no job exists"; the 429 "busy" text says the worker is busy while the server means 3 open jobs; LT mixes tu / jūs; the comment in `components/scan-flow.tsx` still says "Never a blank or a hang" (comment only); no test assertion pins the LT row value `nenurodyta (prielaida nedaroma)` or the `missingHow` ending (only the sentence form is pinned; a mocked screenshot shows the ending). Rollback is a plain revert of these UI commits on `main` (no env, flag or worker change to undo). Open product questions this change deliberately did NOT decide: whether an unsaved scan should offer a one-press "save and research", whether a scan the old dictionary called "ingredient not supported" needs its own wording now that nothing is checked against that dictionary, and where the dropped model-written disclosures (funding, publication bias, MLM) should live, if anywhere, now that they are not live research.
- **Live research for EVERYONE via the temporary main-PC supervisor (RELEASED_EVERYONE 2026-10-05, user-accepted HELD-OPEN hosting; VPS later):** DONE 2026-10-05: (1) supervisor review + the Claude Code owner's read-only PASS; (2) installed from the git object, `check`, `start --wait-ready` once, `status` READY; (2b) gate G4 was NOT performed and is NOT claimed: it was REPLACED by the user's explicit condition (one Ubuntu/WSL terminal open, PC awake and online), with a second narrow owner PASS on that amendment; (3) `SCAN_LIVE_RESEARCH_ENABLED=on` + redeploy, READY at `273c2d5`, read back from the single-entry env endpoint; (4) the real state is in `Current state`. OPEN: keep the terminal open while research is open; if that ends for long, set the flag to `owners`/`off` and redeploy FIRST and `stop` the worker if the queued backlog must stop (the flag stops queueing only); after any PC/WSL/Windows restart run `start` again (NOT boot-persistent); a live non-allow-listed Google identity and the phone are UNTESTED; a hung `running` job has no automatic heartbeat check (watch the log and the queue); moving to the VPS needs its own separate permission. Kill switches: flag `owners`/`off` + redeploy, `stop --drain` / `stop --now`, token revoke + redeploy.
- **Live research (2026-10-04 evening: RELEASED_RESTRICTED, since superseded by RELEASED_EVERYONE in the first bullet; `main` `9e9c0d3`; production then in `owners` mode; one owned job passed; service NOT active):** remaining, in order: (1) the OWNER installs the persistent worker service with sudo (system unit, or recovers the user manager on purpose); exact commands and the reason are in `docs/research/pc-research-worker.md` "Owner-only install path"; until then a job waits and `run --once` works by hand; (2) optional: phone check, and a live cross-owner 404 only with a genuine second Google identity (none exists; UNTESTED live); (3) a SEPARATE explicit founder decision before opening to everyone with `on`/`1`/`true`/`yes` (TAKEN 2026-10-05, see the first bullet; never in the same deploy as a code change; the panel auto-POSTs per stored fresh scan, the only cap is 3 open jobs per user, no global cap, the CLI run itself is uncapped by design); (4) hygiene: delete the unused `~/.config/bsproof-research-worker/smoke.env`, fix the release script header that still calls the system unit "preferred", and note that 1 of the 2 attempts of the first job was refused by the grounding guard (watch the retry rate before widening). Kill switch: set the flag to the literal `off` and redeploy (a token revoke also needs a redeploy). Never run `systemd-analyze --user verify` against the real `XDG_RUNTIME_DIR`.
- **Live research smoke (DONE 2026-10-04, UTC):** one manual creatine scan (form not stated, 4000 mg per serving, servings per day unknown) -> queued by the panel -> real `claude-sonnet-5-5` xhigh subscription run on the main PC (attempt 1 refused by the grounding guard, attempt 2 completed in 397 s) -> strict canonical result stored -> owner `GET` and History replay verified (experimental, ungraded, no score). Not claimed: source-level or clinical correctness of the audit, a live cross-owner check, a phone check, the persistent service.
- **Magnesium dose correction (local uncommitted work):** EN/LT legacy replay rendered-chip assertions and realistic Python elemental fixture are implemented; focused Vitest (20 tests), typecheck, ESLint, Python unittest (4 tests), and diff check pass. Independent review required before promotion. No constants/exact-match changes.
- **Immediate blocker (owner action):** add `https://bs-proof-dashboard.vercel.app` to the NEW Google OAuth client's Authorized JavaScript origins, then verify Google button + real consent/session, phone scan, History/replay, and live owner query. Current production sign-in is still blocked despite the READY redeploy; do not claim auth works until observed end-to-end.
- **Resume published WIP without merging blindly:** UI branch `fix/scan-ignas-en-lt-20261003` (`c898d03`) needs malformed/non-array active handling and History/signout reachability proof; localization branch `fix/scan-localization-20261003` (`e3a748b`) needs independent C1/C2 and all-source-findings review, focused remaining checks and Lithuanian proofread. Research queue (`00b17d9`) and consumer (`a74160e`) still require contract/client, UI/presence/waiting states, source provenance and final security/owner review; do not provision SQL/token/worker or activate flag.
- **Research comparison: PUBLISHED 2026-10-03 (top entry of `Current state`).** The benchmark reuse rule below was followed
  (the immutable `parallel-v2` audits and the reviewed `parallel-render` set were reused; no model reruns, no duplicate
  capture), so the bullets below about waiting for those workflows, redoing the original audit and finishing the detailed
  benchmark visuals are DONE/SUPERSEDED. Still open: independent clinical and source validation of the audits (none was done;
  the images must stay labelled experimental), repairing or re-auditing the W4 rows (never silently), and a re-render at
  today's `/scan` only if a new capture and review are run. Never turn the access numbers into a "papers read" claim or any
  ranking.
- **Stale statements SUPERSEDED, 2026-10-03 13:3x (the old text is left in place, not edited; this note points at it):** "PR3 / full EN-LT not
  started", the localization header that says it is not on `main`, and the heads (`c898d03`, `e3a748b`) in "Resume published
  WIP" predate the merge to `main` at `700557a`; see "Status reconciliation" in `Current state` (their remaining review gates
  now apply to what is on `main`; the private PR3, PC-backend and PKCE worktrees are separate and unmerged). The pending PKCE assessment belongs to the canonical
  `bs-proof-dashboard.vercel.app`, not to `bs-proof.vercel.app`.
- **Human steps still open (nothing here applied or observed):** the user saved the canonical origin on the Google client
  (13:27 team status) but sign-in was still refused at the last check, so wait for propagation and re-check; the alternative
  exact add-only Supabase redirect entry `https://bs-proof-dashboard.vercel.app/auth/callback/` (keep the 18 existing entries,
  the site URL and the providers) remains an optional human approval; either way a person must run a real sign-in -> scan ->
  History -> replay.
- **Google-required scan + private History: provisioned 2026-10-03; real-service verification still open (see
  "Release stage" in `Current state`; runbook `docs/SYSTEM_DESIGN.md` §7d).** DONE at release: preflight, SQL applied
  and verified on the shared project, URL/key pair checked, Vercel production env set, Google provider read only.
  **FIRST, a human owner step (known broken today, observed for real): the Google OAuth client rejects the production origin
  with `400 origin_mismatch` -- add `https://bs-proof-dashboard.vercel.app` to that client's Authorized JavaScript origins in
  Google Cloud Console (shared client; replace nothing, change no other setting).** THEN (human, do not claim done): (a) one real
  phone Google sign-in -> scan -> History -> replay, one signed-in `/tester` analysis and one signed-out `/tester` attempt
  (Google card, nothing sent) -- a Google/MFA consent step the agent must not fake; confirm the list query against live
  PostgREST; (b) owner decisions:
  a retention notice and a deletion path (everything is kept indefinitely today; promise nothing), whether open Google
  sign-up on the shared project (`disable_signup=false`) stays acceptable given there is no quota or allow-list, and
  optionally tightening the SQL guard's text match on `qual`/`with_check` (native-review W3). If sign-in returns 401
  for everyone, check the `SUPABASE_URL` / service-key pair first (a wrong pair looks like an expired session). The
  10 dev-only `npm audit` findings remain (see the pass-1 entry).
- **After Google, in this order: PR3 / full EN–LT translation, then live PC research.** PR3 + the full EN–LT pass are
  integrated on `fix/scan-localization-20261003` (see the top of `Current state`); a partial localization continuation is saved as an unreviewed branch WIP checkpoint, NOT main/deployed. Follow the localization Next checklist in `Current state`: fresh actual-source review, remaining gate checks and Lithuanian proofreading of `lib/i18n/copy/*` and `prompts/translate.md` are required before any promotion. Live PC research was not
  started. Redo the original audit; the earlier categorical benchmark is not a valid exact-UI comparison.
- **After Google, finish EN–LT and live PC research in their own branches.** Partial localization and research-queue/consumer work are now saved at the WIP refs recorded above, but are not integrated or accepted. Complete independent reviews and remaining checks before considering promotion. Benchmark reporting/captures are available; no model winner is validated. Redo/reconcile the original audit against exact UI evidence; earlier categorical benchmark is not a valid exact-UI comparison.
- Complete live scan → research job → A/B result integration, real-phone checks, remaining presentation/disclosure work, user-owned Remotion demo and Claude Design deck, and owner decision on retention/deletion. Keep laptop development and planned mainPC worker runtime distinct.

- Finish review of the detailed benchmark visuals; preserve exact product/dose
  inputs, limitations and the distinction between quote matching and medical
  verification. Preliminary overview and magnesium previews are already shared.
- **Benchmark reuse rule (2026-10-03, parent orchestrator):** an independent Claude comparison is running as a separate
  scratch workflow (`ab139b58-2b68-4f09-b8b8-a1ca8df9ce09`) in `/tmp/bsproof-valid-benchmark/parallel-v2`, with no writes to
  this repo. The later benchmark phase MUST reuse those immutable captures and the method review when they are available
  instead of re-running cases that already succeeded, and nothing may write to `parallel-v2` while that workflow is live.
  Until it has finished and been reviewed, treat its outputs as unverified and quote none of them.
  Recorded 2026-10-03 (read-only look, nothing written there): its driver log showed cases 1 and 2 complete for both
  lanes (`opus-high` and `sonnet-xhigh`) and case 3 running. A later benchmark step must read those immutable captures
  (`checkpoints/`, `<lane>/case<N>/{audit,report}.json`, `manifest.json`) instead of repeating the model calls, re-run
  only what is missing or failed, and not touch the directory while the workflow is live.
  **Update (2026-10-03, parent orchestrator; recorded here as reported, NOT independently re-checked by the auth release):**
  the `parallel-v2` reporting addendum (`/tmp/bsproof-valid-benchmark/parallel-v2/access-addendum.json`, with its
  review `verified-addendum-review.md` under the `comparison-reporting` subagent output) was independently reviewed PASS,
  read-only, no model call and no research rerun. An actual COMPONENT screenshot capture and fidelity check was started
  in an isolated old-clean visual worktree (reported only as "worktree75") and `/tmp/bsproof-valid-benchmark/parallel-render` (workflow
  `1974d801-906d-4ff8-8900-3a139d105f8b`), with NO root-checkout writes and NO publication; at an EARLIER look that
  directory did not exist yet (superseded by the status below). **The later benchmark phase MUST reuse BOTH the completed `parallel-v2` research AND the
  reviewed `parallel-render` capture manifest** -- no model reruns and no duplicate capture work -- and treat
  `parallel-render` as unusable until its review has passed. **Status at the docs-only follow-up (2026-10-03, read-only look,
  nothing written to either directory):** `parallel-v2/manifest.json` state is `finished_all_cases_verified` and all 10
  lane-case results (`opus-high` and `sonnet-xhigh` x cases 1-5, each with `audit.json` + `report.json`) exist and are
  immutable inputs; the addendum review is PASS as reported by the parent orchestrator (not re-reviewed here).
  `parallel-render` now exists and its screenshots are still being written by the ACTIVE workflow `1974d801` (separate
  worktree), so it stays unusable until reviewed: reuse the 10 results and that one capture; start no duplicate research or
  capture. **Case 5 (whole-formula): ONLY row 0 may be graded; the
  context rows are DO NOT GRADE, and there is NO averaged formula score.** **Required caveat on any reporting of the
  source-access numbers:** 311 WebFetch calls, of which 116 were non-access (tool error, HTTP 403/other 4xx, unfollowed
  redirect, captcha/cookie wall) and 21 were Haiku refusals; the remaining 174 are only an UPPER BOUND on content actually
  read, because WebFetch returns a Haiku summary, not the original paper.


- Choose the multi-ingredient layout from the shared visual options before
  implementing it; avoid whole-blend averages and implied additive benefits.
- Finish the five-case subscription research benchmark, then implement the
  source-backed PC research worker and its secure website job connection.
  Preserve the approved four-axis result format, distinguish ingredient from
  whole-formula evidence, and keep unknown daily intake unknown. No live
  research capability is implied by this deployment cleanup.
- Obtain the other account owner's access/cooperation to retire or redirect
  `bs-proof.vercel.app` (a redirect-only alternative is under READ-ONLY assessment by the parent orchestrator; it is NOT
  implemented, and nothing about `bs-proof.vercel.app` was changed by the release or the docs-only follow-up); only the IceFrost team's BS-PROOF projects are
  consolidated so far. Canonical link: `https://bs-proof-dashboard.vercel.app`.


**Handoff (2026-09-17): retained Evidence Ledger production wiring is implemented on the preview branch, not deployed.** Person fit is dropped from the shared rubric and both result surfaces; it is not a scored or displayed dimension. Verify `npm run typecheck`, `npm run lint`, `npx vitest run`, both Python gates, and `npm run build`; inspect the 390/360 matched and unmatched result screenshots twice before any deploy. No live research audit was run: the three retained files remain audit-v0.2 model artifacts, not reverified, and the deployed model transport cannot open web sources. The Ledger is heuristic/unvalidated. Confirm the exact matcher rejects dose/form/multi-ingredient/missing-servings cases and that only one matched audit crosses the API boundary. Legacy v14 remains the API/display backup; do not alter its constants or paths. Future arbitrary-product audit expansion requires a source-retrieval service.

**[Items 2–4 below are partly SUPERSEDED by the 2026-10-03 entry: sign-in now gates the scan, the result
lock and the late claim are removed, `claim` only acknowledges, and `scans` is an exact idempotent count.]**
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
**person-fit was dropped** from the shared rubric and both surfaces; (3) only then discuss
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
same hypothetical ledger; the old prototype warning is superseded for the three
founder-approved exact retained audits now used on `/scan`. The rubric remains
heuristic/unvalidated and arbitrary-product research remains unwired.
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
boundary; `prompts/label.md` is **label-v1.3** (v1.3 states the schema's list/length limits; v1.2 typed JSON template; v1.1 added actives,
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
