"""
A claim's reported effect -> its signed contribution `s`. NO MODEL MAY ENTER
THIS FILE. Moved verbatim out of pipeline/assemble.py on 2026-10-03; assemble
re-exports `_effect_s`.

The scale is recentred on the MEANINGFUL threshold, not on zero (CLAUDE.md
"Scoring in one screen"; scripts/experiments/effect_size_experiment.py arm E).
"""
from __future__ import annotations
import math

from pipeline import scoring
from pipeline import vocab
from pipeline.claim_arms import _claim_equivalence_valid


def _effect_s(claim: dict, outcome_vocab_id: str) -> tuple[float | None, str]:
    """
    A claim's measured effect as a signed s in [-1, +1], or (None, refusal reason).

    Lives here rather than in `scoring` because it needs the VOCABULARY, and
    `pipeline/scoring.py` has no project imports by design (enforced by
    pipeline.invariants). Everything unit-related is delegated to
    `scoring.standardise_effect`; the only judgement added here is the one that
    needs the outcome.

    ADVERSE-EVENT OUTCOMES ARE REFUSED, and this is not incidental. Just above,
    an adverse-event `null_effect` is deliberately rewritten to
    `benefit`/`trivial`, because for a safety outcome "no difference in side
    effects" CONFIRMS the claim "this is safe". The reported NUMBER on such a
    claim is an adverse-event rate difference, where POSITIVE means MORE harm --
    the opposite orientation from every efficacy outcome. Feeding it through the
    same scale would read "12% more adverse events" as strong positive evidence.
    Measured: the unrestricted null-sign count found exactly this shape
    ("Self-reported adverse events (rate) +12.8", "Hyperhomocysteinemia +40.1").
    """
    if vocab.outcome_kind(outcome_vocab_id) == "adverse_event":
        return None, "adverse_event_inverted_polarity"

    raw = claim.get("effect_size")
    equivalence_valid = _claim_equivalence_valid(claim)
    if raw is None:
        if claim.get("direction") == "null_effect" and not equivalence_valid:
            return None, "inconclusive_unquantified"
        return None, "no_effect_size"

    # WHICH WAY IS "GOOD"? Never inferred from the number's arithmetic sign.
    #
    # A design analysis of this corpus found effect_size does NOT follow a single
    # sign convention: some papers report a raw measurement difference, where a
    # faster sprint TIME is a NEGATIVE number and a BETTER result, and others
    # report the same finding already oriented toward the treatment. Guessing is a
    # coin flip, and a wrong sign does not weaken a score -- it inverts it, and no
    # downstream step can detect that. So S5 states the arm outright
    # (`effect_favours`, PROMPT_VERSION v1.16).
    #
    # The orientation is applied to the RAW value, BEFORE standardising. Doing it
    # afterwards would be wrong: the scale is recentred on the meaningful
    # threshold, so a genuine but TRIVIAL benefit standardises to a NEGATIVE s by
    # construction, and taking abs() of that would promote a trivial effect into a
    # strong one -- the opposite of conservative.
    favours = claim.get("effect_favours")
    try:
        magnitude = abs(float(raw))
    except (TypeError, ValueError):
        return (None, "inconclusive_unquantified" if
                claim.get("direction") == "null_effect" and
                not _claim_equivalence_valid(claim) else "unparseable_effect_size")
    if not math.isfinite(magnitude):
        return (None, "inconclusive_unquantified" if
                claim.get("direction") == "null_effect" and
                not equivalence_valid else "unparseable_effect_size")

    # THE NUMBER IS USED ONLY WHEN S5 NAMES THE ARM. No exceptions, no fallback
    # to the reported sign, no fallback to outcome polarity.
    #
    # MEASURED 2026-08-11 and this is why the rule is absolute: the stored
    # effect_size is an ABSOLUTE MAGNITUDE, not a signed contrast. Of 54
    # standardised values only 3 are negative, and **24 of 24 standardised
    # null_effect values are positive** -- under a real treatment-minus-control
    # convention roughly half should be negative, so P(all 24 one sign) is about
    # 1e-7. Papers print |d| alongside "no significant difference" and S5 copies
    # it faithfully.
    #
    # Taking that at face value is not a small error. A null reporting |g| = 0.88
    # would standardise to +1.0 when the truth may be -1.0, so the change intended
    # to REMOVE the vote-counting bias would have introduced a systematic UPWARD
    # one instead -- on exactly the claims where the number is load-bearing.
    #
    # "neither" is refused for the same reason: a magnitude with no arm attached
    # cannot be signed, and a LARGE magnitude that favours neither arm is a
    # self-contradiction rather than a reading. Both fall back to the direction
    # label, which is what the pre-v1.16 corpus therefore does in full -- v8
    # scores that corpus identically to v7 by construction, and only data
    # extracted under the v1.17 contract activates the measured path.
    # LABEL/NUMBER CONTRADICTIONS are refused HERE, where `favours` is visible,
    # not guessed at in scoring from the sign of s (2026-08-12). S5 saying
    # direction=benefit while the number favours CONTROL (or direction=harm while
    # it favours the ingredient) is two readings of one paper that cannot both be
    # right; invariant 9's rule is under-count, so the claim falls back to its
    # label. This replaces a sign-agreement guard inside Study.s_value() that had
    # become wrong: since v1.17 effect_s is already favours-oriented, so a
    # NEGATIVE s on a benefit claim usually just means sub-threshold
    # (favours=ingredient, magnitude 0.05 -> s -0.25) -- and the old guard
    # promoted exactly those back to the full label value, over-crediting the
    # smallest effects.
    direction = claim.get("direction")
    # An unsigned nonsignificant efficacy estimate is not rescued merely because
    # its magnitude is sub-threshold. Signed measured zero remains valid. A
    # typed successful equivalence basis is the sole exception.
    if direction == "null_effect" and favours not in ("ingredient", "control"):
        return (None, "no_effect_size" if equivalence_valid
                else "inconclusive_unquantified")
    if direction == "benefit" and favours == "control":
        return None, "label_number_contradiction"
    if direction == "harm" and favours == "ingredient":
        return None, "label_number_contradiction"
    # Group×time F/omnibus statistics can establish a differential direction,
    # but the F number has no effect-size magnitude semantics. Never pass it to
    # standardise_effect (an SD field must not turn an omnibus into d).
    test_kind = claim.get("test_kind")
    statistic = str(claim.get("statistic") or "").strip().casefold()
    provenance = str(claim.get("statistic_provenance") or "").casefold()
    if (test_kind == "group_by_time" and
            (statistic.startswith("f") or "omnibus" in provenance)):
        return None, ("inconclusive_unquantified" if direction == "null_effect"
                      and not equivalence_valid else "omnibus_magnitude_refused")
    sd = claim.get("effect_sd")
    if favours in ("ingredient", "control"):
        measured, route = scoring.standardise_effect(
            magnitude if favours == "ingredient" else -magnitude,
            claim.get("effect_unit"), sd)
        if measured is None and claim.get("direction") == "null_effect" and not equivalence_valid:
            return None, "inconclusive_unquantified"
        return measured, route

    # SIGN UNKNOWN -- "neither", or absent (pre-v1.17 data, or the model declined).
    # Refusing all of these was the first rule and it was too broad: measured on
    # the v1.17 creatine corpus, "neither" alone was the second-largest refusal
    # (48 of 257 mapped claims, 19%) after "no number at all".
    #
    # A SUB-THRESHOLD MAGNITUDE IS SIGN-PROOF, and that is the whole argument. If
    # the magnitude sits at or below the meaningful threshold, BOTH possible signs
    # give a negative s:
    #
    #     true effect +m  ->  s = (m - MID)/(FULL - MID)   < 0   for m < MID
    #     true effect -m  ->  s = (-m - MID)/(FULL - MID)  < 0   and more negative
    #
    # so the unknown sign cannot change the conclusion, and taking the positive
    # reading is the LESS negative of the two -- the conservative choice. A trial
    # that measured a difference too small to notice is evidence against a
    # MEANINGFUL effect whichever arm it happened to favour, which is exactly what
    # the recentred scale says.
    #
    # Above the threshold the sign decides everything, so those stay refused: of
    # 21 standardisable "neither" claims, 9 are sign-proof and 12 are large enough
    # that "favours neither" is a self-contradiction rather than a reading.
    s, route = scoring.standardise_effect(magnitude, claim.get("effect_unit"),
                                          claim.get("effect_sd"))
    if s is not None and s <= 0:
        # This branch is the unsigned rescue for sub-threshold magnitudes. It is
        # intentionally unavailable to ordinary nonsignificant efficacy claims.
        if claim.get("direction") == "null_effect" and not equivalence_valid:
            return None, "inconclusive_unquantified"
        return s, route
    if claim.get("direction") == "null_effect" and not equivalence_valid:
        return None, "inconclusive_unquantified"
    return None, ("favours_neither_but_above_threshold" if favours == "neither"
                  else "sign_convention_unstated")
