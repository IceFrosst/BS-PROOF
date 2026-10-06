/*
 * PURE ADAPTER: a completed LIVE research audit -> the result card /scan draws
 * (components/live-result-card.tsx). No React, no copy, no fetch, no clock.
 *
 * What this is NOT: a scorer. It never calls `score()`, never makes a headline, a
 * general score, a certainty grade or a band, and it adds no constant. The card shows
 * four rows per outcome, in the established order Effect, Evidence, Form, Dose, and
 * this module only decides, for each row, WHICH EXPLICIT STATE it is in and whether
 * its horizontal bar may be drawn filled.
 *
 * The boundary it respects (investigated before it was written; see CLAUDE.md):
 *  - lib/evidence-ledger `score()` and the old retained `/scan` card turned a model's
 *    ledger into numbers. That was built for the three approved retained audits
 *    only. New live research stays EXPERIMENTAL and UNGRADED (provenance
 *    affects_score=false, human_verified=false, clinically_approved=false, enforced
 *    by `parseResearchResult`), and every source it cites is a search snippet or a
 *    model-written page summary (`original_documents` is 0 by contract).
 *  - app/design-lab/ab/effect-presentation.ts already says what an Effect bar may be
 *    for NEW research: never a fill from a tier a model chose ("Size not graded",
 *    hatched). The same reasoning keeps the Evidence row unfilled: nothing the model
 *    counted came from an opened paper, so this page grades no strength of evidence.
 *  - Form and Dose are the two rows whose existing contract IS a 0-4 match number
 *    (`ledger.formFit` / `ledger.doseFit`, the audit's own words, never ours). A bar
 *    is filled from THAT number, and only when every fact the number depends on is
 *    known and the row is about this very product. Anything else is an unfilled bar
 *    with a named reason. Nothing is defaulted: unknown is not 0, not 1/4, not one
 *    serving a day, not an average, and a context row or a blend is never graded.
 *
 * Every string the audit wrote is passed through untouched (no trim, no rounding, no
 * rewording): ids, units, numbers and quotations stay byte-for-byte.
 */
import { missingFacts, type ResearchFacts, type ResearchResultV2 } from "@/lib/scan-research/client";
import { auditWarnings, gateWarnings } from "@/app/design-lab/ab/evidence-warnings";
import type { AuditFile, Ledger } from "@/lib/evidence-ledger";

/** The established row order. Tests pin it; the card never reorders. */
export const AXIS_ORDER = ["effect", "evidence", "form", "dose"] as const;
export type AxisId = (typeof AXIS_ORDER)[number];

/**
 * filled         the bar is drawn to the audit's own formFit / doseFit (Form and Dose only)
 * data           the audit has findings for this row; nothing here is graded, so the bar is unfilled
 * unknown        the audit says unknown / unclear, or the scan fact the row needs is not recorded
 * not_assessed   no study was cited, so nothing was assessed (NOT "no evidence exists")
 * not_gradeable  a context-only row or a blend: shown, never graded
 */
export type AxisState = "filled" | "data" | "unknown" | "not_assessed" | "not_gradeable";

export type AxisReason =
  | "context_only"
  | "no_source"
  | "size_not_graded"
  | "effect_unclear"
  | "snippet_only"
  | "fit_model_reported"
  | "fit_unknown"
  | "fit_missing"
  | "form_not_stated"
  | "dose_not_stated"
  | "servings_not_stated"
  | "blend"
  | "facts_unavailable";

export interface AxisView {
  id: AxisId;
  state: AxisState;
  reason: AxisReason;
  /** 0..1, ONLY when state is "filled"; null otherwise (an unfilled bar is never a zero-width fill). */
  fill: number | null;
  /** The audit's own 0-4 number, ONLY when state is "filled". */
  fit: 0 | 1 | 2 | 3 | 4 | null;
}

export type WarningId =
  | "context_only"
  | "blend"
  | "other_ingredients_unknown"
  | "servings_not_stated"
  | "dose_not_stated"
  | "form_not_stated"
  | "facts_unavailable"
  | "no_human_controlled_trial"
  | "methodology"
  | "funding"
  | "publication";

export type MethodologyReason = "risk_of_bias" | "consistency" | "precision" | "directness" | "one_rct" | "small_or_short" | "surrogate";

export interface LiveWarning {
  id: WarningId;
  /** `product` warnings are identical on every outcome; `outcome` warnings are about one row. */
  scope: "product" | "outcome";
  /** Sentences of the audit's own prose that mention funding / publication bias, verbatim. */
  reported: string[];
  /** For `methodology`: which checklist domains / gates the audit recorded. */
  reasons: MethodologyReason[];
}

export interface DetailBlock { found: string | null; missing: string | null; move: string | null }
export interface SourceView {
  id: string;
  year: number | null;
  design: string | null;
  n: number | null;
  direction: string | null;
  access: "snippet";
  pooledIn: string | null;
  funding: string | null;
  note: string | null;
  href: string | null;
}
export interface ChecklistView { domain: "risk_of_bias" | "consistency" | "precision" | "directness" | "publication_bias"; judgement: "supported" | "concern" | "unknown" }
export interface GatesView { rctCount: number | null; largestRctN: number | null; longestRctWeeks: number | null; chronicOutcome: boolean | null; surrogate: boolean | null; allPositiveIndustryOrOneLab: boolean | null }

export interface OutcomeCard {
  /** Unique per card (position based): two rows may share a name, and a model may repeat a population. */
  key: string;
  index: number;
  name: string;
  population: string | null;
  sentence: string;
  /** DO_NOT_GRADE: the audit marked this row single-ingredient context for a combination. */
  context: boolean;
  /** Always four, always in AXIS_ORDER. */
  axes: AxisView[];
  /** Product warnings first, then this outcome's, one per id. */
  warnings: LiveWarning[];
  detail: Record<AxisId, DetailBlock | null>;
  effectTier: "-3" | "0" | "1" | "2" | "3" | "unclear" | null;
  effectBasis: string | null;
  absoluteEffect: string | null;
  clinicallyMeaningful: string | null;
  strongestStudy: string;
  strongestDoubt: string;
  studyThatWouldMove: string | null;
  effectiveDailyRange: string | null;
  /** The audit's raw fit values, for display as TEXT only (never a bar unless the row is "filled"). */
  formFitRaw: string | null;
  doseFitRaw: string | null;
  bodyIsRct: boolean | null;
  checklist: ChecklistView[];
  gates: GatesView | null;
  sources: SourceView[];
}

export interface LiveResultCardData {
  rows: OutcomeCard[];
  /** The product is a combination: the facts say so, or the audit itself marked a row context-only. */
  blend: boolean;
  /** Audit level, verbatim. */
  audit: {
    runAt: string | null;
    note: string | null;
    product: string;
    ingredient: string;
    form: string;
    dailyDose: string;
    doseNote: string | null;
    selfConfidence: string | null;
    confidenceNote: string | null;
  };
}

/* ------------------------------ guards (a missing field is unknown, never a default) ------------------------------ */

const rec = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === "string" ? x : null);
const nonBlank = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const wholeNumber = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === "boolean" ? x : null);

const TIERS = ["-3", "0", "1", "2", "3", "unclear"] as const;
const tierOf = (x: unknown): OutcomeCard["effectTier"] => (typeof x === "string" && (TIERS as readonly string[]).includes(x) ? (x as OutcomeCard["effectTier"]) : null);

/**
 * The audit's formFit / doseFit: the schema's string "0".."4" or "unknown" (older audits
 * carried a number). "unknown" stays "unknown"; anything else is null = not usable.
 * It is never coerced to 0 and never clamped.
 */
export function parseFit(x: unknown): 0 | 1 | 2 | 3 | 4 | "unknown" | null {
  if (x === "unknown") return "unknown";
  const n = typeof x === "number" ? x : typeof x === "string" && /^[0-4]$/.test(x) ? Number(x) : null;
  return n !== null && Number.isInteger(n) && n >= 0 && n <= 4 ? (n as 0 | 1 | 2 | 3 | 4) : null;
}

const JUDGEMENTS = ["supported", "concern", "unknown"] as const;
const DOMAINS = ["risk_of_bias", "consistency", "precision", "directness", "publication_bias"] as const;

/** The exact words the live prompt (L4) requires on every single-ingredient context row of a combination. */
export const CONTEXT_ONLY_PREFIX = "CONTEXT ONLY";
export const isContextPopulation = (population: string | null): boolean => population !== null && population.trimStart().toUpperCase().startsWith(CONTEXT_ONLY_PREFIX);

/** DOI / PMID / PMCID links by the shape of the ID only (the production /scan behaviour); anything else stays plain text. */
export function sourceHref(id: string): string | null {
  const doi = id.match(/10\.\d{4,9}\/[^^\s,;]+/i)?.[0];
  if (doi) return `https://doi.org/${doi.replace(/[.)]+$/, "")}`;
  const pmid = id.match(/PMID[: ]+(\d+)/i)?.[1];
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  const pmc = id.match(/\b(PMC\d+)\b/i)?.[1];
  return pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmc}/` : null;
}

const detailOf = (x: unknown): DetailBlock | null => {
  if (!rec(x)) return null;
  const block = { found: text(x.found), missing: text(x.missing), move: text(x.move) };
  return block.found === null && block.missing === null && block.move === null ? null : block;
};

function sourcesOf(view: ResearchResultV2["audit"]["outcomes"][number], raw: unknown): SourceView[] {
  const items = rec(raw) && Array.isArray(raw.inventory) ? raw.inventory : null;
  const aligned = items !== null && items.length === view.inventory.length && items.every((item, i) => rec(item) && item.id === view.inventory[i].id);
  return view.inventory.map((entry, i) => {
    const item = aligned ? (items![i] as Record<string, unknown>) : null;
    return {
      id: entry.id,
      year: item ? wholeNumber(item.year) : null,
      design: item ? text(item.design) : null,
      n: item ? wholeNumber(item.n) : null,
      direction: item ? text(item.direction) : null,
      access: "snippet" as const,
      pooledIn: item ? nonBlank(item.pooled_in) : null,
      funding: item ? text(item.funding) : null,
      note: item ? text(item.note) : null,
      href: sourceHref(entry.id),
    };
  });
}

function gatesOf(x: unknown): GatesView | null {
  if (!rec(x)) return null;
  return {
    rctCount: wholeNumber(x.rctCount),
    largestRctN: wholeNumber(x.largestRctN),
    longestRctWeeks: wholeNumber(x.longestRctWeeks),
    chronicOutcome: bool(x.chronicOutcome),
    surrogate: bool(x.surrogate),
    allPositiveIndustryOrOneLab: bool(x.allPositiveIndustryOrOneLab),
  };
}

function checklistOf(x: unknown): ChecklistView[] {
  if (!rec(x)) return [];
  const out: ChecklistView[] = [];
  for (const domain of DOMAINS) {
    const judgement = x[domain];
    if (typeof judgement === "string" && (JUDGEMENTS as readonly string[]).includes(judgement)) out.push({ domain, judgement: judgement as ChecklistView["judgement"] });
  }
  return out;
}

/* ------------------------------ product facts ------------------------------ */

const dosePerServingKnown = (f: ResearchFacts) => f.compoundPerServingMg !== null || f.printedElementalPerServingMg !== null;
/** A zero or missing figure is "not stated": a daily amount is never computed from a guessed count. */
const servingsKnown = (f: ResearchFacts) => f.servingsPerDay !== null && f.servingsPerDay > 0;

export function productWarningsOf(facts: ResearchFacts | null, blend: boolean): LiveWarning[] {
  const out: LiveWarning[] = [];
  const push = (id: WarningId) => out.push({ id, scope: "product", reported: [], reasons: [] });
  if (!facts) {
    push("facts_unavailable");
    return out;
  }
  if (blend) push("blend");
  const missing = missingFacts(facts);
  if (!blend && missing.includes("other_ingredients")) push("other_ingredients_unknown");
  if (missing.includes("servings_per_day") || (facts.servingsPerDay !== null && facts.servingsPerDay <= 0)) push("servings_not_stated");
  if (missing.includes("dose_per_serving")) push("dose_not_stated");
  if (missing.includes("form")) push("form_not_stated");
  return out;
}

/* ------------------------------ outcome-level warnings ------------------------------ */

function methodologyReasons(gates: GatesView | null, checklist: ChecklistView[]): MethodologyReason[] {
  const out: MethodologyReason[] = [];
  for (const entry of checklist) {
    if (entry.judgement === "concern" && entry.domain !== "publication_bias") out.push(entry.domain);
  }
  if (gates && gates.rctCount !== null && gates.rctCount >= 1) {
    if (gates.rctCount === 1) out.push("one_rct");
    // 0 means "not reported" in the schema (it has no unknown value): only a stated figure is a claim.
    const small = gates.largestRctN !== null && gates.largestRctN > 0 && gates.largestRctN < 50;
    const short = gates.chronicOutcome === true && gates.longestRctWeeks !== null && gates.longestRctWeeks > 0 && gates.longestRctWeeks < 4;
    if (small || short) out.push("small_or_short");
  }
  if (gates?.surrogate === true) out.push("surrogate");
  return out;
}

function outcomeWarnings(raw: unknown, context: boolean, gates: GatesView | null, checklist: ChecklistView[]): LiveWarning[] {
  const out: LiveWarning[] = [];
  const push = (w: LiveWarning) => { if (!out.some((x) => x.id === w.id)) out.push(w); };
  if (context) push({ id: "context_only", scope: "outcome", reported: [], reasons: [] });

  // The existing evidence-warnings helpers decide WHEN funding / publication bias / "no human controlled
  // trial" apply, and pick the audit's own sentences that mention them. Their TEXT is not reused: it speaks
  // of a score, of a "retained" or "older" audit, and of one serving scored, none of which is true of live research.
  const ledger = rec(raw) && rec(raw.ledger) ? raw.ledger : null;
  const evidence = rec(raw) && rec(raw.detail) && rec(raw.detail.evidence) ? raw.detail.evidence : {};
  const publication = checklist.find((c) => c.domain === "publication_bias")?.judgement ?? "unknown";
  const asOutcome = {
    ledger: { gates: { allPositiveIndustryOrOneLab: gates?.allPositiveIndustryOrOneLab === true }, checklist: { publication_bias: publication } },
    detail: { evidence: Object.fromEntries(Object.entries(evidence).filter(([, v]) => typeof v === "string")) },
  } as unknown as AuditFile["outcomes"][number];
  const literature = ledger ? auditWarnings(asOutcome) : [];
  const noTrial = gates && gates.rctCount !== null ? gateWarnings({ gates: { rctCount: gates.rctCount } } as unknown as Ledger) : [];

  if (noTrial.length) push({ id: "no_human_controlled_trial", scope: "outcome", reported: [], reasons: [] });
  const reasons = methodologyReasons(gates, checklist);
  if (reasons.length) push({ id: "methodology", scope: "outcome", reported: [], reasons });
  for (const w of literature) {
    if (w.id === "funding" || w.id === "publication") push({ id: w.id, scope: "outcome", reported: [...w.reported], reasons: [] });
  }
  return out;
}

/* ------------------------------ the four rows ------------------------------ */

interface AxisInput {
  facts: ResearchFacts | null;
  blend: boolean;
  context: boolean;
  hasSource: boolean;
  tier: OutcomeCard["effectTier"];
  formFit: unknown;
  doseFit: unknown;
}

const unfilled = (id: AxisId, state: Exclude<AxisState, "filled">, reason: AxisReason): AxisView => ({ id, state, reason, fill: null, fit: null });

function fitAxis(id: "form" | "dose", fit: unknown): AxisView {
  const parsed = parseFit(fit);
  if (parsed === "unknown") return unfilled(id, "unknown", "fit_unknown");
  if (parsed === null) return unfilled(id, "unknown", "fit_missing");
  return { id, state: "filled", reason: "fit_model_reported", fill: parsed / 4, fit: parsed };
}

/** The whole fill policy, in one place. */
export function axesOf(input: AxisInput): AxisView[] {
  const { facts, blend, context, hasSource } = input;
  const effect: AxisView = context
    ? unfilled("effect", "not_gradeable", "context_only")
    : !hasSource
      ? unfilled("effect", "not_assessed", "no_source")
      : input.tier === "unclear" || input.tier === null
        ? unfilled("effect", "unknown", "effect_unclear")
        : unfilled("effect", "data", "size_not_graded");
  const evidence: AxisView = context
    ? unfilled("evidence", "not_gradeable", "context_only")
    : !hasSource
      ? unfilled("evidence", "not_assessed", "no_source")
      : unfilled("evidence", "data", "snippet_only");

  const form: AxisView = context
    ? unfilled("form", "not_gradeable", "context_only")
    : blend
      ? unfilled("form", "not_gradeable", "blend")
      : !facts
        ? unfilled("form", "unknown", "facts_unavailable")
        : facts.form === null
          ? unfilled("form", "unknown", "form_not_stated")
          : !hasSource
            ? unfilled("form", "not_assessed", "no_source")
            : fitAxis("form", input.formFit);
  const dose: AxisView = context
    ? unfilled("dose", "not_gradeable", "context_only")
    : blend
      ? unfilled("dose", "not_gradeable", "blend")
      : !facts
        ? unfilled("dose", "unknown", "facts_unavailable")
        : !dosePerServingKnown(facts)
          ? unfilled("dose", "unknown", "dose_not_stated")
          : !servingsKnown(facts)
            ? unfilled("dose", "unknown", "servings_not_stated")
            : !hasSource
              ? unfilled("dose", "not_assessed", "no_source")
              : fitAxis("dose", input.doseFit);
  return [effect, evidence, form, dose];
}

/* ------------------------------ the card ------------------------------ */

/**
 * `result` is the output of `parseResearchResult` (so the V2/V3 provenance, the
 * snippet-only inventory and the no-score contract were already enforced).
 * `rawResult` is the same job's `result` as received, read ONLY for the extra
 * fields the narrow projection drops (ledger, detail blocks, source metadata).
 * Rows are matched by position and name; a row that does not match keeps only the
 * validated fields and every axis it cannot support reads "unknown".
 */
export function buildLiveResultCard(result: ResearchResultV2, rawResult: unknown, facts: ResearchFacts | null): LiveResultCardData {
  const rawAudit = rec(rawResult) && rec(rawResult.audit) ? rawResult.audit : null;
  const rawOutcomes = rawAudit && Array.isArray(rawAudit.outcomes) ? rawAudit.outcomes : [];
  const marked = result.audit.outcomes.map((o) => isContextPopulation(o.population));
  const blend = facts?.multiIngredient === true || marked.some(Boolean);

  const productWarnings = productWarningsOf(facts, blend);
  const rows = result.audit.outcomes.map((view, index): OutcomeCard => {
    const candidate = rawOutcomes[index];
    const raw = rec(candidate) && candidate.name === view.name ? candidate : null;
    const ledger = raw && rec(raw.ledger) ? raw.ledger : null;
    const context = marked[index];
    const gates = gatesOf(ledger?.gates);
    const checklist = checklistOf(ledger?.checklist);
    const tier = tierOf(ledger?.effectPoints);
    const detail = raw && rec(raw.detail) ? raw.detail : null;
    const sources = sourcesOf(view, raw);
    const outcomeLevel = outcomeWarnings(raw, context, gates, checklist);
    const warnings: LiveWarning[] = [...productWarnings];
    for (const w of outcomeLevel) if (!warnings.some((x) => x.id === w.id)) warnings.push(w);
    return {
      key: `o${index}`,
      index,
      name: view.name,
      population: view.population,
      sentence: view.sentence,
      context,
      axes: axesOf({ facts, blend, context, hasSource: sources.length > 0, tier, formFit: ledger?.formFit, doseFit: ledger?.doseFit }),
      warnings,
      detail: { effect: detailOf(detail?.effect), evidence: detailOf(detail?.evidence), form: detailOf(detail?.form), dose: detailOf(detail?.dose) },
      effectTier: tier,
      effectBasis: text(ledger?.effect_basis),
      absoluteEffect: raw ? text(raw.absolute_effect) : null,
      clinicallyMeaningful: raw ? text(raw.clinically_meaningful) : null,
      strongestStudy: view.strongest_study,
      strongestDoubt: view.strongest_doubt,
      studyThatWouldMove: view.study_that_would_move_this,
      effectiveDailyRange: view.effective_daily_range,
      formFitRaw: ledger && (typeof ledger.formFit === "string" || typeof ledger.formFit === "number") ? String(ledger.formFit) : null,
      doseFitRaw: ledger && (typeof ledger.doseFit === "string" || typeof ledger.doseFit === "number") ? String(ledger.doseFit) : null,
      bodyIsRct: bool(ledger?.bodyIsRct),
      checklist,
      gates,
      sources,
    };
  });

  const meta = rawAudit && rec(rawAudit.meta) ? rawAudit.meta : null;
  return {
    rows,
    blend,
    audit: {
      runAt: meta ? text(meta.run_at) : null,
      note: meta ? text(meta.note) : null,
      product: result.audit.product,
      ingredient: result.audit.ingredient,
      form: result.audit.form,
      dailyDose: result.audit.daily_dose,
      doseNote: result.audit.dose_note,
      selfConfidence: rawAudit ? text(rawAudit.self_confidence) : null,
      confidenceNote: rawAudit ? text(rawAudit.confidence_note) : null,
    },
  };
}
