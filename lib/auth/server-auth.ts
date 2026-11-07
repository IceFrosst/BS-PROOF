/*
 * SERVER-SIDE AUTHENTICATION for the scan API: who is calling, as proven by
 * SUPABASE AUTH, never by anything the caller says about itself.
 *
 * Used by `POST /api/scan` (owner binding, and the optional SCAN_REQUIRE_AUTH
 * gate), `POST /api/scan/claim`, `GET /api/scan/history` and
 * `GET /api/scan/history/[id]`. Server-only: it reads `SUPABASE_URL` +
 * `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix, so Next.js never
 * inlines them into a client bundle) and speaks plain `fetch`, the same shape
 * as lib/scan-history/store.ts and lib/waitlist/store.ts.
 *
 * THE RULES THIS MODULE KEEPS (Next 16 authentication guide: "treat Route
 * Handlers with the same security considerations as public-facing API
 * endpoints, and verify the user inside the handler"):
 *
 *   1. A bearer token is NEVER decoded locally and trusted. The only thing that
 *      makes a token mean anything is Supabase Auth answering
 *      `GET {SUPABASE_URL}/auth/v1/user` for it. A forged, expired, revoked or
 *      deleted-user token all fail there and look identical to the caller.
 *   2. The caller never supplies a user id or an email. The id and email come
 *      from that trusted response, and from nowhere else (not a header, not a
 *      JSON body field, not a form field).
 *   3. "Signed in with Google" is read from the SERVER-CONTROLLED parts of the
 *      trusted response -- `identities[].provider` and `app_metadata`. It is
 *      NEVER read from `user_metadata`, which the signed-in user can edit
 *      themselves through the public auth API.
 *   4. An invalid token is a 401, never a quiet fall-back to "anonymous": a
 *      caller who tried to authenticate and failed must find out.
 *   5. Every failure is generic. No response body from Supabase, no key, no
 *      URL and no exception text ever reaches a caller from here.
 *   6. An Auth outage, a timeout or a missing configuration is NOT a bad
 *      token. It is `unavailable` (HTTP 503), so a client does not discard a
 *      perfectly good session because Supabase blinked.
 *
 * NEVER THROWS. Every failure mode becomes a reported outcome.
 */

const AUTH_TIMEOUT_MS = 8_000;
/** A Supabase user object is a few KiB; this is a wall, not an expectation. */
const MAX_AUTH_RESPONSE_BYTES = 64 * 1024;
/** Supabase access tokens are JWTs well under 4 KiB; anything near this is hostile. */
const MAX_TOKEN_LENGTH = 8 * 1024;
const MAX_EMAIL_LENGTH = 320;

export interface SupabaseServerConfig {
  url: string;
  serviceKey: string;
}

/** Server-only Supabase configuration, or null when this deployment has none. */
export function supabaseServerConfig(): SupabaseServerConfig | null {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, serviceKey: key };
}

/**
 * Whether `POST /api/scan` demands a verified Google sign-in (the
 * `SCAN_REQUIRE_AUTH` deployment flag).
 *
 * FAIL-CLOSED PARSING: unset, empty and the explicit "off" spellings (`0`,
 * `false`, `no`, `off`) leave it off, so local builds and CI need no
 * credentials; ANY other value -- `1`, `true`, and also a typo like `enabled`
 * -- turns it on. A misspelled flag therefore errs towards protecting the
 * model budget, never towards silently serving anonymous traffic.
 */
export function scanAuthRequired(): boolean {
  const raw = (process.env.SCAN_REQUIRE_AUTH ?? "").trim().toLowerCase();
  if (raw === "" || raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strict RFC-4122 UUID check (no braces, no whitespace, no URN prefix). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface VerifiedUser {
  /** auth.users.id -- a UUID, taken from Supabase's own response. */
  id: string;
  email: string | null;
  /** Whether Supabase records a Google identity for this user. */
  google: boolean;
}

export const UNAUTHORIZED_BODY = { status: "unauthorized", error: "Sign in with Google to continue." } as const;
export const AUTH_UNAVAILABLE_BODY = {
  status: "auth_unavailable",
  error: "Sign-in verification is unavailable right now. Please try again shortly.",
} as const;

export type BearerExtraction = { kind: "none" } | { kind: "invalid" } | { kind: "token"; token: string };

/**
 * Reads `Authorization: Bearer <token>`. An absent (or blank) header is
 * `none`; a present header that is not a well-formed bearer credential is
 * `invalid` -- it must never be mistaken for "no credential" and fall back to
 * anonymous. The token is restricted to the characters a JWT / opaque token
 * can contain, which also keeps it safe to forward as an HTTP header value.
 */
export function extractBearerToken(request: Request): BearerExtraction {
  const header = request.headers.get("authorization");
  if (header === null || header.trim() === "") return { kind: "none" };
  const match = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i.exec(header.trim());
  if (!match || match[1].length > MAX_TOKEN_LENGTH) return { kind: "invalid" };
  return { kind: "token", token: match[1] };
}

/**
 * Reads at most `maxBytes` of a response body. Null when the body is larger
 * than that, or cannot be read. Bounded on purpose: this module and the
 * history reader never buffer an unbounded upstream response.
 */
export async function readBoundedText(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try {
      await res.body?.cancel();
    } catch {
      /* nothing more to do */
    }
    return null;
  }
  try {
    const body = res.body;
    if (!body) {
      const text = await res.text();
      return Buffer.byteLength(text, "utf8") > maxBytes ? null : text;
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Google identity, from the server-controlled parts of Supabase's user
 * object only: the `identities` list and `app_metadata`. `user_metadata` is
 * deliberately not consulted -- the user can write to it.
 */
function hasGoogleIdentity(user: Record<string, unknown>): boolean {
  if (Array.isArray(user.identities) && user.identities.some((i) => isRecord(i) && i.provider === "google")) return true;
  const app = user.app_metadata;
  if (isRecord(app)) {
    if (app.provider === "google") return true;
    if (Array.isArray(app.providers) && app.providers.includes("google")) return true;
  }
  return false;
}

function safeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!email || email.length > MAX_EMAIL_LENGTH || /[\u0000-\u001f\u007f]/.test(email)) return null;
  return email;
}

export type AuthFailure = "unauthorized" | "unavailable";
export type VerifyResult = { ok: true; user: VerifiedUser } | { ok: false; failure: AuthFailure };

export interface VerifyOptions {
  /** Refuse (as `unauthorized`) a user Supabase does not record a Google identity for. */
  requireGoogle: boolean;
  fetchFn?: typeof fetch;
}

/**
 * Asks Supabase Auth who a bearer token belongs to. See the module header for
 * the rules. `unauthorized`: Supabase rejected the token (or, with
 * `requireGoogle`, the user has no Google identity). `unavailable`: this
 * deployment has no Supabase configured, or Supabase could not give a usable
 * answer (timeout, network, 5xx, 429, oversized or malformed body).
 */
export async function verifyAccessToken(token: string, opts: VerifyOptions): Promise<VerifyResult> {
  const cfg = supabaseServerConfig();
  if (!cfg) return { ok: false, failure: "unavailable" };
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, failure: "unauthorized" };

  const fetchFn = opts.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(`${cfg.url}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, failure: "unavailable" };
  }

  if (!res.ok) {
    // Release the connection without ever reading (or forwarding) the body.
    try {
      await res.body?.cancel();
    } catch {
      /* nothing more to do */
    }
    // Throttling and upstream faults are the provider's problem, not a verdict
    // on the token. Every other non-2xx (401/403/404/400...) is a rejection.
    if (res.status === 408 || res.status === 429 || res.status >= 500) return { ok: false, failure: "unavailable" };
    return { ok: false, failure: "unauthorized" };
  }

  const text = await readBoundedText(res, MAX_AUTH_RESPONSE_BYTES);
  if (text === null) return { ok: false, failure: "unavailable" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  // A 2xx without a well-formed user is an upstream anomaly, not a verdict.
  if (!isRecord(parsed) || !isUuid(parsed.id)) return { ok: false, failure: "unavailable" };

  const google = hasGoogleIdentity(parsed);
  if (opts.requireGoogle && !google) return { ok: false, failure: "unauthorized" };
  return { ok: true, user: { id: parsed.id.toLowerCase(), email: safeEmail(parsed.email), google } };
}

export interface AuthenticateOptions {
  /** When true, a request with no bearer token is refused instead of treated as anonymous. */
  tokenRequired: boolean;
  /** Refuse any verified user without a Google identity. */
  requireGoogle: boolean;
  fetchFn?: typeof fetch;
}

export type RequestAuth =
  | { status: "authenticated"; user: VerifiedUser }
  | { status: "anonymous" }
  | { status: "denied"; http: 401 | 503; body: { status: string; error: string } };

function denied(failure: AuthFailure): RequestAuth {
  return failure === "unauthorized"
    ? { status: "denied", http: 401, body: { ...UNAUTHORIZED_BODY } }
    : { status: "denied", http: 503, body: { ...AUTH_UNAVAILABLE_BODY } };
}

/**
 * The single entry point the routes use.
 *
 *  - `tokenRequired` and this deployment has no Supabase configuration:
 *    `denied` 503 (required but impossible to verify -- never a pass).
 *  - no bearer token: `anonymous` if not required, else `denied` 401.
 *  - a malformed bearer header or a token Supabase rejects: `denied` 401,
 *    even when auth is not required (no silent fall-back to anonymous).
 *  - a token while Supabase cannot answer: `denied` 503.
 *  - otherwise `authenticated` with the user Supabase reported.
 *
 * It does NO network I/O when there is no bearer token, and it is called
 * before any request body is read, so an unauthenticated caller can never make
 * the server buffer an image or spend a model call.
 */
export async function authenticateRequest(request: Request, opts: AuthenticateOptions): Promise<RequestAuth> {
  if (opts.tokenRequired && !supabaseServerConfig()) return denied("unavailable");

  const bearer = extractBearerToken(request);
  if (bearer.kind === "none") return opts.tokenRequired ? denied("unauthorized") : { status: "anonymous" };
  if (bearer.kind === "invalid") return denied("unauthorized");

  const result = await verifyAccessToken(bearer.token, { requireGoogle: opts.requireGoogle, fetchFn: opts.fetchFn });
  return result.ok ? { status: "authenticated", user: result.user } : denied(result.failure);
}
