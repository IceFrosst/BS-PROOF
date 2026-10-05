"use client";

/*
 * Browser-side helpers for the owner-private live research panel
 * (components/scan-research-panel.tsx). CLIENT ONLY: nothing here imports a
 * server module, a model client or the queue contract; the backend contract
 * (lib/scan-research/contract.ts) is mirrored as plain constants and a test
 * (tests/scan-research-client.test.ts) fails if the two drift apart.
 *
 * What the panel may believe is decided HERE, once, so no component renders a
 * field nobody checked:
 *   - `parseResearchJob` projects an API job to the few fields the panel draws.
 *     The job must carry two well-formed ids and a known status, or it is
 *     refused (the panel then says "could not be loaded").
 *   - `parseResearchResult` projects a succeeded job's result to the audit text,
 *     the SourceAccessSummaryV2 counters and the server-stamped provenance. It is
 *     ADDITIVE-TOLERANT (extra keys the backend may add to the same V2 version
 *     are ignored, never printed) and FAIL-CLOSED on what matters: a V1 summary,
 *     a result that claims to change the score, to be clinically approved or
 *     human verified, an inventory entry above "snippet", or a non-zero
 *     original-document count is not shown at all.
 *   - `researchFacts` / `missingFacts` turn the job's own target into the facts
 *     the research used and the ones it did NOT have. A missing fact stays
 *     missing: there is no default serving, no dose basis and no compound guess.
 *   - responses are read with a hard byte cap and every id is checked before a
 *     URL is built.
 *
 * Time: every clock here is an argument (`nowMs`) and every printed time is a
 * fixed-format UTC string, so a test never depends on the machine's locale or
 * timezone.
 */

export const RESEARCH_POLL_MS = 2500;
/** Mirror of LEASE_SECONDS in lib/scan-research/contract.ts (a running job's lease). */
export const RESEARCH_LEASE_SECONDS = 300;
/** Same ceiling the server applies to one stored job (lib/scan-research/store.ts MAX_RESPONSE_BYTES). */
export const RESEARCH_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type SourceAccessSummaryV2 = {
  version: "SourceAccessSummaryV2";
  summary: { requests: number; errors: number; walls: number; refusals: number; search_snippets: number; fetch_summaries: number; original_documents: 0 };
  inventory: Array<{ id: string; evidence_class: "derived_snippet" }>;
  limitations: string[];
};
export type ResearchProvenance = {
  evidence_status: string;
  clinically_approved: false;
  human_verified: false;
  affects_score: false;
  runner: string;
  billing: string;
  model: string;
  prompt_version: string;
  cli_version: string;
  adapter_version: string;
  classifier_version: string;
  /** V2 = results of the prompts v0.2-v0.4 (historical, still read); V3 = live-research-v0.5 (request metadata + lead ledger checked). */
  source_access_version: "SourceAccessV2" | "SourceAccessV3";
};
export type ResearchOutcomeView = {
  name: string;
  population: string | null;
  sentence: string;
  strongest_study: string;
  strongest_doubt: string;
  study_that_would_move_this: string | null;
  effective_daily_range: string | null;
  inventory: Array<{ id: string; access: "snippet" }>;
};
export type ResearchAuditView = {
  model: string;
  prompt: string;
  product: string;
  ingredient: string;
  form: string;
  daily_dose: string;
  dose_note: string | null;
  outcomes: ResearchOutcomeView[];
  could_not_access: string[];
};
export type ResearchResultV2 = { audit: ResearchAuditView; source_access: SourceAccessSummaryV2; provenance: ResearchProvenance };

export type ResearchJobStatus = "queued" | "running" | "succeeded" | "failed";
export type ResearchFacts = {
  basis: "label" | "user_input" | null;
  product: string | null;
  ingredient: string | null;
  form: string | null;
  compoundPerServingMg: number | null;
  printedElementalPerServingMg: number | null;
  unitAsPrinted: string | null;
  servingsPerDay: number | null;
  multiIngredient: boolean | null;
};
export type LiveResearchJob = {
  id: string;
  scan_id: string;
  status: ResearchJobStatus;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  /** Only a safe machine code (letters, digits, underscore) ever survives; otherwise null. */
  failure_code: string | null;
  facts: ResearchFacts | null;
  /** Unvalidated: pass through `parseResearchResult` before drawing anything. */
  result: unknown;
};
export type ResearchReply = { status: string; created?: boolean; job?: unknown };

/* ------------------------------ small guards ------------------------------ */

const record = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === "string";
const nonNegInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const finiteNonNeg = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const optText = (x: unknown): string | null => (str(x) && x.trim() ? x : null);

/** Same shape the server accepts (lib/auth/server-auth.ts isUuid): the id of a saved scan or a research job. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isResearchId = (x: unknown): x is string => str(x) && ID_RE.test(x);
const FAILURE_CODE_RE = /^[a-z0-9_]{1,80}$/i;
const STATUS_RE = /^[a-z_]{1,40}$/;

/* ------------------------------ time (fixed format) ------------------------------ */

/** "2026-10-04 19:37 UTC" from an ISO-8601 instant; null when it is not one. Locale- and zone-independent. */
export function formatUtc(iso: string | null): string | null {
  const ms = instantMs(iso);
  return ms === null ? null : `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
function instantMs(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
/**
 * A RUNNING job whose last worker signal (heartbeat -> updated_at) is older than
 * its lease. This is an observation, not a cap: nothing here ends, retries or
 * limits a job. A queued job has no contract threshold, so it is never "stalled".
 */
export function isStalled(job: Pick<LiveResearchJob, "status" | "updated_at">, nowMs: number): boolean {
  if (job.status !== "running") return false;
  const last = instantMs(job.updated_at);
  return last !== null && nowMs - last > RESEARCH_LEASE_SECONDS * 1000;
}

/* ------------------------------ the job ------------------------------ */

function factsOf(target: unknown): ResearchFacts | null {
  if (!record(target)) return null;
  const dose = record(target.dose) ? target.dose : {};
  const product = record(target.product) ? target.product : {};
  const ingredient = record(target.ingredient) ? target.ingredient : {};
  const form = record(target.form) ? target.form : {};
  const named = [optText(product.brand), optText(product.product_name)].filter((v): v is string => v !== null);
  return {
    basis: target.fact_basis === "label" || target.fact_basis === "user_input" ? target.fact_basis : null,
    product: named.length ? named.join(" ") : null,
    ingredient: optText(ingredient.label) ?? optText(ingredient.vocab_id),
    form: optText(form.label) ?? optText(form.vocab_id),
    compoundPerServingMg: finiteNonNeg(dose.compound_per_serving_mg) ? dose.compound_per_serving_mg : null,
    printedElementalPerServingMg: finiteNonNeg(dose.printed_elemental_per_serving_mg) ? dose.printed_elemental_per_serving_mg : null,
    unitAsPrinted: optText(dose.unit_as_printed),
    servingsPerDay: finiteNonNeg(target.servings_per_day) ? target.servings_per_day : null,
    multiIngredient: typeof target.is_multi_ingredient === "boolean" ? target.is_multi_ingredient : null,
  };
}

/** The panel's view of an API job, or null if it is not a well-formed job. */
export function parseResearchJob(raw: unknown): LiveResearchJob | null {
  if (!record(raw) || !isResearchId(raw.id) || !isResearchId(raw.scan_id)) return null;
  const status = raw.status;
  if (status !== "queued" && status !== "running" && status !== "succeeded" && status !== "failed") return null;
  const when = (x: unknown) => (str(x) && instantMs(x) !== null ? x : null);
  return {
    id: raw.id.toLowerCase(),
    scan_id: raw.scan_id.toLowerCase(),
    status,
    created_at: when(raw.created_at),
    updated_at: when(raw.updated_at),
    completed_at: when(raw.completed_at),
    failure_code: status === "failed" && str(raw.failure_code) && FAILURE_CODE_RE.test(raw.failure_code) ? raw.failure_code : null,
    facts: factsOf(raw.target),
    result: status === "succeeded" ? raw.result : null,
  };
}

export type MissingFact = "servings_per_day" | "dose_per_serving" | "form" | "other_ingredients";
/** What the research did NOT have. Order is the order the panel lists them. Never filled with a default. */
export function missingFacts(facts: ResearchFacts | null): MissingFact[] {
  if (!facts) return [];
  const out: MissingFact[] = [];
  if (facts.servingsPerDay === null) out.push("servings_per_day");
  if (facts.compoundPerServingMg === null && facts.printedElementalPerServingMg === null) out.push("dose_per_serving");
  if (facts.form === null) out.push("form");
  if (facts.multiIngredient === null) out.push("other_ingredients");
  return out;
}

/* ------------------------------ the result ------------------------------ */

const SUMMARY_KEYS = ["requests", "errors", "walls", "refusals", "search_snippets", "fetch_summaries", "original_documents"] as const;
export const SOURCE_ACCESS_KEYS = SUMMARY_KEYS;

function outcomeOf(raw: unknown): ResearchOutcomeView | null {
  if (!record(raw) || !str(raw.name) || !str(raw.sentence) || !str(raw.strongest_study) || !str(raw.strongest_doubt) || !Array.isArray(raw.inventory)) return null;
  const inventory: ResearchOutcomeView["inventory"] = [];
  for (const item of raw.inventory) {
    // Anything above "snippet" would claim a paper was opened. Refuse the whole result rather than downgrade it.
    if (!record(item) || !str(item.id) || item.access !== "snippet") return null;
    inventory.push({ id: item.id, access: "snippet" });
  }
  const ledger = record(raw.ledger) ? raw.ledger : {};
  return {
    name: raw.name,
    population: optText(raw.population),
    sentence: raw.sentence,
    strongest_study: raw.strongest_study,
    strongest_doubt: raw.strongest_doubt,
    study_that_would_move_this: optText(raw.study_that_would_move_this),
    effective_daily_range: optText(ledger.effective_daily_range),
    inventory,
  };
}

function auditOf(raw: unknown): ResearchAuditView | null {
  if (!record(raw) || !record(raw.meta) || !str(raw.meta.model) || !str(raw.meta.prompt) || !str(raw.product) || !str(raw.ingredient) || !str(raw.form) || !str(raw.daily_dose)) return null;
  if (!Array.isArray(raw.outcomes) || !Array.isArray(raw.could_not_access) || !raw.could_not_access.every(str)) return null;
  const outcomes: ResearchOutcomeView[] = [];
  for (const row of raw.outcomes) {
    const outcome = outcomeOf(row);
    if (!outcome) return null;
    outcomes.push(outcome);
  }
  return { model: raw.meta.model, prompt: raw.meta.prompt, product: raw.product, ingredient: raw.ingredient, form: raw.form, daily_dose: raw.daily_dose, dose_note: optText(raw.dose_note), outcomes, could_not_access: raw.could_not_access };
}

/** The panel's view of a succeeded job's result, or null (then nothing of it is shown). */
export function parseResearchResult(raw: unknown): ResearchResultV2 | null {
  if (!record(raw) || !record(raw.provenance) || !record(raw.source_access)) return null;
  const audit = auditOf(raw.audit);
  if (!audit) return null;
  const p = raw.provenance;
  if (!str(p.evidence_status) || !str(p.runner) || !str(p.billing) || !str(p.model) || !str(p.prompt_version) || !str(p.cli_version) || !str(p.adapter_version) || !str(p.classifier_version) || (p.source_access_version !== "SourceAccessV2" && p.source_access_version !== "SourceAccessV3")) return null;
  // An experimental audit that says it is scored, approved or human-checked breaks the contract: do not display it as one.
  if (p.affects_score !== false || p.clinically_approved !== false || p.human_verified !== false) return null;
  const a = raw.source_access;
  if (a.version !== "SourceAccessSummaryV2" || !record(a.summary) || !Array.isArray(a.inventory) || !Array.isArray(a.limitations) || !a.limitations.every(str)) return null;
  const s = a.summary;
  if (!SUMMARY_KEYS.every((key) => nonNegInt(s[key])) || s.original_documents !== 0) return null;
  const inventory: SourceAccessSummaryV2["inventory"] = [];
  for (const item of a.inventory) {
    if (!record(item) || !str(item.id) || item.evidence_class !== "derived_snippet") return null;
    inventory.push({ id: item.id, evidence_class: "derived_snippet" });
  }
  return {
    audit,
    source_access: {
      version: "SourceAccessSummaryV2",
      summary: { requests: s.requests as number, errors: s.errors as number, walls: s.walls as number, refusals: s.refusals as number, search_snippets: s.search_snippets as number, fetch_summaries: s.fetch_summaries as number, original_documents: 0 },
      inventory,
      limitations: a.limitations,
    },
    provenance: {
      evidence_status: p.evidence_status, clinically_approved: false, human_verified: false, affects_score: false,
      runner: p.runner, billing: p.billing, model: p.model, prompt_version: p.prompt_version, cli_version: p.cli_version,
      adapter_version: p.adapter_version, classifier_version: p.classifier_version, source_access_version: p.source_access_version,
    },
  };
}

/* ------------------------------ transport ------------------------------ */

/** The body as text, or null when it is longer than `max` bytes (the stream is cancelled at the cap). */
async function boundedText(response: Response, max: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) { await response.body?.cancel().catch(() => undefined); return null; }
  if (!response.body) {
    const text = await response.text();
    return text.length > max ? null : text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => undefined); return null; }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * One authorised, uncached request. The reply is bounded and reduced to
 * `{ status, created?, job? }`: provider text, stack traces and anything else a
 * failing server might send are never kept, so none of it can reach the screen.
 */
export async function researchRequest(path: string, token: string, signal: AbortSignal, body?: unknown): Promise<{ response: Response; json: ResearchReply }> {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal });
  let json: ResearchReply = { status: "error" };
  try {
    const text = await boundedText(response, RESEARCH_MAX_RESPONSE_BYTES);
    const parsed: unknown = text === null ? null : JSON.parse(text);
    if (record(parsed)) json = { status: str(parsed.status) && STATUS_RE.test(parsed.status) ? parsed.status : "error", ...(typeof parsed.created === "boolean" ? { created: parsed.created } : {}), ...("job" in parsed ? { job: parsed.job } : {}) };
  } catch { /* expose only a safe generic error */ }
  return { response, json };
}

export async function researchWithCurrentToken(path: string, getToken: (options?: { userId?: string; forceRefresh?: boolean }) => Promise<string | null>, signal: AbortSignal, ownerId: string, body?: unknown) {
  const first = await getToken({ userId: ownerId });
  if (!first) throw new Error("auth");
  let result = await researchRequest(path, first, signal, body);
  if (result.response.status === 401) {
    const fresh = await getToken({ userId: ownerId, forceRefresh: true });
    // A refresh that hands back the same token (or none) means the session is not recoverable: say so, do not loop.
    if (!fresh || fresh === first) throw new Error("auth");
    result = await researchRequest(path, fresh, signal, body);
  }
  return result;
}

export function waitForResearch(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const done = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

/* ------------------------------ what this page already knows ------------------------------ */

/*
 * The research job id of a scan, remembered for THIS page only, so that
 * re-opening the same saved scan looks the job up (GET) instead of asking for
 * research again (POST). Keyed by owner AND scan; nothing is written to storage;
 * `forgetResearchJobs()` empties it (sign-out, tests). An id alone is useless:
 * the server answers an id that is not the caller's with the same 404.
 */
const known = new Map<string, string>();
const memoryKey = (ownerId: string, scanId: string) => `${ownerId}|${scanId}`;
export const rememberResearchJob = (ownerId: string, scanId: string, jobId: string) => { known.set(memoryKey(ownerId, scanId), jobId); };
export const knownResearchJob = (ownerId: string, scanId: string): string | null => known.get(memoryKey(ownerId, scanId)) ?? null;
export const forgetResearchJob = (ownerId: string, scanId: string) => { known.delete(memoryKey(ownerId, scanId)); };
export const forgetResearchJobs = () => { known.clear(); };
let lastOwner: string | null = null;
/** Called with the current owner; a different owner (or nobody) empties what the previous one left. */
export function noteResearchOwner(ownerId: string | null) {
  if (ownerId === lastOwner) return;
  lastOwner = ownerId;
  known.clear();
}
