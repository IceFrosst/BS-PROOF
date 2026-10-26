# BS-PROOF full audit report (claude-ft-inter)

Generated: **2026-10-25 22:36 UTC**


scoring_model: evidence-v2

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-ft-inter**

Auto-written with the summary after every extraction.

## How the grade is built

Evidence method v2 (`docs/METHOD.md`). Models extract fields only;
everything below is deterministic.

```text
1. per trial, per outcome: ONE verified effect (numbers checked against their
   quoted span), Hedges' g with its variance       pipeline/effect_size.py
2. per outcome: REML random-effects pool, Hartung-Knapp CI (k >= 3),
   prediction interval, leave-one-out range        pipeline/pool.py
3. GRADE certainty: start High for RCTs, downgrade for risk of bias,
   inconsistency, imprecision, indirectness (form / dose / population)
                                                   pipeline/grade.py
4. letter = benefit size (vs the meaningful-change threshold M) x certainty
```

Every refused trial is counted with its reason; nothing is silently dropped.
Predatory list: https://www.predatoryjournals.org/the-list/publishers

## Selftest: **PASS**

```text
  PASS  real journal not flagged: Acta oto-laryngologica  list entry 'lar'
  PASS  real journal not flagged: The Journal of Clinical Investigation  list entry 'e journal'
  PASS  MIN_PUBLISHER_CHARS=6 excludes every sub-6 acronym  'LAR' is why the floor exists
  PASS  flag counts the studies, not the venues  1
  PASS  publisher coverage is reported beside the verdict  0 flagged @ 0 resolved != 0 flagged @ 240 resolved
  PASS  a publisher hit is never reported as a journal  naming an imprint as a journal is the libel-shaped error
  PASS  'not checked' is distinguishable from 'clean' in the summary  the truncated-list bug read as a clean corpus for four commits
  PASS  real journal in a publisher field is not flagged: The Journal of Rheumatology  matched list entry 'e-journal' before anchoring — the libel-shaped error
  PASS  generic list fragment does not flag an unrelated imprint  matched 'Science Publishers'; would hit any publisher with that phrase
  PASS  a genuine list entry still flags with a corporate suffix  anchoring must not cost true positives
  PASS  name drift is under-flagged, not force-matched  measured live 2026-08-09 on doi 10.4172/2157-7633.1000345
  PASS  a resolved-publisher run with no hits reads as a real answer  0 flagged @ 2 resolved is data, not a gap

STRUCTURAL INVARIANTS
  PASS  the real deterministic layer reaches no model boundary  
  PASS  no allowlist entry is stale or reasonless  
  PASS  every AGENTS entry has a schema, a prompt and a known tier  
  PASS  no formatting trick hides a model import  13 evasions all caught
  PASS  innocent source does not trip the check  false positives: []
  PASS  a reasonless allowlist entry is itself a failure  an unexplained exception is an undocumented hole in invariant 1
  PASS  the deterministic layer imports on a bare interpreter  
  PASS  a module-level third-party import is caught  
  PASS  the same import inside a function is fine  lazy is the fix, so it must not be reported as the problem
  PASS  stdlib and local imports are not third-party  

STRATIFIED SELECTION
  PASS  the budget is split across outcomes, not taken from the head  endurance got 3/6
  PASS  a record retrieved for two outcomes is selected once  
  PASS  untagged stores degrade to plain priority order  
  PASS  limit is respected  

RELEVANCE: BIOMARKER IS NOT THE SUPPLEMENT
  PASS  kinase-only paper is rejected  
  PASS  a real creatine trial that measures CK still passes  bare mentions > marker mentions -> supplement is present
  PASS  phosphokinase counts as the marker too  
  PASS  a topical cream is not evidence about oral supplementation  
  PASS  mentioning topical delivery in the abstract does not reject  
  PASS  other ingredients are untouched by the marker rule  

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **2**
- Succeeded (usable): **2**
- Skipped (no text): **0**
- Partial agent failures: **0**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40


## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **848**
- Publisher resolved for: **669/848** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **5**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 2 | 0 | 2 | 0 | — |
| S4 | 2 | 0 | 2 | 0 | — |
| S5 | 2 | 0 | 2 | 0 | — |
| S5N | 2 | 0 | 2 | 0 | — |
| S5R | 1 | 0 | 1 | 0 | — |
| S6B | 2 | 0 | 2 | 0 | — |
| S7 | 2 | 0 | 2 | 0 | — |
| S8 | 2 | 0 | 2 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S3: 0 attempts for 2 studies -- impossible, every study needs at least one attempt
- S4: 0 attempts for 2 studies -- impossible, every study needs at least one attempt
- S5: 0 attempts for 2 studies -- impossible, every study needs at least one attempt
- S5N: 0 attempts for 2 studies -- impossible, every study needs at least one attempt
- S5R: 0 attempts for 1 studies -- impossible, every study needs at least one attempt
- S6B: 0 attempts for 2 studies -- impossible, every study needs at least one attempt
- S7: 0 attempts for 2 studies -- impossible, every study needs at least one attempt
- S8: 0 attempts for 2 studies -- impossible, every study needs at least one attempt

## Studies extracted this run (2)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Effects of six weeks of guanidinoacetic acid supplementation with and without cr | [10.1080/15502783.2026.2711032](https://doi.org/10.1080/15502783.2026.2711032) | Journal of the International Society of  | full_text | no |
| 2 | 2026 | Effects of creatine supplementation with and without exercise and diet intervent | [10.1080/15502783.2026.2716273](https://doi.org/10.1080/15502783.2026.2716273) | Journal of the International Society of  | full_text | no |

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 1 |
| attention_focus | **I** | no data | Very low | 0 | — | — | 2 |
| cognitive_function | **I** | no data | Very low | 0 | — | — | 1 |
| energy_levels | **I** | no data | Very low | 0 | — | — | 1 |
| exercise_endurance | **I** | no data | Very low | 0 | — | — | 1 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 1 |
| lean_body_mass | **I** | no data | Very low | 0 | — | — | 2 |
| memory | **I** | no data | Very low | 0 | — | — | 2 |
| muscle_strength | **I** | no data | Very low | 0 | — | — | 1 |
| sleep_quality | **I** | no data | Very low | 0 | — | — | 1 |

Why trials were refused (all outcomes):

- 7 × study: no_isolated_ingredient_arm
- 5 × no outcome values in the text read (figure-only or not reported)
- 1 × reported mean difference has no verified CI with a stated level

## Notes

- Form, dose and population never weight a trial; they are GRADE indirectness.

- Predatory venues: flagged + counted, never weighted.

- This report is **this run only** — other ingredients are not mixed in.
