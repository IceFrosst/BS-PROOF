// @vitest-environment node
/*
 * The PRIVATE HISTORY API: GET /api/scan/history and GET /api/scan/history/[id]
 * (app/api/scan/history/**, lib/scan-history/reader.ts).
 *
 * The fake Supabase applies the owner filter for real, so a route that forgets
 * `user_id = <verified user>` would leak another user's row in these tests.
 *
 * What is pinned:
 *   - Google-backed bearer required REGARDLESS of SCAN_REQUIRE_AUTH; 401 / 503
 *     are decided before the store is touched
 *   - the list is the verified user's own latest 20, metadata only, newest
 *     first; client-supplied filters / cursors / user ids are inert
 *   - the detail is owner-filtered, UUID-validated, and cross-owner, unowned
 *     (legacy) and missing rows are the SAME 404; the saved analysis comes back
 *     verbatim with a reconstructed run_id/app_version and NO photo, path,
 *     bucket, hash, request, email or other user's data
 *   - nothing is ever re-run (no model call), every response is no-store, store
 *     outages / bad payloads / oversize are bounded 5xx with no secret or
 *     provider text
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as getDetail } from "@/app/api/scan/history/[id]/route";
import { GET as getList } from "@/app/api/scan/history/route";
import { ANALYSIS_KEYS } from "@/lib/scan-history/analysis-keys";
import { getScanRun, listScanRuns } from "@/lib/scan-history/reader";
import { FAKE_KEY, FAKE_URL, FakeSupabase, PROVIDER_FRAGMENT, USER_A, USER_B, USER_C, emailUser, googleUser } from "./helpers/fake-supabase";

const ROOT = process.cwd();
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_REQUIRE_AUTH", "DEEPSEEK_API_KEY", "SCAN_HISTORY_REQUIRED"] as const;
const saved = { ...process.env };
const originalFetch = global.fetch;
let fake: FakeSupabase;

const RUN_A1 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RUN_A2 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const RUN_B1 = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const RUN_LEGACY = "cccccccc-cccc-4ccc-8ccc-000000000001";
const RUN_MISSING = "dddddddd-dddd-4ddd-8ddd-000000000001";

function analysisFor(label: string): Record<string, unknown> {
  return {
    schema_version: "ScanAnalysisV1",
    analyzed_at: "2026-10-03T00:00:00.000Z",
    source: "photo",
    status: "scored",
    label: { product_name: label, brand: "Acme", ingredient_vocab_id: "creatine" },
    product: { ingredient: "creatine" },
    evidence: { score: 42, secret_marker: "SAVED_EVIDENCE_PAYLOAD" },
    basis_legend: {},
    meta: { timing_s: 1, stages: {}, provider_configured: true, models: { vision: "m", text: "m" }, prompt_versions: {} },
    // A hostile/legacy payload that wrongly carries write-time persistence info:
    persistence: { status: "stored", run_id: "x", image: { bucket: "scan-images", path: `${RUN_A1}/original.png`, sha256: "f".repeat(64) } },
    run_id: "stale-id",
    app_version: { package_version: "9.9.9", git_sha: "abc", secret_extra: "should-not-survive" },
  };
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
  fake = new FakeSupabase();
  fake.addUser("tok-a", googleUser(USER_A, "alice@example.com"));
  fake.addUser("tok-b", googleUser(USER_B, "bob@example.com"));
  fake.addUser("tok-mail", emailUser(USER_C, "carol@example.com"));
  fake.addRun({
    id: RUN_A1,
    user_id: USER_A,
    user_email: "alice@example.com",
    created_at: "2026-10-03T10:00:00.000Z",
    source: "photo",
    analysis: analysisFor("Alice's Creatine"),
    request: { content_type: "image/png", size_bytes: 1234 },
    image_bucket: "scan-images",
    image_path: `${RUN_A1}/original.png`,
    image_sha256: "a".repeat(64),
    image_status: "stored",
    app_version: { package_version: "0.1.0", git_sha: "deadbeef", git_ref: "main", deployment_id: null, vercel_env: "production", url: "x.vercel.app", secret_extra: "nope" },
  });
  fake.addRun({
    id: RUN_A2,
    user_id: USER_A,
    user_email: "alice@example.com",
    created_at: "2026-10-03T11:00:00.000Z",
    source: "manual",
    analysis: { schema_version: "ScanAnalysisV1", status: "scored", source: "manual", input: { ingredient_label: "Creatine", form_label: "Monohydrate" } },
  });
  fake.addRun({ id: RUN_B1, user_id: USER_B, user_email: "bob@example.com", created_at: "2026-10-03T12:00:00.000Z", analysis: analysisFor("Bob's Private Magnesium") });
  fake.addRun({ id: RUN_LEGACY, user_id: null, created_at: "2026-10-03T13:00:00.000Z", analysis: analysisFor("Legacy Unowned") });
  global.fetch = fake.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const listReq = (headers: Record<string, string> = {}, query = "") => new Request(`http://test/api/scan/history${query}`, { headers });
const detailReq = (id: string, headers: Record<string, string> = {}) => new Request(`http://test/api/scan/history/${id}`, { headers });
const detail = (id: string, headers: Record<string, string> = {}) => getDetail(detailReq(id, headers), { params: Promise.resolve({ id }) });
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const storeReads = () => fake.calls.filter((c) => c.url.includes("/rest/v1/scan_runs"));
const noSecrets = (text: string) => {
  for (const needle of [FAKE_KEY, PROVIDER_FRAGMENT, FAKE_URL, "bob@example.com", "alice@example.com", "SUPABASE_SERVICE"]) expect(text).not.toContain(needle);
};

describe("GET /api/scan/history: authentication (independent of SCAN_REQUIRE_AUTH)", () => {
  it("401 with no token, a malformed one, an invalid one, or a non-Google user -- the store is never touched", async () => {
    for (const headers of [{}, { authorization: "Basic abc" }, { authorization: "Bearer a b" }, bearer("nope"), bearer("tok-mail")]) {
      const res = await getList(listReq(headers));
      expect(res.status, JSON.stringify(headers)).toBe(401);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("unauthorized");
      noSecrets(JSON.stringify(body));
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(storeReads()).toHaveLength(0);
  });

  it("enforced identically with SCAN_REQUIRE_AUTH unset, 0 and 1", async () => {
    for (const value of [undefined, "0", "1"]) {
      if (value === undefined) delete process.env.SCAN_REQUIRE_AUTH;
      else process.env.SCAN_REQUIRE_AUTH = value;
      expect((await getList(listReq())).status, String(value)).toBe(401);
      expect((await getList(listReq(bearer("tok-mail")))).status, String(value)).toBe(401);
      expect((await getList(listReq(bearer("tok-a")))).status, String(value)).toBe(200);
    }
  });

  it("503 auth_unavailable when Supabase is not configured or Auth is down -- never a pass, never 401", async () => {
    fake.authMode = "outage5xx";
    const down = await getList(listReq(bearer("tok-a")));
    expect(down.status).toBe(503);
    expect(((await down.json()) as { status: string }).status).toBe("auth_unavailable");

    delete process.env.SUPABASE_URL;
    const unconfigured = await getList(listReq(bearer("tok-a")));
    expect(unconfigured.status).toBe(503);
    expect(((await unconfigured.json()) as { status: string }).status).toBe("auth_unavailable");
    expect(storeReads()).toHaveLength(0);
  });
});

describe("GET /api/scan/history: the owner-only list", () => {
  it("returns exactly {status, runs, next_cursor:null} with the verified user's runs only, newest first, metadata only", async () => {
    const res = await getList(listReq(bearer("tok-a")));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { status: string; runs: Array<Record<string, unknown>>; next_cursor: unknown };
    expect(Object.keys(body).sort()).toEqual(["next_cursor", "runs", "status"]);
    expect(body.status).toBe("ok");
    expect(body.next_cursor).toBeNull();
    expect(body.runs.map((r) => r.id)).toEqual([RUN_A2, RUN_A1]);
    for (const run of body.runs) expect(Object.keys(run).sort()).toEqual(["created_at", "id", "product_name", "source", "status"]);
    expect(body.runs[0]).toEqual({ id: RUN_A2, created_at: "2026-10-03T11:00:00.000Z", source: "manual", status: "scored", product_name: "Creatine" });
    expect(body.runs[1]).toEqual({ id: RUN_A1, created_at: "2026-10-03T10:00:00.000Z", source: "photo", status: "scored", product_name: "Alice's Creatine" });

    const text = JSON.stringify(body);
    for (const leak of ["Bob", "Legacy", "SAVED_EVIDENCE_PAYLOAD", "image", "scan-images", "sha256", "alice@example.com", "bob@example.com", USER_A, USER_B, FAKE_KEY]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("another user sees only their own; a user with no runs gets an empty list, not someone else's", async () => {
    const bob = (await (await getList(listReq(bearer("tok-b")))).json()) as { runs: Array<{ id: string }> };
    expect(bob.runs.map((r) => r.id)).toEqual([RUN_B1]);
    fake.addUser("tok-new", googleUser("44444444-4444-4444-8444-444444444444", "new@example.com"));
    const empty = (await (await getList(listReq(bearer("tok-new")))).json()) as { runs: unknown[] };
    expect(empty.runs).toEqual([]);
  });

  it("legacy rows with no owner are never listed for anybody", async () => {
    for (const t of ["tok-a", "tok-b"]) {
      const body = (await (await getList(listReq(bearer(t)))).json()) as { runs: Array<{ id: string }> };
      expect(body.runs.map((r) => r.id)).not.toContain(RUN_LEGACY);
    }
  });

  it("is capped at the latest 20 of the user's runs", async () => {
    for (let i = 0; i < 30; i++) {
      fake.addRun({
        id: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}`,
        user_id: USER_A,
        created_at: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        analysis: analysisFor(`bulk ${i}`),
      });
    }
    const body = (await (await getList(listReq(bearer("tok-a")))).json()) as { runs: Array<{ id: string; created_at: string }> };
    expect(body.runs).toHaveLength(20);
    const times = body.runs.map((r) => r.created_at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(body.runs[0].id).toBe(RUN_A2); // the newest of all 32
    expect(storeReads()[storeReads().length - 1].url).toContain("limit=20");
  });

  it("client-supplied user ids, filters, limits and cursors are inert: the query carries only the verified id and limit 20", async () => {
    const res = await getList(listReq(bearer("tok-a"), `?user_id=${USER_B}&userId=${USER_B}&email=bob@example.com&limit=1000&cursor=abc&status=all&select=*`));
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { runs: Array<{ id: string }> }).runs.map((r) => r.id);
    expect(ids).toEqual([RUN_A2, RUN_A1]);
    const url = new URL(storeReads()[0].url);
    expect(url.searchParams.get("user_id")).toBe(`eq.${USER_A}`);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.search).not.toContain(USER_B);
    expect(url.search).not.toContain("cursor");
    expect(url.searchParams.get("select")).not.toContain("*");
  });

  it("selects an explicit allow-list: no request, email, image_*, or full analysis column is ever requested", async () => {
    await getList(listReq(bearer("tok-a")));
    const select = new URL(storeReads()[0].url).searchParams.get("select") ?? "";
    for (const forbidden of ["image_", "user_email", "request", "app_version", "error"]) expect(select).not.toContain(forbidden);
    expect(select.split(",").filter((c) => c === "analysis")).toHaveLength(0); // only JSON-path fragments of it
  });

  it("defence in depth: a row the store returns for ANOTHER user is dropped, malformed rows are skipped", async () => {
    const hostile = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/rest/v1/scan_runs")) {
        return new Response(
          JSON.stringify([
            { id: RUN_B1, user_id: USER_B, created_at: "2026-10-03T12:00:00.000Z", source: "manual", status: "scored", product_name: "Bob's" },
            { id: "not-a-uuid", user_id: USER_A, created_at: "2026-10-03T12:00:00.000Z", source: "manual", status: "scored" },
            { id: RUN_A1, user_id: USER_A, created_at: "2026-10-03T10:00:00.000Z", source: "weird", status: "scored" },
            { id: RUN_A2, user_id: USER_A, created_at: "2026-10-03T11:00:00.000Z", source: "manual", status: "scored", product_name: "x\u0000\n  y".padEnd(400, "z") },
            "garbage",
            null,
          ]),
          { status: 200 },
        );
      }
      return fake.fetch(input, init);
    }) as typeof fetch;
    const out = await listScanRuns(USER_A, hostile);
    expect(out).toMatchObject({ status: "ok" });
    const runs = out.status === "ok" ? out.runs : [];
    expect(runs.map((r) => r.id)).toEqual([RUN_A2]);
    expect(runs[0].product_name).toMatch(/^x y/);
    expect(runs[0].product_name).not.toMatch(/[\u0000-\u001f]/);
    expect((runs[0].product_name ?? "").length).toBeLessThanOrEqual(120);
  });

  it("store outage / bad answers: bounded 502 history_failed, never a secret or provider text, never a model call", async () => {
    process.env.DEEPSEEK_API_KEY = "test-model-key";
    for (const mode of ["down", "throw", "notjson", "notarray", "huge"] as const) {
      fake.readMode = mode;
      const res = await getList(listReq(bearer("tok-a")));
      expect(res.status, mode).toBe(502);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("history_failed");
      noSecrets(JSON.stringify(body));
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fake.modelCalls).toBe(0);
  });

  it("listScanRuns without configuration is 'unavailable' and never calls fetch", async () => {
    delete process.env.SUPABASE_URL;
    const out = await listScanRuns(USER_A, fake.fetch);
    expect(out).toEqual({ status: "unavailable" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("GET /api/scan/history/[id]: authentication and id validation", () => {
  it("401 before the store is touched for no/invalid/non-Google tokens; 503 when verification is unavailable", async () => {
    for (const headers of [{}, { authorization: "Bearer a b" }, bearer("nope"), bearer("tok-mail")]) {
      const res = await detail(RUN_A1, headers);
      expect(res.status).toBe(401);
      noSecrets(JSON.stringify(await res.json()));
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(storeReads()).toHaveLength(0);
    fake.authMode = "throw";
    expect((await detail(RUN_A1, bearer("tok-a"))).status).toBe(503);
    expect(storeReads()).toHaveLength(0);
  });

  it("401 is independent of SCAN_REQUIRE_AUTH", async () => {
    delete process.env.SCAN_REQUIRE_AUTH;
    expect((await detail(RUN_A1)).status).toBe(401);
    process.env.SCAN_REQUIRE_AUTH = "1";
    expect((await detail(RUN_A1)).status).toBe(401);
  });

  it("a non-UUID id is a 400 and never reaches the store (path traversal, injection, filters, case games)", async () => {
    for (const id of ["abc", "../../../etc/passwd", "1; drop table scan_runs", `${RUN_A1}&user_id=eq.${USER_B}`, `${RUN_A1}%0a`, `${RUN_A1} `, "eq.1", "*", "{}", "", `${RUN_A1}/extra`, "11111111-1111-9111-8111-111111111111", RUN_A1.slice(0, -1)]) {
      const res = await detail(id, bearer("tok-a"));
      expect(res.status, JSON.stringify(id)).toBe(400);
      expect(((await res.json()) as { status: string }).status).toBe("bad_request");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(storeReads()).toHaveLength(0);
  });
});

describe("GET /api/scan/history/[id]: owner-filtered detail", () => {
  it("returns {status:'ok', run_id, analysis} for the owner, verbatim, with a reconstructed run_id and sanitised app_version", async () => {
    const res = await detail(RUN_A1, bearer("tok-a"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { status: string; run_id: string; analysis: Record<string, unknown> };
    expect(Object.keys(body).sort()).toEqual(["analysis", "run_id", "status"]);
    expect(body.status).toBe("ok");
    expect(body.run_id).toBe(RUN_A1);
    expect(body.analysis.run_id).toBe(RUN_A1); // the stale stored id is replaced by the row's own
    expect(body.analysis.schema_version).toBe("ScanAnalysisV1");
    expect(body.analysis.status).toBe("scored");
    expect(body.analysis.evidence).toEqual({ score: 42, secret_marker: "SAVED_EVIDENCE_PAYLOAD" }); // verbatim saved payload
    expect(body.analysis.app_version).toEqual({ package_version: "0.1.0", git_sha: "deadbeef", git_ref: "main", deployment_id: null, vercel_env: "production", url: "x.vercel.app" });
  });

  it("never exposes a photo, storage path, bucket, hash, signed URL, request, owner email or id", async () => {
    const res = await detail(RUN_A1, bearer("tok-a"));
    const text = JSON.stringify(await res.json());
    for (const leak of ["persistence", "scan-images", "original.png", "sha256", "image_", "signed", "token=", "request", "content_type", "alice@example.com", "user_email", USER_A, FAKE_KEY, "secret_extra", "stale-id", "9.9.9"]) {
      expect(text, leak).not.toContain(leak);
    }
    const select = new URL(storeReads()[0].url).searchParams.get("select") ?? "";
    for (const forbidden of ["image_", "user_email", "request"]) expect(select).not.toContain(forbidden);
    // No storage read of any kind, no model call.
    expect(fake.callsTo("/storage/")).toHaveLength(0);
    expect(fake.modelCalls).toBe(0);
  });

  it("returns only allow-listed top-level analysis keys: an unlisted field stored later (or planted) never leaves, listed ones pass through verbatim", async () => {
    const RUN_ALLOW = "aaaaaaaa-aaaa-4aaa-8aaa-000000000009";
    const unlisted = {
      image_url: "https://signed.example/photo?token=SIGNED_PHOTO_TOKEN",
      debug_trace: "UNLISTED_DEBUG_TRACE",
      user_email: "alice@example.com",
      request: { content_type: "image/png" },
      persistence: { status: "stored", image: { bucket: "scan-images", path: "p/original.png", sha256: "e".repeat(64) } },
    };
    const listed: Record<string, unknown> = {};
    // The reader only insists that schema_version and status are strings; every
    // other listed key is opaque to it, so a marker object stands in for each.
    for (const key of ANALYSIS_KEYS) listed[key] = key === "schema_version" || key === "status" ? `LISTED_${key}` : { marker: `LISTED_${key}` };
    fake.addRun({
      id: RUN_ALLOW,
      user_id: USER_A,
      created_at: "2026-10-03T14:00:00.000Z",
      analysis: { ...listed, ...unlisted, run_id: "stale-id", app_version: { package_version: "9.9.9" } },
    });
    const out = await getScanRun(USER_A, RUN_ALLOW, fake.fetch);
    expect(out.status).toBe("ok");
    const analysis = out.status === "ok" ? out.analysis : {};
    // Exactly the allow-list, plus the two keys restated from the ROW (the fake
    // gives every row the six-field app_version default).
    expect(Object.keys(analysis).sort()).toEqual([...ANALYSIS_KEYS, "app_version", "run_id"].sort());
    for (const key of ANALYSIS_KEYS) expect(analysis[key], key).toEqual(listed[key]);
    expect(analysis.run_id).toBe(RUN_ALLOW);
    const text = JSON.stringify(analysis);
    expect(analysis.app_version).toEqual({ package_version: "0.0.0", git_sha: null, git_ref: null, deployment_id: null, vercel_env: null, url: null });
    for (const leak of ["SIGNED_PHOTO_TOKEN", "UNLISTED_DEBUG_TRACE", "alice@example.com", "content_type", "scan-images", "original.png", "persistence", "stale-id", "9.9.9"]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("filters on BOTH id and the verified owner inside the store query", async () => {
    await detail(RUN_A1, bearer("tok-a"));
    const url = new URL(storeReads()[0].url);
    expect(url.searchParams.get("id")).toBe(`eq.${RUN_A1}`);
    expect(url.searchParams.get("user_id")).toBe(`eq.${USER_A}`);
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("uppercase UUIDs are normalised, not a way around the filter", async () => {
    const res = await detail(RUN_A1.toUpperCase(), bearer("tok-a"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { run_id: string }).run_id).toBe(RUN_A1);
    const cross = await detail(RUN_B1.toUpperCase(), bearer("tok-a"));
    expect(cross.status).toBe(404);
  });

  it("cross-owner, unowned legacy and missing runs are the SAME 404, byte for byte", async () => {
    const crossOwner = await detail(RUN_B1, bearer("tok-a"));
    const legacy = await detail(RUN_LEGACY, bearer("tok-a"));
    const missing = await detail(RUN_MISSING, bearer("tok-a"));
    const bodies = await Promise.all([crossOwner, legacy, missing].map((r) => r.text()));
    expect([crossOwner.status, legacy.status, missing.status]).toEqual([404, 404, 404]);
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect(JSON.parse(bodies[0])).toMatchObject({ status: "not_found" });
    for (const r of [crossOwner, legacy, missing]) expect(r.headers.get("Cache-Control")).toBe("no-store");
    for (const b of bodies) {
      expect(b).not.toContain("Bob");
      expect(b).not.toContain("Legacy");
    }
    // And symmetrically for the other user.
    expect((await detail(RUN_A1, bearer("tok-b"))).status).toBe(404);
    expect((await detail(RUN_LEGACY, bearer("tok-b"))).status).toBe(404);
  });

  it("defence in depth: a row returned for another owner despite the filter is a 404, not a leak", async () => {
    const hostile = (async () =>
      new Response(JSON.stringify([{ id: RUN_B1, user_id: USER_B, source: "photo", status: "scored", analysis: analysisFor("Bob's") }]), { status: 200 })) as typeof fetch;
    expect(await getScanRun(USER_A, RUN_B1, hostile)).toEqual({ status: "not_found" });
    const wrongId = (async () =>
      new Response(JSON.stringify([{ id: RUN_B1, user_id: USER_A, source: "photo", status: "scored", analysis: analysisFor("x") }]), { status: 200 })) as typeof fetch;
    expect(await getScanRun(USER_A, RUN_A1, wrongId)).toEqual({ status: "not_found" });
  });

  it("a saved row with no analysis or a malformed one is a bounded 502, never a half-built payload", async () => {
    fake.addRun({ id: "f0f0f0f0-f0f0-40f0-80f0-000000000001", user_id: USER_A, analysis: null });
    fake.addRun({ id: "f0f0f0f0-f0f0-40f0-80f0-000000000002", user_id: USER_A, analysis: { nothing: "useful" } });
    for (const id of ["f0f0f0f0-f0f0-40f0-80f0-000000000001", "f0f0f0f0-f0f0-40f0-80f0-000000000002"]) {
      const res = await detail(id, bearer("tok-a"));
      expect(res.status, id).toBe(502);
      expect(((await res.json()) as { status: string }).status).toBe("history_failed");
    }
    // ...and the list never offers a row it could not open.
    const list = (await (await getList(listReq(bearer("tok-a")))).json()) as { runs: Array<{ id: string }> };
    expect(list.runs.map((r) => r.id)).not.toContain("f0f0f0f0-f0f0-40f0-80f0-000000000001");
  });

  it("store outage / bad answers: bounded 502 history_failed with no secret or provider text", async () => {
    for (const mode of ["down", "throw", "notjson", "notarray", "huge"] as const) {
      fake.readMode = mode;
      const res = await detail(RUN_A1, bearer("tok-a"));
      expect(res.status, mode).toBe(502);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("history_failed");
      noSecrets(JSON.stringify(body));
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("an oversized saved analysis is refused (bounded), not buffered whole", async () => {
    fake.addRun({
      id: "f1f1f1f1-f1f1-41f1-81f1-000000000001",
      user_id: USER_A,
      analysis: { schema_version: "ScanAnalysisV1", status: "scored", blob: "x".repeat(3 * 1024 * 1024) },
    });
    const res = await detail("f1f1f1f1-f1f1-41f1-81f1-000000000001", bearer("tok-a"));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { status: string }).status).toBe("history_failed");
  });

  it("getScanRun without configuration is 'unavailable' and never calls fetch; with a bad owner id it fails closed", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await getScanRun(USER_A, RUN_A1, fake.fetch)).toEqual({ status: "unavailable" });
    expect(fake.calls).toHaveLength(0);
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    expect(await getScanRun("not-a-uuid", RUN_A1, fake.fetch)).toEqual({ status: "failed" });
    expect(await listScanRuns("not-a-uuid", fake.fetch)).toEqual({ status: "failed" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("static guarantees of the history surface", () => {
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  it("the history routes export only GET and never read a client-supplied owner", () => {
    for (const rel of ["app/api/scan/history/route.ts", "app/api/scan/history/[id]/route.ts"]) {
      const src = read(rel);
      expect(src, rel).toMatch(/export async function GET/);
      expect(src, rel).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
      expect(src, rel).not.toMatch(/searchParams|new URL\(|request\.url|\.json\(\)|formData|request\.text/);
      expect(src, rel).toMatch(/tokenRequired: true, requireGoogle: true/); // regardless of SCAN_REQUIRE_AUTH
      expect(src, rel).not.toMatch(/scanAuthRequired/);
    }
  });

  it("the reader never imports a model, pipeline, analyzer or storage-signing code", () => {
    const src = read("lib/scan-history/reader.ts");
    expect(src).not.toMatch(/from "@\/lib\/analyze/);
    expect(src).not.toMatch(/createSignedUrl|sign\//);
    expect(src).not.toMatch(/\/storage\/v1/);
  });

  it("the analysis allow-list is only a type-level view of ScanAnalysis: no analyzer code, no restated key, and a compile-time coverage check", () => {
    const src = read("lib/scan-history/analysis-keys.ts");
    // The ONLY analyzer import is the erased `import type`.
    const analyzerImports = src.match(/^import .*"@\/lib\/analyze[^"]*";$/gm) ?? [];
    expect(analyzerImports).toEqual(['import type { ScanAnalysis } from "@/lib/analyze/scan";']);
    // The coverage assertion that makes `npm run typecheck` / `next build` fail on drift.
    expect(src).toMatch(/Exclude<keyof ScanAnalysis, Listed \| Restated>/);
    expect(src).toMatch(/Exclude<Listed, keyof ScanAnalysis>/);
    expect(src).toMatch(/ANALYSIS_KEYS_COVER_THE_TYPE: AnalysisKeysCoverTheType = true/);
    // The three keys the reader restates or drops are never allow-listed.
    expect(new Set(ANALYSIS_KEYS).size).toBe(ANALYSIS_KEYS.length);
    for (const restated of ["run_id", "app_version", "persistence"]) expect(ANALYSIS_KEYS as readonly string[]).not.toContain(restated);
    // And the reader uses the list (not a spread of the stored payload).
    const reader = read("lib/scan-history/reader.ts");
    expect(reader).toMatch(/for \(const key of ANALYSIS_KEYS\)/);
    expect(reader).not.toMatch(/\{ \.\.\.saved \}/);
  });

  it("no client component imports the server auth / history modules", () => {
    const dir = path.join(ROOT, "components");
    for (const file of fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      expect(text, file).not.toMatch(/lib\/auth\/server-auth|lib\/auth\/claim|scan-history\/reader|scan-history\/store/);
    }
  });
});
