/* eslint-disable @typescript-eslint/no-explicit-any -- Ajv schema validation precedes these runtime shape reads. */
/*
 * The server's check of a live-research-v0.5 result: SourceAccessV3 (schemas/source_access_v3.json).
 *
 * It is the V2 check (lib/scan-research/source-access-v2.ts: bytes, hashes, counters, inventory grounded in returned text,
 * abstract/full_text refused) PLUS two things the V2 wire could not carry:
 *
 *  1. What each tool call REQUESTED (a WebSearch: its query; a WebFetch: its address and the prompt the model put to the
 *     summariser). An identifier is grounded only in what a tool PRINTED: the model's own request, echoed back by the tool
 *     ("Web search results for query: ..."), is removed from the returned text first, and every identifier the model typed
 *     into the SAME call is excluded, so an id the model typed itself cannot ground itself even when a summariser paraphrases
 *     it ("the page does not mention PMID 123"). Another, independent successful result can still ground it. (V2 could not
 *     tell; it still cannot, and stays frozen for the historical prompts.)
 *  2. The model's `lead_ledger`, from which the follow-through is RECOMPUTED (lib/scan-research/lead-accounting.ts): every
 *     source lead a search listed is accounted for, the ledger cannot claim a page that was not requested, an error is
 *     followed by an independent attempt, and an empty inventory needs the identifier-bearing leads to have been requested.
 *     The worker computes the same verdict before it posts (pipeline/research_leads.py); a disagreement would strand a job,
 *     so tests/fixtures/lead-accounting-cases.json pins both.
 *
 * The audit is validated against the CANONICAL schemas/research_audit.json, untouched. The ledger is never part of the
 * audit and is never stored: only counters of the follow-through are kept (owner-safe, no page text).
 */
import { createHash } from "node:crypto";
import type { ValidateFunction } from "ajv/dist/2020";
import auditSchema from "@/schemas/research_audit.json";
import receiptSchema from "@/schemas/source_access_v3.json";
import { RESEARCH_PROVENANCE } from "./contract";
import { account, groundingText, LEAD_ACCOUNTING_VERSION, ownRequestText, type LeadEvent } from "./lead-accounting";
import { plainJsonProblem } from "./result";
import { compileStrict2020, idsIn, normalizeId } from "./source-access-v2";

export const V3_PROMPT_VERSION = "live-research-v0.5" as const;
const MAX_BYTES = 768 * 1024;
const MAX_ERRORS = 10;
let validateAudit: ValidateFunction;
let validateReceipt: ValidateFunction;

function getValidators() {
  if (!validateAudit || !validateReceipt) {
    validateAudit = compileStrict2020(auditSchema);
    validateReceipt = compileStrict2020(receiptSchema);
  }
  return { validateAudit, validateReceipt };
}
function schemaErrors(validate: ValidateFunction, prefix: string): string[] {
  return (validate.errors ?? []).slice(0, MAX_ERRORS).map((e) => `${prefix}${e.instancePath || "/"} ${e.message ?? "invalid"}`.slice(0, 200));
}

/**
 * Every identifier the model could have meant by its OWN request text (a search query, a WebFetch prompt), in the SAME normalised
 * form `idsIn` uses. Deliberately LOOSE, because what the model typed may come back from a summariser unlabelled, relabelled or
 * rephrased ("is study 31234567 on this page?" -> "the page does not mention PMID 31234567"): every bare 5-9 digit run is a PMID
 * candidate, PMC / NCT / DOI shapes are matched inside any surrounding text, and a DOI is also taken without the sentence
 * punctuation stuck to its end. Used ONLY to EXCLUDE ids from the same call's result; `idsIn` (what a returned text may GROUND)
 * is unchanged. Mirrors claude_research_adapter.own_request_ids; `grounding_cases` in tests/fixtures/lead-accounting-cases.json pins both.
 */
export function ownRequestIds(text: string): Set<string> {
  const out = idsIn(text);
  for (const m of text.matchAll(/(?<![0-9])[0-9]{5,9}(?![0-9])/g)) out.add(`pmid:${m[0]}`);
  for (const m of text.matchAll(/PMC([0-9]{5,9})(?![0-9])/gi)) out.add(`PMC${m[1]}`);
  for (const m of text.matchAll(/NCT([0-9]{8})(?![0-9])/gi)) out.add(`NCT${m[1]}`);
  for (const m of text.matchAll(/10\.\d{4,9}\/[^\s"'<>)\]},;]+/gi)) {
    const trimmed = m[0].replace(/[.?!:*_~`/-]+$/, "");
    if (trimmed) for (const id of idsIn(trimmed)) out.add(id);
  }
  return out;
}

/**
 * Identifiers a run's CONTENT-bearing results may ground: per event, what the tool printed with the model's own request echo
 * removed, MINUS every identifier the model's own query / WebFetch prompt could mean (`ownRequestIds`, loose; this also covers a
 * summariser that paraphrases the question: "the page does not mention PMID 123"). The same identifier printed by a DIFFERENT
 * successful result still grounds it; error / wall / refusal results ground nothing. Mirrors claude_research_adapter.grounded_ids_v3;
 * tests/fixtures/lead-accounting-cases.json `grounding_cases` pins both.
 */
export function groundedIdsV3(events: LeadEvent[]): Set<string> {
  const grounded = new Set<string>();
  for (const e of events) {
    if (e.kind !== "request" || !e.returned_text) continue;
    const own = ownRequestIds(ownRequestText(e));
    for (const id of idsIn(groundingText(e))) if (!own.has(id)) grounded.add(id);
  }
  return grounded;
}

export type FollowThroughRecord = {
  version: typeof LEAD_ACCOUNTING_VERSION;
  user_turns: number;
  started_at: string;
  finished_at: string;
  searches: number;
  distinct_queries: number;
  fetches: number;
  fetches_with_content: number;
  fetches_failed: number;
  leads: number;
  leads_with_content: number;
  leads_blocked: number;
  leads_unattempted: number;
  ledger_rows: number;
};
export type LiveResearchResultV3 = {
  audit: Record<string, unknown>;
  source_access: {
    version: "SourceAccessSummaryV2";
    summary: Record<string, number>;
    inventory: { id: string; evidence_class: "derived_snippet" }[];
    limitations: string[];
    follow_through: FollowThroughRecord;
  };
  provenance: typeof RESEARCH_PROVENANCE & { model: "claude-sonnet-5-5"; prompt_version: typeof V3_PROMPT_VERSION; cli_version: "2.1.287"; adapter_version: string; classifier_version: string; source_access_version: "SourceAccessV3" };
};
export type LiveResearchCheckV3 = { ok: true; result: LiveResearchResultV3 } | { ok: false; errors: string[] };

/** Validate transient V3 receipts; never return or persist receipt text or the ledger. */
export function checkLiveResearchResultV3(audit: unknown, sourceAccess: unknown): LiveResearchCheckV3 {
  const errors: string[] = [];
  for (const [name, value] of [["audit", audit], ["source_access_v3", sourceAccess]] as const) {
    const problem = plainJsonProblem(value);
    if (problem) errors.push(`/${name} ${problem}`);
  }
  if (errors.length) return { ok: false, errors };
  if (Buffer.byteLength(JSON.stringify({ audit, source_access_v3: sourceAccess }), "utf8") > MAX_BYTES) return { ok: false, errors: ["/request exceeds 768 KiB"] };
  const validators = getValidators();
  if (!validators.validateAudit(audit)) errors.push(...schemaErrors(validators.validateAudit, "/audit"));
  if (!validators.validateReceipt(sourceAccess)) errors.push(...schemaErrors(validators.validateReceipt, "/source_access_v3"));
  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };

  const a = audit as Record<string, any>;
  const receipt = sourceAccess as Record<string, any>;
  const runner = receipt.runner;
  if (a.meta.model !== "claude-sonnet-5-5" || a.meta.prompt !== V3_PROMPT_VERSION || runner.prompt_version !== a.meta.prompt) errors.push("/audit/meta model or prompt mismatch");

  const seen = new Set<string>();
  const summary = { requests: 0, errors: 0, walls: 0, refusals: 0, search_snippets: 0, fetch_summaries: 0, original_documents: 0 };
  for (const [i, e] of receipt.events.entries()) {
    if (seen.has(e.tool_use_id)) errors.push(`/source_access_v3/events/${i}/tool_use_id duplicate`);
    seen.add(e.tool_use_id);
    const bytes = Buffer.byteLength(e.returned_text, "utf8");
    const hash = createHash("sha256").update(e.returned_text, "utf8").digest("hex");
    if (e.text_bytes !== bytes) errors.push(`/source_access_v3/events/${i}/text_bytes mismatch`);
    if (e.text_sha256 !== hash) errors.push(`/source_access_v3/events/${i}/text_sha256 mismatch`);
    if (e.kind === "request" && (e.returned_kind === "no_content" || e.returned_text.length === 0)) errors.push(`/source_access_v3/events/${i} request without content`);
    if (e.kind !== "request" && e.returned_kind !== "no_content") errors.push(`/source_access_v3/events/${i} nonrequest with content`);
    if (e.kind === "request" && ((e.tool === "WebSearch" && e.returned_kind !== "search_snippet") || (e.tool === "WebFetch" && e.returned_kind !== "fetch_model_summary"))) errors.push(`/source_access_v3/events/${i} tool/returned_kind mismatch`);
    summary[e.kind === "request" ? "requests" : e.kind === "error" ? "errors" : e.kind === "wall" ? "walls" : "refusals"]++;
    if (e.kind === "request" && e.returned_text.length > 0) {
      if (e.returned_kind === "search_snippet") summary.search_snippets++;
      if (e.returned_kind === "fetch_model_summary") summary.fetch_summaries++;
    }
  }
  if (Object.keys(summary).some((key) => summary[key as keyof typeof summary] !== receipt.summary[key])) errors.push("/source_access_v3/summary mismatch");
  // GROUNDING: what the tool printed (request echo removed), minus what the model typed into the same call.
  const grounded = groundedIdsV3(receipt.events as LeadEvent[]);
  const inventoryTotal = a.outcomes.reduce((n: number, row: any) => n + row.inventory.length, 0);
  if (inventoryTotal > 300) errors.push("/audit inventory exceeds 300 items");
  for (const [o, row] of a.outcomes.entries()) for (const [i, item] of row.inventory.entries()) {
    const id = normalizeId(item.id);
    if (item.access !== "snippet") errors.push(`/audit/outcomes/${o}/inventory/${i}/access must be snippet`);
    if (!id || !grounded.has(id)) errors.push(`/audit/outcomes/${o}/inventory/${i}/id not grounded in returned request text`);
  }

  // FOLLOW-THROUGH, recomputed from the receipts. The ledger is the model's account; the requests are the evidence.
  const report = account(receipt.events, receipt.lead_ledger, inventoryTotal === 0);
  if (!report.satisfied) {
    const by = new Map<string, number>();
    for (const p of report.problems) by.set(p.code, (by.get(p.code) ?? 0) + 1);
    errors.push(`/source_access_v3/lead_ledger source leads not followed: ${[...by].sort().map(([c, n]) => `${c} x${n}`).join(", ")}`.slice(0, 200));
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };

  const inv: { id: string; evidence_class: "derived_snippet" }[] = [];
  const unique = new Set<string>();
  for (const row of a.outcomes) for (const item of row.inventory) {
    const id = normalizeId(item.id)!;
    if (!unique.has(id)) { unique.add(id); inv.push({ id, evidence_class: "derived_snippet" }); }
  }
  const s = report.summary as Record<string, number>;
  return { ok: true, result: {
    audit: a,
    source_access: {
      version: "SourceAccessSummaryV2", summary, inventory: inv,
      limitations: [
        "WebSearch snippets and WebFetch model summaries are not original papers.",
        "ID matching does not verify study numbers or clinical validity.",
        "Follow-through counts requests the tools received; it does not show that a page was read in full or that the research is complete.",
      ],
      follow_through: {
        version: LEAD_ACCOUNTING_VERSION, user_turns: runner.user_turns, started_at: runner.started_at, finished_at: runner.finished_at,
        searches: s.searches, distinct_queries: s.distinct_queries, fetches: s.fetches, fetches_with_content: s.fetches_with_content, fetches_failed: s.fetches_failed,
        leads: s.leads, leads_with_content: s.leads_with_content, leads_blocked: s.leads_blocked, leads_unattempted: s.leads_unattempted, ledger_rows: s.ledger_rows,
      },
    },
    provenance: { ...RESEARCH_PROVENANCE, model: "claude-sonnet-5-5", prompt_version: V3_PROMPT_VERSION, cli_version: "2.1.287", adapter_version: runner.adapter_version, classifier_version: runner.classifier_version, source_access_version: "SourceAccessV3" },
  } };
}
export const SOURCE_ACCESS_V3_MAX_REQUEST_BYTES = MAX_BYTES;
