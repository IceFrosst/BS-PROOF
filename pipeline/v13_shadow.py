"""BS-PROOF v13 measured-effect analysis (SHADOW ONLY).

This module is deliberately not imported by production scoring.  It is a
conservative, executable shadow path for checking what can be measured from
claim-like records.  A signed value is never recovered from the arithmetic of
a paper: ``effect_favours`` is the only source of orientation.

The public entry point is :func:`analyze_shadow`.  Records can be mappings
(e.g. S5 claim dictionaries) or :class:`StudyEstimate` instances.  Unsized
labels are refusals, not numerical null effects.  The warning below is part of
the output so that a caller cannot mistake this experiment for production
scoring.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, fields
import math
from typing import Any, Iterable, Mapping, Optional, Sequence, Tuple

from pipeline import meta_effects


SHADOW_ONLY_WARNING = (
    "SHADOW ONLY: measured-effect analysis is experimental and is not used by "
    "production scoring."
)


@dataclass(frozen=True)
class StudyEstimate:
    """One claim-like study result supplied to the shadow analysis.

    ``effect_size`` is treated as a magnitude.  ``effect_favours`` supplies the
    sign.  For a raw two-arm result, all four arm values and both arm sample
    sizes are required; ``effect_sd`` must be a printed pooled SD.

    The optional ``adjusted_estimate`` and ``adjusted_variance`` fields are the
    explicit direct-adjustment escape hatch for crossover and cluster studies.
    They are not calculated by this module.
    """

    study_id: str = ""
    outcome: str = ""
    outcome_raw: Optional[str] = None
    measure: Optional[str] = None
    estimand: Optional[str] = None
    timepoint: Optional[str] = None
    contrast: Optional[str] = None
    estimate_kind: Optional[str] = None
    effect_unit: Optional[str] = None
    estimate_basis: Optional[str] = None
    effect_size: Optional[float] = None
    effect_favours: Optional[str] = None
    effect_sd: Optional[float] = None
    effect_sd_basis: Optional[str] = None
    mean_ingredient: Optional[float] = None
    mean_control: Optional[float] = None
    sd_ingredient: Optional[float] = None
    sd_control: Optional[float] = None
    n_ingredient: Optional[int] = None
    n_control: Optional[int] = None
    variance: Optional[float] = None
    sampling_variance: Optional[float] = None
    effect_variance: Optional[float] = None
    standard_error: Optional[float] = None
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None
    ci_level: Optional[float] = None
    p_value: Optional[float] = None
    p_value_kind: Optional[str] = None
    p_sidedness: Optional[str] = None
    test_distribution: Optional[str] = None
    design_kind: Optional[str] = None
    adjusted_estimate: Optional[float] = None
    adjusted_variance: Optional[float] = None
    directly_adjusted: bool = False

    @property
    def label(self) -> str:
        return self.outcome or self.outcome_raw or "(unspecified outcome)"


@dataclass(frozen=True)
class OutcomeResult:
    """Measured and pooled result for one homogeneous SMD stratum."""

    outcome: str
    stratum: str
    pooled_effect: Optional[float]
    ci_lower: Optional[float]
    ci_upper: Optional[float]
    prediction_lower: Optional[float]
    prediction_upper: Optional[float]
    tau2: Optional[float]
    i2: Optional[float]
    measured_count: int
    eligible_count: int
    measured_quality_share: float
    refusal_reason_counts: dict[str, int]
    study_effects: Tuple[Tuple[str, float], ...] = ()
    k: int = 0
    pooling_method: str = "none"
    warning: str = SHADOW_ONLY_WARNING

    @property
    def effect(self) -> Optional[float]:
        """Convenience alias for the pooled oriented Hedges g."""
        return self.pooled_effect

    @property
    def refusal_reasons(self) -> dict[str, int]:
        return dict(self.refusal_reason_counts)

    @property
    def pooled_ci(self) -> Optional[Tuple[float, float]]:
        if self.ci_lower is None or self.ci_upper is None:
            return None
        return self.ci_lower, self.ci_upper

    @property
    def prediction_interval(self) -> Optional[Tuple[float, float]]:
        if self.prediction_lower is None or self.prediction_upper is None:
            return None
        return self.prediction_lower, self.prediction_upper

    @property
    def pooled_g(self) -> Optional[float]:
        return self.pooled_effect

    @property
    def tau_squared(self) -> Optional[float]:
        return self.tau2

    @property
    def I2(self) -> Optional[float]:
        return self.i2

    @property
    def measured_share(self) -> float:
        return self.measured_quality_share


@dataclass(frozen=True)
class ShadowAnalysisResult:
    """Collection result, retained separately from production score output."""

    outcomes: Tuple[OutcomeResult, ...]
    warning: str = SHADOW_ONLY_WARNING

    @property
    def by_outcome(self) -> dict[str, OutcomeResult]:
        return {result.stratum: result for result in self.outcomes}

    @property
    def measured_count(self) -> int:
        return sum(result.measured_count for result in self.outcomes)

    @property
    def eligible_count(self) -> int:
        return sum(result.eligible_count for result in self.outcomes)

    @property
    def measured_quality_share(self) -> float:
        if self.eligible_count == 0:
            return 0.0
        return self.measured_count / self.eligible_count

    @property
    def refusal_reason_counts(self) -> dict[str, int]:
        counts: Counter[str] = Counter()
        for result in self.outcomes:
            counts.update(result.refusal_reasons)
        return dict(counts)


@dataclass(frozen=True)
class _Measured:
    record: StudyEstimate
    g: float
    variance: float


def _finite(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be finite")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be finite")
    return result


def _positive(value: Any, name: str) -> float:
    result = _finite(value, name)
    if result <= 0:
        raise ValueError(f"{name} must be positive")
    return result


def _optional_float(value: Any, name: str) -> Optional[float]:
    return None if value is None else _finite(value, name)


def _get(record: Mapping[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in record:
            return record[name]
    return default


def _coerce(record: StudyEstimate | Mapping[str, Any], index: int) -> StudyEstimate:
    if isinstance(record, StudyEstimate):
        return record
    if not isinstance(record, Mapping):
        raise TypeError("records must contain StudyEstimate or mapping values")
    names = {field.name for field in fields(StudyEstimate)}
    values = {name: record[name] for name in names if name in record}
    # S5's schema names the outcome outcome_raw; accepting it here does not
    # make an inference about the outcome, it merely preserves its label.
    if "outcome" not in values and "outcome_raw" in record:
        values["outcome"] = record["outcome_raw"]
    if "study_id" not in values:
        values["study_id"] = str(_get(record, "id", "study", default=f"study-{index + 1}"))
    # These aliases occur in machine-facing records and are unambiguous.
    aliases = {
        "estimate": "effect_size",
        "se": "standard_error",
        "ci_lower": "ci_low",
        "ci_upper": "ci_high",
        "adjusted_effect": "adjusted_estimate",
        "adjusted_effect_variance": "adjusted_variance",
    }
    for source, target in aliases.items():
        if target not in values and source in record:
            values[target] = record[source]
    return StudyEstimate(**values)


def _norm(value: Any) -> str:
    return str(value).strip().casefold() if value is not None else ""


def _favours_sign(record: StudyEstimate) -> int:
    favour = _norm(record.effect_favours)
    if favour == "ingredient":
        return 1
    if favour == "control":
        return -1
    raise ValueError("missing_effect_direction")


def _design(record: StudyEstimate) -> str:
    return _norm(record.design_kind) or "missing"


def _stratum(record: StudyEstimate) -> str:
    # Do not pool explicitly different endpoints, visits, estimands, or
    # contrasts merely because their outcome labels happen to match.
    values = (
        record.label,
        record.measure or "",
        record.estimand or "",
        record.timepoint or "",
        record.contrast or "",
    )
    return "|".join(str(value).strip() for value in values)


def _is_smd(record: StudyEstimate) -> bool:
    return _norm(record.estimate_kind or record.effect_unit) in {
        "smd", "hedges_g", "hedges g", "hedges' g",
        "cohen_d", "cohen d", "cohen's d", "d"
    }


def _direct_adjusted(record: StudyEstimate) -> Optional[tuple[float, float]]:
    if record.adjusted_estimate is None or record.adjusted_variance is None:
        return None
    estimate = _finite(record.adjusted_estimate, "adjusted_estimate")
    variance = _positive(record.adjusted_variance, "adjusted_variance")
    return estimate, variance


def _reported(record: StudyEstimate, sign: int) -> tuple[float, float]:
    kind = _norm(record.estimate_kind or record.effect_unit)
    if not _is_smd(record):
        raise ValueError("reported_estimate_not_smd")
    if record.effect_size is None:
        raise ValueError("missing_effect_size")
    magnitude = abs(_finite(record.effect_size, "effect_size"))
    if record.variance is not None:
        variance = _positive(record.variance, "variance")
    elif record.effect_variance is not None:
        variance = _positive(record.effect_variance, "effect_variance")
    elif record.sampling_variance is not None:
        variance = _positive(record.sampling_variance, "sampling_variance")
    elif record.standard_error is not None:
        variance = _positive(record.standard_error, "standard_error") ** 2
    elif record.ci_low is not None or record.ci_high is not None:
        if record.ci_low is None or record.ci_high is None:
            raise ValueError("incomplete_confidence_interval")
        if record.ci_level is None:
            raise ValueError("ci_level_required")
        se = meta_effects.se_from_ci(record.ci_low, record.ci_high, record.ci_level)
        variance = se * se
    elif record.p_value is not None:
        if _norm(record.p_value_kind) != "exact":
            raise ValueError("p_value_not_exact")
        if _norm(record.p_sidedness) != "two":
            raise ValueError("p_value_not_two_sided")
        if _norm(record.test_distribution) != "normal":
            raise ValueError("p_value_not_normal")
        se = meta_effects.se_from_normal_p(magnitude, record.p_value)
        variance = se * se
    else:
        raise ValueError("missing_variance_or_uncertainty")
    return sign * magnitude, variance


def _derived(record: StudyEstimate, sign: int) -> tuple[float, float]:
    # A raw difference can be derived only from a parallel two-arm result.
    required = (
        record.mean_ingredient, record.mean_control,
        record.n_ingredient, record.n_control,
    )
    if any(value is None for value in required):
        raise ValueError("missing_parallel_arm_values")
    if _design(record) != "parallel":
        if _design(record) in {"crossover", "cluster"}:
            raise ValueError("crossover_or_cluster_unadjusted")
        raise ValueError("parallel_design_required")
    n1, n2 = record.n_ingredient, record.n_control
    if (isinstance(n1, bool) or not isinstance(n1, int) or n1 < 2 or
            isinstance(n2, bool) or not isinstance(n2, int) or n2 < 2):
        raise ValueError("invalid_arm_sample_size")
    mean_ingredient = _finite(record.mean_ingredient, "mean_ingredient")
    mean_control = _finite(record.mean_control, "mean_control")

    # Prefer two printed arm SDs.  This is the direct parallel two-arm route.
    if record.sd_ingredient is not None or record.sd_control is not None:
        if record.sd_ingredient is None or record.sd_control is None:
            raise ValueError("both_arm_sd_required")
        arm_result = meta_effects.hedges_g(
            mean_ingredient, record.sd_ingredient, n1,
            mean_control, record.sd_control, n2)
        # The arithmetic is a magnitude only; effect_favours controls sign.
        return sign * abs(arm_result.g), arm_result.variance

    # Alternatively the paper may print a pooled SD alongside a raw
    # difference.  A baseline or control-arm SD is not a primary pooled SD.
    if _norm(record.effect_sd_basis) != "pooled":
        if _norm(record.effect_sd_basis) in {"baseline", "control_arm", "control", "primary"}:
            raise ValueError("primary_pool_sd_not_pooled")
        raise ValueError("pooled_sd_required")
    pooled = _positive(record.effect_sd, "effect_sd")
    df = n1 + n2 - 2
    correction = 1.0 - 3.0 / (4.0 * df - 1.0)
    # The arithmetic is a magnitude only.  The arm named by effect_favours
    # controls orientation, including when the raw difference is negative.
    d_magnitude = abs((mean_ingredient - mean_control) / pooled)
    g_magnitude = correction * d_magnitude
    variance = meta_effects.sampling_variance_g(g_magnitude, n1, n2)
    return sign * g_magnitude, variance


def _measure(record: StudyEstimate) -> _Measured:
    sign = _favours_sign(record)
    design = _design(record)
    adjusted = _direct_adjusted(record)
    if design in {"crossover", "cluster"}:
        # Direct adjustment must be supplied as a pair and must not be mixed
        # with an independent-arm derivation.  The source claim remains the
        # authority for the adjusted estimate and its sampling variance.
        if adjusted is None:
            raise ValueError("crossover_or_cluster_unadjusted")
        if not _is_smd(record):
            raise ValueError("adjusted_estimate_not_smd")
        return _Measured(record, sign * abs(adjusted[0]), adjusted[1])
    if adjusted is not None:
        # The pair itself is the explicit provenance gate; no independent-arm
        # approximation is made for an adjusted estimate.
        if not _is_smd(record):
            raise ValueError("adjusted_estimate_not_smd")
        return _Measured(record, sign * abs(adjusted[0]), adjusted[1])
    if record.mean_ingredient is not None or record.mean_control is not None:
        g, variance = _derived(record, sign)
        return _Measured(record, g, variance)
    if record.effect_size is None:
        raise ValueError("missing_effect_size")
    if (_norm(record.estimate_kind) in {"mean_difference", "raw_difference"}
            and record.effect_sd is not None
            and _norm(record.effect_sd_basis) in {"baseline", "control_arm", "control", "primary"}):
        raise ValueError("primary_pool_sd_not_pooled")
    return _Measured(record, *_reported(record, sign))


def _eligible(record: StudyEstimate) -> bool:
    """Whether a record belongs in the denominator of measured quality share."""
    design = _design(record)
    if design == "parallel":
        return True
    if design in {"crossover", "cluster"}:
        return _direct_adjusted(record) is not None
    return False


def _result(outcome: str, stratum: str, eligible: int,
            measured: Sequence[_Measured], refusals: Counter[str],
            confidence_level: float) -> OutcomeResult:
    share = len(measured) / eligible if eligible else 0.0
    effects = tuple((item.record.study_id, item.g) for item in measured)
    if not measured:
        return OutcomeResult(
            outcome, stratum, None, None, None, None, None, None, None,
            0, eligible, share, dict(sorted(refusals.items())), effects, 0,
            "none", SHADOW_ONLY_WARNING)
    if len(measured) == 1:
        return OutcomeResult(
            outcome, stratum, None, None, None, None, None, None, None,
            1, eligible, share, dict(sorted(refusals.items())), effects, 1,
            "none (single measured study; no pooled estimate)", SHADOW_ONLY_WARNING)
    estimates = tuple(meta_effects.EffectEstimate(item.g, item.variance) for item in measured)
    use_hk = len(estimates) >= 3
    pooled = meta_effects.random_effects_meta_analysis(
        estimates, confidence_level=confidence_level, use_hartung_knapp=use_hk)
    if use_hk:
        method = "REML + Hartung-Knapp"
    else:
        method = "REML (k=2; Hartung-Knapp certainty unavailable)"
    return OutcomeResult(
        outcome, stratum, pooled.estimate, pooled.ci_lower, pooled.ci_upper,
        pooled.prediction_lower, pooled.prediction_upper, pooled.tau2, pooled.i2,
        len(measured), eligible, share, dict(sorted(refusals.items())), effects,
        len(measured), method, SHADOW_ONLY_WARNING)


def analyze_shadow(
    records: Iterable[StudyEstimate | Mapping[str, Any]],
    *, confidence_level: float = 0.95,
) -> ShadowAnalysisResult:
    """Measure and pool claim-like records without touching production scores.

    A result is made for every eligible stratum, including strata with only
    refusals.  ``eligible_count`` is the denominator of the measured-quality
    share: parallel claims and explicitly directly-adjusted crossover/cluster
    claims.  All refusal reasons are retained in the corresponding result.
    """
    level = _finite(confidence_level, "confidence_level")
    if not 0.0 < level < 1.0:
        raise ValueError("confidence_level must be strictly between 0 and 1")
    groups: dict[str, list[StudyEstimate]] = defaultdict(list)
    for index, raw in enumerate(records):
        record = _coerce(raw, index)
        groups[_stratum(record)].append(record)

    results: list[OutcomeResult] = []
    for stratum, group in sorted(groups.items()):
        eligible = sum(1 for record in group if _eligible(record))
        measured: list[_Measured] = []
        refusals: Counter[str] = Counter()
        for record in group:
            try:
                measured.append(_measure(record))
            except (TypeError, ValueError, ZeroDivisionError, OverflowError) as exc:
                reason = str(exc) or "invalid_record"
                refusals[reason] += 1
        outcome = group[0].label
        results.append(_result(outcome, stratum, eligible, measured, refusals, level))
    return ShadowAnalysisResult(tuple(results), SHADOW_ONLY_WARNING)


# Descriptive aliases keep the experimental API easy to discover while making
# the word shadow unavoidable at call sites.
analyze_v13_shadow = analyze_shadow
run_shadow_analysis = analyze_shadow


__all__ = [
    "SHADOW_ONLY_WARNING", "StudyEstimate", "OutcomeResult",
    "ShadowAnalysisResult", "analyze_shadow", "analyze_v13_shadow",
    "run_shadow_analysis",
]


def _self_checks() -> None:
    """Comprehensive offline checks for the shadow-only contract."""
    def rec(**kwargs: Any) -> StudyEstimate:
        defaults = dict(study_id="x", outcome="strength", design_kind="parallel",
                        estimate_kind="mean_difference", effect_favours="ingredient",
                        effect_sd_basis="pooled", contrast="vs_ingredient_free")
        defaults.update(kwargs)
        return StudyEstimate(**defaults)

    # Orientation comes only from effect_favours, not from mean arithmetic.
    positive = analyze_shadow([rec(mean_ingredient=8, mean_control=10,
                                   effect_sd=2, n_ingredient=20, n_control=20)])
    assert positive.outcomes[0].measured_count == 1
    assert positive.outcomes[0].study_effects[0][1] > 0
    assert positive.outcomes[0].pooled_effect is None
    arm_sd = analyze_shadow([rec(mean_ingredient=8, mean_control=10,
                                 sd_ingredient=2, sd_control=2,
                                 n_ingredient=20, n_control=20)])
    assert arm_sd.outcomes[0].measured_count == 1
    negative = analyze_shadow([rec(mean_ingredient=8, mean_control=10,
                                   effect_sd=2, n_ingredient=20, n_control=20,
                                   effect_favours="control")])
    assert negative.outcomes[0].study_effects[0][1] < 0

    # Printed pooled SD works; baseline/control SD is recorded as a refusal.
    refused_sd = analyze_shadow([rec(mean_ingredient=8, mean_control=10,
                                     effect_sd=2, effect_sd_basis="baseline",
                                     n_ingredient=20, n_control=20)])
    assert refused_sd.outcomes[0].refusal_reasons["primary_pool_sd_not_pooled"] == 1
    assert refused_sd.outcomes[0].measured_count == 0

    # Labels are missing, never the old -0.35 numerical fallback.
    label = analyze_shadow([rec(effect_size=None, estimate_kind=None)])
    assert label.outcomes[0].measured_count == 0
    assert label.outcomes[0].pooled_effect is None
    assert "missing_effect_size" in label.outcomes[0].refusal_reasons

    # Reported SMD uncertainty routes: SE, explicit CI, and exact normal p.
    common = dict(study_id="r", outcome="reported", design_kind="parallel",
                  estimate_kind="smd", effect_size=.4,
                  effect_favours="ingredient", contrast="vs_ingredient_free")
    for extra in ({"standard_error": .2}, {"ci_low": .1, "ci_high": .7, "ci_level": .95},
                  {"p_value": .05, "p_value_kind": "exact", "p_sidedness": "two",
                   "test_distribution": "normal"}):
        assert analyze_shadow([StudyEstimate(**common, **extra)]).outcomes[0].measured_count == 1
    bad_ci = analyze_shadow([StudyEstimate(**common, ci_low=.1, ci_high=.7)])
    assert "ci_level_required" in bad_ci.outcomes[0].refusal_reasons
    bad_p = analyze_shadow([StudyEstimate(**common, p_value=.05, p_value_kind="less_than",
                                           p_sidedness="two", test_distribution="normal")])
    assert "p_value_not_exact" in bad_p.outcomes[0].refusal_reasons

    # Unadjusted crossover/cluster are refused; direct adjusted g+variance is not.
    cross = analyze_shadow([StudyEstimate(**{**common, "design_kind": "crossover",
                                              "standard_error": .2})])
    assert "crossover_or_cluster_unadjusted" in cross.outcomes[0].refusal_reasons
    adjusted = analyze_shadow([StudyEstimate(**{**common, "study_id": "adj",
                                                 "design_kind": "cluster",
                                                 "adjusted_estimate": .3,
                                                 "adjusted_variance": .04,
                                                 "directly_adjusted": True})])
    assert adjusted.outcomes[0].measured_count == 1

    # k=1 is not a pooled estimate; k=2 pools but explicitly cannot claim HK;
    # k>=3 uses the meta_effects REML + HK path.
    studies = [StudyEstimate(**{**common, "study_id": f"s{i}",
                                "effect_size": .2 + i / 20,
                                "standard_error": .2}) for i in range(3)]
    one = analyze_shadow(studies[:1]).outcomes[0]
    two = analyze_shadow(studies[:2]).outcomes[0]
    three = analyze_shadow(studies).outcomes[0]
    assert one.pooled_effect is None and one.measured_count == 1
    assert two.pooled_effect is not None and "k=2" in two.pooling_method
    assert three.pooled_effect is not None and "Hartung-Knapp" in three.pooling_method
    assert three.tau2 is not None and three.i2 is not None
    assert three.warning == SHADOW_ONLY_WARNING

    # Quality share includes an eligible but unmeasured parallel claim.
    quality = analyze_shadow([studies[0], StudyEstimate(
        study_id="q", outcome="reported", design_kind="parallel",
        estimate_kind="smd", effect_size=.4, effect_favours="ingredient",
        contrast="vs_ingredient_free")]).outcomes[0]
    assert quality.eligible_count == 2 and quality.measured_count == 1
    assert math.isclose(quality.measured_quality_share, .5)


if __name__ == "__main__":
    _self_checks()
    print("v13 shadow self-checks passed")
    print(SHADOW_ONLY_WARNING)
