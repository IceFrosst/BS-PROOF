/*
 * THE TOP-LEVEL KEYS OF A SAVED SCAN ANALYSIS THAT MAY LEAVE THE DATABASE.
 *
 * `getScanRun` (lib/scan-history/reader.ts) rebuilds a replayed analysis from
 * this explicit allow-list, so a field someone adds to the stored payload later
 * is NOT returned to the browser until it has been listed here on purpose --
 * the opposite of a deny-list that has to remember every new secret.
 *
 *   - `run_id` and `app_version` are deliberately absent: the reader restates
 *     them from the row itself (never the stored copy).
 *   - `persistence` is absent on purpose: it carries the private photo's
 *     bucket / path / sha and never leaves.
 *
 * KEPT IN STEP BY THE COMPILER. This file may only import the analysis TYPE
 * (an `import type`, erased at build, so no analyzer / model / pipeline code
 * reaches the history read path). The check at the bottom fails
 * `npm run typecheck` and `npm run build` when `ScanAnalysis` gains a key that
 * is neither listed nor one of the three restated/dropped ones, and when this
 * list names a key `ScanAnalysis` no longer has -- so a replayed result can
 * neither silently lose a field nor silently expose a new one.
 */
import type { ScanAnalysis } from "@/lib/analyze/scan";

export const ANALYSIS_KEYS = [
  "schema_version",
  "analyzed_at",
  "source",
  "status",
  "error",
  "label",
  "input",
  "product",
  "evidence",
  "ledger_audit",
  "evidence_prior",
  "dose_effectiveness",
  "compatibility",
  "company",
  "literature_warnings",
  "census",
  "queue",
  "caveats",
  "ingredient_label_text",
  "supported_ingredients",
  "basis_legend",
  "meta",
] as const;

type Listed = (typeof ANALYSIS_KEYS)[number];
type Restated = "run_id" | "app_version" | "persistence";
/** A `ScanAnalysis` key nobody has classified yet. Must be `never`. */
type Unclassified = Exclude<keyof ScanAnalysis, Listed | Restated>;
/** A listed key `ScanAnalysis` does not have (a typo or a removed field). Must be `never`. */
type NotAScanAnalysisKey = Exclude<Listed, keyof ScanAnalysis>;

// A compile-time assertion only; nothing here exists at run time.
export type AnalysisKeysCoverTheType = [Unclassified, NotAScanAnalysisKey] extends [never, never] ? true : never;
export const ANALYSIS_KEYS_COVER_THE_TYPE: AnalysisKeysCoverTheType = true;
