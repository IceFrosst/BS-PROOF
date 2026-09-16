/*
 * DURABLE SCAN-RUN HISTORY (lib/scan-history/store.ts), with zero real network
 * calls -- every test injects its own `fetch`.
 *
 * What is pinned:
 *   - unconfigured (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) never throws
 *     and never calls fetch: `unavailable`, not a crash -- local/test builds
 *     need no credentials
 *   - a successful photo run uploads the exact bytes to the private bucket at
 *     "<run_id>/original.<ext>" and stores the real SHA-256 alongside it,
 *     never the bytes themselves, in the database row
 *   - image upload failing does not stop the run row from being written (the
 *     failure is reported honestly on image_status, not swallowed)
 *   - a DB insert failure AFTER a successful image upload best-effort deletes
 *     the now-orphaned image
 *   - app_version reads package.json plus Vercel's own env vars, honestly
 *     null off Vercel
 *   - scanHistorySatisfies enforces the fail-closed bar per source
 *   - the service role key is never present in a returned outcome, and the
 *     module has no route into a client bundle
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appVersionInfo,
  newRunId,
  recordScanRun,
  scanHistoryConfigured,
  scanHistoryRequired,
  scanHistorySatisfies,
  SCAN_IMAGES_BUCKET,
  type ScanHistoryOutcome,
} from "@/lib/scan-history/store";

const ROOT = process.cwd();
const FAKE_URL = "https://fake-project.supabase.co";
const FAKE_KEY = "sb_service_role_super_secret_test_key";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_HISTORY_REQUIRED", "VERCEL_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_REF", "VERCEL_DEPLOYMENT_ID", "VERCEL_ENV", "VERCEL_URL"] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function configureEnv() {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
}

const saved = { ...process.env };
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function recordingFetch(
  handler: (call: Call) => Response,
): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers ?? {};
    for (const [k, v] of Object.entries(rawHeaders as Record<string, string>)) headers[k.toLowerCase()] = v;
    calls.push({ url, method, headers, body: init?.body });
    return handler({ url, method, headers, body: init?.body });
  }) as typeof fetch;
  return { fetch: fn, calls };
}

describe("appVersionInfo", () => {
  it("always reports the real package.json version, honestly null off Vercel", () => {
    clearEnv();
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
    const info = appVersionInfo();
    expect(info.package_version).toBe(pkg.version);
    expect(info.git_sha).toBeNull();
    expect(info.deployment_id).toBeNull();
    expect(info.vercel_env).toBeNull();
    expect(info.url).toBeNull();
  });

  it("reflects Vercel's own env vars when present", () => {
    clearEnv();
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123deadbeef";
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_test123";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "bs-proof-dashboard.vercel.app";
    const info = appVersionInfo();
    expect(info).toMatchObject({
      git_sha: "abc123deadbeef",
      git_ref: "main",
      deployment_id: "dpl_test123",
      vercel_env: "production",
      url: "bs-proof-dashboard.vercel.app",
    });
  });
});

describe("configuration and the fail-closed switch", () => {
  it("is unconfigured with no env, configured with both", () => {
    clearEnv();
    expect(scanHistoryConfigured()).toBe(false);
    process.env.SUPABASE_URL = FAKE_URL;
    expect(scanHistoryConfigured()).toBe(false); // key alone is not enough
    configureEnv();
    expect(scanHistoryConfigured()).toBe(true);
  });

  it("scanHistoryRequired reads exactly SCAN_HISTORY_REQUIRED=1", () => {
    clearEnv();
    expect(scanHistoryRequired()).toBe(false);
    process.env.SCAN_HISTORY_REQUIRED = "true"; // anything but the literal "1" stays off
    expect(scanHistoryRequired()).toBe(false);
    process.env.SCAN_HISTORY_REQUIRED = "1";
    expect(scanHistoryRequired()).toBe(true);
  });
});

describe("recordScanRun: unconfigured deployment", () => {
  it("never calls fetch and reports unavailable, for a manual run and a photo run alike", async () => {
    clearEnv();
    const { fetch: fakeFetch, calls } = recordingFetch(() => new Response(null, { status: 200 }));
    const manual = await recordScanRun(
      { runId: newRunId(), source: "manual", status: "scored", error: null, request: { ingredient: "creatine" }, analysis: { ok: true } },
      fakeFetch,
    );
    expect(manual).toMatchObject({ status: "unavailable", image: { status: "not_applicable" } });
    expect(calls).toHaveLength(0);

    const bytes = Buffer.from("fake image bytes");
    const photo = await recordScanRun(
      { runId: newRunId(), source: "photo", status: "scored", error: null, request: { content_type: "image/png" }, analysis: { ok: true }, image: { bytes, mimeType: "image/png" } },
      fakeFetch,
    );
    expect(photo.status).toBe("unavailable");
    // The image is honestly reported as unavailable too -- never "stored" -- but its
    // hash is still computable from bytes already in memory, so it is not thrown away.
    expect(photo.image.status).toBe("unavailable");
    expect(photo.image.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(calls).toHaveLength(0);
  });
});

describe("recordScanRun: configured deployment", () => {
  it("uploads a photo's exact bytes to the private bucket and stores its real SHA-256, never the bytes", async () => {
    configureEnv();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
    const expectedSha = createHash("sha256").update(bytes).digest("hex");
    const runId = newRunId();
    const { fetch: fakeFetch, calls } = recordingFetch((call) => {
      if (call.method === "POST" && call.url.includes("/storage/v1/object/")) return new Response(null, { status: 200 });
      if (call.method === "POST" && call.url.includes("/rest/v1/scan_runs")) return new Response(null, { status: 201 });
      return new Response("unexpected", { status: 500 });
    });

    const outcome = await recordScanRun(
      { runId, source: "photo", status: "scored", error: null, request: { content_type: "image/png", size_bytes: bytes.length }, analysis: { ok: true }, image: { bytes, mimeType: "image/png" } },
      fakeFetch,
    );

    expect(outcome.status).toBe("stored");
    expect(outcome.image).toEqual({ status: "stored", bucket: SCAN_IMAGES_BUCKET, path: `${runId}/original.png`, mime_type: "image/png", bytes: bytes.length, sha256: expectedSha });

    const upload = calls.find((c) => c.url.includes("/storage/v1/object/"));
    expect(upload?.url).toBe(`${FAKE_URL}/storage/v1/object/${SCAN_IMAGES_BUCKET}/${runId}/original.png`);
    expect(upload?.body).toBe(bytes); // the exact buffer, never re-encoded
    expect(upload?.headers.authorization).toBe(`Bearer ${FAKE_KEY}`);

    const insert = calls.find((c) => c.url.includes("/rest/v1/scan_runs"));
    const row = JSON.parse(String(insert?.body)) as Array<Record<string, unknown>>;
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ id: runId, source: "photo", status: "scored", image_status: "stored", image_sha256: expectedSha, image_bytes: bytes.length });
    // Never the image bytes or a base64 rendering of them, anywhere in the row.
    expect(JSON.stringify(row[0])).not.toContain(bytes.toString("base64"));
    expect((row[0].app_version as { package_version: string }).package_version).toBeTruthy();
  });

  it("records a failed image upload on the row instead of losing it, and never claims the image is stored", async () => {
    configureEnv();
    const bytes = Buffer.from("bytes");
    let insertedImageStatus: unknown;
    const { fetch: fakeFetch } = recordingFetch((call) => {
      if (call.url.includes("/storage/v1/object/")) throw new Error("network down");
      if (call.url.includes("/rest/v1/scan_runs")) {
        insertedImageStatus = (JSON.parse(String(call.body)) as Array<{ image_status: unknown }>)[0].image_status;
        return new Response(null, { status: 201 });
      }
      return new Response("unexpected", { status: 500 });
    });
    const outcome = await recordScanRun(
      { runId: newRunId(), source: "photo", status: "scored", error: null, request: {}, analysis: { ok: true }, image: { bytes, mimeType: "image/png" } },
      fakeFetch,
    );
    expect(outcome.status).toBe("stored"); // the ROW was written
    expect(outcome.image.status).toBe("failed"); // but the image, honestly, was not
    expect(outcome.image.path).toBeNull();
    expect(outcome.image.detail).toMatch(/could not reach storage/);
    expect(insertedImageStatus).toBe("failed");
  });

  it("best-effort deletes an orphaned image when the DB insert fails after a successful upload", async () => {
    configureEnv();
    const runId = newRunId();
    const calls: Call[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, headers: {}, body: init?.body });
      if (method === "POST" && url.includes("/storage/v1/object/")) return new Response(null, { status: 200 });
      if (method === "POST" && url.includes("/rest/v1/scan_runs")) return new Response("insert failed", { status: 500 });
      if (method === "DELETE" && url.includes("/storage/v1/object/")) return new Response(null, { status: 200 });
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const outcome = await recordScanRun(
      { runId, source: "photo", status: "scored", error: null, request: {}, analysis: { ok: true }, image: { bytes: Buffer.from("x"), mimeType: "image/jpeg" } },
      fakeFetch,
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.detail).toMatch(/scan history store returned 500/);
    const deletes = calls.filter((c) => c.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toBe(`${FAKE_URL}/storage/v1/object/${SCAN_IMAGES_BUCKET}/${runId}/original.jpg`);
  });

  it("does not delete anything when the image itself never stored (nothing to orphan)", async () => {
    configureEnv();
    const calls: Call[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, headers: {}, body: init?.body });
      if (url.includes("/storage/v1/object/") && method === "POST") return new Response("nope", { status: 403 });
      if (url.includes("/rest/v1/scan_runs")) return new Response("insert failed", { status: 500 });
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    await recordScanRun(
      { runId: newRunId(), source: "photo", status: "scored", error: null, request: {}, analysis: { ok: true }, image: { bytes: Buffer.from("x"), mimeType: "image/png" } },
      fakeFetch,
    );
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });

  it("a manual run never uploads or references any image", async () => {
    configureEnv();
    const { fetch: fakeFetch, calls } = recordingFetch((call) => {
      if (call.url.includes("/rest/v1/scan_runs")) return new Response(null, { status: 201 });
      return new Response("unexpected image call for a manual run", { status: 500 });
    });
    const outcome = await recordScanRun(
      { runId: newRunId(), source: "manual", status: "scored", error: null, request: { ingredient: "creatine", form: "creatine_monohydrate" }, analysis: { ok: true } },
      fakeFetch,
    );
    expect(outcome.status).toBe("stored");
    expect(outcome.image).toEqual({ status: "not_applicable", bucket: null, path: null, mime_type: null, bytes: null, sha256: null });
    expect(calls.every((c) => !c.url.includes("/storage/v1/object/"))).toBe(true);
  });
});

describe("scanHistorySatisfies (the fail-closed bar)", () => {
  const stored = (imageStatus: ScanHistoryOutcome["image"]["status"]): ScanHistoryOutcome => ({
    status: "stored",
    run_id: "r1",
    image: { status: imageStatus, bucket: null, path: null, mime_type: null, bytes: null, sha256: null },
  });

  it("a manual run only needs its row stored", () => {
    expect(scanHistorySatisfies(stored("not_applicable"), "manual")).toBe(true);
    expect(scanHistorySatisfies({ ...stored("not_applicable"), status: "failed" }, "manual")).toBe(false);
    expect(scanHistorySatisfies({ ...stored("not_applicable"), status: "unavailable" }, "manual")).toBe(false);
  });

  it("a photo run needs BOTH the row and the image stored", () => {
    expect(scanHistorySatisfies(stored("stored"), "photo")).toBe(true);
    expect(scanHistorySatisfies(stored("failed"), "photo")).toBe(false);
    expect(scanHistorySatisfies(stored("unavailable"), "photo")).toBe(false);
    expect(scanHistorySatisfies({ ...stored("stored"), status: "failed" }, "photo")).toBe(false);
  });
});

describe("no-secret, no-browser-leakage", () => {
  it("never puts the service role key in a returned outcome", async () => {
    configureEnv();
    const { fetch: fakeFetch } = recordingFetch((call) => {
      if (call.url.includes("/storage/v1/object/")) return new Response(null, { status: 200 });
      return new Response(null, { status: 201 });
    });
    const outcome = await recordScanRun(
      { runId: newRunId(), source: "photo", status: "scored", error: null, request: {}, analysis: { ok: true }, image: { bytes: Buffer.from("x"), mimeType: "image/png" } },
      fakeFetch,
    );
    expect(JSON.stringify(outcome)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(appVersionInfo())).not.toContain(FAKE_KEY);
  });

  it("is imported only from server code, never from a client component", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib", "scan-history", "store.ts"), "utf8");
    expect(source).not.toMatch(/^"use client"/m);
    const componentFiles = fs.readdirSync(path.join(ROOT, "components")).filter((f) => f.endsWith(".tsx"));
    for (const file of componentFiles) {
      const text = fs.readFileSync(path.join(ROOT, "components", file), "utf8");
      expect(text, file).not.toMatch(/scan-history/);
    }
  });

  it("SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ alias anywhere in the codebase", () => {
    // Grepping is cheaper and more honest than trusting a comment: a
    // NEXT_PUBLIC_ prefixed copy of the service role key is exactly what would
    // ship it into the client bundle.
    const files = ["lib/scan-history/store.ts", "app/api/scan/route.ts", ".env.example"];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(text, rel).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});
