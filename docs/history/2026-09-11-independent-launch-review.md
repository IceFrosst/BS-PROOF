# Independent launch review — AI supplement wrapper

Review of branch `launch/ai-wrapper-planning` at `70a3955`. Requested by the founder after the previous session's work. This supersedes yesterday's recommended implementation order, not the founder's product decisions. Review only: no scoring constants changed, no new supplement audit, no production integration.

## Verdict

Keep the product, reject the claim that the new effect engine is scientifically validated. **Do not wire `effect.ts` into the cards yet.** Passing tests establish that invented rules execute consistently, not that the rules measure improvement to a healthy person's life.

The promising product is a fast, cited answer to: **“For my goal, what extra benefit did people like me get from this supplement, at this dose?”** A large image, simple bars, and expandable explanations can deliver that. Rebuilding meta-analysis machinery before testing that experience is the wrong launch dependency.

## What to keep

- Editable product confirmation, selected goals, background research, visible failure states.
- AI retrieval and evidence interpretation; deterministic validation and arithmetic.
- Healthy enhancement separated from insufficiency correction and disease treatment.
- Natural-unit effects, source links, population and duration, uncertainty.
- Funding as a separate disclosure, not an automatic quality penalty.
- Existing production scanner and historical pipeline unchanged during prototype work.

## Findings that block using the new engine for public claims

### 1. The methodology score is not AMSTAR-2

`effect.ts:qualityScore` awards points for Cochrane branding, registration, GRADE reporting, a named bias tool, heterogeneity reporting, publication-bias testing and size. These are not equivalent to judging whether methods were appropriate or followed. Reporting GRADE says nothing about whether its result was high or very low certainty. Size does not repair critical bias. The same review-oriented checklist is also applied to RCTs.

AMSTAR's own site explicitly states: **“AMSTAR 2 is not intended to generate an overall score.”** It assesses critical flaws rather than adding compensating points. Cochrane Chapter V identifies critical domains including search adequacy, exclusions, appropriate synthesis, and whether risk of bias influenced interpretation. Our checklist omits several of these.

Use documented domain judgments with source passages, distinguishing absent reporting, actual flaws and not-applicable items. If funding is excluded from the product's decision rule, describe that rule honestly as a custom methods assessment, not a complete AMSTAR-2 assessment. AI judgment remains involved; boolean fields do not remove it.

### 2. Overlap is not solved by a 50% cutoff

`sameEvidence` permits partial overlap below its arbitrary threshold and treats missing trial lists as no overlap. Neither establishes independence. `dedupeByOverlap` also records the maximum of containment and CCA under the field name `cca`, so its reported statistic is sometimes not CCA.

Use outcome-specific contributing trials, not all studies in a review. If overlap is unknown, say unknown. For launch, use other reviews to challenge and contextualize a selected estimate, not to manufacture a new pooled estimate. Multiple sources can inform an answer without being numerically averaged.

### 3. The pooled interval and disagreement penalty are bespoke

`combineSources` filters only on metric, not outcome, population, comparator, follow-up or effect direction. Two SMDs are not necessarily compatible. It uses a common-effect inverse-variance calculation, then manually stretches the interval to cover point estimates. This is not a validated heterogeneity adjustment. The resulting interval must not be presented as a statistically justified 95% CI. A fixed one-tier penalty is also unsupported.

Further defects: a failed quality floor falls back to the rejected source; invalid CI widths get an invented weight of 1; the first source chooses the metric; disagreement in discarded overlapping reviews disappears. No input contract establishes valid numerical domains or independence.

### 4. Effect size is not personal noticeability

The four supplement anchors in `tests/effect-grading.test.ts` are synthetic numeric fixtures, not verified clinical calibration. The creatine fixture assigns real PMIDs invented trial IDs, assumed containment and approximate SMDs. It cannot prove that one published review supersedes another or that the real effect is tier 1. Different review scopes and endpoints must be compared before interpreting the difference in estimates.

SMD is scaled by variability, not by how much someone feels. RR needs baseline risk and a time horizon to convey absolute benefit. Halving a rare event and halving a common event are not the same life improvement. GRADE's large-effect considerations do not validate our universal RR benefit tiers.

**Do not search for evidence until caffeine lands at 3.** That is target-fitting. First define the outcome and how meaningful improvement is established, then let the evidence determine the result. A clinical threshold from patients may not apply to healthy people, and a within-person responder threshold is not automatically a threshold for a between-group mean difference.

### 5. Uncertainty is being turned into zero benefit

`tierFromEstimate` returns 0 whenever an interval crosses the null, however broad the interval. An estimate compatible with both benefit and harm is inconclusive, not proof of no meaningful effect. Merely touching the null is handled differently by the strict inequalities. The module has no explicit inconclusive tier except an empty-source return.

Keep separate: measured magnitude, uncertainty about it, and whether its practical importance is known. Disagreement generally reduces confidence or requires separate findings; it does not necessarily make the biological benefit smaller.

### 6. Yesterday's funding promise is only partly implemented

The new unused module excludes funding. The displayed score still uses `ledger.ts:score` and its `allPositiveIndustryOrOneLab` cap. The prompt still asks for that combined field. Removing funding from a new type does not remove the existing penalty. Separate funding disclosure from single-group replication concerns in the live contract, prompt, arithmetic and tests together. A deterministic scan found 151 inventory entries across the three files, with zero structured `funding` fields and zero `pooled_in` fields (entries are not unique studies). Some funding is mentioned in prose; no dedicated funding disclosure surface is implemented.

## Product and contract blockers

- **Healthy scope is not enforced.** Population is prose; no eligibility gate prevents disease, pregnancy, deficiency correction or mixed populations from supplying an enhancement score. “Not deficiency-selected” is not proof everyone was replete. Preserve the distinction without assuming lab-confirmed adequacy in ordinary healthy cohorts.
- **Overall is a preference index, not efficacy.** It averages selected scored rows, defaulting to all rows, including incompatible populations. Splitting an outcome into more rows changes its weight. Recommendation: retain the overview page but show outcome answers rather than a single biological-sounding overall number. If a numeric preference summary is retained, it needs explicit semantics and eligible-outcome filtering first; this is a founder decision, not a silent UI change.
- **Personalization overclaims.** `personFit` treats missing age bounds as effectively unlimited, adds an invented five-year allowance and ignores demographic confidence. Trial mean ages cannot establish enrolled ranges. Adding a perfect third applicability term can raise the score when form/dose fit is imperfect. Recommend descriptive population match for launch, not personalized efficacy arithmetic.
- **Prompt/schema diverge.** The prompt requests study duration, population, dose, effect and deduplicated counts that the strict inventory schema does not represent. It names a repository schema without embedding it and omits some required output details. It is not ready to send verbatim without also providing the actual output contract. Schema-valid old audits do not prove prompt-valid future responses or verified sources.
- **Screen access needs a real browser gate.** The code claims all collapsed layouts fit above the fold; fixed-height frames, a large image and long population text make this unsafe to assume. Test actual row reachability and scrolling on every layout with the largest audit, not just container dimensions. No fresh browser verification was performed in this review.
- **Production flow is still missing.** The proposed module has no production consumer. Research jobs, caching/invalidation, validated outputs and errors must work before a live launch. Do not describe mock progress as live research.

## Smallest credible launch approach (recommendation, not implemented)

1. Research the selected healthy-person goal first. Keep insufficiency correction as an explicit separate outcome; never let disease evidence inflate enhancement.
2. Open a small selection of the strongest relevant reviews, assess actual methods, and look for a material update or contradictory result. Use a bounded operational budget, disclose incomplete searches, and do not promise exhaustive coverage. A source-count quota is a cost policy, not scientific sufficiency.
3. Select an appropriately scoped published estimate as the quantitative basis. Use the other strong sources as cross-checks. Preserve their separate estimates and explain material differences. If methods or disagreement cannot be resolved, return an uncertain answer, not an invented average. This uses several sources without reading every underlying trial.
4. Show the effect in natural units with comparator and duration. Give a meaningful-improvement grade only when a defensible interpretation exists for that outcome and population. Otherwise show “measured effect; practical importance uncertain,” not zero or a fabricated noticeability tier. Numeric band boundaries remain an explicit pending design decision.
5. Keep effect, certainty, applicability and funding distinct. Build the prompt/schema/UI around the same contract, with honest unavailable states.
6. Validate a narrow end-to-end slice on the three existing products, including healthy null, uncertain effect, deficiency-only benefit, overlapping reviews and inaccessible methods. Check extracted passages against the few selected sources, not every trial in the literature. Then wire the background flow and conduct a limited launch. No catalogue-wide rerun before this slice works.

## Defer / drop

**Defer:** automatic pooling of reviews, exhaustive trial overlap graphs, catalogue batch runs, detailed ethnicity personalization, four-layout polish, historical pipeline repairs unrelated to launch.

**Drop:** branding-based quality points, tuning tiers to desired supplement rankings, interpreting CI-crossing as proof of no benefit, presenting fabricated trial lists as real validation, and adding arbitrary penalties to make disagreements look conservative.

**Not a launch prerequisite:** a research-grade engine covering every outcome. Honest partial answers are a valid product state. Incorrect precise answers are not.

## Evidence and validation

Opened official methodological sources during this review (not model recollection):

- AMSTAR 2 overview and critical-domain ratings: https://amstar.ca/Amstar-2.php
- Cochrane Handbook Chapter V, especially V.4.4, V.4.7, V.4.9 and V.4.12: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-v
- Cochrane Handbook Chapter 10, especially 10.3, 10.5.2 and 10.10: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-10

These support the methodological critique; they do not validate any supplement-specific estimate. No new source-level supplement verification was performed.

### Independent code-review cross-check

A separate read-only reviewer inspected the module, ledger, UI, schema, tests and three audits. Its confirmed findings are incorporated above. I did not adopt its fixes wholesale:

- Deterministic headline arithmetic is real; the limitation is that effect categories remain AI judgments. Calling all deterministic scoring “false” is too broad.
- A CI touching/crossing zero is not automatically evidence of no benefit. I rejected the suggestion to downgrade based on prose parsing or that condition alone.
- New arbitrary certainty floors, sample-size exemptions and a minimum-like Overall would repeat the original mistake, not validate the product.
- Selecting a stronger smaller review over a larger weaker one is not inherently a bug. Neither is a narrower pooled interval inherently wrong when independence and model assumptions actually hold.
- The review's inventory denominator was incorrect; the parent recounted 151 entries, not 97. Its assertion that the quality floor is unreachable without GRADE/bias testing was also too broad; registration, RoB, heterogeneity and size points can reach it.

No reviewer recommendation authorizes a scoring change. Clinical estimates, source access and trial overlap still need appropriate validation before use.

Current baseline: 238 unit tests pass; `python3 -m pipeline.invariants` and `python3 -m pipeline.selftest` pass. Green tests do not validate clinical claims. Only review/status documentation changed in this review.
