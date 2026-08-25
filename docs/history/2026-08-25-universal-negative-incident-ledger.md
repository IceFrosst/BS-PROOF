# Universal-negative incident ledger — 2026-08-25

This ledger records the available evidence behind the 32-study universal-negative
repair. The complete machine-readable source roster is
`docs/history/2026-08-25-negative-contributors.v1.json` (32 studies, 43 rows,
−95.73 original points; source bundle SHA-256 recorded in that file). It is an
audit aid, not a corrected score, and the audit delta must never be treated as
evidence mass or a rescore.

## Scope and evidence boundary

The incident concerns claims that entered the assembler as evidence against an
ingredient despite lacking a valid signed between-arm efficacy comparison. The
ledger is deliberately ingredient-agnostic: named ingredients occur only in the
source records and examples below. No model or network extraction was run for
this repair.

## Verified facts

| # | Fact | Evidence | Consequence |
|---:|---|---|---|
| 1 | The assembler previously routed an efficacy `null_effect` with no usable effect size to the historical null value. | `pipeline/assemble.py` and `Study.s_value()` before this repair; existing selftests exercised the fixed-negative path. | A nonsignificant result could contribute a signed negative despite no signed estimate. |
| 2 | A reported effect magnitude is not safely signed unless S5 names the arm it favours. | S5 prompt and prior extraction audit: absolute magnitudes were routinely printed beside nonsignificant results. | Raw signs and unnamed magnitudes must not be used as pairwise direction. |
| 3 | Baseline, within-group, time-main-effect, and omnibus statistics do not establish an ingredient-versus-ingredient-free contrast. | Existing S5 contract and `standardise_effect()` refusal routes. | These tests are now refused symmetrically by the assembler firewall. |
| 4 | A group×time differential interaction can establish direction, but its omnibus magnitude is not a signed pairwise effect. | S5 contract and deterministic provenance rule. | Differential tests may support direction only; F/omnibus magnitude is refused. |
| 5 | S3 already had study-level comparator and isolation refusals, but arm-level target/control provenance was not universal. | `schemas/s3_study.json`, `pipeline/assemble.py`, and prior eligibility tests. | Arm presence, role, cointerventions, and evidence text are now explicit. |
| 6 | S7 top-level form/dose facts could be projected onto a claim without proving that the named arm supplied them. | Existing S7 schema and `study_dose()` path. | Arm-keyed S7 facts are selected only from the named target arm; ambiguous legacy envelopes refuse. |
| 7 | Primary endpoint precedence already existed as a boolean rule, while the richer primary/secondary/exploratory/unknown hierarchy was absent. | `_one_study_one_vote()` and S5 schema. | Explicit primary roles lead; mixed known/unknown siblings collapse unclear, with harm tie protection retained. |
| 8 | Measurement-only and biomarker mentions are not administered intervention arms. | S3 arm contract and generic relevance tests. | Explicit nonintervention roles cannot be used as target or control. |
| 9 | Historical run `20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o` is already marked invalid. | `reports/run_statuses.json`: invalid S8 model, all studies partial, predates health axis, no anchor validation. | It cannot support product claims. |
| 10 | No corrected score is available for run `20260825_072759`. | The negative-contributor bundle contains only the affected side of the score and cannot reproduce the nonlinear composite. | The run is marked invalid for claims only; no score or delta is asserted. |
| 11 | The source bundle reconciles to 32 studies, 43 contributions, and −95.73 points. | `2026-08-25-negative-contributors.v1.json`, pinned to bundle SHA-256 `8e5529754ddaa4bea206f5377cf7a0c777054333a7fbd0a18de0152d907f1c96`. | Every source row has a durable disposition; quarantine is not reclassification to benefit. |
| 12 | Two records administered no target ingredient as an intervention. | Primary DOI/registry verification for `doi:101093geronaglaa162` and `registry:nct04048616`; the labelled ingredient was a measurement tracer. | Both are `exclude_scope`; this rule is implemented generically through arm role/presence, not by DOI or ingredient name. |

## Unresolved facts

- The 32-study roster and all 43 original contribution rows are retained in the
  machine-readable ledger. Apart from the two primary-source-verified scope
  exclusions, rows remain `quarantine_reextract` with `bundle_only` verification;
  paper-level corrected claims still require independent verification before any
  row is promoted or scored.
- The fraction of affected claims that had a valid equivalence or
  non-inferiority basis is unknown until the affected extraction envelopes are
  reviewed.
- The repair has not been validated against a fresh model extraction; doing so
  would violate the no-extraction scope of this change.
- No audit delta is a corrected score, an effect estimate, or additional evidence
  mass. It is only a diagnostic count of routing decisions.

## Deterministic repair record

The repaired path requires: (a) an administered target arm containing the target
ingredient, (b) an administered ingredient-free control arm, (c) a valid named
comparison and test provenance, and (d) a signed effect estimate or explicit
precision/equivalence basis for a nonsignificant efficacy claim. Otherwise the
claim is refused or routed to `inconclusive_unquantified` with zero signed
contribution. Safety harm remains negative and measured zero continues through
the current effect scale.
