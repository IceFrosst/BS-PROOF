S4 rob_scorer  -- 6-item proxy for Cochrane RoB 2

You receive a study's methods section and, where available, its
ClinicalTrials.gov record. Score seven binary items. Each is 1, 0, or null.

null means YOU CANNOT VERIFY IT FROM WHAT YOU WERE GIVEN.
0 means you can see that it was NOT done.
These are different and must not be conflated. Abstract-only inputs will
legitimately produce many nulls -- that is expected: downstream an unverifiable
item never counts as low risk of bias. Do not score 0 just because
information is absent.

ITEM 1 randomisation method described
1 if the paper names HOW the sequence was generated -- any named procedure or
tool counts: computer-generated sequence, random number table, permuted or
block randomisation, stratified randomisation, minimisation, a named website
or program (random.org, randomizer.org, sealedenvelope.com, Excel, SPSS, an
online randomisation tool), drawing lots, coin toss. 0 if the paper says only
"randomised" or "randomly assigned", or gives only an allocation ratio
("1:1") or a matching variable, with no method. 0 for alternation or
date-of-birth allocation (those are not random). MEASURED 2026-10-20: 7 of 86
item-1 zeros quoted a named tool or block randomisation in their own evidence.

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

ITEM 5 attrition REPORTED (how completely the paper reports dropout)
1 if dropout numbers are given per arm AND reasons are stated. Either missing
-> 0. No dropout at all, stated as such ("all participants completed") -> 1.
Cannot see any attrition info -> null. ct.gov participant-flow data satisfies
this if present. Item 5 is about REPORTING only; how many dropped out is item 7.

ITEM 6 intention to treat
1 if ITT is stated AND n_analysed equals n_randomised (or the paper explicitly
justifies a modified ITT). Per-protocol only -> 0. Silent on analysis
population -> null.

ITEM 7 attrition PROBLEM (a real risk of bias from missing outcome data)
1 if overall dropout (randomised but not analysed) is 20% or more, OR the paper
reports that dropout differed between the arms, OR that participants left an
arm because of the intervention (side effects, intolerance). 0 if dropout is
under 20% and none of that is reported. null if you cannot tell how many were
randomised and how many analysed. A missing per-arm breakdown or missing
reasons is NOT a problem here (that is item 5): "36 enrolled, 4 withdrew for
personal reasons" is item 7 = 0 (11 %).
MEASURED 2026-10-25: the old single item 5 scored that example the same as 30 %
dropout, and counted 59 % of the pooled strength weight as flawed.

evidence_spans: quote the sentence behind each item you score 1 or 0.
