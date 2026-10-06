"use client";

/*
 * The state machine behind the /scan live-research screen (components/
 * scan-research-panel.tsx draws it; components/scan-flow.tsx owns it). ScanFlow
 * calls this hook at its own top level, so the poll lives exactly as long as the
 * scan screen does and is never unmounted by a change of what is drawn
 * (loading -> result). Contract: lib/scan-research/contract.ts (POST
 * /api/scan/research, GET /api/scan/research?scan_id=, GET
 * /api/scan/research/[id]); client rules: ./client.ts.
 *
 *  - ONLY A SAVED, OWNED RUN. Research is asked for with a stored run id (a UUID)
 *    and the signed-in owner's Google bearer token, nothing else. No id, no
 *    sign-in, or a deployment without sign-in: no request at all.
 *  - A JOB THAT EXISTS IS LOOKED UP, NEVER RE-REQUESTED. Three ways in, one rule:
 *      fresh      a scan this person has just made: research is asked for ONCE (POST;
 *                 the server is idempotent per scan, so even a repeat adds no job).
 *      replay     a saved scan opened from History: it first READS the scan's job
 *                 (GET /api/scan/research?scan_id=, owner-filtered in the database,
 *                 never creates anything). A job -> it is shown and followed to its
 *                 end, automatically; none -> "not requested" and a deliberate button.
 *                 Opening a scan NEVER asks for research by itself.
 *      restored   a scan put back after a page reload (components/scan-workspace.tsx):
 *                 the same read first. Only when it finds NO job and the person's own
 *                 fresh scan was cut off before its request got through
 *                 (`askIfNone`) is research asked for -- once, by the same POST.
 *    "Check again" is a READ (GET) only, whatever the screen it was pressed on: a lookup
 *    that now says "none" ends on "not requested" and never asks. A POST happens only
 *    for (a) a fresh scan's first request, (b) a restored FRESH scan's lookup-none, and
 *    (c) the explicit "Request live research" button, pressed after a lookup that said none.
 *  - IT KEEPS FOLLOWING THE JOB until the job's own status ends it. A transient
 *    failure of a READ (network error, a request that never finished, 429 / 5xx,
 *    "cannot verify sign-in right now") does not end the screen and is not silent:
 *    the loading screen says it is retrying and the same read is repeated after a
 *    visible wait (RESEARCH_RETRY_DELAYS_MS). After the last wait it shows the
 *    problem with "Check again" and still reads again by itself when the tab is
 *    shown again, the window gets focus or the network comes back -- those events
 *    also cut a poll's wait short. A wake never starts a second request while one is
 *    in flight and never sends a POST.
 *  - NO STALE OWNER. Everything is keyed to (owner, scan). A different owner, a
 *    sign-out, another scan or an unmount aborts the request in flight and a late
 *    answer is dropped; the previous owner's job is never drawn, not even for a
 *    frame.
 *  - REAL STATE ONLY. queued / running / succeeded / failed are the job's own
 *    status; times are the server's timestamps; "no update from the worker" is
 *    derived from the last worker signal and the lease. The API exposes NO
 *    percentage, so none exists here: nothing below invents progress, an
 *    estimate or a count of anything found. A job the server calls succeeded whose
 *    result this page will not draw is an integrity problem, never a blank.
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
  researchJobPath,
  researchLookupPath,
  researchWithCurrentToken,
  RESEARCH_POLL_MS,
  RESEARCH_RETRY_DELAYS_MS,
  type LiveResearchJob,
  type ResearchReply,
  type ResearchResultV2,
} from "./client";

type TokenOptions = { userId?: string; forceRefresh?: boolean };

export type ResearchState =
  | "idle" | "looking" | "starting" | "queued" | "running" | "succeeded" | "failed"
  | "disabled" | "unavailable" | "error" | "invalid" | "no-id" | "auth" | "busy" | "not-researchable" | "not-found";

/**
 * Which screen a state is:
 *   loading        the scan's job is being looked up or requested, or it is queued / running
 *   result         a completed job whose result passed the client's checks
 *   not-requested  a saved scan opened from History whose lookup found no job
 *   problem        everything else: failed / refused / unavailable / not saved / ...
 */
export type ResearchPhase = "loading" | "result" | "not-requested" | "problem";

export function researchPhase(state: ResearchState): ResearchPhase {
  if (state === "looking" || state === "starting" || state === "queued" || state === "running") return "loading";
  if (state === "succeeded") return "result";
  if (state === "idle") return "not-requested";
  return "problem";
}

type View = { key: string; state: ResearchState; job: LiveResearchJob | null; stalled: boolean; reconnecting: boolean };

/** The state a (owner, scan) starts in, before any request. "looking" and "starting" are the only states that send one. */
function startState(enabled: boolean, ownerId: string | null, scanId: string | null, lookFirst: boolean): ResearchState {
  if (!enabled) return "disabled";
  if (!ownerId) return "auth";
  if (!scanId || !isResearchId(scanId)) return "no-id";
  return lookFirst ? "looking" : "starting";
}

/**
 * What one API answer means:
 *   job     it carries a usable job
 *   none    404: no such job of this owner's (the same answer for someone else's, a missing one and a scan with no job)
 *   retry   a transient failure of a READ: asked again by the caller, visibly
 *   stop    anything else: this state replaces the job
 */
type Verdict = { kind: "job" } | { kind: "none" } | { kind: "retry"; state: ResearchState } | { kind: "stop"; state: ResearchState };

function classify({ response, json }: { response: Response; json: ResearchReply }, read: boolean): Verdict {
  if (response.status === 401 || json.status === "unauthorized") return { kind: "stop", state: "auth" };
  if (response.status === 404 || json.status === "not_found") return { kind: "none" };
  if (json.status === "research_disabled") return { kind: "stop", state: "disabled" };
  // Supabase Auth could not check the token this time (timeout, 429, 5xx): not a verdict on the person, so a read tries again.
  if (json.status === "auth_unavailable") return read ? { kind: "retry", state: "unavailable" } : { kind: "stop", state: "unavailable" };
  if (json.status === "research_unavailable") return { kind: "stop", state: "unavailable" };
  if (response.status === 429 || json.status === "research_busy") return read ? { kind: "retry", state: "busy" } : { kind: "stop", state: "busy" };
  if (response.status === 422 || json.status === "scan_not_researchable") return { kind: "stop", state: "not-researchable" };
  if (!response.ok || json.status !== "ok" || !json.job) return read ? { kind: "retry", state: "error" } : { kind: "stop", state: "error" };
  return { kind: "job" };
}

/** The states that still draw the job (its facts and times); every other state discards it. */
const SHOWS_JOB: ReadonlySet<ResearchState> = new Set(["queued", "running", "succeeded", "failed", "error", "invalid", "unavailable", "busy"]);

/** A wake (tab shown, window focused, network back) within this long of the last request is ignored: a burst of events is one read. */
const MIN_WAKE_GAP_MS = 1000;

export interface LiveResearchInput {
  scanId: string | null;
  ownerId: string | null;
  getAccessToken: (options?: TokenOptions) => Promise<string | null>;
  enabled?: boolean;
  /** A saved scan opened from History: never asks for research on its own; it reads the scan's job and waits for the button. */
  replay?: boolean;
  /** Read the scan's job (GET by owner + scan) before anything else. A replay always does; a scan restored after a reload does. */
  discover?: boolean;
  /**
   * With `discover`: when the read finds NO job, ask for research once. Only for the person's own fresh scan that a reload cut
   * off before its request got through. A History view, or a scan whose job was ever seen, never sets it.
   */
  askIfNone?: boolean;
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
  /** The last read failed in a transient way and is being repeated: said on screen, never silent. */
  reconnecting: boolean;
  /** True when a request could be made for this (owner, scan) at all. */
  canAsk: boolean;
  /** The one explicit press: request research for a scan that has none loaded, or look the job up again. */
  press: () => void;
  /** Put this on the status line: focus moves there when the pressed button disappears. */
  statusRef: RefObject<HTMLParagraphElement | null>;
}

export function useLiveResearch({ scanId, ownerId, getAccessToken, enabled = true, replay = false, discover = false, askIfNone = false, clock = Date.now }: LiveResearchInput): LiveResearch {
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  // The (owner, scan) whose lookup last said "no job": a button press then asks at once instead of reading again first.
  const lookedNone = useRef<string | null>(null);
  const lookFirst = replay || discover;
  const key = [enabled ? "on" : "off", ownerId ?? "", scanId ?? "", replay ? "replay" : "fresh", discover ? "discover" : "", askIfNone ? "ask" : ""].join("|");

  // Explicit presses (look up / check again), counted PER (owner, scan) so a press never leaks across them.
  const [action, setAction] = useState({ key, n: 0 });
  const presses = action.key === key ? action.n : 0;
  const base = startState(enabled, ownerId, scanId, lookFirst);

  const [view, setView] = useState<View>({ key, state: base, job: null, stalled: false, reconnecting: false });
  // Only the CURRENT (owner, scan)'s view is ever drawn: a view stamped with another key is simply not this scan's.
  const live: View = view.key === key ? view : { key, state: base, job: null, stalled: false, reconnecting: false };

  // The latest callbacks, so a parent that re-creates them cannot restart (re-request) a running flow.
  const latest = useRef({ getAccessToken, clock });
  useEffect(() => { latest.current = { getAccessToken, clock }; });

  useEffect(() => {
    noteResearchOwner(ownerId);
    if (!ownerId || !scanId || startState(enabled, ownerId, scanId, lookFirst) === "disabled" || !isResearchId(scanId)) return;
    const controller = new AbortController();
    const { signal } = controller;
    const owner = ownerId;
    const scan = scanId;
    // Asking (POST) after a lookup is allowed only for a fresh scan, and for a restored FRESH scan whose lookup found nothing. A press never
    // widens that: "Request live research" after a lookup that already said none asks directly (the `lookedNone` branch below); "Check again" reads only.
    const mayAsk = !lookFirst || askIfNone;

    const publish = (state: ResearchState, job: LiveResearchJob | null = null, reconnecting = false) => {
      if (signal.aborted) return;
      const shown = job && SHOWS_JOB.has(state) ? job : null;
      setView({ key, state, job: shown, stalled: shown ? isStalled(shown, latest.current.clock()) : false, reconnecting: reconnecting && !shown?.completed_at });
    };
    const send = (path: string, body?: unknown) => researchWithCurrentToken(path, latest.current.getAccessToken, signal, owner, body);

    // ---- waiting: a timer that a wake (tab shown, focus, network back) cuts short, and a park that only a wake ends ----
    let wake: (() => void) | null = null;
    let lastRequestAt = Number.NEGATIVE_INFINITY;
    const idle = (ms: number | null) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
      const finish = () => { if (timer !== null) clearTimeout(timer); signal.removeEventListener("abort", abort); wake = null; };
      const timer = ms === null ? null : setTimeout(() => { finish(); resolve(); }, ms);
      const abort = () => { finish(); reject(new DOMException("Aborted", "AbortError")); };
      signal.addEventListener("abort", abort, { once: true });
      wake = () => { finish(); resolve(); };
    });
    const onWake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (Date.now() - lastRequestAt < MIN_WAKE_GAP_MS) return;
      wake?.();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("pageshow", onWake);

    /**
     * One READ (a lookup or a poll), repeated after a visible wait when it fails in a transient way. It returns the answer to
     * act on, or null when this run is over (the page was left). Never a POST.
     */
    const read = async (path: string, job: LiveResearchJob | null): Promise<{ reply: { response: Response; json: ResearchReply }; verdict: Verdict } | null> => {
      let failures = 0;
      for (;;) {
        let verdict: Verdict;
        try {
          lastRequestAt = Date.now();
          const reply = await send(path);
          if (signal.aborted) return null;
          verdict = classify(reply, true);
          if (verdict.kind !== "retry") return { reply, verdict };
        } catch (error) {
          if (signal.aborted) return null;
          // A network error, a request that never finished, or no token right now (a returning session may not have one yet).
          verdict = { kind: "retry", state: error instanceof Error && error.message === "auth" ? "auth" : "error" };
        }
        if (verdict.kind !== "retry") return null;
        if (failures < RESEARCH_RETRY_DELAYS_MS.length) {
          publish(job ? job.status : lookFirst ? "looking" : "starting", job, true);
          await idle(RESEARCH_RETRY_DELAYS_MS[failures]);
          failures += 1;
        } else {
          // Out of automatic tries: say so ("Check again"), and read again by itself when the tab or the network comes back.
          publish(verdict.state, job);
          await idle(null);
          failures = 0;
          publish(job ? job.status : lookFirst ? "looking" : "starting", job, true);
        }
      }
    };

    const run = async () => {
      let job: LiveResearchJob | null = null;
      try {
        const knownId = knownResearchJob(owner, scan);
        // A job this page already knows is read by its id; otherwise a replay / restored scan reads the scan's job; a fresh scan asks.
        let first: { reply: { response: Response; json: ResearchReply }; verdict: Verdict } | null;
        const ask = async () => {
          const reply = await send("/api/scan/research", { scan_id: scan });
          return signal.aborted ? null : { reply, verdict: classify(reply, false) };
        };
        if (knownId) first = await read(researchJobPath(knownId), null);
        else if (lookFirst && presses > 0 && lookedNone.current === key) first = await ask();
        else if (lookFirst) first = await read(researchLookupPath(scan), null);
        else first = await ask();
        if (!first) return;
        if (first.verdict.kind === "none") {
          if (knownId) { forgetResearchJob(owner, scan); publish("not-found"); return; }
          if (!lookFirst) { forgetResearchJob(owner, scan); publish("not-found"); return; }
          // The scan has no job. Say so; ask here only when the person's own fresh scan was cut off before it got through (a press asks via the `lookedNone` branch above, never from here).
          lookedNone.current = key;
          if (!mayAsk) { publish("idle"); return; }
          first = await ask();
          if (!first) return;
          if (first.verdict.kind === "none") { publish("not-found"); return; }
        }
        if (first.verdict.kind === "stop") { publish(first.verdict.state); return; }
        if (first.verdict.kind !== "job") { publish("error"); return; }
        job = parseResearchJob(first.reply.json.job);
        if (!job || job.scan_id !== scan || (knownId !== null && job.id !== knownId)) { publish("error"); return; }
        rememberResearchJob(owner, scan, job.id);
        publish(job.status, job);
        while (job.status === "queued" || job.status === "running") {
          await idle(RESEARCH_POLL_MS);
          const polled = await read(researchJobPath(job.id), job);
          if (!polled) return;
          if (polled.verdict.kind === "none") { forgetResearchJob(owner, scan); publish("not-found", job); return; }
          if (polled.verdict.kind === "stop") { publish(polled.verdict.state, job); return; }
          if (polled.verdict.kind !== "job") { publish("error", job); return; }
          const next = parseResearchJob(polled.reply.json.job);
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
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [key, enabled, ownerId, scanId, lookFirst, askIfNone, presses]);

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
    setView({ ...live, state: "starting", reconnecting: false });
    setAction({ key, n: presses + 1 });
  };

  const { job, stalled, reconnecting } = live;
  const result = useMemo(() => (job?.status === "succeeded" ? parseResearchResult(job.result) : null), [job]);
  // A job the server calls succeeded whose result the client will not draw (a failed check) is NOT a result: say so.
  const state: ResearchState = live.state === "succeeded" && !result ? "invalid" : live.state;
  const canAsk = Boolean(enabled && ownerId && scanId && isResearchId(scanId));

  return { state, phase: researchPhase(state), job, result, stalled, reconnecting, canAsk, press, statusRef };
}
