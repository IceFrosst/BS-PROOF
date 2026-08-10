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

S_VALUE = {"benefit_meaningful":1.0, "benefit_trivial":0.3,
           "null_effect":-0.7, "harm":-1.0}

K = 3.0                 # confidence saturation. CALIBRATE ON TIER-3.
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
SCORING_MODEL = "v3-rob-known"

# What each model meant, so an archived report can still be understood:
SCORING_MODEL_HISTORY = {
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
    dose_match: str = "in_band"
    # Default pessimistic: missing population match is not a free pass.
    pop_match: str = "different"
    direction: str = "null_effect"
    magnitude: str | None = None

    def s_value(self) -> float:
        if self.direction == "harm": return S_VALUE["harm"]
        if self.direction == "null_effect": return S_VALUE["null_effect"]
        if self.direction == "benefit":
            # Only explicit "meaningful" gets +1.0. "trivial", "unstated", None
            # all score as trivial — conservative; avoids over-crediting vague benefits.
            if self.magnitude == "meaningful":
                return S_VALUE["benefit_meaningful"]
            return S_VALUE["benefit_trivial"]
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
