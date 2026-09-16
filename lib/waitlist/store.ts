/*
 * The waitlist's one piece of I/O: an insert into Supabase.
 *
 * SERVER ONLY. The key used here is the SERVICE ROLE key, which bypasses row
 * level security — it must never reach a browser. That is why it is read from
 * `SUPABASE_SERVICE_ROLE_KEY` with no `NEXT_PUBLIC_` prefix (Next.js only
 * exposes variables carrying that prefix to client bundles), and why this
 * module is imported solely by the route handler.
 *
 * No @supabase/supabase-js HERE. Supabase's data API is PostgREST over plain
 * HTTP, and an insert is one fetch — a client library earns its place only
 * when a job needs auth, realtime or storage, and an INSERT does not.
 * `@supabase/supabase-js` WAS added to the dependency list on 2026-09-16, but
 * only for `lib/auth/supabase-browser.ts`, which needs it for real: a
 * browser-side Google Identity Services credential becoming a persisted,
 * auto-refreshing Supabase session (`signInWithIdToken`) is not one fetch.
 * This module and `lib/scan-history/store.ts` stay on plain fetch because
 * their job has not changed shape.
 *
 * CLAUDE.md said "Supabase is deliberately unused. Do not attach the unrelated
 * existing project." That line was about the evidence dashboard, which must
 * keep rendering from immutable artifacts with no database in the read path —
 * and it still does. The founder asked for a waitlist on 2026-08-25; this adds
 * a database on a WRITE path that no scoring or rendering code touches.
 */

const TABLE = "waitlist";

export type WaitlistOutcome =
  | { status: "joined" }
  | { status: "already_joined" }
  | { status: "unavailable"; detail: string }
  | { status: "failed"; detail: string };

export interface WaitlistEntry {
  email: string;
  /** Where the person came from, e.g. "qr" for the stand's roll-up banner. */
  source: string | null;
}

interface Config {
  url: string;
  key: string;
}

/**
 * Configured, or null. Returning null rather than throwing is what lets the
 * site build and deploy before the database exists: the route answers
 * `waitlist_unavailable` and every other page is unaffected, exactly as the
 * label analyzer behaves without a vision key.
 */
function config(): Config | null {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, key };
}

export function waitlistConfigured(): boolean {
  return config() !== null;
}

/** Postgres' unique-violation code. A second signup is not an error. */
const UNIQUE_VIOLATION = "23505";

export async function addToWaitlist(entry: WaitlistEntry): Promise<WaitlistOutcome> {
  const cfg = config();
  if (!cfg) {
    return {
      status: "unavailable",
      detail:
        "The waitlist is not configured on this deployment: set SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${cfg.url}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        // Return nothing on success. We do not need the row back, and not
        // returning it keeps stored emails out of this function's result.
        Prefer: "return=minimal",
      },
      body: JSON.stringify([{ email: entry.email, source: entry.source }]),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    // A timeout or DNS failure. Say so plainly; the caller decides what the
    // person sees.
    return { status: "failed", detail: `could not reach the waitlist store: ${String(error)}` };
  }

  if (response.ok) return { status: "joined" };

  let body = "";
  try {
    body = (await response.text()).slice(0, 400);
  } catch {
    /* the status line is enough */
  }

  // Someone signing up twice is the SUCCESS path with a different message, not
  // a failure. Depends on a unique index on waitlist.email -- without it the
  // duplicate silently becomes a second row (see docs/waitlist.sql).
  if (response.status === 409 || body.includes(UNIQUE_VIOLATION)) {
    return { status: "already_joined" };
  }

  return { status: "failed", detail: `waitlist store returned ${response.status}: ${body}` };
}
