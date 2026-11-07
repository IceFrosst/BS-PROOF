/*
 * ResearchJobV1: the ONLY thing a research job tells the PC worker.
 *
 * Built on the server from the OWNER'S saved scan (the allow-listed analysis
 * that lib/scan-history/reader.ts returns), never from the client. Every field
 * is individually type-checked and bounded: a wrong type, a non-finite number
 * or a string with control characters becomes `null` -- never a guess, and never
 * a coerced value. Numbers are passed through UNCHANGED (no rounding, no unit
 * conversion here): the scientific values are exactly what the scan recorded.
 *
 * Deliberately absent: the photo and its path, the owner's id/email, the run's
 * app_version, any score or verdict, body weight, and any servings figure the
 * scan did not itself record. `servings_per_day` is the explicit figure or null.
 *
 * Component rows are not blend efficacy: for a multi-ingredient product the
 * `actives` are listed so the worker can see them, and
 * `handling.component_evidence_is_not_blend_efficacy` is always true -- evidence
 * about one component must never be reported as evidence about the blend.
 */
import { RESEARCH_JOB_VERSION } from "./contract";

const MAX_TEXT = 160;
const MAX_BASIS = 300;
const MAX_ACTIVES = 40;

export interface ResearchActiveV1 {
  name: string | null;
  compound_per_serving_mg: number | null;
  printed_elemental_per_serving_mg: number | null;
  unit_as_printed: string | null;
  form_text: string | null;
}

export interface ResearchTargetV1 {
  version: typeof RESEARCH_JOB_VERSION;
  /** "label" = read off a photo by the vision model; "user_input" = typed by the owner. */
  fact_basis: "label" | "user_input";
  product: { brand: string | null; product_name: string | null };
  /** `vocab_id` is the resolved catalog id; `label` is the text as printed / typed. */
  ingredient: { vocab_id: string | null; label: string | null };
  form: { vocab_id: string | null; label: string | null };
  dose: {
    /** The compound (not elemental) mass in ONE serving, mg, when explicit. */
    compound_per_serving_mg: number | null;
    printed_elemental_per_serving_mg: number | null;
    unit_as_printed: string | null;
    /** The app's own elemental conversion of the compound dose, when it made one. */
    elemental_per_serving_mg: { low: number | null; high: number | null; basis: string | null } | null;
    /** Elemental mg per DAY: set only when the scan scored on an explicit daily regimen. */
    daily_elemental_mg: number | null;
  };
  /** Explicit servings per day, else null. Never inferred. */
  servings_per_day: number | null;
  /** null = unknown (a typed entry says nothing about other actives). */
  is_multi_ingredient: boolean | null;
  /** null = unknown. [] = the label was read and lists none. */
  actives: ResearchActiveV1[] | null;
  other_actives: string[] | null;
  handling: {
    text_fields_are_untrusted_data: true;
    component_evidence_is_not_blend_efficacy: true;
  };
}

export type TargetOutcome = { ok: true; target: ResearchTargetV1 } | { ok: false; reason: "not_researchable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A short single-line string, or null. Control characters never pass through. */
function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

/** A finite non-negative number exactly as recorded, or null. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function actives(value: unknown): ResearchActiveV1[] | null {
  if (!Array.isArray(value)) return null;
  const out: ResearchActiveV1[] = [];
  for (const row of value.slice(0, MAX_ACTIVES)) {
    if (!isRecord(row)) continue;
    const name = text(row.name);
    if (name === null) continue;
    out.push({
      name,
      compound_per_serving_mg: num(row.compound_dose_mg),
      printed_elemental_per_serving_mg: num(row.printed_elemental_dose_mg), // producer field; output key keeps the job-contract name
      unit_as_printed: text(row.dose_unit_as_printed, 40),
      form_text: text(row.form_text),
    });
  }
  return out;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value.slice(0, MAX_ACTIVES)) {
    const t = text(item);
    if (t !== null) out.push(t);
  }
  return out;
}

const UNRESEARCHABLE_STATUSES = new Set(["label_unreadable", "not_a_supplement_label", "manual_input_invalid", "pending"]);

/**
 * The job target for a saved scan, or `not_researchable` when the scan holds no
 * supplement identity to research (an unreadable photo, a non-supplement, a
 * rejected manual entry). Pure: no I/O, no clock, no randomness.
 */
export function buildResearchTarget(analysis: unknown): TargetOutcome {
  if (!isRecord(analysis)) return { ok: false, reason: "not_researchable" };
  const status = typeof analysis.status === "string" ? analysis.status : "";
  if (!status || UNRESEARCHABLE_STATUSES.has(status)) return { ok: false, reason: "not_researchable" };

  const product = isRecord(analysis.product) ? analysis.product : null;
  const elemental = product && isRecord(product.elemental_dose_mg) ? product.elemental_dose_mg : null;
  const elementalOut = elemental
    ? { low: num(elemental.low), high: num(elemental.high), basis: text(elemental.basis, MAX_BASIS) }
    : null;
  const dailyElemental = product && product.scored_dose_basis === "daily" ? num(product.scored_dose_mg) : null;

  let target: ResearchTargetV1;
  if (analysis.source === "photo" && isRecord(analysis.label)) {
    const l = analysis.label;
    target = {
      version: RESEARCH_JOB_VERSION,
      fact_basis: "label",
      product: { brand: text(l.brand), product_name: text(l.product_name) },
      ingredient: { vocab_id: text(l.ingredient_vocab_id), label: text(l.ingredient_label_text) },
      form: { vocab_id: text(l.form_vocab_id), label: null },
      dose: {
        compound_per_serving_mg: num(l.compound_dose_mg),
        printed_elemental_per_serving_mg: num(l.printed_elemental_dose_mg), // producer field; output key keeps the job-contract name
        unit_as_printed: text(l.dose_unit_as_printed, 40),
        elemental_per_serving_mg: elementalOut,
        daily_elemental_mg: dailyElemental,
      },
      servings_per_day: num(l.servings_per_day),
      is_multi_ingredient: typeof l.is_multi_ingredient === "boolean" ? l.is_multi_ingredient : null,
      actives: actives(l.actives),
      other_actives: strings(l.other_actives),
      handling: { text_fields_are_untrusted_data: true, component_evidence_is_not_blend_efficacy: true },
    };
  } else if (analysis.source === "manual" && isRecord(analysis.input)) {
    const i = analysis.input;
    const dose = isRecord(i.dose_per_serving) ? i.dose_per_serving : null;
    target = {
      version: RESEARCH_JOB_VERSION,
      fact_basis: "user_input",
      product: { brand: null, product_name: null },
      ingredient: { vocab_id: text(i.ingredient), label: text(i.ingredient_label) },
      form: { vocab_id: text(i.form), label: text(i.form_label) },
      dose: {
        compound_per_serving_mg: dose ? num(dose.mg) : null,
        printed_elemental_per_serving_mg: null, // a typed entry carries no printed elemental figure
        unit_as_printed: dose ? text(dose.unit, 40) : null,
        elemental_per_serving_mg: elementalOut,
        daily_elemental_mg: dailyElemental,
      },
      servings_per_day: num(i.servings_per_day),
      // A typed entry names one ingredient and says nothing else: unknown, not "single".
      is_multi_ingredient: null,
      actives: null,
      other_actives: null,
      handling: { text_fields_are_untrusted_data: true, component_evidence_is_not_blend_efficacy: true },
    };
  } else {
    return { ok: false, reason: "not_researchable" };
  }

  if (target.ingredient.vocab_id === null && target.ingredient.label === null) return { ok: false, reason: "not_researchable" };
  return { ok: true, target };
}
