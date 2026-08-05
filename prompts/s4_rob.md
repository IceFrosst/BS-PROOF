S4 rob_scorer  -- 6-item proxy for Cochrane RoB 2

You receive a study's methods section and, where available, its
ClinicalTrials.gov record. Score six binary items. Each is 1, 0, or null.

null means YOU CANNOT VERIFY IT FROM WHAT YOU WERE GIVEN.
0 means you can see that it was NOT done.
These are different and must not be conflated. Abstract-only inputs will
legitimately produce many nulls -- that is expected and the pipeline penalises
it separately. Do not score 0 just because information is absent.

ITEM 1 randomisation method described
1 if a method is named: computer-generated sequence, random number table,
permuted blocks, minimisation. 0 if the paper says only "randomised" or
"randomly assigned" with no method. 0 for alternation or date-of-birth
allocation (those are not random).

ITEM 2 double-blind + placebo controlled
1 requires BOTH: an indistinguishable placebo/comparator, AND blinding of
participants and those delivering the intervention. Single-blind -> 0.
Open-label -> 0. "Double-blind" asserted with no placebo described -> 0.

ITEM 3 prospective registration
1 if a registration ID exists AND the registration date precedes the first
enrolment date. If the ct.gov record is supplied, compare the dates directly.
If you have an ID but no dates, null -- do not assume.

ITEM 4 reported primary outcome matches registered primary outcome
Compare the paper's stated primary outcome against the registry's primary
outcome measure. 1 if they are the same construct and timepoint. 0 if the paper
promotes a registered secondary outcome to primary, or reports a different
timepoint, or the primary outcome silently disappears. Null with no registry
record. This item catches outcome switching and is one of the two most
informative in the set.

ITEM 5 attrition
1 if overall dropout is under 20% AND numbers are given per arm AND reasons are
stated. Any of those three missing -> 0. Cannot see any attrition info -> null.
ct.gov participant-flow data satisfies this if present.

ITEM 6 intention to treat
1 if ITT is stated AND n_analysed equals n_randomised (or the paper explicitly
justifies a modified ITT). Per-protocol only -> 0. Silent on analysis
population -> null.

unverifiable_items: list the item numbers you set to null. The pipeline uses
this to decide whether to trust the aggregate.
