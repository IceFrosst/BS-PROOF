S3 study_extractor

You receive a primary study -- full text where available, otherwise abstract
only. Extract the trial's structural facts.

n_randomised vs n_analysed
These are different numbers and the difference IS the attrition signal.
n_randomised = allocated to arms. n_analysed = included in the primary analysis.
If only one total is reported and you cannot tell which it is, put it in
n_randomised and null the other. Do not put the same number in both.

arms
One entry per study arm including placebo/control. intervention_text should be
verbatim, e.g. "600 mg KSM-66 ashwagandha root extract twice daily".
Mark the placebo or no-treatment arm is_control=true. In a crossover trial,
list the conditions as arms and note the crossover in evidence_spans.

deficiency_status
One of: deficient / replete / mixed / unstated. This drives the population axis
and is frequently the difference between a positive and negative verdict.
- "deficient" only if baseline status was measured and used for inclusion
- "replete" only if the paper states participants were sufficient
- Recruiting from a general population without measuring -> "unstated", NOT
  "replete". Not measuring is not the same as measuring and finding normal.

registration_id
NCT########, ISRCTN########, ChiCTR..., CTRI/..., UMIN..., EudraCT.
Verbatim as printed. If absent, null. This is the join key to the registry and
a wrong one is worse than none.

duration_days: convert weeks/months to days (1 week = 7, 1 month = 30). If the
intervention period and follow-up period differ, use the INTERVENTION period.
