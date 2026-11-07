"use client";

/*
 * THE SCAN. Photograph a label with a LIVE camera viewfinder -- or upload a
 * photo, or search for the supplement by name -- and get LIVE RESEARCH on it.
 *
 * LIVE-ONLY (2026-10-05, founder: "only live research results, with a progress
 * bar on a loading screen between the label read and the results"). The page is
 * a state machine and each state OWNS the viewport:
 *
 *   landing -> staged -> label analysis (loading) -> saved scan
 *           -> LIVE RESEARCH loading screen (progress bar) -> live audit | problem
 *
 *   - landing: search pill, live viewfinder (<ScanCamera>, the page's H1 is
 *     its overlay), shutter, upload link.
 *   - staged: the photo and "Scan this label" / Retake / Choose another.
 *   - label analysis: a progress panel (dimmed thumbnail, a static list of what
 *     this step covers, indeterminate bar). /api/scan answers once at the end.
 *   - saved scan: the label was read and the run was stored for THIS signed-in
 *     owner. Only then is research requested (lib/scan-research/use-live-research.ts),
 *     and the screen is <ScanResearchScreen>'s loading phase: a top-level
 *     loading screen with an INDETERMINATE bar (the API reports a status and
 *     server timestamps, never a percentage: no fake %, ETA or count) and the
 *     read-label facts beside it. The hook is called HERE, at this component's
 *     top level, so the poll lives as long as the scan screen and is never
 *     unmounted by a change of what is drawn.
 *   - live audit: the completed research and ONLY that -- EXPERIMENTAL and
 *     UNGRADED, drawn without a score, bar, arc or verdict. No retained or cached
 *     audit, no "no evidence run" card, no model recall and no company profile is
 *     drawn as evidence beside it or instead of it.
 *   - problem: failed / refused / unavailable / not saved / not eligible /
 *     signed out each say what happened, that nothing was substituted, and what
 *     to do (check again, scan again, back). Never a blank or a hang.
 *
 * Camera and search sheet are unchanged from the 2026-09-16 camera-first
 * redesign: <ScanCamera> runs whenever nothing is staged, no result is shown
 * and the Scan tab is the visible one; the `capture="environment"` and plain
 * file inputs stay mounted at all times as the fallback path.
 *
 * SIGN-IN IS THE GATE WHERE IT IS CONFIGURED (2026-09-23, founder: real results
 * depend on a Google login). With NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY /
 * _GOOGLE_CLIENT_ID all set:
 *   - nobody signed in: a photo can still be staged, but "Scan this label" and
 *     the search form are replaced by a Google sign-in card and NO request is
 *     sent; while a returning session is still being read a neutral "checking"
 *     line shows -- never the card and never an unlocked screen;
 *   - signed in: every `/api/scan` request carries `Authorization: Bearer
 *     <current access token>`, the server binds the run to that user, and the
 *     result says whether it was actually stored to History. The research
 *     requests and polls carry the same owner's token (one refresh on a 401);
 *   - sign-out / expiry / another Google account: the in-flight scan AND the
 *     research request/poll are aborted, a late answer is discarded, and the held
 *     result is removed -- the next person is never shown the previous person's
 *     scan or research.
 * With any of the three missing the flow has no header and no gate, so local and
 * CI runs need no Google project (live research is then reported as off, never
 * replaced by anything). The UI gate is a convenience; the server
 * (SCAN_REQUIRE_AUTH=1) is what actually refuses an unauthenticated request.
 *
 * REPLAY. `initialResult` renders a scan from the History tab through this very
 * component with no scan request at all, dated "Saved scan from ...". Opening a
 * saved scan NEVER requests research by itself: it READS the scan's research job
 * (read-only GET by owner + scan) -- a job that exists is shown and followed to its
 * end, automatically, the loading screen replaced by the finished card -- and when
 * there is none it says "Live research not requested" and waits for a deliberate
 * button (the server is idempotent per scan, so asking again never starts a second
 * job).
 *
 * RELOAD. A reload used to throw the Scan tab away. This component keeps an opaque
 * pointer for it in the tab's sessionStorage (lib/scan-research/resume.ts: owner id,
 * scan id, intent -- never a token, photo, analysis or result) and
 * components/scan-workspace.tsx puts the scan back through the same replay path
 * (`restored`): the saved scan is read again, its job is READ and followed. Only the
 * person's own fresh scan whose request the reload cut off (`intent: "fresh"`, no job
 * on the server) may ask for research, once. "Scan another" and sign-out clear the
 * pointer; a scan merely opened from History never writes one.
 *
 * Rules this component keeps, all from CLAUDE.md:
 *
 * 1. TYPED IS NOT READ. A manual entry renders under "What you entered" with
 *    the `user_input` badge; it never shows a read confidence, quoted spans or a
 *    vision model, because none exist. The server says which path ran
 *    (`source`) and the UI keys off that, not off which button was pressed.
 * 2. NEVER ASSUME THE REGIMEN. A label or entry with no servings per day says
 *    "not stated (not assumed)": no default of one serving, and no elemental /
 *    compound / EPA basis is inferred. Doses are shown exactly as recorded.
 * 3. Sign-in gates the REQUEST, never the arithmetic: where sign-in is
 *    required a result simply does not exist until the server produced it for
 *    a signed-in owner. No score is computed, hidden or revealed client-side.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { SignInCard } from "@/components/google-sign-in";
import { ScanCamera } from "@/components/scan-camera";
import { ScanResearchScreen } from "@/components/scan-research-panel";
import { SearchSheet } from "@/components/search-sheet";
import { shrinkForUpload } from "@/lib/camera/capture";
import { SupplementSearch } from "@/components/supplement-search";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import type { ManualScanInput, ScanAnalysis } from "@/lib/analyze/scan";
import { useSupabaseSession, type AuthSession } from "@/lib/auth/use-supabase-session";
import { FLOW_COPY } from "@/lib/i18n/copy/flow";
import { RESULT_COPY, enumWord } from "@/lib/i18n/copy/result";
import { useLang, type Lang } from "@/lib/i18n/locale";
import { TranslationProvider, TranslationStatus, useHasTranslationProvider, useTr, type TranslateHeaders } from "@/lib/i18n/translate-client";
import { clearResumeCheckpoint, noteFreshScan, noteJobKnown, type ResumeIntent } from "@/lib/scan-research/resume";
import { useLiveResearch } from "@/lib/scan-research/use-live-research";

type Basis = keyof ScanAnalysis["basis_legend"];
type NullableNumber = number | null;

const MAX_BYTES = 12 * 1024 * 1024;

/* What the loading view lists for a run: a STATIC "this check covers" list
 * (Ignas PR3 merge): /api/scan answers once at the end and streams no
 * progress, so there is no timer, no "done" tick and no determinate bar.
 * Held as a KIND so a language switch while a scan runs rewords it; the words
 * live in lib/i18n/copy/flow.ts. */
type StageKind = "photo" | "manual";

/* Language + the two dictionaries + the model translator for the CURRENT render.
 * `tr` is identity in English; in Lithuanian it returns a fixed/translated
 * rendering when it has one and the ORIGINAL text otherwise (and queues it). */
function useLocalized() {
  const { lang, toggleLang } = useLang();
  const tr = useTr();
  return { lang, toggleLang, f: FLOW_COPY[lang], r: RESULT_COPY[lang], tr };
}

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";

function words(value: string): string {
  return value.replace(/_/g, " ");
}

/** A recorded mass exactly as recorded: no rounding and no unit change (0.05 mg stays "0.05 mg"). */
function exactMg(value: NullableNumber): string {
  return value === null || value === undefined ? "—" : `${value} mg`;
}

function BasisBadge({ kind, legend }: { kind: Basis; legend: ScanAnalysis["basis_legend"] }) {
  const { lang, r } = useLocalized();
  // English shows the legend the server stored; Lithuanian the same six badges, keyed.
  const entry = lang === "en" || !r.basis[kind] ? legend[kind] : r.basis[kind];
  return (
    <span className={`scan-badge scan-badge-${kind}`} title={entry.means}>
      {entry.label}
    </span>
  );
}

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="sc-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A scan that was saved to the signed-in person's history and is being shown again. */
export interface SavedScanResult {
  runId: string;
  /** ISO time the run was saved (the history list's `created_at`), when known. */
  savedAt: string | null;
  analysis: ScanAnalysis;
}

export interface ScanFlowProps {
  catalog: CatalogIngredient[];
  /** True inside <ScanWorkspace>, which draws the one top bar for both tabs. */
  hideTopbar?: boolean;
  /**
   * The workspace's shared session. Omit it when <ScanFlow> is rendered on its
   * own and it reads the session itself.
   */
  auth?: AuthSession;
  /**
   * False while the Scan tab is hidden behind History: the camera stops and a
   * finished result does not pull focus. Default true.
   */
  active?: boolean;
  /**
   * A saved scan to show INSTEAD of the capture flow -- the History tab's replay.
   * The same renderer draws it and NO request is made. Read once at mount; give
   * <ScanFlow> a new `key` to show another. Must be mounted by someone who is
   * signed in as the owner (it is hidden the moment the signed-in person changes).
   */
  initialResult?: SavedScanResult;
  /**
   * With `initialResult`: this saved scan is the one the Scan tab was showing before the page was reloaded
   * (components/scan-workspace.tsx), not one opened from History. It reads the scan's research job and follows it
   * to its end; `intent: "fresh"` additionally lets it ask for research ONCE if the server has no job for it (the
   * person's own new scan whose request the reload cut off). The back control is "Scan another" and it clears the
   * reload checkpoint.
   */
  restored?: { intent: ResumeIntent };
  /** Replay / restore only: what the back control does (it replaces "Scan another"). */
  onLeave?: () => void;
  /** A new scan finished AND the server reports it stored, so History is now out of date. */
  onScanStored?: (info: { runId: string }) => void;
}

/*
 * An error is held as a CODE (plus the few values it quotes), never as English
 * text, so switching language rewords an error that is already on screen.
 * `server` carries a message the server or a model wrote: it is original text
 * and is translated (or left original) by `tr` at render.
 */
type ScanError =
  | { code: "too_large"; mb: string }
  | { code: "not_set_up" }
  | { code: "signin_unavailable" }
  | { code: "request_failed"; status: number }
  | { code: "analysis_could_not_run" }
  | { code: "unreachable"; detail: string }
  | { code: "refusal"; which: "scan_history_required_failed" | "scan_history_required_unavailable" | "payload_too_large" }
  | { code: "server"; text: string };

type AuthNotice = "session_ended" | "cleared" | "stopped";

/** What one request left behind, stamped with whose it is. */
interface Outcome {
  owner: string | null;
  data: ScanAnalysis | null;
  error: ScanError | null;
}

/** The stand-in owner on a deployment with no sign-in configured. */
const LOCAL_OWNER = "local";

/**
 * Responses from `POST /api/scan` that are refusals, not analyses, and the
 * words a person sees for each. `scan_history_required_*` only exist when the
 * deployment turns durable history on (SCAN_HISTORY_REQUIRED=1): the first means
 * the scan ran but could not be recorded, the second that it was refused before
 * any model call because history storage is not configured. Neither is the
 * person's fault, and neither says which setting to fix. `payload_too_large`
 * (HTTP 413) is the typed-entry size wall; its server text only describes a
 * typed entry, which is wrong advice for a photo, so it is replaced too.
 */
const SERVER_REFUSALS: Record<string, ScanError> = {
  scan_history_required_failed: { code: "refusal", which: "scan_history_required_failed" },
  scan_history_required_unavailable: { code: "refusal", which: "scan_history_required_unavailable" },
  payload_too_large: { code: "refusal", which: "payload_too_large" },
};

/** "3 Mar 2026, 14:05" in the person's own locale; null when the value is not a date. */
export function formatSavedAt(iso: string | null | undefined, lang: Lang = "en"): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // English keeps the visitor's own locale (as before); Lithuanian formats the
  // same instant with Lithuanian month names. Same moment, same time zone.
  return date.toLocaleString(lang === "lt" ? "lt-LT" : undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ScanFlow(props: ScanFlowProps) {
  // Display translation needs the session's bearer token (same gate as a scan).
  // Normally <ScanWorkspace> already provides it; a bare <ScanFlow> brings its own.
  const provided = useHasTranslationProvider();
  const ownAuth = useSupabaseSession({ skip: Boolean(props.auth) || provided });
  if (provided) return <ScanFlowInner {...props} />;
  return <StandaloneScanFlow {...props} auth={props.auth ?? ownAuth} />;
}

function StandaloneScanFlow(props: ScanFlowProps & { auth: AuthSession }) {
  const { auth } = props;
  const { configured, getAccessToken, userId } = auth;
  const headers = useCallback<TranslateHeaders>(async (options): Promise<Record<string, string> | null> => {
    if (!configured) return {};
    const token = await getAccessToken({ userId, forceRefresh: options?.forceRefresh });
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, [configured, getAccessToken, userId]);
  return (
    <TranslationProvider getHeaders={headers} ownerKey={userId}>
      <ScanFlowInner {...props} />
    </TranslationProvider>
  );
}

function ScanFlowInner({ catalog, hideTopbar = false, auth: sharedAuth, active = true, initialResult, restored, onLeave, onScanStored }: ScanFlowProps) {
  const { lang, toggleLang, f, r, tr } = useLocalized();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stageKind, setStageKind] = useState<StageKind>("photo");
  const stages = stageKind === "photo" ? f.photoStages : f.manualStages;
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [authNoticeKey, setAuthNotice] = useState<AuthNotice | null>(null);
  const authNotice = authNoticeKey === "session_ended" ? f.sessionEnded : authNoticeKey === "cleared" ? f.signedOutCleared : authNoticeKey === "stopped" ? f.signedOutStopped : null;

  const ownAuth = useSupabaseSession({ skip: Boolean(sharedAuth) });
  const auth = sharedAuth ?? ownAuth;
  const { getAccessToken, signOut } = auth;
  const authConfigured = auth.configured;
  const replay = initialResult !== undefined;
  // A saved scan put back by a reload: shown like a replay, but it is the Scan tab's own scan (see `restored` above).
  const restoring = replay && restored !== undefined;

  // WHOSE SCREEN IS THIS. Everything a request returns is stamped with the
  // owner it was made for, and only the CURRENT owner's outcome is ever drawn.
  // `ownerKey` is null while a returning session is still being read and once
  // nobody is signed in; on a deployment with no sign-in it is one fixed owner.
  // Deriving visibility from the stamp (rather than clearing in an effect) means
  // there is no render, however brief, in which the previous person's result is
  // on screen for the next one.
  const ownerKey: string | null = !auth.configured ? LOCAL_OWNER : auth.loading ? null : auth.userId;
  const gate: "open" | "checking" | "signin" = !auth.configured ? "open" : auth.loading ? "checking" : auth.userId ? "open" : "signin";

  const [outcome, setOutcome] = useState<Outcome | null>(() => (initialResult ? { owner: ownerKey, data: initialResult.analysis, error: null } : null));
  const [pending, setPending] = useState<{ id: number; owner: string | null } | null>(null);
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestSeq = useRef(0);
  const onScanStoredRef = useRef(onScanStored);
  const activeRef = useRef(active);
  const resultTopRef = useRef<HTMLElement | null>(null);
  const setResultTop = useCallback((node: HTMLElement | null) => {
    resultTopRef.current = node;
  }, []);
  const [heroImage, setHeroImage] = useState<"idle" | "loaded" | "error">("idle");

  // Sign-out or an account switch REVOKES what the previous person had here --
  // their result, their request in flight, and the photo that was being scanned
  // or shown -- rather than merely hiding it, and says why when they signed out.
  // A photo that was only staged (never sent) is kept: it is still the visitor's
  // own, and sign-in is exactly what unblocks it. (Adjusting state while
  // rendering is React's supported way to reset state when an input changes.)
  const leftOutcome = outcome !== null && outcome.owner !== ownerKey;
  const leftRequest = pending !== null && pending.owner !== ownerKey;
  if (leftOutcome || leftRequest) {
    setOutcome(null);
    setPending(null);
    setFile(null);
    setHeroImage("idle");
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (ownerKey === null && !auth.loading) {
      const had = leftOutcome && (outcome?.data || outcome?.error) && outcome.owner !== LOCAL_OWNER;
      if (had) setAuthNotice((n) => n ?? "cleared");
      else if (leftRequest) setAuthNotice((n) => n ?? "stopped");
    }
  }

  // A notice explains why the sign-in card is showing; entering the open gate
  // (a successful sign-in) retires it. Not "while open": the session-ended
  // notice is set a beat BEFORE the gate closes.
  const [lastGate, setLastGate] = useState(gate);
  if (lastGate !== gate) {
    setLastGate(gate);
    if (gate === "open") setAuthNotice(null);
  }

  const data = outcome && outcome.owner === ownerKey ? outcome.data : null;
  const error = outcome && outcome.owner === ownerKey ? outcome.error : null;
  const busy = pending !== null && pending.owner === ownerKey;

  useEffect(() => {
    onScanStoredRef.current = onScanStored;
    activeRef.current = active;
  });

  const cancelRequest = useCallback(() => {
    const running = requestRef.current;
    requestRef.current = null;
    running?.controller.abort();
  }, []);

  // A request belongs to the person who started it: when the signed-in person
  // changes (sign-out, expiry, another Google account) or the page unmounts,
  // abort it. Its late answer is also discarded by the `isCurrent()` checks.
  useEffect(() => cancelRequest, [ownerKey, cancelRequest]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // The result is its own state: the instant an answer (or an error) lands,
  // scroll its header into view and move focus there, so the change of state
  // is unmistakable on a phone. Reduced-motion users get an instant jump. A
  // result that lands while the Scan tab is hidden does not pull focus.
  const finished = !busy && (data !== null || error !== null);
  useEffect(() => {
    if (!finished || !activeRef.current) return;
    const el = resultTopRef.current;
    if (!el || typeof window === "undefined") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [finished, data, error]);

  const stageFile = useCallback(
    (picked: File) => {
      if (picked.size > MAX_BYTES) {
        setOutcome({ owner: ownerKey, data: null, error: { code: "too_large", mb: (picked.size / 1e6).toFixed(1) } });
        return;
      }
      setOutcome(null);
      setHeroImage("idle");
      setFile(picked);
      setSearchOpen(false);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(picked);
      });
    },
    [ownerKey],
  );

  const pick = useCallback(
    (files: FileList | null) => {
      const picked = files?.[0];
      if (picked) stageFile(picked);
    },
    [stageFile],
  );

  const clearFile = useCallback(() => {
    setFile(null);
    setHeroImage("idle");
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, []);

  // "Scan another": back to the landing state. Clearing the staged file is
  // what restarts the viewfinder.
  const reset = useCallback(() => {
    clearResumeCheckpoint(); // the scan the person leaves is no longer "the scan to put back after a reload"
    setOutcome(null);
    clearFile();
  }, [clearFile]);

  /*
   * ONE scan request, for the photo and the typed path alike.
   *
   *  - It never starts unless the gate is open: where sign-in is configured a
   *    live Supabase session must exist first, and the request carries that
   *    session's CURRENT access token (re-read now, not the render-time
   *    snapshot, so an hourly refresh is picked up).
   *  - If the API answers 401 the token is refreshed once and the request is
   *    retried once (the server rejects before any model work, so this costs
   *    nothing); a second 401 ends the session on screen instead of looping.
   *  - Whatever comes back is applied only if this is still the live request
   *    for the same owner.
   */
  const runScan = useCallback(
    async (kind: StageKind, send: (headers: Record<string, string>, signal: AbortSignal) => Promise<Response>) => {
      if (replay || busy || gate !== "open" || ownerKey === null) return;
      const owner = ownerKey;
      cancelRequest();
      const id = ++requestSeq.current;
      const controller = new AbortController();
      requestRef.current = { id, controller };
      const isCurrent = () => requestRef.current?.id === id;
      setOutcome(null);
      setAuthNotice(null);
      setStageKind(kind);
      setPending({ id, owner });

      const endSession = () => {
        // Stop "scanning" first so the sign-out that follows reads as an expiry
        // (the photo stays staged), not as a request abandoned mid-flight.
        setPending(null);
        setAuthNotice("session_ended");
        void signOut();
      };
      const authorize = async (forceRefresh: boolean): Promise<Record<string, string> | null> => {
        if (!authConfigured) return {};
        const token = await getAccessToken({ userId: owner, forceRefresh });
        return token ? { Authorization: `Bearer ${token}` } : null;
      };

      try {
        const headers = await authorize(false);
        if (!isCurrent()) return;
        if (!headers) {
          endSession();
          return;
        }
        let res = await send(headers, controller.signal);
        if (!isCurrent()) return;
        if (res.status === 401 && authConfigured) {
          const retryHeaders = await authorize(true);
          if (!isCurrent()) return;
          if (!retryHeaders || retryHeaders.Authorization === headers.Authorization) {
            endSession();
            return;
          }
          res = await send(retryHeaders, controller.signal);
          if (!isCurrent()) return;
          if (res.status === 401) {
            endSession();
            return;
          }
        }
        const json = (await res.json()) as ScanAnalysis & { error?: string };
        if (!isCurrent()) return;
        if (json.status === "unauthorized" || res.status === 401) {
          setOutcome({ owner, data: null, error: { code: "not_set_up" } });
          return;
        }
        if (json.status === "auth_unavailable") {
          setOutcome({ owner, data: null, error: { code: "signin_unavailable" } });
          return;
        }
        if (!res.ok && !json.status) {
          setOutcome({ owner, data: null, error: json.error ? { code: "server", text: json.error } : { code: "request_failed", status: res.status } });
          return;
        }
        // The server's own refusals that carry no analysis. Each one gets WORDS
        // and an action (a blank "Result" card with a "!" is a bug); the
        // history ones use fixed text because the server's detail names
        // deployment settings a visitor can do nothing about.
        const refusal = Object.prototype.hasOwnProperty.call(SERVER_REFUSALS, json.status) ? SERVER_REFUSALS[json.status] : undefined;
        if (refusal) {
          setOutcome({ owner, data: json, error: refusal });
          return;
        }
        const failed =
          json.status === "label_unreadable" ||
          json.status === "analyzer_failed" ||
          json.status === "bad_request" ||
          json.status === "manual_input_invalid";
        setOutcome({ owner, data: json, error: failed ? (json.error ? { code: "server", text: json.error } : { code: "analysis_could_not_run" }) : null });
        if (json.persistence?.status === "stored" && json.run_id) onScanStoredRef.current?.({ runId: json.run_id });
      } catch (err) {
        if (!isCurrent()) return;
        setOutcome({ owner, data: null, error: { code: "unreachable", detail: String(err) } });
      } finally {
        if (requestRef.current?.id === id) requestRef.current = null;
        setPending((p) => (p?.id === id ? null : p));
      }
    },
    [replay, busy, gate, ownerKey, authConfigured, getAccessToken, signOut, cancelRequest],
  );

  const submitPhoto = useCallback(async () => {
    if (!file) return;
    const picked = file;
    // Shrunk once even if the request is retried after a token refresh.
    let shrunk: Promise<File> | null = null;
    await runScan("photo", async (headers, signal) => {
      const body = new FormData();
      shrunk ??= shrinkForUpload(picked);
      body.append("image", await shrunk);
      return fetch("/api/scan", { method: "POST", headers, body, signal });
    });
  }, [file, runScan]);

  const submitManual = useCallback(
    async (input: ManualScanInput) => {
      if (replay || busy || gate !== "open") return;
      clearFile();
      setSearchOpen(false);
      await runScan("manual", (headers, signal) =>
        fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ source: "manual", ...input }),
          signal,
        }),
      );
    },
    [replay, busy, gate, runScan, clearFile],
  );

  const legend = data?.basis_legend;
  const label = data?.label;
  const entry = data?.input;
  const typed = data?.source === "manual";

  const showingResult = finished;
  const leave = restoring
    ? () => { clearResumeCheckpoint(); onLeave?.(); }
    : replay ? (onLeave ?? (() => undefined)) : reset;
  const leaveLabel = replay && !restoring ? f.backToHistory : f.scanAnother;
  const savedAtLabel = replay ? formatSavedAt(initialResult?.savedAt ?? initialResult?.analysis.analyzed_at, lang) : null;
  // Say only what the server reported. A signed-in scan is "saved" only when
  // the run row was actually stored; a failure is shown as one, not hidden.
  const persistenceStatus = data?.persistence?.status;
  const persistenceNote =
    !authConfigured || !persistenceStatus
      ? null
      : persistenceStatus === "stored"
        ? f.savedToHistory
        : persistenceStatus === "unavailable"
          ? f.historyUnavailableNotSaved
          : f.historySaveFailed;
  const staged = Boolean(file && preview);
  const labResult = Boolean(data && !error && legend);

  // LIVE RESEARCH. Shown for every scan that is a supplement read (or typed); the server decides
  // eligibility (a scan with no supplement identity is answered 422 and drawn as "not eligible").
  // Research is asked for ONLY with a run id the server reported as stored for this
  // signed-in owner (a fresh scan), or the saved scan's own id (a History replay);
  // an unsaved scan has no id, so it asks for nothing and says so.
  const researchShown = labResult && data?.status !== "analyzer_unavailable" && data?.status !== "not_a_supplement_label";
  const researchScanId = !researchShown ? null : replay ? initialResult?.runId ?? null : data?.persistence?.status === "stored" ? data.run_id ?? null : null;
  // A History scan only READS its job (and waits for the button); a restored scan reads it too, and a restored FRESH scan may ask once.
  const askIfNone = restored?.intent === "fresh";
  const research = useLiveResearch({ scanId: researchScanId, ownerId: auth.userId, getAccessToken, enabled: auth.configured, replay: replay && !askIfNone, discover: replay, askIfNone });
  const waiting = researchShown && research.phase === "loading";

  // THE RELOAD CHECKPOINT (lib/scan-research/resume.ts): an opaque pointer -- owner, scan id, intent -- so a page reload can
  // put this scan and its research back. Written for the person's own scan once the server says it is stored, upgraded when
  // its job is known to exist; a scan merely opened from History never writes one.
  const checkpointOwner = auth.configured ? auth.userId : null;
  const tracksResume = !replay || restoring;
  useEffect(() => {
    if (tracksResume && !restoring && checkpointOwner && researchScanId) noteFreshScan(checkpointOwner, researchScanId);
  }, [tracksResume, restoring, checkpointOwner, researchScanId]);
  const knownJobId = research.job?.id ?? null;
  useEffect(() => {
    if (tracksResume && checkpointOwner && researchScanId && knownJobId) noteJobKnown(checkpointOwner, researchScanId);
  }, [tracksResume, checkpointOwner, researchScanId, knownJobId]);

  // Between "waiting" and anything else the screen changes: move focus and scroll to the
  // new state -- but only when this tab is the visible one and the person has not already
  // moved to another control, so a late answer never steals focus from what they are doing.
  const settledPhase = researchShown ? research.phase : null;
  const lastPhase = useRef(settledPhase);
  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = settledPhase;
    // "Not requested" is not news: a saved scan whose lookup found no job is already described by its dated note.
    if (before !== "loading" || settledPhase === null || settledPhase === "loading" || settledPhase === "not-requested" || !activeRef.current) return;
    const status = research.statusRef.current;
    if (!status || typeof window === "undefined") return;
    const here = document.activeElement;
    if (here && here !== document.body && !status.closest(".sc-result-wrap")?.contains(here)) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const card = status.closest(".sc-research");
    if (card && typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    status.focus({ preventScroll: true });
  }, [settledPhase, research.statusRef]);

  // The scanned-product header: what was scanned or typed, and what happened.
  const headerKicker = error
    ? f.kickerCouldNot
    : typed
      ? f.kickerEntered
      : label
        ? f.kickerLabel
        : data?.status === "analyzer_unavailable" || data?.status === "not_a_supplement_label"
          ? f.kickerDidNotFinish
          : f.kickerResult;
  const headerName = error
    ? f.nameDidNotFinish
    : typed && entry
      ? entry.form_label
      : label
        ? label.product_name ?? label.ingredient_label_text ?? label.ingredient_vocab_id ?? f.nameUnnamed
        : data?.status === "not_a_supplement_label"
          ? f.nameNotSupplement
          : data?.status === "analyzer_unavailable"
            ? f.namePhotoCouldNot
            : data?.ingredient_label_text ?? f.nameResult;

  // The facts the research will be given, as the scan recorded them: exact numbers (0.05 mg
  // stays 0.05 mg), the unit as printed, and an unknown form / dose / daily regimen said
  // out loud -- never a default serving, and no elemental / compound basis is inferred.
  const servingsText = (n: NullableNumber | undefined) => (n === null || n === undefined ? f.servingsNotStated : f.servingsPerDay(n));
  const labelDose = label ? (label.printed_elemental_dose_mg != null ? r.elementalPerServing(exactMg(label.printed_elemental_dose_mg)) : label.compound_dose_mg != null ? r.compoundPerServing(exactMg(label.compound_dose_mg)) : `${r.dosePerServing}: ${r.doseNotStated}`) : null;
  const summaryParts: string[] = typed && entry
    ? [entry.dose_per_serving ? r.compoundPerServing(`${entry.dose_per_serving.value} ${entry.dose_per_serving.unit}`) : r.noDoseEntered, servingsText(entry.servings_per_day)]
    : label && labelDose
      ? [label.form_vocab_id ? words(label.form_vocab_id) : r.formNotStated, labelDose, servingsText(label.servings_per_day)]
      : [];
  const labelBlock = !researchShown || !legend ? null : typed && entry ? (
    <details className="scan-lab-disclosure sc-read-facts" open data-testid="read-facts">
      <summary><h3>{r.whatYouEntered}</h3><BasisBadge kind="user_input" legend={legend} /></summary>
      <p className="la-dim"><b>{entry.ingredient_label}</b>, {entry.form_label}. {summaryParts.join(", ")}. {r.typedNotRead}</p>
      <Facts rows={[[r.ingredient, entry.ingredient_label], [r.form, entry.form_label], [r.dosePerServing, entry.dose_per_serving ? `${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} ${r.compoundSuffix}` : r.noDoseEntered], [r.servingsPerDayLabel, entry.servings_per_day !== null ? String(entry.servings_per_day) : f.servingsValueNotStated]]} />
    </details>
  ) : label ? (
    <details className="scan-lab-disclosure sc-read-facts" open data-testid="read-facts">
      <summary><h3>{r.labelDetails}</h3><BasisBadge kind="label" legend={legend} /></summary>
      <p className="la-dim"><b>{label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"}</b>, {summaryParts.join(", ")}.</p>
      <Facts rows={[
        [r.ingredient, label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"],
        [r.form, label.form_vocab_id ? words(label.form_vocab_id) : r.notStated],
        [r.dosePerServing, label.printed_elemental_dose_mg != null ? r.elementalPerServing(exactMg(label.printed_elemental_dose_mg)) : label.compound_dose_mg != null ? r.compoundPerServing(exactMg(label.compound_dose_mg)) : r.doseNotStated],
        ...(label.dose_unit_as_printed ? [[r.unitAsPrinted, label.dose_unit_as_printed]] as Array<[string, React.ReactNode]> : []),
        [r.servingsPerDayLabel, label.servings_per_day !== null ? String(label.servings_per_day) : f.servingsValueNotStated],
        [r.readConfidence, enumWord(lang, label.confidence)],
        [r.sourceLabel, <BasisBadge key="label-source" kind="label" legend={legend} />],
      ]} />
      {label.evidence_spans?.length ? <p className="la-spans">{r.readFrom} {label.evidence_spans.map((span) => `“${span}”`).join(", ")}</p> : null}
    </details>
  ) : null;
  const thumb = preview
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="sc-thumb sc-thumb-dim" src={preview} alt="" />
    : <span className="sc-thumb sc-thumb-typed" aria-hidden="true">Aa</span>;
  // The scan itself was not saved, so there is nothing to research: scanning the same photo again is the retry.
  const rescan = () => {
    setOutcome(null);
    setHeroImage("idle");
  };

  const errorText = (e: ScanError): string => {
    switch (e.code) {
      case "too_large": return f.imageTooLarge(e.mb);
      case "not_set_up": return f.notSetUpToSignIn;
      case "signin_unavailable": return f.signInUnavailable;
      case "request_failed": return f.requestFailed(e.status);
      case "analysis_could_not_run": return f.analysisCouldNotRun;
      case "unreachable": return f.couldNotReach(e.detail);
      case "refusal": return e.which === "scan_history_required_failed" ? f.refusalHistoryFailed : e.which === "scan_history_required_unavailable" ? f.refusalHistoryUnavailable : f.refusalTooLarge;
      default: return tr(e.text);
    }
  };

  return (
    <section className="la scan sc" aria-label={replay ? f.savedScanRegion : f.scanRegion}>
      {/* Page top bar (2026-10-03, Ignas PR3): the product's own scan mark, the
          language switch, and -- only once signed in -- the account initial.
          Replaces the shared site header on this page (hidden in globals.css).
          This is THE language switch while the Scan tab shows; the workspace
          shows its own only on History, so exactly one is ever visible. */}
      {!replay && !hideTopbar ? (
        <div className="sc-topbar">
          <span className="sc-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sc-lockup" src="/bsproof-lockup.svg" alt="BS-PROOF" width={130} height={26} />
          </span>
          <span className="sc-topbar-end">
            <button type="button" className="sc-lang" onClick={toggleLang} aria-label={f.switchTo} lang={lang === "en" ? "lt" : "en"} data-testid="lang-toggle">
              {f.switchShort}
            </button>
            {auth.configured && auth.email ? (
              <>
                <span className="sc-avatar" title={auth.email} aria-label={`${f.signedInAs} ${auth.email}`}>
                  {auth.email.charAt(0).toUpperCase()}
                </span>
                {/* Sign-out stays reachable from the landing, not only from a
                    result or the History tab. */}
                <button type="button" className="sc-signout" onClick={() => void signOut()}>
                  {f.signOut}
                </button>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {/* Two inputs, one difference: `capture` hands off to the platform
          camera. Kept mounted at all times -- this is the fallback path
          that must remain when getUserMedia is unavailable/denied/an
          insecure context, so nothing regresses. */}
      {!replay ? (
        <>
          <input type="file" accept="image/*" capture="environment" className="la-input" id="scan-capture" aria-label={f.captureInputLabel} disabled={busy} onChange={(e) => pick(e.target.files)} />
          <input type="file" accept={ACCEPTED_TYPES} className="la-input" id="scan-file" aria-label={f.fileInputLabel} disabled={busy} onChange={(e) => pick(e.target.files)} />
        </>
      ) : null}

      {!replay && !showingResult ? (
        <div
          className={`sc-capture${dragging ? " is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) pick(e.dataTransfer.files);
          }}
        >
          {busy ? (
            /* ---------------- loading ---------------- */
            <div className="sc-progress" role="status" aria-live="polite" aria-busy="true">
              <div className="sc-progress-head">
                {preview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="sc-thumb sc-thumb-dim" src={preview} alt="" />
                ) : (
                  <span className="sc-thumb sc-thumb-typed" aria-hidden="true">
                    Aa
                  </span>
                )}
                <div>
                  <p className="sc-progress-title">{f.loadingTitle}</p>
                  <p className="sc-progress-sub">{f.loadingSub}</p>
                </div>
              </div>
              <div className="sc-progress-bar" aria-hidden="true">
                <span />
              </div>
              <p className="sc-progress-covers">{f.loadingCovers}</p>
              <ol className="sc-stages">
                {stages.map((s) => (
                  <li key={s}>
                    <span className="sc-stage-mark" aria-hidden="true" />
                    <span className="la-stage">{s}</span>
                  </li>
                ))}
              </ol>
              <p className="sc-progress-sub" data-testid="loading-next">{f.loadingNext}</p>
            </div>
          ) : staged ? (
            /* ---------------- staged ---------------- */
            <div className="sc-staged">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="la-preview sc-preview" src={preview ?? undefined} alt={f.stagedAlt} />
              {gate === "open" ? (
                <button type="button" className="button button-dark sc-primary la-analyze" onClick={() => void submitPhoto()}>
                  {f.scanThis}
                </button>
              ) : gate === "checking" ? (
                <p className="sc-check" role="status">
                  {f.checkingSignIn}
                </p>
              ) : (
                <SignInCard title={f.signInScanTitle} body={f.signInScanBody} notice={authNotice} />
              )}
              <div className="sc-secondary-row">
                <button type="button" className="button button-outline sc-secondary" onClick={clearFile}>
                  {f.retake}
                </button>
                <label className="button button-outline sc-secondary" htmlFor="scan-file">
                  {f.chooseOther}
                </label>
              </div>
            </div>
          ) : (
            /* ---------------- landing ---------------- */
            <>
              <div className="sc-intro">
                <h1 id="scan-title" className="sc-headline" lang={lang}>{f.headline}</h1>
                <p className="sc-subline" lang={lang}>{f.subline}</p>
              </div>
              <ScanCamera
                active={!file}
                disabled={busy}
                onCapture={stageFile}
                onUnavailable={() => setCameraUnavailable(true)}
                labels={f.camera}
                leading={
                  <label className="sc-icon-btn" htmlFor="scan-file" aria-label={f.uploadLabel}>
                    <span className="sc-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" /></svg>
                    </span>
                    {f.upload}
                  </label>
                }
                trailing={
                  <button type="button" className="sc-icon-btn sc-search-cta" onClick={() => setSearchOpen(true)} aria-label={f.searchLabel}>
                    <span className="sc-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
                    </span>
                    {f.search}
                    {lang === "en" ? <span className="sr-only"> your supplement</span> : null}
                  </button>
                }
                fallback={
                  cameraUnavailable ? (
                    <label className="button button-dark sc-fallback-photo" htmlFor="scan-capture">
                      {f.takePhoto}
                    </label>
                  ) : null
                }
              />
              {/* Inside the workspace the top bar has no room for sign-out; it
                  stays reachable on the landing, just under the camera. */}
              {hideTopbar && auth.configured && auth.email ? (
                <p className="sc-signed-in-line sc-landing-account">
                  {f.signedInAs} <strong>{auth.email}</strong>
                  <button type="button" className="sc-signout" onClick={() => void signOut()}>
                    {f.signOut}
                  </button>
                </p>
              ) : null}
              {gate === "signin" ? (
                <div className="sc-below-block">
                  <span className="sc-hint sc-signin-hint" data-testid="signin-hint">
                    {f.signInHint}
                  </span>
                  {authNotice ? (
                    <p className="sc-signin-notice" role="status" data-testid="signin-notice">
                      {authNotice}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {!replay ? (
        <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} titleId="scan-search-title" title={f.searchTitle} closeLabel={f.searchClose}>
          {gate === "open" ? (
            <>
              <p className="sc-search-lede">{f.searchLede}</p>
              <SupplementSearch catalog={catalog} busy={busy} onSubmit={(input) => void submitManual(input)} />
            </>
          ) : gate === "checking" ? (
            <p className="sc-check" role="status">
              {f.checkingSignIn}
            </p>
          ) : (
            <SignInCard title={f.signInSearchTitle} body={f.signInSearchBody} notice={authNotice} />
          )}
        </SearchSheet>
      ) : null}

      {showingResult ? (
        <div className={`sc-result-wrap${labResult ? " scan-success" : ""}`}>
          {replay ? (
            <p className="sc-replay-note" ref={setResultTop} tabIndex={-1} data-testid="replay-note">
              {savedAtLabel ? (
                <>
                  {f.savedScanFrom} <time dateTime={initialResult?.savedAt ?? undefined}>{savedAtLabel}</time>.
                </>
              ) : (
                <>{f.savedScan}</>
              )}{" "}
              {restoring ? f.restoredExplain : f.replayExplain}
            </p>
          ) : null}
          {!labResult ? <div className="sc-scanned" ref={replay ? undefined : setResultTop} tabIndex={-1}><span className="sc-thumb sc-thumb-typed" aria-hidden="true">!</span><div className="sc-scanned-main"><p className="sc-scanned-kicker">{headerKicker}</p><h2 className="sc-scanned-name">{headerName}</h2></div><button type="button" className="sc-again" onClick={leave}>{leaveLabel}</button></div> : null}
          {error ? (
            <div className="la-alert la-alert-bad sc-error" role="alert">
              <strong>{f.couldNotScan}</strong>
              <span>{errorText(error)}</span>
            </div>
          ) : null}
          {/* A server error sentence can be machine-translated too (see errorText); a result carries its own status line below. */}
          {error ? <TranslationStatus /> : null}
          {/* THE LIVE-ONLY RESULT. One screen at a time, by the live research phase:
              loading (the label was read and the scan is saved: a top-level loading
              screen with an indeterminate progress bar), the completed live audit,
              "not requested" (History), or an actionable problem. No retained or cached
              audit, no "no evidence run" card, no model recall and no company profile is
              drawn here: the live research is the only evidence a scan shows. */}
          {labResult && data && legend ? (<div className="scan-lab-result" data-scan-stage={researchShown ? research.phase : "label"}>
            <header className="ab-top scan-lab-top sc-scanned" ref={replay ? undefined : setResultTop} tabIndex={-1}>
              <button type="button" className="ab-back" aria-label={leaveLabel} onClick={leave}>‹</button>
              <div className="ab-title"><strong>{headerName}</strong><small>{typed ? f.subtitleTyped : `${f.subtitleLabel}${label?.brand ? ` · ${label.brand}` : ""}`}</small></div>
            </header>
            {!waiting ? (
              <div className="ab-photo-hero scan-lab-hero">
                {preview && !typed && heroImage !== "error" ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className={`scan-lab-photo${heroImage === "loaded" ? " is-loaded" : ""}`} src={preview} alt={f.labelAlt} onLoad={(event) => setHeroImage(event.currentTarget.naturalWidth > 0 ? "loaded" : "error")} onError={() => setHeroImage("error")} />
                ) : (
                  <div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{(headerName || "product").split(" ").slice(0, 3).join(" ")}</strong><i>{typed ? f.typedProductEntry : f.photoPreviewUnavailable}</i><div>{f.heroFormLabel} <b>{entry?.form_label ?? "—"}</b></div></div>
                )}
              </div>
            ) : null}

            {/* A result is only ever drawn for the person it belongs to (see
                `ownerKey`): sign-out or an account switch removes it from
                state, so there is nothing to blur, lock or re-reveal. */}
            <div className="la-result scan-result">
              {auth.configured && auth.email ? (
                <p className="sc-signed-in-line">
                  {f.signedInAs} <strong>{auth.email}</strong>
                  <button type="button" className="sc-signout" onClick={() => void signOut()}>
                    {f.signOut}
                  </button>
                </p>
              ) : null}
              {persistenceNote && !replay ? (
                <p className="sc-save-status" role="status" data-testid="save-status" data-persistence={data.persistence?.status}>
                  {persistenceNote}
                </p>
              ) : null}

              {data.status === "analyzer_unavailable" ? (
                <div className="la-empty">
                  <strong>{r.analyzerNotConfigured}</strong>
                  <span>{r.analyzerNeedsKey}</span>
                </div>
              ) : null}

              {data.status === "not_a_supplement_label" ? (
                <div className="la-empty">
                  <strong>{r.notSupplementTitle}</strong>
                  <span>{r.notSupplementBody}</span>
                </div>
              ) : null}

              {researchShown ? (
                waiting ? (
                  <>
                    <ScanResearchScreen research={research} lang={lang} head={thumb} />
                    {labelBlock}
                  </>
                ) : (
                  <>
                    {labelBlock}
                    <ScanResearchScreen research={research} lang={lang} onRescan={!replay && !typed && file ? rescan : undefined} />
                  </>
                )
              ) : null}

              <details className="sc-details sc-technical">
                <summary>{r.technicalTitle}</summary>
                {data.meta ? (
                  <Facts
                    rows={[
                      [r.techSource, typed ? r.techTyped : r.techPhoto],
                      [r.techTook, `${data.meta.timing_s} s`],
                      ...(typed ? [] : ([[r.techVision, data.meta.models.vision ?? "—"]] as Array<[string, React.ReactNode]>)),
                      ...(data.run_id ? ([[r.techRunId, <code key="r">{data.run_id}</code>]] as Array<[string, React.ReactNode]>) : []),
                      ...(data.app_version
                        ? ([
                            [
                              r.techAppVersion,
                              <code key="v">
                                {data.app_version.package_version}
                                {data.app_version.git_sha ? ` ${data.app_version.git_sha.slice(0, 8)}` : ""}
                              </code>,
                            ],
                          ] as Array<[string, React.ReactNode]>)
                        : []),
                      ...(data.persistence ? ([[r.techRunStored, r.persistenceStatus[data.persistence.status] ?? words(data.persistence.status)]] as Array<[string, React.ReactNode]>) : []),
                    ]}
                  />
                ) : null}
              </details>
            </div>
          </div>) : null}

          <button type="button" className="button button-dark sc-primary sc-again-bottom" onClick={leave}>
            {leaveLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
