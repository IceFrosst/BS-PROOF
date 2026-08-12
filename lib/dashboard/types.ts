export type ArcKey = "effect" | "form" | "dose" | "evidence";
export type NullableNumber = number | null;

export interface DashboardArc {
  verdict: NullableNumber;
  coverage: NullableNumber;
  isQuantity: boolean;
  /** Dose arc only (SCORING_MODEL v12): the product's closeness to the range
   * of doses where benefit occurred — the composite's dose term. Null on
   * pre-v12 artifacts and on non-dose arcs. */
  closeness: NullableNumber;
}

/** One study's pull on an outcome's score. Empty array = the run's artifact
 * predates per-study attribution (2026-08-12); the UI must say so rather than
 * render an empty table. */
export interface StudyContribution {
  id: string | null;
  w: NullableNumber;
  s: NullableNumber;
  designRank: number | null;
  direction: string | null;
  formMatch: string | null;
  dShare: NullableNumber;
  points: NullableNumber;
  /** "smd"/"percent" = s came from a MEASURED effect; anything else names the
   * reason the number was refused and the direction label decided instead. */
  effectRoute: string | null;
  effectS: NullableNumber;
}

/** The dose block, parsed by name for the reviewer UI. The raw `dose` field
 * stays on the outcome for the audit page. */
export interface DashboardDoseStory {
  low: NullableNumber;
  high: NullableNumber;
  nBenefit: number | null;
  nNull: number | null;
  nullRange: { low: NullableNumber; high: NullableNumber } | null;
  basis: string | null;
  observed: { low: NullableNumber; high: NullableNumber; nWithDose: number | null; nTotal: number | null } | null;
  evidenceWithDose: NullableNumber;
  productMatch: string | null;
  productFactor: NullableNumber;
}

export interface ExtractionClaim {
  outcomeVocabId: string | null;
  discarded: boolean;
  outcomeRaw: string | null;
  measure: string | null;
  direction: string | null;
  magnitude: string | null;
  effectSize: NullableNumber;
  effectUnit: string | null;
  effectFavours: string | null;
  ciLow: NullableNumber;
  ciHigh: NullableNumber;
  pValue: NullableNumber;
  isPrimaryOutcome: boolean | null;
  contrast: string | null;
  evidenceSpan: string | null;
}

/** What each subagent extracted from one paper, verbatim spans included —
 * founder decision 2026-08-12: the dashboard is an internal calibration
 * instrument and the quote is what lets a scientist verify extraction. */
export interface StudyExtraction {
  s3: {
    populationAxes: Record<string, unknown> | null;
    populationText: string | null;
    nRandomised: number | null;
    nAnalysed: number | null;
    durationDays: NullableNumber;
    comparator: string | null;
    ingredientIsolated: string | null;
    selfDeclaredUnderpowered: boolean | null;
    deficiencyStatus: string | null;
    registrationId: string | null;
    evidenceSpans: string[];
  } | null;
  s4: {
    items: Array<{ key: string; label: string; value: number | null }>;
    unverifiableItems: string[];
    evidenceSpans: string[];
  } | null;
  s5Claims: ExtractionClaim[];
  s7: {
    formVocabId: string | null;
    formRaw: string | null;
    saltFamily: string | null;
    elementalDoseMg: NullableNumber;
    compoundDoseMg: NullableNumber;
    dosePerKgMg: NullableNumber;
    meanBodyMassKg: NullableNumber;
    doseBasis: string | null;
    doseFrequencyPerDay: NullableNumber;
    confidence: NullableNumber;
    evidenceSpan: string | null;
  } | null;
  s8: {
    fundingClass: string | null;
    funderNames: string[];
    authorCoi: boolean | null;
    suppliesDonatedByIndustry: boolean | null;
    evidenceSpan: string | null;
  } | null;
}

export interface DashboardComponents {
  d: NullableNumber;
  c: NullableNumber;
  heterogeneity: NullableNumber;
  evidenceMass: NullableNumber;
  adjustedEvidenceMass: NullableNumber;
  coverage: NullableNumber;
}

export interface DashboardOutcome {
  ecuKey: string | null;
  ingredient: string | null;
  formVocabId: string | null;
  doseBand: string | null;
  bandVersion: number | null;
  id: string;
  label: string;
  kind: string | null;
  definition: string | null;
  polarity: string | null;
  displayScore: NullableNumber;
  signedScore: NullableNumber;
  verdictLabel: string | null;
  band: string | null;
  gateFired: boolean;
  population: unknown | null;
  dose: unknown | null;
  doseRangeMg: unknown | null;
  studyIds: string[];
  formMix: unknown | null;
  applicability: unknown | null;
  flags: string[];
  provenance: unknown | null;
  arcs: Record<ArcKey, DashboardArc>;
  components: DashboardComponents;
  nPrimaries: number | null;
  nSyntheses: number | null;
  promptVersion: string | null;
  contributions: StudyContribution[];
  doseStory: DashboardDoseStory | null;
}

export interface DashboardStudy {
  canonicalId: string;
  title: string;
  year: number | null;
  doi: string | null;
  pmid: string | null;
  journal: string | null;
  oa: string | null;
  predatoryVenue: boolean | null;
  skipped: boolean | null;
  skipReason: string | null;
  failedPartial: boolean | null;
  extraction: StudyExtraction | null;
}

export interface AgentStat {
  name: string;
  ok: number | null;
  fail: number | null;
  cache: number | null;
  errors: Array<{ message: string; count: number }>;
}

export interface DashboardExtraction {
  targeted: number | null;
  usable: number | null;
  skipped: number | null;
  partialFailures: number | null;
  concurrency: number | null;
  studiesInFlight: number | null;
  agents: AgentStat[];
  speedReport: string | null;
}

export interface DashboardSystematicReviews {
  requested: number | null;
  extracted: number | null;
  resolved: number | null;
  derived: unknown | null;
}

export interface DashboardPredatoryScreen {
  listEntries: number | null;
  studiesChecked: number | null;
  publishersResolved: number | null;
  studiesFlagged: number | null;
  affectsScore: boolean | null;
  source: string | null;
}

export interface DashboardUsage {
  version: string | null;
  status: string;
  telemetryExplanation: string | null;
  currency: string | null;
  billingBasis: string | null;
  breakdownStatus: string | null;
  calls: number | null;
  cacheHits: number | null;
  retries: number | null;
  failures: number | null;
  terminalFailures: number | null;
  usageRecordsMissingTokens: number | null;
  usageRecordsMissingCost: number | null;
  freshInputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  spentUsd: number | null;
  apiEquivalentUsd: number | null;
  latencyWallTimeSeconds: number | null;
  latencyAverageSeconds: number | null;
  latencyP95Seconds: number | null;
  peakConcurrency: number | null;
  latencyBasis: string | null;
  operations: Record<string, number | null>;
  byAgent: Array<Record<string, unknown>>;
  byTier: Array<Record<string, unknown>>;
  byModel: Array<Record<string, unknown>>;
  modelRouting: Array<Record<string, unknown>>;
  efficiency: Record<string, unknown>;
  rawStructuredUsage: Record<string, unknown>;
  models: Record<string, string>;
  agentTiers: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface DashboardValidity {
  status: string;
  publicClaimsAllowed: boolean | null;
  reasonCodes: string[];
  note: string | null;
  registryKey: string | null;
  limitations: string[];
}

export interface DashboardRunIdentity {
  id: string;
  timestamp: string | null;
  sourceCommit: string | null;
  provider: string | null;
  mode: string | null;
  scope: string | null;
  ingredient: string;
  form: string;
  dose: unknown | null;
  population: unknown | null;
  scoringModel: string | null;
  promptVersion: string | null;
  models: Record<string, string>;
  validity: DashboardValidity;
}

export interface DashboardReports {
  summaryPath: string | null;
  fullPath: string | null;
  contextPath: string | null;
  dashboardPath: string | null;
}

export interface DashboardRun {
  schemaVersion: string;
  sourceArtifact: string | null;
  run: DashboardRunIdentity;
  reports: DashboardReports;
  outcomes: DashboardOutcome[];
  studies: DashboardStudy[];
  extraction: DashboardExtraction;
  systematicReviews: DashboardSystematicReviews;
  predatoryScreen: DashboardPredatoryScreen;
  usage: DashboardUsage | null;
  reconciliation: Record<string, unknown> | null;
}

export interface ReconciliationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

export interface ReconciliationResult {
  ok: boolean;
  checked: number;
  issues: ReconciliationIssue[];
}
