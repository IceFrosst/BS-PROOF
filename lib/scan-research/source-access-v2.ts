/* eslint-disable @typescript-eslint/no-explicit-any -- Ajv schema validation precedes these runtime shape reads. */
import { createHash } from "node:crypto";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import auditSchema from "@/schemas/research_audit.json";
import receiptSchema from "@/schemas/source_access_v2.json";
import { RESEARCH_PROVENANCE } from "./contract";
import { plainJsonProblem } from "./result";

const PROMPT = "live-research-v0.2";
const MAX_BYTES = 768 * 1024;
const MAX_ERRORS = 10;
let validateAudit: ValidateFunction;
let validateReceipt: ValidateFunction;
function getValidators() {
  if (!validateAudit || !validateReceipt) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    validateAudit = ajv.compile(auditSchema as object);
    validateReceipt = ajv.compile(receiptSchema as object);
  }
  return { validateAudit, validateReceipt };
}
function schemaErrors(validate: ValidateFunction, prefix: string): string[] {
  return (validate.errors ?? []).slice(0, MAX_ERRORS).map((e) => `${prefix}${e.instancePath || "/"} ${e.message ?? "invalid"}`.slice(0, 200));
}
function idsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/10\.\d{4,9}\/[^\s"'<>)\]},;]+/gi)) out.add(`doi:${m[0].replace(/[.]+$/, "").toLowerCase()}`);
  for (const m of text.matchAll(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})/gi)) out.add(`pmid:${m[1]}`);
  for (const m of text.matchAll(/\bPMID[:\s#]*(\d{5,9})\b/gi)) out.add(`pmid:${m[1]}`);
  for (const m of text.matchAll(/\bPMC\d{5,9}\b/gi)) out.add(m[0].toUpperCase());
  for (const m of text.matchAll(/\bNCT\d{8}\b/gi)) out.add(m[0].toUpperCase());
  return out;
}
function normalizeId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  const ids = idsIn(s);
  if (ids.size) return [...ids].sort()[0];
  const m = /^(?:pmid[:\s#]*)?(\d{5,9})$/i.exec(s);
  return m ? `pmid:${m[1]}` : null;
}

export type LiveResearchResultV2 = {
  audit: Record<string, unknown>;
  source_access: { version: "SourceAccessSummaryV2"; summary: Record<string, number>; inventory: { id: string; evidence_class: "derived_snippet" }[]; limitations: string[] };
  provenance: typeof RESEARCH_PROVENANCE & { model: "claude-sonnet-5-5"; prompt_version: typeof PROMPT; cli_version: "2.1.287"; adapter_version: string; classifier_version: string; source_access_version: "SourceAccessV2" };
};
export type LiveResearchCheckV2 = { ok: true; result: LiveResearchResultV2 } | { ok: false; errors: string[] };

/** Validate transient V2 receipts; never return or persist receipt text. */
export function checkLiveResearchResultV2(audit: unknown, sourceAccess: unknown, promptVersion: string): LiveResearchCheckV2 {
  const errors: string[] = [];
  for (const [name, value] of [["audit", audit], ["source_access_v2", sourceAccess]] as const) {
    const problem = plainJsonProblem(value);
    if (problem) errors.push(`/${name} ${problem}`);
  }
  if (errors.length) return { ok: false, errors };
  const json = JSON.stringify({ audit, source_access_v2: sourceAccess });
  if (Buffer.byteLength(json, "utf8") > MAX_BYTES) return { ok: false, errors: ["/request exceeds 768 KiB"] };
  if (promptVersion !== PROMPT) errors.push("/prompt_version unsupported");
  const validators = getValidators();
  if (!validators.validateAudit(audit)) errors.push(...schemaErrors(validators.validateAudit, "/audit"));
  if (!validators.validateReceipt(sourceAccess)) errors.push(...schemaErrors(validators.validateReceipt, "/source_access_v2"));
  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };

  const a = audit as Record<string, any>;
  const receipt = sourceAccess as Record<string, any>;
  const runner = receipt.runner;
  if (a.meta.model !== "claude-sonnet-5-5" || a.meta.prompt !== PROMPT) errors.push("/audit/meta model or prompt mismatch");
  const seen = new Set<string>();
  const grounded = new Set<string>();
  const summary = { requests: 0, errors: 0, walls: 0, refusals: 0, search_snippets: 0, fetch_summaries: 0, original_documents: 0 };
  for (const [i, e] of receipt.events.entries()) {
    if (seen.has(e.tool_use_id)) errors.push(`/source_access_v2/events/${i}/tool_use_id duplicate`);
    seen.add(e.tool_use_id);
    const bytes = Buffer.byteLength(e.returned_text, "utf8");
    const hash = createHash("sha256").update(e.returned_text, "utf8").digest("hex");
    if (e.text_bytes !== bytes) errors.push(`/source_access_v2/events/${i}/text_bytes mismatch`);
    if (e.text_sha256 !== hash) errors.push(`/source_access_v2/events/${i}/text_sha256 mismatch`);
    if (e.kind === "request" && (e.returned_kind === "no_content" || e.returned_text.length === 0)) errors.push(`/source_access_v2/events/${i} request without content`);
    if (e.kind !== "request" && e.returned_kind !== "no_content") errors.push(`/source_access_v2/events/${i} nonrequest with content`);
    if (e.kind === "request" && ((e.tool === "WebSearch" && e.returned_kind !== "search_snippet") || (e.tool === "WebFetch" && e.returned_kind !== "fetch_model_summary"))) errors.push(`/source_access_v2/events/${i} tool/returned_kind mismatch`);
    summary[e.kind === "request" ? "requests" : e.kind === "error" ? "errors" : e.kind === "wall" ? "walls" : "refusals"]++;
    if (e.kind === "request" && e.returned_text.length > 0) {
      if (e.returned_kind === "search_snippet") summary.search_snippets++;
      if (e.returned_kind === "fetch_model_summary") summary.fetch_summaries++;
      for (const id of idsIn(e.returned_text)) grounded.add(id);
    }
  }
  if (Object.keys(summary).some((key) => summary[key as keyof typeof summary] !== receipt.summary[key])) errors.push("/source_access_v2/summary mismatch");
  const inventoryTotal = a.outcomes.reduce((n: number, row: any) => n + row.inventory.length, 0);
  if (inventoryTotal > 300) errors.push("/audit inventory exceeds 300 items");
  for (const [o, row] of a.outcomes.entries()) for (const [i, item] of row.inventory.entries()) {
    const id = normalizeId(item.id);
    if (item.access !== "snippet") errors.push(`/audit/outcomes/${o}/inventory/${i}/access must be snippet`);
    if (!id || !grounded.has(id)) errors.push(`/audit/outcomes/${o}/inventory/${i}/id not grounded in returned request text`);
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
  const inv: { id: string; evidence_class: "derived_snippet" }[] = [];
  const unique = new Set<string>();
  for (const row of a.outcomes) for (const item of row.inventory) {
    const id = normalizeId(item.id)!;
    if (!unique.has(id)) { unique.add(id); inv.push({ id, evidence_class: "derived_snippet" }); }
  }
  return { ok: true, result: {
    audit: a,
    source_access: { version: "SourceAccessSummaryV2", summary, inventory: inv, limitations: ["WebSearch snippets and WebFetch model summaries are not original papers.", "ID matching does not verify study numbers or clinical validity."] },
    provenance: { ...RESEARCH_PROVENANCE, model: "claude-sonnet-5-5", prompt_version: PROMPT, cli_version: "2.1.287", adapter_version: runner.adapter_version, classifier_version: runner.classifier_version, source_access_version: "SourceAccessV2" },
  } };
}
export const SOURCE_ACCESS_V2_PROMPT_VERSION = PROMPT;
export const SOURCE_ACCESS_V2_MAX_REQUEST_BYTES = MAX_BYTES;
