/*
 * Validation of what the PC worker posts back on `complete`:
 *   { audit, source_access }
 *
 *  1. `audit` must validate against schemas/research_audit.json -- the existing,
 *     strict (additionalProperties:false throughout) audit contract, unchanged --
 *     and `audit.meta.prompt` must be the prompt version the job carried.
 *  2. `source_access` (SourceAccessV1, below) is the worker's access log. Its four
 *     event kinds are kept apart on purpose:
 *
 *        request  a call that came back WITHOUT an error. On its own it proves
 *                 nothing was read: `access` is "none" until the worker attests
 *                 content with a byte count and a SHA-256 of what it received.
 *        error    the call failed (network, 4xx/5xx, tool error).
 *        wall     the call reached a paywall / login / robot check.
 *        refusal  the source or the model refused.
 *
 *     `summary` restates the counts; the server RECOMPUTES them from `events`
 *     and rejects a mismatch, so a summary can never say more than the log.
 *  3. A tool call that merely returned without an error is NEVER "papers read":
 *     every audit inventory entry that claims access snippet/abstract/full_text
 *     must be backed by a content-verified `request` event for the same id at that
 *     level or higher. Anything less is rejected, not downgraded silently.
 *  4. Every number anywhere in either object is finite, no string holds a NUL
 *     (Postgres jsonb cannot store one), and depth/size are bounded.
 *
 * Text in the audit and the log is DATA. Nothing here, and nothing downstream,
 * executes, interprets or follows it as an instruction.
 */
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";

import auditSchema from "@/schemas/research_audit.json";
import { RESEARCH_PROVENANCE } from "./contract";

export const SOURCE_ACCESS_VERSION = "SourceAccessV1" as const;

const MAX_EVENTS = 300;
const MAX_DEPTH = 24;
const MAX_NODES = 60_000;
const MAX_ERRORS_REPORTED = 10;

const ISO_UTC = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$";
const INT = { type: "integer", minimum: 0, maximum: 1_000_000 } as const;

const SOURCE_ACCESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "runner", "events", "summary"],
  properties: {
    version: { const: SOURCE_ACCESS_VERSION },
    runner: {
      type: "object",
      additionalProperties: false,
      required: ["model", "started_at", "finished_at"],
      properties: {
        model: { type: "string", minLength: 1, maxLength: 160 },
        started_at: { type: "string", pattern: ISO_UTC },
        finished_at: { type: "string", pattern: ISO_UTC },
      },
    },
    events: {
      type: "array",
      maxItems: MAX_EVENTS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "source", "id", "access", "content_bytes", "content_sha256", "detail"],
        properties: {
          kind: { enum: ["request", "error", "wall", "refusal"] },
          source: { type: "string", minLength: 1, maxLength: 120 },
          id: { type: ["string", "null"], maxLength: 200 },
          access: { enum: ["none", "snippet", "abstract", "full_text"] },
          content_bytes: { type: ["integer", "null"], minimum: 1, maximum: 1_000_000_000 },
          content_sha256: { type: ["string", "null"], pattern: "^[0-9a-f]{64}$" },
          detail: { type: ["string", "null"], maxLength: 300 },
        },
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["requests", "errors", "walls", "refusals", "snippet", "abstract", "full_text"],
      properties: {
        requests: INT,
        errors: INT,
        walls: INT,
        refusals: INT,
        snippet: INT,
        abstract: INT,
        full_text: INT,
      },
    },
  },
} as const;

export type AccessLevel = "none" | "snippet" | "abstract" | "full_text";
const RANK: Record<AccessLevel, number> = { none: 0, snippet: 1, abstract: 2, full_text: 3 };

interface AccessEvent {
  kind: "request" | "error" | "wall" | "refusal";
  source: string;
  id: string | null;
  access: AccessLevel;
  content_bytes: number | null;
  content_sha256: string | null;
  detail: string | null;
}
interface SourceAccess {
  version: typeof SOURCE_ACCESS_VERSION;
  runner: { model: string; started_at: string; finished_at: string };
  events: AccessEvent[];
  summary: Record<"requests" | "errors" | "walls" | "refusals" | "snippet" | "abstract" | "full_text", number>;
}

export interface JobResult {
  audit: Record<string, unknown>;
  source_access: SourceAccess;
  provenance: typeof RESEARCH_PROVENANCE;
}

export type ResultCheck = { ok: true; result: JobResult } | { ok: false; errors: string[] };

let compiled: { audit: ValidateFunction; access: ValidateFunction } | null = null;
function validators() {
  if (!compiled) {
    // strict:false only so the unmodified audit schema's annotation keywords compile
    // (the same options tests/research-audit-schema.test.ts uses); validation itself
    // is strict: no coercion, no defaults, no removal of extra properties.
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    compiled = { audit: ajv.compile(auditSchema as object), access: ajv.compile(SOURCE_ACCESS_SCHEMA as object) };
  }
  return compiled;
}

/** Null when `value` is plain bounded JSON with finite numbers; else why not. Never echoes a value. */
export function plainJsonProblem(value: unknown): string | null {
  let nodes = 0;
  const walk = (v: unknown, depth: number): string | null => {
    if (++nodes > MAX_NODES) return "too many values";
    if (depth > MAX_DEPTH) return "nested too deeply";
    if (v === null || typeof v === "boolean") return null;
    if (typeof v === "number") return Number.isFinite(v) ? null : "a number is not finite";
    if (typeof v === "string") return v.includes("\u0000") ? "a string contains NUL" : null;
    if (Array.isArray(v)) {
      for (const item of v) {
        const p = walk(item, depth + 1);
        if (p) return p;
      }
      return null;
    }
    if (typeof v === "object") {
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
        if (k.includes("\u0000")) return "a key contains NUL";
        const p = walk(item, depth + 1);
        if (p) return p;
      }
      return null;
    }
    return "not JSON";
  };
  return walk(value, 0);
}

function describe(errors: ValidateFunction["errors"], prefix: string): string[] {
  return (errors ?? []).slice(0, MAX_ERRORS_REPORTED).map((e) => `${prefix}${e.instancePath || "/"} ${e.message ?? "invalid"}`.slice(0, 200));
}

/** DOI / PMID spelled any common way -> one comparison key. */
function idKey(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^(?:doi|pmid):\s*/, "");
}

function recount(events: AccessEvent[]): SourceAccess["summary"] {
  const s = { requests: 0, errors: 0, walls: 0, refusals: 0, snippet: 0, abstract: 0, full_text: 0 };
  for (const e of events) {
    if (e.kind === "request") s.requests += 1;
    else if (e.kind === "error") s.errors += 1;
    else if (e.kind === "wall") s.walls += 1;
    else s.refusals += 1;
    if (e.access !== "none") s[e.access] += 1;
  }
  return s;
}

/**
 * Validates the worker's `complete` payload against the job's prompt version.
 * Returns the exact object to store (provenance stamped by the server) or a
 * short list of structural problems -- paths and rule names only, never values.
 */
export function checkJobResult(input: { audit: unknown; source_access: unknown }, promptVersion: string): ResultCheck {
  const errors: string[] = [];
  for (const [name, value] of [["audit", input.audit], ["source_access", input.source_access]] as const) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) errors.push(`/${name} must be an object`);
    else {
      const problem = plainJsonProblem(value);
      if (problem) errors.push(`/${name} ${problem}`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const v = validators();
  if (!v.audit(input.audit)) errors.push(...describe(v.audit.errors, "audit"));
  if (!v.access(input.source_access)) errors.push(...describe(v.access.errors, "source_access"));
  if (errors.length) return { ok: false, errors };

  const audit = input.audit as Record<string, unknown> & { meta: { prompt: string }; outcomes: Array<{ inventory: Array<{ id: string; access: AccessLevel }> }> };
  const access = input.source_access as SourceAccess;

  if (audit.meta.prompt !== promptVersion) errors.push("audit/meta/prompt must equal the job's prompt_version");

  for (const [i, e] of access.events.entries()) {
    if (e.kind !== "request" && e.access !== "none") errors.push(`source_access/events/${i} only a request can attest content`);
    const attested = e.access !== "none";
    if (attested !== (e.content_bytes !== null && e.content_sha256 !== null)) {
      errors.push(`source_access/events/${i} content_bytes and content_sha256 are required exactly when access is not "none"`);
    }
    if (attested && e.id === null) errors.push(`source_access/events/${i} attested content needs an id`);
  }
  if (access.runner.finished_at < access.runner.started_at) errors.push("source_access/runner finished_at is before started_at");

  const counted = recount(access.events);
  for (const key of Object.keys(counted) as Array<keyof typeof counted>) {
    if (access.summary[key] !== counted[key]) errors.push(`source_access/summary/${key} does not match events`);
  }

  // "Papers read" / "full text" must be earned by verified content, not by a quiet tool call.
  const best = new Map<string, number>();
  for (const e of access.events) {
    if (e.kind !== "request" || e.access === "none" || e.id === null) continue;
    const key = idKey(e.id);
    best.set(key, Math.max(best.get(key) ?? 0, RANK[e.access]));
  }
  for (const [o, outcome] of audit.outcomes.entries()) {
    for (const [s, study] of outcome.inventory.entries()) {
      if ((best.get(idKey(study.id)) ?? 0) < RANK[study.access]) {
        errors.push(`audit/outcomes/${o}/inventory/${s} claims ${study.access} access with no content-verified request for that id`);
      }
    }
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS_REPORTED) };
  return { ok: true, result: { audit, source_access: access, provenance: RESEARCH_PROVENANCE } };
}
