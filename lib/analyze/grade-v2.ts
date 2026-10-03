/*
 * Evidence method v2 letter grade for a SCANNED product. Port of the
 * product-dependent half of pipeline/grade.py (`indirectness` +
 * `letter_from_record`); everything product-independent -- the pooled effect,
 * risk of bias, inconsistency, imprecision, publication bias, the benefit
 * category at M, M/2 and 2M -- comes from the run artifact's `evidence_v2`
 * block (pipeline/evidence_v2.py) UNCHANGED. Python is canonical:
 * tests/grade-v2-parity.test.ts pins this file to tests/golden_grade_v2.json,
 * which scripts/golden_grade_v2.py computes from the Python originals.
 *
 * The pool includes every form of the ingredient: form and dose are GRADE
 * indirectness, never study weight, so one run grades any form -- with less
 * certainty when the trials did not test it. Shadow until the Phase 4 switch
 * (docs/EVIDENCE_METHOD.md §8); a run without the block answers "not_assessed".
 */
import fs from "node:fs";
import path from "node:path";

import { doseMatchFor } from "./scoring";

/** pipeline/grade.py LEVELS. */
export const LEVELS: Record<number, string> = { 4: "High", 3: "Moderate", 2: "Low", 1: "Very low" };

/** pipeline/grade.py TABLE — the founder-approved §4 grade table (2026-10-03). */
export const TABLE: Record<string, Record<number, string>> = {
  large: { 4: "A+", 3: "A", 2: "B", 1: "I" },
  meaningful: { 4: "A", 3: "B+", 2: "C+", 1: "I" },
  small: { 4: "C", 3: "C", 2: "C-", 1: "I" },
  none: { 4: "F", 3: "D", 2: "D+", 1: "I" },
  harm: { 4: "F", 3: "F", 2: "D-", 1: "I" },
};

/** pipeline/grade.py RULES["indirect_weight_serious"] — founder-accepted 2026-10-03. */
export const INDIRECT_WEIGHT_SERIOUS = 0.5;

/** pipeline/grade.py OFF_DOSE — only under half or over double the trial dose is off-dose (founder 2026-10-03). */
export const OFF_DOSE = new Set(["below_50", "above_200"]);

export type Variant = {
  threshold: number;
  benefit: string;
  start: number;
  downgrades: Record<string, [number, string]>;
  not_assessed: string[];
};

export type GradeRecord = {
  outcome: string;
  threshold: number;
  threshold_source: string;
  registry: { registered: number; in_corpus: number; unpublished: string[] } | null;
  variants: Partial<Record<"m" | "half" | "double", Variant>>;
};

export type StoredStudy = {
  study: string;
  measure: string | null;
  weight: number | null;
  n: number | null;
  form_id: string | null;
  dose_low_mg: number | null;
  dose_high_mg: number | null;
  reviewed: boolean;
};

export type StoredOutcome = {
  outcome: string;
  label: string;
  k: number;
  smd: { estimate: number; ci: [number, number]; prediction: [number, number] | null; i2: number | null; method: string } | null;
  md: { estimate: number; ci: [number, number]; unit: string } | null;
  record: GradeRecord;
  studies: StoredStudy[];
};

export type MatchedStudy = { form_match: string; dose_match: string | null };

export type LetterResult = {
  letter: string;
  benefit: string;
  level: number;
  label: string;
  downgrades: Record<string, [number, string]>;
  not_assessed: string[];
  letters_at: Record<string, string>;
  threshold_sensitive: boolean;
  harm: boolean;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

function share(studies: MatchedStudy[], weights: number[], pred: (s: MatchedStudy) => boolean): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return studies.reduce((acc, s, i) => acc + (pred(s) ? weights[i] : 0), 0) / total;
}

/** pipeline/grade.py `indirectness`. */
export function indirectness(studies: MatchedStudy[], weights: number[]): [number, string[], string[]] {
  let points = 0;
  const reasons: string[] = [];
  const notes: string[] = [];
  const notForm = share(studies, weights, (s) => s.form_match !== "exact");
  if (notForm > INDIRECT_WEIGHT_SERIOUS) {
    points += 1;
    reasons.push(`${pct(notForm)} of the weight from other or unstated forms`);
  }
  if (!studies.some((s) => s.dose_match !== null)) {
    notes.push("dose indirectness (no product dose given)");
  } else {
    const known = (s: MatchedStudy) => s.dose_match !== null && s.dose_match !== "unspecified";
    const offDose = share(studies, weights, (s) => s.dose_match !== null && OFF_DOSE.has(s.dose_match));
    if (offDose > INDIRECT_WEIGHT_SERIOUS) {
      points += 1;
      reasons.push(`${pct(offDose)} of the weight from trials at a dose unlike the product's`);
    }
    const unknown = share(studies, weights, (s) => !known(s));
    if (unknown) notes.push(`dose: ${pct(unknown)} of the weight from trials with no comparable dose`);
  }
  return [Math.min(points, 2), reasons, notes];
}

function letterFor(benefit: string, level: number): string {
  return benefit === "inconclusive" ? "I" : TABLE[benefit][level];
}

/** pipeline/grade.py `letter_from_record`. */
export function letterFromRecord(rec: GradeRecord, studies: MatchedStudy[], weights: number[]): LetterResult {
  const names = Object.keys(rec.variants) as Array<"m" | "half" | "double">;
  if (!names.length) {
    return { letter: "I", benefit: "no data", level: 1, label: LEVELS[1], downgrades: {}, not_assessed: [],
             letters_at: {}, threshold_sensitive: false, harm: false };
  }
  const [points, reasons, notes] = indirectness(studies, weights);
  const out: Record<string, [string, string, number, Record<string, [number, string]>, string[]]> = {};
  for (const name of names) {
    const v = rec.variants[name] as Variant;
    const down: Record<string, [number, string]> = { ...v.downgrades };
    if (points) down.indirectness = [points, reasons.join("; ")];
    const level = Math.max(1, v.start - Object.values(down).reduce((a, [p]) => a + p, 0));
    out[name] = [letterFor(v.benefit, level), v.benefit, level, down, [...v.not_assessed, ...notes]];
  }
  const [letter, benefit, level, downgrades, notAssessed] = out.m;
  const lettersAt = { half: out.half[0], double: out.double[0] };
  return {
    letter, benefit, level, label: LEVELS[level], downgrades, not_assessed: notAssessed,
    letters_at: lettersAt,
    threshold_sensitive: Object.values(lettersAt).some((x) => x !== letter),
    harm: benefit === "harm",
  };
}

/** Re-match the stored trials to THIS product (vocab.form_match exact = same id; SPEC §8 dose tiers). */
export function matchStudies(
  studies: StoredStudy[],
  form: string | null,
  doseLowMg: number | null,
  doseHighMg: number | null,
): { matched: MatchedStudy[]; weights: number[] } {
  const pooled = studies.filter((s) => s.weight !== null);
  return {
    matched: pooled.map((s) => ({
      form_match: form && s.form_id && s.form_id === form ? "exact" : "other",
      dose_match: doseLowMg === null || doseHighMg === null
        ? null
        : doseMatchFor(doseLowMg, doseHighMg, { low: s.dose_low_mg, high: s.dose_high_mg }),
    })),
    weights: pooled.map((s) => s.weight as number),
  };
}

// ------------------------------------------------------------------ the app

export type OutcomeGrade = LetterResult & {
  outcome: string;
  label: string;
  k: number;
  estimate: number | null;
  ci: [number, number] | null;
  prediction: [number, number] | null;
  natural: { estimate: number; ci: [number, number]; unit: string } | null;
  threshold: number;
  threshold_source: string;
  single_extracted: number;
  registry: GradeRecord["registry"];
};

export type ProductGradesV2 =
  | { status: "not_assessed"; ingredient: string }
  | { status: "graded"; ingredient: string; form: string | null; dose_mg: number | null; run_id: string;
      method_status: string; population: string | null; outcomes: OutcomeGrade[] };

// Dev-only preview (scripts/experiments/v2_preview.py): a shadow sample built
// from a stability run, never a retained run, so it is refused in production.
const PREVIEW_DIR = process.env.NODE_ENV !== "production" ? process.env.EVIDENCE_V2_RUNS_DIR : undefined;
const RETAINED_RUNS = path.join(process.cwd(), "reports", "runs");
const RUNS_DIR = PREVIEW_DIR ? path.resolve(PREVIEW_DIR) : RETAINED_RUNS;

/** Newest retained artifact for this ingredient that carries an evidence_v2 block. */
export function evidenceBlockFor(ingredient: string, runsDir = RUNS_DIR): { runId: string; block: Record<string, unknown> } | null {
  let names: string[] = [];
  try {
    names = fs.readdirSync(runsDir).filter((n) => n.endsWith("_dashboard.json")).sort().reverse();
  } catch {
    return null;
  }
  for (const name of names) {
    try {
      const art = JSON.parse(fs.readFileSync(path.join(runsDir, name), "utf8")) as Record<string, unknown>;
      const product = (art.product ?? {}) as Record<string, unknown>;
      const block = art.evidence_v2 as Record<string, unknown> | undefined;
      if (String(product.ingredient) !== ingredient || !block || block.method !== "evidence-v2") continue;
      if (/demo/i.test(name)) continue;
      if (/preview/i.test(name) && path.resolve(runsDir) === RETAINED_RUNS) continue;   // a preview is never a retained run
      return { runId: String(((art.run ?? {}) as Record<string, unknown>).id ?? name), block };
    } catch {
      continue;
    }
  }
  return null;
}

export function gradeBlock(
  block: Record<string, unknown>,
  form: string | null,
  doseLowMg: number | null,
  doseHighMg: number | null,
): OutcomeGrade[] {
  const outcomes = (block.outcomes as StoredOutcome[] | undefined) ?? [];
  return outcomes.map((o) => {
    const { matched, weights } = matchStudies(o.studies, form, doseLowMg, doseHighMg);
    const r = letterFromRecord(o.record, matched, weights);
    return {
      ...r,
      outcome: o.outcome,
      label: o.label,
      k: o.k,
      estimate: o.smd?.estimate ?? null,
      ci: o.smd?.ci ?? null,
      prediction: o.smd?.prediction ?? null,
      natural: o.md,
      threshold: o.record.threshold,
      threshold_source: o.record.threshold_source,
      single_extracted: o.studies.filter((s) => s.weight !== null && !s.reviewed).length,
      registry: o.record.registry,
    };
  });
}

/** v2 grades for a scanned product. `doseMg` is the ELEMENTAL daily dose, already converted. */
export function gradeProductV2(ingredient: string, form: string | null, doseMg: number | null, runsDir = RUNS_DIR): ProductGradesV2 {
  const found = evidenceBlockFor(ingredient, runsDir);
  if (!found) return { status: "not_assessed", ingredient };
  return {
    status: "graded",
    ingredient,
    form,
    dose_mg: doseMg,
    run_id: found.runId,
    method_status: String(found.block.status ?? "shadow"),
    population: (found.block.population as string | null) ?? null,
    outcomes: gradeBlock(found.block, form, doseMg, doseMg),
  };
}
