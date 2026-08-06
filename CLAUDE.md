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
prompts/*.md               subagent instructions S1-S8 + _shared.md. The real IP.
schemas/*.json             output contracts, enforced via --json-schema
pipeline/scoring.py        w_study, E, E', d, c, H, signed score   [NO MODEL]
pipeline/dedup.py          canonical ID resolution                 [NO MODEL]
pipeline/selftest.py       zero-cost regression test
sources/ratelimit.py       per-domain token bucket
run_coverage.py            week-1 measurement script
docs/SPEC.md               full design, living document
docs/ANCHORS.md            28-anchor calibration set
pipeline_v1.excalidraw     pipeline diagram (root)
AGENTS.md                  routes every agent to this file
REVIEW.md                  pending audit fixes awaiting Claude sign-off
```

## Commands

```bash
python claude_adapter.py        # preflight: CLI present, 8 subagents wired
python -m pipeline.selftest     # deterministic regression, zero model calls
python run_coverage.py magnesium creatine ashwagandha   # zero model calls
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

## Current state

**Built and tested:** scoring, dedup, adapter, prompts, schemas, selftest.

**Verified live 2026-08-06:** `run_coverage.py` + `sources/ratelimit.py` work
against Europe PMC — no query string needed fixing. 741 records over magnesium /
creatine / ashwagandha. **METHODS% = 69.5 against a target of ≥80** — this is the
floor, before green OA and SR-table inheritance. Green OA is the named uplift.

**The one hard blocker: no successful model call has ever been made.** CLI flag
shape is confirmed correct (raw content, not paths), but the round trip is
unproven. A nested `claude -p` inside a Claude Code session returns "Not logged
in" — **the smoke test must be run from a plain terminal.**

**Not built yet, blocking everything else:** the ECU JSON schema and the three
controlled vocabularies (`outcome`, `form`, `population`). S3, S6 and S7 extract
*into* these — their prompts reference vocabularies that don't exist yet.

**Open constants awaiting Tier-3 calibration:** `k`, all transfer factors, OA
penalty, RoB thresholds. See `docs/SPEC.md` §13.

**2026-08-05 audit fixes (Grok) — ✅ reviewed and signed off by Claude
2026-08-06.** See `REVIEW.md`. Seven fixes accepted as-is; the registry regex was
amended (anchoring made it validate whole fields, so noisy registry fields fell
through to DOI and split one trial across its papers — the dedup trap in its
dangerous direction). Adapter error reporting also fixed: it read stderr, but the
CLI writes errors to stdout. PROMPT_VERSION=v1.1.

**⚠️ Open reproducibility risk — `TIER_MODEL` uses floating aliases.**
`haiku`/`sonnet`/`opus` resolve to "the latest model", and `_key()` hashes the
alias string. When an alias moves, the cache serves stale extractions under
unchanged keys. Pin full model IDs before any cached extraction run.
Also unconfirmed: `--help` does not list `haiku` as a valid alias.

**⚠️ Git auth is not set up on this machine.** `git pull` fails with
`could not read Username for 'https://github.com'`; `gh auth status` reports not
logged in. The pull/push workflow above cannot run until this is fixed.

## Next

1. **`gh auth login`** — unblocks the commit/push workflow (nothing can be pushed
   today)
2. **Smoke-test one subagent from a plain terminal** — the last unproven layer.
   Confirm `--model haiku` resolves while you're there
3. Pin full model IDs in `TIER_MODEL`; add a spend cap (`--max-budget-usd` is
   unused)
4. ClinicalTrials.gov integration — RoB items 3+4 and the unpublished flag, one API
5. Calibration harness — EFSA one-sided constraint + the 28 anchors
6. **ECU schema + three vocabularies** — blocks S3/S6/S7
7. Retrieval + dedup wiring
8. Per-study workers
9. Scoring + storage

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
