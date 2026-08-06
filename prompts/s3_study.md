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

population_axes
You also receive the population vocabulary. Place the study population on its
four axes. Every axis has an "unknown" member and you must use it rather than
infer -- an unknown is handled by the pipeline, a guess silently files evidence
about one population under a claim about another.

  age_band          child (<12) / adolescent (12-17) / adult (18-64) /
                    older_adult (65+) / unknown
  sex               female / male / mixed / unknown
                    Use "mixed" only when both sexes were enrolled. A study that
                    does not report sex is "unknown", not "mixed".
  deficiency_status deficient / insufficient / replete / unknown
                    Same rule as deficiency_status above: recruiting without
                    measuring is "unknown", NOT "replete".
  pregnancy         pregnant / lactating / not_pregnant / unknown
                    "not_pregnant" only when stated or structurally impossible
                    (an all-male population). Silence is "unknown".

A mean age with no range maps to the band containing the mean. A range spanning
two bands with no breakdown is "unknown" -- do not pick the wider one.

registration_id
NCT########, ISRCTN########, ChiCTR..., CTRI/..., UMIN..., EudraCT.
Verbatim as printed. If absent, null. This is the join key to the registry and
a wrong one is worse than none.

duration_days: convert weeks/months to days (1 week = 7, 1 month = 30). If the
intervention period and follow-up period differ, use the INTERVENTION period.
