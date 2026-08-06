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
pilot_adapter.py           subscription pilot path (NOT production)
workers.py                 per-study subagent fan-out              [MODEL]
run_pipeline.py            end-to-end run; --wiring / --pilot
pipeline/assemble.py       worker JSON -> Study -> ECU rows        [NO MODEL]
pipeline/scoring.py        signed score                            [NO MODEL]
pipeline/selftest.py       zero-cost regression test
scripts/write_demo_report.py  full audit report -> reports/runs/
reports/                   human-viewable run archive on GitHub
reports/runs/              one markdown file per test/demo run
reports/INDEX.md           table of all runs
reports/latest.md          copy of the newest run
docs/SPEC.md               full design
AGENTS.md                  routes every agent here
```

## Commands

Use `python3` (or activate `.venv`) — bare `python` is not on PATH.

```bash
python3 -m pipeline.selftest
python3 run_pipeline.py magnesium --form magnesium_glycinate --wiring
python3 run_pipeline.py creatine --form creatine_monohydrate --wiring
python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate
# then: git add reports/ && git commit && git push
```

**Run `pipeline.selftest` after any change to `pipeline/`.**

---

## Reports archive (required for demos)

**Every selftest / wiring / pilot summary meant for humans is stored on GitHub**
under `reports/` so the founder can open it in the browser without terminal
scrollback.

```text
reports/
  INDEX.md           # newest run at the top
  latest.md          # mirror of the newest run body
  runs/<stamp>_<ingredient>_<form>_<mode>.md   # immutable
```

### Agent rules

1. After a completed demo, wiring audit, or selftest you want recorded: run
   `python3 scripts/write_demo_report.py` (add `--wiring` and
   `--ingredient` / `--form` when scoring a product path).
2. **Commit and push** `reports/runs/*`, `reports/INDEX.md`, and
   `reports/latest.md` with that unit of work. Do not only print to the terminal.
3. **Never overwrite** an old file in `reports/runs/`. The script always creates
   a new timestamped file.
4. Label SYNTHETIC vs PILOT clearly (the script does this). Pilot rows must not
   be presented as production brand scores.
5. Do not commit API keys, OAuth tokens, or full copyrighted PDFs into `reports/`.

Full field list (inputs, study links, score components, per-study weights): see
`reports/README.md`.

### Demo caps (wiring path, current build)

| Stage | Cap |
|-------|----:|
| `retrieve` max primaries | 150 |
| `retrieve` max syntheses | 50 |
| Studies fed into synthetic score table | ≤ 40 RCT-rank (`design_rank==4`) primaries |

`run_pipeline.py --pilot --limit N` defaults to **N=12** studies extracted.
`retrieve()` defaults elsewhere are higher (800 primaries / 200 syntheses) —
wiring/report path uses the tighter 150/50 caps above.

Retrieval is by **ingredient** (`creatine`), not form. Form
(`creatine_monohydrate`) only changes transfer matching when scoring.

Europe PMC hit counts (literature size, not what one demo scores) were measured
in the millions-of-tokens era around **~9.5k creatine** records for the broad
query; a single wiring run still only **stores ≤150 primaries** and **scores ≤40**
RCT-rank rows unless those caps are raised deliberately and documented.

---

## Subagent roster

| ID | Job | Tier |
|---|---|---|
| S1 | design classifier — only when PubMed tags are ambiguous | A |
| S2 | synthesis extractor | B |
| S3 | study extractor | B |
| S4 | RoB scorer | B |
| S5 | conclusion extractor | B |
| S6 | outcome mapper | C |
| S7 | form normalizer | B |
| S8 | funding classifier | A |

Tier models: A = haiku-class, B = sonnet-class, C = opus-class (see
`claude_adapter.TIER_MODEL`). Pin full model IDs before cached production runs.

---

## Multi-agent workflow (Claude Code + Grok + Codex)

Three agents share this repo and must be able to **take over from each other
mid-task with no lost context**. The living docs ARE the handoff.

- **Claude Code** — coding sessions; auto-loads this `CLAUDE.md`.
- **Grok** — full GitHub read/write; must read this entire file before starting.
- **Codex** — reads root `AGENTS.md`, which routes it here.

### Rules for every agent

1. **Enter every task as a continuation.** Inspect branch, tree, recent commits,
   and `Current state` / `Next` before editing.
2. **Keep `Current state` / `Next` live** in the same commit as the code change.
3. **Handoff:** one-line `Handoff:` at the top of `Next` when work is in flight.
4. **Push completed units** so the last push is a clean resume point.
5. **After any change to `pipeline/`**, run `python -m pipeline.selftest` green.
6. **Never invent a constant or raise `--max-turns`.**
7. When design changes, update `docs/SPEC.md` + changelog + diagram.
8. **Archive demo/selftest reports** under `reports/runs/` (see above).

### Git / source of truth

- GitHub `IceFrosst/BS-PROOF` is the source of truth.
- Start of session: `git pull`.
- After each completed unit: commit + `git push` (no force to main).
- Include `reports/` updates when the unit produced a human-viewable run.

---

## Extraction auth (short)

- **Production:** `--bare` + `ANTHROPIC_API_KEY` only. Subscription OAuth does
  **not** work with `--bare` (measured).
- **Pilot:** `pilot_adapter.py` on subscription; labelled non-production;
  hermeticity probe required.
- **Grok as S1–S8 extractor:** rejected. Narrow yes later as disagreement flagger
  only, after anchor eval + real adapter.

Details and measurement tables: keep in git history / prior Current state notes;
do not re-litigate subscription-for-`--bare`.

---

## Current state

**Deterministic half of v1 is complete** (retrieve → classify → dedup → registry
→ storage → assemble → score). Selftest green when last measured.

**Reports archive:** `reports/runs/` + `INDEX.md` + `write_demo_report.py` —
**required** for founder-visible audits. No runs committed until someone executes
the script locally and pushes.

**Coverage:** full corpus methods **77.5%** (below 80%). Unpaywall marginal over
OpenAlex **0.0 pp**. SR-table inheritance is the remaining coverage bet.

**Production extraction** blocked on API key (founder declines spend for now).
Pilot path exists and model layer was proven on sample S7/S8 calls.

**Form `creatine_monohydrate`** is in vocab; wiring/demo for creatine uses the
caps in the Reports section (≤150 stored primaries, ≤40 scored).

## Next

**Handoff:** After local `write_demo_report.py --wiring` runs, commit `reports/`
so INDEX is no longer empty. Prefer creatine monohydrate or magnesium glycinate
as the first archived wiring audit.

1. Founder/agents: archive at least one wiring report to `reports/runs/`.
2. Re-measure SR-inheritance uplift after author+year resolution fix.
3. Production API key when public scores are required.
4. Pin full model IDs before any cached production extraction.
5. Dose bands after first real extraction clusters.
6. Venue factor (SPEC §13).

---

## Conventions

- Deterministic code → unit tests. Model calls → anchor evals.
- Every model output carries evidence spans.
- New constants → `docs/SPEC.md` §13 first.
- Design change → SPEC + changelog + diagram.
- **Demo results → `reports/runs/` + INDEX + push.**
