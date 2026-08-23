"""Pure-stdlib effect-size and random-effects meta-analysis utilities.

The module deliberately requires every quantity used in a calculation.  In
particular, a confidence level is never guessed and p-values are interpreted
only as *exact two-sided normal* p-values; no t quantile approximation is
provided.

Conventions
-----------
* Effects are in the direction ``arm_1 - arm_2``.
* Hedges' g uses the pooled within-arm standard deviation and the usual
  small-sample multiplier ``J = 1 - 3 / (4*df - 1)``.
* The sampling variance used for g is the common approximation
  ``(n1+n2)/(n1*n2) + g**2/(2*(n1+n2))``.
* REML tau squared is the non-negative root of the profile restricted
  likelihood score for an intercept-only model.  A boundary root is zero.

This file has no third-party dependencies.  It is intentionally standalone so
that the numerical checks at the bottom can also be run with ``python3``.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Optional, Sequence, Tuple, Union


Number = Union[int, float]


@dataclass(frozen=True)
class EffectEstimate:
    """An effect and its known within-study sampling variance."""

    effect: float
    variance: float

    def __post_init__(self) -> None:
        _finite(self.effect, "effect")
        _positive(self.variance, "variance")

    @property
    def standard_error(self) -> float:
        return math.sqrt(self.variance)

    @property
    def se(self) -> float:
        return self.standard_error

    @property
    def g(self) -> float:
        """Alias useful when an effect is specifically Hedges' g."""
        return self.effect


@dataclass(frozen=True)
class HedgesGEstimate:
    """Hedges' g together with its construction details."""

    g: float
    variance: float
    standard_error: float
    cohens_d: float
    correction: float
    pooled_sd: float
    n1: int
    n2: int

    @property
    def effect(self) -> float:
        return self.g


@dataclass(frozen=True)
class PooledEstimate:
    """Inverse-variance pooled estimate."""

    estimate: float
    variance: float
    standard_error: float
    tau2: float = 0.0

    @property
    def effect(self) -> float:
        return self.estimate

    @property
    def se(self) -> float:
        return self.standard_error


@dataclass(frozen=True)
class MetaAnalysisResult:
    """Summary of an intercept-only random-effects meta-analysis."""

    estimate: float
    variance: float
    standard_error: float
    ci_lower: float
    ci_upper: float
    prediction_lower: float
    prediction_upper: float
    q: float
    i2: float
    tau2: float
    k: int
    df: int
    confidence_level: float
    fixed_effect: PooledEstimate
    hartung_knapp_variance: Optional[float] = None
    warnings: Tuple[str, ...] = ()

    @property
    def pooled(self) -> PooledEstimate:
        return PooledEstimate(self.estimate, self.variance, self.standard_error, self.tau2)

    @property
    def ci(self) -> Tuple[float, float]:
        return (self.ci_lower, self.ci_upper)

    @property
    def prediction_interval(self) -> Tuple[float, float]:
        return (self.prediction_lower, self.prediction_upper)

    @property
    def mu(self) -> float:
        return self.estimate

    @property
    def se(self) -> float:
        return self.standard_error

    @property
    def Q(self) -> float:
        return self.q

    @property
    def I2(self) -> float:
        return self.i2

    @property
    def tau_squared(self) -> float:
        return self.tau2

    @property
    def normal_ci(self) -> Tuple[float, float]:
        return self.ci


# ---- validation and normal quantiles -------------------------------------


def _finite(value: Number, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{name} must be a real number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be finite")
    return result


def _positive(value: Number, name: str) -> float:
    result = _finite(value, name)
    if result <= 0.0:
        raise ValueError(f"{name} must be > 0")
    return result


def _nonnegative(value: Number, name: str) -> float:
    result = _finite(value, name)
    if result < 0.0:
        raise ValueError(f"{name} must be >= 0")
    return result


def _sample_size(value: int, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    if value < 2:
        raise ValueError(f"{name} must be >= 2")
    return value


def _confidence_level(value: Number) -> float:
    value = _finite(value, "confidence_level")
    if not 0.0 < value < 1.0:
        raise ValueError("confidence_level must be strictly between 0 and 1")
    return value


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def normal_ppf(probability: Number) -> float:
    """Return the standard-normal quantile using Acklam's rational formula."""
    p = _finite(probability, "probability")
    if not 0.0 < p < 1.0:
        raise ValueError("probability must be strictly between 0 and 1")

    # Peter J. Acklam's published coefficients (public-domain implementation).
    a = (-3.969683028665376e01, 2.209460984245205e02,
         -2.759285104469687e02, 1.383577518672690e02,
         -3.066479806614716e01, 2.506628277459239e00)
    b = (-5.447609879822406e01, 1.615858368580409e02,
         -1.556989798598866e02, 6.680131188771972e01,
         -1.328068155288572e01)
    c = (-7.784894002430293e-03, -3.223964580411365e-01,
         -2.400758277161838e00, -2.549732539343734e00,
         4.374664141464968e00, 2.938163982698783e00)
    d = (7.784695709041462e-03, 3.224671290700398e-01,
         2.445134137142996e00, 3.754408661907416e00)
    low, high = 0.02425, 1.0 - 0.02425
    def _horner(coefficients: Tuple[float, ...], value: float) -> float:
        result = coefficients[0]
        for coefficient in coefficients[1:]:
            result = result * value + coefficient
        return result

    if p < low:
        q = math.sqrt(-2.0 * math.log(p))
        return _horner(c, q) / (_horner(d, q) * q + 1.0)
    if p > high:
        q = math.sqrt(-2.0 * math.log(1.0 - p))
        return -_horner(c, q) / (_horner(d, q) * q + 1.0)
    q = p - 0.5
    r = q * q
    numerator = _horner(a, r) * q
    denominator = _horner(b, r) * r + 1.0
    return numerator / denominator


# ---- effect sizes and standard errors -----------------------------------


def pooled_sd(sd1: Number, n1: int, sd2: Number, n2: int) -> float:
    """Return the unbiased pooled within-arm standard deviation."""
    s1, s2 = _nonnegative(sd1, "sd1"), _nonnegative(sd2, "sd2")
    n1, n2 = _sample_size(n1, "n1"), _sample_size(n2, "n2")
    df = n1 + n2 - 2
    return math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / df)


def sampling_variance_g(g: Number, n1: int, n2: int) -> float:
    """Approximate sampling variance of Hedges' g.

    This is the commonly used ``N/(n1*n2) + g^2/(2*N)`` approximation;
    callers must supply g rather than asking this function to infer it.
    """
    value = _finite(g, "g")
    n1, n2 = _sample_size(n1, "n1"), _sample_size(n2, "n2")
    total = n1 + n2
    return total / (n1 * n2) + value * value / (2.0 * total)


def hedges_g(mean1: Number, sd1: Number, n1: int,
             mean2: Number, sd2: Number, n2: int) -> HedgesGEstimate:
    """Calculate two-arm Hedges' g with the small-sample correction."""
    m1, m2 = _finite(mean1, "mean1"), _finite(mean2, "mean2")
    n1, n2 = _sample_size(n1, "n1"), _sample_size(n2, "n2")
    s = pooled_sd(sd1, n1, sd2, n2)
    df = n1 + n2 - 2
    correction = 1.0 - 3.0 / (4.0 * df - 1.0)
    if s == 0.0:
        if m1 != m2:
            raise ValueError("pooled SD is zero but means differ")
        d = 0.0
    else:
        d = (m1 - m2) / s
    g = correction * d
    variance = sampling_variance_g(g, n1, n2)
    return HedgesGEstimate(g, variance, math.sqrt(variance), d, correction, s, n1, n2)


# Descriptive aliases keep the API discoverable without changing semantics.
hedges_g_estimate = hedges_g
calculate_hedges_g = hedges_g
hedges_g_variance = sampling_variance_g
variance_g = sampling_variance_g
calculate_sampling_variance_g = sampling_variance_g


def se_from_ci(lower: Number, upper: Number, confidence_level: Number) -> float:
    """Derive SE from a symmetric normal CI with an explicit level."""
    lo, hi = _finite(lower, "lower"), _finite(upper, "upper")
    level = _confidence_level(confidence_level)
    if not lo < hi:
        raise ValueError("lower must be less than upper")
    z = normal_ppf(0.5 + level / 2.0)
    return (hi - lo) / (2.0 * z)


standard_error_from_ci = se_from_ci


def se_from_normal_p(effect: Number, two_sided_p: Number) -> float:
    """Derive SE from an exact two-sided *normal* p-value only.

    A p-value of zero, or p=1 with a zero effect, does not determine a finite
    standard error and is rejected.  This function intentionally does not
    invert t statistics.
    """
    estimate = _finite(effect, "effect")
    p = _finite(two_sided_p, "two_sided_p")
    if not 0.0 < p < 1.0:
        raise ValueError("two_sided_p must be strictly between 0 and 1")
    z = normal_ppf(1.0 - p / 2.0)
    if estimate == 0.0:
        raise ValueError("zero effect with a normal p-value does not identify SE")
    return abs(estimate) / z


standard_error_from_normal_p = se_from_normal_p
se_from_p = se_from_normal_p
standard_error_from_p = se_from_normal_p
se_from_p_value = se_from_normal_p


# ---- pooling and REML ----------------------------------------------------


def _studies(effects: Sequence[Union[Number, EffectEstimate]],
             variances: Optional[Sequence[Number]]) -> Tuple[Tuple[float, ...], Tuple[float, ...]]:
    if not isinstance(effects, Sequence) or isinstance(effects, (str, bytes)):
        raise TypeError("effects must be a sequence")
    if len(effects) == 0:
        raise ValueError("at least one study is required")
    if variances is not None:
        if not isinstance(variances, Sequence) or isinstance(variances, (str, bytes)):
            raise TypeError("variances must be a sequence")
        if len(effects) != len(variances):
            raise ValueError("effects and variances must have equal length")
        ys = tuple(_finite(x, "effect") for x in effects)  # type: ignore[arg-type]
        vs = tuple(_positive(x, "variance") for x in variances)
        return ys, vs
    if not all(isinstance(x, EffectEstimate) for x in effects):
        raise ValueError("variances are required for numeric effects")
    return tuple(x.effect for x in effects), tuple(x.variance for x in effects)  # type: ignore[union-attr]


def inverse_variance_pool(effects: Sequence[Union[Number, EffectEstimate]],
                          variances: Optional[Sequence[Number]] = None,
                          tau2: Number = 0.0) -> PooledEstimate:
    """Pool effects with weights ``1/(vi + tau2)``."""
    ys, vs = _studies(effects, variances)
    extra = _nonnegative(tau2, "tau2")
    weights = tuple(1.0 / (v + extra) for v in vs)
    total = math.fsum(weights)
    estimate = math.fsum(w * y for w, y in zip(weights, ys)) / total
    variance = 1.0 / total
    return PooledEstimate(estimate, variance, math.sqrt(variance), extra)


pool_inverse_variance = inverse_variance_pool


def _reml_score(tau2: float, ys: Tuple[float, ...], vs: Tuple[float, ...]) -> float:
    weights = tuple(1.0 / (v + tau2) for v in vs)
    sw = math.fsum(weights)
    mean = math.fsum(w * y for w, y in zip(weights, ys)) / sw
    return 0.5 * (math.fsum(w * w * (y - mean) ** 2 for w, y in zip(weights, ys))
                   + math.fsum(w * w for w in weights) / sw - sw)


def reml_tau2(effects: Sequence[Union[Number, EffectEstimate]],
              variances: Optional[Sequence[Number]] = None) -> float:
    """Numerically solve the non-negative intercept-only REML score equation."""
    ys, vs = _studies(effects, variances)
    if len(ys) < 2:
        raise ValueError("REML requires at least two studies")
    at_zero = _reml_score(0.0, ys, vs)
    if at_zero <= 0.0:
        return 0.0
    lo, hi = 0.0, max(1.0, max(vs))
    for _ in range(256):
        if _reml_score(hi, ys, vs) <= 0.0:
            break
        hi *= 2.0
    else:
        raise ArithmeticError("could not bracket the REML tau2 root")
    for _ in range(160):
        mid = (lo + hi) / 2.0
        if _reml_score(mid, ys, vs) > 0.0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


reml_tau_squared = reml_tau2
estimate_tau2_reml = reml_tau2


def heterogeneity_q(effects: Sequence[Union[Number, EffectEstimate]],
                    variances: Optional[Sequence[Number]] = None) -> float:
    """Cochran's Q using fixed-effect inverse-variance weights."""
    ys, vs = _studies(effects, variances)
    fixed = inverse_variance_pool(ys, vs)
    return math.fsum((y - fixed.estimate) ** 2 / v for y, v in zip(ys, vs))


def i_squared(q: Number, k: int) -> float:
    qv = _nonnegative(q, "q")
    if isinstance(k, bool) or not isinstance(k, int) or k < 2:
        raise ValueError("k must be an integer >= 2")
    return max(0.0, min(1.0, (qv - (k - 1)) / qv)) if qv > 0.0 else 0.0


def hartung_knapp_variance(effects: Sequence[Union[Number, EffectEstimate]],
                           variances: Optional[Sequence[Number]] = None,
                           tau2: Number = 0.0, *, truncate: bool = True) -> float:
    """Return the Hartung--Knapp variance for an intercept-only model.

    HK is refused for k < 3 because its residual variance estimate has no
    useful degrees of freedom at that size.  ``truncate`` applies the usual
    HK-SJ lower bound of one to the scale factor.
    """
    ys, vs = _studies(effects, variances)
    if len(ys) < 3:
        raise ValueError("Hartung-Knapp variance requires k >= 3 studies")
    extra = _nonnegative(tau2, "tau2")
    weights = tuple(1.0 / (v + extra) for v in vs)
    sw = math.fsum(weights)
    mean = math.fsum(w * y for w, y in zip(weights, ys)) / sw
    scale = math.fsum(w * (y - mean) ** 2 for w, y in zip(weights, ys)) / (len(ys) - 1)
    if truncate:
        scale = max(1.0, scale)
    return scale / sw


def random_effects_meta_analysis(
    effects: Sequence[Union[Number, EffectEstimate]],
    variances: Optional[Sequence[Number]] = None,
    *, confidence_level: Number,
    use_hartung_knapp: bool = False,
) -> MetaAnalysisResult:
    """Compute REML random-effects pooling and normal CI/prediction interval."""
    ys, vs = _studies(effects, variances)
    if len(ys) < 2:
        raise ValueError("meta-analysis requires at least two studies")
    level = _confidence_level(confidence_level)
    z = normal_ppf(0.5 + level / 2.0)
    fixed = inverse_variance_pool(ys, vs)
    q = math.fsum((y - fixed.estimate) ** 2 / v for y, v in zip(ys, vs))
    tau2 = reml_tau2(ys, vs)
    pooled = inverse_variance_pool(ys, vs, tau2)
    hk_var: Optional[float] = None
    warnings = []
    if use_hartung_knapp:
        # The helper raises the explicit k<3 refusal required by the API.
        hk_var = hartung_knapp_variance(ys, vs, tau2)
        variance = hk_var
        se = math.sqrt(variance)
        warnings.append("Hartung-Knapp variance selected; intervals use normal critical values")
    else:
        variance, se = pooled.variance, pooled.standard_error
    ci_lo, ci_hi = pooled.estimate - z * se, pooled.estimate + z * se
    pred_se = math.sqrt(variance + tau2)
    pred_lo, pred_hi = pooled.estimate - z * pred_se, pooled.estimate + z * pred_se
    return MetaAnalysisResult(pooled.estimate, variance, se, ci_lo, ci_hi,
                              pred_lo, pred_hi, q, i_squared(q, len(ys)), tau2,
                              len(ys), len(ys) - 1, level, fixed, hk_var,
                              tuple(warnings))


meta_analysis = random_effects_meta_analysis


__all__ = [
    "EffectEstimate", "HedgesGEstimate", "PooledEstimate", "MetaAnalysisResult",
    "normal_ppf", "pooled_sd", "hedges_g", "hedges_g_estimate",
    "calculate_hedges_g", "sampling_variance_g", "hedges_g_variance",
    "variance_g", "calculate_sampling_variance_g", "se_from_ci",
    "standard_error_from_ci", "se_from_normal_p", "standard_error_from_normal_p",
    "se_from_p", "standard_error_from_p", "se_from_p_value", "inverse_variance_pool",
    "pool_inverse_variance", "reml_tau2", "reml_tau_squared",
    "estimate_tau2_reml", "heterogeneity_q", "i_squared",
    "hartung_knapp_variance", "random_effects_meta_analysis", "meta_analysis",
]


if __name__ == "__main__":
    # Fixed numerical checks based on the formulas documented above.  The
    # first fixture is the standard pooled-SD/Hedges-g worked example; the
    # second is a fixed three-study REML intercept example (all values are
    # intentionally embedded so this file remains independently executable).
    def _close(actual: float, expected: float, tol: float = 1e-10) -> None:
        if not math.isclose(actual, expected, rel_tol=tol, abs_tol=tol):
            raise AssertionError(f"{actual!r} != {expected!r}")

    _close(pooled_sd(0.5, 10, 0.6, 12), 0.5572252686302013)
    fixture = hedges_g(1.2, 0.5, 10, 0.8, 0.6, 12)
    _close(fixture.g, 0.6905826929353683)
    _close(fixture.variance, 0.19417207096473935)
    _close(se_from_ci(-0.2, 0.6, 0.95), 0.20408538260532608)
    _close(se_from_normal_p(0.4, 0.04550026389635842), 0.2, 1e-9)

    ys = (0.2, 0.8, 1.1)
    vs = (0.04, 0.09, 0.16)
    result = random_effects_meta_analysis(ys, vs, confidence_level=0.95)
    _close(result.q, 5.495901639344264)
    _close(result.tau2, 0.14027838404332837, 1e-8)
    _close(result.estimate, 0.6238161753693794, 1e-8)
    _close(result.i2, 0.6360924683072335, 1e-8)
    assert result.ci_lower < result.estimate < result.ci_upper
    assert result.prediction_lower < result.estimate < result.prediction_upper
    _close(hartung_knapp_variance(ys, vs, result.tau2), 0.07564416819442078, 1e-8)

    try:
        random_effects_meta_analysis((0.1, 0.2), (0.01, 0.02), confidence_level=0.95,
                                     use_hartung_knapp=True)
    except ValueError as exc:
        assert "k >= 3" in str(exc)
    else:
        raise AssertionError("k<3 Hartung-Knapp must be refused")
    print("meta_effects self-checks passed")
