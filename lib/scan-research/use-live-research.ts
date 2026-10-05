"use client";

/*
 * The state machine behind the /scan live-research screen (components/
 * scan-research-panel.tsx draws it; components/scan-flow.tsx owns it). It was
 * the body of the old panel and is moved here UNCHANGED IN BEHAVIOUR so the
 * screen can be the top-level state of /scan instead of a card under a result:
 * ScanFlow calls this hook at its own top level, so the poll lives exactly as
 * long as the scan screen does and is never unmounted by a change of what is
 * drawn (loading -> result). Contract: lib/scan-research/contract.ts (POST
 * /api/scan/research, GET /api/scan/research/[id]); client rules: ./client.ts.
 *
 *  - ONLY A SAVED, OWNED RUN. Research is asked for with a stored run id (a UUID)
 *    and the signed-in owner's Google bearer token, nothing else. No id, no
 *    sign-in, or a deployment without sign-in: no request at all.
 *  - A REPLAY ASKS NOTHING BY ITSELF. A saved scan opened from History is shown
 *    "as it was, nothing re-run". It looks the research up (GET) only when this
 *    page already knows the job, and otherwise waits for the person to press the
 *    button. A job that exists is looked up, never re-requested; the server is
 *    idempotent per scan on top of that, so a repeated request cannot add a job.
 *  - NO STALE OWNER. Everything is keyed to (owner, scan). A different owner, a
 *    sign-out, another scan or an unmount aborts the request in flight and a late
 *    answer is dropped; the previous owner's job is never drawn, not even for a
 *    frame.
 *  - REAL STATE ONLY. queued / running / succeeded / failed are the job's own
 *    status; times are the server's timestamps; "no update from the worker" is
 *    derived from the last worker signal and the lease. The API exposes NO
 *    percentage, so none exists here: nothing below invents progress, an
 *    estimate or a count of anything found.
 *  - TOKEN. A 401 refreshes the access token ONCE and retries once
 *    (researchWithCurrentToken); a second 401 is "sign in again", never a loop.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  forgetResearchJob,
  isResearchId,
  isStalled,
  knownResearchJob,
  noteResearchOwner,
  parseResearchJob,
  parseResearchResult,
  rememberResearchJob,
  researchWithCurrentToken,
  waitForResearch,
  RESEARCH_POLL_MS,
  type LiveResearchJob,
  type ResearchReply,
  type ResearchResultV2,
} from "./client";

type TokenOptions = { userId?: string; forceRefresh?: boolean };

export type ResearchState = "idle" | "starting" | "queued" | "running" | "succeeded" | "failed" | "disabled" | "unavailable" | "error" | "no-id" | "auth" | "busy" | "not-researchable" | "not-found";

/**
 * Which screen a state is:
 *   loading        the request is being made, or the job is queued / running
 *   result         a completed job whose result passed the client's checks
 *   not-requested  a saved scan opened from History with no job this page knows
 *   problem        everything else: failed / refused / unavailable / not saved / ...
 */
export type ResearchPhase = "loading" | "result" | "not-requested" | "problem";

export function researchPhase(state: ResearchState): ResearchPhase {
  if (state === "starting" || state === "queued" || state === "running") return "loading";
  if (state === "succeeded") return "result";
  if (state === "idle") return "not-requested";
  return "problem";
}

type View = { key: string; state: ResearchState; job: LiveResearchJob | null; stalled: boolean };

/** The state a (owner, scan) starts in, before any request. "starting" is the only state that sends one. */
function startState(enabled: boolean, ownerId: string | null, scanId: string | null, mayStart: boolean): ResearchState {
  if (!enabled) return "disabled";
  if (!ownerId) return "auth";
  if (!scanId || !isResearchId(scanId)) return "no-id";
  return mayStart ? "starting" : "idle";
}

/** One API answer -> the state that must replace the job, or null when it carries a usable job. */
function failureOf({ response, json }: { response: Response; json: ResearchReply }): ResearchState | null {
  if (response.status === 401 || json.status === "unauthorized") return "auth";
  if (response.status === 404 || json.status === "not_found") return "not-found";
  if (json.status === "research_disabled") return "disabled";
  if (json.status === "research_unavailable" || json.status === "auth_unavailable") return "unavailable";
  if (response.status === 429 || json.status === "research_busy") return "busy";
  if (response.status === 422 || json.status === "scan_not_researchable") return "not-researchable";
  if (!response.ok || json.status !== "ok" || !json.job) return "error";
  return null;
}

/** The states that still draw the job (its facts and times); every other state discards it. */
const SHOWS_JOB: ReadonlySet<ResearchState> = new Set(["queued", "running", "succeeded", "failed", "error", "unavailable", "busy"]);

export interface LiveResearchInput {
  scanId: string | null;
  ownerId: string | null;
  getAccessToken: (options?: TokenOptions) => Promise<string | null>;
  enabled?: boolean;
  /** A saved scan opened from History: never asks for research on its own. */
  replay?: boolean;
  /** Milliseconds since the epoch. Injected so no test (and no render) depends on the wall clock. */
  clock?: () => number;
}

export interface LiveResearch {
  state: ResearchState;
  phase: ResearchPhase;
  job: LiveResearchJob | null;
  /** The validated result of a completed job, or null. */
  result: ResearchResultV2 | null;
  /** A RUNNING job whose last worker signal is older than its lease (an observation, not a cap). */
  stalled: boolean;
  /** True when a request could be made for this (owner, scan) at all. */
  canAsk: boolean;
  /** The one explicit press: request research for a scan that has none loaded, or look the job up again. */
  press: () => void;
  /** Put this on the status line: focus moves there when the pressed button disappears. */
  statusRef: RefObject<HTMLParagraphElement | null>;
}

export function useLiveResearch({ scanId, ownerId, getAccessToken, enabled = true, replay = false, clock = Date.now }: LiveResearchInput): LiveResearch {
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const key = [enabled ? "on" : "off", ownerId ?? "", scanId ?? "", replay ? "replay" : "fresh"].join("|");

  // Explicit presses (look up / check again), counted PER (owner, scan) so a press never leaks across them.
  const [action, setAction] = useState({ key, n: 0 });
  const presses = action.key === key ? action.n : 0;
  const mayStart = !replay || presses > 0 || (ownerId !== null && scanId !== null && knownResearchJob(ownerId, scanId) !== null);
  const base = startState(enabled, ownerId, scanId, mayStart);

  const [view, setView] = useState<View>({ key, state: base, job: null, stalled: false });
  // Only the CURRENT (owner, scan)'s view is ever drawn: a view stamped with another key is simply not this scan's.
  const live: View = view.key === key ? view : { key, state: base, job: null, stalled: false };

  // The latest callbacks, so a parent that re-creates them cannot restart (re-request) a running flow.
  const latest = useRef({ getAccessToken, clock });
  useEffect(() => { latest.current = { getAccessToken, clock }; });

  useEffect(() => {
    noteResearchOwner(ownerId);
    if (!ownerId || !scanId || startState(enabled, ownerId, scanId, mayStart) !== "starting") return;
    const controller = new AbortController();
    const { signal } = controller;
    const owner = ownerId;
    const scan = scanId;
    const publish = (state: ResearchState, job: LiveResearchJob | null = null) => {
      if (signal.aborted) return;
      const shown = job && SHOWS_JOB.has(state) ? job : null;
      setView({ key, state, job: shown, stalled: shown ? isStalled(shown, latest.current.clock()) : false });
    };
    const send = (path: string, body?: unknown) => researchWithCurrentToken(path, latest.current.getAccessToken, signal, owner, body);
    const run = async () => {
      let job: LiveResearchJob | null = null;
      try {
        const knownId = knownResearchJob(owner, scan);
        // A job this page already knows is LOOKED UP; research is requested (POST) only when there is none.
        const first = knownId ? await send(`/api/scan/research/${encodeURIComponent(knownId)}`) : await send("/api/scan/research", { scan_id: scan });
        if (signal.aborted) return;
        const failed = failureOf(first);
        if (failed) {
          if (failed === "not-found") forgetResearchJob(owner, scan);
          publish(failed);
          return;
        }
        job = parseResearchJob(first.json.job);
        if (!job || job.scan_id !== scan || (knownId !== null && job.id !== knownId)) { publish("error"); return; }
        rememberResearchJob(owner, scan, job.id);
        publish(job.status, job);
        while (job.status === "queued" || job.status === "running") {
          await waitForResearch(RESEARCH_POLL_MS, signal);
          const polled = await send(`/api/scan/research/${encodeURIComponent(job.id)}`);
          if (signal.aborted) return;
          const bad = failureOf(polled);
          if (bad) {
            if (bad === "not-found") forgetResearchJob(owner, scan);
            publish(bad, job);
            return;
          }
          const next = parseResearchJob(polled.json.job);
          // A poll must answer for the same job of the same scan; anything else is dropped, not drawn.
          if (!next || next.id !== job.id || next.scan_id !== scan) { publish("error", job); return; }
          job = next;
          publish(job.status, job);
        }
      } catch (error) {
        if (!signal.aborted) publish(error instanceof Error && error.message === "auth" ? "auth" : "error", job);
      }
    };
    queueMicrotask(() => { if (!signal.aborted) void run(); });
    return () => controller.abort();
  }, [key, enabled, ownerId, scanId, mayStart, presses]);

  // The pressed button is about to disappear (and the screen it was on may be replaced by the
  // loading screen): focus the status line now, and again once the new screen has rendered.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    statusRef.current?.focus();
  });
  const press = () => {
    statusRef.current?.focus();
    refocus.current = true;
    setView({ ...live, state: "starting" });
    setAction({ key, n: presses + 1 });
  };

  const { job, stalled } = live;
  const result = useMemo(() => (job?.status === "succeeded" ? parseResearchResult(job.result) : null), [job]);
  // A job the server calls succeeded whose result the client will not draw (a failed check) is NOT a result.
  const state: ResearchState = live.state === "succeeded" && !result ? "error" : live.state;
  const canAsk = Boolean(enabled && ownerId && scanId && isResearchId(scanId));

  return { state, phase: researchPhase(state), job, result, stalled, canAsk, press, statusRef };
}
