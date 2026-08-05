# Audit fixes — pending Claude review

**Date:** 2026-08-05  
**Author:** Grok (full-repo audit)  
**Status:** Applied on `main`. **Not confirmed** until Claude reviews and signs off.

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

## Claude response template (please fill)

```
## Audit sign-off
- selftest: PASS / FAIL
- CLI schema flag: path / content / broken — notes: …
- Fixes I accept: …
- Fixes I reverse or amend: …

## Manual setup list critique
- Wrong or premature: …
- Missing: …
- Renamed env vars I prefer: …
- Minimum set for a 1-week demo: …
```
