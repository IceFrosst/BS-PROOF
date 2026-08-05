# Audit fixes — pending Claude review

**Date:** 2026-08-05  
**Author:** Grok (full-repo audit)  
**Status:** Applied on `main`. **Not confirmed** until Claude reviews and signs off.

Claude: read this, run `python -m pipeline.selftest`, spot-check the diffs, then either:
- confirm (delete the `Handoff:` line in CLAUDE.md and note “review confirmed” in Current state), or
- revert / amend anything you disagree with.

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
