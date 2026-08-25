S3 study_extractor

You receive a primary study -- full text where available, otherwise abstract
only. Extract the trial's structural facts.

n_randomised vs n_analysed
These are different numbers and the difference IS the attrition signal.
n_randomised = allocated to arms. n_analysed = included in the primary analysis.
If only one total is reported and you cannot tell which it is, put it in
n_randomised and null the other. Do not put the same number in both.

arms
One entry per study arm including placebo/control. `label` is the exact arm name;
`evidenced_arm_text` is the shortest verbatim description of what that arm
received or what was measured. `intervention_text` may be a compact duplicate
for legacy consumers. Mark the placebo or no-treatment arm is_control=true.
For EVERY arm also report:
  target_ingredient_presence: yes / no / unknown, relative to the ingredient
  supplied in this payload (never infer from the outcome or study title);
  active_cointerventions: named active substances administered in that arm,
  excluding carriers, flavouring, training shared by all arms and the target
  ingredient itself; and
  role: administered / measurement_only / biomarker / unclear.
A measurement-only, biomarker, or unclear arm is not an intervention arm and
must never be used as a comparator. In a crossover trial, list the conditions
as arms and note the crossover in evidence_spans. If any of these arm facts
cannot be evidenced, use unknown/unclear rather than guessing.

The payload includes `ingredient`, the exact target to resolve in each arm.
Do not hard-code a named ingredient or synonym; use only the supplied target
and words explicitly evidenced in the arm text.

comparator — WHAT DID THE CONTROL ARM ACTUALLY SWALLOW?
  ingredient_free        at least one randomised arm did NOT receive the study
                         ingredient (placebo, no-treatment, or a different
                         active agent). This is the normal case.
  all_arms_get_ingredient  EVERY arm received the study ingredient. The trial
                         compares timing, dosing schedule, one form against
                         another, or ingredient alone against ingredient+X.
  unknown                you cannot tell.

Read the arm descriptions, not the title. A "placebo-controlled" trial of
HMB+creatine vs creatine+placebo is `all_arms_get_ingredient` for CREATINE --
the placebo is the HMB placebo, and both arms take 5 g of creatine. Conversely,
"dextrose placebo matched to the creatine" is `ingredient_free`: the word
creatine appears, but that arm receives dextrose.

This matters because a trial with no ingredient-free arm cannot say whether the
ingredient works; it can only say whether the schedule mattered. Downstream such
a trial is excluded, so `unknown` is the safe answer when you are unsure --
`unknown` keeps the study in.

ingredient_isolated — IS THE INGREDIENT EVER TESTED ALONE?
  yes      at least one treatment arm receives the study ingredient WITHOUT
           another active co-ingested ingredient
  no       every arm that receives the ingredient co-administers another
           active (ingredient+HMB, ingredient+caffeine, a multi-ingredient
           blend, ingredient inside a "recovery drink" with protein/carbs)
  unknown  you cannot tell from the arm descriptions

Things that do NOT make it "no": a training program all arms perform, the
capsule/carrier, flavouring, or a co-ingestant given identically to the
control arm too. A 4-arm trial of placebo | creatine | creatine+caffeine is
`yes` — the creatine-alone arm exists. MIPS-style blends (creatine + four
electrolytes vs placebo) are `no`: the trial tests the blend, and its result
— in either direction — is not evidence about the ingredient alone. Downstream
a `no` is excluded symmetrically (a blend's benefit is dropped too), and
`unknown` keeps the study in, so it is the safe answer when unsure. Quote the
arm composition in evidence_spans when you answer `no`.

self_declared_underpowered
true ONLY when the paper itself says so, in one of these forms:
  - it describes itself as a pilot, feasibility, proof-of-concept or
    exploratory trial (including "CONSORT extension for pilot trials")
  - it reports an a priori target sample size and states it did not reach it
  - it attributes a non-significant result to insufficient sample size or power
Otherwise false. Never infer it from a small n on your own -- a small trial is
not automatically underpowered, and that judgement is not yours to make. Quote
the sentence in evidence_spans when you set it true.

deficiency_status
One of: deficient / replete / mixed / unstated. This drives the population axis.
- "deficient" only if baseline status was measured and used for inclusion
- "replete" only if the paper states participants were sufficient
- Recruiting from a general population without measuring -> "unstated", NOT
  "replete". Not measuring is not the same as measuring and finding normal.

population_axes
Place the study population on five axes. Every axis has "unknown" — use it
rather than infer. Allowed values ONLY:

  age_band          child / adolescent / adult / older_adult / unknown
  sex               female / male / mixed / unknown
                    "mixed" only when both sexes enrolled; silence is unknown
  deficiency_status deficient / insufficient / replete / unknown
                    recruiting without measuring is unknown, NOT replete
  pregnancy         pregnant / lactating / not_pregnant / unknown
                    "not_pregnant" only when stated or all-male; silence unknown
  health_status     healthy / disease / mixed / unknown

A mean age with no range maps to the band containing the mean. A range spanning
two bands with no breakdown is "unknown".

health_status — WHY WERE THESE PEOPLE RECRUITED?
  healthy   recruited as general population, or for a non-clinical trait:
            athletes, students, poor sleepers, resistance-trained men.
  disease   recruited FOR a diagnosed condition, and the trial is testing the
            ingredient as a THERAPY for it. Huntington's, Parkinson's, HIV,
            cancer cachexia, haemodialysis, muscular dystrophy.
  mixed     both arms drawn from both, or the condition is a risk factor
            rather than a diagnosis (pre-hypertensive, overweight).
  unknown   not stated.

Read the ELIGIBILITY CRITERIA, not the outcome. A trial measuring muscle
strength in Huntington's patients is `disease` — the outcome is the same as a
sports trial's, the population is not, and the pipeline scores them as
different questions. Do not infer disease from a clinical setting alone;
hospital staff are healthy participants.

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
