/*
 * THE SEARCHABLE CATALOG behind "Search for your supplement" on /scan.
 *
 * Derived on the server from vocab/form.json — the same vocabulary the label
 * prompt is given and the same ids `scoreProduct` and `elementalDoseRangeMg`
 * accept — so a manual entry can only ever name an ingredient × form the rest
 * of the pipeline already understands. Adding an ingredient to the vocabulary
 * adds it here; there is no second list to keep in sync.
 *
 * SLIM BY DESIGN. Molar masses, active masses, hydrate stoichiometry and
 * formulae stay in vocab.ts where the conversion happens. What is exposed is
 * what a person needs to pick a product and understand what will happen to the
 * dose they type: labels, aliases to search on, whether the form is the
 * vocabulary's "not stated" entry, whether a typed dose converts exactly, as a
 * bounded range, or not at all, and whether a retained evidence run exists.
 * `dose_conversion` is computed by calling the real converter on a unit dose,
 * so it describes the converter's behaviour rather than restating its inputs.
 */
import { availableProducts } from "./product-score";
import { elementalDoseRangeMg, loadFormVocab, type FormEntry } from "./vocab";

export type DoseConversion = "exact" | "bounded" | "refused";

export interface CatalogForm {
  id: string;
  label: string;
  aliases: string[];
  /** The vocabulary's one "form not stated" entry for this ingredient. */
  unspecified: boolean;
  /** What happens to a typed compound dose: exact, bounded interval, or no number. */
  dose_conversion: DoseConversion;
  /** A retained, usable evidence run exists for exactly this ingredient × form. */
  scored: boolean;
}

export interface CatalogIngredient {
  id: string;
  label: string;
  /** From the vocabulary: elemental, active_moiety, extract or cfu. */
  dose_basis_kind: string;
  aliases: string[];
  forms: CatalogForm[];
}

function humanise(id: string): string {
  const words = id.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function ingredientLabel(id: string, unspecified: FormEntry | undefined): string {
  // Every ingredient has exactly one *_unspecified form (vocab policy) and its
  // label reads "Magnesium, form not stated" / "Ashwagandha, preparation not
  // stated" -- the part before the comma is the ingredient's own display name.
  const head = unspecified?.label.split(",")[0]?.trim();
  return head && head.length ? head : humanise(id);
}

function conversionFor(ingredient: string, formId: string): DoseConversion {
  const probe = elementalDoseRangeMg(ingredient, formId, 1000);
  if (probe.basis === "converted") return "exact";
  if (probe.basis === "bounded") return "bounded";
  return "refused";
}

let cached: CatalogIngredient[] | null = null;

export function ingredientCatalog(): CatalogIngredient[] {
  if (cached) return cached;
  const scored = new Set(availableProducts().map((p) => `${p.ingredient}|${p.form}`));
  const vocab = loadFormVocab().ingredients ?? {};
  const out: CatalogIngredient[] = [];
  for (const [id, block] of Object.entries(vocab)) {
    const forms = block.forms ?? [];
    const unspecified = forms.find((f) => f.salt_family === null);
    const label = ingredientLabel(id, unspecified);
    const aliases = [...new Set([humanise(id).toLowerCase(), ...(unspecified?.aliases ?? [])])].filter(
      (a) => a.toLowerCase() !== label.toLowerCase(),
    );
    const catalogForms: CatalogForm[] = forms
      .map((f) => ({
        id: f.id,
        label: f.label,
        aliases: [...(f.aliases ?? [])],
        unspecified: f.salt_family === null,
        dose_conversion: conversionFor(id, f.id),
        scored: scored.has(`${id}|${f.id}`),
      }))
      // Named forms first, in vocabulary order; "not stated" last so the honest
      // fallback is offered but never the default the eye lands on.
      .sort((a, b) => Number(a.unspecified) - Number(b.unspecified));
    out.push({
      id,
      label,
      dose_basis_kind: String((block as { dose_basis_kind?: string }).dose_basis_kind ?? "unknown"),
      aliases,
      forms: catalogForms,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  cached = out;
  return out;
}

export function catalogIngredient(id: string): CatalogIngredient | null {
  return ingredientCatalog().find((i) => i.id === id) ?? null;
}

export function catalogForm(ingredientId: string, formId: string): CatalogForm | null {
  return catalogIngredient(ingredientId)?.forms.find((f) => f.id === formId) ?? null;
}
