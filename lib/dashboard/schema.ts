import Ajv, { type ErrorObject } from "ajv";
import { z } from "zod";

import dashboardRunV1Schema from "@/schemas/dashboard_run_v1.schema.json";

const nonEmpty = z.string().trim().min(1);
const stringMap = z.record(z.string(), z.string());

const requiredMetric = z.number().finite().nullable();
const nullableMetric = requiredMetric.optional();
const usageTokens = z.object({
  fresh_input: nullableMetric,
  input: nullableMetric,
  cache_write: nullableMetric,
  cache_read: nullableMetric,
  output: nullableMetric,
  total: nullableMetric,
}).strict();
const canonicalUsageTokens = z.object({
  fresh_input: requiredMetric,
  cache_write: requiredMetric,
  cache_read: requiredMetric,
  output: requiredMetric,
  total: requiredMetric,
}).strict();
const usageBreakdownRow = z.object({
  agent: z.string().nullable().optional(),
  tier: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  full_model: z.string().nullable().optional(),
  configured_model: z.string().nullable().optional(),
  effort: z.string().nullable().optional(),
  reasoning_effort: z.string().nullable().optional(),
  prompt_version: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  aggregate_complete: z.boolean().optional(),
  attempts: nullableMetric,
  calls: nullableMetric,
  live_calls: nullableMetric,
  cache_hits: nullableMetric,
  hits: nullableMetric,
  retries: nullableMetric,
  failures: nullableMetric,
  fail: nullableMetric,
  terminal_failures: nullableMetric,
  api_equivalent_cost: nullableMetric,
  cost: nullableMetric,
  input: nullableMetric,
  cache_write: nullableMetric,
  cache_read: nullableMetric,
  output: nullableMetric,
  input_tokens: nullableMetric,
  output_tokens: nullableMetric,
  total_tokens: nullableMetric,
  average_latency_s: nullableMetric,
  p95_latency_s: nullableMetric,
  latency_s: nullableMetric,
  tokens: usageTokens.nullable().optional(),
}).strict();
const safeUsageRecord = usageBreakdownRow.extend({
  cached: z.boolean().nullable().optional(),
  outcome: z.string().nullable().optional(),
}).strict();
const efficiencyMetric = z.object({
  denominator: requiredMetric,
  calls: requiredMetric,
  tokens: requiredMetric,
  api_equivalent_cost: requiredMetric,
}).strict();
const usage = z.object({
  version: nonEmpty,
  telemetry_status: z.enum(["complete", "partial", "unavailable"]),
  // Both of these are read by normalize.ts from INSIDE usage, but the object is
  // .strict() here and additionalProperties:false in the JSON schema, so the
  // writer could never emit them -- agent_tiers rendered empty on every run and
  // models only worked by accident (run.models is spread in first). Widening
  // both contracts together is the only way either field can flow.
  agent_tiers: stringMap.nullable().optional(),
  models: stringMap.nullable().optional(),
  telemetry_explanation: z.string().nullable(),
  currency: z.string().nullable(),
  metered_run_spend: requiredMetric,
  metered_spend_basis: z.string().nullable(),
  api_equivalent_cost: requiredMetric,
  live_calls: requiredMetric,
  cache_hits: requiredMetric,
  retries: requiredMetric,
  failures: requiredMetric,
  terminal_failures: requiredMetric,
  usage_records_missing_tokens: requiredMetric,
  usage_records_missing_cost: requiredMetric,
  tokens: canonicalUsageTokens,
  latency: z.object({
    wall_time_s: requiredMetric,
    average_s: requiredMetric,
    p95_s: requiredMetric,
    peak_concurrency: requiredMetric,
    basis: z.string().nullable(),
  }).strict(),
  operations: z.object({
    successful_calls: requiredMetric,
    failed_calls: requiredMetric,
    cache_hits: requiredMetric,
    timeouts: requiredMetric,
    auth_failures: requiredMetric,
    fail_rate: requiredMetric,
    concurrency_limit: requiredMetric,
  }).strict(),
  breakdown_status: z.enum(["complete", "partial", "unavailable"]),
  by_agent: z.array(usageBreakdownRow),
  by_tier: z.array(usageBreakdownRow),
  by_model: z.array(usageBreakdownRow),
  model_routing: z.array(usageBreakdownRow),
  raw_structured_usage: z.object({
    source: z.string().nullable(),
    records: z.array(safeUsageRecord),
    redactions: z.array(z.string()),
  }).strict(),
  efficiency: z.object({
    per_successful_study: efficiencyMetric,
    per_outcome: efficiencyMetric,
  }).strict(),
}).strict();

const canonicalRun = z
  .object({
    id: nonEmpty,
    generated_at: z.string().nullable().optional(),
    timestamp: z.string().nullable().optional(),
    source_commit: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
    mode: z.string().nullable().optional(),
    scope: z.string().nullable().optional(),
    scoring_model: z.string().nullable().optional(),
    prompt_version: z.string().nullable().optional(),
    models: stringMap.nullable().optional(),
    // Accepted for the early draft contract; canonical artifacts put these in product.
    ingredient: z.string().optional(),
    form: z.string().optional(),
  })
  .passthrough();

const validity = z
  .object({
    status: nonEmpty,
    public_claims_allowed: z.boolean().nullable().optional(),
    reason_codes: z.array(z.string()).optional().default([]),
    note: z.string().nullable().optional(),
    registry_key: z.string().nullable().optional(),
    limitations: z.array(z.string()).optional(),
  })
  .passthrough();

const product = z
  .object({
    ingredient: nonEmpty,
    form: nonEmpty,
    dose: z.unknown().nullable().optional(),
    population: z.unknown().nullable().optional(),
  })
  .passthrough();

const arc = z
  .object({
    verdict: z.number().min(-1).max(1).nullable(),
    coverage: z.number().min(0).max(1).nullable(),
    is_quantity: z.boolean().optional(),
  })
  .passthrough();

const ecuRow = z
  .object({
    outcome_vocab_id: nonEmpty.optional(),
    outcome: z.object({ id: nonEmpty }).passthrough().optional(),
    score: z.number().int().min(-100).max(100).nullable(),
    composite: z.number().int().min(0).max(100).nullable(),
    arcs: z.object({
      effect: arc,
      form: arc,
      dose: arc,
      evidence: arc,
    }),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (!value.outcome_vocab_id && !value.outcome?.id) {
      context.addIssue({ code: "custom", path: ["outcome_vocab_id"], message: "outcome id is required" });
    }
  });

/** The immutable, public-safe artifact emitted by the report pipeline. */
export const DashboardRunSchema = z
  .object({
    schema_version: z.literal("DashboardRunV1"),
    run: canonicalRun,
    validity: validity.optional(),
    product: product.optional(),
    reports: z.record(z.string(), z.unknown()).optional().default({}),
    score_semantics: z.record(z.string(), z.unknown()).optional(),
    corpus: z.record(z.string(), z.unknown()).optional(),
    stats: z.record(z.string(), z.unknown()).optional(),
    usage,
    ecu_rows: z.array(ecuRow).optional(),
    // Draft aliases remain accepted so retained artifacts never become unreadable.
    outcomes: z.array(ecuRow).optional(),
    studies: z.array(z.unknown()).optional(),
    study_corpus: z.array(z.unknown()).optional(),
    extraction: z.record(z.string(), z.unknown()).optional(),
    systematic_reviews: z.record(z.string(), z.unknown()).optional(),
    sr: z.record(z.string(), z.unknown()).optional(),
    reconciliation: z.record(z.string(), z.unknown()).nullable().optional(),
    // The v13 measured-effect SHADOW block (2026-08-23). Optional, and shadow
    // by definition: it never feeds a displayed score, so it is carried rather
    // than interpreted here.
    //
    // It must be declared. .strict() rejects unknown keys, and adding this
    // block to the artifact writer + the Ajv JSON schema without also adding it
    // here quarantined every run written after it -- measured 2026-08-24, all
    // five of that day's runs refused with `Unrecognized key: "v13_shadow"`,
    // so the dashboard's newest run was 02:14 while /api/analyze-label happily
    // cited the 11:33 run whose page therefore 404'd. Two validators disagreeing
    // about one artifact is worse than either being strict alone.
    v13_shadow: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const ingredient = value.product?.ingredient ?? value.run.ingredient;
    const form = value.product?.form ?? value.run.form;
    if (!ingredient) {
      context.addIssue({ code: "custom", path: ["product", "ingredient"], message: "ingredient is required" });
    }
    if (!form) {
      context.addIssue({ code: "custom", path: ["product", "form"], message: "form is required" });
    }
    if (!value.ecu_rows && !value.outcomes) {
      context.addIssue({ code: "custom", path: ["ecu_rows"], message: "ecu_rows or outcomes is required" });
    }
    const rows = value.ecu_rows ?? value.outcomes ?? [];
    const ecuStats = (value.stats as { ecus?: { total?: unknown; scored?: unknown; gated?: unknown } } | undefined)?.ecus;
    if (ecuStats) {
      const scored = rows.filter((row) => row.composite !== null).length;
      const gated = rows.length - scored;
      for (const [key, expected] of [["total", rows.length], ["scored", scored], ["gated", gated]] as const) {
        if (typeof ecuStats[key] === "number" && ecuStats[key] !== expected) {
          context.addIssue({
            code: "custom",
            path: ["stats", "ecus", key],
            message: `stats.ecus.${key} must equal the retained ECU rows (${expected})`,
          });
        }
      }
    }
    const studies = (value.corpus as { studies?: unknown[] } | undefined)?.studies;
    if (!studies && !value.studies && !value.study_corpus) {
      context.addIssue({ code: "custom", path: ["corpus", "studies"], message: "a study corpus is required" });
    }
    const corpusCount = (value.corpus as { study_count?: unknown } | undefined)?.study_count;
    if (studies && typeof corpusCount === "number" && corpusCount !== studies.length) {
      context.addIssue({
        code: "custom",
        path: ["corpus", "study_count"],
        message: `corpus.study_count must equal corpus.studies.length (${studies.length})`,
      });
    }
    if (!value.validity && !(value.run as Record<string, unknown>).validity) {
      context.addIssue({ code: "custom", path: ["validity"], message: "validity is required" });
    }
  });

export type DashboardRunArtifact = z.infer<typeof DashboardRunSchema>;

const canonicalValidator = new Ajv({ allErrors: true, strict: false }).compile(
  dashboardRunV1Schema,
);

function formatSchemaError(error: ErrorObject): string {
  const path = error.instancePath || "/";
  return `${path} ${error.message ?? error.keyword}`;
}

/** Enforce the exact deploy contract, including additionalProperties=false. */
export function assertDashboardRunV1(value: unknown): void {
  if (canonicalValidator(value)) return;
  const details = (canonicalValidator.errors ?? []).map(formatSchemaError).join("; ");
  throw new Error(`DashboardRunV1 schema validation failed: ${details}`);
}
