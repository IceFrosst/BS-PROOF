# Evidence pipeline — how to run it

What one run does and how to run one on your machine. The method is
`docs/METHOD.md`; the rules for changing anything are `CLAUDE.md`.

---

## 1. What one run does

```text
run_pipeline.py <ingredient> --form <form id> [flags]
  │
  ├─ corpus     bsproof/run/corpus.py    retrieve into out/bsproof.sqlite (if needed),
  │                                      dedup, classify, OA ordering, relevance gate   METHOD §3–§6
  ├─ extract    bsproof/run/extract.py   per study: S3 → S4 S5 S7 S8 → S6B → S5N → S5R
  │                                      through bsproof/claude_adapter.py               METHOD §7
  ├─ evidence   bsproof/run/evidence.py  span-checked effects → pool → GRADE → letter,
  │                                      plus the ClinicalTrials.gov registry check      METHOD §8–§13
  └─ report     bsproof/run/report.py    reports/runs/<id>_summary.md, _full.md, _context.json
```

Everything except the extract step is deterministic. The run's grades are the
`evidence_v2` block of `<id>_context.json` and the grade table in
`<id>_summary.md`.

## 2. Setup (once)

```bash
git clone https://github.com/IceFrosst/BS-PROOF.git && cd BS-PROOF
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Use `.venv/bin/python` for anything that touches the network: bare `python3`
lacks `httpx`, and a hook blocks it. Extraction needs a signed-in Claude Code CLI
(`claude auth status`). Green-OA lookups need `BSPROOF_CONTACT_EMAIL` (Unpaywall
policy); without it they raise rather than silently finding nothing.

### API keys (never in the repo)

Pipeline keys live in **`.env.pipeline`** at the repo root, which is gitignored
(`.env*`), or in environment variables of the same name (the environment wins).
Start from the committed template: `cp .env.pipeline.example .env.pipeline`.
`sources/http.secret()` reads them; a missing key turns its source off, it never
fails the run.

| Variable | Unlocks | Status |
|---|---|---|
| `ELSEVIER_API_KEY` | Elsevier full text (ScienceDirect, incl. AJCN and J Nutr): `sources/fulltext.fetch_elsevier_text`, the last text source tried, after PMC, listed copies and green OA | **Key valid, full text blocked.** 2026-11-03: the founder's personal key answers Scopus but the article API returns `AUTHENTICATION_ERROR` for every article, open access included |

| `CORE_API_KEY` | Repository full text across publishers (core.ac.uk): `sources/fulltext.fetch_core_text`, tried after Elsevier; exact-DOI matches only, broken-sign text refused; one search per 6 s (free-key rate limit) | **Working.** 2026-11-03, founder's personal key: full text for 8 of the 64 unreadable vitamin C studies, 3 refused for broken signs |

| `S2_API_KEY` | Semantic Scholar open-access links: `sources/fulltext.fetch_s2_text`, tried last; skips links already tried and PMC pages outside the open-access set; one request per 1.1 s | **Working.** 2026-11-03, founder's personal key: 27 creatine and 5 vitamin C RCTs readable through it |

With any keyed source configured, `--full-text-only` keeps every record with a
DOI and lets the ladder try it (`corpus._prioritize_primaries`). Which sources
exist, which need an account and how many trials each could add:
`docs/PAPERS_APIs.md`.

**Handover (the company replaces the founder's personal keys):**

1. On <https://dev.elsevier.com>, sign in with the company's Elsevier account and
   create a key ("I want an API key"). Name the company as the user and the
   pipeline as the use.
2. Ask Elsevier to enable full-text (text and data mining) access for that key
   (developer portal support, or the company's Elsevier contact). Say it is for
   **commercial** use: Elsevier's default terms cover non-commercial research.
3. Put it in `.env.pipeline` on every machine that runs extractions
   (`ELSEVIER_API_KEY=...`), replacing the old value. Revoke the founder's
   personal key on the portal afterwards.
4. CORE: register at <https://core.ac.uk/services/api> with the company email,
   ask about their commercial licence (free keys are non-commercial), put the
   key in `.env.pipeline` as `CORE_API_KEY=...`.
5. Semantic Scholar: request a key at
   <https://www.semanticscholar.org/product/api#api-key-form> for the company,
   read its licence for commercial use, put it in `.env.pipeline` as `S2_API_KEY=...`.
6. Check without the model: run the demo (`--demo`). A key that works raises
   the census's readable count. A key that is still blocked prints
   `ELSEVIER: the key is valid but not enabled for full text` once.

Successful reads are cached as `out/http_cache/els_*.txt` and `core_*.txt` (keys are sent as
headers, so it never appears in a URL, a cache name or a log).

## 3. Run

```bash
# 1. deterministic gates (offline, seconds)
python3 -m pipeline.invariants
python3 -m pipeline.selftest                     # expect ALL PASSED

# 2. wiring check: synthetic extraction, no model, writes no report
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate --wiring

# 3. demo: the same command plus --demo. Counts readable full text across the
#    corpus (network only), extracts 3 studies for real (cached, so the full run
#    reuses them), prints a per-agent summary and writes no report
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate \
    --full-text-only --intervention-scope --all-outcomes --demo

# 4. a real run (Claude subscription) — the creatine v2 runs used these flags
.venv/bin/python run_pipeline.py creatine --form creatine_monohydrate \
    --full-text-only --intervention-scope --all-outcomes
```

**Demo before every big run** (founder, 2026-11-03). It costs about 25 calls,
reused by the full run. Start the full run only on a clean verdict, and expect
the "no text" count the census printed.

**Skipped as "no text" costs nothing** (no model call) and is counted. The
full-text filter keeps a study when an open copy is *listed*; the census shows
how many can actually be read. Measured on vitamin C, 2026-11-03: Europe PMC
serves no XML for PMC articles outside the open-access subset (HTTP 500), and
many listed publisher or repository copies are login pages. PDFs set in a
typesetter symbol font that turns minus into "2" and plus into "þ" are refused
(`sources/fulltext._broken_signs`): a misread sign would pool as an effect of 20.

The `fontTools is required to fully parse the encoding...` lines come from pypdf
reading PDF fonts; install `fonttools` (`requirements.txt`) to silence them. They
did not change the extracted text (measured on 6 PDFs).

**Run extractions solo.** No agent teams, workflows or other heavy sessions on
the same subscription while one runs: a truncated extraction hides refusals and
biases the result.

### Flags (`run_pipeline.py --help`; an unknown flag is an error)

| Flag | Effect |
|---|---|
| `--form <id>` | The product's form (vocabulary id) |
| `--dose <mg>` | The product's daily **elemental** dose, so the run's own letters judge dose indirectness |
| `--limit N` | Extract only N studies (default: the whole corpus — a capped run is a sample) |
| `--demo` | Text census of the corpus, then 3 studies for real; no report (run before a big run) |
| `--full-text-only` | Extract only studies with readable full text |
| `--all-outcomes` / `--top-outcomes N` | Grade every outcome / the top N by RCT count (default 5) |
| `--broad-scope` / `--supplement-scope` / `--intervention-scope` / `--per-outcome` | Retrieval scope (default broad; METHOD §3) |
| `--wiring` | Synthetic extraction, no model, no report |

### Environment switches

| Variable | Default | Effect |
|---|---|---|
| `SP_SECOND_REVIEWER` | `1` | S5R, a blind second read of the poolable numbers on a different model; `0` turns it off |
| `SP_FIGURE_READER` | `1` | the figure route: S5F and S5FR read the figure of each claim whose text gives no effect (PMC articles; about 2 calls per such claim); `0` turns it off |
| `SP_MODEL_A/B/C/R`, `SP_EFFORT_A/B/C/R` | `claude_adapter.TIER_MODEL` / `TIER_EFFORT` | Model and effort per tier (pinned full ids) |
| `SP_MAX_CONCURRENCY` | `40` | Parallel model calls |
| `SP_MAX_BUDGET_USD` | `0.50` | Per-call ceiling the CLI enforces |
| `SP_QUOTA_WAIT_S` / `SP_QUOTA_MAX_WAIT_S` | 15 min / 8 h | Pause-and-probe on a usage limit |
| `SP_ALLOW_INCOMPLETE` | `0` | `1` writes a report even when studies still carry a usage-limit failure or an unfetched table |
| `SP_DUMP_EXTRACTIONS` | unset | Path to dump the full extractions (for auditing) |
| `SP_AUTO_PUSH` | `0` | `1` commits and pushes `reports/` on the current branch — never with `main` checked out (a push to `main` deploys) |
| `SP_DB`, `SP_LLM_CACHE` | `out/bsproof.sqlite`, `out/llm_cache.sqlite` | Store and model-cache paths |

## 4. Interrupted runs

Every successful model call is cached as it returns (keyed by the agent's prompt
version, model, effort and payload) and every fetched paper is cached under
`out/http_cache/`, so **re-running the same command resumes for free**.

- *Usage limit:* the run pauses and probes, requeueing the affected studies; the
  `QUOTA HIT` line quotes the limit's own message (which window, when it resets). If
  studies still carry a limit failure after the wait budget, it stops before
  grading and writes **no report** (exit code 3, an INCOMPLETE banner).
- *A cited table could not be fetched* for the number check (after retries):
  same exit 3 and no report, because those trials' numbers would be refused
  for a network reason. Re-run the same command; only the fetches retry.
- *Killed:* re-run the same command. Progress is in
  `out/checkpoints/<ingredient>_<form>.json`.
- Long runs: start them from your own terminal (`... 2>&1 | tee out/run.log`).

Prompt versions are per agent (`claude_adapter.AGENT_PROMPT_VERSION`, over the
release-wide `PROMPT_VERSION`). Bumping one agent re-runs that agent's calls and
whatever its output feeds (downstream payloads carry it, so their keys change by
content); bumping `PROMPT_VERSION` (an edit to `_shared.md`) re-extracts
everything (~1,100 calls for creatine, about four days of subscription quota on
2026-10-20..23).

## 5. Check a run

```bash
# our pooled estimates vs published meta-analyses (METHOD §16), offline
.venv/bin/python scripts/benchmark_v2.py compare reports/runs/<id>_context.json

# re-check every benchmark source quote and number (network)
.venv/bin/python scripts/benchmark_v2.py verify

# regression gate for a change that must not move any grade: replay the same run
# from the caches only (model calls blocked), before and after the change
.venv/bin/python scripts/replay_from_cache.py out/replay/before -- <the run's args>
.venv/bin/python scripts/replay_from_cache.py out/replay/after  -- <the run's args>
.venv/bin/python scripts/replay_from_cache.py --compare out/replay/before out/replay/after
```

A replay only hits the cache of its own prompt versions and payloads: a run
made before a prompt bump, or before a change to what an agent is sent, cannot
be replayed. Its dumped extractions can still be re-pooled offline with
`pipeline.evidence_v2.summarise`, which is how the v1.37 prompt clean-up was
checked (2026-10-16, `docs/history/project-log.md`).

The `run-triage` helper agent (`.claude/agents/run-triage.md`) summarises a run's
context without loading the whole file.

## 6. Reports

Each run writes `reports/runs/<id>_summary.md`, `_full.md` and `_context.json`
and adds rows to `reports/INDEX.md`. Runs are immutable: never edit one, write a
new one. Reports stay local unless `SP_AUTO_PUSH=1`.

## 7. If something breaks

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: httpx` | You used bare `python3`; use `.venv/bin/python` |
| not signed in | `claude auth status`, then log in |
| selftest red | Fix it before any extraction |
| exit code 3 (INCOMPLETE) | Usage limit; re-run the same command after it resets |
| Unpaywall error about a contact email | Set `BSPROOF_CONTACT_EMAIL` |
