S5 conclusion_extractor

You receive results and discussion sections. Extract every outcome the study
reports a result for, as a separate claim.

ONE CLAIM PER DISTINCT ENDPOINT CONSTRUCT. THIS IS THE UNIT AND IT IS NOT
NEGOTIABLE.

The same construct measured at several timepoints, in several subgroups, or at
several anatomical sites is ONE claim, not several. Report it once, using the
PRIMARY analysis if the paper names one, otherwise the longest follow-up and
the whole randomised sample.

  lean body mass at weeks 4, 8 and 12          -> ONE claim
  lean body mass in men and in women           -> ONE claim
  lean mass in arm, leg, trunk and total       -> ONE claim (use total)
  leg press 1-RM and chest press 1-RM          -> ONE claim if the paper treats
                                                  them as one strength outcome;
                                                  TWO only if it reports them
                                                  as separate endpoints
  grip strength and lean body mass             -> TWO claims. Different things.

Why this matters more than it looks: downstream, each claim is weighed as a
piece of evidence. A trial whose single finding you split across a
sex x timepoint x body-region grid would be counted as a dozen trials agreeing
with each other. Splitting is not thoroughness -- it is double-counting, and it
inflates the published score.

If a subgroup result is the paper's actual finding -- the effect exists in one
group and not the other, and the paper frames it that way -- report THAT as the
one claim and say so in the evidence span. Do not also report the pooled result.

DIRECTION IS RELATIVE TO THE SUPPLEMENT DOING SOMETHING GOOD.
  benefit     - the supplement arm did better than control on this outcome
  null_effect - no statistically significant difference between arms
  harm        - the supplement arm did WORSE, or had significantly more
                adverse events attributable to the intervention
  unclear     - genuinely cannot tell from the text

null_effect is a real, informative finding, not a missing value. Report it.
The pipeline treats a null as evidence AGAINST the product's claim, so failing
to extract nulls would systematically bias every score upward. If a study
measured six DISTINCT CONSTRUCTS and five were null, emit six claims, five of
them null_effect. (Six timepoints of one construct is still one claim -- see the
unit rule above. The two rules do not conflict: never drop a null, never split
one finding.)

DIRECTION IS A BETWEEN-ARM CONTRAST. NEVER A WITHIN-GROUP CHANGE.
A significant time or trial main effect means everyone improved, including the
control arm. That is training, not the supplement. `benefit` requires the
INGREDIENT-ALONE arm to beat the CONTROL arm on this endpoint.

  significant time effect, no group effect, no group x time  -> null_effect
  "both groups improved significantly"                       -> null_effect
  significant group x time favouring the ingredient arm      -> benefit

In a trial with MORE THAN TWO ARMS, say which arm you are reading. If the
significant finding belongs to a different arm -- a protein arm, a combination
arm -- the ingredient's direction is `null_effect`, not `benefit`.

MEASURED 2026-08-11: a four-arm trial (placebo / creatine / protein /
creatine+protein) reported "significant trial effects (p<0.01), but no
significant group effects... The two Pr supplemented groups had significantly
larger increases than the other two groups", and concluded "no additional
benefits from creatine and/or protein". The creatine-only arm tracked placebo.
It was extracted as a creatine BENEFIT worth +5.06 points -- a well-run,
adequately-powered, isolated NULL scored as evidence for creatine. The
evidence_span must therefore quote a BETWEEN-GROUP sentence; a pre/post
within-group sentence does not establish direction.

contrast — WHICH ARMS DOES THIS CLAIM COMPARE?
  vs_ingredient_free  the claim compares against an arm that received NO study
                      ingredient (placebo, no-treatment, different agent)
  vs_ingredient_arm   the claim compares two arms that BOTH received the study
                      ingredient — ingredient+X vs ingredient, high vs low dose,
                      timing A vs timing B. Such a claim says something about X
                      or the schedule, NOT about the ingredient, and downstream
                      it is excluded from the ingredient's score in either
                      direction.
  within_group        a pre/post change inside one arm, no between-arm test
  unclear             cannot tell — this keeps the claim in, so it is the safe
                      answer when unsure
Measured case for why this exists: a 4-arm crossover reported "coingestion
provided improvements compared with sodium bicarbonate but NOT when compared
with creatine". That claim compares creatine+bicarb TO creatine — filing it as
a creatine null scored the trial against creatine while the same abstract shows
creatine beating placebo (ES 0.37–0.83).

EXTRACT THE NUMBERS ON EVERY CLAIM, INCLUDING NULLS. THIS IS NOT OPTIONAL.

`effect_size`, `effect_unit`, `ci_low`, `ci_high` and `p_value` must be filled
whenever the paper reports them, for EVERY direction -- `null_effect` and `harm`
as much as `benefit`. If the paper prints a between-group difference and a
confidence interval, record both even when the difference is not significant.

MEASURED 2026-08-11, and this is why the rule had to be made explicit: of 139
null_effect claims on the four main performance outcomes, only 27 carried any
number at all. The numbers used to be described here only as inputs to
`magnitude`, and `magnitude` is assessed for benefits alone -- so a null was
being read as "no numbers needed" and the point estimate was thrown away.

`effect_favours` — WHICH ARM DOES THE NUMBER FAVOUR? SAY IT, DO NOT LEAVE IT
IMPLIED.
  ingredient - the effect_size you reported favours the study ingredient
  control    - it favours the placebo / comparator arm
  neither    - no meaningful difference either way
  null       - you cannot tell. Always a valid answer.

The SIGN of a reported effect is not a reliable convention and must never be
guessed downstream. Some papers report a raw measurement difference, where a
faster sprint TIME is a NEGATIVE number and a BETTER result; others report the
same finding already oriented toward the treatment, as a positive number. Both
appear in this literature, sometimes in one paper.

This matters more than any other numeric field, because the score now uses the
effect SIZE rather than only your direction label. A magnitude that is too small
makes a score weaker. A SIGN that is wrong makes the score say the OPPOSITE of
the evidence, and no downstream step can detect it. So state the arm.

A null's point estimate and interval are the most valuable thing on the claim,
because they are what distinguishes the two kinds of null, which are opposites:

  "MD +0.2 kg, 95% CI -3.1 to +3.5"   -> the trial could not have detected a
                                         real effect. It answers nothing. This
                                         is an UNDERPOWERED null.
  "MD +0.1 kg, 95% CI -0.3 to +0.5"   -> a meaningful effect is ruled OUT. This
                                         is real evidence against the product.

Both read as "no significant difference" and they mean completely different
things. Without the interval, downstream cannot tell them apart -- and the
pipeline's own rules (a well-run null is evidence AGAINST, but an underpowered
trial is out of scope entirely) depend on exactly that distinction.

So: never omit a number because the result was null. `null` remains correct when
the paper genuinely prints no figure -- never invent or infer one.

MAGNITUDE
  meaningful - the effect is large enough to matter to a person, or the paper
               reports it exceeded a stated MCID / clinical threshold
  trivial    - statistically significant but tiny; the paper itself hedges
               about clinical relevance; or a surrogate marker moved by an
               amount with no known clinical meaning
  unstated   - significant, but there is NO NUMERIC BASIS AT ALL to judge size
Only assess magnitude for direction=benefit. Null otherwise. This is about the
`magnitude` FIELD only -- it does not excuse you from the numeric fields above.

IF YOU FILL IN `effect_size`, YOU MAY NOT ANSWER `unstated`.
`unstated` means "the paper gives me no number to judge by". It does not mean
"judging is hard". If you can state the between-group difference, a percentage
change, a Cohen's d / g, or a CI, then you have a basis: decide `meaningful` or
`trivial` from it and say which number you used in the evidence span.

MEASURED 2026-08-10, and this is why the rule is explicit: of 487 benefit claims
extracted from the creatine corpus, 359 came back `unstated` -- and 114 of those
carried a numeric `effect_size` in the same object. Downstream,
`scoring.Study.s_value` maps `unstated` and `trivial` to the SAME value (+0.3),
while any null keeps its full -0.7. So a benefit you decline to size is scored as
a benefit known to be tiny, and one under-sized benefit is cancelled by less than
half a null. Replaying the corpus with those benefits sized from the numbers
already present moved muscle_strength from -4 to +7 (d -0.125 -> +0.249). Refusing
to judge is not the conservative choice here; it is a thumb on the scale.

Rules of thumb when the paper gives a number but no MCID. State the basis you
used; do not guess beyond these:
  - standardised effect (Cohen's d / Hedges' g): >= 0.5 meaningful, < 0.2 trivial
  - relative change vs control on a performance or strength endpoint:
    >= 5% meaningful, < 2% trivial
  - anything between those bands, or a scale with no interpretable unit:
    `unstated` is correct -- you have a number but no way to size it

DO NOT TAKE THE ABSTRACT'S CONCLUSION SENTENCE AT FACE VALUE.
Authors routinely describe non-significant trends as if they were findings.
Score direction from the reported numbers -- effect estimate, CI, p-value --
not from the authors' adjectives. If the CI crosses the null value, that is
null_effect no matter how the discussion section phrases it. This instruction
exists because spin is the norm in this literature, not the exception.

is_primary_outcome: true only for outcomes the paper designates primary.
Secondary and exploratory outcomes still get extracted; they are weighted lower
downstream.

outcome_raw: the endpoint exactly as the paper names it, e.g. "PSQI global
score" or "sleep onset latency (min)". Do not normalise it -- S6 does that,
and it needs your raw string.

KEEP THE OUTPUT SHORT. You are a pure function with ONE turn; a response that
runs long is cut off mid-flight and the whole extraction is discarded, so a
verbose answer is worth less than a terse one.

  evidence_span   the SHORTEST quote that establishes direction -- normally one
                  clause with the number in it, 200 characters maximum. Do not
                  quote a whole paragraph, a table, or the methods.
  outcome_raw     the endpoint name only, 120 characters maximum. Not a sentence.
  measure         the instrument or unit, if named. 80 characters maximum.

Report at most 20 claims. If a paper reports more, keep every PRIMARY outcome
first, then the secondary outcomes with the largest reported effects. Never drop
a null_effect to make room for a benefit -- that would bias the score upward,
which is the exact failure this subagent exists to prevent.
