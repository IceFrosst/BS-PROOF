"use client";

/*
 * The browser's two authorised, uncached reads of the signed-in person's saved scans, shared by the History tab
 * (components/history-tab.tsx) and the reload restore (lib/saved-scans/use-scan-resume.ts):
 *
 *   GET /api/scan/history/<uuid>   -> { status: "ok", run_id, analysis: <the saved ScanAnalysis> }
 *
 * `getJson` re-reads the token from the SDK for THIS request (and only if the live session still belongs to `owner`);
 * a 401 refreshes it once and retries once; a second one is "auth". Error text is deliberately a code: nothing from the
 * server's body, no token, no run id beyond what the person already sees. Moved here UNCHANGED from history-tab.tsx.
 */
import type { ScanAnalysis } from "@/lib/analyze/scan";
import type { AuthSession } from "@/lib/auth/use-supabase-session";

export type Failure = "auth" | "not_found" | "unavailable" | "failed";

export type GetResult = { ok: true; json: unknown } | { ok: false; failure: Failure };

/**
 * One authorised, uncached GET for `owner`. The token is re-read from the SDK
 * for this request (and only if the live session still belongs to `owner`); a
 * 401 refreshes it once and retries once.
 */
export async function getJson(url: string, owner: string, getAccessToken: AuthSession["getAccessToken"], signal: AbortSignal): Promise<GetResult> {
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

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The stored analysis, only if it is for the run that was asked for and carries what the renderer needs. */
export function parseSaved(json: unknown, runId: string): ScanAnalysis | null {
  if (!isObject(json) || json.status !== "ok" || typeof json.run_id !== "string") return null;
  if (json.run_id.toLowerCase() !== runId.toLowerCase()) return null;
  const analysis = json.analysis;
  if (!isObject(analysis) || typeof analysis.status !== "string" || !isObject(analysis.basis_legend)) return null;
  return analysis as unknown as ScanAnalysis;
}
