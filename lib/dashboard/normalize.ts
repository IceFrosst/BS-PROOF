import type {
  AgentStat,
  ArcKey,
  DashboardArc,
  DashboardDoseStory,
  DashboardOutcome,
  DashboardRun,
  DashboardStudy,
  DashboardUsage,
  ExtractionClaim,
  StudyContribution,
  StudyExtraction,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const ARC_KEYS: ArcKey[] = ["effect", "form", "dose", "evidence"];

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const parsed = number(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  return array(value).map(text).filter((item): item is string => item !== null);
}

function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, item]) => {
      const parsed = text(item);
      return parsed ? [[key, parsed]] : [];
    }),
  );
}

function first(source: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function idFromSource(sourceArtifact?: string | null): string | null {
  if (!sourceArtifact) return null;
  const name = sourceArtifact.replaceAll("\\", "/").split("/").at(-1) ?? "";
  return name.replace(/_(dashboard|context)\.json$/i, "") || null;
}

function timestampFromId(id: string): string | null {
  const match = id.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

function providerFrom(mode: string | null, prompt: string | null): string | null {
  const source = `${mode ?? ""} ${prompt ?? ""}`.toLowerCase();
  if (source.includes("grok")) return "grok";
  if (source.includes("pilot")) return "claude-pilot";
  if (source.includes("claude")) return "claude";
  return null;
}

function normalizeArc(value: unknown, key: ArcKey): DashboardArc {
  const source = record(value);
  return {
    verdict: number(source.verdict),
    coverage: number(source.coverage),
    isQuantity: boolean(first(source, "is_quantity", "isQuantity")) ?? key === "evidence",
    closeness: number(source.closeness),
  };
}

function normalizeContribution(value: unknown): StudyContribution | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  return {
    id: text(source.id),
    w: number(source.w),
    s: number(source.s),
    designRank: integer(first(source, "design_rank", "designRank")),
    direction: text(source.direction),
    formMatch: text(first(source, "form_match", "formMatch")),
    dShare: number(first(source, "d_share", "dShare")),
    points: number(source.points),
    effectRoute: text(first(source, "effect_route", "effectRoute")),
    effectS: number(first(source, "effect_s", "effectS")),
  };
}

function normalizeDoseStory(value: unknown): DashboardDoseStory | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  const nullRange = record(first(source, "null_range", "nullRange"));
  const observed = record(source.observed);
  return {
    low: number(source.low),
    high: number(source.high),
    nBenefit: integer(first(source, "n_benefit", "nBenefit")),
    nNull: integer(first(source, "n_null", "nNull")),
    nullRange: Object.keys(nullRange).length
      ? { low: number(nullRange.low), high: number(nullRange.high) }
      : null,
    basis: text(source.basis),
    observed: Object.keys(observed).length
      ? {
          low: number(observed.low),
          high: number(observed.high),
          nWithDose: integer(first(observed, "n_with_dose", "nWithDose")),
          nTotal: integer(first(observed, "n_total", "nTotal")),
        }
      : null,
    evidenceWithDose: number(first(source, "evidence_with_dose", "evidenceWithDose")),
    productMatch: text(first(source, "product_match", "productMatch")),
    productFactor: number(first(source, "product_factor", "productFactor")),
  };
}

const S4_ITEM_LABELS: Array<[string, string]> = [
  ["item1_randomisation_method", "Randomisation method"],
  ["item2_double_blind_placebo", "Double-blind placebo"],
  ["item3_prospective_registration", "Prospective registration"],
  ["item4_outcome_matches_registry", "Outcome matches registry"],
  ["item5_attrition_ok", "Attrition acceptable"],
  ["item6_itt", "Intention-to-treat"],
];

function normalizeExtractionClaim(value: unknown): ExtractionClaim | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  return {
    outcomeVocabId: text(first(source, "outcome_vocab_id", "outcomeVocabId")),
    discarded: boolean(source.discarded) ?? false,
    outcomeRaw: text(first(source, "outcome_raw", "outcomeRaw")),
    measure: text(source.measure),
    direction: text(source.direction),
    magnitude: text(source.magnitude),
    effectSize: number(first(source, "effect_size", "effectSize")),
    effectUnit: text(first(source, "effect_unit", "effectUnit")),
    effectFavours: text(first(source, "effect_favours", "effectFavours")),
    effectSd: number(first(source, "effect_sd", "effectSd")),
    effectSdBasis: text(first(source, "effect_sd_basis", "effectSdBasis")),
    ciLow: number(first(source, "ci_low", "ciLow")),
    ciHigh: number(first(source, "ci_high", "ciHigh")),
    pValue: number(first(source, "p_value", "pValue")),
    isPrimaryOutcome: boolean(first(source, "is_primary_outcome", "isPrimaryOutcome")),
    contrast: text(source.contrast),
    evidenceSpan: text(first(source, "evidence_span", "evidenceSpan")),
  };
}

function normalizeStudyExtraction(value: unknown): StudyExtraction | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  const s3 = record(source.s3);
  const s4 = record(source.s4);
  const s7 = record(source.s7);
  const s8 = record(source.s8);
  return {
    s3: Object.keys(s3).length
      ? {
          populationAxes: Object.keys(record(s3.population_axes)).length
            ? record(s3.population_axes)
            : null,
          populationText: text(s3.population_text),
          nRandomised: integer(s3.n_randomised),
          nAnalysed: integer(s3.n_analysed),
          durationDays: number(s3.duration_days),
          comparator: text(s3.comparator),
          ingredientIsolated: text(s3.ingredient_isolated),
          selfDeclaredUnderpowered: boolean(s3.self_declared_underpowered),
          deficiencyStatus: text(s3.deficiency_status),
          registrationId: text(s3.registration_id),
          evidenceSpans: stringArray(s3.evidence_spans),
        }
      : null,
    s4: Object.keys(s4).length
      ? {
          items: S4_ITEM_LABELS.map(([key, label]) => ({
            key,
            label,
            value: integer(s4[key]),
          })),
          unverifiableItems: stringArray(s4.unverifiable_items),
          evidenceSpans: stringArray(s4.evidence_spans),
        }
      : null,
    s5Claims: array(first(source, "s5_claims", "s5Claims"))
      .map(normalizeExtractionClaim)
      .filter((item): item is ExtractionClaim => item !== null),
    s7: Object.keys(s7).length
      ? {
          formVocabId: text(s7.form_vocab_id),
          formRaw: text(s7.form_raw),
          saltFamily: text(s7.salt_family),
          elementalDoseMg: number(s7.elemental_dose_mg),
          compoundDoseMg: number(s7.compound_dose_mg),
          dosePerKgMg: number(s7.dose_per_kg_mg),
          meanBodyMassKg: number(s7.mean_body_mass_kg),
          doseBasis: text(s7.dose_basis),
          doseFrequencyPerDay: number(s7.dose_frequency_per_day),
          confidence: number(s7.confidence),
          evidenceSpan: text(s7.evidence_span),
        }
      : null,
    s8: Object.keys(s8).length
      ? {
          fundingClass: text(s8.funding_class),
          funderNames: stringArray(s8.funder_names),
          authorCoi: boolean(s8.author_coi),
          suppliesDonatedByIndustry: boolean(s8.supplies_donated_by_industry),
          evidenceSpan: text(s8.evidence_span),
        }
      : null,
  };
}

function normalizeOutcome(value: unknown): DashboardOutcome | null {
  const source = record(value);
  const meta = record(source.outcome);
  const evidence = record(source.evidence);
  const components = record(source.components);
  const arcs = record(source.arcs);
  const id = text(first(meta, "id", "outcome_vocab_id")) ?? text(first(source, "outcome_vocab_id", "id"));
  if (!id) return null;
  const displayScore = number(first(source, "composite", "display_score", "displayScore"));
  const band = text(source.band);
  const explicitGate = boolean(first(source, "gate_fired", "gateFired"));
  const gateFired =
    explicitGate ??
    (displayScore === null && Boolean(band?.match(/no usable|insufficient|gated/i)));

  return {
    ecuKey: text(first(source, "ecu_key", "ecuKey")),
    ingredient: text(source.ingredient),
    formVocabId: text(first(source, "form_vocab_id", "formVocabId")),
    doseBand: text(first(source, "dose_band", "doseBand")),
    bandVersion: integer(first(source, "band_version", "bandVersion")),
    id,
    label: text(meta.label) ?? text(source.label) ?? humanize(id),
    kind: text(meta.kind) ?? text(source.kind),
    definition: text(meta.definition) ?? text(source.definition),
    polarity: text(meta.polarity) ?? text(source.polarity),
    displayScore,
    signedScore: number(first(source, "score", "signed", "signed_score", "signedScore")),
    verdictLabel: text(first(source, "verdict", "verdict_label", "display_verdict")) ?? band,
    band,
    gateFired,
    population: source.population ?? null,
    dose: source.dose ?? null,
    doseRangeMg: first(source, "dose_range_mg", "doseRangeMg") ?? null,
    studyIds: stringArray(first(evidence, "study_ids", "studyIds") ?? first(source, "study_ids", "studyIds")),
    formMix: first(source, "form_mix", "formMix") ?? null,
    applicability: source.applicability ?? null,
    flags: stringArray(source.flags),
    provenance: source.provenance ?? null,
    arcs: Object.fromEntries(
      ARC_KEYS.map((key) => [key, normalizeArc(arcs[key], key)]),
    ) as Record<ArcKey, DashboardArc>,
    components: {
      d: number(components.d),
      c: number(components.c),
      heterogeneity: number(first(components, "H", "h", "heterogeneity")),
      evidenceMass: number(first(components, "E", "e", "evidence_mass")),
      adjustedEvidenceMass: number(first(components, "E_prime", "e_prime", "adjusted_evidence_mass")),
      coverage: number(components.coverage),
    },
    nPrimaries: integer(first(source, "n_primaries", "evidence_n")) ?? integer(evidence.n_primaries),
    nSyntheses: integer(source.n_syntheses) ?? integer(evidence.n_syntheses),
    promptVersion: text(first(source, "prompt_version", "promptVersion")),
    contributions: array(evidence.contributions)
      .map(normalizeContribution)
      .filter((item): item is StudyContribution => item !== null),
    doseStory: normalizeDoseStory(source.dose),
  };
}

function normalizeStudy(value: unknown, index: number): DashboardStudy | null {
  const source = record(value);
  const canonicalId =
    text(first(source, "canonical_id", "canonicalId", "id")) ??
    text(source.doi)?.toLowerCase().replace(/^/, "doi:") ??
    text(source.pmid)?.replace(/^/, "pmid:") ??
    `study:${index + 1}`;
  const title = text(source.title);
  if (!title) return null;
  return {
    canonicalId,
    title,
    year: integer(source.year),
    doi: text(source.doi),
    pmid: text(source.pmid),
    journal: text(first(source, "journal", "journal_name")),
    oa: text(source.oa),
    predatoryVenue: boolean(first(source, "predatory_venue", "predatoryVenue")),
    skipped: boolean(source.skipped),
    skipReason: text(first(source, "skip_reason", "skipReason")),
    failedPartial: boolean(first(source, "failed_partial", "failedPartial")),
    extraction: normalizeStudyExtraction(source.extraction),
  };
}

function normalizeAgents(value: unknown): AgentStat[] {
  const source = record(value);
  return Object.entries(source)
    .map(([name, raw]) => {
      const agent = record(raw);
      return {
        name,
        ok: integer(agent.ok),
        fail: integer(agent.fail),
        cache: integer(first(agent, "cache", "cache_hits")),
        errors: Object.entries(record(agent.errors)).map(([message, count]) => ({
          message,
          count: integer(count) ?? 0,
        })),
      } satisfies AgentStat;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function breakdown(value: unknown, identityKey: string): Array<Record<string, unknown>> {
  const allowed = new Set([
    "agent", "tier", "provider", "model", "full_model", "configured_model", "effort",
    "reasoning_effort", "prompt_version", "status", "aggregate_complete", "attempts",
    "calls", "live_calls", "cache_hits", "hits", "retries", "failures", "fail",
    "terminal_failures", "input", "cache_write", "cache_read", "output", "input_tokens",
    "output_tokens", "total_tokens", "api_equivalent_cost", "cost", "metered_run_spend",
    "currency", "latency_s", "average_latency_s", "p95_latency_s", "tokens",
  ]);
  const sanitize = (item: unknown, identity?: string): Record<string, unknown> => {
    const source = record(item);
    const safe: Record<string, unknown> = identity ? { [identityKey]: identity } : {};
    for (const [key, raw] of Object.entries(source)) {
      if (!allowed.has(key)) continue;
      if (key === "tokens") {
        safe.tokens = Object.fromEntries(Object.entries(record(raw)).filter(([tokenKey, tokenValue]) => ["fresh_input", "input", "cache_write", "cache_read", "output", "total"].includes(tokenKey) && (tokenValue === null || typeof tokenValue === "number")));
      } else if (raw === null || ["string", "number", "boolean"].includes(typeof raw)) {
        safe[key] = raw;
      }
    }
    return safe;
  };
  if (Array.isArray(value)) return value.map((item) => sanitize(item)).filter((item) => Object.keys(item).length > 0);
  return Object.entries(record(value)).map(([key, item]) => sanitize(item, key));
}

function sanitizeEfficiency(value: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record(value)).map(([scope, item]) => {
    const source = record(item);
    return [scope, Object.fromEntries(Object.entries(source).filter(([key, raw]) => ["denominator", "calls", "tokens", "api_equivalent_cost"].includes(key) && (raw === null || typeof raw === "number")))];
  }));
}

function emptyUsage(raw: UnknownRecord = {}): DashboardUsage {
  return {
    version: null,
    status: "unavailable",
    telemetryExplanation: "Usage telemetry is unavailable for this retained run. Missing values are not treated as zero.",
    currency: null,
    billingBasis: null,
    breakdownStatus: "unavailable",
    calls: null,
    cacheHits: null,
    retries: null,
    failures: null,
    terminalFailures: null,
    usageRecordsMissingTokens: null,
    usageRecordsMissingCost: null,
    freshInputTokens: null,
    cacheWriteTokens: null,
    cacheReadTokens: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    spentUsd: null,
    apiEquivalentUsd: null,
    latencyWallTimeSeconds: null,
    latencyAverageSeconds: null,
    latencyP95Seconds: null,
    peakConcurrency: null,
    latencyBasis: null,
    operations: {},
    byAgent: [],
    byTier: [],
    byModel: [],
    modelRouting: [],
    efficiency: {},
    rawStructuredUsage: {},
    models: {},
    agentTiers: {},
    raw,
  };
}

function usageFromSpeedReport(speedReport: string, provider: string | null): DashboardUsage | null {
  const calls = speedReport.match(/live calls ok\/fail\/cache:\s*(\d+)\/(\d+)\/(\d+)/i);
  const latency = speedReport.match(/avg latency \(ok\):\s*([\d.]+)s\s+p95:\s*([\d.]+)s/i);
  const limits = speedReport.match(/concurrent limit[^:]*:\s*(\d+)[\s\S]*?peak in-flight observed:\s*(\d+)/i);
  const failures = speedReport.match(/timeouts:\s*(\d+)\s+auth failures:\s*(\d+)/i);
  const failRate = speedReport.match(/fail rate:\s*([\d.]+)%/i);
  if (!calls && !latency) return null;
  const ok = calls ? Number(calls[1]) : null;
  const failed = calls ? Number(calls[2]) : null;
  const cache = calls ? Number(calls[3]) : null;
  const base = emptyUsage();
  const normalized: DashboardUsage = {
    ...base,
    version: "1",
    status: "partial",
    telemetryExplanation: "Aggregate calls and latency were retained, but token and price fields were not recorded for this run. Unknown fields remain unavailable.",
    currency: "USD",
    billingBasis: provider?.toLowerCase().includes("grok") ? "Grok subscription; no marginal per-call metered charge" : null,
    calls: ok !== null && failed !== null ? ok + failed : null,
    cacheHits: cache,
    failures: failed,
    usageRecordsMissingTokens: ok !== null && failed !== null ? ok + failed : null,
    usageRecordsMissingCost: ok !== null && failed !== null ? ok + failed : null,
    spentUsd: provider?.toLowerCase().includes("grok") ? 0 : null,
    latencyAverageSeconds: latency ? Number(latency[1]) : null,
    latencyP95Seconds: latency ? Number(latency[2]) : null,
    peakConcurrency: limits ? Number(limits[2]) : null,
    latencyBasis: "retained speed report; latency covers successful live calls",
    operations: {
      successful_calls: ok,
      failed_calls: failed,
      cache_hits: cache,
      timeouts: failures ? Number(failures[1]) : null,
      auth_failures: failures ? Number(failures[2]) : null,
      fail_rate: failRate ? Number(failRate[1]) / 100 : null,
      concurrency_limit: limits ? Number(limits[1]) : null,
    },
  };
  normalized.raw = usageProjection(normalized);
  return normalized;
}

function sanitizeStructuredUsage(value: unknown): Record<string, unknown> {
  const source = record(value);
  const allowedRecordKeys = new Set([
    "agent", "tier", "provider", "model", "full_model", "effort", "reasoning_effort", "prompt_version",
    "cached", "outcome", "tokens",
    "calls", "live_calls", "cache_hits", "retries", "failures", "input_tokens",
    "output_tokens", "total_tokens", "api_equivalent_cost", "latency_s",
  ]);
  const records = array(source.records).flatMap((item) => {
    const row = record(item);
    const safe: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(row)) {
      if (!allowedRecordKeys.has(key)) continue;
      if (key === "tokens") {
        safe.tokens = Object.fromEntries(Object.entries(record(raw)).filter(([tokenKey, tokenValue]) => ["fresh_input", "cache_write", "cache_read", "output", "total"].includes(tokenKey) && (tokenValue === null || typeof tokenValue === "number")));
      } else if (raw === null || ["string", "number", "boolean"].includes(typeof raw)) {
        safe[key] = raw;
      }
    }
    return Object.keys(safe).length ? [safe] : [];
  });
  return {
    source: text(source.source),
    records,
    redactions: stringArray(source.redactions),
  };
}

function usageProjection(usage: DashboardUsage): Record<string, unknown> {
  return {
    version: usage.version,
    telemetry_status: usage.status,
    telemetry_explanation: usage.telemetryExplanation,
    currency: usage.currency,
    metered_run_spend: usage.spentUsd,
    metered_spend_basis: usage.billingBasis,
    api_equivalent_cost: usage.apiEquivalentUsd,
    live_calls: usage.calls,
    cache_hits: usage.cacheHits,
    retries: usage.retries,
    failures: usage.failures,
    terminal_failures: usage.terminalFailures,
    usage_records_missing_tokens: usage.usageRecordsMissingTokens,
    usage_records_missing_cost: usage.usageRecordsMissingCost,
    tokens: {
      fresh_input: usage.freshInputTokens,
      cache_write: usage.cacheWriteTokens,
      cache_read: usage.cacheReadTokens,
      output: usage.outputTokens,
      total: usage.totalTokens,
    },
    latency: {
      wall_time_s: usage.latencyWallTimeSeconds,
      average_s: usage.latencyAverageSeconds,
      p95_s: usage.latencyP95Seconds,
      peak_concurrency: usage.peakConcurrency,
      basis: usage.latencyBasis,
    },
    operations: usage.operations,
    breakdown_status: usage.breakdownStatus,
    by_agent: usage.byAgent,
    by_tier: usage.byTier,
    by_model: usage.byModel,
    model_routing: usage.modelRouting,
    raw_structured_usage: usage.rawStructuredUsage,
    efficiency: usage.efficiency,
  };
}

function normalizeUsage(
  value: unknown,
  runModels: Record<string, string>,
  speedReport: string | null,
  provider: string | null,
): DashboardUsage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return (speedReport ? usageFromSpeedReport(speedReport, provider) : null) ?? emptyUsage();
  }
  const source = record(value);
  const tokens = record(source.tokens);
  const latency = record(source.latency);
  const base = emptyUsage(source);
  const freshInput = integer(first(tokens, "fresh_input", "freshInput", "input"));
  const cacheWrite = integer(first(tokens, "cache_write", "cacheWrite"));
  const cacheRead = integer(first(tokens, "cache_read", "cacheRead"));
  const explicitInput = integer(first(source, "input_tokens", "inputTokens"));
  const normalized: DashboardUsage = {
    ...base,
    version: text(source.version),
    status: text(first(source, "telemetry_status", "telemetryStatus", "status", "availability")) ?? "available",
    telemetryExplanation: text(first(source, "telemetry_explanation", "telemetryExplanation")),
    currency: text(source.currency),
    billingBasis: text(first(source, "metered_spend_basis", "meteredSpendBasis", "billing_basis", "billingBasis")),
    breakdownStatus: text(first(source, "breakdown_status", "breakdownStatus")),
    calls: integer(first(source, "live_calls", "liveCalls", "calls", "model_calls")),
    cacheHits: integer(first(source, "cache_hits", "cacheHits")),
    retries: integer(source.retries),
    failures: integer(source.failures),
    terminalFailures: integer(first(source, "terminal_failures", "terminalFailures")),
    usageRecordsMissingTokens: integer(first(source, "usage_records_missing_tokens", "usageRecordsMissingTokens")),
    usageRecordsMissingCost: integer(first(source, "usage_records_missing_cost", "usageRecordsMissingCost")),
    freshInputTokens: freshInput,
    cacheWriteTokens: cacheWrite,
    cacheReadTokens: cacheRead,
    inputTokens: explicitInput ?? ([freshInput, cacheWrite, cacheRead].every((item) => item !== null)
      ? (freshInput as number) + (cacheWrite as number) + (cacheRead as number)
      : null),
    outputTokens: integer(first(source, "output_tokens", "outputTokens")) ?? integer(tokens.output),
    totalTokens: integer(tokens.total) ?? ([freshInput, cacheWrite, cacheRead, integer(tokens.output)].every((item) => item !== null)
      ? (freshInput as number) + (cacheWrite as number) + (cacheRead as number) + (integer(tokens.output) as number)
      : null),
    spentUsd: number(first(source, "spent_usd", "spentUsd", "metered_spend_usd", "metered_run_spend", "meteredRunSpend")),
    apiEquivalentUsd: number(first(source, "api_equivalent_usd", "apiEquivalentUsd", "total_cost_usd", "api_equivalent_cost", "apiEquivalentCost")),
    latencyWallTimeSeconds: number(first(latency, "wall_time_s", "wallTimeSeconds")),
    latencyAverageSeconds: number(first(latency, "average_s", "averageSeconds", "avg_latency_seconds")),
    latencyP95Seconds: number(first(latency, "p95_s", "p95Seconds", "p95_latency_seconds")),
    peakConcurrency: integer(first(latency, "peak_concurrency", "peakConcurrency")),
    latencyBasis: text(latency.basis),
    operations: Object.fromEntries(Object.entries(record(source.operations)).map(([key, item]) => [key, number(item)])),
    byAgent: breakdown(first(source, "by_agent", "byAgent"), "agent"),
    byTier: breakdown(first(source, "by_tier", "byTier"), "tier"),
    byModel: breakdown(first(source, "by_model", "byModel"), "model"),
    modelRouting: breakdown(first(source, "model_routing", "modelRouting"), "agent"),
    efficiency: sanitizeEfficiency(source.efficiency),
    rawStructuredUsage: sanitizeStructuredUsage(first(source, "raw_structured_usage", "rawStructuredUsage")),
    models: { ...runModels, ...stringMap(source.models) },
    agentTiers: stringMap(first(source, "agent_tiers", "agentTiers")),
    raw: source,
  };
  normalized.raw = usageProjection(normalized);
  return normalized;
}

/** Normalize DashboardRunV1 plus retained pre-contract context JSON. */
export function normalizeRun(input: unknown, sourceArtifact: string | null = null): DashboardRun {
  const raw = record(input);
  const runSource = record(raw.run);
  const product = record(raw.product);
  const validitySource = record(raw.validity ?? runSource.validity);
  const reports = record(raw.reports);
  const corpus = record(raw.corpus);
  const stats = record(raw.stats);
  const studyStats = record(stats.studies);
  const executionStats = record(stats.execution);
  const extraction = record(raw.extraction);

  const id = text(runSource.id) ?? text(raw.run_id) ?? idFromSource(sourceArtifact) ?? "unknown-run";
  const promptVersion = text(first(runSource, "prompt_version", "promptVersion")) ?? text(raw.prompt_version);
  const mode = text(runSource.mode) ?? text(raw.mode);
  const runModels = stringMap(runSource.models);
  const provider = text(runSource.provider) ?? text(raw.provider) ?? providerFrom(mode, promptVersion);
  const canonical = raw.schema_version === "DashboardRunV1";
  const note = text(validitySource.note);
  const reasonCodes = stringArray(first(validitySource, "reason_codes", "reasonCodes"));
  const limitations = [
    ...stringArray(validitySource.limitations),
    ...(note ? [note] : []),
  ];
  if (!canonical) {
    limitations.push("Legacy report projection: detailed provenance and per-outcome study attribution are unavailable.");
  }

  const studiesRaw = first(corpus, "studies", "study_corpus") ?? raw.studies ?? raw.study_corpus ?? raw.studies_list;
  const outcomesRaw = raw.ecu_rows ?? raw.outcomes ?? raw.results;
  const srSource = record(first(corpus, "systematic_reviews", "sr") ?? raw.systematic_reviews ?? raw.sr);
  const predatory = record(first(corpus, "predatory_screen", "predatory") ?? raw.predatory);
  const agents = first(stats, "agents", "agent_stats") ?? extraction.agents ?? raw.agent_stats;
  const usageSource = raw.usage ?? raw.telemetry;
  const speedReport = text(raw.speed_report) ?? text(extraction.speed_report);

  return {
    schemaVersion: text(raw.schema_version) ?? "LegacyContextV0",
    sourceArtifact,
    run: {
      id,
      timestamp:
        text(first(runSource, "generated_at", "timestamp")) ??
        text(raw.generated_at) ??
        timestampFromId(id),
      sourceCommit: text(first(runSource, "source_commit", "sourceCommit")),
      provider,
      mode,
      scope: text(runSource.scope) ?? text(raw.scope),
      ingredient: text(product.ingredient) ?? text(runSource.ingredient) ?? text(raw.ingredient) ?? "Unknown ingredient",
      form: text(product.form) ?? text(runSource.form) ?? text(raw.form) ?? "Unknown form",
      dose: product.dose ?? runSource.dose ?? null,
      population: product.population ?? runSource.population ?? null,
      scoringModel: text(first(runSource, "scoring_model", "scoringModel")) ?? text(raw.scoring_model),
      promptVersion,
      models: runModels,
      validity: {
        status: text(validitySource.status) ?? (canonical ? "unreviewed" : "invalid"),
        publicClaimsAllowed: boolean(first(validitySource, "public_claims_allowed", "publicClaimsAllowed")) ?? (canonical ? null : false),
        reasonCodes: canonical ? reasonCodes : [...reasonCodes, "legacy_context"],
        note,
        registryKey: text(first(validitySource, "registry_key", "registryKey")),
        limitations: [...new Set(limitations)],
      },
    },
    reports: {
      summaryPath: text(first(reports, "summary", "summary_path", "summaryPath")),
      fullPath: text(first(reports, "full", "full_path", "fullPath")),
      contextPath: text(first(reports, "context", "context_path", "contextPath")),
      dashboardPath: text(first(reports, "dashboard", "dashboard_path", "dashboardPath")),
    },
    outcomes: array(outcomesRaw)
      .map(normalizeOutcome)
      .filter((item): item is DashboardOutcome => item !== null),
    studies: array(studiesRaw)
      .map(normalizeStudy)
      .filter((item): item is DashboardStudy => item !== null),
    extraction: {
      targeted: integer(first(studyStats, "targeted", "studies_targeted")) ?? integer(extraction.targeted) ?? integer(raw.studies_targeted),
      usable: integer(first(studyStats, "usable", "ok", "studies_ok")) ?? integer(extraction.usable) ?? integer(raw.studies_ok),
      skipped: integer(first(studyStats, "skipped", "studies_skipped")) ?? integer(extraction.skipped) ?? integer(raw.studies_skipped),
      partialFailures:
        integer(first(studyStats, "partial_failures", "failed_partial")) ??
        integer(first(extraction, "partial_failures", "partialFailures")) ??
        integer(raw.studies_failed_partial),
      concurrency: integer(executionStats.concurrency) ?? integer(extraction.concurrency) ?? integer(raw.concurrency),
      studiesInFlight:
        integer(first(executionStats, "studies_in_flight", "studiesInFlight")) ??
        integer(first(extraction, "studies_in_flight", "studiesInFlight")) ??
        integer(raw.studies_in_flight),
      agents: normalizeAgents(agents),
      speedReport: text(first(executionStats, "speed_report", "speedReport")) ?? text(extraction.speed_report) ?? text(raw.speed_report),
    },
    systematicReviews: {
      requested: integer(first(srSource, "requested", "requested_cap")),
      extracted: integer(first(srSource, "extracted", "s2_ok", "s2Ok")),
      resolved: integer(srSource.resolved),
      derived: srSource.derived ?? null,
    },
    predatoryScreen: {
      listEntries: integer(first(predatory, "list_entries", "listEntries")),
      studiesChecked: integer(first(predatory, "studies_checked", "studiesChecked")),
      publishersResolved: integer(first(predatory, "publishers_resolved", "publishersResolved")),
      studiesFlagged: integer(first(predatory, "studies_predatory", "studies_flagged", "studiesFlagged")),
      affectsScore: boolean(first(predatory, "zero_weight", "affects_score", "affectsScore")),
      source: text(predatory.source),
    },
    usage: normalizeUsage(usageSource, runModels, speedReport, provider),
    reconciliation: Object.keys(record(raw.reconciliation)).length ? record(raw.reconciliation) : null,
  };
}
