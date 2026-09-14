/*
 * Units a person may TYPE for a per-serving dose on the manual search path.
 *
 * Exactly three, all mass units, all exact factors: mg, g, mcg. Nothing here
 * is substance-specific. IU is deliberately absent — an IU is a biological
 * unit whose mass equivalent depends on WHICH substance is measured (40 IU of
 * vitamin D3 is 1 mcg; 1 IU of vitamin E is 0.67 mg of d-alpha-tocopherol or
 * 0.9 mg of the synthetic form), so accepting it would mean guessing the
 * conversion from the ingredient, which is invariant 5's "never infer a field
 * you cannot see". A label that prints IU almost always prints the mass beside
 * it; the user enters that.
 *
 * Pure and dependency-free so both the client form and the route validator can
 * import it without pulling `node:fs` into the browser bundle. The form and the
 * server validate through the SAME `checkManualDose` / `checkServingsPerDay`
 * so the two cannot disagree about what is accepted.
 */

export const MANUAL_DOSE_UNITS = ["mg", "g", "mcg"] as const;
export type ManualDoseUnit = (typeof MANUAL_DOSE_UNITS)[number];

/**
 * INPUT SANITY LIMITS — form/transport hygiene, NOT scoring constants.
 *
 * These bound what a typed field may carry so a huge or absurd number cannot
 * overflow the conversion (1e308 g → Infinity mg) or travel into the scorer
 * as a "dose". They say nothing about what dose is effective, safe or plausible
 * for any ingredient — the dose axis derives its bands from trials
 * (`pipeline/dose.py`) and this ceiling is far above anything a label prints.
 * 100 g per serving is more than a serving of anything sold as a supplement;
 * 24 servings a day is one an hour. Neither is cited in docs/SPEC.md and
 * neither belongs there.
 */
export const MAX_MANUAL_DOSE_MG = 100_000;
export const MAX_SERVINGS_PER_DAY = 24;

/** Exact multipliers to milligrams. */
const TO_MG: Record<ManualDoseUnit, number> = { mg: 1, g: 1000, mcg: 0.001 };

export function isManualDoseUnit(unit: unknown): unit is ManualDoseUnit {
  return typeof unit === "string" && (MANUAL_DOSE_UNITS as readonly string[]).includes(unit);
}

/** The dose ceiling expressed in the unit the user is typing, for the field's `max`. */
export function maxManualDoseInUnit(unit: ManualDoseUnit): number {
  return MAX_MANUAL_DOSE_MG / TO_MG[unit];
}

export type ManualDoseCheck = { ok: true; mg: number } | { ok: false; error: string };

/**
 * Validate and convert a typed per-serving amount to milligrams, with the
 * reason on refusal. Refuses a bad unit, anything that is not a finite
 * positive number, a conversion that is not finite, and a result above the
 * sanity ceiling. The caller must surface the refusal, never substitute a dose.
 */
export function checkManualDose(value: unknown, unit: unknown): ManualDoseCheck {
  if (!isManualDoseUnit(unit)) {
    return { ok: false, error: `The dose unit must be one of ${MANUAL_DOSE_UNITS.join(", ")}. IU is not accepted — enter the mass printed beside it.` };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "The dose must be a positive number." };
  }
  // Round away float noise (25 * 0.001 = 0.025000000000000001) at a precision
  // no label reaches; the conversion factors themselves are exact.
  const mg = Math.round(value * TO_MG[unit] * 1e6) / 1e6;
  if (!Number.isFinite(mg) || mg > MAX_MANUAL_DOSE_MG) {
    return { ok: false, error: `The dose is too large to be a per-serving amount — the form accepts up to ${maxManualDoseInUnit(unit)} ${unit} per serving.` };
  }
  if (mg <= 0) {
    // A value so small it rounds to nothing is not a dose either.
    return { ok: false, error: "The dose must be a positive number." };
  }
  return { ok: true, mg };
}

/**
 * Convert a typed per-serving amount to milligrams. Returns null for anything
 * `checkManualDose` refuses — the caller must surface "no usable dose", never
 * substitute one.
 */
export function doseToMg(value: unknown, unit: unknown): number | null {
  const checked = checkManualDose(value, unit);
  return checked.ok ? checked.mg : null;
}

export type ServingsCheck = { ok: true; servings: number } | { ok: false; error: string };

/**
 * Servings per day is a COUNT: a positive integer, capped at the form's sanity
 * limit. A fraction ("1.5 servings") or a huge number is refused, not rounded.
 */
export function checkServingsPerDay(value: unknown): ServingsCheck {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return { ok: false, error: "Servings per day must be a whole number of 1 or more, or left empty." };
  }
  if (value > MAX_SERVINGS_PER_DAY) {
    return { ok: false, error: `Servings per day must be ${MAX_SERVINGS_PER_DAY} or fewer.` };
  }
  return { ok: true, servings: value };
}
