// @vitest-environment node
/*
 * POST /api/scan/claim -- OWNER-FILTERED VERIFICATION ONLY (2026-10-03).
 *
 * This route used to PATCH `scan_runs.user_id` for whatever run id it was
 * handed, so a valid session plus a known/guessed UUID took over any run,
 * including one another person already owned. It now only CONFIRMS a run that
 * is already the verified caller's. Every Supabase call goes through the fake
 * in tests/helpers/fake-supabase.ts (which applies PostgREST filters for
 * real); zero network access.
 *
 * What is pinned:
 *   - no write to scan_runs, ever; PATCH/PUT/DELETE are not even exported
 *   - cross-owner, unowned-legacy and missing runs are the same 404; the owner
 *     of a row never changes, null stays null
 *   - 401 / 400 / 413 / 503 are decided before the store is touched, with
 *     generic bodies (no provider text, no key)
 *   - the scan_users ledger is idempotent: repeat and concurrent claims never
 *     double count, and first_seen_at is never rewritten
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as claimRoute from "@/app/api/scan/claim/route";
import { POST } from "@/app/api/scan/claim/route";
import { claimScanRun } from "@/lib/auth/claim";
import { FAKE_KEY, FAKE_URL, FakeSupabase, PROVIDER_FRAGMENT, USER_A, USER_B, USER_C, emailUser, googleUser } from "./helpers/fake-supabase";

const ROOT = process.cwd();
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_REQUIRE_AUTH"] as const;
const saved = { ...process.env };
const originalFetch = global.fetch;
let fake: FakeSupabase;

const RUN_A1 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RUN_A2 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const RUN_B1 = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const RUN_LEGACY = "cccccccc-cccc-4ccc-8ccc-000000000001";
const RUN_MISSING = "dddddddd-dddd-4ddd-8ddd-000000000001";

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
  fake = new FakeSupabase();
  fake.addUser("tok-a", googleUser(USER_A, "alice@example.com"));
  fake.addUser("tok-b", googleUser(USER_B, "bob@example.com"));
  fake.addUser("tok-mail", emailUser(USER_C, "carol@example.com"));
  fake.addRun({ id: RUN_A1, user_id: USER_A, user_email: "alice@example.com" });
  fake.addRun({ id: RUN_A2, user_id: USER_A, user_email: "alice@example.com" });
  fake.addRun({ id: RUN_B1, user_id: USER_B, user_email: "bob@example.com" });
  fake.addRun({ id: RUN_LEGACY, user_id: null });
  global.fetch = fake.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function req(body: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  return new Request("http://localhost/api/scan/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const noSecrets = (text: string) => {
  for (const needle of [FAKE_KEY, PROVIDER_FRAGMENT, FAKE_URL, "alice@example.com", "bob@example.com"]) expect(text).not.toContain(needle);
};
const ownerOf = (id: string) => fake.runs.find((r) => r.id === id)?.user_id ?? null;

describe("POST /api/scan/claim: request validation and authentication", () => {
  it("401s when no Authorization header is present, without touching fetch", async () => {
    const res = await POST(req({ run_id: RUN_A1 }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { status: string }).status).toBe("unauthorized");
    expect(fake.calls).toHaveLength(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("401s on a malformed Authorization header without touching fetch", async () => {
    for (const authorization of ["Basic abc", "Bearer", "Bearer a b", "Token x"]) {
      expect((await POST(req({ run_id: RUN_A1 }, { authorization }))).status, authorization).toBe(401);
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("400s on a missing run_id, an unparseable body, and any run_id that is not a UUID -- before Supabase is asked anything", async () => {
    expect((await POST(req({}, bearer("tok-a")))).status).toBe(400);
    expect((await POST(req(null, bearer("tok-a"), "not json"))).status).toBe(400);
    for (const run_id of ["abc", "", 7, null, ["x"], { a: 1 }, `${RUN_A1}&user_id=eq.${USER_B}`, "1; drop table scan_runs", "../x"]) {
      const res = await POST(req({ run_id }, bearer("tok-a")));
      expect(res.status, JSON.stringify(run_id)).toBe(400);
      expect(((await res.json()) as { status: string }).status).toBe("bad_request");
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("413s on an oversized body", async () => {
    const res = await POST(req({ run_id: RUN_A1, pad: "x".repeat(10_000) }, bearer("tok-a")));
    expect(res.status).toBe(413);
    expect(fake.calls).toHaveLength(0);
  });

  it("503 auth_unavailable when Supabase is not configured, and when Auth is down -- never 401, never a pass", async () => {
    delete process.env.SUPABASE_URL;
    const unconfigured = await POST(req({ run_id: RUN_A1 }, bearer("tok-a")));
    expect(unconfigured.status).toBe(503);
    expect(((await unconfigured.json()) as { status: string }).status).toBe("auth_unavailable");
    process.env.SUPABASE_URL = FAKE_URL;
    fake.authMode = "outage5xx";
    const down = await POST(req({ run_id: RUN_A1 }, bearer("tok-a")));
    expect(down.status).toBe(503);
    noSecrets(JSON.stringify(await down.json()));
    expect(fake.callsTo("/rest/v1/")).toHaveLength(0);
  });

  it("401s on a bad/expired token with a generic body: no provider text, no key", async () => {
    const res = await POST(req({ run_id: RUN_A1 }, bearer("expired-token")));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe("unauthorized");
    noSecrets(JSON.stringify(body));
    expect(fake.callsTo("/rest/v1/")).toHaveLength(0);
  });

  it("requires a Google identity when SCAN_REQUIRE_AUTH is on, and accepts a verified user when it is off", async () => {
    fake.addRun({ id: "eeeeeeee-eeee-4eee-8eee-000000000001", user_id: USER_C });
    process.env.SCAN_REQUIRE_AUTH = "1";
    expect((await POST(req({ run_id: "eeeeeeee-eeee-4eee-8eee-000000000001" }, bearer("tok-mail")))).status).toBe(401);
    delete process.env.SCAN_REQUIRE_AUTH;
    expect((await POST(req({ run_id: "eeeeeeee-eeee-4eee-8eee-000000000001" }, bearer("tok-mail")))).status).toBe(200);
  });
});

describe("POST /api/scan/claim: it confirms ownership and NEVER assigns it", () => {
  it("200 {status:'claimed'} for a run the caller already owns -- with an owner-filtered READ and no write to scan_runs", async () => {
    const res = await POST(req({ run_id: RUN_A1 }, bearer("tok-a")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "claimed" });
    noSecrets(JSON.stringify(body));
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    expect(fake.nonGetRunWrites).toHaveLength(0);
    const lookup = fake.calls.find((c) => c.url.includes(`id=eq.${RUN_A1}`));
    expect(lookup?.method).toBe("GET");
    expect(lookup?.url).toContain(`user_id=eq.${USER_A}`);
    expect(ownerOf(RUN_A1)).toBe(USER_A);
  });

  it("a run OWNED BY SOMEONE ELSE is a 404 and its owner does not change (the takeover this route used to allow)", async () => {
    const res = await POST(req({ run_id: RUN_B1 }, bearer("tok-a")));
    expect(res.status).toBe(404);
    expect(ownerOf(RUN_B1)).toBe(USER_B);
    expect(fake.runs.find((r) => r.id === RUN_B1)?.user_email).toBe("bob@example.com");
    expect(fake.nonGetRunWrites).toHaveLength(0);
  });

  it("an UNOWNED legacy run cannot be claimed by knowing its UUID: 404, and it stays null forever", async () => {
    for (const t of ["tok-a", "tok-b"]) {
      const res = await POST(req({ run_id: RUN_LEGACY }, bearer(t)));
      expect(res.status, t).toBe(404);
    }
    expect(ownerOf(RUN_LEGACY)).toBeNull();
    expect("user_email" in (fake.runs.find((r) => r.id === RUN_LEGACY) ?? {})).toBe(false);
    expect(fake.nonGetRunWrites).toHaveLength(0);
    expect(fake.scanUsers.size).toBe(0); // nothing was attributed to anybody
  });

  it("cross-owner, unowned and missing are the SAME 404 response, byte for byte", async () => {
    const responses = await Promise.all([RUN_B1, RUN_LEGACY, RUN_MISSING].map((id) => POST(req({ run_id: id }, bearer("tok-a")))));
    const texts = await Promise.all(responses.map((r) => r.text()));
    expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
    expect(texts[0]).toBe(texts[1]);
    expect(texts[1]).toBe(texts[2]);
    expect(JSON.parse(texts[0])).toMatchObject({ status: "not_found" });
    noSecrets(texts[0]);
  });

  it("the client cannot name the owner: extra body fields and headers are ignored", async () => {
    const res = await POST(req({ run_id: RUN_B1, user_id: USER_A, user_email: "alice@example.com", owner: USER_A }, { ...bearer("tok-a"), "x-user-id": USER_A }));
    expect(res.status).toBe(404);
    expect(ownerOf(RUN_B1)).toBe(USER_B);
    expect(fake.nonGetRunWrites).toHaveLength(0);
  });

  it("PATCH (and every other mutating verb) is not exported: ownership cannot be assigned through this route", () => {
    const exported = Object.keys(claimRoute).filter((k) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k));
    expect(exported).toEqual(["POST"]);
  });

  it("neither claim module can write scan_runs: no PATCH/PUT/DELETE/upsert on it anywhere in the source", () => {
    for (const rel of ["lib/auth/claim.ts", "app/api/scan/claim/route.ts"]) {
      const code = fs
        .readFileSync(path.join(ROOT, rel), "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join("\n");
      expect(code, rel).not.toMatch(/method:\s*["'](PATCH|PUT|DELETE)["']/);
    }
    const claimSrc = fs.readFileSync(path.join(ROOT, "lib/auth/claim.ts"), "utf8");
    // The only POST in claim.ts targets the scan_users ledger.
    const posts = claimSrc.match(/method:\s*"POST"/g) ?? [];
    expect(posts).toHaveLength(1);
    expect(claimSrc).toMatch(/USERS_TABLE\}\?on_conflict=user_id/);
  });
});

describe("POST /api/scan/claim: the scan_users ledger never double counts", () => {
  it("scans is the exact owned-run count, however many times the same run is confirmed", async () => {
    for (let i = 0; i < 3; i++) expect((await POST(req({ run_id: RUN_A1 }, bearer("tok-a")))).status).toBe(200);
    expect(fake.scanUsers.get(USER_A)).toMatchObject({ user_id: USER_A, email: "alice@example.com", scans: 2 }); // A1 + A2, not 3 or 1
    // Confirming the other run changes nothing about the count.
    expect((await POST(req({ run_id: RUN_A2 }, bearer("tok-a")))).status).toBe(200);
    expect(fake.scanUsers.get(USER_A)).toMatchObject({ scans: 2 });
  });

  it("concurrent claims for the same run and user converge on the same count", async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => POST(req({ run_id: RUN_A1 }, bearer("tok-a")))));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(fake.scanUsers.get(USER_A)).toMatchObject({ scans: 2 });
    expect(fake.scanUsers.size).toBe(1);
  });

  it("the ledger write never rewrites first_seen_at and never blanks an email", async () => {
    fake.addUser("tok-noemail", googleUser(USER_C, null));
    fake.addRun({ id: "eeeeeeee-eeee-4eee-8eee-000000000002", user_id: USER_C });
    await POST(req({ run_id: RUN_A1 }, bearer("tok-a")));
    await POST(req({ run_id: "eeeeeeee-eeee-4eee-8eee-000000000002" }, bearer("tok-noemail")));
    const ledgerWrites = fake.calls.filter((c) => c.url.includes("/rest/v1/scan_users") && c.method === "POST");
    expect(ledgerWrites).toHaveLength(2);
    for (const call of ledgerWrites) {
      const row = (JSON.parse(String(call.body)) as Array<Record<string, unknown>>)[0];
      expect(row).not.toHaveProperty("first_seen_at");
    }
    const noEmailRow = (JSON.parse(String(ledgerWrites[1].body)) as Array<Record<string, unknown>>)[0];
    expect(noEmailRow).not.toHaveProperty("email");
    expect(fake.scanUsers.get(USER_A)?.first_seen_at).toBe("default-now"); // left to the column default
  });

  it("a failed ledger write (or count) never fails the confirmation", async () => {
    const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/rest/v1/scan_users")) throw new Error(`network down ${PROVIDER_FRAGMENT}`);
      if (url.includes("select=id&limit=1")) return new Response("boom", { status: 500 });
      return fake.fetch(input, init);
    }) as typeof fetch;
    const outcome = await claimScanRun({ runId: RUN_A1, accessToken: "tok-a" }, flaky);
    expect(outcome.status).toBe("claimed");
  });
});

describe("POST /api/scan/claim: store faults are generic and bounded", () => {
  it("a run-store outage is a 502 'failed' with no provider text, key or row data; the run is untouched", async () => {
    for (const mode of ["down", "throw", "notjson", "notarray", "huge"] as const) {
      fake.readMode = mode;
      const res = await POST(req({ run_id: RUN_A1 }, bearer("tok-a")));
      // notarray/huge parse as non-matching rows => not_found-or-failed; either way never a success.
      expect([404, 502], mode).toContain(res.status);
      const text = await res.text();
      noSecrets(text);
    }
    expect(ownerOf(RUN_A1)).toBe(USER_A);
    expect(fake.nonGetRunWrites).toHaveLength(0);
  });
});

describe("lib/auth/claim.ts unit-level", () => {
  it("claimScanRun reports unavailable, with a generic detail, when unconfigured -- and never calls fetch", async () => {
    delete process.env.SUPABASE_URL;
    const outcome = await claimScanRun({ runId: RUN_A1, accessToken: "tok-a" }, fake.fetch);
    expect(outcome.status).toBe("unavailable");
    expect(outcome.detail ?? "").not.toMatch(/KEY|secret/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("claimScanRun treats a non-UUID run id as not_found without asking Supabase for a user or a row", async () => {
    expect((await claimScanRun({ runId: "abc", accessToken: "tok-a" }, fake.fetch)).status).toBe("not_found");
    expect(fake.calls).toHaveLength(0);
  });

  it("claimScanRun never trusts a row the store returns for someone else", async () => {
    const hostile = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/rest/v1/scan_runs")) return new Response(JSON.stringify([{ id: RUN_B1, user_id: USER_B }]), { status: 200 });
      return fake.fetch(input, init);
    }) as typeof fetch;
    expect((await claimScanRun({ runId: RUN_B1, accessToken: "tok-a" }, hostile)).status).toBe("not_found");
  });
});
