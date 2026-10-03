"use client";

/*
 * THE HISTORY TAB (2026-09-23): the signed-in person's last 20 scans, and a way
 * to open any of them again.
 *
 *   GET /api/scan/history          -> { status: "ok", runs: [{ id, created_at, source, status, product_name }], next_cursor: null }
 *   GET /api/scan/history/<uuid>   -> { status: "ok", run_id, analysis: <the saved ScanAnalysis> }
 *
 * Both carry `Authorization: Bearer <current access token>` and are `no-store`.
 * Opening a saved scan renders the stored analysis through the SAME <ScanFlow>
 * renderer the live Scan tab uses (its `initialResult` prop) -- the identical
 * Evidence Ledger card -- and makes no scan request and no model call. It is
 * dated "Saved scan from ..." so a replay is never read as current research.
 * Original photos are never requested: only the stored analysis comes back.
 *
 * SESSION SAFETY. Everything below `HistoryBody` is keyed by the signed-in
 * user's id, so signing out or switching Google accounts unmounts it: its
 * in-flight requests are aborted by effect cleanup, its list and any open scan
 * are dropped, and a late answer for the previous person has nowhere to land.
 * Each response is also checked against its own AbortSignal before it is
 * applied. A 401 gets one refresh-and-retry; a second one ends the session on
 * screen (the sign-in card comes back, saying why) instead of showing an error
 * the person cannot act on.
 *
 * Error text is deliberately generic: nothing from the server's body, no
 * token, no run id beyond what the person already sees.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { SignInCard } from "@/components/google-sign-in";
import { formatSavedAt, ScanFlow } from "@/components/scan-flow";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import type { ScanAnalysis } from "@/lib/analyze/scan";
import type { AuthSession } from "@/lib/auth/use-supabase-session";

export interface HistoryRun {
  id: string;
  created_at: string;
  source: string;
  status: string;
  product_name: string | null;
}

export interface ScanHistoryProps {
  catalog: CatalogIngredient[];
  /** The workspace's shared session -- one subscription for the whole page. */
  auth: AuthSession;
  /** Bumped by the workspace each time a new scan was actually stored; refetches the list. */
  refreshToken: number;
  /** The empty state's way back to the camera. */
  onGoToScan: () => void;
}

export const SESSION_ENDED_NOTICE = "Your session ended. Sign in again to continue.";

type Failure = "auth" | "not_found" | "unavailable" | "failed";

type GetResult = { ok: true; json: unknown } | { ok: false; failure: Failure };

/**
 * One authorised, uncached GET for `owner`. The token is re-read from the SDK
 * for this request (and only if the live session still belongs to `owner`); a
 * 401 refreshes it once and retries once.
 */
async function getJson(url: string, owner: string, getAccessToken: AuthSession["getAccessToken"], signal: AbortSignal): Promise<GetResult> {
  const send = (token: string) => fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
  try {
    const first = await getAccessToken({ userId: owner });
    if (!first) return { ok: false, failure: "auth" };
    let res = await send(first);
    if (res.status === 401) {
      const fresh = await getAccessToken({ userId: owner, forceRefresh: true });
      if (!fresh || fresh === first) return { ok: false, failure: "auth" };
      res = await send(fresh);
    }
    if (res.status === 401) return { ok: false, failure: "auth" };
    if (res.status === 404) return { ok: false, failure: "not_found" };
    if (res.status === 503) return { ok: false, failure: "unavailable" };
    if (!res.ok) return { ok: false, failure: "failed" };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, failure: "failed" };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRuns(json: unknown): HistoryRun[] | null {
  if (!isObject(json) || json.status !== "ok" || !Array.isArray(json.runs)) return null;
  const runs: HistoryRun[] = [];
  for (const item of json.runs) {
    if (!isObject(item) || typeof item.id !== "string" || typeof item.created_at !== "string") continue;
    runs.push({
      id: item.id,
      created_at: item.created_at,
      source: typeof item.source === "string" ? item.source : "photo",
      status: typeof item.status === "string" ? item.status : "ok",
      product_name: typeof item.product_name === "string" && item.product_name.trim() ? item.product_name : null,
    });
  }
  return runs;
}

/** The stored analysis, only if it is for the run that was asked for and carries what the renderer needs. */
function parseSaved(json: unknown, runId: string): ScanAnalysis | null {
  if (!isObject(json) || json.status !== "ok" || typeof json.run_id !== "string") return null;
  if (json.run_id.toLowerCase() !== runId.toLowerCase()) return null;
  const analysis = json.analysis;
  if (!isObject(analysis) || typeof analysis.status !== "string" || !isObject(analysis.basis_legend)) return null;
  return analysis as unknown as ScanAnalysis;
}

function words(value: string): string {
  return value.replace(/_/g, " ");
}

function runTitle(run: HistoryRun): string {
  return run.product_name ?? (run.source === "manual" ? "Typed supplement" : "Unnamed label");
}

const LIST_MESSAGES: Record<Exclude<Failure, "auth">, string> = {
  not_found: "Your history could not be found. Try again in a moment.",
  unavailable: "Scan history is unavailable right now. Try again in a moment.",
  failed: "Could not load your scans. Check your connection and try again.",
};

const DETAIL_MESSAGES: Record<Exclude<Failure, "auth">, string> = {
  not_found: "That saved scan was not found. It may no longer exist.",
  unavailable: "Saved scans are unavailable right now. Try again in a moment.",
  failed: "That saved scan could not be opened. Try again.",
};

/* ------------------------------------------------------------------ shell -- */

export function ScanHistory({ catalog, auth, refreshToken, onGoToScan }: ScanHistoryProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const gate: "unconfigured" | "checking" | "signin" | "open" = !auth.configured ? "unconfigured" : auth.loading ? "checking" : auth.userId ? "open" : "signin";
  const onSessionEnded = useCallback(() => setNotice(SESSION_ENDED_NOTICE), []);

  // Signing in again retires the "session ended" explanation.
  const [lastGate, setLastGate] = useState(gate);
  if (lastGate !== gate) {
    setLastGate(gate);
    if (gate === "open") setNotice(null);
  }

  if (gate === "open" && auth.userId) {
    return (
      <div className="sw-history" data-testid="history-panel">
        <HistoryBody
          key={auth.userId}
          catalog={catalog}
          auth={auth}
          owner={auth.userId}
          refreshToken={refreshToken}
          onGoToScan={onGoToScan}
          onSessionEnded={onSessionEnded}
        />
      </div>
    );
  }
  return (
    <div className="sw-history" data-testid="history-panel">
      <h1 className="sw-title">Your scans</h1>
      {gate === "unconfigured" ? (
        <div className="sw-note" data-testid="history-unconfigured">
          <strong>History is not available here.</strong>
          <span>Saved scans need Google sign-in, which is not set up on this deployment. Scanning still works without it.</span>
        </div>
      ) : gate === "checking" ? (
        <p className="sw-status" role="status">
          Checking your sign-in…
        </p>
      ) : (
        <SignInCard title="Sign in to see your history" body="Your saved scans belong to your Google account, so they only show once you are signed in." notice={notice} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- body -- */

type ListState = { key: string; status: "ready"; runs: HistoryRun[] } | { key: string; status: "error"; failure: Exclude<Failure, "auth"> };

function HistoryBody({
  catalog,
  auth,
  owner,
  refreshToken,
  onGoToScan,
  onSessionEnded,
}: {
  catalog: CatalogIngredient[];
  auth: AuthSession;
  owner: string;
  refreshToken: number;
  onGoToScan: () => void;
  onSessionEnded: () => void;
}) {
  const { getAccessToken, signOut } = auth;
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<ListState | null>(null);
  const [selected, setSelected] = useState<HistoryRun | null>(null);
  const restoreFocus = useRef<string | null>(null);
  const requestKey = `${refreshToken}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const result = await getJson("/api/scan/history", owner, getAccessToken, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        const runs = parseRuns(result.json);
        setList(runs ? { key: requestKey, status: "ready", runs } : { key: requestKey, status: "error", failure: "failed" });
      } else if (result.failure === "auth") {
        onSessionEnded();
        void signOut();
      } else {
        setList({ key: requestKey, status: "error", failure: result.failure });
      }
    })();
    return () => controller.abort();
  }, [owner, requestKey, getAccessToken, signOut, onSessionEnded]);

  // Back from a saved scan: put focus on the row that opened it.
  useEffect(() => {
    if (selected || !restoreFocus.current) return;
    const id = restoreFocus.current;
    restoreFocus.current = null;
    Array.from(document.querySelectorAll<HTMLElement>("[data-run-id]"))
      .find((row) => row.dataset.runId === id)
      ?.focus();
  }, [selected, list]);

  if (selected) {
    return (
      <>
        <h1 className="sw-title sw-sr-only">Saved scan</h1>
        <SavedScan
          key={selected.id}
          catalog={catalog}
          auth={auth}
          owner={owner}
          run={selected}
          onBack={() => {
            restoreFocus.current = selected.id;
            setSelected(null);
          }}
          onSessionEnded={onSessionEnded}
        />
      </>
    );
  }

  const loading = list === null || list.key !== requestKey;
  const ready = list?.status === "ready" ? list : null;

  return (
    <>
      <h1 className="sw-title">Your scans</h1>
      <p className="sw-account">
        Signed in as <strong>{auth.email ?? "your Google account"}</strong>
        <button type="button" className="sc-signout" onClick={() => void signOut()}>
          Sign out
        </button>
      </p>
      {ready ? (
        ready.runs.length === 0 ? (
          <div className="sw-note" data-testid="history-empty">
            <strong>No saved scans yet.</strong>
            <span>Scan a label or search a supplement while signed in and the result is saved here.</span>
            <button type="button" className="button button-dark sw-go" onClick={onGoToScan}>
              Go to Scan
            </button>
          </div>
        ) : (
          <>
            <p className="sw-lede">Your latest {ready.runs.length === 1 ? "scan" : `${ready.runs.length} scans`}. Opening one shows the saved result; nothing is re-run.</p>
            <ul className="sw-runs" aria-busy={loading} data-testid="history-list">
              {ready.runs.map((run) => {
                const savedAt = formatSavedAt(run.created_at);
                return (
                  <li key={run.id}>
                    <button type="button" className="sw-run" data-run-id={run.id} onClick={() => setSelected(run)}>
                      <span className="sw-run-name">{runTitle(run)}</span>
                      <span className="sw-run-meta">
                        <span>{run.source === "manual" ? "Typed search" : "Photo scan"}</span>
                        {run.status !== "ok" ? <span className="sw-run-status">{words(run.status)}</span> : null}
                        <span>
                          Saved <time dateTime={run.created_at}>{savedAt ?? run.created_at}</time>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )
      ) : loading ? (
        <div className="sw-loading" role="status" aria-live="polite" data-testid="history-loading">
          <p>Loading your scans…</p>
          <ul aria-hidden="true">
            <li />
            <li />
            <li />
          </ul>
        </div>
      ) : list && list.status === "error" ? (
        <div className="sw-error" role="alert" data-testid="history-error">
          <strong>Could not load your history.</strong>
          <span>{LIST_MESSAGES[list.failure]}</span>
          <button type="button" className="button button-outline sw-retry" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- saved scan -- */

type DetailState = { key: number; status: "ready"; analysis: ScanAnalysis } | { key: number; status: "error"; failure: Exclude<Failure, "auth"> };

function SavedScan({
  catalog,
  auth,
  owner,
  run,
  onBack,
  onSessionEnded,
}: {
  catalog: CatalogIngredient[];
  auth: AuthSession;
  owner: string;
  run: HistoryRun;
  onBack: () => void;
  onSessionEnded: () => void;
}) {
  const { getAccessToken, signOut } = auth;
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const headingId = useId();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const result = await getJson(`/api/scan/history/${encodeURIComponent(run.id)}`, owner, getAccessToken, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        const analysis = parseSaved(result.json, run.id);
        setDetail(analysis ? { key: attempt, status: "ready", analysis } : { key: attempt, status: "error", failure: "failed" });
      } else if (result.failure === "auth") {
        onSessionEnded();
        void signOut();
      } else {
        setDetail({ key: attempt, status: "error", failure: result.failure });
      }
    })();
    return () => controller.abort();
  }, [owner, run.id, attempt, getAccessToken, signOut, onSessionEnded]);

  if (detail?.status === "ready" && detail.key === attempt) {
    return (
      <ScanFlow
        catalog={catalog}
        auth={auth}
        initialResult={{ runId: run.id, savedAt: run.created_at, analysis: detail.analysis }}
        onLeave={onBack}
      />
    );
  }

  const failed = detail?.status === "error" && detail.key === attempt ? detail : null;
  return (
    <div className="sw-detail" aria-labelledby={headingId}>
      <button type="button" className="sw-back" onClick={onBack}>
        Back to history
      </button>
      {failed ? (
        <div className="sw-error" role="alert" data-testid="history-detail-error">
          <strong id={headingId}>Could not open that scan.</strong>
          <span>{DETAIL_MESSAGES[failed.failure]}</span>
          {failed.failure !== "not_found" ? (
            <button type="button" className="button button-outline sw-retry" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <p id={headingId} className="sw-status" role="status" data-testid="history-detail-loading">
          Opening your saved scan…
        </p>
      )}
    </div>
  );
}
