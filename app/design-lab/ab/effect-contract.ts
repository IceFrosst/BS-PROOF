/*
 * effect-research-v0.1 — typed contract + runtime validation for an EFFECT-ONLY
 * research file (app/design-lab/ab/effect-research/*.json, produced by
 * prompts/effect_research.md against schemas/effect_research.json).
 *
 * Development-only. Nothing here is wired into a production route, and it does
 * NOT touch the older audit files in app/design-lab/ab/audits/ or their schema.
 *
 * Three decisions this file encodes, because they are the point of the pass:
 *
 *  1. EFFECT ONLY. A file may carry a reported effect and nothing else. There is
 *     no ledger, certainty, form, dose or person score here, and none may be
 *     inferred from it — `not_assessed` names the bars that were not looked at.
 *  2. REPORTED, NOT GRADED. An estimate is carried in its own metric and unit.
 *     SMD stays SMD, RR stays RR; there is no conversion, no anchor table, no
 *     0-3 tier and no pooling of two reviews into one number.
 *  3. MALFORMED DATA IS REFUSED, NOT SCORED. `validateEffectResearch` rejects
 *     non-finite numbers, an interval that does not bracket its estimate, a
 *     non-positive ratio, and any quote or cross-check that points at a source
 *     id the file never declared.
 */

/** Own cache domain (invariant 3). Not the shared pipeline PROMPT_VERSION. */
export const EFFECT_RESEARCH_PROMPT_VERSION = "effect-research-v0.1";

export type EffectMetric = "smd" | "rr";
/**
 * Which side of the null is the BETTER outcome, on this metric as the source
 * reported it. "unclear" is a real answer: some abstracts do not let you
 * recover the sign convention, and guessing it would invert a finding.
 */
export type EffectDirection = "higher_better" | "lower_better" | "unclear";
export type SourceAccess = "full_text" | "abstract" | "snippet" | "not_retrieved";
export type SourceDesign = "sr_ma" | "nma" | "narrative_review" | "rct";
export type NotAssessedBar = "evidence" | "form" | "dose" | "person";
/** How a cross-check relates to the primary estimate. Never "confirms". */
export type CrossCheckRelation = "same_question" | "different_population" | "different_endpoint";
export type OverlapStatus = "unknown" | "none" | "partial" | "likely_substantial";

export interface EffectSource {
  /** Local id used by every reference in the file, e.g. "S1". */
  id: string;
  /** Human-facing reference, e.g. "PMID 40335666". */
  label: string;
  title: string;
  year: number;
  design: SourceDesign;
  access: SourceAccess;
  pmid: string | null;
  pmcid: string | null;
  doi: string | null;
  trials: number | null;
  participants: number | null;
  methods_strengths: string[];
  methods_limits: string[];
  /** Disclosure only. Never a score penalty, never a quality point. */
  funding: string;
}

export interface ReportedEstimate {
  /** What was measured, e.g. "reaction time". */
  what: string;
  metric: EffectMetric;
  /** Natural unit as printed by the source, e.g. "Hedges g", "risk ratio". */
  unit: string;
  value: number;
  ciLow: number | null;
  ciHigh: number | null;
  /** Required when the interval is absent: why it is absent. Never draw a fake one. */
  interval_note: string;
  direction: EffectDirection;
  source: string;
}

export interface EffectQuote {
  text: string;
  source: string;
}

export interface CrossCheck {
  source: string;
  relation: CrossCheckRelation;
  overlap: OverlapStatus;
  /** Only ever true when overlap is "none". Two reviews of one literature are not a replication. */
  independent_replication: boolean;
  estimate: ReportedEstimate | null;
  note: string;
}

export interface PracticalImportance {
  /** "unknown" survives statistical significance. */
  status: "unknown" | "reported_by_source";
  note: string;
}

export interface EffectOutcome {
  id: string;
  name: string;
  population: string;
  primary_source: string;
  estimate: ReportedEstimate;
  /** Other numbers the same source reports. Shown separately, NEVER combined. */
  also_reported: ReportedEstimate[];
  quote: EffectQuote;
  comparator: string;
  timeframe: string;
  dose_applicability: string;
  practical_importance: PracticalImportance;
  limits: string[];
  cross_checks: CrossCheck[];
}

export interface EffectResearchFile {
  meta: {
    prompt: string;
    run_at: string;
    model: string;
    human_verified: boolean;
    note: string;
    /** Which sources a reviewer re-opened at the source to check the numbers. Not verification. */
    reopened_at_source?: string;
  };
  product: string;
  ingredient: string;
  dose_studied: string;
  sources: EffectSource[];
  outcomes: EffectOutcome[];
  /** Bars this pass did NOT look at. The UI must render them as not assessed. */
  not_assessed: Array<{ bar: NotAssessedBar; reason: string }>;
  access_failures: string[];
  guards: string[];
}

export type ValidationResult =
  | { ok: true; file: EffectResearchFile }
  | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isNumOrNull = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));

const METRICS: EffectMetric[] = ["smd", "rr"];
const DIRECTIONS: EffectDirection[] = ["higher_better", "lower_better", "unclear"];
const ACCESS: SourceAccess[] = ["full_text", "abstract", "snippet", "not_retrieved"];
const DESIGNS: SourceDesign[] = ["sr_ma", "nma", "narrative_review", "rct"];
const BARS: NotAssessedBar[] = ["evidence", "form", "dose", "person"];
const RELATIONS: CrossCheckRelation[] = ["same_question", "different_population", "different_endpoint"];
const OVERLAPS: OverlapStatus[] = ["unknown", "none", "partial", "likely_substantial"];

function checkEstimate(raw: unknown, where: string, ids: Set<string>, errors: string[]): void {
  if (!isRec(raw)) {
    errors.push(`${where}: estimate must be an object`);
    return;
  }
  if (!isStr(raw.what)) errors.push(`${where}: estimate.what is required`);
  if (!METRICS.includes(raw.metric as EffectMetric)) errors.push(`${where}: metric must be one of ${METRICS.join("|")}`);
  if (!isStr(raw.unit)) errors.push(`${where}: unit is required — the natural unit is never dropped`);
  if (!DIRECTIONS.includes(raw.direction as EffectDirection)) errors.push(`${where}: direction must be one of ${DIRECTIONS.join("|")}`);
  if (!isStr(raw.source)) errors.push(`${where}: estimate.source is required`);
  else if (!ids.has(raw.source as string)) errors.push(`${where}: estimate.source "${raw.source}" is not a declared source id`);

  const { value, ciLow, ciHigh } = raw as { value: unknown; ciLow: unknown; ciHigh: unknown };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${where}: value must be a finite number`);
    return;
  }
  if (!isNumOrNull(ciLow) || !isNumOrNull(ciHigh)) {
    errors.push(`${where}: ciLow/ciHigh must be finite numbers or null`);
    return;
  }
  if ((ciLow === null) !== (ciHigh === null)) {
    errors.push(`${where}: an interval needs both bounds or neither — half an interval is not an interval`);
    return;
  }
  if (ciLow === null && !isStr(raw.interval_note)) {
    errors.push(`${where}: interval_note is required when no interval is reported`);
  }
  if (ciLow !== null && ciHigh !== null && !(ciLow <= value && value <= ciHigh)) {
    errors.push(`${where}: interval must bracket the estimate (${ciLow} <= ${value} <= ${ciHigh} is false)`);
  }
  if (raw.metric === "rr") {
    const positives: Array<[string, number | null]> = [["value", value], ["ciLow", ciLow], ["ciHigh", ciHigh]];
    for (const [name, n] of positives) {
      if (n !== null && n <= 0) errors.push(`${where}: a risk ratio must be positive (${name} = ${n})`);
    }
  }
}

/** Validate an unknown blob against effect-research-v0.1. Refuses, never repairs. */
export function validateEffectResearch(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRec(raw)) return { ok: false, errors: ["file must be a JSON object"] };

  const meta = raw.meta;
  if (!isRec(meta)) errors.push("meta is required");
  else {
    if (meta.prompt !== EFFECT_RESEARCH_PROMPT_VERSION) {
      errors.push(`meta.prompt must be "${EFFECT_RESEARCH_PROMPT_VERSION}" (got ${JSON.stringify(meta.prompt)})`);
    }
    if (!isStr(meta.run_at) || !/^\d{4}-\d{2}-\d{2}$/.test(meta.run_at)) errors.push("meta.run_at must be an ISO date");
    if (!isStr(meta.model)) errors.push("meta.model is required");
    if (meta.human_verified !== false) errors.push("meta.human_verified must be false — this pass is not human verified");
    if (!isStr(meta.note)) errors.push("meta.note is required");
  }

  for (const field of ["product", "ingredient", "dose_studied"]) {
    if (!isStr(raw[field])) errors.push(`${field} is required`);
  }
  if (!isStrArray(raw.access_failures ?? [])) errors.push("access_failures must be strings");
  if (!isStrArray(raw.guards ?? [])) errors.push("guards must be strings");

  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  if (sources.length === 0) errors.push("sources must not be empty — a file with no source cannot report an effect");
  const ids = new Set<string>();
  sources.forEach((s, i) => {
    if (!isRec(s)) {
      errors.push(`sources[${i}] must be an object`);
      return;
    }
    if (!isStr(s.id)) errors.push(`sources[${i}].id is required`);
    else if (ids.has(s.id)) errors.push(`sources[${i}].id "${s.id}" is declared twice`);
    else ids.add(s.id);
    if (!isStr(s.label)) errors.push(`sources[${i}].label is required`);
    if (!isStr(s.title)) errors.push(`sources[${i}].title is required`);
    if (typeof s.year !== "number" || !Number.isFinite(s.year)) errors.push(`sources[${i}].year must be a finite number`);
    if (!DESIGNS.includes(s.design as SourceDesign)) errors.push(`sources[${i}].design is invalid`);
    if (!ACCESS.includes(s.access as SourceAccess)) errors.push(`sources[${i}].access is invalid`);
    for (const field of ["pmid", "pmcid", "doi"]) {
      const v = s[field];
      if (v !== null && !isStr(v)) errors.push(`sources[${i}].${field} must be a string or null`);
    }
    for (const field of ["trials", "participants"]) {
      if (!isNumOrNull(s[field])) errors.push(`sources[${i}].${field} must be a finite number or null`);
    }
    if (!isStrArray(s.methods_strengths ?? [])) errors.push(`sources[${i}].methods_strengths must be strings`);
    if (!isStrArray(s.methods_limits ?? [])) errors.push(`sources[${i}].methods_limits must be strings`);
    if (!isStr(s.funding)) errors.push(`sources[${i}].funding is required — disclosure only, never a score`);
  });

  const notAssessed = Array.isArray(raw.not_assessed) ? raw.not_assessed : [];
  notAssessed.forEach((n, i) => {
    if (!isRec(n) || !BARS.includes(n.bar as NotAssessedBar) || !isStr(n.reason)) {
      errors.push(`not_assessed[${i}] must name one of ${BARS.join("|")} with a reason`);
    }
  });

  const outcomes = Array.isArray(raw.outcomes) ? raw.outcomes : [];
  if (outcomes.length === 0) errors.push("outcomes must not be empty");
  const outcomeKeys = new Set<string>();
  outcomes.forEach((o, i) => {
    const where = `outcomes[${i}]`;
    if (!isRec(o)) {
      errors.push(`${where} must be an object`);
      return;
    }
    if (!isStr(o.id)) errors.push(`${where}.id is required`);
    if (!isStr(o.name)) errors.push(`${where}.name is required`);
    if (!isStr(o.population)) errors.push(`${where}.population is required — an outcome without a population is not a finding`);
    const key = `${String(o.name)}||${String(o.population)}`;
    if (outcomeKeys.has(key)) errors.push(`${where}: duplicate name+population "${key}"`);
    outcomeKeys.add(key);
    if (!isStr(o.primary_source)) errors.push(`${where}.primary_source is required`);
    else if (!ids.has(o.primary_source as string)) errors.push(`${where}.primary_source "${o.primary_source}" is not a declared source id`);
    for (const field of ["comparator", "timeframe", "dose_applicability"]) {
      if (!isStr(o[field])) errors.push(`${where}.${field} is required`);
    }
    checkEstimate(o.estimate, `${where}.estimate`, ids, errors);
    const also = Array.isArray(o.also_reported) ? o.also_reported : [];
    also.forEach((e, j) => checkEstimate(e, `${where}.also_reported[${j}]`, ids, errors));

    const quote = o.quote;
    if (!isRec(quote) || !isStr(quote.text)) errors.push(`${where}.quote.text is required`);
    else if (!isStr(quote.source) || !ids.has(quote.source as string)) {
      errors.push(`${where}.quote.source must resolve to a declared source id`);
    }

    const pi = o.practical_importance;
    if (!isRec(pi) || !["unknown", "reported_by_source"].includes(pi.status as string) || !isStr(pi.note)) {
      errors.push(`${where}.practical_importance needs status unknown|reported_by_source and a note`);
    }
    if (!isStrArray(o.limits ?? [])) errors.push(`${where}.limits must be strings`);

    const checks = Array.isArray(o.cross_checks) ? o.cross_checks : [];
    checks.forEach((c, j) => {
      const cw = `${where}.cross_checks[${j}]`;
      if (!isRec(c)) {
        errors.push(`${cw} must be an object`);
        return;
      }
      if (!isStr(c.source) || !ids.has(c.source as string)) errors.push(`${cw}.source must resolve to a declared source id`);
      if (!RELATIONS.includes(c.relation as CrossCheckRelation)) errors.push(`${cw}.relation is invalid`);
      if (!OVERLAPS.includes(c.overlap as OverlapStatus)) errors.push(`${cw}.overlap is invalid`);
      if (typeof c.independent_replication !== "boolean") errors.push(`${cw}.independent_replication must be a boolean`);
      else if (c.independent_replication && c.overlap !== "none") {
        errors.push(`${cw}: independent_replication requires overlap "none" — unknown overlap is not replication`);
      }
      if (!isStr(c.note)) errors.push(`${cw}.note is required`);
      if (c.estimate !== null && c.estimate !== undefined) checkEstimate(c.estimate, `${cw}.estimate`, ids, errors);
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, file: raw as unknown as EffectResearchFile };
}

/** Throwing form for module load: a malformed file must never reach the card. */
export function parseEffectResearch(raw: unknown): EffectResearchFile {
  const result = validateEffectResearch(raw);
  if (!result.ok) throw new Error(`effect-research file rejected:\n- ${result.errors.join("\n- ")}`);
  return result.file;
}

/** Deterministic link for a source. Never invents an identifier it was not given. */
export function sourceUrl(s: EffectSource): string | null {
  if (s.doi) return `https://doi.org/${s.doi}`;
  if (s.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`;
  if (s.pmcid) return `https://www.ncbi.nlm.nih.gov/pmc/articles/${s.pmcid}/`;
  return null;
}

export function findSource(file: EffectResearchFile, id: string): EffectSource | undefined {
  return file.sources.find((s) => s.id === id);
}
