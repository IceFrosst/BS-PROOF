"""
Effective dose range, derived from the trials themselves. NO MODEL HERE.

SPEC section 5 says dose bands are "derived from data: cluster the doses actually
used in trials for that ingredient". This is that derivation, and it is the input
to the third arc of the donut: *is the dose in your bottle the dose that worked?*

The chain is:

    S7   -> compound dose per trial      (a reading, not a judgement)
    vocab-> elemental / active-moiety mg (molar-mass arithmetic, deterministic)
    S5   -> direction per trial          (benefit / null / harm)
    here -> the interval where benefit actually occurred

INVENTS NOTHING. The band is the observed min-max of doses among trials that
found a benefit. That is a *description of the data*, not a chosen threshold --
picking a percentile or a margin would be a new free constant, which invariant 4
forbids. The comparison tiers (in_band / low_50_99 / below_50 / above_200) are
already specified in SPEC section 8 and are used unchanged.

A dose we could not convert is EXCLUDED, never guessed. Hydrate-ambiguous salts
return a bounded interval instead of a point, and an interval that straddles the
band edge resolves to "unspecified" rather than being rounded to the likelier
side.
"""
from __future__ import annotations

# Bumped when bands are re-derived. band_version 0 means "no dose axis at all";
# 1 means "band derived from observed benefit doses". A change invalidates every
# cached ECU carrying an older version -- storage.stale_bands() lists them.
BAND_VERSION_OBSERVED = 1


def _point(entry: dict) -> float | None:
    """
    One trial's dose as a single number, or None.

    A bounded interval (hydrate-ambiguous salt) collapses to its midpoint ONLY
    for the purpose of describing the observed band. It is never used to judge a
    product's dose -- see dose_match_for, which keeps the interval intact.
    """
    lo, hi = entry.get("dose_low_mg"), entry.get("dose_high_mg")
    if lo is None or hi is None:
        return None
    return (lo + hi) / 2


def observed_range(entries: list[dict]) -> dict:
    """
    Every dose the trials used, regardless of what they found.
    `entries`: [{"dose_low_mg", "dose_high_mg", "direction", "weight"}, ...]
    """
    doses = [d for d in (_point(e) for e in entries) if d is not None]
    return {"low": min(doses) if doses else None,
            "high": max(doses) if doses else None,
            "n_with_dose": len(doses), "n_total": len(entries)}


def effective_range(entries: list[dict]) -> dict:
    """
    The dose interval in which benefit was actually observed.

    Returns {low, high, n_benefit, n_null, null_range, band_version, basis}.

    `low`/`high` are None when no benefit trial reported a usable dose -- which
    is a real and common answer, not a failure. The caller must then treat the
    dose axis as unassessed rather than assuming the product's dose is fine.

    The null-effect doses are reported alongside on purpose: a product dosed
    where trials repeatedly found NOTHING is the single most useful thing this
    axis can tell a buyer, and it is invisible if you only keep the benefit band.
    """
    benefit, null = [], []
    for e in entries:
        d = _point(e)
        if d is None:
            continue
        if e.get("direction") == "benefit":
            benefit.append(d)
        elif e.get("direction") == "null_effect":
            null.append(d)

    return {
        "low": min(benefit) if benefit else None,
        "high": max(benefit) if benefit else None,
        "n_benefit": len(benefit),
        "n_null": len(null),
        "null_range": {"low": min(null), "high": max(null)} if null else None,
        "band_version": BAND_VERSION_OBSERVED if benefit else 0,
        "basis": "observed_benefit_doses" if benefit else "no_dosed_benefit_trial",
    }


def dose_match_for(product_low: float | None, product_high: float | None,
                   band: dict) -> str:
    """
    Product dose vs the effective band -> a DOSE_FACTOR key (SPEC section 8):

        in_band     inside the range trials found effective          1.00
        low_50_99   50-99% of the low end                            0.45
        below_50    under half the low end                           0.10
        above_200   more than twice the high end                     0.60
        unspecified no band, no dose, or an interval that straddles  (0.45 default)

    An ambiguous product dose is NOT rounded to the likelier tier. A hydrate
    salt whose bounded interval spans the band edge genuinely does not have an
    answer, and inventing one here would silently move the score.
    """
    if band.get("low") is None or product_low is None or product_high is None:
        return "unspecified"

    lo, hi = band["low"], band["high"]

    def tier(dose: float) -> str:
        if dose < 0.5 * lo:
            return "below_50"
        if dose < lo:
            return "low_50_99"
        if dose > 2 * hi:
            return "above_200"
        return "in_band"

    t_low, t_high = tier(product_low), tier(product_high)
    # The interval lands in two different tiers -> no defensible single answer.
    return t_low if t_low == t_high else "unspecified"


def coverage_fraction(band: dict, entries: list[dict]) -> float:
    """
    How much of this ECU's evidence carries a usable dose at all.

    This is the honest fill level for a dose arc: a band derived from 2 of 40
    trials should not render as a confident answer.
    """
    total = len(entries) or 1
    dosed = sum(1 for e in entries if _point(e) is not None)
    return round(dosed / total, 3)
