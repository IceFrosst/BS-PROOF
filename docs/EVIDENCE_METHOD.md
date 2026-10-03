# Evidence method v2 — proposal

**Status: ADOPTED 2026-10-03 (founder), implementation in progress — Phase 1.**
Production still runs `SCORING_MODEL v14-applicability-discount`
(`docs/SPEC.md`) until Phase 4 switches it. The founder decisions are recorded
in §9.

---

## 1. Why change the method

The current pipeline (v14) has the right *architecture* — the
`(ingredient, form, dose, outcome, population)` unit, strict refusals, effect
sizes instead of vote counting, scores that always travel with their coverage —
but its *number* is not yet a valid measurement:

| Problem | Evidence |
|---|---|
| It is not a meta-analysis | Studies vote with clamped −1…+1 values averaged under hand-set quality multipliers; no pooled estimate, no confidence interval |
| Most studies still vote by label | Only ~10–16% of mapped claims reach the effect-size path |
| Confidence ignores precision | `c = 1 − e^(−E′/k)` grows with the *amount* of evidence; `k` is uncalibrated |
| Generic thresholds | 0.2 / 0.8 SMD are textbook conventions, not "what matters" for each outcome |
| Extraction is not shown to be reproducible | Re-wording one prompt field moved a score 15 points; same-input reruns never measured |
| It fails its own face-validity check | Published meta-analyses put creatine → strength at SMD 0.28–0.46 (CIs exclude 0); v14 scores it ~51 "unclear" |

The fix is to stop inventing an aggregation and use the established one.

## 2. Guiding principle

**Do what a Cochrane systematic review does, automated and per product.**

- The model only **extracts**; every extracted number is checked against its
  quoted span, and two independent extractions must agree.
- All judging uses published methods: **random-effects meta-analysis** to
  combine results, **GRADE** to rate certainty.
- The answer per outcome is: *how big is the benefit, for someone like you, at
  this dose and form — and how sure are we?*

Everything in `CLAUDE.md` still holds: the model never produces a score, `null`
is always allowed, nothing is inferred, backends are never blended, constants
are founder decisions.

## 3. The pipeline

| # | Stage | What it does | Change from v14 |
|---|---|---|---|
| 0 | **Question** | Per outcome: population, comparator (no ingredient), preferred measure, and the **meaningful-change threshold** (§5) with its source | New. Lives in `vocab/outcome.json` |
| 1 | **Retrieval** | Reviews first, then trials with the ingredient constrained to the INTERVENTION; trial registries (ClinicalTrials.gov) for registered-but-unpublished trials; a PRISMA flow (found → screened → included, with reasons) per run | Fixes the known retrieval-specificity problem; makes publication bias measurable |
| 2 | **Screening** | Keep: wrong comparator, combination product, off-target population | **Drop the "self-declared underpowered" refusal** — it compensated for vote counting; pooling already gives a tiny trial a tiny weight |
| 3 | **Extraction** | The numbers pooling needs: per-arm mean, SD and n (or the paper's own CI / SE / exact p), change-from-baseline vs final values flagged, risk-of-bias (RoB 2) items, dose, form, population — all with spans | **Dual independent extraction** (two backends act as two reviewers; disagreement → discard or human adjudication — invariant 9). A deterministic check rejects any number not present in its quoted span |
| 4 | **Effect sizes** | Hedges' g with its variance; mean difference in natural units when every included trial shares the unit. Conversions only by documented formulas (CI→SE, exact p→SE, change-score handling), each flagged | Replaces the clamped `s_i` votes |
| 5 | **Pooling** | Per outcome: REML random-effects + Hartung–Knapp CI + prediction interval (`pipeline/meta_effects.py` already implements this). Sensitivity: low-risk-of-bias only, independently funded only, leave-one-out. Form, dose, population as subgroups — or dose-response meta-regression with enough trials | Replaces the weighted label mean. Trials without usable numbers are **counted and reported**, never silently dropped or turned into votes |
| 6 | **Certainty (GRADE)** | Start High for RCTs; downgrade for risk of bias, inconsistency (I², prediction interval), imprecision (CI crosses the threshold or zero; too little information), indirectness, publication bias (funnel tests at ≥10 trials; unpublished registered trials) | Replaces `c` and `k`. **Form / dose / population mismatch become indirectness** — the established home for "evidence not about your exact product" |
| 7 | **Grade** | A letter per outcome from a fixed table of (benefit size × certainty) (§4), always shown with its parts | Replaces the 0–100 composite |
| 8 | **Validation** | Run-to-run agreement (κ for categories, ICC for numbers); benchmark against ≥10 published Cochrane / umbrella meta-analyses (our CI must overlap theirs — creatine strength first, against its 7 published pooled estimates); human spot checks; the 35 anchors in `docs/anchors.csv` | Turns "is it valid?" into a measured result |

**Why quality is no longer a weight.** In v14 a weaker study counts less through
multipliers nobody calibrated. In the standard method each study counts by its
**precision** (inverse variance); its *quality* lowers the **certainty** and is
tested in sensitivity analyses. That removes most of the uncalibrated constants
(`k`, design weights, RoB factors, OA factor) in one step.

**Units.** Pool in **standardised units (Hedges' g)** by default — supplement
trials measure the same outcome with different instruments — and in **natural
units** (mean difference) when every trial in the pool shares one. Always
*display* a natural-unit translation where one exists ("≈ +4 kg on a 1-rep
max"), because nobody feels "0.4 SD".

## 4. Letter grades

A letter is a good consumer-facing summary **if** it is derived by a fixed,
published rule from the two things that matter and always shown with them. It
answers *"is this worth taking for this outcome?"*

**Benefit size** — from the pooled estimate vs the meaningful threshold *M*:

| Category | Rule (on the pooled scale, in the good direction) |
|---|---|
| Large | point estimate ≥ 2·M, CI excludes 0 |
| Meaningful | point estimate ≥ M, CI excludes 0 |
| Small | 0 < point estimate < M, CI excludes 0 (real but below what a person notices) |
| None | CI excludes harm and the point estimate is below M — "no meaningful effect" |
| Harm | point estimate ≤ −M in the bad direction, CI excludes 0 |

(A wide CI also lowers **certainty** via imprecision. A CI too wide for ANY
row — e.g. a large point estimate whose CI crosses 0 — is **inconclusive** and
grades **I**: implemented in `pipeline/grade.py`, decided 2026-10-03 because the
rules above do not cover that region.)

**Grade table** (proposal — the founder signs off the exact cells):

| Benefit \ Certainty | High | Moderate | Low | Very low |
|---|---|---|---|---|
| Large | **A+** | **A** | **B** | **I** |
| Meaningful | **A** | **B+** | **C+** | **I** |
| Small | **C** | **C** | **C−** | **I** |
| None | **F** | **D** | **D+** | **I** |
| Harm | **F ⚠** | **F ⚠** | **D− ⚠** | **I** |

Rules that are not optional, from the invariants:

- **I = "Insufficient evidence"**, never a low letter. *Not studied* must never
  look like *studied and failed*.
- **F means "shown not to work"** (or harm, marked ⚠) — only with at least
  moderate certainty for "None".
- Grades are **per outcome**, never one grade per product (averaging unrelated
  outcomes is how a number ends up about nobody). The product view can lead with
  the outcome the label claims.
- The letter always travels with: the effect in natural units with its CI, the
  certainty with its downgrade reasons, and how well the evidence matches *your*
  form, dose and population.
- A product whose form or dose was never tested gets its letter **lowered via
  indirectness**, and says so — it is never raised by evidence about another form.

## 5. Meaningful-change thresholds (MCID)

A result can be *statistically* significant and still *useless*: a sleep aid
that shortens time-to-fall-asleep by 2 minutes, measured precisely in 5,000
people, is "significant" but nobody would notice. The **minimal clinically
important difference (MCID)** is the smallest change a person would actually
notice or care about, for that outcome, measured on that scale.

The grade needs one per outcome, because "Meaningful", "Small" and "None" are
defined against it. Today the pipeline uses one generic value for everything
(0.2 SD, Cohen's "small effect"), which is a statistical convention, not a
statement about people.

**Policy (decided 2026-10-03; the founder delegated the method, keeps the values):**

1. **Source hierarchy**, best first, recorded per outcome in `vocab/outcome.json`
   with value, scale, derivation population and citation:
   1. an **anchor-based** MCID (patients' own judgement of a noticeable change)
      from a population like the product's (healthy adults for most supplements);
   2. an anchor-based MCID from a different population — allowed only to make a
      grade *stricter*, never more generous;
   3. a **distribution-based** value (e.g. 0.5 SD of the outcome, or the
      measurement's standard error) — labelled as such;
   4. none found → **0.2 SD**, flagged in the output as "statistical
      convention, no published MCID".
2. **Every source is opened and quoted** (no recalled numbers — invariant 5).
3. **Sensitivity is reported.** Each grade is recomputed at half and double the
   threshold; a grade that changes is shown as threshold-sensitive.
4. **The values are constants** (invariant 4): they are proposed as a table with
   citations and enter scoring only after the founder approves that table.

## 6. The Evidence Ledger audits

`/scan` currently shows a detailed "Evidence Ledger" card for exactly **three
products**: creatine monohydrate 4 g/day, vitamin D3 2000 IU/day, magnesium
glycinate 300 mg/day. These were researched on 2026-09-11 by an AI with live web
access, stored as JSON in `lib/evidence-ledger/audits/`, and scored with a
heuristic rubric (Effect −3…+3, Certainty 0–4, Form 0–4, Dose 0–4). They are
marked "not reverified" and the rubric is unvalidated
(`docs/SYSTEM_DESIGN.md` §10, §12).

The ledger is, in effect, **GRADE done from memory by a model**; this method
computes the same dimensions from extracted data. Once the method covers those
three products the ledger is redundant. Options:

1. **Keep** the three audits on `/scan` until the new method has graded those
   ingredients, then retire them (recommended).
2. **Retire now** — `/scan` shows nothing numeric until v2 grades exist.
3. **Migrate** — keep the ledger UI but feed it v2 data. Not recommended: two
   presentations of one method is the drift this repo keeps cleaning up.

Vitamin D and magnesium have **no evidence run yet**, so option 1 requires
running those ingredients through the pipeline (Phase 4).

## 7. What stays, what goes

| Stays | Goes (after the switch) |
|---|---|
| ECU unit; retrieval, dedup, SR handling; RoB items; comparator / combination / population refusals; "model knowledge never becomes a measurement"; every result with its coverage; versioned method; founder-owned constants | The clamped label votes (`S_VALUE`), quality-as-weight multipliers, `c = 1−e^(−E′/k)`, `H` as variance of votes, the 0–100 composite and its bands, the underpowered refusal, the Evidence Ledger rubric |

v14 is archived, not deleted (`scripts/archive_reports.py`), so old runs stay
readable and the change can be compared run for run.

## 8. Phases

| Phase | Goal | Model calls | Exit criterion |
|---|---|---|---|
| **1. Measure** — DONE (1b result in the measurements note: methods facts stable, endpoint selection is not) (`docs/history/2026-10-03-phase1-measurements.md`) | (a) extraction stability: the same 20–30 cached creatine studies extracted twice, agreement measured; (b) poolability: share of creatine trials whose papers yield mean/SD/n, CI or exact p | (a) yes, solo; (b) none | Two numbers we can plan on |
| **2. Shadow** — DONE: span check (`pipeline/span_check.py`), effect sizes (`pipeline/effect_size.py`), table route on by default, arm-level facts kept in run records, `max_turns` fix (schema headroom), shadow pooling (`pipeline/pool.py`), second reviewer + disagreement rule (`pipeline/review.py`, S5R, off by default: `SP_SECOND_REVIEWER=1`), crossover trials (Cochrane §23.2.6). PENDING: S5 claim rule fix (endpoint stability, Phase 1b result), then (quota) creatine re-extraction with the reviewer on, benchmark | Extended extraction (arm-level numbers + span check), dual extraction, effect sizes, pooling — run **beside** v14 on creatine | Yes (re-extraction under a new `PROMPT_VERSION`) | Pooled creatine-strength estimate overlaps the 7 published CIs |
| **3. Certainty & grades** — GRADE + letter table DONE in shadow (`pipeline/grade.py`), dose indirectness, registry search (`pipeline/registry_bias.py`, reported), MCID table PROPOSED in `vocab/outcome.json` (unapproved). PENDING: founder sign-off (`docs/REVIEW_PENDING.md` #0) | MCID table with sources; GRADE module; letter table; registry search for unpublished trials | Research only | Founder sign-off on MCIDs and the grade table |
| **4. Switch** — app path BUILT (run stage, artifact block, `lib/analyze/grade-v2.ts`, `/scan` grade card); PENDING: a retained run with the block, benchmark, Ledger retirement | `/runs` and `/scan` show v2 grades; vitamin D and magnesium run; v14 archived; Evidence Ledger retired | Yes | Benchmark on ≥10 published meta-analyses passes |

## 9. Founder decisions (2026-10-03)

1. **Adopted** as the successor to v14.
2. **Letter grades, with the §4 table as written.**
3. **MCIDs:** method delegated — the policy in §5. The values need founder
   approval as a table before they score anything (approved: item 7).
4. **Evidence Ledger: keep-then-retire** (§6 option 1).
5. **Second reviewer: a second Claude model for now** (a different model from
   the primary extractor). **Future work:** replace it with a reviewer from a
   different vendor (e.g. Grok), because two models from one family share
   blind spots and are not truly independent reviewers.
6. **Next ingredient after creatine: vitamin C.** Vitamin D and magnesium are
   still needed before the Evidence Ledger can retire (§6).
7. **(later 2026-10-03)** GRADE thresholds, the two policy choices and the
   MCID table accepted "for now, may revisit"; reviewer = Opus with a 1 %
   agreement tolerance; registry rule: −1 publication bias when registered,
   unpublished trials ≥ trials pooled. Details: `docs/REVIEW_PENDING.md` #0.
   Dose indirectness: off-dose only under half or over double the trial dose.

## 10. Risks

- **Data availability.** Supplement trials often report only p-values, change
  scores or figures. Phase 1(b) measures this first; if poolable data is scarce,
  the method leans on documented reconstruction formulas and on systematic
  reviews' tables (invariant 6 still applies: a pooled estimate is never pushed
  back onto individual trials).
- **Small pools.** ECU fragmentation leaves 2–5 trials per cell. Pool per
  outcome across forms and treat form, dose and population as subgroups /
  indirectness, not separate pools.
- **Cost and time.** Dual extraction roughly doubles calls; on a subscription
  that is time, not money, and extractions must still run solo.
