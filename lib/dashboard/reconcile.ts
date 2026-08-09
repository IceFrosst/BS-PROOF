import { normalizeRun } from "./normalize";
import type { ArcKey, DashboardRun, ReconciliationIssue, ReconciliationResult } from "./types";

const ARC_KEYS: ArcKey[] = ["effect", "form", "dose", "evidence"];

type UnknownRow = Record<string, unknown>;

const USAGE_METRICS = [
  { total: "calls", aliases: ["calls", "live_calls", "liveCalls"] },
  { total: "cacheHits", aliases: ["cache_hits", "cacheHits", "hits"] },
  { total: "retries", aliases: ["retries"] },
  { total: "failures", aliases: ["failures", "fail"] },
  { total: "terminalFailures", aliases: ["terminal_failures", "terminalFailures"] },
  { total: "totalTokens", aliases: ["total_tokens", "totalTokens"] },
  { total: "apiEquivalentUsd", aliases: ["api_equivalent_cost", "apiEquivalentCost", "cost"] },
] as const;

function same(left: unknown, right: unknown): boolean {
  return left === right || (typeof left === "number" && typeof right === "number" && Math.abs(left - right) < 0.000_001);
}

function issue(
  issues: ReconciliationIssue[],
  path: string,
  expected: unknown,
  actual: unknown,
  code = "mismatch",
): void {
  if (same(expected, actual)) return;
  issues.push({
    severity: "error",
    code,
    path,
    expected,
    actual,
    message: `${path} does not match the retained source.`,
  });
}

function numeric(row: UnknownRow, aliases: readonly string[]): number | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function tokenTotal(row: UnknownRow): number | null {
  const direct = numeric(row, ["total_tokens", "totalTokens"]);
  if (direct !== null) return direct;
  const raw = row.tokens;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const tokens = raw as UnknownRow;
  const explicit = numeric(tokens, ["total", "total_tokens", "totalTokens"]);
  if (explicit !== null) return explicit;
  const components = ["fresh_input", "input", "cache_write", "cache_read", "output"]
    .map((key) => tokens[key]);
  return components.every((value) => typeof value === "number" && Number.isFinite(value))
    ? (components as number[]).reduce((sum, value) => sum + value, 0)
    : null;
}

function reconcileBreakdown(
  issues: ReconciliationIssue[],
  run: DashboardRun,
  label: "byAgent" | "byTier" | "byModel",
  rows: UnknownRow[],
): number {
  const usage = run.usage;
  if (!usage || usage.breakdownStatus !== "complete") return 0;
  let checked = 0;
  if (!rows.length && (usage.calls ?? 0) > 0) {
    issues.push({
      severity: "error",
      code: "missing_usage_breakdown",
      path: `usage.${label}`,
      expected: "one or more rows",
      actual: rows.length,
      message: `usage.${label} is marked complete but has no rows.`,
    });
    return 1;
  }

  for (const metric of USAGE_METRICS) {
    const expected = usage[metric.total];
    if (expected === null) continue;
    const values = rows.map((row) => metric.total === "totalTokens"
      ? tokenTotal(row)
      : numeric(row, metric.aliases));
    checked += 1;
    if (values.some((value) => value === null)) {
      issues.push({
        severity: "error",
        code: "incomplete_usage_breakdown",
        path: `usage.${label}.${metric.total}`,
        expected,
        actual: values,
        message: `usage.${label} is marked complete but omits ${metric.total}.`,
      });
      continue;
    }
    const actual = (values as number[]).reduce((sum, value) => sum + value, 0);
    issue(
      issues,
      `usage.${label}.${metric.total}`,
      expected,
      metric.total === "apiEquivalentUsd" ? Number(actual.toFixed(8)) : actual,
      "usage_breakdown_mismatch",
    );
  }
  return checked;
}

function reconcileUsage(issues: ReconciliationIssue[], run: DashboardRun): number {
  const usage = run.usage;
  if (!usage) return 0;
  let checked = 0;
  const tokenParts = [
    usage.freshInputTokens,
    usage.cacheWriteTokens,
    usage.cacheReadTokens,
    usage.outputTokens,
  ];
  if (usage.totalTokens !== null && tokenParts.every((value) => value !== null)) {
    checked += 1;
    issue(
      issues,
      "usage.tokens.total",
      usage.totalTokens,
      (tokenParts as number[]).reduce((sum, value) => sum + value, 0),
      "usage_token_total_mismatch",
    );
  }

  const successful = usage.operations.successful_calls ?? null;
  const failed = usage.operations.failed_calls ?? null;
  if (usage.calls !== null && successful !== null && failed !== null) {
    checked += 1;
    issue(issues, "usage.operations.liveCalls", usage.calls, successful + failed, "usage_operation_mismatch");
  }
  if (usage.failures !== null && failed !== null) {
    checked += 1;
    issue(issues, "usage.operations.failures", usage.failures, failed, "usage_operation_mismatch");
  }
  const operationCacheHits = usage.operations.cache_hits ?? null;
  if (usage.cacheHits !== null && operationCacheHits !== null) {
    checked += 1;
    issue(issues, "usage.operations.cacheHits", usage.cacheHits, operationCacheHits, "usage_operation_mismatch");
  }

  checked += reconcileBreakdown(issues, run, "byAgent", usage.byAgent);
  checked += reconcileBreakdown(issues, run, "byTier", usage.byTier);
  checked += reconcileBreakdown(issues, run, "byModel", usage.byModel);
  return checked;
}

/**
 * Check display-critical invariants and optionally compare a normalized run to
 * its retained context JSON. This never repairs or averages disagreements.
 */
export function reconcileRun(
  runInput: DashboardRun | unknown,
  retainedInput?: DashboardRun | unknown,
): ReconciliationResult {
  const run = "schemaVersion" in (runInput as object)
    ? (runInput as DashboardRun)
    : normalizeRun(runInput);
  const retained = retainedInput === undefined
    ? null
    : "schemaVersion" in (retainedInput as object)
      ? (retainedInput as DashboardRun)
      : normalizeRun(retainedInput);
  const issues: ReconciliationIssue[] = [];
  let checked = 0;

  checked += reconcileUsage(issues, run);

  const seen = new Set<string>();
  for (const outcome of run.outcomes) {
    checked += 1;
    if (seen.has(outcome.id)) {
      issues.push({
        severity: "error",
        code: "duplicate_outcome",
        path: `outcomes.${outcome.id}`,
        message: `Outcome ${outcome.id} occurs more than once.`,
      });
    }
    seen.add(outcome.id);
    if (outcome.displayScore !== null) {
      for (const key of ARC_KEYS) {
        const arc = outcome.arcs[key];
        if (arc.coverage === null) {
          issues.push({
            severity: "error",
            code: "score_without_arc",
            path: `outcomes.${outcome.id}.arcs.${key}`,
            message: `Displayed score ${outcome.id} is missing its ${key} arc coverage.`,
          });
        }
      }
    }
  }

  if (retained) {
    issue(issues, "run.provider", retained.run.provider, run.run.provider, "provider_mismatch");
    issue(issues, "run.scoringModel", retained.run.scoringModel, run.run.scoringModel, "scoring_model_mismatch");
    issue(issues, "run.ingredient", retained.run.ingredient, run.run.ingredient);
    issue(issues, "run.form", retained.run.form, run.run.form);
    issue(issues, "extraction.targeted", retained.extraction.targeted, run.extraction.targeted);
    issue(issues, "extraction.usable", retained.extraction.usable, run.extraction.usable);
    issue(issues, "outcomes.length", retained.outcomes.length, run.outcomes.length, "outcome_count_mismatch");
    const retainedOutcomeIds = retained.outcomes.map((outcome) => outcome.id).sort();
    const runOutcomeIds = run.outcomes.map((outcome) => outcome.id).sort();
    issue(
      issues,
      "outcomes.ids",
      retainedOutcomeIds.join("\u0000"),
      runOutcomeIds.join("\u0000"),
      "outcome_set_mismatch",
    );
    issue(issues, "studies.length", retained.studies.length, run.studies.length, "study_count_mismatch");
    const retainedStudyIds = retained.studies.map((study) => study.canonicalId).sort();
    const runStudyIds = run.studies.map((study) => study.canonicalId).sort();
    issue(
      issues,
      "studies.ids",
      retainedStudyIds.join("\u0000"),
      runStudyIds.join("\u0000"),
      "study_set_mismatch",
    );
    const retainedOutcomes = new Map(retained.outcomes.map((outcome) => [outcome.id, outcome]));
    for (const outcome of run.outcomes) {
      const expected = retainedOutcomes.get(outcome.id);
      if (!expected) continue;
      checked += 1;
      issue(issues, `outcomes.${outcome.id}.displayScore`, expected.displayScore, outcome.displayScore);
      issue(issues, `outcomes.${outcome.id}.signedScore`, expected.signedScore, outcome.signedScore);
      issue(issues, `outcomes.${outcome.id}.nPrimaries`, expected.nPrimaries, outcome.nPrimaries);
      for (const key of ARC_KEYS) {
        issue(issues, `outcomes.${outcome.id}.arcs.${key}.verdict`, expected.arcs[key].verdict, outcome.arcs[key].verdict);
        issue(issues, `outcomes.${outcome.id}.arcs.${key}.coverage`, expected.arcs[key].coverage, outcome.arcs[key].coverage);
      }
    }
  }

  return { ok: issues.every((item) => item.severity !== "error"), checked, issues };
}
