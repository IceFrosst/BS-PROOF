"""
Evidence method v2, stage 3: the second reviewer's disagreement rule.
NO MODEL MAY ENTER THIS FILE. SHADOW ONLY until the Phase 4 switch.

Systematic reviews extract every number twice, independently, and only numbers
both extractors agree on are analysed. Here reviewer 1 is S5 (+ the S5T table
route, then the deterministic span check) and reviewer 2 is S5R: a DIFFERENT
Claude model that is shown the same paper and the claim's identity (outcome,
timepoint, arm labels) but NOT reviewer 1's numbers, and extracts them again.
(docs/EVIDENCE_METHOD.md §9 decision 5: a second Claude model for now; a
different-vendor reviewer is future work.)

`reconcile` compares the two, field by field. It never averages and never picks
one side (invariant 9):

  ONLY the fields the claim's effect route reads are compared
  (`ROUTE_FIELDS`); a claim whose verified numbers make no effect is not sent.
  categorical field differs      -> "disagreed": the claim's effect is refused
                                    and queued for human adjudication
  a span-verified number differs -> "disagreed" (someone misread: SD vs SE,
                                    wrong arm, wrong timepoint)
  reviewer 2 has no value for a
  number reviewer 1 verified     -> that number is DROPPED (unconfirmed); the
                                    effect may then fall to a weaker route or
                                    become uncomputable. null is a valid answer.
  reviewer 2 could not find the
  outcome at all                 -> "disagreed" (the claim's existence is
                                    disputed)
  everything confirmed           -> "agreed"
  no review (flag off, call
  failed, claim not sent)        -> "single": numbers pass unchanged, and the
                                    pool and GRADE say the effect was
                                    single-extracted

Reviewer 2 can only CONFIRM. A number it reports that reviewer 1 did not verify
is ignored: adding numbers would need its own span check, and the union of two
extractions is not a double-checked extraction.

THE TOLERANCES IN `RULES` ARE CONSTANTS (invariant 4), listed for founder
review in docs/REVIEW_PENDING.md #0.
"""
from __future__ import annotations

import math

RULES = {
    # Two readings of one printed number agree when they differ by at most 1%
    # (relative) or 0.005 (absolute, for values near 0 such as p). A misread is
    # normally far larger: an SE taken for an SD is off by sqrt(n).
    "rel_tol": 0.01,
    "abs_tol": 0.005,
}

# Per effect route (pipeline/effect_size.py): the numbers it reads and the
# categorical facts that pick its sign or scale. ONLY these are compared -- a
# field the effect never uses cannot make the effect wrong. (Measured
# 2026-10-03 smoke test: comparing every field refused 7/7 claims over p-values
# and estimate kinds that no effect route read.)
_REPORTED_CATS = ("effect_favours", "estimate_kind", "design_kind", "contrast", "estimand")
ROUTE_FIELDS = {
    "arm_stats": (("n_ingredient", "n_control", "mean_ingredient", "mean_control",
                   "sd_ingredient", "sd_control"), ("design_kind", "contrast", "estimand")),
    "reported_smd_ci": (("effect_size", "ci_low", "ci_high"), _REPORTED_CATS),
    "reported_md_ci": (("effect_size", "ci_low", "ci_high"), _REPORTED_CATS),
    "reported_smd_p": (("effect_size", "p_value"), _REPORTED_CATS),
    "reported_smd_n": (("effect_size", "n_ingredient", "n_control"), _REPORTED_CATS),
}
# The sign of a reported estimate comes from this field alone, so reviewer 2
# must CONFIRM it; for the other categorical facts a null from reviewer 2 is
# "not stated", not a conflict.
MUST_CONFIRM = ("effect_favours",)
# Signs of reported estimates come from `effect_favours`, not the printed sign,
# so these are compared by magnitude (pipeline/effect_size.py).
_ABS_COMPARED = ("effect_size",)


def _same_number(a: float, b: float, field: str) -> bool:
    if field in _ABS_COMPARED:
        a, b = abs(a), abs(b)
    return math.isclose(a, b, rel_tol=RULES["rel_tol"], abs_tol=RULES["abs_tol"])


def effect_route(claim: dict, verified: dict, polarity: str | None) -> str | None:
    """The route reviewer 1's verified numbers take, or None (no effect)."""
    from pipeline.effect_size import effect_from_claim
    eff, _why = effect_from_claim(claim, verified, polarity=polarity)
    return eff.route if eff is not None else None


def reconcile(claim: dict, numbers: dict | None, review: dict | None,
              polarity: str | None = None) -> dict:
    """The review record for one claim: {"status", "route", "verified",
    "dropped", "conflicts"}. `numbers` is the claim's numbers_v2 (span-check
    output); `review` is reviewer 2's entry for this claim, or None. Only the
    fields of the effect route reviewer 1's numbers take are compared, and only
    those reach the pool."""
    verified = dict((numbers or {}).get("verified") or {})
    route = effect_route(claim, verified, polarity)
    if review is None or route is None:
        return {"status": "single", "route": route, "verified": verified, "dropped": [], "conflicts": []}
    if not review.get("found"):
        return {"status": "disagreed", "route": route, "verified": {}, "dropped": [],
                "conflicts": ["reviewer 2 did not find this outcome"]}
    num_fields, cat_fields = ROUTE_FIELDS[route]

    conflicts: list[str] = []
    for f in cat_fields:
        a, b = claim.get(f) or None, review.get(f) or None
        if (b is None and f in MUST_CONFIRM) or (a is not None and b is not None and a != b):
            conflicts.append(f"{f}: {a!r} vs {b!r}")
    level_1, level_2 = claim.get("ci_level"), review.get("ci_level")
    if ("ci_low" in num_fields and level_1 is not None and level_2 is not None
            and not math.isclose(level_1, level_2, abs_tol=1e-6)):
        conflicts.append(f"ci_level: {level_1} vs {level_2}")

    kept, dropped = {}, []
    for f in num_fields:
        if f not in verified:
            continue
        v, r = verified[f], review.get(f)
        if not isinstance(r, (int, float)) or isinstance(r, bool):
            dropped.append(f)
        elif _same_number(float(v), float(r), f):
            kept[f] = v
        else:
            conflicts.append(f"{f}: {v} vs {r}")
    if conflicts:
        return {"status": "disagreed", "route": route, "verified": {}, "dropped": [], "conflicts": conflicts}
    return {"status": "agreed", "route": route, "verified": kept, "dropped": sorted(dropped), "conflicts": []}


def reconcile_study(outcomes: list[dict], reviews: list[dict] | None,
                    sent: set[int], polarity: dict | None = None) -> list[dict]:
    """Attach a review record to each outcome's numbers_v2, IN PLACE, matching
    reviewer 2's entries by claim index (never by position). Outcomes that were
    sent but got no entry back are "single", like outcomes never sent; the
    returned list is the human-adjudication queue."""
    by_index = {r.get("index"): r for r in reviews or [] if isinstance(r, dict)}
    queue = []
    for i, o in enumerate(outcomes):
        nums = o.get("numbers_v2")
        if not isinstance(nums, dict):
            continue
        rec = reconcile(o.get("claim") or {}, nums, by_index.get(i) if i in sent else None,
                        (polarity or {}).get(o.get("outcome_vocab_id")))
        nums["review"] = rec
        if rec["status"] == "disagreed":
            queue.append({"claim_index": i, "outcome": o.get("outcome_vocab_id"),
                          "conflicts": rec["conflicts"]})
    return queue
