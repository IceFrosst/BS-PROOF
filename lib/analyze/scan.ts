/*
 * THE SCAN ORCHESTRATOR: one label image -> one ScanAnalysisV1.
 *
 * Stages, in dependency order (docs/SYSTEM_DESIGN.md has the diagram):
 *
 *   0  label read            vision model     -> what is PRINTED          [MODEL]
 *   1  identity + dose       deterministic    -> ingredient, form, elemental mg
 *   2  evidence score        deterministic    -> rows + four arcs (retained run)
 *   3  dose effectiveness    deterministic    -> reading per outcome from stage 2
 *   4  form & compatibility  curated + model  -> cited interactions + fill-in   [MODEL]
 *   5  company background    label + registry + model                         [MODEL]
 *
 * Stage 0 gates everything. Stages 2-3 are pure functions of the label read
 * and the retained artifacts. Stages 4 and 5 run IN PARALLEL after stage 1 and
 * each degrades to `unavailable` on its own -- a company profile that times out
 * never costs the user the evidence score.
 *
 * TIME BUDGET. The route allows 60 s. The vision read takes 10-20 s on DeepSeek
 * (measured 2026-08-24). Whatever remains, minus a safety margin, is the
 * ceiling for the two text calls; below MIN_MODEL_BUDGET_MS they are skipped
 * with `reason: time budget` rather than started and killed.
 *
 * EVERY SECTION CARRIES ITS BASIS. `label` (as printed), `evidence_run`
 * (scored trials with provenance), `registry` (openFDA), `curated_table`
 * (cited), `model_prior` (the model's own knowledge, unverified). The UI
 * renders the badge next to each block, and the legend explains the ranking.
 * A model-prior sentence never becomes a number, and a number never appears
 * without its arcs (invariant 8).
 *
 * Dependencies are injectable so the whole orchestration is unit-tested with a
 * fake label read, a fake model and a fake fetch -- zero model calls in tests.
 */
import { census, enqueue } from "./census";
import { companySection, type CompanySection } from "./company";
import {
  compatibilitySection,
  type Basis,
  type CompatibilitySection,
  type EvidenceFormFit,
} from "./compatibility";
import {
  doseEffectivenessSection,
  scoredDose,
  type DoseEffectivenessSection,
  type DoseRowInput,
} from "./dose-effectiveness";
import { chatJson, providerConfigured, type ChatJsonFn } from "./llm";
import { availableProducts, scoreProduct } from "./product-score";
import { readLabel, type LabelMediaType, type LabelRead } from "./vision";
import { elementalDoseRangeMg, ingredientIds, resolveIngredientForm } from "./vocab";

type Json = Record<string, unknown>;

export const SCAN_SCHEMA_VERSION = "ScanAnalysisV1";

/** Below this much remaining budget, a text model call is skipped, not started. */
const MIN_MODEL_BUDGET_MS = 6_000;
const SAFETY_MARGIN_MS = 4_000;
const MAX_TEXT_CALL_MS = 25_000;
const REGISTRY_TIMEOUT_MS = 8_000;

export interface ScanDeps {
  readLabel: (imageBase64: string, mediaType: LabelMediaType) => Promise<LabelRead>;
  chatJson: ChatJsonFn | null;
  fetch: typeof fetch;
  scoreProduct: typeof scoreProduct;
  /** Total wall clock the caller can spend, in ms. */
  budgetMs: number;
  now: () => number;
}

export function defaultDeps(): ScanDeps {
  return {
    readLabel,
    chatJson: providerConfigured() ? chatJson : null,
    fetch,
    scoreProduct,
    budgetMs: 55_000,
    now: Date.now,
  };
}

export const BASIS_LEGEND: Record<Basis, { label: string; means: string; rank: number }> = {
  evidence_run: {
    label: "Evidence run",
    means: "Scored from extracted trials with quoted provenance. The only source that produces a number.",
    rank: 1,
  },
  registry: {
    label: "Public registry",
    means: "A dated public record (FDA enforcement reports via openFDA).",
    rank: 2,
  },
  curated_table: {
    label: "Curated & cited",
    means: "A maintained table where every entry cites a regulator fact sheet or a position stand.",
    rank: 3,
  },
  label: {
    label: "As printed",
    means: "Read off the label. A claim the product makes about itself, not a verification.",
    rank: 4,
  },
  model_prior: {
    label: "Model knowledge",
    means: "What the model recalls from training data. Unverified; shown for orientation only and never scored.",
    rank: 5,
  },
};

export interface ScanAnalysis {
  schema_version: typeof SCAN_SCHEMA_VERSION;
  analyzed_at: string;
  status: string;
  error?: string;
  label?: LabelRead;
  product?: {
    ingredient: string;
    form: string | null;
    compound_dose_mg: number | null;
    elemental_dose_mg: { low: number | null; high: number | null; basis: string };
    servings_per_day: number | null;
    scored_dose_mg: number | null;
    scored_dose_basis: "daily" | "per_serving" | "none";
    is_multi_ingredient: boolean;
    other_actives: string[];
  };
  evidence?: Json;
  dose_effectiveness?: DoseEffectivenessSection;
  compatibility?: CompatibilitySection;
  company?: CompanySection;
  census?: Json;
  queue?: Json;
  caveats?: Array<{ code: string; text: string }>;
  ingredient_label_text?: string | null;
  supported_ingredients?: string[];
  basis_legend: typeof BASIS_LEGEND;
  meta: {
    timing_s: number;
    stages: Record<string, number | null>;
    provider_configured: boolean;
    models: { vision: string | null; text: string | null };
    prompt_versions: Record<string, string>;
  };
}

function stamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

function seconds(ms: number): number {
  return Math.round(ms / 10) / 100;
}

export async function analyzeScan(
  imageBase64: string,
  mediaType: LabelMediaType,
  deps: ScanDeps = defaultDeps(),
): Promise<ScanAnalysis> {
  const t0 = deps.now();
  const stages: Record<string, number | null> = { label: null, evidence: null, compatibility: null, company: null };
  const out: ScanAnalysis = {
    schema_version: SCAN_SCHEMA_VERSION,
    analyzed_at: stamp(),
    status: "pending",
    basis_legend: BASIS_LEGEND,
    meta: {
      timing_s: 0,
      stages,
      provider_configured: Boolean(deps.chatJson),
      models: { vision: null, text: null },
      prompt_versions: {},
    },
  };
  const finish = (status: string): ScanAnalysis => {
    out.status = status;
    out.meta.timing_s = seconds(deps.now() - t0);
    return out;
  };

  // ---- stage 0: label -----------------------------------------------------
  let label: LabelRead;
  const tLabel = deps.now();
  try {
    label = await deps.readLabel(imageBase64, mediaType);
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
    stages.label = seconds(deps.now() - tLabel);
    return finish("label_unreadable");
  }
  stages.label = seconds(deps.now() - tLabel);
  out.label = label;
  out.meta.models.vision = label._meta?.model ?? null;
  out.meta.prompt_versions.label = label._meta?.prompt_version ?? "unknown";

  if (!label.is_supplement_label) return finish("not_a_supplement_label");

  // ---- stage 1: identity + dose ------------------------------------------
  const resolved = resolveIngredientForm(label.ingredient_vocab_id, label.form_vocab_id);
  const ingredient =
    resolved.ingredient && ingredientIds().includes(resolved.ingredient) ? resolved.ingredient : null;
  const formId = resolved.form;

  // Company and compatibility do not need a supported ingredient, so they run
  // even for an unsupported one -- the buyer still learns about the brand.
  const remaining = () => deps.budgetMs - (deps.now() - t0) - SAFETY_MARGIN_MS;
  const modelBudget = Math.min(MAX_TEXT_CALL_MS, remaining());
  const allowModel = modelBudget >= MIN_MODEL_BUDGET_MS;

  const companyPromise = (async () => {
    const t = deps.now();
    const section = await companySection(
      {
        brand: label.brand,
        manufacturer: label.manufacturer,
        product_name: label.product_name,
        certifications: label.certifications ?? [],
        country_of_origin: label.country_of_origin,
      },
      { chatJson: deps.chatJson, fetch: deps.fetch, timeoutMs: Math.max(1000, Math.min(modelBudget, REGISTRY_TIMEOUT_MS * 3)), allowModel },
    );
    stages.company = seconds(deps.now() - t);
    return section;
  })();

  if (!ingredient) {
    out.status = "ingredient_not_supported";
    out.ingredient_label_text = label.ingredient_label_text;
    out.supported_ingredients = ingredientIds().sort();
    out.queue = await enqueue(null, null, label.ingredient_label_text);
    out.company = await companyPromise;
    if (out.company.profile.model) out.meta.models.text = out.company.profile.model;
    out.meta.prompt_versions.company = out.company.profile.prompt_version;
    return finish("ingredient_not_supported");
  }

  const elemental = elementalDoseRangeMg(ingredient, formId, label.compound_dose_mg);
  const scored = scoredDose(elemental.low, label.servings_per_day);
  out.product = {
    ingredient,
    form: formId,
    compound_dose_mg: label.compound_dose_mg,
    elemental_dose_mg: elemental,
    servings_per_day: label.servings_per_day,
    scored_dose_mg: scored.dose,
    scored_dose_basis: scored.basis,
    is_multi_ingredient: Boolean(label.is_multi_ingredient),
    other_actives: label.other_actives ?? [],
  };

  // ---- stage 2: evidence (deterministic) ---------------------------------
  const tEvidence = deps.now();
  const result = deps.scoreProduct(ingredient, formId ?? "", scored.dose) as Json;
  stages.evidence = seconds(deps.now() - tEvidence);
  out.evidence = result;

  const rows = result.status === "scored" ? (result.rows as Array<Json>) : null;
  const scoredForms = (availableProducts().filter((p) => p.ingredient === ingredient).map((p) => p.form)) as string[];
  const formFit: EvidenceFormFit = {
    status:
      result.status === "scored"
        ? "exact_form_scored"
        : result.status === "form_not_scored"
          ? "form_not_scored"
          : result.status === "not_scored"
            ? "ingredient_not_scored"
            : "unknown",
    scored_forms: scoredForms,
    form_strength: rows?.[0] ? ((((rows[0].arcs as Json)?.form as Json)?.strength as number | null) ?? null) : null,
    form_basis: rows?.[0] ? ((((rows[0].arcs as Json)?.form as Json)?.basis as string | null) ?? null) : null,
  };

  // ---- stage 3: dose effectiveness (deterministic) -----------------------
  out.dose_effectiveness = doseEffectivenessSection({
    perServingElementalMg: elemental.low,
    servingsPerDay: label.servings_per_day,
    conversionBasis: elemental.basis,
    rows: rows as unknown as DoseRowInput[] | null,
  });

  // ---- stage 4: compatibility (curated + model), in parallel with company --
  const compatPromise = (async () => {
    const t = deps.now();
    const section = await compatibilitySection(
      {
        ingredient,
        formId,
        actives: label.actives ?? [],
        otherActives: label.other_actives ?? [],
        evidenceFormFit: formFit,
      },
      { chatJson: deps.chatJson, timeoutMs: Math.max(1000, modelBudget), allowModel },
    );
    stages.compatibility = seconds(deps.now() - t);
    return section;
  })();

  const [compat, company] = await Promise.all([compatPromise, companyPromise]);
  out.compatibility = compat;
  out.company = company;
  out.meta.prompt_versions.compatibility = compat.model.prompt_version;
  out.meta.prompt_versions.company = company.profile.prompt_version;
  out.meta.models.text = compat.model.model ?? company.profile.model ?? null;

  if (result.status !== "scored") {
    out.census = await census(ingredient, deps.fetch);
    out.queue = await enqueue(ingredient, formId, label.ingredient_label_text);
  }

  const caveats: Array<{ code: string; text: string }> = [];
  if (label.is_multi_ingredient) {
    caveats.push({
      code: "multi_ingredient_product",
      text:
        `This product doses more than one active. The evidence score is about ${ingredient.replace(/_/g, " ")} ` +
        "on its own, which is not the same question as this blend.",
    });
  }
  if (elemental.basis === "compound_only" || elemental.basis === "unstated") {
    caveats.push({
      code: "dose_not_convertible",
      text:
        "The dose axis is unavailable: " +
        (elemental.basis === "unstated"
          ? "no per-serving mass for this ingredient is printed on the label."
          : "this form's hydration state is not stated, so its elemental dose cannot be computed without guessing."),
    });
  }
  if (scored.basis === "per_serving") {
    caveats.push({
      code: "servings_not_stated",
      text: "Servings per day are not printed, so the per-serving dose was scored. Your daily dose may be higher.",
    });
  }
  if (!allowModel) {
    caveats.push({
      code: "model_sections_skipped",
      text: "The label read used most of the time budget, so the company profile and the compatibility fill-in were skipped. The evidence score is complete.",
    });
  }
  if (caveats.length) out.caveats = caveats;

  return finish(String(result.status));
}
