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

/** pipeline/scoring.py H_PENALTY — founder-owned; the heterogeneity discount inside the signed score. */
export const H_PENALTY = 0.4;

/**
 * Applicability A, 0..1 — mean(form strength, dose closeness). Port of
 * pipeline/arcs.py applicability (SCORING_MODEL v14). A missing form
 * contributes 0.0; a missing benefit dose range contributes the
 * MISSING_DOSE_PENALTY tier, so silence is priced rather than dropped.
 */
export function applicability(
  formStrengthScore: number | null,
  doseCloseness: number | null,
): number {
  const form = formStrengthScore === null ? 0.0 : formStrengthScore;
  const dose = doseCloseness !== null ? doseCloseness : MISSING_DOSE_PENALTY;
  return Math.max(0, Math.min(1, (form + dose) / 2));
}

/**
 * Python's round() is round-half-to-even; Math.round is round-half-up. The
 * composite is an integer the Python original produces with round(), so the
 * port must tie-break the same way or a x.5 headline differs by one between
 * the run report and the label analyzer.
 */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(x);
}

/**
 * The 0-100 headline (SCORING_MODEL v14-applicability-discount). Port of
 * pipeline/arcs.py composite:
 *
 *   signal    = d x c x (1 - H_PENALTY x H)     (= signed score / 100)
 *   composite = 50 + 50 x signal x (A if signal > 0 else 1)
 *
 * The headline is the signed score rescaled onto 0-100 and pulled back toward
 * 50 by however much of the evidence is NOT about this product. A negative
 * signal is never softened: harm and null are the burden of proof unmet, and an
 * untested form is no reason to read them as "unclear".
 */
export function composite(
  effectD: number | null,
  formStrengthScore: number | null,
  doseCloseness: number | null,
  c: number,
  h: number,
): number | null {
  if (effectD === null) return null;
  let signal = effectD * c * (1.0 - H_PENALTY * (h ?? 0));
  if (signal > 0) signal *= applicability(formStrengthScore, doseCloseness);
  return Math.max(0, Math.min(100, roundHalfEven(50.0 + 50.0 * signal)));
}

/**
 * Plain words for a composite. Port of pipeline/arcs.py label. Thresholds are
 * SPEC §9's signed bands mapped onto 0-100 (65 / 55 / 45 / 30), and the
 * applicability guard keeps a positive verdict pulled toward 50 by form/dose
 * from ever reading as a finding against the product.
 */
export function verdictLabel(
  compositeScore: number | null,
  c: number | null,
  effectVerdict: number | null = null,
  applicabilityLimited = false,
  applicabilityScore: number | null = null,
): string {
  if (compositeScore === null) return "not enough human evidence";
  if (c === null) return "confidence unknown";
  if (c < 0.15) return "barely studied";

  const limited = applicabilityLimited || (applicabilityScore !== null && applicabilityScore < 0.5);
  if (effectVerdict !== null && effectVerdict >= 0.25 && compositeScore < 55) {
    return limited ? "works, but not tested for your product" : "works, but weakly evidenced";
  }
  if (effectVerdict !== null && effectVerdict <= -0.25 && compositeScore >= 55) {
    return "does not work";
  }

  if (compositeScore >= 65) return "works";
  if (compositeScore >= 55) return "probably works";
  if (compositeScore >= 45) return "unclear";
  if (compositeScore >= 30) return "probably does not work";
  return "does not work";
}
