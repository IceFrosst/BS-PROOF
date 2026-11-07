/*
 * SERVER-SIDE OWNERSHIP ACKNOWLEDGEMENT: `POST /api/scan/claim` calls into
 * this module to confirm that a scan run belongs to the signed-in user, and to
 * keep the `scan_users` email ledger current (originally 2026-09-16, founder:
 * "people log in once so we capture their email"). Since 2026-10-03 NOTHING IN
 * THE UI CALLS THAT ROUTE, so the ledger is not populated by the app and the
 * emails live in `scan_runs.user_email` (see docs/scan-history.sql).
 *
 * IT NO LONGER ASSIGNS OWNERSHIP, AND MUST NEVER AGAIN. Until the
 * authenticated-ownership change, this module PATCHed `scan_runs.user_id` for
 * whatever run id it was handed, so anyone holding a valid session and knowing
 * (or guessing) a run's UUID could take it -- including a run another person
 * had already claimed. A run's owner is now bound exactly once, at INSERT, by
 * `POST /api/scan` from the Supabase-verified caller (lib/scan-history/
 * store.ts, lib/auth/server-auth.ts). A row inserted without an owner (a
 * legacy row, or an anonymous local/test run) stays unowned forever: there is
 * deliberately NO code path that sets `user_id` on an existing row, so a
 * leaked run id is worth nothing.
 *
 * What it does instead is OWNER-FILTERED READ-ONLY verification:
 *
 *   - verify the bearer token with Supabase Auth (never trust a client id);
 *   - look the run up with BOTH `id = <run>` AND `user_id = <verified user>`
 *     in the query itself. A run owned by someone else, a run with no owner,
 *     and a run that does not exist are indistinguishable: all `not_found`;
 *   - only then refresh the `scan_users` ledger, IDEMPOTENTLY: `scans` is set
 *     to the exact number of runs this user owns (a count query), never
 *     read-then-incremented, so calling this ten times for one run -- or from
 *     two tabs at once -- cannot double count.
 *
 * SAME SHAPE AS lib/waitlist/store.ts / lib/scan-history/store.ts, on
 * purpose: server-only `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no
 * `NEXT_PUBLIC_` prefix), plain `fetch` against Supabase's Auth and PostgREST
 * REST APIs, no `@supabase/supabase-js`.
 *
 * NEVER THROWS past `claimScanRun`. Every failure mode -- unconfigured,
 * unauthenticated, unknown run, a Supabase outage -- becomes a reported
 * outcome; the route maps it to an HTTP status and a message that carries no
 * secret and no provider response.
 */
import { isUuid, readBoundedText, supabaseServerConfig, verifyAccessToken, type SupabaseServerConfig } from "@/lib/auth/server-auth";

const RUNS_TABLE = "scan_runs";
const USERS_TABLE = "scan_users";
const STORE_TIMEOUT_MS = 8_000;
const MAX_LOOKUP_BYTES = 8 * 1024;

export type ClaimStatus = "claimed" | "unauthorized" | "not_found" | "unavailable" | "failed";

export interface ClaimOutcome {
  status: ClaimStatus;
  detail?: string;
}

export function scanClaimConfigured(): boolean {
  return supabaseServerConfig() !== null;
}

function restHeaders(cfg: SupabaseServerConfig, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, ...extra };
}

/**
 * Exactly how many runs this user owns, from PostgREST's own count -- or null
 * when it cannot be determined. An idempotent source of truth for the ledger.
 */
async function countOwnedRuns(cfg: SupabaseServerConfig, userId: string, fetchFn: typeof fetch): Promise<number | null> {
  try {
    const res = await fetchFn(`${cfg.url}/rest/v1/${RUNS_TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`, {
      headers: restHeaders(cfg, { Prefer: "count=exact" }),
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    try {
      await res.body?.cancel();
    } catch {
      /* the header is all that is needed */
    }
    if (!res.ok) return null;
    const match = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "");
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort, IDEMPOTENT refresh of the `scan_users` ledger row. `scans` is
 * the exact owned-run count (never an increment), `first_seen_at` is left to
 * the column default and is never rewritten, and the email is only written
 * when Supabase actually reported one. A failure here never fails a claim.
 */
async function refreshScanUser(cfg: SupabaseServerConfig, user: { id: string; email: string | null }, fetchFn: typeof fetch): Promise<void> {
  const scans = await countOwnedRuns(cfg, user.id, fetchFn);
  const row: Record<string, unknown> = { user_id: user.id, last_seen_at: new Date().toISOString() };
  if (user.email) row.email = user.email;
  if (scans !== null) row.scans = scans;
  try {
    const res = await fetchFn(`${cfg.url}/rest/v1/${USERS_TABLE}?on_conflict=user_id`, {
      method: "POST",
      headers: restHeaders(cfg, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([row]),
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    try {
      await res.body?.cancel();
    } catch {
      /* nothing more to do */
    }
  } catch {
    // Never throw: a failed ledger write must not turn a verified run into an error.
  }
}

export interface ClaimInput {
  runId: string;
  accessToken: string;
  /** Require a Google identity (set by the route from SCAN_REQUIRE_AUTH). */
  requireGoogle?: boolean;
}

/**
 * Verifies the caller and confirms the run is ALREADY theirs. Returns
 * `claimed` only when a `scan_runs` row exists with this run id AND this
 * verified user id. It performs no write to `scan_runs` whatsoever.
 */
export async function claimScanRun(input: ClaimInput, fetchFn: typeof fetch = fetch): Promise<ClaimOutcome> {
  const cfg = supabaseServerConfig();
  if (!cfg) return { status: "unavailable", detail: "auth is not configured on this deployment" };

  // A non-UUID can never be an owned row; refuse it before building a query.
  if (!isUuid(input.runId)) return { status: "not_found" };

  const verified = await verifyAccessToken(input.accessToken, { requireGoogle: input.requireGoogle === true, fetchFn });
  if (!verified.ok) return { status: verified.failure === "unauthorized" ? "unauthorized" : "unavailable" };
  const user = verified.user;

  let rows: unknown;
  try {
    const res = await fetchFn(
      `${cfg.url}/rest/v1/${RUNS_TABLE}?id=eq.${encodeURIComponent(input.runId.toLowerCase())}&user_id=eq.${encodeURIComponent(user.id)}&select=id,user_id&limit=1`,
      { headers: restHeaders(cfg), signal: AbortSignal.timeout(STORE_TIMEOUT_MS) },
    );
    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* nothing more to do */
      }
      return { status: "failed", detail: `scan run store returned ${res.status}` };
    }
    const text = await readBoundedText(res, MAX_LOOKUP_BYTES);
    if (text === null) return { status: "failed", detail: "scan run store returned an unreadable answer" };
    rows = JSON.parse(text);
  } catch {
    return { status: "failed", detail: "could not read the scan run store" };
  }

  // Belt and braces: even though the query filtered, re-check the row that came
  // back is this run AND owned by the verified user before acknowledging it.
  const row = Array.isArray(rows) ? (rows[0] as { id?: unknown; user_id?: unknown } | undefined) : undefined;
  if (!row || typeof row.id !== "string" || row.id.toLowerCase() !== input.runId.toLowerCase()) return { status: "not_found" };
  if (typeof row.user_id !== "string" || row.user_id.toLowerCase() !== user.id) return { status: "not_found" };

  await refreshScanUser(cfg, user, fetchFn);
  return { status: "claimed" };
}
