// @vitest-environment node
//
// Node's own Request/File/FormData -- the ones app/api/analyze-label/route.ts
// runs under in production -- so a real multipart upload satisfies `instanceof File`.
/*
 * POST /api/analyze-label (the LEGACY label route behind /tester): the SAME
 * authentication gate as POST /api/scan, adversarially.
 *
 * Owner finding (2026-10-03): this route runs the same DeepSeek label read and
 * returns real evidence rows, and it had no auth at all, so
 * `SCAN_REQUIRE_AUTH=1` protected only `/api/scan`. It now takes the same
 * `authenticateRequest` gate, BEFORE the multipart body is read and before any
 * model, census or queue call. Every assertion is observable behaviour against
 * the same fake Supabase the /api/scan suite uses (zero real network, zero real
 * model calls):
 *
 *   - SCAN_REQUIRE_AUTH on: no token / malformed / invalid / forged / non-Google
 *     (including a spoofed user_metadata) are 401; missing Supabase config and a
 *     Supabase outage are 503; in every case the body is NEVER read and the
 *     model is NEVER called, and nothing from the provider or the caller leaks;
 *   - a verified Google user is served exactly as before;
 *   - the fail-closed flag parse (a typo still protects);
 *   - flag off (local builds, CI, previews): anonymous requests still work with
 *     no Supabase at all, but a SUPPLIED token is verified (a bad one is a 401);
 *   - the kill switch and the key check still answer first, and the capability
 *     GET stays public and calls neither Supabase nor a model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/analyze-label/route";
import { FAKE_KEY, FAKE_URL, FakeSupabase, PROVIDER_FRAGMENT, USER_A, USER_B, emailUser, googleUser } from "./helpers/fake-supabase";

const ENV_KEYS = [
  "LABEL_ANALYZER_ENABLED",
  "DEEPSEEK_API_KEY",
  "VISION_API_KEY",
  "GEMINI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SCAN_HISTORY_REQUIRED",
  "SCAN_REQUIRE_AUTH",
] as const;
const saved = { ...process.env };
const originalFetch = global.fetch;
let fake: FakeSupabase;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  fake = new FakeSupabase();
  fake.addUser("tok-a", googleUser(USER_A, "alice@example.com"));
  fake.addUser("tok-b", googleUser(USER_B, "bob@example.com"));
  global.fetch = fake.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function configure() {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
}
function requireAuth(value = "1") {
  process.env.SCAN_REQUIRE_AUTH = value;
}
function enableModel() {
  process.env.DEEPSEEK_API_KEY = "test-model-key";
}

/** A real multipart upload, with the request's own `formData()` spied so "never read" is proven twice. */
function photoReq(headers: Record<string, string> = {}, extraFields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("image", new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" }));
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const req = new Request("http://test/api/analyze-label", { method: "POST", headers, body: form });
  const formData = vi.spyOn(req, "formData");
  return { req, formData };
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
async function json(res: Response) {
  return (await res.json()) as Record<string, unknown> & { status: string; error?: string };
}
const noLeak = (text: string) => {
  for (const needle of [FAKE_KEY, PROVIDER_FRAGMENT, "alice@example.com", "bob@example.com", USER_A, USER_B, "test-model-key"]) {
    expect(text).not.toContain(needle);
  }
};

/** The refusal contract shared by every denial: no body read, no model, no storage, generic JSON. */
async function expectRefused(res: Response, status: 401 | 503, kind: "unauthorized" | "auth_unavailable", sent: ReturnType<typeof photoReq>) {
  expect(res.status).toBe(status);
  const body = await json(res);
  expect(body.status).toBe(kind);
  expect(typeof body.error).toBe("string");
  expect(Object.keys(body).sort()).toEqual(["error", "status"]); // no label, no result, no census, no queue
  noLeak(JSON.stringify(body));
  expect(JSON.stringify(body)).not.toMatch(/SUPABASE|SERVICE_ROLE|SCAN_REQUIRE_AUTH/); // no env-var names to a stranger
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(sent.formData).not.toHaveBeenCalled();
  expect(sent.req.bodyUsed).toBe(false); // a 12 MB upload is never buffered for a stranger
  expect(fake.modelCalls).toBe(0);
}

describe("SCAN_REQUIRE_AUTH=1: refused BEFORE the body and the model", () => {
  beforeEach(() => {
    configure();
    requireAuth();
    enableModel();
  });

  it("no Authorization header: 401 with an unread body, zero network calls and zero model calls", async () => {
    const sent = photoReq();
    await expectRefused(await POST(sent.req), 401, "unauthorized", sent);
    expect(fake.calls).toHaveLength(0);
  });

  it("malformed Authorization values: 401, no network, never anonymous", async () => {
    for (const authorization of ["Basic dXNlcjpwYXNz", "Bearer", "Bearer a b", "Token abc", `Bearer ${"x".repeat(9000)}`, "Bearer <svg/onload=1>"]) {
      const sent = photoReq({ authorization });
      await expectRefused(await POST(sent.req), 401, "unauthorized", sent);
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("invalid / expired / forged token: 401 with generic text, no provider fragment, no key", async () => {
    const payload = Buffer.from(JSON.stringify({ sub: USER_A, email: "alice@example.com", exp: 4102444800 })).toString("base64url");
    for (const token of ["not-a-real-token", "expired.jwt.token", `eyJhbGciOiJIUzI1NiJ9.${payload}.forged`]) {
      const sent = photoReq(bearer(token));
      await expectRefused(await POST(sent.req), 401, "unauthorized", sent);
    }
    // The ONLY thing asked of the network was Supabase Auth.
    expect(fake.calls.length).toBeGreaterThan(0);
    expect(fake.calls.every((c) => c.url === `${FAKE_URL}/auth/v1/user`)).toBe(true);
  });

  it("a verified but NON-Google user is refused (401), including one whose user_metadata claims google", async () => {
    fake.addUser("tok-mail", emailUser(USER_A, "alice@example.com"));
    fake.addUser("tok-spoof", { ...emailUser(USER_B, "bob@example.com"), user_metadata: { provider: "google", iss: "https://accounts.google.com" } });
    for (const token of ["tok-mail", "tok-spoof"]) {
      const sent = photoReq(bearer(token));
      await expectRefused(await POST(sent.req), 401, "unauthorized", sent);
    }
  });

  it("missing backend configuration: 503 auth_unavailable (never a pass) with or without a token, no network at all", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    for (const headers of [{}, bearer("tok-a")]) {
      const sent = photoReq(headers);
      await expectRefused(await POST(sent.req), 503, "auth_unavailable", sent);
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("only half of the Supabase configuration is the same as none: 503", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sent = photoReq(bearer("tok-a"));
    await expectRefused(await POST(sent.req), 503, "auth_unavailable", sent);
    expect(fake.calls).toHaveLength(0);
  });

  it("Supabase Auth outage / garbage answer: 503 auth_unavailable (not 401), nothing leaked", async () => {
    for (const mode of ["outage5xx", "throw", "garbage", "badjson", "hugebody"] as const) {
      fake.authMode = mode;
      const sent = photoReq(bearer("tok-a"));
      await expectRefused(await POST(sent.req), 503, "auth_unavailable", sent);
    }
  });

  it("a verified Google user is served exactly as before, and the response carries no owner id/email", async () => {
    const sent = photoReq(bearer("tok-a"), { user_id: USER_B, user_email: "bob@example.com" });
    const res = await POST(sent.req);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("not_a_supplement_label");
    expect(body.schema_version).toBe("LabelAnalysisV1");
    expect(fake.modelCalls).toBe(1);
    noLeak(JSON.stringify(body));
    // The legacy route never writes history, storage or an owner row.
    expect(fake.runs).toHaveLength(0);
    expect(fake.callsTo("/storage/")).toHaveLength(0);
    expect(fake.callsTo("/rest/v1/")).toHaveLength(0);
  });

  it("a fail-closed flag spelling (a typo like 'enabled') still demands the sign-in", async () => {
    requireAuth("enabled");
    const sent = photoReq();
    await expectRefused(await POST(sent.req), 401, "unauthorized", sent);
  });

  it("an invalid upload by a verified user is still the route's own 4xx, after auth (auth does not replace validation)", async () => {
    const form = new FormData();
    form.append("note", "no image here");
    const res = await POST(new Request("http://test/api/analyze-label", { method: "POST", headers: bearer("tok-a"), body: form }));
    expect(res.status).toBe(400);
    expect((await json(res)).status).toBe("bad_request");
    expect(fake.modelCalls).toBe(0);
  });
});

describe("SCAN_REQUIRE_AUTH unset: local/CI compatibility, without silent anonymity for a supplied token", () => {
  beforeEach(() => {
    enableModel();
  });

  it("an anonymous photo request works with NO Supabase at all and makes no auth call", async () => {
    const sent = photoReq();
    const res = await POST(sent.req);
    expect(res.status).toBe(200);
    expect((await json(res)).status).toBe("not_a_supplement_label");
    expect(fake.modelCalls).toBe(1);
    expect(fake.calls.filter((c) => c.url.includes("/auth/v1/user"))).toHaveLength(0);
  });

  it("explicit off spellings (0, false, no, off, empty) keep anonymous requests working", async () => {
    for (const value of ["0", "false", "no", "off", ""]) {
      requireAuth(value);
      const res = await POST(photoReq().req);
      expect(res.status, JSON.stringify(value)).toBe(200);
    }
  });

  it("a supplied VALID token is verified and served", async () => {
    configure();
    const res = await POST(photoReq(bearer("tok-a")).req);
    expect(res.status).toBe(200);
    expect(fake.calls.filter((c) => c.url.includes("/auth/v1/user"))).toHaveLength(1);
    expect(fake.modelCalls).toBe(1);
  });

  it("a supplied INVALID token is a 401 -- never a silent anonymous run -- with an unread body and no model call", async () => {
    configure();
    const sent = photoReq(bearer("garbage-token"));
    await expectRefused(await POST(sent.req), 401, "unauthorized", sent);
  });

  it("a token with no Supabase configuration, or with Auth down, is 503 -- not anonymous", async () => {
    const noCfg = photoReq(bearer("tok-a"));
    await expectRefused(await POST(noCfg.req), 503, "auth_unavailable", noCfg);

    configure();
    fake.authMode = "outage5xx";
    const down = photoReq(bearer("tok-a"));
    await expectRefused(await POST(down.req), 503, "auth_unavailable", down);
  });
});

describe("what still answers first, and what stays public", () => {
  it("the key check and the kill switch answer before any auth work: 503 analyzer_unavailable, no network, body unread", async () => {
    configure();
    requireAuth();
    // No model key at all.
    const noKey = photoReq(bearer("tok-a"));
    const res = await POST(noKey.req);
    expect(res.status).toBe(503);
    expect((await json(res)).status).toBe("analyzer_unavailable");
    expect(noKey.formData).not.toHaveBeenCalled();

    enableModel();
    process.env.LABEL_ANALYZER_ENABLED = "0";
    const killed = photoReq(bearer("tok-a"));
    const res2 = await POST(killed.req);
    expect(res2.status).toBe(503);
    expect((await json(res2)).status).toBe("analyzer_unavailable");
    expect(killed.formData).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
    expect(fake.modelCalls).toBe(0);
  });

  it("the capability GET stays public even with auth required, and calls neither Supabase nor a model", async () => {
    configure();
    requireAuth();
    enableModel();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analyzer_available: boolean; scored_products: unknown };
    expect(body.analyzer_available).toBe(true);
    expect(body.scored_products).toBeDefined();
    expect(fake.calls).toHaveLength(0);
    expect(fake.modelCalls).toBe(0);
  });
});
