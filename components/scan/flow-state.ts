/*
 * The /scan state machine (docs/SYSTEM_DESIGN.md §11):
 *
 *   landing -> staged -> loading -> result | error
 *
 * One reducer owns the file, its preview URL, the request lifecycle and the
 * answer, so a transition can never leave half of them stale (e.g. a new photo
 * staged on top of an old answer). Revoking a replaced preview URL is a side
 * effect and lives in the component, keyed on `preview`.
 */

import type { ScanAnalysis } from "@/lib/analyze/scan";

export const MAX_BYTES = 12 * 1024 * 1024;

export const PHOTO_STAGES = [
  "Reading the label",
  "Converting the printed dose to its active moiety",
  "Matching against retained evidence runs",
  "Checking the FDA enforcement registry",
  "Asking the model about the company and the combination",
];

export const MANUAL_STAGES = [
  "Converting the dose you entered to its active moiety",
  "Matching against retained evidence runs",
  "Asking the model what the literature says",
];

export type HeroImage = "idle" | "loaded" | "error";

export interface FlowState {
  file: File | null;
  preview: string | null;
  busy: boolean;
  stage: number;
  stages: string[];
  data: ScanAnalysis | null;
  error: string | null;
  heroImage: HeroImage;
}

export const initialFlowState: FlowState = {
  file: null,
  preview: null,
  busy: false,
  stage: 0,
  stages: PHOTO_STAGES,
  data: null,
  error: null,
  heroImage: "idle",
};

export type FlowAction =
  | { type: "reject"; error: string }
  | { type: "stage"; file: File; preview: string }
  | { type: "clear" }
  | { type: "reset" }
  | { type: "start"; stages: string[]; clearFile: boolean }
  | { type: "tick" }
  | { type: "received"; data: ScanAnalysis | null; error: string | null }
  | { type: "failed"; error: string }
  | { type: "done" }
  | { type: "hero"; value: HeroImage };

/* Statuses that come back as a 200-shaped answer but mean the analysis did
 * not run; the page shows them as an error, keeping `data` for the header. */
const ERROR_STATUSES = new Set(["label_unreadable", "analyzer_failed", "bad_request", "manual_input_invalid"]);

/** Turn a POST /api/scan response body into the next `received` action. */
export function receivedAction(json: ScanAnalysis & { error?: string }, ok: boolean, httpStatus: number): FlowAction {
  if (!ok && !json.status) return { type: "failed", error: json.error ?? `Request failed (${httpStatus}).` };
  return {
    type: "received",
    data: json,
    error: ERROR_STATUSES.has(json.status) ? json.error ?? "The analysis could not run." : null,
  };
}

const cleared = { file: null, preview: null, heroImage: "idle" as const };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "reject":
      return { ...state, error: action.error };
    case "stage":
      return { ...state, error: null, data: null, heroImage: "idle", file: action.file, preview: action.preview };
    case "clear":
      return { ...state, ...cleared };
    case "reset":
      // "Scan another": back to landing. Clearing the file restarts the viewfinder.
      return { ...state, ...cleared, data: null, error: null };
    case "start":
      return { ...state, ...(action.clearFile ? cleared : {}), error: null, data: null, stages: action.stages, stage: 0, busy: true };
    case "tick":
      return { ...state, stage: Math.min(state.stage + 1, state.stages.length - 1) };
    case "received":
      return { ...state, data: action.data, error: action.error };
    case "failed":
      return { ...state, error: action.error };
    case "done":
      return { ...state, busy: false };
    case "hero":
      return { ...state, heroImage: action.value };
  }
}
