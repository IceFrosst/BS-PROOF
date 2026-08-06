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

### 1. `claude_adapter.py` is the ONLY file that talks to a model

Everything in `pipeline/` and `sources/` is deterministic. If you find yourself
importing the adapter into `scoring.py` or `dedup.py`, stop.

Deduplication, canonical ID resolution, scoring arithmetic, band mapping, and
transfer-factor application all have right answers. Putting a model in those
loops means the same bottle scores differently next Tuesday, and a system making
public claims about named brands has to be reproducible to be defensible.

### 2. Subagents are pure functions, not agents

Invoked with `--bare --max-turns 1`, no tools, no loop, no state. Input JSON on
stdin, output JSON matching the schema, exit.

If a subagent seems to need a second turn, the **prompt** is wrong. Do not raise
`--max-turns`. Do not give a subagent tools.

`--bare` is not optional — it skips CLAUDE.md discovery, hooks, MCP servers, and
auto-memory. A scientific extraction must not vary with ambient project state.

### 3. Bump `PROMPT_VERSION` when you edit any prompt

It's in the cache key (`hash(content, PROMPT_VERSION, model)`). Forget, and the
system silently serves stale extractions with no error and no way to notice.
This is the most likely quiet bug in the codebase. Editing `prompts/_shared.md`
also requires a bump — it is prepended to every subagent call.

### 4. Never invent a constant

`k = 3.0`, the transfer factors, the RoB thresholds, the OA penalty — these are
**guesses awaiting calibration**, and they are marked as such. If you change one,
say so in the PR and update `docs/SPEC.md`. Do not tune them to make a test pass.

### 5. `null` is a valid answer everywhere

The extraction contract is: never infer a field you cannot see. A `null` is a
known unknown the pipeline handles. A guess is an unknown unknown that silently
corrupts every downstream number. Do not add "sensible default" fallbacks to
extraction code.

### 6. Syntheses are data, not evidence

A meta-analysis contains zero new patients. It never enters evidence mass. It
contributes: discovery, effect estimates, and a **bounded** multiplier
(ceiling 1.30). If you change the synthesis path, run the dedup trap test —
30 meta-analyses over 9 RCTs must not scale with document count.

### 7. Nulls are negative

A well-run trial finding no effect is evidence *against* the product's claim,
not absence of evidence. `s_i = −0.7`. This is what frees `0` to mean
"inconclusive" and nothing else. Do not "fix" this to 0.

---

## Layout

```
claude_adapter.py          the ONE model boundary. All CLI coupling lives here.
workers.py                 per-study subagent fan-out              [MODEL]
run_pipeline.py            end-to-end run; --wiring needs no key
pipeline/assemble.py       worker JSON -> Study -> ECU rows        [NO MODEL]
prompts/*.md               subagent instructions S1-S8 + _shared.md. The real IP.
schemas/*.json             output contracts, enforced via --json-schema
vocab/*.json               outcome / form / population vocabularies (DATA)
pipeline/vocab.py          vocab lookups, elemental conversion     [NO MODEL]
pipeline/scoring.py        w_study, E, E', d, c, H, signed score   [NO MODEL]
pipeline/dedup.py          canonical ID resolution                 [NO MODEL]
pipeline/classify.py       design rank from PubMed tags            [NO MODEL]
pipeline/storage.py        the ONLY module that talks to the DB    [NO MODEL]
pipeline/retrieve.py       discover->classify->dedup->persist      [NO MODEL]
pipeline/selftest.py       zero-cost regression test
schemas/storage.sql        portable SQL — SQLite now, Supabase later
sources/http.py            throttled, retried, disk-cached client
sources/europepmc.py       discovery + normalisation
sources/clinicaltrials.py  RoB items 3+4, unpublished flag
sources/oa.py              green OA — OpenAlex + Unpaywall
sources/fulltext.py        JATS full text, sections, SR tables
sources/ratelimit.py       per-domain token bucket
run_coverage.py            coverage measurement, zero model calls
docs/SPEC.md               full design, living document
docs/ANCHORS.md            28-anchor calibration set
pipeline_v1.excalidraw     pipeline diagram (root)
AGENTS.md                  routes every agent to this file
REVIEW.md                  audit fixes (signed off 2026-08-06)
```

## Commands

Use `python3` (or activate `.venv`) — bare `python` is not on PATH.

```bash
python3 claude_adapter.py       # preflight: CLI, models pinned, API key present
python3 -m pipeline.selftest    # deterministic regression, zero model calls
python3 -m pipeline.vocab       # validate the three vocabularies
python3 -m pipeline.retrieve magnesium creatine ashwagandha   # zero model calls
python3 run_coverage.py --sample 45 magnesium   # zero model calls
```

**Run `pipeline.selftest` after any change to `pipeline/`.** It costs nothing and
it catches the failures that matter: the dedup trap, sign of nulls, the transfer
factor collapsing, the sufficiency gate, band boundaries.

---

## Subagent roster

| ID | Job | Tier |
|---|---|---|
| S1 | design classifier — only when PubMed tags are ambiguous | A |
| S2 | synthesis extractor — included list + characteristics + RoB tables | B |
| S3 | study extractor — n, arms, dose, duration, population | B |
| S4 | RoB scorer — 6-item proxy | B |
| S5 | conclusion extractor — direction, effect size, CI | B |
| S6 | outcome mapper — raw endpoint → vocabulary | C |
| S7 | form normalizer — form, salt family, elemental dose | B |
| S8 | funding classifier | A |

**S2 is highest-value** (one SR yields data for ~15 unreadable primaries).
**S6 is highest-risk** (a wrong outcome mapping is silent and unrecoverable).
**S7 is high-stakes** (elemental-dose trap) — tier B, not A.

Tiers are a prior, not a measurement. A/B them on the 28 anchors before
committing further.

---

## Multi-agent workflow (Claude Code + Grok + Codex)

Three agents share this repo and must be able to **take over from each other
mid-task with no lost context**. The living docs ARE the handoff — no separate
handoff files.

This pattern is the same one used in Personal-Hub, adapted for a scientific
pipeline where reproducibility is the product.

- **Claude Code** — coding sessions; auto-loads this `CLAUDE.md`.
- **Grok** — full GitHub read/write; must read this entire file before starting.
- **Codex** — reads root `AGENTS.md`, which routes it here; must also read this
  entire file before changing anything.

### Rules for every agent

1. **Enter every task as a continuation.** Inspect the current branch, working
   tree, recent commits, and this file's `Current state` / `Next` before editing.
   Preserve another agent's in-flight work.
2. **The state of play lives here → `Current state` / `Next`.** Keep them live —
   update them in the **same commit** as the code change, not only at session end.
3. **Handing off:** put a one-line **`Handoff:`** note at the top of `Next`
   (what's in flight · what's next · any risk). The successor deletes it once
   picked up.
4. **Anything pushed is a valid resume point.** Commit + push frequently so the
   last push is a clean handoff. See `Git / source of truth` below for the exact
   rules — they supersede any earlier "ask before pushing" habit.
5. **After any change to `pipeline/`**, run `python -m pipeline.selftest` and
   keep the result green. This is non-negotiable.
6. **Never invent a constant or raise `--max-turns`.** If a subagent seems to need
   a second turn, the prompt is wrong — fix the prompt.
7. When a design decision changes, update `docs/SPEC.md` **and** its changelog,
   then regenerate the diagram (`pipeline_v1.excalidraw`).

### Git / source of truth

- GitHub `IceFrosst/BS-PROOF` is the source of truth.
- At the start of every session: `git pull`.
- After each completed unit of work: commit with a clear message, then `git push`
  to origin.
- Do not wait for extra confirmation to push after a completed unit.
- Never `git push --force` to main.
- If push fails (auth/network), stop and report — do not retry destructively.

A "completed unit of work" means the change is coherent on its own **and**
`python -m pipeline.selftest` is green if `pipeline/` was touched. Push a broken
tree and the next agent inherits it as a resume point.

### Why this is stricter here than in Personal-Hub

A personal app can ship a slightly wrong UI. This system will make public claims
about named brands. The same bottle must produce the same score tomorrow. That
is why the hard invariants above exist and why agents must not quietly bypass them.

---

## Local Claude Code plugins (machine-only)

These are **optional developer conveniences** on a local WSL/Claude Code install.
They are **not** product dependencies. They do not ship via `git clone`. They do
not replace `claude_adapter.py` or the S1–S8 research agents. Headless `--bare`
calls ignore MCP/plugins by design (invariant 2).

**Recorded 2026-08-06 on founder machine (user scope / WSL):**

| Plugin / MCP | Status | Role |
|---|---|---|
| `claude-md-management` | enabled | Audit / improve this `CLAUDE.md` |
| `skill-creator` | enabled | Build/eval Claude skills (meta; not required for pipeline) |
| `github` (official MCP) | installed; MCP **failed** last check | Repo helpers inside Claude Code — fix auth if needed |
| claude.ai Canva MCP | connected | Design assets; unrelated to scoring |
| claude.ai Cloudflare MCP | connected | Infra helpers; unrelated to scoring |

**Not installed (deliberately):** playwright, chrome-devtools, superpowers — no
product UI yet; avoid extra subagent frameworks that compete with S1–S8.

To inspect on a machine: `/plugin` → Installed. New Claude sessions may be
required after install. Cloud sessions do not automatically inherit WSL plugins.

---

## Extraction auth — founder preference + pilot options

**Founder preference (2026-08-06):** do **not** want pay-per-token Console API
billing for now; prefer Claude **subscription** only.

**Measured fact:** `--bare` + subscription / `CLAUDE_CODE_OAUTH_TOKEN` does **not**
work (see Current state). The production design still wants `--bare` +
`ANTHROPIC_API_KEY` for public, defensible scores.

### Option A — Subscription hybrid pilot (NOT a full `--bare` replacement)

**Status: proposed by Grok / founder — Claude to accept, amend, or reject.**

For a **limited pilot** only (small N, not public brand claims), extract via
subscription Claude Code with extra guardrails:

1. **Extract** with fixed prompt file + `PROMPT_VERSION`, JSON schema only (no
   free-form), **pinned model id** (not floating `sonnet`/`haiku`), evidence
   spans required.
2. **Verify** second pass: only flag schema violations + span mismatches; **do
   not invent fields**.
3. **Accept** only if both pass; else `null` / discard (fail toward under-count).
4. **Log** prompt hash, model id, raw JSON, timestamps (repo artifact or DB).
5. **Score** only via deterministic `pipeline/scoring.py`.

Stronger than a sloppy chat. **Weaker** than `--bare` + API for "same score every
Tuesday." Must not silently replace the production adapter path without a SPEC
note and explicit labeling of outputs as `pilot` / non-production.

### Option B — Grok as an alternate extractor (optional)

**Status: proposed — Claude to decide.**

Grok (this agent) already has GitHub read/write and can run structured
extraction against the same prompts/schemas in principle, logging the same
fields (prompt hash, model id, raw JSON, time). Possible uses:

- tiny pilot batches while Claude API is refused;
- second-opinion pass (disagree → discard / human review);
- not a silent substitute for S1–S8 production without SPEC + eval.

Constraints: must not put a model inside `scoring.py` / `dedup.py`; must not
invent constants; outputs need the same evidence-span + schema discipline.
If adopted, add a thin `grok_adapter` (or documented manual protocol) rather
than forking prompts ad hoc — Claude decides shape.

### Production target (unchanged)

Public claims / scale: `--bare` + `ANTHROPIC_API_KEY` (or `apiKeyHelper` that
returns an API key). Do not drop `--bare` to "make subscription work."

---

## Current state

**The deterministic half of v1 is COMPLETE and runs end to end**, Europe PMC →
classify → dedup → registry facts → storage → assembly → scored ECU rows. Zero
model calls. `python3 run_pipeline.py magnesium --form magnesium_glycinate
--wiring` demonstrates the whole path today; 2076 studies and 109 registry
records are already persisted in `out/bsproof.sqlite`.

**⚠️ `--wiring` output is SYNTHETIC** — separate DB (`out/wiring_demo.sqlite`),
`prompt_version: "SYNTHETIC-NOT-REAL"`, every line prefixed. It proves the wiring
and says nothing about any ingredient. Do not remove those guards.

**COVERAGE MEASURED ON THE FULL CORPUS 2026-08-06 — target NOT met.**
20 155 records, 100% of what the query matches:

| | Europe PMC | + green OA | methods-level facts |
|---|---|---|---|
| **full corpus** | **68.7%** | **76.2%** | **77.5%** |
| 16% slice (superseded) | 78.7% | 87.8% | 88.9% |

**77.5% against a ≥80% target.** The earlier 88.9% was inflated by
relevance-order truncation — Europe PMC ranks by relevance, well-cited papers
are disproportionately OA, and a top slice reads ~11 points high. Re-measuring
uncapped settled it.

This does not invalidate the approach: the gap is 2.5 points with two named
paths to close it — **Unpaywall** and **SR-table inheritance**. But **do not
claim 80% is demonstrated.** It is not.

Any future coverage figure must state what fraction of the corpus it measured.
`europepmc.hit_count()` supplies it and `run_coverage.py` prints it.

**🔴 Production extraction blocker: `--bare` cannot use a Claude.ai subscription.**
Diagnosed 2026-08-06. Verified — plain `claude -p` succeeds, `--bare` fails with
"Not logged in" on Pro. `CLAUDE_CODE_OAUTH_TOKEN` is never read under `--bare`
(byte-identical to empty env). **Console `ANTHROPIC_API_KEY` is the production
path.** Founder currently **declines API spend**; see pilot options above.

**✅ `BSPROOF_CONTACT_EMAIL` — founder reports SET 2026-08-06.** Unlocks
Unpaywall in `sources/oa.py`. Confirm the env var is visible in the shell that
runs coverage/retrieve (`echo ${BSPROOF_CONTACT_EMAIL:+set}`). Not a secret;
still must not be committed to the repo.

**Built 2026-08-06 — the vocabularies no longer block S3/S6/S7.**
`vocab/{outcome,form,population}.json` + `schemas/ecu.json` +
`pipeline/vocab.py` (deterministic, no model). Elemental conversion is now
molar-mass arithmetic in code, not model arithmetic, and it **refuses** to
convert hydrate-ambiguous salts. Dose bands deliberately deferred:
`band_version: 0` / `dose_band: null` until real doses exist to cluster.

**Unassigned:** nothing maps raw `population_text` onto the four population axes.
S3 emits the raw text, S6 is outcome-only. Recommended fix in `docs/SPEC.md` §5 —
pass the population vocab into S3 and have it emit axes directly (costs no extra
model call, but needs a `PROMPT_VERSION` bump).

**Open constants awaiting Tier-3 calibration:** `k`, all transfer factors, OA
penalty, RoB thresholds. See `docs/SPEC.md` §13.

**2026-08-05 audit fixes (Grok) — ✅ reviewed and signed off by Claude
2026-08-06.** See `REVIEW.md`.

**⚠️ Open reproducibility risk — `TIER_MODEL` uses floating aliases.**
Pin full model IDs before any cached extraction run.

**✅ Git auth fixed 2026-08-06.** `gh auth status` confirms logged in as
IceFrosst.

## Next

**Handoff:** Claude — review **Extraction auth — founder preference + pilot
options** (subscription hybrid + optional Grok extractor). Accept / amend /
reject in this file. Do not implement a silent bypass of `--bare` for
production. Unpaywall path is unblocked if `BSPROOF_CONTACT_EMAIL` is present
in the run environment.

### Founder / credentials

1. **`ANTHROPIC_API_KEY`** — declined for now (cost). Production extraction
   remains blocked until this or an accepted pilot path exists.
2. **`BSPROOF_CONTACT_EMAIL`** — ✅ founder says set. Next: run OA/coverage with
   Unpaywall enabled and record the new methods% on the **full corpus**.

### Unblocked / decide

3. **Claude decision:** hybrid subscription pilot (Option A) and/or Grok
   extractor (Option B) vs wait for API key — document the choice here.
4. **S2 synthesis path** — deterministic half done; live S2 needs a model path.
5. **Derive dose bands** after a first real extraction pass.
6. **Population-text mapping** — still unassigned (`docs/SPEC.md` §5).
7. **Calibration harness** — built; running needs extraction.
8. **Close the 2.5-point coverage gap** — Unpaywall (email set) + SR-table
   inheritance (needs S2).
9. **Venue factor** — still open (SPEC §13 first).

---

## Conventions

- Deterministic code gets unit tests. Model calls get anchor-set evals. Don't
  confuse the two.
- Every model output carries evidence spans (char offsets). This is the legal
  defensibility layer — don't drop it for convenience.
- New free constants go in `docs/SPEC.md` §13 as open items, with a note on how
  they'd be calibrated.
- When a design decision changes, update `docs/SPEC.md` **and** its changelog,
  then regenerate the diagram.
