// @vitest-environment node
//
// Node's own Request/File/FormData -- the ones app/api/scan/route.ts runs under
// in production -- so a real multipart upload satisfies `instanceof File`.
/*
 * POST /api/scan: SERVER-VERIFIED AUTHENTICATION AND OWNERSHIP, adversarially.
 *
 * The fake Supabase (tests/helpers/fake-supabase.ts) applies PostgREST filters
 * for real, answers auth failures with provider text + the service key, and
 * counts model calls, so every assertion below is about observable behaviour:
 *
 *   - SCAN_REQUIRE_AUTH=1: 401 / 503 are returned BEFORE the body is read and
 *     before any model call, storage write or history insert
 *   - invalid / expired / forged / non-Google tokens are refused; a spoofed
 *     `user_metadata` claim does not make a user Google
 *   - a missing Supabase configuration is 503, never a pass
 *   - the owner written at INSERT is the Supabase-verified user, for manual,
 *     photo and terminal stored-failure records -- never a client-supplied
 *     body/form/header value; concurrent users never cross
 *   - flag unset: anonymous requests keep working and record NO owner, but a
 *     supplied token is still verified (and an invalid one is a 401, not a
 *     silent anonymous run)
 *   - no secret, provider text or owner PII reaches the response
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/scan/route";
import { analyzeManual, analyzeScan } from "@/lib/analyze/scan";
import { FAKE_KEY, FAKE_URL, FakeSupabase, PROVIDER_FRAGMENT, USER_A, USER_B, emailUser, googleUser } from "./helpers/fake-supabase";

// Wrap (not replace) the orchestrators so one test can make them throw and
// exercise the route's terminal stored-failure record. Every other test runs
// the real implementation through the wrapper.
vi.mock("@/lib/analyze/scan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analyze/scan")>();
  return { ...actual, analyzeManual: vi.fn(actual.analyzeManual), analyzeScan: vi.fn(actual.analyzeScan) };
});

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
function requireAuth() {
  process.env.SCAN_REQUIRE_AUTH = "1";
}
function enableModel() {
  process.env.DEEPSEEK_API_KEY = "test-model-key";
}

const MANUAL = { source: "manual", ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 5, unit: "g" }, servings_per_day: 1 };

function manualReq(headers: Record<string, string> = {}, body: unknown = MANUAL): Request {
  return new Request("http://test/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function photoReq(headers: Record<string, string> = {}, extraFields: Record<string, string> = {}): Request {
  const form = new FormData();
  form.append("image", new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" }));
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  return new Request("http://test/api/scan", { method: "POST", headers, body: form });
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
async function json(res: Response) {
  return (await res.json()) as Record<string, unknown> & { run_id?: string; persistence?: { status: string }; status: string; error?: string };
}
const noLeak = (text: string) => {
  for (const needle of [FAKE_KEY, PROVIDER_FRAGMENT, "alice@example.com", "bob@example.com", USER_A, USER_B]) expect(text).not.toContain(needle);
};

describe("SCAN_REQUIRE_AUTH=1: refused BEFORE the body, the model, storage or history", () => {
  beforeEach(() => {
    configure();
    requireAuth();
    enableModel();
  });

  it("no Authorization header: 401 for manual and photo, with zero network calls and an unread body", async () => {
    const manual = manualReq();
    const res = await POST(manual);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ status: "unauthorized" });
    expect(manual.bodyUsed).toBe(false);

    const photo = photoReq();
    const res2 = await POST(photo);
    expect(res2.status).toBe(401);
    expect(photo.bodyUsed).toBe(false); // a 12 MB upload is never buffered for a stranger

    expect(fake.calls).toHaveLength(0);
    expect(fake.modelCalls).toBe(0);
    expect(fake.runs).toHaveLength(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("malformed Authorization values: 401, no network, never anonymous", async () => {
    for (const authorization of ["Basic dXNlcjpwYXNz", "Bearer", "Bearer a b", "Token abc", `Bearer ${"x".repeat(9000)}`, "Bearer <svg/onload=1>"]) {
      const res = await POST(manualReq({ authorization }));
      expect(res.status, authorization.slice(0, 20)).toBe(401);
    }
    expect(fake.calls).toHaveLength(0);
    expect(fake.modelCalls).toBe(0);
  });

  it("invalid / expired / forged token: 401 {status:'unauthorized'}, generic text, no provider fragment, no key, no model, no insert", async () => {
    const payload = Buffer.from(JSON.stringify({ sub: USER_A, email: "alice@example.com", exp: 4102444800 })).toString("base64url");
    for (const token of ["not-a-real-token", "expired.jwt.token", `eyJhbGciOiJIUzI1NiJ9.${payload}.forged`]) {
      const res = await POST(photoReq(bearer(token)));
      expect(res.status, token).toBe(401);
      const body = await json(res);
      expect(body.status).toBe("unauthorized");
      expect(typeof body.error).toBe("string");
      noLeak(JSON.stringify(body));
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fake.modelCalls).toBe(0);
    expect(fake.callsTo("/storage/")).toHaveLength(0);
    expect(fake.runs).toHaveLength(0);
    // The ONLY thing asked of the network was Supabase Auth.
    expect(fake.calls.every((c) => c.url === `${FAKE_URL}/auth/v1/user`)).toBe(true);
  });

  it("a verified but NON-Google user is refused (401), including one whose user_metadata claims google", async () => {
    fake.addUser("tok-mail", emailUser(USER_A, "alice@example.com"));
    fake.addUser("tok-spoof", { ...emailUser(USER_B, "bob@example.com"), user_metadata: { provider: "google", iss: "https://accounts.google.com" } });
    for (const t of ["tok-mail", "tok-spoof"]) {
      const res = await POST(manualReq(bearer(t)));
      expect(res.status, t).toBe(401);
      noLeak(JSON.stringify(await res.json()));
    }
    expect(fake.modelCalls).toBe(0);
    expect(fake.runs).toHaveLength(0);
  });

  it("missing backend configuration: 503 auth_unavailable (never a pass) with or without a token, no network at all", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    for (const headers of [{}, bearer("tok-a")]) {
      const res = await POST(manualReq(headers));
      expect(res.status).toBe(503);
      const body = await json(res);
      expect(body.status).toBe("auth_unavailable");
      expect(JSON.stringify(body)).not.toMatch(/SUPABASE|service|key/i);
    }
    const photo = await POST(photoReq(bearer("tok-a")));
    expect(photo.status).toBe(503);
    expect(fake.calls).toHaveLength(0);
    expect(fake.modelCalls).toBe(0);
  });

  it("Supabase Auth outage / garbage answer: 503 auth_unavailable (not 401), nothing leaked, no model call", async () => {
    for (const mode of ["outage5xx", "throw", "garbage", "badjson"] as const) {
      fake.authMode = mode;
      const res = await POST(manualReq(bearer("tok-a")));
      expect(res.status, mode).toBe(503);
      const body = await json(res);
      expect(body.status).toBe("auth_unavailable");
      noLeak(JSON.stringify(body));
    }
    expect(fake.modelCalls).toBe(0);
    expect(fake.runs).toHaveLength(0);
  });

  it("a verified Google user is served, and the response carries no owner id/email", async () => {
    const res = await POST(manualReq(bearer("tok-a")));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("scored");
    expect(body.persistence?.status).toBe("stored");
    noLeak(JSON.stringify(body));
    expect(fake.runs).toHaveLength(1);
    expect(fake.runs[0]).toMatchObject({ id: body.run_id, user_id: USER_A, user_email: "alice@example.com" });
  });

  it("Google identity is accepted from identities, app_metadata.provider or app_metadata.providers", async () => {
    const base = googleUser(USER_A, "alice@example.com");
    fake.addUser("via-identities", { ...base, app_metadata: {}, identities: [{ provider: "google" }] });
    fake.addUser("via-provider", { ...base, app_metadata: { provider: "google" }, identities: [] });
    fake.addUser("via-providers", { ...base, app_metadata: { provider: "email", providers: ["email", "google"] }, identities: [] });
    for (const t of ["via-identities", "via-provider", "via-providers"]) {
      expect((await POST(manualReq(bearer(t)))).status, t).toBe(200);
    }
  });
});

describe("the owner is the VERIFIED user, never anything the client sent", () => {
  beforeEach(() => {
    configure();
    requireAuth();
    enableModel();
  });

  it("manual: spoofed user_id / user_email / owner / email in the JSON body, a query string and headers are ignored and not stored", async () => {
    const spoofed = { ...MANUAL, user_id: USER_B, user_email: "bob@example.com", email: "bob@example.com", owner: { id: USER_B }, userId: USER_B };
    const req = new Request("http://test/api/scan?user_id=" + USER_B + "&email=bob@example.com", {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer("tok-a"), "x-user-id": USER_B, "x-user-email": "bob@example.com", "x-supabase-user": USER_B },
      body: JSON.stringify(spoofed),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fake.runs).toHaveLength(1);
    const row = fake.runs[0];
    expect(row.user_id).toBe(USER_A);
    expect(row.user_email).toBe("alice@example.com");
    // The stored request is only the typed facts the manual contract defines.
    expect(Object.keys(row.request).sort()).toEqual(["dose", "form", "ingredient", "servings_per_day", "source"]);
    expect(JSON.stringify(row)).not.toContain(USER_B);
    expect(JSON.stringify(row)).not.toContain("bob@example.com");
  });

  it("photo: spoofed multipart owner fields and headers are ignored; the row, upload and response all belong to the verified user", async () => {
    const res = await POST(photoReq({ ...bearer("tok-a"), "x-user-id": USER_B }, { user_id: USER_B, user_email: "bob@example.com", owner: USER_B }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("not_a_supplement_label");
    expect(fake.runs).toHaveLength(1);
    expect(fake.runs[0]).toMatchObject({ user_id: USER_A, user_email: "alice@example.com", image_status: "stored", source: "photo" });
    expect(JSON.stringify(fake.runs[0])).not.toContain(USER_B);
    expect(fake.modelCalls).toBe(1);
    noLeak(JSON.stringify(body));
  });

  it("concurrent requests from different users never cross: every row carries the owner of ITS token", async () => {
    const plan = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? { token: "tok-a", user: USER_A } : { token: "tok-b", user: USER_B }));
    const responses = await Promise.all(plan.map((p, i) => (i % 3 === 0 ? POST(photoReq(bearer(p.token))) : POST(manualReq(bearer(p.token))))));
    const bodies = await Promise.all(responses.map(json));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const ids = bodies.map((b) => b.run_id as string);
    expect(new Set(ids).size).toBe(plan.length); // distinct run ids, nothing shared
    expect(fake.runs).toHaveLength(plan.length);
    bodies.forEach((b, i) => {
      const row = fake.runs.find((r) => r.id === b.run_id);
      expect(row?.user_id, `request ${i}`).toBe(plan[i].user);
      expect(row?.user_email).toBe(plan[i].user === USER_A ? "alice@example.com" : "bob@example.com");
    });
  });

  it("a TERMINAL stored-failure record (the orchestrator throws) is bound to the verified owner, manual and photo", async () => {
    vi.mocked(analyzeManual).mockRejectedValueOnce(new Error("kaboom"));
    const manual = await POST(manualReq(bearer("tok-a")));
    expect(manual.status).toBe(500);
    const manualBody = await json(manual);
    expect(manualBody.status).toBe("analyzer_failed");

    vi.mocked(analyzeScan).mockRejectedValueOnce(new Error("kaboom"));
    const photo = await POST(photoReq(bearer("tok-b")));
    expect(photo.status).toBe(500);

    expect(fake.runs).toHaveLength(2);
    const manualRow = fake.runs.find((r) => r.source === "manual");
    const photoRow = fake.runs.find((r) => r.source === "photo");
    expect(manualRow).toMatchObject({ status: "analyzer_failed", user_id: USER_A, user_email: "alice@example.com" });
    expect(photoRow).toMatchObject({ status: "analyzer_failed", user_id: USER_B, user_email: "bob@example.com", image_status: "stored" });
  });

  it("store failure on insert: the owner is not fabricated or leaked; SCAN_HISTORY_REQUIRED=1 turns it into a generic failure with no provider text", async () => {
    fake.insertStatus = 500;
    const soft = await POST(manualReq(bearer("tok-a")));
    expect(soft.status).toBe(200);
    const softBody = await json(soft);
    expect(softBody.persistence?.status).toBe("failed");
    noLeak(JSON.stringify(softBody)); // the provider's error body (and the key in it) is not echoed

    process.env.SCAN_HISTORY_REQUIRED = "1";
    const hard = await POST(manualReq(bearer("tok-a")));
    expect(hard.status).toBe(500);
    const hardBody = await json(hard);
    expect(hardBody.status).toBe("scan_history_required_failed");
    noLeak(JSON.stringify(hardBody));
    expect(fake.runs).toHaveLength(0);
  });

  it("the insert is a plain create: no upsert/merge request is ever made against scan_runs", async () => {
    await POST(manualReq(bearer("tok-a")));
    await POST(photoReq(bearer("tok-a")));
    const inserts = fake.calls.filter((c) => c.method === "POST" && c.url.includes("/rest/v1/scan_runs"));
    expect(inserts).toHaveLength(2);
    for (const c of inserts) {
      expect(c.url).not.toContain("on_conflict");
      expect(c.headers.prefer ?? "").not.toContain("merge-duplicates");
    }
    expect(fake.nonGetRunWrites.every((c) => c.method === "POST")).toBe(true);
  });
});

describe("SCAN_REQUIRE_AUTH unset: local/CI compatibility, without silent anonymity for a supplied token", () => {
  beforeEach(() => {
    enableModel();
  });

  it("anonymous manual and photo requests work with NO Supabase at all and no auth call", async () => {
    // no configure(): nothing to verify against, nothing needed
    const manual = await POST(manualReq());
    expect(manual.status).toBe(200);
    expect((await json(manual)).persistence?.status).toBe("unavailable");
    const photo = await POST(photoReq());
    expect(photo.status).toBe(200);
    expect((await json(photo)).persistence?.status).toBe("unavailable");
    expect(fake.calls.filter((c) => c.url.includes("/auth/v1/user"))).toHaveLength(0);
  });

  it("anonymous requests are recorded WITHOUT an owner: no user_id / user_email is invented", async () => {
    configure();
    const res = await POST(manualReq({}, { ...MANUAL, user_id: USER_B, user_email: "bob@example.com" }));
    expect(res.status).toBe(200);
    expect(fake.runs).toHaveLength(1);
    expect("user_id" in fake.runs[0]).toBe(false);
    expect("user_email" in fake.runs[0]).toBe(false);
    expect(JSON.stringify(fake.runs[0])).not.toContain(USER_B);
    expect(fake.calls.filter((c) => c.url.includes("/auth/v1/user"))).toHaveLength(0);
  });

  it("a supplied VALID token is still verified and still binds ownership (manual and photo)", async () => {
    configure();
    expect((await POST(manualReq(bearer("tok-a")))).status).toBe(200);
    expect((await POST(photoReq(bearer("tok-b")))).status).toBe(200);
    expect(fake.runs.find((r) => r.source === "manual")).toMatchObject({ user_id: USER_A, user_email: "alice@example.com" });
    expect(fake.runs.find((r) => r.source === "photo")).toMatchObject({ user_id: USER_B, user_email: "bob@example.com" });
  });

  it("a supplied INVALID token is a 401 -- never a silent anonymous run -- before any model call or insert", async () => {
    configure();
    const res = await POST(photoReq(bearer("garbage-token")));
    expect(res.status).toBe(401);
    noLeak(JSON.stringify(await res.json()));
    expect(fake.modelCalls).toBe(0);
    expect(fake.runs).toHaveLength(0);
    expect(fake.callsTo("/storage/")).toHaveLength(0);
  });

  it("a token with no Supabase configuration, or with Auth down, is 503 -- not anonymous", async () => {
    const noCfg = await POST(manualReq(bearer("tok-a")));
    expect(noCfg.status).toBe(503);
    expect((await json(noCfg)).status).toBe("auth_unavailable");

    configure();
    fake.authMode = "outage5xx";
    const down = await POST(manualReq(bearer("tok-a")));
    expect(down.status).toBe(503);
    expect(fake.runs).toHaveLength(0);
    expect(fake.modelCalls).toBe(0);
  });

  it("a verified non-Google user is accepted while the flag is off (local compat) and owns their run", async () => {
    configure();
    fake.addUser("tok-mail", emailUser(USER_A, "alice@example.com"));
    const res = await POST(manualReq(bearer("tok-mail")));
    expect(res.status).toBe(200);
    expect(fake.runs[0]).toMatchObject({ user_id: USER_A });
  });

  it("the kill switch still answers first, and the GET capability endpoint stays public even with auth required", async () => {
    configure();
    process.env.LABEL_ANALYZER_ENABLED = "0";
    const res = await POST(manualReq());
    expect(res.status).toBe(503);
    expect((await json(res)).status).toBe("analyzer_unavailable");

    delete process.env.LABEL_ANALYZER_ENABLED;
    requireAuth();
    const caps = await GET();
    expect(caps.status).toBe(200);
    expect(fake.calls).toHaveLength(0);
  });
});
