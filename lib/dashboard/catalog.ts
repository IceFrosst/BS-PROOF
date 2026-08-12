import fs from "node:fs";
import path from "node:path";

import { assertDashboardRunV1, DashboardRunSchema } from "./schema";
import { normalizeRun } from "./normalize";
import { reconcileRun } from "./reconcile";
import type { DashboardOutcome, DashboardRun } from "./types";

const ROOT = process.cwd();
const RUNS_DIR = path.join(ROOT, "reports", "runs");

function posixRelative(filePath: string): string {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

function safeRunArtifactPath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const prefix = "reports/runs/";
  const name = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : "";
  if (!name || name.includes("/") || path.basename(name) !== name || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(json|md)$/.test(name)) {
    throw new Error(`Report path is outside the retained runs directory: ${relativePath}`);
  }
  return path.join(RUNS_DIR, name);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function filesWithSuffix(suffix: string): string[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(RUNS_DIR, entry.name))
    .sort();
}

function readOutcomeVocabulary(): Map<string, Partial<DashboardOutcome>> {
  const filePath = path.join(ROOT, "vocab", "outcome.json");
  if (!fs.existsSync(filePath)) return new Map();
  const raw = readJson(filePath) as { outcomes?: unknown[] };
  return new Map(
    (raw.outcomes ?? []).flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string") return [];
      return [[item.id, {
        label: typeof item.label === "string" ? item.label : undefined,
        kind: typeof item.kind === "string" ? item.kind : null,
        definition: typeof item.definition === "string" ? item.definition : null,
        polarity: typeof item.polarity === "string" ? item.polarity : null,
      }]];
    }),
  );
}

function enrichOutcomes(run: DashboardRun): DashboardRun {
  const vocabulary = readOutcomeVocabulary();
  return {
    ...run,
    outcomes: run.outcomes.map((outcome) => {
      const vocab = vocabulary.get(outcome.id);
      if (!vocab) return outcome;
      return {
        ...outcome,
        label: vocab.label ?? outcome.label,
        kind: vocab.kind ?? outcome.kind,
        definition: vocab.definition ?? outcome.definition,
        polarity: vocab.polarity ?? outcome.polarity,
      };
    }),
  };
}

function matchingLegacyContext(run: DashboardRun): string | null {
  if (run.reports.contextPath) {
    const explicit = safeRunArtifactPath(run.reports.contextPath);
    return fs.existsSync(explicit) ? explicit : null;
  }
  const file = path.join(RUNS_DIR, `${run.run.id}_context.json`);
  return fs.existsSync(file) ? file : null;
}

function loadDashboardArtifact(filePath: string): DashboardRun {
  const raw = readJson(filePath);
  assertDashboardRunV1(raw);
  const shapeCheck = DashboardRunSchema.safeParse(raw);
  if (!shapeCheck.success) {
    const details = shapeCheck.error.issues
      .map((item) => `${item.path.map(String).join(".") || "/"}: ${item.message}`)
      .join("; ");
    throw new Error(`Dashboard artifact failed shape validation (${posixRelative(filePath)}): ${details}`);
  }
  let run = normalizeRun(raw, posixRelative(filePath));
  const contractCheck = reconcileRun(run);
  if (!contractCheck.ok) {
    const details = contractCheck.issues.map((item) => `${item.path}: ${item.message}`).join("; ");
    throw new Error(`Dashboard artifact failed reconciliation (${posixRelative(filePath)}): ${details}`);
  }
  const legacyPath = matchingLegacyContext(run);
  if (legacyPath) {
    const retained = loadLegacyContext(legacyPath);
    const reconciliation = reconcileRun(run, retained);
    if (!reconciliation.ok) {
      const details = reconciliation.issues.map((item) => `${item.path}: ${item.message}`).join("; ");
      throw new Error(`Dashboard artifact does not match its retained context (${posixRelative(filePath)}): ${details}`);
    }
    run = {
      ...run,
      reconciliation: {
        ...(run.reconciliation ?? {}),
        reader_check: reconciliation,
      },
    };
  }
  return enrichOutcomes(run);
}

function scoringModelFromReport(reportPath: string): string | null {
  // The .md reports MOVE: scripts/archive_reports.py sweeps superseded-model
  // reports from reports/runs/ into reports/archive/<model>/ (the .json
  // artifacts stay put). Every archived run therefore lost its scoring_model
  // backfill here and QUARANTINED on a cold build — pre-existing before the
  // 2026-08-12 redesign, diagnosed during it. Probe the run-dir path first,
  // then the same basename under each archive model directory.
  const candidates = [reportPath];
  const archiveRoot = path.join(path.dirname(RUNS_DIR), "archive");
  if (fs.existsSync(archiveRoot)) {
    const basename = path.basename(reportPath);
    for (const model of fs.readdirSync(archiveRoot)) {
      candidates.push(path.join(archiveRoot, model, basename));
    }
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const match = fs.readFileSync(candidate, "utf8").match(/^scoring_model:\s*([^\s]+)\s*$/m);
    if (match?.[1]) return match[1];
  }
  return null;
}

function loadLegacyContext(filePath: string): DashboardRun {
  const raw = readJson(filePath) as Record<string, unknown>;
  const base = filePath.replace(/_context\.json$/, "");
  const summary = `${base}_summary.md`;
  const full = `${base}_full.md`;
  const augmented = {
    ...raw,
    scoring_model: raw.scoring_model ?? scoringModelFromReport(summary) ?? scoringModelFromReport(full),
    reports: {
      summary: fs.existsSync(summary) ? posixRelative(summary) : null,
      full: fs.existsSync(full) ? posixRelative(full) : null,
      context: posixRelative(filePath),
      dashboard: null,
    },
  };
  return enrichOutcomes(normalizeRun(augmented, posixRelative(filePath)));
}

/** An artifact that failed its contract. Excluded from the catalog, never rendered as a run. */
export interface QuarantinedRun {
  runId: string;
  artifactPath: string;
  reason: string;
}

interface RunArtifacts {
  runId: string;
  dashboardPath: string | null;
  contextPath: string | null;
}

interface CatalogLoad {
  runs: DashboardRun[];
  quarantined: QuarantinedRun[];
}

function runIdFromArtifact(filePath: string): string {
  return path.basename(filePath).replace(/_(dashboard|context)\.json$/i, "");
}

/** Pair each run's artifacts by filename stem so a run holding both is loaded once. */
function runArtifacts(): RunArtifacts[] {
  const entries = new Map<string, RunArtifacts>();
  const add = (filePath: string, kind: "dashboard" | "context"): void => {
    const runId = runIdFromArtifact(filePath);
    const existing = entries.get(runId) ?? { runId, dashboardPath: null, contextPath: null };
    entries.set(
      runId,
      kind === "dashboard"
        ? { ...existing, dashboardPath: filePath }
        : { ...existing, contextPath: filePath },
    );
  };
  for (const filePath of filesWithSuffix("_dashboard.json")) add(filePath, "dashboard");
  for (const filePath of filesWithSuffix("_context.json")) add(filePath, "context");
  return [...entries.values()].sort((left, right) => left.runId.localeCompare(right.runId));
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reported once per (artifact, reason) per process: a static build calls the
 * catalog once per page, and sixty copies of one break read as noise, not a break.
 */
const reportedQuarantines = new Set<string>();

function quarantine(
  quarantined: QuarantinedRun[],
  runId: string,
  filePath: string,
  reason: string,
): void {
  const entry: QuarantinedRun = { runId, artifactPath: posixRelative(filePath), reason };
  quarantined.push(entry);
  const key = JSON.stringify([entry.artifactPath, entry.reason]);
  if (reportedQuarantines.has(key)) return;
  reportedQuarantines.add(key);
  console.error(
    `[dashboard] QUARANTINED run "${entry.runId}" (${entry.artifactPath}): ${entry.reason} ` +
      "This run is excluded from the catalog; the rest of the site still builds.",
  );
}

/**
 * Load immutable DashboardRunV1 artifacts, falling back per run to legacy context
 * JSON. One unreadable artifact quarantines its own run, not the whole catalog.
 */
function loadCatalog(): CatalogLoad {
  const runs: DashboardRun[] = [];
  const quarantined: QuarantinedRun[] = [];
  const loadedIds = new Set<string>();

  for (const artifacts of runArtifacts()) {
    const source = artifacts.dashboardPath ?? artifacts.contextPath;
    if (!source) continue;
    let run: DashboardRun;
    try {
      // A dashboard artifact that fails its contract is quarantined outright. Falling
      // back to its context JSON would render a run whose two sources disagree as if
      // it were fine, which is the substitution the reconciliation exists to refuse.
      run = artifacts.dashboardPath !== null
        ? loadDashboardArtifact(artifacts.dashboardPath)
        : loadLegacyContext(source);
    } catch (error) {
      quarantine(quarantined, artifacts.runId, source, failureReason(error));
      continue;
    }
    if (loadedIds.has(run.run.id)) {
      quarantine(
        quarantined,
        artifacts.runId,
        source,
        `Run id "${run.run.id}" was already loaded from another artifact; the duplicate is refused rather than merged.`,
      );
      continue;
    }
    loadedIds.add(run.run.id);
    runs.push(run);
  }

  runs.sort((left, right) => (right.run.timestamp ?? "").localeCompare(left.run.timestamp ?? ""));
  return { runs, quarantined };
}

export function loadDashboardCatalog(): DashboardRun[] {
  return loadCatalog().runs;
}

/** Artifacts kept out of the catalog. Absent is not zero: these have no run row at all. */
export function loadQuarantinedRuns(): QuarantinedRun[] {
  return loadCatalog().quarantined;
}

export const loadRetainedRuns = loadDashboardCatalog;

export function loadDashboardRun(runId: string): DashboardRun | null {
  return loadDashboardCatalog().find((run) => run.run.id === runId) ?? null;
}

export const loadRetainedRun = loadDashboardRun;

export function getRetainedRunIds(): string[] {
  return loadDashboardCatalog().map((run) => run.run.id);
}

export function loadReportMarkdown(reportPath: string | null): string | null {
  if (!reportPath) return null;
  const resolved = safeRunArtifactPath(reportPath);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : null;
}
