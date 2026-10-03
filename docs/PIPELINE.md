# Evidence pipeline — how it runs and how to run it

What happens in one extraction run, and the steps to run one on your machine.
The rules that govern changes are in `CLAUDE.md`; the scoring method and its
constants are in `docs/SPEC.md`; a picture of one run is
`pipeline_v2_demo.excalidraw` (regenerate with
`python3 scripts/write_demo_diagram.py`, which imports its constants from
`pipeline/scoring.py` so it cannot drift; open it at excalidraw.com).

Merged 2026-10-02 from `ARCHITECTURE.md`, `ON_MACHINE_STEPS.md` and
`GROK_CLI_SETUP.md` (all three are in git history).

---

## 1. What one run does

```text
                    ┌─────────────────────────────────────┐
                    │  PRODUCT: ingredient + form (+ dose) │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────▼───────────────────────────┐
          │  RETRIEVE (code)  Europe PMC / PubMed / CT.gov / OA   │
          │  SRs first → primaries · dedup NCT>DOI>PMID>fp        │
          └───────────────────────────┬───────────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │  STORE  study + registry_facts      │
                    │  (SQLite, postgres-shaped)          │
                    └─────────────────┬─────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     ▼                                ▼                                ▼
┌─────────────┐              ┌────────────────┐              ┌─────────────────┐
│ S2 on SRs   │              │ RCT primaries  │              │ Prefer full-text│
│ (--with-sr) │              │ S3 S4 S5 S7 S8 │              │ in batch order  │
│ → resolve   │              │ (+ S6B map)    │              │ optional FT-only│
└──────┬──────┘              └────────┬───────┘              └────────┬────────┘
       │         ┌────────────────────▼───────────────────┐           │
       │         │  ADAPTER (the only model boundary)     │           │
       │         │  claude_adapter | grok_adapter         │◄──────────┘
       │         │  pure function · pinned PROMPT_VERSION │
       │         └────────────────────┬───────────────────┘
       └──────────────┬───────────────┘
                      ▼
          ┌───────────────────────────┐
          │  ASSEMBLE (code)          │
          │  eligibility firewall     │
          │  form / dose / pop match  │
          │  dose band from trials    │
          └─────────────┬─────────────┘
                        ▼
          ┌───────────────────────────┐
          │  SCORE (code)             │
          │  w = design×RoB×size×…    │
          │  signed = 100·d·c·(1−0.4H)│
          │  SR → E′ multiplier ≤1.30 │
          └─────────────┬─────────────┘
                        ▼
          ┌───────────────────────────┐
          │  ECU rows + four arcs     │
          │  reports/runs/ → app      │
          └───────────────────────────┘
```

### Weight factors (score path)

```text
w_study = design × RoB × size × funding × OA
          × 0.85 if rob_inherited      (another team's RoB judgement)
          × 0 if retracted
```

Form, dose and population are **not** in the weight (founder, 2026-08-07); they
are arcs (CLAUDE.md invariant 8). `FORM_FACTOR`, `DOSE_FACTOR` and `POP_FACTOR`
still exist in `scoring.py` and feed the arcs; the `APPLY_*_IN_WEIGHT` switches
are all `False`.

**OA tiers:** `full_text` 1.00 · `sr_table` 0.85 · `abstract_only` 0.55. A trial
reached only through a review's table scores at `sr_table × rob_inherited` =
**0.72** of the same trial read directly (invariant 6).

**Predatory venues:** flag-only (`pipeline.predatory.ZERO_WEIGHT = False`,
founder policy), matched publisher-side against `vocab/predatory_journals.txt`
(see `vocab/README_PREDATORY.md`).

---

## 2. Backends (never silent-merge)

| Path | Flag | Auth | Store |
|------|------|------|-------|
| Wiring (synthetic, no model) | `--wiring` | none | `out/wiring_demo.sqlite` |
| Claude production | (default) | Claude subscription + `--safe-mode` | `out/bsproof.sqlite` |
| Grok pure-function | `--grok` | Grok CLI, signed in | `out/grok_<ingredient>.sqlite` |

Both model backends use the same prompts, schemas and `PROMPT_VERSION`. Runs
are stored and reported separately and never blended (invariant 9).

### How the Grok path is kept pure

| Flag / practice | Role |
|-----------------|------|
| `grok -p` | Headless one-shot |
| `--max-turns 1` | No agent loop |
| `--no-memory --no-subagents --no-plan` | No ambient agent features |
| `--output-format json` | Machine-readable |
| Empty `--cwd` temp dir | Avoid AGENTS.md / project rule leak |

Verify every Grok model id with `grok models` before setting it (`grok-4.3`
is not a valid CLI id and failed a run 0/80).

---

## 3. Run it on your machine

### Setup (once)

```bash
git clone https://github.com/IceFrosst/BS-PROOF.git && cd BS-PROOF
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Use `.venv/bin/python` (or `source .venv/bin/activate`) for anything that
touches the network: bare `python3` lacks `httpx`, and a hook blocks it.

### Step 1 — deterministic health check (no model)

```bash
python3 -m pipeline.invariants
python3 -m pipeline.selftest     # expect ALL PASSED; stop and fix otherwise
```

### Step 2 — wiring demo (synthetic, no model)

```bash
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --wiring
```

### Step 3 — Claude production

Needs a signed-in Claude Code CLI (`claude auth status`).

```bash
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate
```

**Run extractions SOLO.** No agent teams, workflows or heavy sessions on the
same subscription while it runs — a truncated extraction hides nulls and biases
scores upward.

### Step 4 — Grok (optional, separate)

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
echo 'export PATH="$HOME/.grok/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
grok login                     # browser/device auth; subscription only, no billed key
grok models                    # verify model ids
.venv/bin/python -m bsproof.grok_adapter         # preflight: finds grok + 8 subagents
.venv/bin/python -m bsproof.grok_adapter smoke   # one S8 call
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --grok
```

### Useful flags

`run_pipeline.py --help` lists them all; an unknown flag is an error.

| Flag | Effect |
|------|--------|
| `--dose <mg elemental>` | Judge the dose axis for a specific product |
| `--limit N` | Cap studies (default: whole corpus — a capped run is a sample) |
| `--with-sr` | S2 on meta-analyses; SR-table trials enter at the `sr_table` tier |
| `--per-outcome` | One retrieval query per outcome (stops one outcome starving others) |
| `--intervention-scope` / `--supplement-scope` / `--broad-scope` | Retrieval scope |
| `--full-text-only` / `--all-oa` | Score only full-text studies (Grok default) / include abstracts |
| `--top-outcomes N` / `--all-outcomes` | Showcase top-N outcomes by RCT count (default 5) / full vocabulary |
| `--demo` | Exact form only + ignore population (**not production**) |

A study costs ~10 model calls, about half of them S6. Since 2026-10-03 the
**table route** for arm-level numbers (S1 design facts + one S5T call per claim
that has table candidates) is on by default for evidence method v2; it adds a
few calls per study and moves no v14 score. `SP_NUMERIC_TABLES=0` turns it off.

**Second reviewer (evidence method v2, off by default).** `SP_SECOND_REVIEWER=1`
adds one `S5R` call per study on a different model (`SP_MODEL_R`, default
`claude-opus-5`) that re-reads the poolable numbers blind; `pipeline/review.py`
keeps only numbers both readings agree on and queues conflicts in
`review_v2.adjudication`. It roughly adds 1 heavier call per study: run it solo.

### Step 5 — archive results

Every human-facing run goes under `reports/runs/` with a row in `INDEX.md`
(`scripts/auto_report_push.py` does this at the end of a
run; `scripts/write_demo_report.py` writes a wiring report). Never overwrite an
old run. Label the provider.

### Re-scoring without re-extracting

Scoring is deterministic, so a scoring fix does not need a new extraction:
`scripts/rescore_run.py` re-scores a run from its own cached extractions
(`--recompose` for display-only changes).

---

## 4. If something breaks

| Symptom | Fix |
|---------|-----|
| `grok: command not found` | PATH + reinstall CLI |
| auth / not logged in | `grok login` (Grok) · `claude auth status` then `/login` (Claude) |
| smoke returns unparseable JSON | Check stdout; adapter flags may need a tweak |
| selftest red | Fix the pipeline before any extraction |
| rate / session limit | Lower `--limit` or wait; retrying a limit error does not help |
| `ModuleNotFoundError: httpx` | You used bare `python3`; use `.venv/bin/python` |
