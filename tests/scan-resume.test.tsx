// @vitest-environment jsdom
/*
 * RELOAD / RESUME of the Scan tab (2026-10-06, user bug: "I refresh and stuff is gone"; live research removed 2026-11).
 *
 * A tiny in-memory SERVER stands in for the API (owner-filtered scans, exactly the contract of app/api/scan/*), and a
 * "reload" is what a browser does: the React tree is DESTROYED, while the tab's sessionStorage and the Supabase session
 * in the browser storage survive. Counters on the server say how many scans were read and how many label reads (POST
 * /api/scan, the only model call) were made: a restore must never make one.
 *
 * No model, no network; every clock is frozen and advanced by the test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StrictMode, act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";
import { resetLangMemory } from "@/lib/i18n/locale";
import { resetTranslationsForTests } from "@/lib/i18n/translate-client";
import { RESUME_STORAGE_KEY } from "@/lib/saved-scans/resume";

import { fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor, type FakeUser } from "./helpers/fake-supabase-browser";
import { installLocalStorage, installSessionStorage } from "./helpers/local-storage";
import { Harness, STORED, buttonByText, click, jsonResponse, record, stageAndScan, type RecordedCall } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { ScanWorkspace } = await import("@/components/scan-workspace");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const rich = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const catalog = ingredientCatalog();
const harness = new Harness();

// Real UUIDs: the checkpoint refuses anything that is not an id.
const OWNER: FakeUser = { id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", email: "owner@example.com" };
const STRANGER: FakeUser = { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", email: "stranger@example.com" };
const RUN = "11111111-1111-4111-8111-111111111111";
const TOKENS: Record<string, string> = { "tok-owner": OWNER.id, "tok-owner-2": OWNER.id, "tok-stranger": STRANGER.id };

function vitaminD(runId = RUN) {
  const scan = structuredClone(rich);
  scan.label = { ...scan.label, ingredient_vocab_id: "vitamin_d", ingredient_label_text: "Vitamin D3", form_vocab_id: null, compound_dose_mg: 0.05, printed_elemental_dose_mg: null, dose_unit_as_printed: "mcg", servings_per_day: null, is_multi_ingredient: false, other_actives: [], actives: [], product_name: "Vitamin D3 2000 IU", brand: "Acme" };
  return { ...scan, run_id: runId, persistence: { ...STORED, run_id: runId } };
}

/** The API, as far as the browser can tell: owner-filtered everywhere, uniform 404. */
class Server {
  calls: RecordedCall[] = [];
  scans = new Map<string, string>(); // scan id -> owner
  scanReads = 0;
  scanPosts = 0;
  /** A hook to make the next matching request fail or hang. */
  fault: ((c: RecordedCall) => Response | Promise<Response> | undefined) | null = null;
  readonly handler = async (url: unknown, init?: RequestInit): Promise<Response> => {
    const call = record(url, init);
    this.calls.push(call);
    const injected = this.fault?.(call);
    if (injected) return injected;
    const owner = TOKENS[String(call.headers.Authorization ?? "").replace("Bearer ", "")];
    if (!owner) return jsonResponse({ status: "unauthorized" }, 401);
    const path = call.url;
    if (path === "/api/scan" && call.method === "POST") {
      this.scanPosts += 1;
      this.scans.set(RUN, owner);
      return jsonResponse(vitaminD());
    }
    if (path.startsWith("/api/scan/history/")) {
      const id = decodeURIComponent(path.slice("/api/scan/history/".length));
      if (this.scans.get(id) !== owner) return jsonResponse({ status: "not_found" }, 404);
      this.scanReads += 1;
      return jsonResponse({ status: "ok", run_id: id, analysis: { ...vitaminD(id), persistence: undefined } });
    }
    if (path === "/api/scan/history") return jsonResponse({ status: "ok", runs: [...this.scans].filter(([, o]) => o === owner).map(([id]) => ({ id, created_at: "2026-10-06T10:00:00Z", source: "photo", status: "ok", product_name: "Vitamin D3 2000 IU" })), next_cursor: null });
    throw new Error(`unexpected request ${call.method} ${path}`);
  };
  mark() { return this.calls.length; }
  since(mark: number) { return this.calls.slice(mark); }
}

let server: Server;
let store: Storage;
const mount = (strict = false) => harness.mount(strict ? createElement(StrictMode, null, createElement(ScanWorkspace, { catalog })) : createElement(ScanWorkspace, { catalog }));
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const scanPanel = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[0];
const restored = (el: HTMLElement) => scanPanel(el).querySelector(".scan-lab-result") !== null && (scanPanel(el).textContent ?? "").includes("Vitamin D3");
const checkpoint = () => store.getItem(RESUME_STORAGE_KEY);

/** The first visit: sign in as the owner and scan a label (the one POST /api/scan). */
async function firstVisit(options: { strict?: boolean } = {}) {
  const el = await mount(options.strict);
  await advance(0);
  await stageAndScan(el);
  await advance(0);
  return el;
}
/** A destructive full reload: the tree is gone; storage and the session survive. */
async function reload(options: { strict?: boolean } = {}) {
  await harness.cleanup();
  resetGoogleSignInForTests();
  const el = await mount(options.strict);
  await advance(0);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T10:00:30Z"));
  installLocalStorage();
  store = installSessionStorage();
  resetLangMemory();
  resetTranslationsForTests();
  fakeAuth.reset();
  fakeAuth.configured = true;
  fakeAuth.session = sessionFor(OWNER, "tok-owner");
  resetGoogleSignInForTests();
  installFakeGoogle();
  server = new Server();
  vi.stubGlobal("fetch", vi.fn(server.handler));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
});
afterEach(async () => {
  await harness.cleanup();
  removeFakeGoogle();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the checkpoint is an opaque pointer", () => {
  it("holds ONLY version, owner id and scan id: no token, email, photo, analysis or model text", async () => {
    await firstVisit();
    const raw = checkpoint()!;
    expect(JSON.parse(raw)).toEqual({ v: 2, owner: OWNER.id, scan: RUN });
    for (const secret of ["tok-owner", "owner@example.com", "Vitamin D3", "Acme", "label", "analysis"]) expect(raw).not.toContain(secret);
    expect(window.localStorage.getItem(RESUME_STORAGE_KEY)).toBeNull(); // this tab only, not shared storage
  });

  it("a scan that was not stored (history off / failed) writes nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => (String(url) === "/api/scan" ? jsonResponse({ ...vitaminD(), persistence: { status: "failed" } }) : server.handler(url, init))));
    await firstVisit();
    expect(checkpoint()).toBeNull();
  });
});

describe("reload puts the scan back", () => {
  it("the same scan, read again with the owner's token, with no second label read and the grading notice", async () => {
    await firstVisit();
    const el = await reload();
    expect(restored(el)).toBe(true);
    expect(scanPanel(el).querySelector('[data-testid="grading-notice"]')).not.toBeNull();
    expect(scanPanel(el).querySelector('[data-testid="replay-note"]')?.textContent).toMatch(/reloaded.*put back/i);
    expect(server.scanPosts).toBe(1);
    expect(server.scanReads).toBe(1);
  });

  it("StrictMode (effects run twice) reads the saved scan once", async () => {
    await firstVisit({ strict: true });
    const el = await reload({ strict: true });
    expect(restored(el)).toBe(true);
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/history/"))).toHaveLength(1);
    expect(server.scanPosts).toBe(1);
  });

  it("'Scan another' clears the pointer: the next reload is the landing screen", async () => {
    await firstVisit();
    const el = await reload();
    await click(buttonByText(scanPanel(el), /scan another/i));
    await advance(0);
    expect(checkpoint()).toBeNull();
    const after = await reload();
    expect(scanPanel(after).querySelector(".scan-lab-result")).toBeNull();
    expect(server.scanPosts).toBe(1);
  });
});

describe("the pointer is only a hint: the server decides", () => {
  const seed = (value: unknown) => store.setItem(RESUME_STORAGE_KEY, typeof value === "string" ? value : JSON.stringify(value));
  const quiet = (el: HTMLElement) => {
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/history/"))).toHaveLength(0);
  };

  it("a hostile, malformed, old or foreign value is deleted and the normal screen shows; nothing is requested", async () => {
    for (const bad of ["not json", "{}", "[]", `{"v":2}`, JSON.stringify({ v: 1, owner: OWNER.id, scan: RUN, intent: "saved" }), JSON.stringify({ v: 2, owner: OWNER.id, scan: "../etc/passwd" }), JSON.stringify({ v: 2, owner: OWNER.id, scan: RUN, token: "tok-owner" }), "x".repeat(5000)]) {
      seed(bad);
      const el = await reload();
      quiet(el);
      expect(checkpoint(), String(bad).slice(0, 30)).toBeNull();
    }
  });

  it("another account's pointer is deleted without a single request for it", async () => {
    seed({ v: 2, owner: STRANGER.id, scan: RUN });
    server.scans.set(RUN, STRANGER.id);
    const el = await reload();
    quiet(el);
    expect(checkpoint()).toBeNull();
  });

  it("lost or edited: a scan that is not the signed-in person's -> the uniform 404, a clean landing, the pointer deleted", async () => {
    seed({ v: 2, owner: OWNER.id, scan: RUN });
    server.scans.set(RUN, STRANGER.id); // somebody else's scan
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(scanPanel(el).querySelector('[data-testid="resume-restoring"], [data-testid="resume-failed"]')).toBeNull();
    expect(checkpoint()).toBeNull();
  });

  it("signed out at load: the pointer is dropped and it is never used by the next person", async () => {
    seed({ v: 2, owner: OWNER.id, scan: RUN });
    server.scans.set(RUN, OWNER.id);
    fakeAuth.session = null;
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(checkpoint()).toBeNull();
    await act(async () => { fakeAuth.setSession(sessionFor(STRANGER, "tok-stranger")); });
    await advance(0);
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/"))).toHaveLength(0);
  });

  it("a deployment with no sign-in has nothing to restore, whatever the storage says", async () => {
    seed({ v: 2, owner: OWNER.id, scan: RUN });
    fakeAuth.configured = false;
    const el = await reload();
    quiet(el);
    expect(checkpoint()).toBeNull();
  });
});

describe("sign-in rehydration, sign-out and account switches", () => {
  it("while the session is still being READ the pointer is neither used nor deleted; once it is read the scan is restored", async () => {
    await firstVisit();
    fakeAuth.holdSession();
    await harness.cleanup();
    resetGoogleSignInForTests();
    const mark = server.mark();
    const el = await mount();
    await advance(0);
    expect(checkpoint()).not.toBeNull();
    expect(scanPanel(el).querySelector('[data-testid="resume-restoring"]')).not.toBeNull();
    expect(server.since(mark)).toHaveLength(0);
    fakeAuth.releaseSession();
    await advance(0);
    expect(scanPanel(el).querySelector('[data-testid="resume-restoring"]')).toBeNull();
    expect(restored(el)).toBe(true);
  });

  it("signing out while a restored scan is on screen clears the screen and the pointer", async () => {
    await firstVisit();
    const el = await reload();
    expect(restored(el)).toBe(true);
    await act(async () => { fakeAuth.setSession(null); });
    await advance(0);
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(checkpoint()).toBeNull();
    expect(el.textContent).not.toContain("Vitamin D3");
  });

  it("an account switch while a scan is on screen clears the pointer; the next account's reload shows nothing of the first", async () => {
    await firstVisit();
    await act(async () => { fakeAuth.setSession(sessionFor(STRANGER, "tok-stranger")); });
    await advance(0);
    expect(checkpoint()).toBeNull();
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(el.textContent).not.toContain("Vitamin D3");
  });

  it("a 401 on the restore read refreshes the token ONCE and retries; a second 401 ends the session instead of looping", async () => {
    await firstVisit();
    fakeAuth.refreshTo = sessionFor(OWNER, "tok-owner-2");
    let firstTry = true;
    server.fault = (c) => { if (c.url.startsWith("/api/scan/history/") && firstTry) { firstTry = false; return jsonResponse({ status: "unauthorized" }, 401); } return undefined; };
    const el = await reload();
    expect(fakeAuth.refreshCalls).toBe(1);
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/history/")).map((c) => c.headers.Authorization)).toEqual(["Bearer tok-owner", "Bearer tok-owner-2"]);
    expect(restored(el)).toBe(true);

    fakeAuth.refreshTo = sessionFor(OWNER, "tok-owner");
    server.fault = (c) => (c.url.startsWith("/api/scan/history/") ? jsonResponse({ status: "unauthorized" }, 401) : undefined);
    const again = await reload();
    expect(fakeAuth.signOutCalls).toBeGreaterThanOrEqual(1);
    expect(scanPanel(again).querySelector(".scan-lab-result")).toBeNull();
  });
});

describe("a transient failure is visible and recoverable", () => {
  it("the restore read failing (network) shows a retry that restores the scan; 'Start a new scan' clears the pointer", async () => {
    await firstVisit();
    let down = true;
    server.fault = (c) => { if (c.url.startsWith("/api/scan/history/") && down) return Promise.reject(new TypeError("Load failed")); return undefined; };
    const el = await reload();
    expect(scanPanel(el).querySelector('[data-testid="resume-failed"]')?.getAttribute("role")).toBe("alert");
    expect(checkpoint()).not.toBeNull();
    down = false;
    await click(buttonByText(scanPanel(el), /try again/i));
    await advance(0);
    expect(restored(el)).toBe(true);

    down = true;
    const failed = await reload();
    await click(buttonByText(scanPanel(failed), /start a new scan/i));
    await advance(0);
    expect(checkpoint()).toBeNull();
    expect(scanPanel(failed).querySelector('[data-testid="resume-failed"]')).toBeNull();
    expect(scanPanel(failed).querySelector(".sc-viewfinder, .sc-capture")).not.toBeNull();
  });
});
