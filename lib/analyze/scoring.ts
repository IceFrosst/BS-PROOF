/*
 * TypeScript ports of the four deterministic scoring functions the label-upload
 * route needs at request time. Vercel has no Python runtime, so these cannot be
 * reached by spawning `scripts/analyze_label.py` — they had to be ported.
 *
 * PORTS, NOT A SECOND SCORING MODEL. Each function is a line-for-line port of
 * its Python original, named beside it here:
 *
 *   doseFactorFor   <- pipeline/dose.py     dose_factor_for   (v10 ramp)
 *   doseMatchFor    <- pipeline/dose.py     dose_match_for
 *   composite       <- pipeline/arcs.py     composite         (v12 dose term)
 *   verdictLabel    <- pipeline/arcs.py     label
 *
 * CLAUDE.md's own warning applies to this file: "two copies of the same number
 * is how they disagree later." The mitigation is tests/analyze-parity.test.ts,
 * which pins every function to golden values COMPUTED BY THE PYTHON ORIGINALS
 * (tests/golden_scoring_parity.json, regenerated from pipeline/*). If a founder
 * retunes a constant or reshapes a ramp in Python, that test fails here until
 * this file is re-ported — a loud disagreement instead of a silent one.
 *
 * The constants below are the founder-owned values from pipeline/scoring.py
 * (invariant 4). Do not retune them here; they move only when Python moves.
 */

/** pipeline/scoring.py DOSE_FACTOR — founder-owned, awaiting Tier-3 calibration. */
export const DOSE_FACTOR = {
  in_band: 1.0,
  low_50_99: 0.45,
  below_50: 0.1,
  above_200: 0.6,
} as const;

/** pipeline/arcs.py MISSING_DOSE_PENALTY = DOSE_FACTOR["below_50"]. */
export const MISSING_DOSE_PENALTY = DOSE_FACTOR.below_50;

export interface DoseBand {
  low: number | null;
  high: number | null;
}

/**
 * Continuous dose credit in [0.10, 1.00], or null when unassessable.
 * Port of pipeline/dose.py dose_factor_for — flat 1.00 inside the observed
 * band, linear ramps outside whose knots are the DOSE_FACTOR values
 * (1.00 at band-low -> 0.10 at half of it; 1.00 at band-high -> 0.60 at twice
 * it, clamped beyond). An interval dose takes the MINIMUM over its endpoints.
 */
export function doseFactorFor(
  doseLow: number | null,
  doseHigh: number | null,
  band: DoseBand,
): number | null {
  if (band.low === null || band.high === null || doseLow === null || doseHigh === null) {
    return null;
  }
  const lo = band.low;
  const hi = band.high;
  if (lo <= 0 || hi <= 0) return null;
  const floorLo = DOSE_FACTOR.below_50;
  const floorHi = DOSE_FACTOR.above_200;

  const f = (d: number): number => {
    if (d < lo) {
      if (d <= 0.5 * lo) return floorLo;
      return floorLo + (1.0 - floorLo) * ((d - 0.5 * lo) / (0.5 * lo));
    }
    if (d > hi) {
      if (d >= 2 * hi) return floorHi;
      return 1.0 + ((floorHi - 1.0) * (d - hi)) / hi;
    }
    return 1.0;
  };

  return Math.round(Math.min(f(doseLow), f(doseHigh)) * 10000) / 10000;
}

/**
 * Product dose vs the effective band -> a DOSE_FACTOR tier key.
 * Port of pipeline/dose.py dose_match_for, including its documented quirk that
 * doses up to 2x band-high still read "in_band" (an open task exists to split
 * that into its own tier; the fix lands in Python first, then re-ports here).
 */
export function doseMatchFor(
  productLow: number | null,
  productHigh: number | null,
  band: DoseBand,
): string {
  if (band.low === null || band.high === null || productLow === null || productHigh === null) {
    return "unspecified";
  }
  const lo = band.low;
  const hi = band.high;

  const tier = (dose: number): string => {
    if (dose < 0.5 * lo) return "below_50";
    if (dose < lo) return "low_50_99";
    if (dose > 2 * hi) return "above_200";
    return "in_band";
  };

  const tLow = tier(productLow);
  const tHigh = tier(productHigh);
  return tLow === tHigh ? tLow : "unspecified";
}

/** pipeline/arcs.py _unit: signed verdict -1..+1 -> 0..1; 0.5 is "no effect". */
function unit(d: number): number {
  return (d + 1.0) / 2.0;
}

/**
 * The 0-100 headline: 100 x c x mean(effect, form, dose).
 * Port of pipeline/arcs.py composite. The form term arrives already on 0..1
 * (an evidence-strength score, NOT unit()ed — a strength of 0.0 must read as
 * zero credit, not "no effect"). The dose term is v12 closeness, also 0..1;
 * null means no benefit range exists and takes the missing-dose penalty so
 * silence is not a pass.
 */
export function composite(
  effectD: number | null,
  formStrengthScore: number | null,
  doseCloseness: number | null,
  c: number,
): number | null {
  if (effectD === null) return null;
  const eff = unit(effectD);
  const form = formStrengthScore === null ? 0.0 : formStrengthScore;
  const dose = doseCloseness !== null ? doseCloseness : eff * MISSING_DOSE_PENALTY;
  return Math.round(100 * c * ((eff + form + dose) / 3));
}

/**
 * Plain words for a composite. Port of pipeline/arcs.py label, including the
 * applicability guard: a positive effect dragged below 45 by form/dose
 * applicability must never read as "probably does not work".
 */
export function verdictLabel(
  compositeScore: number | null,
  c: number | null,
  effectVerdict: number | null = null,
  applicabilityLimited = false,
): string {
  if (compositeScore === null) return "not enough human evidence";
  if (c === null) return "confidence unknown";
  if (c < 0.15) return "barely studied";

  if (effectVerdict !== null && effectVerdict >= 0.25 && compositeScore < 45) {
    return applicabilityLimited
      ? "works, but not tested for your product"
      : "works, but weakly evidenced";
  }
  if (effectVerdict !== null && effectVerdict <= -0.25 && compositeScore >= 55) {
    return "does not work";
  }

  if (compositeScore >= 70) return "works";
  if (compositeScore >= 55) return "probably works";
  if (compositeScore >= 45) return "unclear";
  if (compositeScore >= 25) return "probably does not work";
  return "does not work";
}
