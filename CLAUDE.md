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
sources/ratelimit.py       per-domain token bucket
run_coverage.py            coverage measurement, zero model calls
docs/SPEC.md               full design, living document
docs/ANCHORS.md            28-anchor calibration set
pipeline_v1.excalidraw     pipeline diagram (root)
AGENTS.md                  routes every agent to this file
REVIEW.md                  pending audit fixes (signed off 2026-08-06)
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

## Current state

**Built and tested:** scoring, dedup, adapter, prompts, schemas, selftest.

**Verified live 2026-08-06:** `run_coverage.py` + `sources/ratelimit.py` work
against Europe PMC — no query string needed fixing. 741 records over magnesium /
creatine / ashwagandha. **METHODS% = 69.5 against a target of ≥80** — this is the
floor, before green OA and SR-table inheritance. Green OA is the named uplift.

**🔴 The one hard blocker: `--bare` cannot use a Claude.ai subscription.**
Diagnosed 2026-08-06. `claude --help`: *"Anthropic auth is strictly
`ANTHROPIC_API_KEY` or apiKeyHelper via `--settings` (OAuth and keychain are
never read)"*. Verified — plain `claude -p` succeeds, adding `--bare` fails with
"Not logged in" even while `claude auth status` reports `loggedIn: true` on a Pro
subscription. **An `ANTHROPIC_API_KEY` is required.** Preflight now blocks on it.
Do not drop `--bare` to work around this (invariant 2). No successful subagent
call has been made yet.

**`CLAUDE_CODE_OAUTH_TOKEN` does not rescue this — measured 2026-08-06, CLI
2.1.223.** Differential test under `--bare`, all `--model haiku --max-turns 1`:

| credential | result |
|---|---|
| garbage `ANTHROPIC_API_KEY` | hangs to timeout — key accepted, real API call attempted |
| `CLAUDE_CODE_OAUTH_TOKEN` set | instant "Not logged in", `duration_api_ms: 0` |
| no credential at all | instant "Not logged in" — **identical** |

The OAuth token is not rejected, it is *never read* — behaviour is byte-identical
to an empty environment. `claude setup-token` therefore cannot unblock subagents
either, despite its tokens being "inference-only", which is the right scope.
**Do not spend another session on subscription auth.** The only two routes are
`ANTHROPIC_API_KEY` or an `apiKeyHelper` via `--settings` that itself returns an
API key. Both mean console (pay-per-use) billing, separate from a Pro plan.

Operational note from the same test: a *malformed* API key makes the CLI hang
rather than return a recognisable error, so adapter `_FATAL` matching never fires
and a bad key burns `retries x timeout` (~9 min/call at defaults). Consider a
credential smoke-test in `preflight()` before any batch run.

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

**✅ Git auth fixed 2026-08-06.** `gh auth status` confirms logged in as
IceFrosst, https git operations use the gh credential helper, `git pull`
succeeds. The pull/push workflow above is unblocked.

## Next

1. **Get an `ANTHROPIC_API_KEY` from console.anthropic.com** — this is now the
   only unblock (subscription auth is ruled out, see above; do not retry it).
   Then smoke-test one subagent from a plain terminal — the last unproven layer.
   Confirm `--model haiku` resolves while you're there
2. Pin full model IDs in `TIER_MODEL`; add a spend cap (`--max-budget-usd` is
   unused)
3. **Phase 2 — retrieval.** ✅ `sources/http.py`, `sources/europepmc.py`,
   `sources/clinicaltrials.py` built and verified live. **Remaining:**
   `sources/oa.py` (Unpaywall + OpenAlex) — blocked on `BSPROOF_CONTACT_EMAIL`,
   which Unpaywall requires. This is the green-OA uplift that closes 69.5% → 80%
4. **Phase 3 — classify + dedup wiring.** Deterministic design classifier from
   publicationType/MeSH into the existing dedup. Last thing buildable with zero
   model calls
5. **Phase 4 — first real extractions.** S1/S3/S4/S5/S7/S8 over ~10 studies, then
   S2 (highest value), then S6 with an anchor eval (highest risk)
6. **Phase 5 — storage + assembly.** SQLite on a portable, Postgres-shaped schema
   so the move to Supabase is a dump-and-load. All DB access behind one module
7. **Phase 6 — calibration harness.** EFSA one-sided constraint + the 28 anchors
8. Decide the population-text mapping (see Current state)

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
