"""
Deterministic scoring. No model may enter this file.
Implements SPEC.md sections 7-9.

2026-08-05 audit fixes (pending Claude review — see REVIEW.md):
- Band assignment uses inclusive SPEC ranges; -70 is strong-against, not "does not work".
- Benefit with magnitude None/"unstated" scores as trivial (0.3), not meaningful.
- pop_match defaults to "different" (pessimistic), matching form's unspecified policy.

2026-08-07 founder decision (pending Claude review):
- Form is NO LONGER multiplied into the center score weight.
- Center score = form-agnostic science ("Does it work?").
- Form applicability lives only on the form arc of the 3-arc donut
  (share of exact-form evidence). Different-form studies still contribute
  to the science score; the form arc shows how transferable that is.
- Dose and population factors remain in the weight for now.
"""
from __future__ import annotations
import math
import re
from dataclasses import dataclass, field

DESIGN_W = {4:1.00, 5:0.55, 6:0.30, 7:0.18, 8:0.12, 9:0.07,
            10:0.03, 11:0.015, 12:0.004, 13:0.0015, 14:0.00}

ROB_FACTOR = {"low":1.00, "some_concerns":0.60, "high":0.25}
FUNDING_FACTOR = {"independent":1.00, "industry_other":0.90,
                  "undisclosed":0.80, "brand_funded":0.60}
# Kept for form_mix reporting and the form arc — NOT applied in weight().
FORM_FACTOR = {"exact":1.00, "salt_family":0.50, "different":0.15, "unspecified":0.30}
DOSE_FACTOR = {"in_band":1.00, "low_50_99":0.45, "below_50":0.10, "above_200":0.60}
POP_FACTOR  = {"exact":1.00, "adjacent":0.70, "different":0.35}
OA_FACTOR   = {"full_text":1.00, "sr_table":0.85, "abstract_only":0.55}

# FOUNDER DECISION 2026-08-11: null_effect -0.7 -> -0.35, from the sweep in
# scripts/penalty_experiment.py. Reasoning recorded because the value is a guess
# either way: -0.7 priced a well-run null at 70% of documented HARM, and "we
# looked and found no effect" is genuinely weaker evidence against a product than
# "we found damage". -0.35 halves that while keeping the system able to return a
# negative verdict -- the fixture that decided it is a synthetic product with 20
# clean unanimous nulls, which still lands at -35 ("weak evidence against") where
# null_effect=0.0 put it at exactly 0 ("inconclusive"), i.e. indistinguishable
# from never having been studied. A tool that cannot say no is not measuring.
#
# NOT chosen to make an anchor pass, and it does not: the same sweep shows anchor
# #1's +80 floor tolerates 8.6% nulls at -0.7 and only 11.7% at -0.35, while
# removing the penalty ENTIRELY reaches just 20%. No value of this constant makes
# those bands reachable -- which is the answer to REVIEW_PENDING open item 3: the
# bands are what is wrong, not this number.
#
# harm stays at -1.0. It is a SAFETY signal; a supplement that hurt people must
# never score like one that merely did nothing.
S_VALUE = {"benefit_meaningful":1.0, "benefit_trivial":0.3,
           "null_effect":-0.35, "harm":-1.0}

# ---------------------------------------------------------------------------
# EFFECT-SIZE s_value. FOUNDER DECISION 2026-08-11 ("do i"), replacing the
# vote-counting rule above wherever a usable number exists.
#
# WHY. The S_VALUE table maps a DIRECTION LABEL to a number, so the effect size
# we extract is discarded before it reaches the score. Counting how many trials
# individually cleared p<0.05 is VOTE COUNTING, whose power falls toward zero as
# the trials shrink -- the failure meta-analysis exists to fix, and supplement
# literature is exactly that small-trial regime. Measured 2026-08-11: 24 of 27
# null_effect claims carrying a usable number had a point estimate FAVOURING the
# supplement, each scored -0.35, while 7 published pooled estimates on the same
# outcome favour it with CIs excluding zero and our pipeline returned -15.
# Full evidence: scripts/vote_counting_investigation.py.
#
# THE SCALE IS RECENTRED ON THE MEANINGFUL THRESHOLD, NOT ON ZERO, and that is
# the whole design. The product's claim is not "the effect differs from zero", it
# is "the effect is big enough to matter to you". So s measures evidence for or
# against a MEANINGFUL effect:
#
#     s = clamp((effect - MID) / (FULL - MID), -1, +1)
#
# Recentring is what preserves invariant 7 instead of destroying it. Centring on
# zero would give a well-powered trial that measured a true zero effect s = 0 --
# "inconclusive", indistinguishable from never studied, which is precisely what
# the founder rejected when choosing -0.35 over 0.0. Recentred, a measured-zero
# effect scores (0 - 0.2)/0.6 = -0.333, within rounding of the -0.35 chosen for a
# well-run null, and a clear harm of -0.5 SMD clamps to -1.0, exactly the harm
# value. So this DERIVES both founder constants from first principles rather than
# asserting them -- while a "null" that actually measured +0.43 moves from -0.35
# to +0.383, which is the defect being fixed.
#
# All four values are FOUNDER-OWNED (invariant 4, SPEC 13). They are not free
# parameters: MID and the two 'meaningful' anchors are read off the thresholds
# already in prompts/s5_conclusion.md, so the continuous scale agrees with the
# discrete labels the same prompt produces.
EFFECT_MID_SMD = 0.20   # prompts/s5_conclusion.md: "< 0.2 trivial". Below this an
                        # effect is not worth buying, so it is evidence AGAINST.
EFFECT_FULL_SMD = 0.80  # Cohen's "large". Cohen himself disclaimed these bands;
                        # 0.8 is chosen over 0.5 so that the prompt's own
                        # "meaningful" floor (0.5) lands mid-scale at +0.50
                        # rather than saturating at +1.0 the moment it qualifies.
EFFECT_MID_PCT = 2.0    # prompts/s5_conclusion.md: "< 2% trivial"
EFFECT_FULL_PCT = 8.0   # set so 5% ("meaningful" in the same prompt) maps to
                        # +0.50, identical to where 0.5 SMD lands. The two
                        # families therefore agree at their shared anchors.

# Unit strings whose effect is NOT a between-arm contrast, or cannot be signed.
# Each entry is a substring test on the lowercased unit, and each is a REFUSAL --
# the claim falls back to its direction label rather than being standardised.
# Refusing is not conservatism for its own sake: a misread sign does not weaken a
# score, it inverts it, and no downstream step can detect that.
#
# Measured on the 149-study creatine corpus (243 sized claims, 66 distinct unit
# strings), these are the traps that actually occur:
_WITHIN_GROUP = (
    "vs baseline",      # 10 claims: "% change vs baseline" is a PRE/POST change
    "within-group",     #  3 claims: "cohen's d (within-group crm)"
    "within group",
    "from baseline",
    "post vs",          #  4 claims: "kg cr post vs 13.5 kg placebo post" -- raw
                        #  arm values, not an effect at all
)
# Variance-explained measures. Always positive, so they cannot supply a
# direction; 26 claims. Deliberately NOT rescued by taking the sign from the
# direction label, because for a `null_effect` claim that would reintroduce the
# exact vote-counting error this change exists to remove.
_UNSIGNED = ("eta-squared", "eta squared", "eta2", "r-squared", "r2")
# Null value is 1.0, not 0.0 -- 5 claims (or, rr, relative risk). Treating 1.05
# as a positive effect on a zero-centred scale is a sign error waiting to happen.
_RATIO_PHRASES = ("relative risk", "odds ratio", "risk ratio", "hazard ratio")
_RATIO_TOKENS = {"or", "rr", "hr", "hazard"}
# Substring tests are safe for these because each is a distinctive word.
_STANDARDISED = ("cohen", "hedge", "glass", "smd", "standardised", "standardized")
# Token tests, NOT substrings. "es" as a substring matches inside ordinary words
# and "d"/"g"/"r" match almost anything, so these must be whole tokens.
_STANDARDISED_TOKENS = {"d", "g", "es", "smd"}
_PERCENT = ("%", "percent")
# ABSOLUTE percentage differences masquerading as relative ones. "percentage
# points" and "% CID" (cumulative incidence difference) are differences in a RATE
# on a 0-100 scale, not a relative change against control. Measured: values of
# 53, 74.2 and 82 appear under these labels, and running 74.2 through a rule
# where 5% is "meaningful" inflates it ~15x and saturates s at +1.0 on what may
# be a modest absolute difference. Refused rather than rescaled, because the
# correct denominator is not recoverable from the unit string.
_ABSOLUTE_PCT = ("percentage point", "cid", "absolute risk", "risk difference")
_NO_UNIT = {"", "none", "n/a", "na", "unknown", "unitless"}


def standardise_effect(value: float | None, unit: str | None) -> tuple[float | None, str]:
    """
    A reported effect -> s in [-1, +1], or (None, reason) if it cannot be trusted.

    PURE and vocab-free by design: this module has no project imports (checked by
    pipeline.invariants), so it cannot know an outcome's polarity. The caller
    must hand in a value already oriented so that POSITIVE means "good for the
    product" -- `assemble` does that, because it is the layer that knows the
    outcome. Getting that wrong inverts a score, so the contract is stated here
    and pinned in selftest.

    Returns (s, route) where route is one of: "smd", "percent", or a refusal
    reason. The route is recorded on every study so a run can be audited for how
    much of its score came from measured effects versus from labels.
    """
    if value is None:
        return None, "no_effect_size"
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None, "unparseable_effect_size"
    u = (unit or "").strip().lower()
    if u in _NO_UNIT:
        return None, "no_unit"          # a bare number could be kg or an SMD
    tokens = set(re.findall(r"[a-z]+", u))
    # Order matters. The within-group and unsigned refusals must run BEFORE any
    # family match, because "% change vs baseline" and "cohen's d (within-group)"
    # would otherwise be accepted by the percent and SMD branches respectively.
    if any(bad in u for bad in _WITHIN_GROUP):
        return None, "within_group_not_between_arm"
    if any(bad in u for bad in _UNSIGNED):
        return None, "unsigned_variance_explained"
    if tokens & _RATIO_TOKENS or any(p in u for p in _RATIO_PHRASES):
        return None, "ratio_null_is_one"
    if any(p in u for p in _ABSOLUTE_PCT):
        return None, "absolute_percentage_difference"
    if any(p in u for p in _PERCENT):
        return _rescale(v, EFFECT_MID_PCT, EFFECT_FULL_PCT), "percent"
    if any(p in u for p in _STANDARDISED) or (tokens & _STANDARDISED_TOKENS):
        return _rescale(v, EFFECT_MID_SMD, EFFECT_FULL_SMD), "smd"
    return None, "raw_unit_needs_sd"    # kg, W, points, s, umol/L: not
                                        # standardisable without an SD we never
                                        # extract. 50 claims. Falls back to label.


def _rescale(v: float, mid: float, full: float) -> float:
    """Recentre on `mid` and clamp. `full - mid` is never 0 for shipped values."""
    return max(-1.0, min(1.0, (v - mid) / (full - mid)))

K = 1.5                 # confidence saturation. FOUNDER DECISION 2026-08-11
                        # ("do k1.5 for now"), from the printed K A/B: at K=3.0
                        # the ECU granularity fragments 143 studies into cells
                        # of 4-17 while c=0.8 needed ~51 studies/cell, so
                        # confidence -- not evidence -- capped every score.
                        # Still awaiting external Tier-3 calibration.
LAMBDA = 0.3            # synthesis multiplier ceiling
H_PENALTY = 0.4

# Divisor that maps weighted variance of s_i onto 0..1 before H_PENALTY applies.
# Named 2026-08-10, value unchanged: it was a bare `H / 1.5` inside score_ecu, and
# pipeline.calibration.feasibility now needs the same number to compute what an
# anchor band can reach. Two copies of an unnamed 1.5 is how the two disagree
# later. NOT a new constant -- SPEC 13 owns it like the rest.
H_NORM = 1.5

GATE_MIN_HUMAN_WD = 0.5

# Founder 2026-08-07: form is an applicability arc, not a center-score penalty.
APPLY_FORM_IN_WEIGHT = False

# Founder 2026-08-07: population OFF entirely, everywhere -- not just under
# --demo. S3 recovers the four axes from an abstract only rarely, so the factor
# was mostly applying the 0.70 "adjacent" penalty to data we never actually had.
# Penalising a study for an unknown is not conservatism, it is noise.
#
# Turning this back on is one line, and the selftest asserts BOTH settings so
# flipping it can never silently leave the suite meaningless.
APPLY_POP_IN_WEIGHT = False

# Founder 2026-08-07: dose OUT of the weight too. All three transfer axes --
# form, dose, population -- are now APPLICABILITY and live only on the arcs.
#
# The centre number therefore answers exactly one question: does this ingredient
# work for this outcome, on the best evidence available, regardless of whose
# bottle it is. Whether that evidence applies to YOUR bottle is the arcs' job,
# and they can only ever qualify the number, never inflate it.
#
# The consequence, stated plainly: two products differing only in form or dose
# now share a centre number. The difference is real and is carried by the arcs,
# so the centre number must never be published without them.
APPLY_DOSE_IN_WEIGHT = False


# The scoring MODEL, not the code version. Bump this whenever a change makes
# today's numbers incomparable with yesterday's -- a factor entering or leaving
# w_study, the composite formula, the arc definitions.
#
# Reports are filed under it. Two runs carrying different SCORING_MODEL values
# must never be read side by side as if the numbers meant the same thing, and
# scripts/archive_reports.py enforces that by sweeping old-model runs out of
# reports/runs/ into reports/archive/<model>/.
SCORING_MODEL = "v10-dose-ramp"

# What each model meant, so an archived report can still be understood:
SCORING_MODEL_HISTORY = {
    "v10-dose-ramp":
        "the dose axis is CONTINUOUS -- founder decision 2026-08-12 after "
        "challenging the tiers ('4 g against a 5-10 g band'). Flat 1.00 inside "
        "the observed band (every dose there was directly measured; the midpoint "
        "is NOT a peak -- dose-response is sigmoid with a plateau, not "
        "triangular), linear ramps outside with the founder-owned DOSE_FACTOR "
        "values as knots: 1.00 at band-low down to 0.10 at half the low end, "
        "1.00 at band-high down to 0.60 at twice the high end, clamped beyond. "
        "Kills two cliffs at once: 4999 vs 5000 mg no longer doubles the credit "
        "(4 g vs a 5 g band-low reads 0.64, was 0.45), and the dose ARC grades "
        "each study by its continuous dose_factor instead of a binary in_band "
        "test, so a trial at 99% of the product's dose counts at ~99% instead "
        "of zero. Intervals straddling an edge are priced at their pessimistic "
        "endpoint instead of refused. dose.product_factor joins product_match "
        "on the row. No new constants; signed score unchanged.",
    "v9-dose-arc-per-study":
        "the dose arc measures trials AT THE PRODUCT'S dose, per study. "
        "Study.dose_match was product-vs-derived-band -- one value stamped on "
        "every study of an outcome -- so the arc was degenerate: a clone of the "
        "effect arc when the product sat in band, and EMPTY ('not tested') when "
        "it did not, which is the invariant-8 violation: a 4.4 g product against "
        "a 4.8-5.0 g band rendered the same as never studied. Now dose_match is "
        "the STUDY's own dose against the product's interval (dose_match_for "
        "tiers, no new constants), SR-table rows are 'unspecified' (their dose "
        "is unknown, so the axis is unassessable), and the product-vs-band "
        "comparison moved to dose.product_match on the row as the 'dosed where "
        "trials found nothing' warning. Signed score UNCHANGED from v8; only "
        "the dose arc and therefore the composite move.",
    "v8-effect-size":
        "s_i comes from the REPORTED EFFECT SIZE, not from the direction label, "
        "wherever a usable number exists -- founder decision 2026-08-11 ('do i'). "
        "Vote counting (counting how many trials individually cleared p<0.05) has "
        "power approaching zero as trials shrink, which is the regime supplement "
        "literature lives in: 24 of 27 sized nulls had a point estimate FAVOURING "
        "creatine while each scored -0.35, against 7 published pooled estimates "
        "favouring it with CIs excluding zero. The scale is recentred on the "
        "MEANINGFUL threshold rather than on zero, so a measured-zero effect "
        "gives -0.333 (reproducing the -0.35 chosen for a well-run null) and a "
        "harm-sized -0.5 SMD clamps to -1.0 (reproducing harm). Both founder "
        "constants are therefore DERIVED, and invariant 7 survives. Falls back to "
        "the label when no number is standardisable, which on the v1.14 corpus is "
        "still 82% of mapped claims. Sign is STATED by S5 (effect_favours, "
        "PROMPT_VERSION v1.16), never inferred.",
    "v1-transfer-in-weight":
        "signed -100..100 only. form x dose x population multiplied into "
        "w_study. No arcs. Superseded 2026-08-07.",
    "v2-four-arc":
        "w_study = design x RoB x size x funding x OA (quality only). Form, "
        "dose and population are ARCS, each carrying a verdict and its "
        "coverage. Displayed number is 0-100 = 100 x c x mean(effect, form, "
        "dose); the signed score is retained internally. RoB banded on raw "
        "hit COUNTS (>=5 low, >=3 some_concerns), so an item nobody could "
        "know counted as a miss. Superseded 2026-08-10.",
    "v3-rob-known":
        "identical to v2 except RoB is banded on the RATIO of hits among "
        "KNOWN items, so an unknowable item no longer counts as evidence of "
        "bias. Everything else -- arcs, composite, K, S_VALUE -- unchanged.",
    "v4-k15":
        "identical to v3 except K 3.0 -> 1.5 (founder, 2026-08-11): confidence "
        "saturates at realistic per-cell corpus sizes instead of demanding "
        "~51 studies per ECU cell for c=0.8. Form term was still a re-scoring of "
        "the signed d over the exact-form subset, with effect x 0.15 when that "
        "subset was empty. Superseded 2026-08-11.",
    "v5-form-ladder":
        "form arc decoupled from the effect arc (founder design 2026-08-11). The "
        "composite's form term is now an EVIDENCE-HIERARCHY strength 0..1 -- the "
        "mean of the top-3 arcs.FORM_LADDER scores among NON-NEGATIVE evidence in "
        "the product's own form (umbrella 1.00 ... RCT 0.80 ... animal 0.10) -- "
        "instead of effect x 0.15 when no exact-form trial existed. Negative "
        "exact-form evidence scores 0 strength and keeps its signed verdict, so "
        "'untested' and 'failed' stay distinguishable. Effect arc, dose arc, K and "
        "S_VALUE unchanged. Eligibility was POOLED -- a negative subset d zeroed "
        "the whole arc -- which discarded real positive form evidence. "
        "Superseded 2026-08-11.",
    "v6-form-ladder-per-study":
        "identical to v5 except form-ladder eligibility is PER STUDY: rank the "
        "studies in your form whose own result is non-negative and average the "
        "top-3, walking down the hierarchy when the highest ranks are negative. "
        "A negative pooled verdict no longer zeroes the arc; it stays in the "
        "verdict as the warning it is. Also adds per-study score contributions "
        "(scoring.contributions) which sum exactly to the signed score. "
        "S_VALUE null_effect was still -0.7. Superseded 2026-08-11.",
    "v7-null-035":
        "identical to v6 except S_VALUE['null_effect'] -0.7 -> -0.35 (founder, "
        "2026-08-11, from scripts/penalty_experiment.py). A well-run null is no "
        "longer priced at 70% of documented harm. harm stays -1.0. Every score "
        "built on a corpus containing nulls moves UP; runs across this boundary "
        "are not comparable.",
}


def band_for(score: int) -> str:
    """SPEC §9 bands, inclusive on both ends of each range."""
    if score >= 70:  return "strong support"
    if score >= 30:  return "moderate support"
    if score >= 10:  return "weak support"
    if score >= -9:  return "inconclusive"
    if score >= -39: return "weak evidence against"
    if score >= -69: return "does not work"
    return "strong evidence against / harm"


# RoB banding thresholds (SCORING_MODEL v3, 2026-08-10; decision delegated by
# the founder). Banded on the RATIO of hits among KNOWN items, not raw counts.
#
# Why: measured on the 143-study creatine corpus, items 3-6 (registration,
# registry match, attrition, ITT) were UNKNOWN on 117-132 of 143 studies --
# most of this literature predates trial registries -- so under count-based
# banding a study with 4 unknowable items had a ceiling of 2 hits and was
# structurally locked into "high" (0.25x) no matter how well it was run:
# 136/143 banded high, zero low. Scoring an unknowable item as evidence of
# bias is inferring a field we cannot see (invariant 5), and it was the third
# unknown-punished-as-failure defect of the same shape (invariant 7's fields,
# magnitude=unstated). Values below are the ones measured in the 2026-08-10
# counterfactual before shipping; SPEC 13 owns them like every constant.
ROB_KNOWN_LOW = 0.8     # >=80% of known items clean, and at least 2 known
ROB_KNOWN_SOME = 0.5    # >=50% of known items clean
ROB_MIN_KNOWN_LOW = 2   # "low" needs at least this many items actually known


def rob_band(items: dict) -> tuple[str, int, int]:
    scored = [v for v in items.values() if v in (0, 1)]
    n_known = len(scored); hits = sum(scored)
    if n_known == 0:
        return "high", 0, 0   # nothing known at all is still not reassuring
    ratio = hits / n_known
    if ratio >= ROB_KNOWN_LOW and n_known >= ROB_MIN_KNOWN_LOW:
        return "low", hits, n_known
    if ratio >= ROB_KNOWN_SOME:
        return "some_concerns", hits, n_known
    return "high", hits, n_known


def size_factor(n: int | None) -> float:
    if not n or n <= 1: return 0.2
    return min(1.0, math.log10(n) / 2.0)


@dataclass
class Study:
    id: str
    design_rank: int
    n: int | None = None
    rob_items: dict = field(default_factory=dict)
    funding: str = "undisclosed"
    venue_ok: bool = True
    retracted: bool = False
    oa: str = "abstract_only"
    rob_inherited: bool = False
    # A band taken straight from someone else's RoB table. Used INSTEAD of
    # rob_items when set, because a review reports an overall judgement and not
    # which six items it rested on. Synthesising six items to hit the right
    # count would be inventing data (invariant 5) -- we know the verdict, not
    # the working. rob_inherited must be True alongside it, so the 0.85 penalty
    # for second-hand judgement still applies.
    rob_band_direct: str | None = None
    form_match: str = "unspecified"
    # Default pessimistic since 2026-08-12, same policy as pop_match below.
    # dose_match became a PER-STUDY "this trial was dosed at your product's
    # dose" fact when the dose arc went per-study; defaulting it to "in_band"
    # made every constructor that omitted it silently assert that fact.
    dose_match: str = "unspecified"
    # Continuous dose credit for THIS study's dose against the product's
    # (dose.dose_factor_for). Replaces the binary in_band membership in the dose
    # arc (SCORING_MODEL v10): under the tiers a trial at 99% of the product's
    # dose contributed NOTHING to the arc while one at 200% contributed fully.
    # None = the study's dose is unknown, so the axis is unassessable for it.
    dose_factor: float | None = None
    # Default pessimistic: missing population match is not a free pass.
    pop_match: str = "different"
    direction: str = "null_effect"
    magnitude: str | None = None
    # A standardised effect already ORIENTED so that positive means "good for the
    # product", in [-1, +1], or None when no usable number existed. `assemble`
    # computes it (it is the layer that knows outcome polarity); this module
    # cannot, because it has no project imports. `effect_route` records how it was
    # obtained -- "smd", "percent", or the refusal reason -- so a run can be
    # audited for how much of its score came from measured effects vs from labels.
    effect_s: float | None = None
    effect_route: str = "label"

    def s_value(self) -> float:
        # FOUNDER DECISION 2026-08-11: a measured effect beats the label. See the
        # EFFECT_MID_SMD block above for why the scale is recentred on the
        # meaningful threshold rather than on zero.
        if self.effect_s is not None:
            if self.direction == "harm":
                # SAFETY ASYMMETRY. A harm label may be made MORE negative by its
                # number, never less. On disagreement the LABEL wins and keeps the
                # full harm value -- it does not get clamped to 0.
                #
                # The first version of this returned min(effect_s, 0.0), which
                # looked conservative and was not. MEASURED on the v1.14 corpus: of
                # 6 harm claims carrying a standardisable number, THREE standardise
                # to +1.000 -- "elevated serum creatinine (rate) 74.2%",
                # "drug-related adverse events 82%", "early drug discontinuation
                # 50%". Those are harm RATES, where a bigger number is worse, so
                # clamping turned a documented harm into 0.0 = "no evidence" and
                # hid a safety signal. For a safety outcome the under-counting
                # direction is to KEEP the harm, not to neutralise it.
                if self.effect_s > 0:
                    return S_VALUE["harm"]
                return min(self.effect_s, 0.0)
            # SIGN AGREEMENT GUARD. The number is trusted only where it does not
            # contradict the label. `effect_s` is required by contract (S5 prompt,
            # v1.16) to be oriented so POSITIVE means the supplement did better,
            # so a `benefit` claim with a negative effect means one of the two
            # readings is wrong -- most likely a measure whose native direction is
            # inverted, such as a sprint TIME filed under muscle_power where
            # faster is better but the number is smaller.
            #
            # Falling back to the label here is the under-counting choice and it is
            # the point: a wrong sign does not weaken a score, it inverts it, and
            # nothing downstream can detect that. Untestable on the creatine
            # corpus -- all 40 standardisable claims there are on higher_better
            # outcomes, so orientation is a no-op and this guard never fires. It
            # will first matter on a lower_better ingredient (magnesium ->
            # sleep_onset, anxiety), which is exactly why it is here now.
            if self.direction == "benefit" and self.effect_s < 0:
                return (S_VALUE["benefit_meaningful"]
                        if self.magnitude == "meaningful" else S_VALUE["benefit_trivial"])
            return self.effect_s
        if self.direction == "harm": return S_VALUE["harm"]
        if self.direction == "null_effect": return S_VALUE["null_effect"]
        if self.direction == "benefit":
            # Only explicit "meaningful" gets +1.0. "trivial", "unstated", None
            # all score as trivial — conservative; avoids over-crediting vague benefits.
            if self.magnitude == "meaningful":
                return S_VALUE["benefit_meaningful"]
            return S_VALUE["benefit_trivial"]
        # `unclear` -> 0.0. DO NOT ALSO ZERO ITS weight(). Tried and reverted
        # 2026-08-11, and the reasoning is worth keeping because the change looks
        # obviously right and is not.
        #
        # The tie rule in `assemble._collapse` documents s = 0.0 as "adds no
        # evidence in either direction", which is only literally true of d's
        # NUMERATOR -- an unclear study still contributes full mass to E, so it
        # raises c (lean_body_mass 0.848 -> 0.774 if removed) and it counts toward
        # H. That reads like a bug: confidence earned from claims we could not
        # read. It is not, because c is not certainty about DIRECTION -- it is
        # pure evidence QUANTITY (CLAUDE.md, evidence arc). The trial was really
        # run and really measured this outcome; only our extraction is ambiguous.
        # "Well studied, no clear direction" is an honest reading and a different
        # message from "nobody has looked", which is exactly the distinction
        # invariant 8 requires the arcs to preserve.
        #
        # Zeroing the weight also breaks the tie rule outright: a corpus whose
        # only study is a tie drops to E = 0 and gates to `score: None`, so the
        # selftest pin "a benefit/null tie is neither side's win" (which requires
        # only_null < tie < only_benefit) cannot hold. Measured cost of the
        # reverted change was <= 1 point per outcome on the 149-study corpus --
        # small, and in exchange for making a deliberate design incoherent.
        return 0.0

    def weight(self) -> float:
        if self.retracted or not self.venue_ok: return 0.0
        wd = DESIGN_W.get(self.design_rank, 0.0)
        if wd == 0.0: return 0.0
        band = (self.rob_band_direct if self.rob_band_direct in ROB_FACTOR
                else rob_band(self.rob_items)[0])
        w = wd * ROB_FACTOR[band] * size_factor(self.n)
        w *= FUNDING_FACTOR.get(self.funding, 0.8)
        w *= OA_FACTOR.get(self.oa, 0.55)
        if self.rob_inherited: w *= 0.85
        # Form is applicability (form arc), not a center-score penalty.
        if APPLY_FORM_IN_WEIGHT:
            w *= FORM_FACTOR.get(self.form_match, 0.30)
        if APPLY_DOSE_IN_WEIGHT:
            w *= DOSE_FACTOR.get(self.dose_match, 0.45)
        if APPLY_POP_IN_WEIGHT:
            w *= POP_FACTOR.get(self.pop_match, 0.35)
        return w


def contributions(primaries: list, result: dict) -> list[dict]:
    """
    Per-study contribution to the SIGNED score. Sums (before rounding) to it.

    Founder ask 2026-08-11: "in the report I want to see how much to the score
    each study has contributed". It decomposes exactly, which is why this is a
    fact rather than an attribution heuristic:

        signed = 100 x d x c x (1 - H_PENALTY x H)
        d      = sum(w_i x s_i) / E

    so each study owns `100 x c x (1 - H_PENALTY x H) x w_i x s_i / E` points and
    the parts add up to the whole. A study can therefore contribute NEGATIVE
    points, and the sign tells you whether it pushed the score up or down.

    `w_i` is the quality weight (design x RoB x size x funding x OA) and `s_i` the
    direction value, so the two reasons a study matters -- how good it is and what
    it found -- stay visible separately instead of collapsing into one number.
    """
    if result.get("score") is None:
        return []
    E = result.get("E") or 0.0
    if not E:
        return []
    scale = 100.0 * (result.get("c") or 0.0) * (1 - H_PENALTY * (result.get("H") or 0.0))
    out = []
    for st in primaries:
        w = st.weight()
        sv = st.s_value()
        out.append({
            "id": st.id,
            "w": round(w, 4),
            "s": sv,
            "design_rank": st.design_rank,
            "direction": st.direction,
            "form_match": st.form_match,
            "d_share": round(w * sv / E, 4),
            "points": round(scale * w * sv / E, 2),
            # WHERE s CAME FROM. "label" means the direction label decided it
            # (vote counting); anything else names the measured route or the reason
            # the number was refused. Surfaced per study on purpose: a run's
            # headline can now be audited for how much of it rests on measured
            # effects versus on labels, and that share is the single most useful
            # number for judging how much to trust a score under SCORING_MODEL v8.
            "effect_route": st.effect_route,
            "effect_s": st.effect_s,
        })
    out.sort(key=lambda r: -abs(r["points"]))
    return out


def score_ecu(primaries: list[Study], syntheses: list[dict] | None = None,
              n_unique: int | None = None):
    """
    primaries: UNIQUE primary studies only. Dedup happens before this is called.
    syntheses: [{"included_ids": set, "q_s": float, "resolved": bool}, ...]

    Unresolved syntheses are intentionally ignored here (under-count).
    See dedup.synthesis_contribution_cap — not yet applied to E / E'.
    """
    syntheses = syntheses or []
    human = [s for s in primaries if s.design_rank <= 11]
    gate_mass = sum(DESIGN_W.get(s.design_rank, 0) for s in human)
    if gate_mass < GATE_MIN_HUMAN_WD:
        return {"score": None, "band": "insufficient human evidence",
                "gate_fired": True, "n_primaries": len(primaries),
                "n_syntheses": len(syntheses), "gate_mass": round(gate_mass, 3)}

    weights = [s.weight() for s in primaries]
    E = sum(weights)
    if E <= 0:
        return {"score": None, "band": "insufficient human evidence",
                "gate_fired": True, "n_primaries": len(primaries),
                "n_syntheses": len(syntheses), "gate_mass": round(gate_mass, 3)}

    P = {s.id for s in primaries}
    cov, q = 0.0, 0.0
    for syn in syntheses:
        if not syn.get("resolved"): continue
        c = len(set(syn.get("included_ids", ())) & P) / max(len(P), 1)
        if c > cov: cov, q = c, syn.get("q_s", 0.0)
    E_prime = E * (1 + LAMBDA * cov * q)

    d = sum(w * s.s_value() for w, s in zip(weights, primaries)) / E
    c_conf = 1 - math.exp(-E_prime / K)
    mean_s = d
    H = sum(w * (s.s_value() - mean_s) ** 2 for w, s in zip(weights, primaries)) / E
    H = min(1.0, H / H_NORM)

    raw = 100 * d * c_conf * (1 - H_PENALTY * H)
    score = max(-100, min(100, round(raw)))
    band = band_for(score)

    return {"score": score, "band": band, "gate_fired": False,
            "d": round(d, 3), "c": round(c_conf, 3), "H": round(H, 3),
            "E": round(E, 3), "E_prime": round(E_prime, 3),
            "coverage": round(cov, 3),
            "n_primaries": len(primaries), "n_syntheses": len(syntheses),
            "dedup_ratio": round(len(syntheses) / max(len(primaries), 1), 2)}
