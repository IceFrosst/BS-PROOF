/* Server-only retained audit selector. It deliberately reads only the one
 * matching audit; no audit is sent to the browser for an unmatched product. */
import fs from "node:fs";
import path from "node:path";
import type { AuditFile, PlainFile, RetainedLedgerAudit } from "./index";

const ROOT = process.cwd();
const RETAINED = [
  { ingredient: "creatine", form: "creatine_monohydrate", doseMicrograms: 4_000_000, product: "Creatine monohydrate", dose: "4,000 mg (4 g) printed compound per day", file: "creatine" },
  { ingredient: "vitamin_d", form: "vitamin_d3_cholecalciferol", doseMicrograms: 50_000, product: "Vitamin D3 (cholecalciferol)", dose: "0.05 mg (50 mcg / 2000 IU) printed per day", file: "vitamin-d" },
  { ingredient: "magnesium", form: "magnesium_glycinate", doseMicrograms: 300_000, product: "Magnesium glycinate", dose: "300 mg printed compound per day", file: "magnesium" },
] as const;

function readRetainedJson(file: string, plain = false): unknown {
  // Keep the server read statically scoped to the retained audit directory.
  // This prevents Next tracing the whole repository while still allowing the
  // selector to read only the one matched audit and sidecar.
  const directory = path.join(ROOT, "app", "design-lab", "ab", "audits", ...(plain ? ["plain"] : []));
  return JSON.parse(fs.readFileSync(path.join(directory, `${file}.json`), "utf8"));
}
function exactMassMicrograms(mg: number | null): number | null {
  if (mg === null || !Number.isFinite(mg)) return null;
  // A rounded value would create an unadvertised tolerance (for example,
  // 4000.0004 mg would round to the 4000 mg target). The retained contract
  // compares exact integer micrograms only.
  const result = mg * 1000;
  return Number.isSafeInteger(result) ? result : null;
}

export interface ProductMatchActive {
  /** The active name as declared on the label. */
  name: string;
  /** Null is retained when the label declared an active without a readable dose. */
  compoundDoseMg: number | null;
}

export interface ProductMatchFacts {
  ingredient: string | null;
  form: string | null;
  compoundDoseMg: number | null;
  servingsPerDay: number | null;
  isMultiIngredient: boolean;
  /** Every dosed/declared active found in the label's panel. */
  actives: ProductMatchActive[];
  /** Other active names are a hard stop, even when the boolean says otherwise. */
  otherActives: string[];
}

/** Exact match only: no tolerance, elemental conversion, nearby form, or daily-dose guess. */
export function retainedAuditForProduct(facts: ProductMatchFacts): RetainedLedgerAudit | null {
  const actives = facts.actives;
  const otherActives = facts.otherActives;
  // Do not let a contradictory model label turn a blend into a single-active
  // retained audit. `actives` is the complete dosed/declared list; other_actives
  // is kept separate because it has no dose and is itself sufficient to refuse.
  const listsIndicateMultiple = actives.length > 1 || otherActives.length > 0;
  if (facts.isMultiIngredient !== listsIndicateMultiple) return null;
  // Both a positive multi-ingredient boolean and any list evidence of multiple
  // actives are a hard stop. This keeps the exact target contract single-active.
  if (facts.isMultiIngredient || listsIndicateMultiple) return null;
  // LabelRead defines both top-level compound_dose_mg and each active's
  // compound_dose_mg as compound mass in mg *per serving*. The printed-unit
  // strings are provenance only; matching uses these normalized numeric fields,
  // then computes the daily mass from the separately stated serving count.
  // A missing/ambiguous active dose, an absent sole-active row, or a mismatch
  // with the top-level dose must never inherit the top-level value by guess.
  if (actives.length !== 1) return null;
  const activeDose = actives[0].compoundDoseMg;
  if (activeDose === null || !Number.isFinite(activeDose) || activeDose < 0) return null;
  const perServingMass = facts.compoundDoseMg;
  if (perServingMass === null || !Number.isFinite(perServingMass) || perServingMass < 0) return null;
  if (activeDose !== perServingMass) return null;
  if (facts.servingsPerDay === null || !Number.isFinite(facts.servingsPerDay) || facts.servingsPerDay <= 0) return null;
  const candidate = RETAINED.find((x) => x.ingredient === facts.ingredient && x.form === facts.form);
  const dailyPrintedMass = perServingMass * facts.servingsPerDay;
  if (!candidate || exactMassMicrograms(dailyPrintedMass) !== candidate.doseMicrograms) return null;
  const audit = readRetainedJson(candidate.file) as AuditFile;
  const plain = readRetainedJson(candidate.file, true) as PlainFile;
  return {
    audit,
    plain,
    provenance: {
      kind: "retained_previous_audit",
      prompt_version: audit.meta.prompt,
      target_product: candidate.product,
      target_dose: candidate.dose,
      note: "Retained previous audit. It was not re-verified on this scan.",
    },
  };
}

export const retainedAuditTargets = RETAINED.map(({ ingredient, form, doseMicrograms, product, dose }) => ({ ingredient, form, doseMicrograms, product, dose }));
