"use client";

/*
 * PUT THE SCAN BACK AFTER A RELOAD (used once, by components/scan-workspace.tsx).
 *
 * Reloading /scan used to throw the Scan tab away: the scan on screen, its research
 * job id (in memory) and the poll with it. The tab kept a pointer (lib/scan-research/resume.ts: owner
 * + scan id + intent, nothing else) and this hook turns it back into the screen:
 *
 *   1. wait for the sign-in session to be READ again (`auth.loading`). Nothing is
 *      decided, requested or deleted while that is still going on.
 *   2. the session belongs to the pointer's owner  ->  read the saved scan with the
 *      existing, owner-filtered GET /api/scan/history/<scan>. No scan, no model.
 *      Signed out, another account, no sign-in configured, or a value that is not a
 *      pointer  ->  the normal Scan screen, and the pointer is deleted.
 *   3. the scan is on screen again, drawn by the same <ScanFlow> a History scan uses
 *      (`restored`): that screen READS the scan's research job (read-only, owner
 *      filtered) and follows it to its end -- queued, running, then the completed card
 *      by itself -- and asks for research only in the one case `intent: "fresh"` says
 *      (see lib/scan-research/resume.ts). It never rescans and never starts a second job.
 *
 * ONE decision per page load. After it, a sign-out or another account clears the
 * pointer and drops the restored screen on the spot (the previous person's scan is
 * never shown to the next one, not for a frame); a late answer for them has nowhere to
 * land because the request is aborted with the effect. The server stays the authority:
 * the pointer is only a hint, and a hinted scan that is not the signed-in person's is
 * the same 404 as one that does not exist.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ScanAnalysis } from "@/lib/analyze/scan";
import type { AuthSession } from "@/lib/auth/use-supabase-session";
import { clearResumeCheckpoint, readResumeCheckpoint, type ResumeCheckpoint, type ResumeIntent } from "@/lib/scan-research/resume";
import { getJson, parseSaved } from "./client";

export type ScanResume =
  /** The page has only just mounted: the pointer has not been looked at yet (the camera waits). */
  | { phase: "pending" }
  /** Nothing to restore: the normal Scan screen. */
  | { phase: "none" }
  /** A pointer for the signed-in person: the session or the saved scan is being read. */
  | { phase: "restoring" }
  | { phase: "ready"; scanId: string; intent: ResumeIntent; analysis: ScanAnalysis; leave: () => void }
  /** The scan could not be read right now (it is still in History). */
  | { phase: "failed"; retry: () => void; startNew: () => void };

type Fetched = { scan: string; attempt: number; outcome: { kind: "ready"; analysis: ScanAnalysis } | { kind: "failed" } | { kind: "gone" } };

export function useScanResume(auth: Pick<AuthSession, "configured" | "loading" | "userId" | "getAccessToken" | "signOut">): ScanResume {
  const { configured, loading, userId, getAccessToken, signOut } = auth;
  // undefined: not read yet; null: nothing stored; else the pointer AS IT WAS WHEN THIS PAGE LOADED.
  const [peek, setPeek] = useState<ResumeCheckpoint | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const last = useRef<string | null>(null);

  // Read the pointer once, after mount (never during render: the server render has no storage).
  useEffect(() => {
    let off = false;
    void Promise.resolve().then(() => {
      if (!off) setPeek(readResumeCheckpoint());
    });
    return () => { off = true; };
  }, []);

  const owner = userId ? userId.toLowerCase() : null;
  const mine = Boolean(peek && owner && peek.owner === owner);

  // Signing out, expiry or another account: the pointer goes (whatever its value), the restored screen with it.
  useEffect(() => {
    const before = last.current;
    last.current = owner;
    if (before && before !== owner) clearResumeCheckpoint();
  }, [owner]);
  // A page load that finds the session read and NOT this pointer's owner (signed out, another account, no sign-in here): delete it.
  useEffect(() => {
    if (peek && !loading && (!configured || !mine)) clearResumeCheckpoint();
  }, [peek, loading, configured, mine]);

  // The one read: the saved scan, with the owner's own token.
  const scan = peek?.scan ?? null;
  useEffect(() => {
    if (!configured || loading || !scan || !owner || !mine || dismissed) return;
    const controller = new AbortController();
    void (async () => {
      const result = await getJson(`/api/scan/history/${encodeURIComponent(scan)}`, owner, getAccessToken, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        const analysis = parseSaved(result.json, scan);
        setFetched({ scan, attempt, outcome: analysis ? { kind: "ready", analysis } : { kind: "failed" } });
      } else if (result.failure === "not_found") {
        // Uniform 404: lost, edited, another account's or deleted. Nothing to restore; the pointer is useless now.
        clearResumeCheckpoint();
        setFetched({ scan, attempt, outcome: { kind: "gone" } });
      } else if (result.failure === "auth") {
        void signOut(); // the session ended: the sign-in card comes back, the pointer goes with the owner change
      } else {
        setFetched({ scan, attempt, outcome: { kind: "failed" } });
      }
    })();
    return () => controller.abort();
  }, [configured, loading, scan, owner, mine, dismissed, attempt, getAccessToken, signOut]);

  const leave = useCallback(() => {
    clearResumeCheckpoint();
    setDismissed(true);
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!configured) return { phase: "none" };
  if (peek === undefined) return { phase: "pending" };
  if (peek === null || dismissed) return { phase: "none" };
  if (loading) return { phase: "restoring" }; // the session is being read: the pointer is untouched
  if (!mine) return { phase: "none" };
  const answer = fetched && fetched.scan === peek.scan && fetched.attempt === attempt ? fetched.outcome : null;
  if (!answer) return { phase: "restoring" };
  if (answer.kind === "gone") return { phase: "none" };
  if (answer.kind === "failed") return { phase: "failed", retry, startNew: leave };
  return { phase: "ready", scanId: peek.scan, intent: peek.intent, analysis: answer.analysis, leave };
}
