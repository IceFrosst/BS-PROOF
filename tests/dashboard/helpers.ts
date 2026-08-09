type AnyRecord = Record<string, unknown>;

export function asRecord(value: unknown): AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected an object");
  }
  return value as AnyRecord;
}

export function unwrapRun(value: unknown): AnyRecord {
  const record = asRecord(value);
  if (
    Array.isArray(record.outcomes) ||
    Array.isArray(record.ecuRows) ||
    Array.isArray(record.ecu_rows)
  ) {
    return record;
  }
  return asRecord(record.value ?? record.artifact ?? record);
}

export function rowsOf(value: unknown): AnyRecord[] {
  const run = unwrapRun(value);
  const rows = run.outcomes ?? run.ecuRows ?? run.ecu_rows;
  if (!Array.isArray(rows)) {
    throw new TypeError("Normalized run did not expose outcome rows");
  }
  return rows.map(asRecord);
}

export function compositeOf(row: AnyRecord): number | null {
  const value = row.composite ?? row.displayScore ?? row.display_score ?? null;
  return value === null ? null : Number(value);
}

export function outcomeIdOf(row: AnyRecord): string {
  return String(
    row.id ?? row.outcomeId ?? row.outcome_id ?? row.outcome_vocab_id ?? "",
  );
}

export function setComposite(row: AnyRecord, value: number | null): void {
  if ("displayScore" in row) row.displayScore = value;
  else if ("display_score" in row) row.display_score = value;
  else row.composite = value;
}

function firstDefined(record: AnyRecord, names: string[]): unknown {
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  return undefined;
}

export function countOf(value: unknown, name: string): number {
  const run = unwrapRun(value);
  const containers = [run.counts, run.summary, run.extraction, run.telemetry, run]
    .filter(Boolean)
    .map(asRecord);
  const aliases: Record<string, string[]> = {
    studiesTargeted: ["studiesTargeted", "studies_targeted", "targeted"],
    studiesOk: ["studiesOk", "studies_ok", "usable"],
    partialFailures: [
      "partialFailures",
      "studiesFailedPartial",
      "studies_failed_partial",
      "failedPartial",
    ],
    outcomesTotal: ["outcomesTotal", "outcomes_total", "totalOutcomes"],
    outcomesScored: ["outcomesScored", "outcomes_scored", "scoredOutcomes"],
    outcomesUnavailable: [
      "outcomesUnavailable",
      "outcomes_unavailable",
      "unavailableOutcomes",
      "gatedOutcomes",
    ],
  };
  for (const container of containers) {
    const found = firstDefined(container, aliases[name] ?? [name]);
    if (found !== undefined) return Number(found);
  }
  if (name === "outcomesTotal") return rowsOf(run).length;
  if (name === "outcomesScored") {
    return rowsOf(run).filter((row) => compositeOf(row) !== null).length;
  }
  if (name === "outcomesUnavailable") {
    return rowsOf(run).filter((row) => compositeOf(row) === null).length;
  }
  throw new Error(`Count ${name} was not exposed by the normalized run`);
}

export function providerOf(value: unknown): string {
  const run = unwrapRun(value);
  const identity = asRecord(run.run ?? {});
  return String(
    identity.provider ?? run.provider ?? run.backend ?? run.extractor ?? "",
  ).toLowerCase();
}

export function scoringModelOf(value: unknown): string {
  const run = unwrapRun(value);
  const identity = asRecord(run.run ?? {});
  return String(
    identity.scoringModel ??
      identity.scoring_model ??
      run.scoringModel ??
      run.scoring_model ??
      run.model ??
      "",
  );
}

export function telemetryOf(value: unknown): AnyRecord {
  const run = unwrapRun(value);
  return asRecord(run.telemetry ?? run.usage ?? {});
}

export function spentUsdOf(value: unknown): number | null | undefined {
  const telemetry = telemetryOf(value);
  const amount = firstDefined(telemetry, [
    "spentUsd",
    "spent_usd",
    "actualSpendUsd",
    "actual_spend_usd",
    "meteredRunSpend",
    "metered_run_spend",
  ]);
  return amount == null ? (amount as null | undefined) : Number(amount);
}

export function apiEquivalentUsdOf(value: unknown): number | null | undefined {
  const telemetry = telemetryOf(value);
  const amount = firstDefined(telemetry, [
    "apiEquivalentUsd",
    "api_equivalent_usd",
    "apiEquivalentCost",
    "api_equivalent_cost",
    "equivalentUsd",
  ]);
  return amount == null ? (amount as null | undefined) : Number(amount);
}

export function billingBasisOf(value: unknown): string | null | undefined {
  const telemetry = telemetryOf(value);
  const direct = firstDefined(telemetry, [
    "billingBasis",
    "billing_basis",
    "meteredSpendBasis",
    "metered_spend_basis",
  ]);
  if (direct !== undefined) return direct == null ? null : String(direct);
  const raw = firstDefined(asRecord(telemetry.raw ?? {}), [
    "billingBasis",
    "billing_basis",
    "meteredSpendBasis",
    "metered_spend_basis",
  ]);
  return raw == null ? (raw as null | undefined) : String(raw);
}

export function telemetryAvailabilityOf(value: unknown): string | boolean | undefined {
  const telemetry = telemetryOf(value);
  const direct = firstDefined(telemetry, [
    "status",
    "availability",
    "telemetryStatus",
    "telemetry_status",
    "available",
  ]) as string | boolean | undefined;
  if (direct !== undefined) return direct;
  return firstDefined(asRecord(telemetry.raw ?? {}), [
    "status",
    "telemetry_status",
    "available",
  ]) as string | boolean | undefined;
}

export function telemetryNumberOf(
  value: unknown,
  aliases: string[],
): number | null | undefined {
  const telemetry = telemetryOf(value);
  const rawTelemetry = asRecord(telemetry.raw ?? {});
  const containers = [
    telemetry,
    asRecord(telemetry.latency ?? {}),
    asRecord(telemetry.tokens ?? {}),
    rawTelemetry,
    asRecord(rawTelemetry.latency ?? {}),
    asRecord(rawTelemetry.tokens ?? {}),
  ];
  for (const container of containers) {
    const found = firstDefined(container, aliases);
    if (found !== undefined) {
      return found == null ? (found as null) : Number(found);
    }
  }
  return undefined;
}

export function reconciliationIssues(value: unknown): string[] {
  const record = asRecord(value);
  const run = unwrapRun(value);
  const issues = record.issues ?? record.warnings ?? run.issues ?? run.warnings ?? [];
  return Array.isArray(issues) ? issues.map(String) : [String(issues)];
}
