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
One of: deficient / replete / mixed / unstated. This drives the population axis.
- "deficient" only if baseline status was measured and used for inclusion
- "replete" only if the paper states participants were sufficient
- Recruiting from a general population without measuring -> "unstated", NOT
  "replete". Not measuring is not the same as measuring and finding normal.

population_axes
Place the study population on four axes. Every axis has "unknown" — use it
rather than infer. Allowed values ONLY:

  age_band          child / adolescent / adult / older_adult / unknown
  sex               female / male / mixed / unknown
                    "mixed" only when both sexes enrolled; silence is unknown
  deficiency_status deficient / insufficient / replete / unknown
                    recruiting without measuring is unknown, NOT replete
  pregnancy         pregnant / lactating / not_pregnant / unknown
                    "not_pregnant" only when stated or all-male; silence unknown

A mean age with no range maps to the band containing the mean. A range spanning
two bands with no breakdown is "unknown".

registration_id
NCT########, ISRCTN########, ChiCTR..., CTRI/..., UMIN..., EudraCT.
Verbatim as printed. If absent, null.

KEEP THE OUTPUT SHORT. One turn. A long response is cut mid-JSON and discarded.

  arms              at most 8
  intervention_text 200 characters maximum
  evidence_spans    at most 8, each 200 characters maximum
  population_text   300 characters maximum

Never drop a required field to save room. Shorten the values, not the structure.

duration_days: convert weeks/months to days (1 week = 7, 1 month = 30). If the
intervention period and follow-up differ, use the INTERVENTION period.
