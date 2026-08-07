# BS-PROOF — build report and creatine pilot run

**Date:** 2026-08-07
**Mode:** `pilot` (Claude subscription, non-production) + deterministic measurements
**Selftest:** 136/136 PASS
**Verdict on the creatine run: DID NOT COMPLETE — quota exhausted. No score produced.**

---

## 0. What this system is

Scores supplement evidence at the level of
`(ingredient, form, dose_band, outcome, population)` — the **ECU** — and emits a
signed score from −100 to +100.

Competitors score *ingredients*. This scores ingredient × form × dose and
discounts evidence that doesn't match the bottle.

---

## 1. The creatine test run

**Target:** creatine monohydrate → muscle strength / power output. This is
**anchor #1** of the calibration set — expected **80–95, strong_positive** — the
case that should score highest in the entire system.

**Configuration:** 10-minute per-call timeout, concurrency 3, supplement-scoped
retrieval, 10 RCT-rank primaries, `PROMPT_VERSION` v1.2, pinned model IDs.

### Retrieval: succeeded

Corpus discovered, classified from PubMed tags, deduplicated, registry facts
pulled from ClinicalTrials.gov. All deterministic, zero model calls, no errors.

### Extraction: failed on quota

```
extracting 10 studies...
  !! 43 subagent calls FAILED across 10 studies
     S7: You've hit your session limit · resets 2:20am (Europe/Vilnius)
     S4: You've hit your session limit · resets 2:20am (Europe/Vilnius)
     S5: You've hit your session limit · resets 2:20am (Europe/Vilnius)
     A failed call is not an empty study. Treat these rows
     as missing data, not as evidence of no effect.

PILOT ECU ROWS — creatine, form=creatine_monohydrate
--------------------------------------------------------------
--------------------------------------------------------------
```

**No score was produced and none should be inferred.** This is the Claude.ai
subscription's throughput ceiling — `REVIEW.md` item B2 guessed at it, and it is
now measured. It is not a code failure and it says nothing about creatine.

### What the run did prove

The diagnostics work. Three earlier runs failed *silently* and printed an empty
table. This one named the cause in the first line. Since fixed:

- `"session limit"` / `"usage limit"` / `"rate limit"` are now **fatal** — the
  batch stops on the first one instead of burning 43 calls against a
  time-based limit that retrying cannot clear.
- `workers` marks `_quota_exhausted`, because a quota failure is a property of
  the account, not of the study.
- The runner labels it a quota ceiling, so an empty run is never readable as
  "this supplement has no evidence".

**This is the strongest argument yet for `ANTHROPIC_API_KEY`.** The subscription
path was accepted for *small, labelled* pilot batches. Ten studies exceeds it.
A calibration pass over 34 anchors is unreachable this way.

---

## 2. Extraction quality — where it did run

Before the quota hit, individual extractions ran correctly.

### The elemental-dose trap, working end to end

Given *"400 mg magnesium citrate twice daily"*, S7 returned:

```json
{"form_vocab_id": "magnesium_citrate", "compound_dose_mg": 800,
 "elemental_dose_mg": null, "dose_basis": "compound_only",
 "dose_frequency_per_day": 2, "confidence": 0.6}
```

It normalised to a daily total and **refused to guess** the elemental dose. The
pipeline — not the model — then bounded it at **95.1–129.3 mg** from molar
masses recorded in the vocabulary.

That division of labour is the design: the model reads prose, the code does
arithmetic. A dose wrong by 2× silently destroys dose-band matching.

### S6 outcome mapping — the highest-risk subagent — is behaving

| raw outcome | mapped |
|---|---|
| fasting blood glucose, HbA1c | `glycaemic_control` |
| quadriceps muscle strength | `muscle_strength` |
| inflammatory markers | `inflammation_crp` |
| adverse drug reactions | `adverse_events_any` |
| postoperative atrial fibrillation | **null — refused** |
| intraoperative opioid consumption | **null — refused** |
| "other metabolic parameters (unspecified)" | **null — refused** |

> *"Postoperative atrial fibrillation is a clinical cardiac arrhythmia event
> with no corresponding id in this sleep/stress/exercise vocabulary"*

**Do not grow the vocabulary to cover those.** POAF and intraoperative opioid
use are not consumer-supplement outcomes; adding them would file drug trials
under supplement claims.

---

## 3. Coverage — the stated go/no-go

Measured over the **complete corpus**: 20 155 records, 100% of what the query
matches.

| | Europe PMC | + green OA | methods-level facts |
|---|---|---|---|
| **full corpus** | **68.7%** | **76.2%** | **77.5%** |
| 16% relevance slice (superseded) | 78.7% | 87.8% | 88.9% |

**77.5% against a ≥80% target — below it.**

The earlier 88.9% was an artefact of truncation: Europe PMC ranks by relevance,
well-cited papers are disproportionately open access, and a top slice reads
~11 points high. Any coverage figure must now state what fraction of the corpus
it measured.

### Unpaywall adds nothing — a falsified design assumption

SPEC called green OA via Unpaywall "the largest single uplift." Head-to-head on
47 closed records with DOIs:

| | count |
|---|---|
| found by **both** OpenAlex and Unpaywall | 20 |
| OpenAlex only | **0** |
| Unpaywall only | **0** |
| neither | 27 |

Marginal contribution **0.0pp**. They are not independent — OpenAlex already
ingests Unpaywall. The contact email was never the blocker.

**SR-table inheritance is the only remaining rung** to 80%. One open-access
systematic review carries characteristics and risk-of-bias tables for ~15
primaries whose own full text is unreachable; uncapped synthesis:primary = 0.52.

---

## 4. Retrieval specificity — the gating problem

`("magnesium") AND RCT` returns 6 736 records, ~25% of them IV or procedural
magnesium: eclampsia, cardiac surgery, nerve blocks. Those can never map to a
consumer outcome, and each costs a full six-call extraction to discover.

| query | hits | clinical-context titles |
|---|---|---|
| broad (current default) | 6 736 | 25% |
| + MeSH Dietary Supplements | 10 | 0% (indexing far too sparse) |
| + supplement terms | 2 022 | 12% |
| + supplement NOT clinical | 1 420 | **1%** |

`scope='supplement'` exists but **`broad` remains the default**, because:
its *recall* cost is unmeasured; switching would change the corpus behind every
number above; and it trades clinical noise for **wrong-ingredient noise** —
Europe PMC matches "magnesium" anywhere in a record, so Astragalus,
whey-protein and Griffonia trials get retrieved.

Measured yield was **unchanged** between scopes. Neither is right. The
ingredient must be constrained to the **intervention**, not the document.

---

## 5. Six silent failures, all the same shape

Every one reported success while producing nothing. None would have surfaced
without running the pipeline end to end.

| # | Failure | Why it was invisible |
|---|---|---|
| 1 | Registry regex validated whole fields | `NCT01234567 (primary outcome paper)` fell through to DOI, splitting one trial across four papers — the dedup trap, in its dangerous direction |
| 2 | Adapter read stderr | The CLI writes errors to **stdout**; operators saw `exit 1:` and nothing else |
| 3 | `ct.gov fetch()` collapsed all failures to `None` | A 403 looked identical to "trial not registered", silently stripping RoB items 3–4 from a whole run |
| 4 | Storage had no `abstract` column | Six studies extracted from an **empty string**; every subagent returned schema-valid output, zero rows, exit 0 |
| 5 | SR resolution required a DOI | Characteristics tables say "Smith 2019" — 36 included studies resolved to **0** |
| 6 | Pilot path had no concurrency limit | 20 concurrent non-bare subprocesses timed out, and **a timed-out call returns `None`, indistinguishable from "this study reported nothing"** |

Failure 6 made three consecutive runs look like a corpus with no mappable
outcomes. Running a single study through the same code mapped 8 claims
correctly. I initially misattributed it to the retrieval query; it was
concurrency.

---

## 6. Auth — measured, not argued

`--bare` is required by invariant: it skips CLAUDE.md discovery, hooks, MCP and
auto-memory, so an extraction cannot vary with ambient project state.

**`--bare` reads `ANTHROPIC_API_KEY` or an apiKeyHelper and nothing else.** OAuth
and the keychain are never read, so a subscription cannot drive the production
adapter. `CLAUDE_CODE_OAUTH_TOKEN` behaves byte-identically to an empty
environment.

Dropping `--bare` for pilot work re-enables CLAUDE.md discovery. Canary test,
from a directory whose CLAUDE.md said *"end every response with CANARY7788"*:

| invocation | result |
|---|---|
| `claude -p` | **LEAKED** — replied `OK\n\nCANARY7788` |
| `claude -p --settings '{}'` | **LEAKED** |
| `claude -p --strict-mcp-config` | **LEAKED** |
| `claude -p` from a clean directory | clean |

**No flag disables CLAUDE.md discovery** — only the working directory does, and
discovery walks **up** the tree, so every ancestor must be clean.
`pilot_adapter.py` runs that canary before every batch and refuses to extract if
it leaks. It still cannot promise reproducibility: plugins and auto-memory load
regardless.

---

## 7. Open and honest

| Item | Status |
|---|---|
| Creatine anchor score | **Not produced** — quota exhausted mid-run |
| Coverage 77.5% vs ≥80% | **Not met.** SR-table inheritance is the remaining path |
| Retrieval specificity | **Gating.** Neither query scope is correct |
| SR-inheritance uplift | **Unmeasured** — first run predates the resolution fix |
| Subscription throughput | **Insufficient** for 10-study batches |
| `k`, transfer factors, RoB thresholds | Guesses awaiting Tier-3 calibration |
| Dose bands | Deliberately absent (`band_version: 0`) until real doses exist |
| Population adjacency graph | Provisional guess |
| Calibration anchors | 34/34 in-scope have vocabulary; running them needs extraction |
| Production extraction | Blocked on `ANTHROPIC_API_KEY` |

**Nothing in this report is a public claim about any named brand.** Every
extraction was produced on the pilot path, which is explicitly non-reproducible
and barred from public claims and calibration sign-off.
