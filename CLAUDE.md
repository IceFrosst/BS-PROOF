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

### 8. Dual backends: test separately, never silent-merge

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
pipeline/*                 deterministic only
```

## Commands

```bash
python3 -m pipeline.selftest
python3 run_pipeline.py creatine --form creatine_monohydrate --wiring
python3 run_pipeline.py creatine --form creatine_monohydrate --pilot   # limit 40
python3 grok_adapter.py                                               # preflight
python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate
```

**Run `pipeline.selftest` after any change to `pipeline/`.**

---

## Reports archive

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

Deterministic half complete. Reports archive required. Pilot default **40**.
**`grok_adapter.py` scaffold added** — needs `XAI_API_KEY` + live wiring +
anchor comparison before trust. Claude production still needs API key for
`--bare`. Founder wants **both** Claude and Grok setups tested **separately**.

## Next

**Handoff:** Implement/live-test `grok_adapter` against the same S8/S7 smoke
payloads used for Claude; archive a Claude-pilot report and a Grok report as
two rows in `reports/INDEX.md`. Do not merge scores.

1. Archive wiring + pilot reports under `reports/runs/`.
2. Finish `grok_adapter` HTTP path + optional `run_pipeline --grok`.
3. Side-by-side agreement table on a small fixed paper set (not production).
4. SR-inheritance uplift re-measure.
5. Pin model IDs before cached production runs.
6. Dose bands / venue factor when data exists.

---

## Conventions

- Deterministic → unit tests. Model → anchor evals (per **provider**).
- Evidence spans on every model output.
- New constants → SPEC §13.
- Demo results → `reports/runs/` + push.
- Dual backends → separate runs, separate labels, no silent merge.
