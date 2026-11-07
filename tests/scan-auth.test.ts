// @vitest-environment node
/*
 * lib/auth/server-auth.ts -- the server-side identity check behind every scan
 * route. Zero real network: every case injects (or installs) a fake `fetch`.
 *
 * What is pinned:
 *   - a bearer token is verified ONLY by asking Supabase Auth; it is never
 *     decoded locally (a perfectly well-formed JWT whose payload claims a user
 *     is still a 401 when Supabase rejects it)
 *   - the user id/email come from Supabase's response, never the client
 *   - "Google" is read from `identities` / `app_metadata`, NEVER from the
 *     user-editable `user_metadata`
 *   - rejection (401) and outage (503) are different outcomes; neither carries
 *     a provider response, a URL, or a key
 *   - no bearer / malformed bearer / no configuration behave as documented and
 *     never throw
 *   - SCAN_REQUIRE_AUTH parses fail-closed
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  authenticateRequest,
  extractBearerToken,
  isUuid,
  readBoundedText,
  scanAuthRequired,
  verifyAccessToken,
} from "@/lib/auth/server-auth";
import { FAKE_KEY, FAKE_URL, FakeSupabase, PROVIDER_FRAGMENT, USER_A, emailUser, googleUser } from "./helpers/fake-supabase";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_REQUIRE_AUTH"] as const;
const saved = { ...process.env };
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function configure() {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
}
function unconfigure() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}
const req = (authorization?: string) =>
  new Request("http://test/api/x", { method: "POST", headers: authorization === undefined ? {} : { authorization } });

describe("SCAN_REQUIRE_AUTH parses fail-closed", () => {
  it("is off for unset / empty / explicit-off spellings", () => {
    delete process.env.SCAN_REQUIRE_AUTH;
    expect(scanAuthRequired()).toBe(false);
    for (const v of ["", "  ", "0", "false", "FALSE", "no", "off", "Off"]) {
      process.env.SCAN_REQUIRE_AUTH = v;
      expect(scanAuthRequired(), JSON.stringify(v)).toBe(false);
    }
  });

  it("is ON for 1, true, and any other value -- a typo protects, never exposes", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", "enabled", "required", "2"]) {
      process.env.SCAN_REQUIRE_AUTH = v;
      expect(scanAuthRequired(), v).toBe(true);
    }
  });
});

describe("extractBearerToken", () => {
  it("distinguishes no credential from a malformed one", () => {
    expect(extractBearerToken(req())).toEqual({ kind: "none" });
    expect(extractBearerToken(req(""))).toEqual({ kind: "none" });
    expect(extractBearerToken(req("   "))).toEqual({ kind: "none" });
    expect(extractBearerToken(req("Bearer abc.def.ghi"))).toEqual({ kind: "token", token: "abc.def.ghi" });
    expect(extractBearerToken(req("bearer abc.def.ghi"))).toEqual({ kind: "token", token: "abc.def.ghi" });
    for (const bad of ["Basic dXNlcjpwYXNz", "Bearer", "Bearer ", "Bearer a b", "Bearer a\tb", "Token abc", "abc.def", "Bearer <script>", "Bearer a,b", `Bearer ${"x".repeat(9000)}`]) {
      const got = extractBearerToken(req(bad));
      // `Headers` strips trailing whitespace, so "Bearer " can arrive as "Bearer".
      expect(got.kind, JSON.stringify(bad.slice(0, 20))).toBe("invalid");
    }
  });
});

describe("isUuid", () => {
  it("accepts RFC-4122 ids and nothing else", () => {
    expect(isUuid(USER_A)).toBe(true);
    expect(isUuid(USER_A.toUpperCase())).toBe(true);
    for (const bad of ["", "abc", `${USER_A} `, ` ${USER_A}`, `{${USER_A}}`, `urn:uuid:${USER_A}`, `${USER_A}'`, "../../etc/passwd", "11111111-1111-9111-8111-111111111111", "11111111-1111-4111-c111-111111111111", 7, null, undefined, {}]) {
      expect(isUuid(bad), String(bad)).toBe(false);
    }
  });
});

describe("verifyAccessToken", () => {
  it("never decodes the token: a forged but well-formed JWT claiming a user is still rejected by Supabase", async () => {
    configure();
    const fake = new FakeSupabase();
    const payload = Buffer.from(JSON.stringify({ sub: USER_A, email: "victim@example.com", role: "authenticated" })).toString("base64url");
    const forged = `eyJhbGciOiJIUzI1NiJ9.${payload}.forgedsignature`;
    const result = await verifyAccessToken(forged, { requireGoogle: false, fetchFn: fake.fetch });
    expect(result).toEqual({ ok: false, failure: "unauthorized" });
    expect(fake.callsTo("/auth/v1/user")).toHaveLength(1); // it asked Supabase, and only Supabase
  });

  it("sends the token as the bearer and the service key as apikey to /auth/v1/user, nothing else", async () => {
    configure();
    const fake = new FakeSupabase();
    fake.addUser("good-token", googleUser(USER_A, "a@example.com"));
    const result = await verifyAccessToken("good-token", { requireGoogle: true, fetchFn: fake.fetch });
    expect(result).toEqual({ ok: true, user: { id: USER_A, email: "a@example.com", google: true } });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].url).toBe(`${FAKE_URL}/auth/v1/user`);
    expect(fake.calls[0].headers.authorization).toBe("Bearer good-token");
    expect(fake.calls[0].headers.apikey).toBe(FAKE_KEY);
  });

  it("takes id and email from Supabase's response only (lower-cased id, control-char emails dropped)", async () => {
    configure();
    const fake = new FakeSupabase();
    fake.addUser("t1", googleUser(USER_A.toUpperCase(), "A@Example.com"));
    expect(await verifyAccessToken("t1", { requireGoogle: true, fetchFn: fake.fetch })).toEqual({
      ok: true,
      user: { id: USER_A, email: "A@Example.com", google: true },
    });
    fake.addUser("t2", googleUser(USER_A, "bad\nemail@example.com"));
    const r = await verifyAccessToken("t2", { requireGoogle: true, fetchFn: fake.fetch });
    expect(r.ok && r.user.email).toBeNull();
  });

  it("recognises a Google identity from identities, app_metadata.provider or app_metadata.providers", async () => {
    configure();
    const fake = new FakeSupabase();
    const base = googleUser(USER_A, "a@example.com");
    fake.addUser("by-identities", { ...base, app_metadata: {}, identities: [{ provider: "google" }] });
    fake.addUser("by-provider", { ...base, app_metadata: { provider: "google" }, identities: [] });
    fake.addUser("by-providers", { ...base, app_metadata: { provider: "email", providers: ["email", "google"] }, identities: [] });
    for (const t of ["by-identities", "by-provider", "by-providers"]) {
      const r = await verifyAccessToken(t, { requireGoogle: true, fetchFn: fake.fetch });
      expect(r.ok, t).toBe(true);
    }
  });

  it("refuses a non-Google user when Google is required, and accepts them when it is not", async () => {
    configure();
    const fake = new FakeSupabase();
    fake.addUser("mail", emailUser(USER_A, "a@example.com"));
    expect(await verifyAccessToken("mail", { requireGoogle: true, fetchFn: fake.fetch })).toEqual({ ok: false, failure: "unauthorized" });
    expect(await verifyAccessToken("mail", { requireGoogle: false, fetchFn: fake.fetch })).toEqual({
      ok: true,
      user: { id: USER_A, email: "a@example.com", google: false },
    });
  });

  it("IGNORES user_metadata: a user who edits their own metadata to say 'google' is still not Google", async () => {
    configure();
    const fake = new FakeSupabase();
    fake.addUser("spoof", {
      ...emailUser(USER_A, "a@example.com"),
      user_metadata: { provider: "google", providers: ["google"], iss: "https://accounts.google.com", identities: [{ provider: "google" }] },
    });
    expect(await verifyAccessToken("spoof", { requireGoogle: true, fetchFn: fake.fetch })).toEqual({ ok: false, failure: "unauthorized" });
  });

  it("treats rejections as unauthorized and faults as unavailable -- and leaks neither provider text nor the key", async () => {
    configure();
    const fake = new FakeSupabase();
    // Unknown token: provider says 401 with a body full of internals.
    const rejected = await verifyAccessToken("nope", { requireGoogle: false, fetchFn: fake.fetch });
    expect(rejected).toEqual({ ok: false, failure: "unauthorized" });
    expect(JSON.stringify(rejected)).not.toContain(PROVIDER_FRAGMENT);
    expect(JSON.stringify(rejected)).not.toContain(FAKE_KEY);

    for (const mode of ["outage5xx", "throw", "garbage", "badjson", "hugebody"] as const) {
      fake.authMode = mode;
      fake.addUser("good", googleUser(USER_A, "a@example.com"));
      const r = await verifyAccessToken("good", { requireGoogle: true, fetchFn: fake.fetch });
      expect(r, mode).toEqual({ ok: false, failure: "unavailable" });
      expect(JSON.stringify(r), mode).not.toContain(PROVIDER_FRAGMENT);
      expect(JSON.stringify(r), mode).not.toContain(FAKE_KEY);
    }
  });

  it("429 and 408 are throttling/outage, not a verdict on the token; other 4xx are rejections", async () => {
    configure();
    for (const [status, failure] of [[429, "unavailable"], [408, "unavailable"], [500, "unavailable"], [400, "unauthorized"], [401, "unauthorized"], [403, "unauthorized"], [404, "unauthorized"]] as const) {
      const fetchFn = (async () => new Response("x", { status })) as typeof fetch;
      expect(await verifyAccessToken("t", { requireGoogle: false, fetchFn }), String(status)).toEqual({ ok: false, failure });
    }
  });

  it("is unavailable (and never calls fetch) with no Supabase configuration; blank/oversized tokens never reach fetch", async () => {
    unconfigure();
    const fake = new FakeSupabase();
    expect(await verifyAccessToken("t", { requireGoogle: false, fetchFn: fake.fetch })).toEqual({ ok: false, failure: "unavailable" });
    configure();
    expect(await verifyAccessToken("", { requireGoogle: false, fetchFn: fake.fetch })).toEqual({ ok: false, failure: "unauthorized" });
    expect(await verifyAccessToken("x".repeat(9000), { requireGoogle: false, fetchFn: fake.fetch })).toEqual({ ok: false, failure: "unauthorized" });
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a 2xx whose user id is not a UUID as an upstream fault, never as a user", async () => {
    configure();
    const fetchFn = (async () => new Response(JSON.stringify({ id: "not-a-uuid", email: "a@example.com", app_metadata: { provider: "google" } }), { status: 200 })) as typeof fetch;
    expect(await verifyAccessToken("t", { requireGoogle: true, fetchFn })).toEqual({ ok: false, failure: "unavailable" });
  });
});

describe("authenticateRequest", () => {
  it("not required + no token: anonymous, with no network call at all", async () => {
    configure();
    const fake = new FakeSupabase();
    expect(await authenticateRequest(req(), { tokenRequired: false, requireGoogle: false, fetchFn: fake.fetch })).toEqual({ status: "anonymous" });
    expect(fake.calls).toHaveLength(0);
  });

  it("not required + malformed bearer: 401, NOT a silent fall-back to anonymous", async () => {
    configure();
    const fake = new FakeSupabase();
    const r = await authenticateRequest(req("Bearer a b"), { tokenRequired: false, requireGoogle: false, fetchFn: fake.fetch });
    expect(r).toMatchObject({ status: "denied", http: 401, body: { status: "unauthorized" } });
    expect(fake.calls).toHaveLength(0);
  });

  it("not required + invalid token: 401; + token while Auth is down: 503; + token with no config: 503", async () => {
    configure();
    const fake = new FakeSupabase();
    expect(await authenticateRequest(req("Bearer bad"), { tokenRequired: false, requireGoogle: false, fetchFn: fake.fetch })).toMatchObject({ http: 401 });
    fake.authMode = "outage5xx";
    expect(await authenticateRequest(req("Bearer bad"), { tokenRequired: false, requireGoogle: false, fetchFn: fake.fetch })).toMatchObject({
      http: 503,
      body: { status: "auth_unavailable" },
    });
    unconfigure();
    expect(await authenticateRequest(req("Bearer anything"), { tokenRequired: false, requireGoogle: false, fetchFn: fake.fetch })).toMatchObject({ http: 503 });
  });

  it("required: no token is 401 (no network); no configuration is 503 whatever the token", async () => {
    configure();
    const fake = new FakeSupabase();
    expect(await authenticateRequest(req(), { tokenRequired: true, requireGoogle: true, fetchFn: fake.fetch })).toMatchObject({ http: 401, body: { status: "unauthorized" } });
    expect(fake.calls).toHaveLength(0);
    unconfigure();
    for (const header of [undefined, "Bearer abc", "garbage"]) {
      expect(await authenticateRequest(req(header), { tokenRequired: true, requireGoogle: true, fetchFn: fake.fetch }), String(header)).toMatchObject({
        http: 503,
        body: { status: "auth_unavailable" },
      });
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("denial bodies are fixed generic text: no provider fragment, key, URL or env name", async () => {
    configure();
    const fake = new FakeSupabase();
    const bodies: unknown[] = [];
    bodies.push((await authenticateRequest(req("Bearer bad"), { tokenRequired: true, requireGoogle: true, fetchFn: fake.fetch }) as { body: unknown }).body);
    fake.authMode = "outage5xx";
    bodies.push((await authenticateRequest(req("Bearer bad"), { tokenRequired: true, requireGoogle: true, fetchFn: fake.fetch }) as { body: unknown }).body);
    unconfigure();
    bodies.push((await authenticateRequest(req("Bearer bad"), { tokenRequired: true, requireGoogle: true, fetchFn: fake.fetch }) as { body: unknown }).body);
    const text = JSON.stringify(bodies);
    for (const needle of [PROVIDER_FRAGMENT, FAKE_KEY, FAKE_URL, "SUPABASE", "supabase.co", "service"]) expect(text).not.toContain(needle);
  });

  it("returns the verified user and nothing a client could have supplied", async () => {
    configure();
    const fake = new FakeSupabase();
    fake.addUser("good", googleUser(USER_A, "real@example.com"));
    const request = new Request("http://test/api/x?user_id=evil&email=evil@example.com", {
      method: "POST",
      headers: { authorization: "Bearer good", "x-user-id": "evil", "x-user-email": "evil@example.com" },
      body: JSON.stringify({ user_id: "evil", email: "evil@example.com" }),
    });
    const r = await authenticateRequest(request, { tokenRequired: true, requireGoogle: true, fetchFn: fake.fetch });
    expect(r).toEqual({ status: "authenticated", user: { id: USER_A, email: "real@example.com", google: true } });
    expect(request.bodyUsed).toBe(false); // the body was never read to decide who is calling
  });
});

describe("readBoundedText", () => {
  it("returns small bodies, and null for oversize, declared-oversize or unreadable ones", async () => {
    expect(await readBoundedText(new Response("hello"), 10)).toBe("hello");
    expect(await readBoundedText(new Response("x".repeat(50)), 10)).toBeNull();
    expect(await readBoundedText(new Response("x", { headers: { "content-length": "999999" } }), 10)).toBeNull();
    const broken = new Response(
      new ReadableStream({
        pull() {
          throw new Error("stream broke");
        },
      }),
    );
    expect(await readBoundedText(broken, 10)).toBeNull();
  });
});
