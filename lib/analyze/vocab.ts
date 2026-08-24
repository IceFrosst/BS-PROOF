/*
 * Read vocab/form.json and do the compound -> elemental (active-moiety) dose
 * conversion. TypeScript port of pipeline/vocab.py elemental_dose_mg /
 * elemental_dose_range_mg, pinned to the Python originals by
 * tests/analyze-parity.test.ts (golden values computed by Python).
 *
 * The conversion REFUSES rather than guesses: an unknown form, a missing molar
 * mass, or a hydrate whose stoichiometry is routinely unstated returns
 * compound_only. A dose wrong by the salt's mass fraction silently corrupts
 * dose-band matching (invariant 5), so "cannot convert" is a correct answer
 * the caller must surface, never paper over.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

export interface FormEntry {
  id: string;
  label: string;
  salt_family: string | null;
  molar_mass_g_mol?: number | null;
  active_mass_g_mol?: number | null;
  hydrate_molar_mass_g_mol?: number | null;
  conversion_safe?: boolean;
  aliases?: string[];
}

interface FormVocab {
  ingredients: Record<string, { forms: FormEntry[] }>;
}

let cached: FormVocab | null = null;

export function loadFormVocab(): FormVocab {
  if (!cached) {
    const raw = fs.readFileSync(path.join(ROOT, "vocab", "form.json"), "utf8");
    cached = JSON.parse(raw) as FormVocab;
  }
  return cached;
}

export function ingredientIds(): string[] {
  return Object.keys(loadFormVocab().ingredients ?? {});
}

export function formEntry(ingredient: string, formId: string | null): FormEntry | null {
  if (!formId) return null;
  const block = loadFormVocab().ingredients?.[ingredient];
  return block?.forms?.find((f) => f.id === formId) ?? null;
}

export interface ElementalRange {
  low: number | null;
  high: number | null;
  basis: "converted" | "bounded" | "compound_only" | "unstated";
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Port of pipeline/vocab.py elemental_dose_range_mg — see its docstring. */
export function elementalDoseRangeMg(
  ingredient: string,
  formId: string | null,
  compoundDoseMg: number | null,
): ElementalRange {
  if (compoundDoseMg === null) return { low: null, high: null, basis: "unstated" };

  const f = formEntry(ingredient, formId);
  if (!f) return { low: null, high: null, basis: "compound_only" };

  const mm = f.molar_mass_g_mol ?? null;
  const am = f.active_mass_g_mol ?? null;
  if (f.conversion_safe && mm && am) {
    const point = round3(compoundDoseMg * (am / mm));
    return { low: point, high: point, basis: "converted" };
  }

  const hm = f.hydrate_molar_mass_g_mol ?? null;
  if (!(mm && am && hm)) {
    // An UNSPECIFIED form is the same bounded ambiguity one level up: the label
    // stated a dose but not which salt, so the elemental amount lies between
    // the least and most active-dense salt this ingredient has. A bracket, not
    // a guess — port of pipeline/vocab.elemental_dose_range_mg (2026-08-24).
    //
    // A NAMED salt missing molar data keeps refusing: there we know which salt
    // it is and merely lack its mass, so bracketing across other salts would
    // answer a different question.
    if (f.salt_family !== null) return { low: null, high: null, basis: "compound_only" };
    const fracs: number[] = [];
    for (const other of loadFormVocab().ingredients?.[ingredient]?.forms ?? []) {
      if (other.salt_family === null) continue;
      const oMm = other.molar_mass_g_mol ?? null;
      const oAm = other.active_mass_g_mol ?? null;
      const oHm = other.hydrate_molar_mass_g_mol ?? null;
      if (!(oMm && oAm)) continue;
      fracs.push(oAm / oMm);
      if (oHm) fracs.push(oAm / oHm);
    }
    if (!fracs.length) return { low: null, high: null, basis: "compound_only" };
    return {
      low: round3(compoundDoseMg * Math.min(...fracs)),
      high: round3(compoundDoseMg * Math.max(...fracs)),
      basis: "bounded",
    };
  }

  // More water per mole of salt -> less active mass per mg of powder.
  return {
    low: round3(compoundDoseMg * (am / hm)),
    high: round3(compoundDoseMg * (am / mm)),
    basis: "bounded",
  };
}

/**
 * The allowed-ids block for the label prompt — same rendering as Python
 * label_adapter._vocab_block, so both backends put identical vocabulary in
 * front of the model and a label reads the same either way.
 */
export function vocabBlock(): string {
  const lines: string[] = [];
  for (const [ing, block] of Object.entries(loadFormVocab().ingredients ?? {})) {
    const forms = block.forms ?? [];
    const ids = forms.map((f) => f.id).filter(Boolean);
    const aliases = [...new Set(forms.flatMap((f) => f.aliases ?? []))].sort();
    lines.push(`- \`${ing}\` forms: ${ids.join(", ")}`);
    if (aliases.length) lines.push(`    printed as: ${aliases.slice(0, 12).join(", ")}`);
  }
  return lines.join("\n");
}

export interface ResolvedProduct {
  ingredient: string | null;
  form: string | null;
}

/**
 * Repair the model's most common vocabulary slip: the FORM id in the
 * ingredient field.
 *
 * MEASURED 2026-08-23 on the live DeepSeek backend (HANDOFF.md "KNOWN QUIRK"):
 * a creatine monohydrate label came back as
 * `ingredient_vocab_id: "creatine_monohydrate"`, which matches no catalog
 * ingredient, so the scored-run lookup missed and a fully-scored product fell
 * through to `not_scored` + census. The slip is understandable — the label
 * literally prints "Creatine Monohydrate" as the ingredient line — and it is
 * DETERMINISTICALLY repairable, because every form id belongs to exactly one
 * ingredient in vocab/form.json. This is vocabulary normalisation, not
 * inference: nothing is guessed that the vocabulary does not state.
 *
 * Rules, in order:
 *   1. ingredient is a real ingredient id -> keep both fields as given
 *   2. ingredient is a FORM id -> ingredient becomes that form's parent;
 *      the form id fills the form field ONLY when form was null or the two
 *      agree — a CONTRADICTING form field is left alone for the caller's
 *      form-level checks to surface, never silently overruled
 *   3. anything else -> unchanged (the not-supported path handles it)
 */
export function resolveIngredientForm(
  ingredientId: string | null,
  formId: string | null,
): ResolvedProduct {
  if (!ingredientId) return { ingredient: null, form: formId };
  const vocab = loadFormVocab().ingredients ?? {};
  if (ingredientId in vocab) return { ingredient: ingredientId, form: formId };
  for (const [parent, block] of Object.entries(vocab)) {
    if ((block.forms ?? []).some((f) => f.id === ingredientId)) {
      return {
        ingredient: parent,
        form: formId === null || formId === ingredientId ? ingredientId : formId,
      };
    }
  }
  return { ingredient: ingredientId, form: formId };
}
