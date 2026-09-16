/*
 * THE SCAN ORCHESTRATOR: one label image -> one ScanAnalysisV1.
 *                        or, since 2026-09-15, one TYPED product -> the same.
 *
 * Stages, in dependency order (docs/SYSTEM_DESIGN.md has the diagram):
 *
 *   0  label read            vision model     -> what is PRINTED          [MODEL]
 *      -- or --
 *   0' manual entry          deterministic    -> what the user TYPED (no model)
 *   1  identity + dose       deterministic    -> ingredient, form, elemental mg
 *   2  evidence score        deterministic    -> rows + four arcs (retained run)
 *   2b evidence ORIENTATION  model            -> only when 2 found no run   [MODEL]
 *   3  dose effectiveness    deterministic    -> reading per outcome from stage 2
 *   4  form & compatibility  curated + model  -> cited interactions + fill-in   [MODEL]
 *   5  company background    label + registry + model                         [MODEL]
 *
 * Stage 0 (or 0') gates everything. Stages 2-3 are pure functions of the
 * product facts and the retained artifacts. Stages 2b, 4 and 5 run IN PARALLEL
 * after stage 1 and each degrades to `unavailable` on its own -- a company
 * profile that times out never costs the user the evidence score.
 *
 * ONE POST-LABEL PATH. `analyzeFromLabel` is everything after the product
 * facts are known; `analyzeScan` (photo) and `analyzeManual` (typed) both call
 * it. Two copies of stages 1-5 is how a photo and a typed entry of the same
 * product would drift apart, so there is one.
 *
 * SOURCE AND BASIS ARE PART OF THE ANSWER. Every analysis carries
 * `source: "photo" | "manual"`. A photo's facts are basis `label` (as printed,
 * with the vision read's confidence and quoted spans). A typed entry's facts
 * are basis `user_input`: no read confidence, no spans, no vision model, and a
 * standing caveat that nothing verified the product contains what was typed.
 * The UI keys off `source` so typed data can never be typeset as a label read.
 *
 * EVERY SUPPLEMENT GETS AN ANSWER (founder 2026-09-08). A retained run always
 * wins; when there is none -- which today is everything except creatine
 * monohydrate -- stage 2b asks the model what the literature says, and the
 * result is rendered as a clearly-marked ESTIMATE with no 0-100 score. Stage 2b
 * runs for ingredients outside the vocabulary too, so a shilajit tub still gets
 * an orientation, a compatibility read and a company background.
 *
 * TIME BUDGET. The route allows 60 s. The vision read takes 10-20 s on DeepSeek
 * (measured 2026-08-24). Whatever remains, minus a safety margin, is the
 * ceiling for the two text calls; below MIN_MODEL_BUDGET_MS they are skipped
 * with `reason: time budget` rather than started and killed.
 *
 * EVERY SECTION CARRIES ITS BASIS. `label` (as printed), `user_input` (typed),
 * `evidence_run` (scored trials with provenance), `registry` (openFDA),
 * `curated_table` (cited), `model_prior` (the model's own knowledge,
 * unverified). The UI renders the badge next to each block, and the legend
 * explains the ranking. A model-prior sentence never becomes a number, and a
 * number never appears without its arcs (invariant 8).
 *
 * Dependencies are injectable so the whole orchestration is unit-tested with a
 * fake label read, a fake model and a fake fetch -- zero model calls in tests.
 */
import { catalogForm, catalogIngredient } from "./catalog";
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
import { evidencePriorSection, type EvidencePriorSection } from "./evidence-prior";
import { chatJson, providerConfigured, type ChatJsonFn } from "./llm";
import type { AppVersionInfo, ScanHistoryOutcome } from "@/lib/scan-history/store";
import { checkManualDose, checkServingsPerDay, type ManualDoseUnit } from "./manual-dose";
import { availableProducts, scoreProduct } from "./product-score";
import { readLabel, type LabelActive, type LabelMediaType, type LabelRead } from "./vision";
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
  user_input: {
    label: "Typed by you",
    means: "Entered by hand, not read from a label. Nothing here checked that the product contains what was typed.",
    rank: 5,
  },
  model_prior: {
    label: "Model knowledge",
    means: "What the model recalls from training data. Unverified; shown for orientation only and never scored.",
    rank: 6,
  },
};

export type ScanSource = "photo" | "manual";

/**
 * What stages 1-5 need to know about the product. A `LabelRead` satisfies this
 * structurally (it is a superset); a manual entry is built into it with every
 * photo-only field empty rather than guessed.
 */
export interface ProductFacts {
  ingredient_vocab_id: string | null;
  ingredient_label_text: string | null;
  form_vocab_id: string | null;
  compound_dose_mg: number | null;
  servings_per_day: number | null;
  is_multi_ingredient: boolean;
  other_actives: string[];
  actives: LabelActive[];
  certifications: string[];
  manufacturer: string | null;
  country_of_origin: string | null;
  brand: string | null;
  product_name: string | null;
}

/** The JSON body POST /api/scan accepts in place of an image. */
export interface ManualScanInput {
  ingredient: string;
  form: string;
  dose: { value: number; unit: ManualDoseUnit } | null;
  servings_per_day: number | null;
}

/** What the user typed, echoed back under its own basis. */
export interface ManualEntry {
  basis: "user_input";
  ingredient: string;
  ingredient_label: string;
  form: string;
  form_label: string;
  dose_per_serving: { value: number; unit: ManualDoseUnit; mg: number } | null;
  servings_per_day: number | null;
}

export interface ScanAnalysis {
  schema_version: typeof SCAN_SCHEMA_VERSION;
  analyzed_at: string;
  /** Where the product facts came from. Photo = a vision read; manual = typed. */
  source: ScanSource;
  status: string;
  error?: string;
  /** Present on the photo path only. */
  label?: LabelRead;
  /** Present on the manual path only. Never a LabelRead: no confidence, no spans. */
  input?: ManualEntry;
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
  /** Stage 2b. Present ONLY when no retained run could answer (see scan.ts header). */
  evidence_prior?: EvidencePriorSection;
  dose_effectiveness?: DoseEffectivenessSection;
  compatibility?: CompatibilitySection;
  company?: CompanySection;
  census?: Json;
  queue?: Json;
  caveats?: Array<{ code: string; text: string }>;
  ingredient_label_text?: string | null;
  supported_ingredients?: string[];
  basis_legend: typeof BASIS_LEGEND;
  /**
   * Durable scan-run history (added by app/api/scan/route.ts AFTER this
   * object is built -- analyzeScan/analyzeManual never set these three
   * fields themselves). `run_id` is generated before analysis starts;
   * `app_version` is this deployment's exact release identity; `persistence`
   * says honestly whether the run (and, for a photo, its image) was durably
   * stored -- never "stored" when it was not. See lib/scan-history/store.ts.
   */
  run_id?: string;
  app_version?: AppVersionInfo;
  persistence?: ScanHistoryOutcome;
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

/** One analysis in flight: its clock, its stage timings and the answer being built. */
export interface ScanRun {
  source: ScanSource;
  deps: ScanDeps;
  t0: number;
  stages: Record<string, number | null>;
  out: ScanAnalysis;
  finish: (status: string) => ScanAnalysis;
}

export function startRun(source: ScanSource, deps: ScanDeps): ScanRun {
  const t0 = deps.now();
  const stages: Record<string, number | null> = {
    label: null,
    evidence: null,
    evidence_prior: null,
    compatibility: null,
    company: null,
  };
  const out: ScanAnalysis = {
    schema_version: SCAN_SCHEMA_VERSION,
    analyzed_at: stamp(),
    source,
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
  return { source, deps, t0, stages, out, finish };
}

/* -------------------------------------------------------------------------- */
/*  Photo path: stage 0 is the vision read                                     */
/* -------------------------------------------------------------------------- */

export async function analyzeScan(
  imageBase64: string,
  mediaType: LabelMediaType,
  deps: ScanDeps = defaultDeps(),
): Promise<ScanAnalysis> {
  const run = startRun("photo", deps);
  const { out, stages } = run;

  // ---- stage 0: label -----------------------------------------------------
  let label: LabelRead;
  const tLabel = deps.now();
  try {
    label = await deps.readLabel(imageBase64, mediaType);
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
    stages.label = seconds(deps.now() - tLabel);
    return run.finish("label_unreadable");
  }
  stages.label = seconds(deps.now() - tLabel);
  out.label = label;
  out.meta.models.vision = label._meta?.model ?? null;
  out.meta.prompt_versions.label = label._meta?.prompt_version ?? "unknown";

  if (!label.is_supplement_label) return run.finish("not_a_supplement_label");

  return analyzeFromLabel(label, run);
}

/* -------------------------------------------------------------------------- */
/*  Manual path: stage 0' is validation of what was typed                      */
/* -------------------------------------------------------------------------- */

export type ManualValidation = { ok: true; entry: ManualEntry; facts: ProductFacts } | { ok: false; error: string };

/**
 * Turn a typed entry into product facts, or refuse with a reason. Everything is
 * checked against the vocabulary: the ingredient must exist, the form must
 * belong to it, the dose must be a positive number in mg, g or mcg under the
 * form's sanity ceiling, servings/day must be a positive whole number under
 * its own ceiling (both in `manual-dose.ts`, shared with the client form, and
 * neither a scoring constant), and an ingredient dosed in CFU takes no mass
 * dose at all (a probiotic count is not a milligram and this path does not
 * pretend otherwise).
 */
export function validateManualInput(input: unknown): ManualValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "Expected a JSON object." };
  const body = input as Record<string, unknown>;

  const ingredientId = typeof body.ingredient === "string" ? body.ingredient.trim() : "";
  const ingredient = ingredientId ? catalogIngredient(ingredientId) : null;
  if (!ingredient) return { ok: false, error: "Pick an ingredient from the catalog." };

  const formId = typeof body.form === "string" ? body.form.trim() : "";
  const form = formId ? catalogForm(ingredient.id, formId) : null;
  if (!form) return { ok: false, error: `Pick a form of ${ingredient.label} from the catalog.` };

  let dose: ManualEntry["dose_per_serving"] = null;
  if (body.dose !== null && body.dose !== undefined) {
    if (typeof body.dose !== "object") return { ok: false, error: "The dose must be an object with a value and a unit." };
    const d = body.dose as Record<string, unknown>;
    const checked = checkManualDose(d.value, d.unit);
    if (!checked.ok) return { ok: false, error: checked.error };
    if (ingredient.dose_basis_kind === "cfu") {
      return { ok: false, error: `${ingredient.label} is dosed in CFU, which is a count, not a mass. Leave the dose empty.` };
    }
    dose = { value: d.value as number, unit: d.unit as ManualDoseUnit, mg: checked.mg };
  }

  let servings: number | null = null;
  if (body.servings_per_day !== null && body.servings_per_day !== undefined) {
    const checked = checkServingsPerDay(body.servings_per_day);
    if (!checked.ok) return { ok: false, error: checked.error };
    servings = checked.servings;
  }

  const entry: ManualEntry = {
    basis: "user_input",
    ingredient: ingredient.id,
    ingredient_label: ingredient.label,
    form: form.id,
    form_label: form.label,
    dose_per_serving: dose,
    servings_per_day: servings,
  };
  const facts: ProductFacts = {
    ingredient_vocab_id: ingredient.id,
    ingredient_label_text: ingredient.label,
    form_vocab_id: form.id,
    compound_dose_mg: dose?.mg ?? null,
    servings_per_day: servings,
    // Nothing else was typed, so nothing else is claimed. Empty, not guessed.
    is_multi_ingredient: false,
    other_actives: [],
    actives: [],
    certifications: [],
    manufacturer: null,
    country_of_origin: null,
    brand: null,
    product_name: null,
  };
  return { ok: true, entry, facts };
}

export async function analyzeManual(input: unknown, deps: ScanDeps = defaultDeps()): Promise<ScanAnalysis> {
  const run = startRun("manual", deps);
  const checked = validateManualInput(input);
  if (!checked.ok) {
    run.out.error = checked.error;
    return run.finish("manual_input_invalid");
  }
  run.out.input = checked.entry;
  // No label stage ran, so its timing stays null — `0` would claim a read
  // that took no time rather than a read that never happened.
  return analyzeFromLabel(checked.facts, run);
}

/* -------------------------------------------------------------------------- */
/*  Stages 1-5: shared by both paths                                           */
/* -------------------------------------------------------------------------- */

export async function analyzeFromLabel(label: ProductFacts, run: ScanRun): Promise<ScanAnalysis> {
  const { deps, t0, stages, out, source } = run;
  const typed = source === "manual";

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

  // An ingredient outside the vocabulary has no elemental conversion, no
  // scorer and no curated form ladder -- but it still has a literature, a
  // combination and a manufacturer, so it gets stages 2b, 4 and 5 rather than
  // a dead end (founder 2026-09-08). The manual path cannot reach here: its
  // ingredient is validated against the catalog first.
  if (!ingredient) {
    const printedName = label.ingredient_label_text ?? label.ingredient_vocab_id ?? "this ingredient";
    const asPrinted = scoredDose(label.compound_dose_mg, label.servings_per_day);
    const tPrior = deps.now();
    const [prior, compat, company] = await Promise.all([
      evidencePriorSection(
        {
          ingredientText: printedName,
          formText: label.form_vocab_id ?? null,
          scoredDoseMg: asPrinted.dose,
          doseIsElemental: false,
        },
        { chatJson: deps.chatJson, timeoutMs: Math.max(1000, modelBudget), allowModel },
      ),
      compatibilitySection(
        {
          ingredient: printedName,
          formId: null,
          actives: label.actives ?? [],
          otherActives: label.other_actives ?? [],
          evidenceFormFit: { status: "ingredient_not_scored", scored_forms: [], form_strength: null, form_basis: null },
        },
        { chatJson: deps.chatJson, timeoutMs: Math.max(1000, modelBudget), allowModel },
      ),
      companyPromise,
    ]);
    stages.evidence_prior = seconds(deps.now() - tPrior);
    out.status = "ingredient_not_supported";
    out.ingredient_label_text = label.ingredient_label_text;
    out.supported_ingredients = ingredientIds().sort();
    out.evidence_prior = prior;
    out.compatibility = compat;
    out.company = company;
    out.queue = await enqueue(null, null, label.ingredient_label_text);
    out.meta.models.text = prior.model ?? compat.model.model ?? company.profile.model ?? null;
    out.meta.prompt_versions.evidence_prior = prior.prompt_version;
    out.meta.prompt_versions.compatibility = compat.model.prompt_version;
    out.meta.prompt_versions.company = company.profile.prompt_version;
    return run.finish("ingredient_not_supported");
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

  // Stage 2b: no retained run could answer, so ask the model what the
  // literature says. In parallel with 4 and 5, and never when a run exists.
  const priorPromise = (async (): Promise<EvidencePriorSection | null> => {
    if (result.status === "scored") return null;
    const t = deps.now();
    const section = await evidencePriorSection(
      {
        ingredientText: label.ingredient_label_text ?? ingredient.replace(/_/g, " "),
        formText: formId ? formId.replace(/_/g, " ") : null,
        // Prefer the elemental daily dose; fall back to the printed mass when
        // the conversion refused, flagged so the prompt does not read a
        // compound mass as an elemental one.
        scoredDoseMg: scored.dose ?? scoredDose(label.compound_dose_mg, label.servings_per_day).dose,
        doseIsElemental: scored.dose !== null,
      },
      { chatJson: deps.chatJson, timeoutMs: Math.max(1000, modelBudget), allowModel },
    );
    stages.evidence_prior = seconds(deps.now() - t);
    return section;
  })();

  const [compat, company, prior] = await Promise.all([compatPromise, companyPromise, priorPromise]);
  out.compatibility = compat;
  out.company = company;
  if (prior) {
    out.evidence_prior = prior;
    out.meta.prompt_versions.evidence_prior = prior.prompt_version;
  }
  out.meta.prompt_versions.compatibility = compat.model.prompt_version;
  out.meta.prompt_versions.company = company.profile.prompt_version;
  out.meta.models.text = compat.model.model ?? company.profile.model ?? prior?.model ?? null;

  if (result.status !== "scored") {
    out.census = await census(ingredient, deps.fetch);
    out.queue = await enqueue(ingredient, formId, label.ingredient_label_text);
  }

  const caveats: Array<{ code: string; text: string }> = [];
  if (typed) {
    caveats.push({
      code: "typed_not_verified",
      text:
        "These figures were typed, not read from a label. The analysis is about the ingredient, form and dose entered; " +
        "nothing here checked that a product actually contains them.",
    });
  }
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
          ? typed
            ? "no per-serving dose was entered."
            : "no per-serving mass for this ingredient is printed on the label."
          : "this form's hydration state is not stated, so its elemental dose cannot be computed without guessing."),
    });
  }
  if (scored.basis === "per_serving") {
    caveats.push({
      code: "servings_not_stated",
      text: typed
        ? "Servings per day were not entered, so the per-serving dose was scored. Your daily dose may be higher."
        : "Servings per day are not printed, so the per-serving dose was scored. Your daily dose may be higher.",
    });
  }
  if (!allowModel) {
    caveats.push({
      code: "model_sections_skipped",
      text: "The label read used most of the time budget, so the company profile and the compatibility fill-in were skipped. The evidence score is complete.",
    });
  }
  if (caveats.length) out.caveats = caveats;

  return run.finish(String(result.status));
}
