/*
 * THE BROWSER SUPABASE CLIENT — one, singleton, null when unconfigured
 * (2026-09-16, "people log in once so we capture their email").
 *
 * This is the ONE place in the app that imports `@supabase/supabase-js`: the
 * waitlist and scan-history stores deliberately stayed on plain `fetch`
 * because an INSERT and a PATCH are one HTTP call each and a client library
 * earns its place only when the job needs more than that. Sign-in does: a
 * browser-side Google Identity Services credential has to become a Supabase
 * session (`signInWithIdToken`), the session has to persist across reloads
 * (localStorage, the library's default) and refresh itself, and the rest of
 * the app just wants "is anyone signed in, and with what access token" — all
 * of which the SDK does correctly and none of which is worth reimplementing
 * over PostgREST.
 *
 * PUBLIC, CLIENT-SIDE KEYS ONLY. `NEXT_PUBLIC_SUPABASE_URL` and
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` are meant to be visible in the browser (the
 * anon key is subject to Postgres row level security, unlike the service role
 * key `lib/waitlist/store.ts` / `lib/scan-history/store.ts` use — those never
 * carry a `NEXT_PUBLIC_` prefix and must never be imported here). Returning
 * `null` when the three sign-in env vars are not all set — never throwing —
 * is what keeps every local/CI/preview build usable with no Google/Supabase
 * project configured at all: the sign-in card simply never renders (see
 * `authFullyConfigured`).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function trimmed(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

export function supabaseUrl(): string | null {
  return trimmed(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string | null {
  return trimmed(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function googleClientId(): string | null {
  return trimmed(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
}

/** All three sign-in env vars present. The single gate the UI uses to decide
 * whether the "Save your result" card, the sign-in-gated result lock and the
 * Google button can ever appear. */
export function authFullyConfigured(): boolean {
  return supabaseUrl() !== null && supabaseAnonKey() !== null && googleClientId() !== null;
}

// Module-level singleton. `undefined` = not yet computed, `null` = computed
// and unconfigured -- distinct so we never re-run createClient() needlessly
// nor mistake "not configured" for "not yet checked".
let cached: SupabaseClient | null | undefined;

/** Returns the singleton browser client, or null when Supabase URL/anon key
 * are not both set. Safe to call from server code too (it will just always
 * return null there in practice, since NEXT_PUBLIC_* env vars are meant for
 * the client bundle) — it never throws. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    cached = null;
    return cached;
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

/** Test-only escape hatch: forces the next `getSupabaseBrowserClient()` call
 * to recompute, so tests that toggle env vars between cases do not read a
 * stale cached client. */
export function resetSupabaseBrowserClientForTests(): void {
  cached = undefined;
}
