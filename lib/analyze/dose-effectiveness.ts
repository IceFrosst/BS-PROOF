/*
 * DOSE EFFECTIVENESS, read off the scored rows. Deterministic; no model.
 *
 * The scorer already answers "how close is your dose to the range where trials
 * found benefit" per outcome (SCORING_MODEL v12 closeness, the dose arc). This
 * module turns those row fields into one section a buyer can read: the dose
 * that was scored, the benefit range, the range where trials found nothing,
 * and a plain-language reading per outcome. Every sentence is a template over
 * numbers the row already carries -- nothing is inferred.
 *
 * Which dose is scored: trials report DAILY doses, so when the label states
 * servings per day the daily elemental dose (per-serving x servings) is the
 * comparable quantity. When servings are not printed the per-serving dose is
 * scored and the section says so -- never assume one serving a day.
 */
import type { Basis } from "./compatibility";

type NullableNumber = number | null;

export interface DoseRowInput {
  outcome: string;
  outcome_label: string | null;
  composite: NullableNumber;
  verdict: string | null;
  arcs: { dose?: { closeness?: NullableNumber; product_match?: string | null; coverage?: NullableNumber } };
  benefit_dose_range_mg: { low: NullableNumber; high: NullableNumber; basis?: string | null } | null;
  null_dose_range_mg: { low: NullableNumber; high: NullableNumber } | null;
}

export interface DoseOutcomeReading {
  outcome: string;
  outcome_label: string | null;
  closeness: NullableNumber;
  product_match: string | null;
  benefit_range_mg: { low: NullableNumber; high: NullableNumber } | null;
  null_range_mg: { low: NullableNumber; high: NullableNumber } | null;
  dosed_evidence_share: NullableNumber;
  reading: string;
  tone: "in_range" | "below" | "above" | "unassessable";
}

export interface DoseEffectivenessSection {
  status: "ok" | "dose_unavailable" | "not_scored";
  basis: Basis;
  per_serving_elemental_mg: NullableNumber;
  servings_per_day: NullableNumber;
  daily_elemental_mg: NullableNumber;
  scored_dose_mg: NullableNumber;
  scored_dose_basis: "daily" | "per_serving" | "none";
  conversion_basis: string;
  outcomes: DoseOutcomeReading[];
  note: string;
}

export function mg(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
}

/** The elemental dose the scorer should see, and why. */
export function scoredDose(perServing: NullableNumber, servingsPerDay: NullableNumber): {
  dose: NullableNumber;
  basis: "daily" | "per_serving" | "none";
  daily: NullableNumber;
} {
  if (perServing === null) return { dose: null, basis: "none", daily: null };
  if (servingsPerDay !== null && servingsPerDay > 0) {
    const daily = Math.round(perServing * servingsPerDay * 1000) / 1000;
    return { dose: daily, basis: "daily", daily };
  }
  return { dose: perServing, basis: "per_serving", daily: null };
}

function readOutcome(row: DoseRowInput, dose: NullableNumber): DoseOutcomeReading {
  const closeness = row.arcs.dose?.closeness ?? null;
  const match = row.arcs.dose?.product_match ?? null;
  const band = row.benefit_dose_range_mg && row.benefit_dose_range_mg.low !== null ? row.benefit_dose_range_mg : null;
  const nulls = row.null_dose_range_mg && row.null_dose_range_mg.low !== null ? row.null_dose_range_mg : null;
  const name = row.outcome_label ?? row.outcome.replace(/_/g, " ");

  let tone: DoseOutcomeReading["tone"] = "unassessable";
  let reading: string;
  if (dose === null) {
    reading = `${name}: your dose could not be established from the label, so the dose axis is not assessed.`;
  } else if (!band) {
    reading =
      `${name}: no trial that found a benefit carried a usable dose, so there is no range to compare ${mg(dose)} against.` +
      (nulls ? ` Trials that found nothing were dosed at ${mg(nulls.low)}–${mg(nulls.high)}.` : "");
  } else if (match === "in_band" || (closeness !== null && closeness >= 0.999)) {
    tone = "in_range";
    reading = `${name}: ${mg(dose)} sits inside the range where trials found benefit (${mg(band.low)}–${mg(band.high)}).`;
  } else if (match === "low_50_99" || match === "below_50" || (closeness !== null && dose < (band.low ?? 0))) {
    tone = "below";
    reading =
      `${name}: ${mg(dose)} is below the range where benefit was seen (${mg(band.low)}–${mg(band.high)}); ` +
      `closeness ${closeness === null ? "—" : closeness.toFixed(2)}.`;
  } else if (match === "above_200" || (closeness !== null && dose > (band.high ?? Infinity))) {
    tone = "above";
    reading =
      `${name}: ${mg(dose)} is above the range where benefit was seen (${mg(band.low)}–${mg(band.high)}); ` +
      `more than the trials used is not evidence of more effect.`;
  } else {
    reading = `${name}: ${mg(dose)} against a benefit range of ${mg(band.low)}–${mg(band.high)}; closeness ${closeness === null ? "—" : closeness.toFixed(2)}.`;
    tone = closeness !== null && closeness >= 0.999 ? "in_range" : "unassessable";
  }
  if (nulls && tone !== "unassessable" && dose !== null && nulls.low !== null && nulls.high !== null && dose >= nulls.low && dose <= nulls.high) {
    reading += ` Note: trials dosed at ${mg(nulls.low)}–${mg(nulls.high)} also found nothing, so this dose is contested.`;
  }
  return {
    outcome: row.outcome,
    outcome_label: row.outcome_label,
    closeness,
    product_match: match,
    benefit_range_mg: band ? { low: band.low, high: band.high } : null,
    null_range_mg: nulls ? { low: nulls.low, high: nulls.high } : null,
    dosed_evidence_share: row.arcs.dose?.coverage ?? null,
    reading,
    tone,
  };
}

export function doseEffectivenessSection(input: {
  perServingElementalMg: NullableNumber;
  servingsPerDay: NullableNumber;
  conversionBasis: string;
  rows: DoseRowInput[] | null;
}): DoseEffectivenessSection {
  const scored = scoredDose(input.perServingElementalMg, input.servingsPerDay);
  const outcomes = (input.rows ?? []).map((row) => readOutcome(row, scored.dose));
  const status: DoseEffectivenessSection["status"] =
    input.rows === null ? "not_scored" : scored.dose === null ? "dose_unavailable" : "ok";
  const note =
    scored.basis === "daily"
      ? `Scored on the daily dose: ${mg(input.perServingElementalMg)} per serving × ${input.servingsPerDay} servings/day = ${mg(scored.daily)} of active moiety. Trials report daily doses, so this is the comparable figure.`
      : scored.basis === "per_serving"
        ? `Scored on the per-serving dose (${mg(scored.dose)} of active moiety) because the label does not state servings per day. If you take more than one serving, your daily dose is higher than what was scored.`
        : "No elemental dose could be established from the label, so the dose axis is not assessed.";
  return {
    status,
    basis: "evidence_run",
    per_serving_elemental_mg: input.perServingElementalMg,
    servings_per_day: input.servingsPerDay,
    daily_elemental_mg: scored.daily,
    scored_dose_mg: scored.dose,
    scored_dose_basis: scored.basis,
    conversion_basis: input.conversionBasis,
    outcomes,
    note,
  };
}
