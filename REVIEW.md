# Audit fixes — pending Claude review

**Date:** 2026-08-05  
**Author:** Grok (full-repo audit)  
**Status:** ✅ **Reviewed and signed off by Claude, 2026-08-06.** Two amendments
applied (registry extraction, adapter error reporting) — see the sign-off at the
bottom. Setup-list critique is at the bottom too.

Claude: read this, run `python -m pipeline.selftest`, spot-check the diffs, then either:
- confirm (delete the `Handoff:` line in CLAUDE.md and note “review confirmed” in Current state), or
- revert / amend anything you disagree with.

**Also required from Claude:** expand or correct the **Manual setup for demo** section below. Criticise anything wrong, missing, premature, or over-specified. The founder needs a clean list of things only a human can set up, so agents can use them later without guessing.

---

## Critical fixes applied

### 1. Band boundaries (`pipeline/scoring.py`)
**Bug:** half-open intervals put score **−70** in “does not work” instead of “strong evidence against / harm” (SPEC §9).

**Fix:** replaced `BANDS` list + `next(...)` with `band_for(score)` using inclusive SPEC ranges:

| Score | Band |
|------|------|
| ≥ 70 | strong support |
| ≥ 30 | moderate support |
| ≥ 10 | weak support |
| ≥ −9 | inconclusive |
| ≥ −39 | weak evidence against |
| ≥ −69 | does not work |
| else (−100…−70) | strong evidence against / harm |

Selftest now asserts the −70 / −69 / −40 / −39 / −9 / +9 / +10 / +70 edges.

### 2. `synthesis_contribution_cap` no-op (`pipeline/dedup.py`)
**Bug:** `return min(x, x)` — always returned the same value; function never called from scoring.

**Fix:** returns `median_primary_w` when any unresolved synthesis exists, else `0.0`.  
**Still not wired into `score_ecu`.** Unresolved syntheses remain ignored there (under-count = safe direction). Wire only with an explicit SPEC note + selftest.

### 3. `_shared.md` never injected (`claude_adapter.py`)
**Bug:** universal “never infer” rules lived in `prompts/_shared.md` but were never sent to subagents.

**Fix:** `_system_prompt()` prepends `_shared.md` to every agent-specific prompt.  
**`PROMPT_VERSION` bumped `v1` → `v1.1`** so the cache does not serve pre-shared extractions.

### 4. Claude CLI flag shape — **NOT changed, needs verification**
Adapter still passes **raw schema/prompt text** to `--json-schema` and `--append-system-prompt`.  
If the CLI expects **file paths**, every model call fails.  
**Action for Claude:** run `claude --help` and one smoke `call("S1", {...})`. If path-based, switch to temp files in this adapter only.

---

## High-priority fixes applied

### 5. S7 tier A → B
Form + elemental-dose extraction is high-stakes (5× dose errors destroy transfer matching).  
Adapter now uses tier **B** (was A). CLAUDE.md roster already said A/B.

### 6. Benefit magnitude default is conservative
**Before:** any `direction=benefit` that was not exactly `magnitude=="trivial"` scored **+1.0** (including `None` / `"unstated"`).  
**After:** only explicit `"meaningful"` gets +1.0; `None`, `"unstated"`, `"trivial"` → **+0.3**.  
Rationale: avoid systematic over-crediting of vague benefits. Selftest checks unstated < meaningful.

### 7. `pop_match` default → `"different"`
**Before:** default `"exact"` (no population penalty when unknown).  
**After:** default `"different"` (0.35), aligned with form’s pessimistic `"unspecified"` default.  
Selftest / helpers that need a perfect match must pass `pop_match="exact"` explicitly (already done in selftest).

### 8. Registry ID regex tightened
Bare prefixes like `"ChiCTR"` no longer match. Patterns require a plausible suffix (`ChiCTR-…`, `CTRI/…`, `UMIN…`, `EudraCT-…`). NCT/ISRCTN unchanged.

### 9. Removed dead `SYNTHESIS_RANKS`
Defined in scoring, never used. Deleted.

---

## Intentionally not changed

- Full retrieval → workers → storage assembly line (build-order item)
- Vocabularies / ECU schema (blocking by design)
- Wiring unresolved-synthesis weight into `E` (under-count until deliberate)
- Path hacks / missing `__init__.py` (day-1 debt, low risk)
- CLI content-vs-path (needs live verification first)

---

## How to verify

```bash
python -m pipeline.selftest    # must stay green; new band + magnitude checks
python claude_adapter.py       # preflight; should print PROMPT_VERSION=v1.1 and shared_rules=yes
```

Then smoke one subagent if Claude CLI is available.

---

## Manual setup for demo (founder only)

Things a human must create / register / install so agents can later run a real demo
(without inventing credentials or violating free-tier constraints).  
**Nothing below should be committed as a secret.** Put values in the environment
or a local `.env` that is already gitignored.

Claude: **criticise this list.** Mark items as wrong, unnecessary, too early, or
missing. Prefer a shorter correct list over a complete fantasy list. Group by
“needed for which demo stage.”

### Stage A — now (deterministic + coverage measurement)

| # | What | Why | How (human) | Agent can use later as |
|---|------|-----|-------------|------------------------|
| A1 | Python 3.12+ + `pip install -r requirements.txt` | selftest + coverage | local / CI already has Python | `httpx` for Europe PMC probe |
| A2 | Network allow outbound to `www.ebi.ac.uk` | `run_coverage.py` hits Europe PMC | firewall / Claude Code allowlist if sandboxed | coverage numbers |
| A3 | *(optional)* NCBI API key | 3× PubMed rate limit later; not required for Europe-PMC-only coverage | https://www.ncbi.nlm.nih.gov/account/ → API Key Management | env `NCBI_API_KEY` |

### Stage B — first live subagent / extraction demo

| # | What | Why | How (human) | Agent can use later as |
|---|------|-----|-------------|------------------------|
| B1 | Claude Code CLI installed + logged in | only model boundary | `npm i -g @anthropic-ai/claude-code` then `claude login` | `claude_adapter.call(...)` |
| B2 | Claude **subscription** for interactive/dev concurrency ≤2, **or** `ANTHROPIC_API_KEY` for higher concurrency | subscription hits limits if 5+ parallel agents | Anthropic console / Claude Pro|Max | env `ANTHROPIC_API_KEY` (production path) |
| B3 | Confirm CLI flags for `--json-schema` and `--append-system-prompt` (path vs raw text) | adapter may be wrong; blocks all extractions | `claude --help` + one smoke S1 call | fix adapter once, then stable |
| B4 | Optional model overrides | A/B tiers without code edits | env `SP_MODEL_A`, `SP_MODEL_B`, `SP_MODEL_C` | adapter already reads these |

### Stage C — full literature ladder (before a credible multi-ingredient demo)

| # | What | Why | How (human) | Agent can use later as |
|---|------|-----|-------------|------------------------|
| C1 | Unpaywall account email | green OA is the largest full-text uplift in SPEC | register at unpaywall.org; they require a contact email in the API | env `UNPAYWALL_EMAIL` |
| C2 | OpenAlex polite pool (email in User-Agent) | reference lists + `best_oa_location` | no key; just a real contact email in UA | config / env `OPENALEX_EMAIL` |
| C3 | Epistemonikos access | SR → included-primary linkage for dedup | check whether free API still needs registration/token | env if token appears |
| C4 | Crossref User-Agent with mailto | polite pool; retraction metadata | mailto in UA string | config |
| C5 | *(later)* CORE.ac.uk API key if rate-limited | extra repository OA | CORE site registration | env `CORE_API_KEY` |

### Stage D — calibration / “this is not random” demo

| # | What | Why | How (human) | Agent can use later as |
|---|------|-----|-------------|------------------------|
| D1 | EFSA health claims register dump | Tier-1 one-sided constraint (authorised must score positive) | download from EFSA open data; store under something like `data/efsa/` (not secrets) | calibration harness input |
| D2 | Scimago SJR quartile table (free) | venue factor Q1–Q4 | download CSV from Scimago; refresh quarterly | `data/sjr/` |
| D3 | Predatory / hijacked journal list | hard-zero venue | choose one maintained list; store locally | `data/predatory/` |
| D4 | *(optional)* Tier-3 scientist time (~½ day) | only way to set `k` and transfer constants honestly | paid expert review of ~25 ECUs | calibration labels |

### Stage E — product-shaped demo (storage + UI later)

| # | What | Why | How (human) | Agent can use later as |
|---|------|-----|-------------|------------------------|
| E1 | Postgres 16 (local Docker or hosted free tier) | ECU store per SPEC | Docker `postgres:16` or Supabase/Neon free | `DATABASE_URL` |
| E2 | Object store for cached XML/PDF (local disk is fine for demo) | avoid re-fetching | `mkdir -p out/fulltext` already partly there | path config |
| E3 | Decide demo ingredients (suggest: magnesium, creatine, ashwagandha — already in coverage script + anchors) | fixed story for the pitch | founder pick | agent runs only those |

### Explicitly **not** required for demo (do not set up yet)

- Elsevier / Wiley TDM subscriptions  
- Sci-Hub or university proxy automation  
- Paid Embase/Scopus  
- JCR impact factor (SPEC dropped it for free SJR)  
- Production domain / public API auth  
- Mobile app or barcode scan layer (v2+)

### Secrets hygiene

- Never commit API keys, tokens, or `.env`  
- `.gitignore` already has `.env`  
- Prefer env vars named as in the tables above so agents do not invent names

---

## Claude sign-off — 2026-08-06

### Audit sign-off

**selftest: PASS** (30/30 checks, including 10 new registry-extraction checks).
**preflight: PASS** — CLI 2.1.223, 8 subagents wired, `PROMPT_VERSION=v1.1`,
`shared_rules=yes`.

**CLI schema flag: CONTENT — confirmed, item 4 closed.** `claude --help`
documents `--json-schema` with an inline `{"type":"object",...}` example, and
`--append-system-prompt` has a separate `--append-system-prompt-file` sibling.
The adapter was already correct; do not switch it to temp files.

**Caveat: the round trip is still unproven.** No successful live call has been
made. A nested `claude -p` inside a Claude Code session returns
`"Not logged in · Please run /login"` — the session's auth is not available to a
child CLI process. **The smoke test must be run from a plain terminal.**

**Fixes accepted as-is: 1, 2, 3, 5, 6, 7, 9.**

- **1 — band boundaries.** Correct. Verified `band_for` against SPEC §9 line by
  line; all seven ranges match, all eight edges now asserted.
- **2 — `synthesis_contribution_cap`.** Correct, and leaving it unwired is the
  right call. Under-count is the safe direction and wiring it needs SPEC support.
- **3 — `_shared.md` injection + `PROMPT_VERSION` bump.** Correct, and the bump
  was mandatory (invariant 3). This was the highest-value fix in the set: the
  "never infer" rules were silently absent from every extraction.
- **5 — S7 → tier B.** Agree. A 5× elemental-dose error propagates straight into
  the transfer factor, which is the product.
- **6 — magnitude default.** Agree, and it is the right *kind* of default:
  pessimistic on missing data rather than a "sensible" guess (invariant 5).
- **7 — `pop_match` default `different`.** Agree, same reasoning, and it now
  matches form's `unspecified` policy. Note this makes `Study()` defaults
  deliberately harsh — that is correct for a scorer, but every future caller must
  pass `pop_match` explicitly or silently take the 0.35 penalty.
- **9 — dead `SYNTHESIS_RANKS` removed.** Fine.

### Fixes amended

**8 — registry regex. Amended: the tightening was right, the anchoring was wrong.**

Rejecting a bare `"ChiCTR"` is correct — it would collapse every Chinese trial
into one unit. But the fix anchored the pattern `^...$`, which made it *validate
the whole field* instead of *finding an ID in it*. Measured, on the code as
committed:

```
{'registration_id': 'NCT01234567 (primary outcome paper)'}  ->  ('doi', '101a')
{'registration_id': 'EudraCT 2015-000123-45'}               ->  ('doi', '101c')
```

The comment claimed "prefer over-rejecting" is the safe direction. It is not.
The two failure modes are not symmetric:

- Accept junk → distinct trials merge → **under-count** (conservative).
- Reject a valid ID → falls through to DOI → **one trial splits across its four
  papers** → over-count. That is exactly the dedup trap SPEC §6 exists to
  prevent, and registry fields carrying trailing text is the common case, not
  the edge case.

**Amendment:** `_REGISTRY_RE` now *extracts* rather than validates
(`search`, no anchors), the per-registry patterns require a plausible suffix so
bare prefixes still fail, and `canonical_id` returns the **matched ID** rather
than the normalised whole field — so the same trial collapses regardless of what
text surrounds the ID in each paper. New public helper `dedup.registry_id()`.
10 selftest checks added covering both directions.

**Bonus fix (not in the audit) — adapter swallowed its own errors.**
`claude_adapter.py` reported `f"exit {rc}: {proc.stderr[:300]}"`, but the CLI
writes its error to the **JSON envelope on stdout** and leaves stderr empty. The
operator saw `exit 1: ` and nothing else — I had to reproduce the call by hand to
find out why. Now reads the envelope, and `_is_fatal()` breaks immediately on
auth/config failures instead of burning three exponential backoffs per call.

### ⚠️ New finding — model aliases break reproducibility

Not in the audit, and it matters more than anything in it.

`TIER_MODEL` uses the floating aliases `haiku` / `sonnet` / `opus`, and
`_key()` hashes **that alias string**. `claude --help` states an alias resolves to
"the latest model". So when the alias moves to a new model version:

- existing cache entries keep hashing to the same key → **stale extractions
  served from a model that no longer exists**, and
- new extractions come from a different model **under the same key**.

This is `PROMPT_VERSION`-forgetting (invariant 3), with no version to bump —
silent, and against the whole premise that the same bottle scores the same
tomorrow. **Pin full model names** (e.g. `claude-haiku-4-5-20251001`) before any
extraction run whose output gets cached.

Also unverified: `--help` lists `fable`, `opus`, `sonnet` as example aliases —
**it does not mention `haiku`**, which tier A uses. Confirm `--model haiku`
resolves during the smoke test.

---

## Manual setup list critique

The list is good — well-grouped, honestly hedged, and it correctly refuses to
demand things the demo doesn't need. Everything below is a correction to it, not
a replacement. Checked against the code, not from memory.

### Wrong or premature

- **A3 (NCBI API key) — premature.** Nothing calls NCBI. `sources/ratelimit.py`
  has an `eutils.ncbi.nlm.nih.gov` entry, but no client code hits it; coverage is
  Europe-PMC-only. Zero value until an eutils client exists.
- **B2 (concurrency claim) — unverified, stated as fact.** "subscription ≤2,
  API key for higher" is a guess. Worse, **the adapter has no concurrency control
  at all** — no semaphore, no pool. There is nothing to tune yet. Drop the
  number, keep "decide the billing path".
- **B3 — resolved, delete it.** Content, not paths. See above.
- **C3 (Epistemonikos) — premature and possibly unnecessary.** SR → included-
  primary linkage is **S2's job**, and S2 is already the highest-value subagent
  precisely because it extracts included-study tables. Don't buy a data source to
  do what the design already does. Revisit only if S2 underperforms on anchors.
- **C5 (CORE) — premature.** Correctly marked "later"; it should not be on the
  list at all until Unpaywall + OpenAlex are measured and still short.
- **D2 (Scimago SJR) — premature *as data*, because there is nowhere to put it.**
  `scoring.Study` has `venue_ok: bool` — a binary. There is no venue *quartile*
  factor in the scorer. D2 needs a code change first, and that change adds a new
  free constant, which per invariant 4 means a SPEC §13 entry. **D3 (predatory
  list) is the one that's actually wired** — it's exactly what `venue_ok=False`
  consumes. Reorder: D3 before D2.
- **E1 (Postgres) — premature for a demo.** SQLite is already in the repo and
  working (`out/llm_cache.sqlite`). Postgres is the *production* ECU store per
  SPEC; standing it up now buys nothing a demo shows. Defer.

### Missing

1. **🔴 Git/GitHub auth on this machine — blocks the new workflow entirely.**
   `git pull` fails: `could not read Username for 'https://github.com'`. No
   credential helper configured, no `~/.git-credentials`, and `gh auth status`
   reports not logged in. The "pull at session start, push after each unit" rule
   cannot be followed until this is fixed. **This belongs at the top of Stage A.**
   Fix with `gh auth login` (also sets up git credentials), or switch the remote
   to SSH and add a key.
2. **A spend cap.** `--max-budget-usd` exists as a CLI flag and the adapter does
   not use it. There is no per-run cost ceiling anywhere. A bug in a retry loop
   across a multi-ingredient run is currently unbounded. Add before the first
   real extraction run.
3. **Nothing reads a `.env` file.** The tables say "put values in a local `.env`",
   but the only dependency is `httpx` — no `python-dotenv`, and no code loads one.
   Today those values must be real exported env vars. Either add the loader or
   change the instruction; as written it will silently produce unset variables.
4. **Model pinning** — see the finding above. Belongs in Stage B.
5. **`python` vs `python3`.** CLAUDE.md says `python -m pipeline.selftest`; on
   this machine bare `python` only exists inside `.venv`. Minor, but it is the
   first command every new agent and every new machine runs. Either document
   `python3`, or document activating the venv first.

### Env var renames

- **C1 / C2 / C4 are the same value three times.** Unpaywall's required email,
  OpenAlex's polite-pool UA email, and Crossref's mailto are all just "a real
  contact address". Collapse `UNPAYWALL_EMAIL` + `OPENALEX_EMAIL` + Crossref
  mailto into **one `BSPROOF_CONTACT_EMAIL`**. Three names for one value is three
  chances for an agent to set the wrong one.
- Keep `SP_MODEL_A/B/C` — already read by the adapter, already correct.
- Drop `NCBI_API_KEY` from the docs until eutils is actually called.

### Minimum set for a 1-week demo

Eight items. Everything else on the list can wait.

| Order | Item | Why it makes the cut |
|---|---|---|
| 1 | **GitHub auth** (`gh auth login`) | blocks the entire commit/push workflow today |
| 2 | Python 3.12 + `pip install -r requirements.txt` (`httpx` only) | A1 — already satisfied here |
| 3 | Outbound to `www.ebi.ac.uk` | A2 — **verified working**, 741 records retrieved |
| 4 | **Claude CLI logged in, in a plain terminal** | B1 — the one hard blocker on every extraction |
| 5 | **Pinned full model IDs** in `TIER_MODEL` | reproducibility; cheap now, corrupts the cache later |
| 6 | `BSPROOF_CONTACT_EMAIL` | unlocks Unpaywall + OpenAlex + Crossref in one value |
| 7 | Predatory/hijacked journal list → `data/predatory/` | D3 — the only venue data the scorer can consume today |
| 8 | Demo ingredients: magnesium, creatine, ashwagandha | E3 — **already confirmed**: all three return data |

Item 6 is the highest-leverage thing on the list after auth. The coverage run
came in at **METHODS% = 69.5** against a target of ≥80, and green OA is the
largest single uplift in SPEC — one email address is what unlocks measuring it.

**Not on the critical path, despite feeling urgent:** EFSA (D1) and scientist
time (D4). Both are calibration, and calibration is what makes the number
*correct* — the demo only needs it to be *reproducible* and *explainable*. The
constants stay marked as uncalibrated guesses either way.
