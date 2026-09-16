/*
 * SERVER-SIDE EMAIL CAPTURE: `POST /api/scan/claim` calls into this module to
 * attach a signed-in Supabase user to a scan run the moment they sign in
 * (2026-09-16, founder: "people log in once so we capture their email").
 *
 * SAME SHAPE AS lib/waitlist/store.ts / lib/scan-history/store.ts, on
 * purpose: server-only `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no
 * `NEXT_PUBLIC_` prefix), plain `fetch` against Supabase's Auth and
 * PostgREST REST APIs, no `@supabase/supabase-js` — the browser client
 * (`lib/auth/supabase-browser.ts`) is a different module for a different
 * job (holding a session), and importing the SDK here would pull it into a
 * route that only ever needs three HTTP calls.
 *
 * The caller (the browser) proves who it is with its Supabase ACCESS TOKEN,
 * never a service-role key. This module verifies that token itself, by
 * asking Supabase Auth directly (`GET {url}/auth/v1/user` with the service
 * role key as `apikey` and the caller's token as the bearer) rather than
 * trusting a client-supplied user id/email — exactly the "never trust the
 * client" discipline the rest of this app already keeps.
 *
 * NEVER THROWS past `claimScanRun`. Every failure mode — unconfigured,
 * unauthenticated, unknown run, a Supabase outage — becomes a reported
 * outcome; the route maps it to an HTTP status and a message that carries no
 * secret.
 */

const RUNS_TABLE = "scan_runs";
const USERS_TABLE = "scan_users";

interface Config {
  url: string;
  serviceKey: string;
}

function config(): Config | null {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, serviceKey: key };
}

export function scanClaimConfigured(): boolean {
  return config() !== null;
}

export interface VerifiedUser {
  id: string;
  email: string | null;
}

/**
 * Verifies a Supabase access token by asking Supabase Auth for the user it
 * belongs to. Returns null on ANY problem (expired, malformed, revoked,
 * network failure, non-2xx) — the caller reads that as 401, never as a
 * distinct error class, because a bad/expired token and a token for a
 * deleted user should look identical to the outside.
 */
export async function verifySupabaseUser(cfg: Config, accessToken: string, fetchFn: typeof fetch = fetch): Promise<VerifiedUser | null> {
  if (!accessToken.trim()) return null;
  try {
    const res = await fetchFn(`${cfg.url}/auth/v1/user`, {
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown; email?: unknown };
    if (typeof body.id !== "string" || !body.id) return null;
    return { id: body.id, email: typeof body.email === "string" ? body.email : null };
  } catch {
    return null;
  }
}

export type ClaimStatus = "claimed" | "unauthorized" | "not_found" | "unavailable" | "failed";

export interface ClaimOutcome {
  status: ClaimStatus;
  detail?: string;
}

/**
 * Best-effort upsert into `scan_users`, incrementing `scans`. Not perfectly
 * race-free under concurrent claims for the same user (a read-then-write, not
 * an atomic increment — PostgREST has no arithmetic UPDATE without an RPC,
 * and this module deliberately stays on plain fetch like its siblings); a
 * lost increment under a rare simultaneous double sign-in costs an
 * undercounted `scans` on one row, never a wrong `user_id`/`email` and never
 * a thrown error. Never throws.
 */
async function upsertScanUser(cfg: Config, user: VerifiedUser, fetchFn: typeof fetch): Promise<void> {
  const now = new Date().toISOString();
  let scans = 0;
  let firstSeenAt = now;
  try {
    const existing = await fetchFn(
      `${cfg.url}/rest/v1/${USERS_TABLE}?user_id=eq.${encodeURIComponent(user.id)}&select=scans,first_seen_at`,
      {
        headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (existing.ok) {
      const rows = (await existing.json()) as Array<{ scans?: number; first_seen_at?: string }>;
      if (Array.isArray(rows) && rows[0]) {
        scans = Number(rows[0].scans) || 0;
        firstSeenAt = rows[0].first_seen_at ?? now;
      }
    }
  } catch {
    // Best effort: fall back to treating this as a first sighting rather
    // than blocking the claim on a read failure.
  }

  try {
    await fetchFn(`${cfg.url}/rest/v1/${USERS_TABLE}?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([
        {
          user_id: user.id,
          email: user.email,
          first_seen_at: firstSeenAt,
          last_seen_at: now,
          scans: scans + 1,
        },
      ]),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Never throw: a failed user-ledger write must not turn a successful
    // run claim into an error response.
  }
}

export interface ClaimInput {
  runId: string;
  accessToken: string;
}

/**
 * Attaches the verified user to one scan run: PATCHes `scan_runs.user_id` /
 * `user_email` for that id (service role, bypassing RLS), then best-effort
 * upserts `scan_users`. `not_found` when the PATCH matches zero rows —
 * PostgREST returns 200 with an empty array rather than 404 for that, which
 * this function translates.
 */
export async function claimScanRun(input: ClaimInput, fetchFn: typeof fetch = fetch): Promise<ClaimOutcome> {
  const cfg = config();
  if (!cfg) {
    return { status: "unavailable", detail: "scan claim is not configured on this deployment: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" };
  }

  const user = await verifySupabaseUser(cfg, input.accessToken, fetchFn);
  if (!user) return { status: "unauthorized" };

  let patchRes: Response;
  try {
    patchRes = await fetchFn(`${cfg.url}/rest/v1/${RUNS_TABLE}?id=eq.${encodeURIComponent(input.runId)}`, {
      method: "PATCH",
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ user_id: user.id, user_email: user.email }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { status: "failed", detail: `could not reach the scan run store: ${String(err)}` };
  }

  if (!patchRes.ok) {
    let body = "";
    try {
      body = (await patchRes.text()).slice(0, 300);
    } catch {
      /* status line is enough */
    }
    return { status: "failed", detail: `scan run store returned ${patchRes.status}: ${body}` };
  }

  let rows: unknown;
  try {
    rows = await patchRes.json();
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows) || rows.length === 0) return { status: "not_found" };

  await upsertScanUser(cfg, user, fetchFn);
  return { status: "claimed" };
}
