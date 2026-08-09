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
  DashboardRunSchema.parse(raw);
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
  if (!fs.existsSync(reportPath)) return null;
  const match = fs.readFileSync(reportPath, "utf8").match(/^scoring_model:\s*([^\s]+)\s*$/m);
  return match?.[1] ?? null;
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

/** Load immutable DashboardRunV1 artifacts; use context JSON only as a legacy fallback. */
export function loadDashboardCatalog(): DashboardRun[] {
  const dashboardFiles = filesWithSuffix("_dashboard.json");
  const runs = dashboardFiles.length
    ? dashboardFiles.map(loadDashboardArtifact)
    : filesWithSuffix("_context.json").map(loadLegacyContext);
  return runs.sort((left, right) => (right.run.timestamp ?? "").localeCompare(left.run.timestamp ?? ""));
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
