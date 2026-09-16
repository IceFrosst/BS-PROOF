// @vitest-environment node
//
// The photo tests below drive a real multipart Request through `request.formData()`
// and check `instanceof File`; jsdom's own File/FormData/Request classes are a
// separate implementation from the one Next's Node runtime uses, so under the
// suite's default jsdom environment a real File never satisfies `instanceof File`
// inside the route. Node's own globals -- the ones route.ts actually runs
// under in production -- avoid that mismatch entirely.
/*
 * POST /api/scan's scan-history wiring: run id generation, app_version and
 * persistence attached to the response, and SCAN_HISTORY_REQUIRED=1's
 * fail-closed behaviour. lib/analyze/scan.ts (analyzeManual/analyzeScan) is
 * untouched by any of this -- these tests exercise the ROUTE, which attaches
 * history fields only after those functions return.
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/scan/route";

const ROOT = process.cwd();
const FAKE_URL = "https://fake-project.supabase.co";
const FAKE_KEY = "sb_service_role_super_secret_test_key";

const ENV_KEYS = [
  "LABEL_ANALYZER_ENABLED",
  "DEEPSEEK_API_KEY",
  "VISION_API_KEY",
  "GEMINI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SCAN_HISTORY_REQUIRED",
] as const;
const saved = { ...process.env };
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function noProvider() {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.VISION_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.LABEL_ANALYZER_ENABLED;
}

function noSupabase() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function withSupabase() {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
}

const manualBody = { source: "manual", ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 5, unit: "g" }, servings_per_day: 1 };
const manualRequest = () =>
  new Request("http://test/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(manualBody) });

describe("run_id and app_version are attached after analysis, regardless of persistence", () => {
  it("a manual run with no Supabase project configured still answers, honestly unavailable", async () => {
    noProvider();
    noSupabase();
    const res = await POST(manualRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run_id: string; app_version: { package_version: string }; persistence: { status: string; image: { status: string } } };
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(typeof body.run_id).toBe("string");
    expect(body.run_id.length).toBeGreaterThan(10);
    expect(body.app_version.package_version).toBe(pkg.version);
    expect(body.persistence.status).toBe("unavailable");
    expect(body.persistence.image.status).toBe("not_applicable");
  });

  it("a rejected (never-accepted) manual request carries no run_id at all", async () => {
    noProvider();
    noSupabase();
    const res = await POST(
      new Request("http://test/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "manual", ingredient: "creatine", form: "magnesium_oxide" }) }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { run_id?: string; status: string };
    expect(body.status).toBe("manual_input_invalid");
    expect(body.run_id).toBeUndefined();
  });

  it("a manual run persists when Supabase is configured and the store answers ok", async () => {
    noProvider();
    withSupabase();
    let insertedRow: Record<string, unknown> | null = null;
    const originalFetch = global.fetch;
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/rest/v1/scan_runs")) {
        insertedRow = (JSON.parse(String(init?.body)) as Array<Record<string, unknown>>)[0];
        return new Response(null, { status: 201 });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    try {
      const res = await POST(manualRequest());
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run_id: string; persistence: { status: string } };
      expect(body.persistence.status).toBe("stored");
      expect(insertedRow).toMatchObject({ id: body.run_id, source: "manual", status: "scored" });
      expect(JSON.stringify(insertedRow)).not.toContain(FAKE_KEY);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("SCAN_HISTORY_REQUIRED=1 fails closed", () => {
  it("refuses a manual request up front when history is required but unconfigured, spending no analysis", async () => {
    noProvider();
    noSupabase();
    process.env.SCAN_HISTORY_REQUIRED = "1";
    const res = await POST(manualRequest());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("scan_history_required_unavailable");
  });

  it("refuses a photo request up front the same way, before ever touching the model", async () => {
    noProvider();
    noSupabase();
    process.env.SCAN_HISTORY_REQUIRED = "1";
    process.env.DEEPSEEK_API_KEY = "test-model-key"; // analyzer would otherwise be enabled
    const originalFetch = global.fetch;
    let modelCalled = false;
    global.fetch = (async () => {
      modelCalled = true;
      throw new Error("the model must never be called when history is required but unconfigured");
    }) as typeof fetch;
    try {
      const form = new FormData();
      form.append("image", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
      const res = await POST(new Request("http://test/api/scan", { method: "POST", body: form }));
      expect(res.status).toBe(503);
      expect((await res.json() as { status: string }).status).toBe("scan_history_required_unavailable");
      expect(modelCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("answers normally with `stored` persistence when the store accepts the write", async () => {
    noProvider();
    withSupabase();
    process.env.SCAN_HISTORY_REQUIRED = "1";
    const originalFetch = global.fetch;
    global.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/rest/v1/scan_runs")) return new Response(null, { status: 201 });
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    try {
      const res = await POST(manualRequest());
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; persistence: { status: string } };
      expect(body.status).toBe("scored");
      expect(body.persistence.status).toBe("stored");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("discards a completed analysis and answers 500 when the store rejects the write", async () => {
    noProvider();
    withSupabase();
    process.env.SCAN_HISTORY_REQUIRED = "1";
    const originalFetch = global.fetch;
    global.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/rest/v1/scan_runs")) return new Response("db is down", { status: 500 });
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    try {
      const res = await POST(manualRequest());
      expect(res.status).toBe(500);
      const body = (await res.json()) as { status: string; run_id: string; product?: unknown; persistence: { status: string } };
      expect(body.status).toBe("scan_history_required_failed");
      expect(typeof body.run_id).toBe("string");
      expect(body.persistence.status).toBe("failed");
      // The analysis itself (the evidence, the product facts...) is never
      // served when it could not be durably recorded.
      expect(body.product).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("a photo run's history round trip (fake model, fake store)", () => {
  it("generates a run id, stores the image, and reports it honestly on the response", async () => {
    process.env.DEEPSEEK_API_KEY = "test-model-key";
    delete process.env.LABEL_ANALYZER_ENABLED;
    withSupabase();

    const fakeLabel = {
      ingredient_vocab_id: null,
      form_vocab_id: null,
      compound_dose_mg: null,
      is_multi_ingredient: false,
      confidence: "low",
      evidence_spans: [],
      is_supplement_label: false, // stop right after stage 0 -- no compat/company model calls to fake
    };
    const originalFetch = global.fetch;
    const storageCalls: string[] = [];
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("deepseek.com") || url.includes("generativelanguage")) {
        return new Response(
          JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fakeLabel) } }] }),
          { status: 200 },
        );
      }
      if (url.includes("/storage/v1/object/")) {
        storageCalls.push(`${method} ${url}`);
        return new Response(null, { status: 200 });
      }
      if (url.includes("/rest/v1/scan_runs")) return new Response(null, { status: 201 });
      return new Response(`unexpected ${url}`, { status: 500 });
    }) as typeof fetch;

    try {
      const form = new FormData();
      const bytes = new Uint8Array([1, 2, 3, 4]);
      form.append("image", new File([bytes], "x.png", { type: "image/png" }));
      const res = await POST(new Request("http://test/api/scan", { method: "POST", body: form }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        run_id: string;
        status: string;
        source: string;
        persistence: { status: string; image: { status: string; bucket: string | null; path: string | null; bytes: number | null; sha256: string | null } };
      };
      expect(body.status).toBe("not_a_supplement_label");
      expect(body.source).toBe("photo");
      expect(typeof body.run_id).toBe("string");
      expect(body.persistence.status).toBe("stored");
      expect(body.persistence.image.status).toBe("stored");
      expect(body.persistence.image.path).toBe(`${body.run_id}/original.png`);
      expect(body.persistence.image.bytes).toBe(bytes.length);
      expect(body.persistence.image.sha256).toHaveLength(64);
      expect(storageCalls.some((c) => c.startsWith(`POST ${FAKE_URL}/storage/v1/object/scan-images/${body.run_id}/original.png`))).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
