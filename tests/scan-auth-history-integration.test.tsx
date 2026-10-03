/*
 * THE SEAM BETWEEN THE TWO HALVES (2026-09-23 integration).
 *
 * The browser half (<ScanWorkspace>, its session hook, the History tab) and the
 * server half (POST /api/scan, GET /api/scan/history[/id], the owner-filtered
 * store) were built separately and each is tested against a stub of the other.
 * This file removes both stubs: the REAL workspace runs in jsdom and its fetch
 * is wired straight into the REAL route handlers, which talk to the in-memory
 * fake Supabase (tests/helpers/fake-supabase.ts: it APPLIES the owner filters,
 * so a route that forgot one would leak here, not pass by luck). The only
 * stand-ins are the browser Supabase client (a fake session) and the network.
 *
 * What it proves end to end, with SCAN_REQUIRE_AUTH=1 and SCAN_HISTORY_REQUIRED=1:
 *   - a typed scan from a signed-in person is bound at INSERT to the user
 *     Supabase verified for the bearer token, and the UI says "Saved" because
 *     the server really stored it
 *   - the History tab lists exactly that person's runs (the list/detail shapes
 *     the server sends are the shapes the UI parses) and a click replays the
 *     SAVED analysis: no POST /api/scan, no model call, no new row, same saved
 *     date
 *   - another account sees none of it, and asking for someone else's / a
 *     legacy / a missing id is the same 404 (no existence oracle)
 *   - /api/scan/claim is never called by the UI
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as historyList } from "@/app/api/scan/history/route";
import { GET as historyDetail } from "@/app/api/scan/history/[id]/route";
import { POST as scanPost } from "@/app/api/scan/route";
import { ingredientCatalog } from "@/lib/analyze/catalog";

import { FAKE_KEY, FAKE_URL, FakeSupabase, USER_A as SERVER_A, USER_B as SERVER_B, googleUser } from "./helpers/fake-supabase";
import { fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { Harness, buttonByText, click, openSearch, settle, submitMagnesium } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { ScanWorkspace } = await import("@/components/scan-workspace");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const catalog = ingredientCatalog();
const harness = new Harness();
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_REQUIRE_AUTH", "SCAN_HISTORY_REQUIRED", "DEEPSEEK_API_KEY", "LABEL_ANALYZER_ENABLED", "VISION_API_KEY", "GEMINI_API_KEY"] as const;
const savedEnv = { ...process.env };

// Browser-side identities carry the SAME ids the fake Supabase Auth reports for the tokens.
const BROWSER_A = { id: SERVER_A, email: "alice@example.com" };
const BROWSER_B = { id: SERVER_B, email: "bob@example.com" };

let fake: FakeSupabase;
interface ApiCall {
  method: string;
  path: string;
  authorization: string | undefined;
}
let apiCalls: ApiCall[];

/** The browser's `fetch`: relative /api/scan* URLs hit the real handlers; anything else is a hard failure. */
function wireApi() {
  const serverFetch = fake.fetch; // what the route handlers (server side) see
  vi.stubGlobal(
    "fetch",
    async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (!url.startsWith("/api/scan")) throw new Error(`browser fetched an unexpected URL: ${url}`);
      const signal = init?.signal ?? null;
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const headers = new Headers(init?.headers as Record<string, string> | undefined);
      apiCalls.push({ method: init?.method ?? "GET", path: url, authorization: headers.get("authorization") ?? undefined });

      // Node's Request rejects jsdom's AbortSignal, so the signal is honoured here instead.
      const request = new Request(`http://localhost${url}`, { method: init?.method ?? "GET", headers, body: init?.body as string | undefined });
      const run = async (): Promise<Response> => {
        // The handlers' own outbound calls (Supabase, model) go to the fake.
        const browserFetch = globalThis.fetch;
        globalThis.fetch = serverFetch;
        try {
          const detail = /^\/api\/scan\/history\/([^/?]+)$/.exec(url);
          if (url === "/api/scan") return await scanPost(request);
          if (url === "/api/scan/history") return await historyList(request);
          if (detail) return await historyDetail(request, { params: Promise.resolve({ id: decodeURIComponent(detail[1]) }) });
          throw new Error(`no handler for ${url}`);
        } finally {
          globalThis.fetch = browserFetch;
        }
      };
      const answer = run();
      if (!signal) return answer;
      return await new Promise<Response>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        answer.then(resolve, reject);
      });
    },
  );
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
  process.env.SCAN_REQUIRE_AUTH = "1";
  process.env.SCAN_HISTORY_REQUIRED = "1";
  process.env.DEEPSEEK_API_KEY = "test-model-key";

  fake = new FakeSupabase();
  fake.addUser("tok-a", googleUser(SERVER_A, "alice@example.com"));
  fake.addUser("tok-b", googleUser(SERVER_B, "bob@example.com"));
  apiCalls = [];

  fakeAuth.reset();
  fakeAuth.configured = true;
  fakeAuth.session = sessionFor(BROWSER_A, "tok-a");
  resetGoogleSignInForTests();
  installFakeGoogle();
  wireApi();
});

afterEach(async () => {
  await harness.cleanup();
  removeFakeGoogle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const mountWorkspace = () => harness.mount(createElement(ScanWorkspace, { catalog }));
const tab = (el: HTMLElement, name: RegExp) => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => name.test(t.textContent ?? ""))!;
const runRows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>("button.sw-run"));
async function openHistory(el: HTMLElement) {
  await click(tab(el, /history/i));
  await settle(8);
}
async function typedScan(el: HTMLElement) {
  await openSearch(el);
  await submitMagnesium();
  await settle(12);
  expect(el.querySelector('[role="alert"]')).toBeNull(); // no error state: a real result was drawn
}

/** Run a direct server-side call (a probe, not the browser) with the handlers' outbound fetch on the fake. */
async function asServer<T>(fn: () => Promise<T>): Promise<T> {
  const browserFetch = globalThis.fetch;
  globalThis.fetch = fake.fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = browserFetch;
  }
}

describe("sign-in required + history required, UI wired to the real routes", () => {
  it("a typed scan is stored for the verified user; History lists it and replays the SAVED result with no new scan", async () => {
    const el = await mountWorkspace();
    await settle();
    await typedScan(el);

    // ---- the scan: Bearer in, owner bound at INSERT by the server, "Saved" because it really was
    const post = apiCalls.filter((c) => c.method === "POST");
    expect(post).toEqual([{ method: "POST", path: "/api/scan", authorization: "Bearer tok-a" }]);
    expect(fake.runs).toHaveLength(1);
    const stored = fake.runs[0];
    expect(stored.user_id).toBe(SERVER_A);
    expect(stored.user_email).toBe("alice@example.com");
    expect(stored.source).toBe("manual");
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toBe("Saved to your history.");
    const modelCallsAfterScan = fake.modelCalls;
    const insertsAfterScan = fake.callsTo("/rest/v1/scan_runs").filter((c) => c.method === "POST").length;
    expect(insertsAfterScan).toBe(1);

    // ---- History: the list the server really sends is the list the UI really parses
    await openHistory(el);
    const listCall = apiCalls.filter((c) => c.path === "/api/scan/history");
    expect(listCall).toEqual([{ method: "GET", path: "/api/scan/history", authorization: "Bearer tok-a" }]);
    expect(runRows(el)).toHaveLength(1);
    expect(runRows(el)[0].textContent).toMatch(/magnesium/i); // product_name derived server-side from the saved analysis
    expect(runRows(el)[0].textContent).toMatch(/typed search/i);
    const listedDate = runRows(el)[0].querySelector("time")?.getAttribute("datetime");
    expect(listedDate).toBeTruthy();

    // ---- replay: detail GET only; the saved analysis is drawn by the same renderer
    await click(runRows(el)[0]);
    await settle(8);
    const detailCalls = apiCalls.filter((c) => c.path.startsWith("/api/scan/history/"));
    expect(detailCalls).toEqual([{ method: "GET", path: `/api/scan/history/${stored.id}`, authorization: "Bearer tok-a" }]);
    const historyPanel = el.querySelectorAll<HTMLElement>(".sw-panel")[1]; // [0] = Scan, [1] = History (the result renderer nests its own tabpanels)
    expect(historyPanel.querySelector(".la-result")).not.toBeNull(); // the same result renderer, inside the History tab
    expect(historyPanel.querySelector('[data-testid="save-status"]')).toBeNull(); // a replay is not a new save
    expect(apiCalls.filter((c) => c.method === "POST")).toHaveLength(1); // still just the original scan
    expect(fake.modelCalls).toBe(modelCallsAfterScan); // no reanalysis
    expect(fake.callsTo("/rest/v1/scan_runs").filter((c) => c.method === "POST")).toHaveLength(insertsAfterScan); // no new row
    expect(fake.nonGetRunWrites.filter((c) => c.method !== "POST")).toHaveLength(0); // never UPDATE/DELETE a run
    expect(apiCalls.some((c) => c.path.startsWith("/api/scan/claim"))).toBe(false);
    expect(el.textContent).toMatch(/saved/i);
  });

  it("another account sees none of it: the list is owner-filtered and the same 404 answers someone else's, a legacy and a missing id", async () => {
    const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const ID_LEGACY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const ID_MISSING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const saved = (id: string, name: string) => ({ schema_version: "ScanAnalysisV1", status: "scored", source: "manual", input: { ingredient_label: name } });
    fake.addRun({ id: ID_A, user_id: SERVER_A, user_email: "alice@example.com", analysis: saved(ID_A, "Alice Magnesium") });
    fake.addRun({ id: ID_B, user_id: SERVER_B, user_email: "bob@example.com", analysis: saved(ID_B, "Bob Creatine") });
    fake.addRun({ id: ID_LEGACY, user_id: null, analysis: saved(ID_LEGACY, "Legacy Anonymous") });

    // A is signed in: only A's own run is listed, and no other person's text reaches the page.
    const el = await mountWorkspace();
    await settle();
    await openHistory(el);
    expect(runRows(el)).toHaveLength(1);
    expect(runRows(el)[0].textContent).toContain("Alice Magnesium");
    for (const secret of ["Bob Creatine", "Legacy Anonymous", "bob@example.com", ID_B, ID_LEGACY]) expect(el.textContent).not.toContain(secret);

    // The account switches to B: A's list is gone, B sees only B's.
    await act_setSession(BROWSER_B, "tok-b");
    await settle(10);
    const afterSwitch = Array.from(el.querySelectorAll<HTMLButtonElement>("button.sw-run"));
    expect(afterSwitch).toHaveLength(1);
    expect(afterSwitch[0].textContent).toContain("Bob Creatine");
    expect(el.textContent).not.toContain("Alice Magnesium");
    expect(apiCalls.filter((c) => c.path === "/api/scan/history").map((c) => c.authorization)).toEqual(["Bearer tok-a", "Bearer tok-b"]);

    // Detail, straight at the real route as B: not-yours, legacy and missing are indistinguishable.
    const probe = async (id: string) => {
      const res = await asServer(() => historyDetail(new Request(`http://localhost/api/scan/history/${id}`, { headers: { authorization: "Bearer tok-b" } }), { params: Promise.resolve({ id }) }));
      return { status: res.status, body: await res.text(), cache: res.headers.get("cache-control") };
    };
    const [others, legacy, missing, own] = [await probe(ID_A), await probe(ID_LEGACY), await probe(ID_MISSING), await probe(ID_B)];
    expect(others.status).toBe(404);
    expect(legacy).toEqual(others);
    expect(missing).toEqual(others);
    expect(others.cache).toBe("no-store");
    expect(own.status).toBe(200);
    for (const text of [others.body, legacy.body, missing.body]) {
      for (const secret of ["Alice Magnesium", "alice@example.com", SERVER_A]) expect(text).not.toContain(secret);
    }
  });

  it("signed out in required mode: the UI sends nothing, and the server refuses a direct call before any model or storage work", async () => {
    fakeAuth.session = null;
    const el = await mountWorkspace();
    await settle();
    await openHistory(el);
    expect(apiCalls).toEqual([]); // no scan, no list, no claim without a session
    expect(buttonByText(el, /scan this label/i)).toBeUndefined();

    const direct = await asServer(() =>
      scanPost(
        new Request("http://localhost/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "manual", ingredient: "magnesium", form: "magnesium_glycinate", dose: { value: 200, unit: "mg" }, servings_per_day: 1 }),
        }),
      ),
    );
    expect(direct.status).toBe(401);
    expect(fake.modelCalls).toBe(0);
    expect(fake.runs).toHaveLength(0);
  });
});

async function act_setSession(user: { id: string; email: string }, token: string) {
  const { act } = await import("react");
  await act(async () => {
    fakeAuth.setSession(sessionFor(user, token));
  });
}
