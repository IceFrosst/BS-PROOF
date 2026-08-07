"""
Small-run previews. NO MODEL HERE.

The question this answers: *can a 10-study test run tell me what a 300-study run
would say, without paying for 300 extractions?*

Partly. The score decomposes into three terms with completely different
sampling behaviour, and conflating them is what makes small runs look broken:

    d   weighted MEAN of the findings   -> sample-size INDEPENDENT.
                                           Unbiased at n=5; only noisy.
    H   weighted variance               -> sample-size independent, same.
    c   1 - exp(-E'/k), E' = SUM of w   -> grows with n by construction.

So a small run's `d` is already an estimate of the full corpus's `d`. Its
`score` is not an estimate of the full corpus's `score`, because `c` has not
accumulated yet. Measured on a 240-study synthetic corpus:

    n     mean d    mean c    mean score      (true full-corpus score: +17)
    5      0.289     0.157        3.8
    40     0.263     0.772       16.3
    240    0.214     1.000       17.0

DO NOT "FIX" THIS BY SHRINKING k FOR SMALL RUNS. k is the number of RCT-
equivalents needed for confidence; it is a property of the evidence standard,
not of how many studies you happened to extract. Rescaling it per run would make
two runs of the same product incomparable and would silently inflate every test
number -- and invariant 4 forbids tuning a constant to make output look better.

Project instead: keep d and H from the sample, scale E to the full corpus, and
LABEL the result a projection.
"""
from __future__ import annotations
import math

from pipeline.scoring import K

# Below this the projection is not worth printing. Measured by resampling a
# 240-study corpus 60x at each n: mean absolute error against the true score was
# 42 points at n=5, 35 at n=10, 17 at n=20, 11 at n=40, 7 at n=80. A 40-point
# error spans four bands, which is not a preview, it is noise.
MIN_SAMPLE_FOR_PROJECTION = 20


def project(result: dict, n_sampled: int, n_total: int) -> dict:
    """
    `result` is a score_ecu() output over the sample.

    Returns the projected full-corpus score plus everything needed to judge how
    much to trust it. `projected` is None below MIN_SAMPLE_FOR_PROJECTION --
    refusing is better than printing a number with a four-band error bar.
    """
    if not n_sampled or result.get("score") is None:
        return {"projected": None, "reason": "no scored sample"}

    mean_w = result["E"] / n_sampled
    e_full = mean_w * n_total
    c_full = 1 - math.exp(-e_full / K)
    d, h = result["d"], result["H"]

    out = {
        "sample_score": result["score"],
        "d": round(d, 3), "H": round(h, 3),
        "mean_w": round(mean_w, 4),
        "c_sample": result["c"], "c_projected": round(c_full, 3),
        "E_sample": result["E"], "E_projected": round(e_full, 2),
        "n_sampled": n_sampled, "n_total": n_total,
        "projected": round(100 * d * c_full * (1 - 0.4 * h)),
        "expected_error": _expected_error(n_sampled),
    }
    if n_sampled < MIN_SAMPLE_FOR_PROJECTION:
        out["projected"] = None
        out["reason"] = (f"sample of {n_sampled} is below {MIN_SAMPLE_FOR_PROJECTION}; "
                         f"the projection would carry a multi-band error")
    return out


def _expected_error(n: int) -> int:
    """Mean absolute error of the projection, from the resampling measurement."""
    for cutoff, err in ((5, 42), (10, 35), (20, 17), (40, 11), (80, 7)):
        if n <= cutoff:
            return err
    return 5


def studies_needed(mean_w: float, target_c: float = 0.9) -> int:
    """
    How many studies of this QUALITY are needed to reach a given confidence.

    This is the token-budget question, and the answer is mostly about quality,
    not quantity. At mean_w = 0.023 (abstract-only, form unspecified) reaching
    c = 0.9 takes 300 studies. At mean_w = 0.14 (full text, exact form) it takes
    50. Improving extraction is an order of magnitude cheaper than extracting
    more of the same.
    """
    if mean_w <= 0:
        return 0
    return math.ceil(-K * math.log(1 - target_c) / mean_w)


def summarise(result: dict, n_sampled: int, n_total: int) -> str:
    """Human-readable preview block for a test run."""
    p = project(result, n_sampled, n_total)
    if p.get("projected") is None:
        return (f"  PREVIEW unavailable: {p.get('reason', 'no data')}\n"
                f"  direction d={p.get('d', '?')} is still the useful signal -- "
                f"it is sample-size independent.")
    need = studies_needed(p["mean_w"])
    return (
        f"  sample of {p['n_sampled']}/{p['n_total']}   score {p['sample_score']:+d}"
        f"   (c={p['c_sample']:.2f})\n"
        f"  PROJECTED full-corpus score  {p['projected']:+d}  +/- {p['expected_error']}"
        f"   (c would reach {p['c_projected']:.2f})\n"
        f"  direction d={p['d']:+.2f} is already unbiased; only c is missing.\n"
        f"  at this evidence quality (mean w={p['mean_w']:.3f}), c=0.9 needs "
        f"~{need} studies."
    )
