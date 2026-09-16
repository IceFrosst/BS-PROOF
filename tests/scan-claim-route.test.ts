/*
 * POST /api/scan/claim -- attaches a signed-in Supabase user to a scan run
 * (2026-09-16). Every Supabase call is a plain `fetch`, so the whole route is
 * testable with a mocked global fetch and zero network access, exactly like
 * tests/scan-history.test.ts and tests/scan-history-route.test.ts before it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/scan/claim/route";
import { claimScanRun, verifySupabaseUser } from "@/lib/auth/claim";

const ORIGINAL_ENV = { ...process.env };

function setConfigured() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
}

function clearConfig() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/scan/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/scan/claim — route contract", () => {
  it("401s when no Authorization header is present, without touching fetch", async () => {
    setConfigured();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(req({ run_id: "abc" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe("unauthorized");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("400s on a missing run_id", async () => {
    setConfigured();
    const res = await POST(req({}, { Authorization: "Bearer sometoken" }));
    expect(res.status).toBe(400);
  });

  it("400s on an unparseable body", async () => {
    setConfigured();
    const res = await POST(
      new Request("http://localhost/api/scan/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("503s when Supabase env vars are not configured", async () => {
    clearConfig();
    const res = await POST(req({ run_id: "abc" }, { Authorization: "Bearer sometoken" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("unavailable");
  });

  it("401s on a bad/expired token (Supabase Auth rejects it)", async () => {
    setConfigured();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/auth/v1/user");
        return new Response("unauthorized", { status: 401 });
      }),
    );
    const res = await POST(req({ run_id: "abc" }, { Authorization: "Bearer bad-token" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe("unauthorized");
    expect(JSON.stringify(body)).not.toContain("service-role-secret");
  });

  it("404s when the run id matches no row (PATCH returns an empty array)", async () => {
    setConfigured();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "user-1", email: "person@example.com" }), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_runs") && init?.method === "PATCH") {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await POST(req({ run_id: "no-such-run" }, { Authorization: "Bearer good-token" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe("not_found");
  });

  it("200s on the happy path and never leaks the service role key", async () => {
    setConfigured();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).includes("/auth/v1/user")) {
          expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer good-token");
          return new Response(JSON.stringify({ id: "user-1", email: "person@example.com" }), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_runs") && init?.method === "PATCH") {
          const patchBody = JSON.parse(String(init?.body));
          expect(patchBody).toEqual({ user_id: "user-1", user_email: "person@example.com" });
          return new Response(JSON.stringify([{ id: "run-1", user_id: "user-1" }]), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_users") && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_users") && init?.method === "POST") {
          const upsertBody = JSON.parse(String(init?.body));
          expect(upsertBody[0]).toMatchObject({ user_id: "user-1", email: "person@example.com", scans: 1 });
          return new Response(null, { status: 201 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await POST(req({ run_id: "run-1" }, { Authorization: "Bearer good-token" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "claimed" });
    expect(JSON.stringify(body)).not.toContain("service-role-secret");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // Verified the user, patched the run, read then upserted the ledger.
    expect(calls.some((c) => c.includes("/auth/v1/user"))).toBe(true);
    expect(calls.some((c) => c.startsWith("PATCH") && c.includes("scan_runs"))).toBe(true);
    expect(calls.some((c) => c.includes("scan_users"))).toBe(true);
  });

  it("increments an existing user's scans rather than resetting it", async () => {
    setConfigured();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "user-1", email: "person@example.com" }), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_runs") && init?.method === "PATCH") {
          return new Response(JSON.stringify([{ id: "run-2" }]), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_users") && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify([{ scans: 4, first_seen_at: "2026-01-01T00:00:00Z" }]), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_users") && init?.method === "POST") {
          const upsertBody = JSON.parse(String(init?.body));
          expect(upsertBody[0].scans).toBe(5);
          expect(upsertBody[0].first_seen_at).toBe("2026-01-01T00:00:00Z");
          return new Response(null, { status: 201 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await POST(req({ run_id: "run-2" }, { Authorization: "Bearer good-token" }));
    expect(res.status).toBe(200);
  });

  it("never throws even when the ledger upsert fails", async () => {
    setConfigured();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "user-1", email: null }), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_runs") && init?.method === "PATCH") {
          return new Response(JSON.stringify([{ id: "run-3" }]), { status: 200 });
        }
        if (String(url).includes("/rest/v1/scan_users")) {
          throw new Error("network down");
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await POST(req({ run_id: "run-3" }, { Authorization: "Bearer good-token" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("claimed");
  });
});

describe("lib/auth/claim.ts unit-level", () => {
  beforeEach(() => setConfigured());

  it("verifySupabaseUser returns null (not a throw) on a network failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("dns fail"));
    const result = await verifySupabaseUser({ url: "https://x.supabase.co", serviceKey: "k" }, "token", fetchFn as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("verifySupabaseUser returns null for an empty token without calling fetch", async () => {
    const fetchFn = vi.fn();
    const result = await verifySupabaseUser({ url: "https://x.supabase.co", serviceKey: "k" }, "   ", fetchFn as unknown as typeof fetch);
    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("claimScanRun reports unavailable, with a detail string, when unconfigured", async () => {
    clearConfig();
    const outcome = await claimScanRun({ runId: "r", accessToken: "t" });
    expect(outcome.status).toBe("unavailable");
    expect(outcome.detail).toMatch(/SUPABASE_URL/);
  });
});
