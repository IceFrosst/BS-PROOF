// @vitest-environment jsdom
/*
 * RELOAD / RESUME of the Scan tab and its live research (2026-10-06, user bug: "it says research is running, then I
 * refresh and stuff is gone; and the results don't appear by themselves when research completes").
 *
 * A tiny in-memory SERVER stands in for the API (owner-filtered scans and ONE research job per (owner, scan), exactly
 * the contract of app/api/scan/*), and a "reload" is what a browser does: the React tree and every module-level memory
 * (the in-page job map, the poll) are DESTROYED, while the tab's sessionStorage and the Supabase session in the
 * browser storage survive. Counters on the server say what the user's money depends on: how many scans were read,
 * how many research jobs were CREATED (it must stay at one), how many POSTs were made.
 *
 * No model, no network, no real job; every clock is frozen and advanced by the test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StrictMode, act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";
import { resetLangMemory } from "@/lib/i18n/locale";
import { resetTranslationsForTests } from "@/lib/i18n/translate-client";
import { forgetResearchJobs, noteResearchOwner, RESEARCH_REQUEST_TIMEOUT_MS } from "@/lib/scan-research/client";
import { RESUME_STORAGE_KEY } from "@/lib/scan-research/resume";

import { fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor, type FakeUser } from "./helpers/fake-supabase-browser";
import { RESULT, TARGET, researchJob } from "./helpers/live-research-fixtures";
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
const JOB = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
const TOKENS: Record<string, string> = { "tok-owner": OWNER.id, "tok-owner-2": OWNER.id, "tok-stranger": STRANGER.id };

function vitaminD(runId = RUN) {
  const scan = structuredClone(rich);
  scan.label = { ...scan.label, ingredient_vocab_id: "vitamin_d", ingredient_label_text: "Vitamin D3", form_vocab_id: null, compound_dose_mg: 0.05, printed_elemental_dose_mg: null, dose_unit_as_printed: "mcg", servings_per_day: null, is_multi_ingredient: false, other_actives: [], actives: [], product_name: "Vitamin D3 2000 IU", brand: "Acme" };
  return { ...scan, run_id: runId, persistence: { ...STORED, run_id: runId } };
}

type Status = "queued" | "running" | "succeeded" | "failed";
/** The API, as far as the browser can tell: owner-filtered everywhere, one job per (owner, scan), uniform 404. */
class Server {
  calls: RecordedCall[] = [];
  scans = new Map<string, string>(); // scan id -> owner
  job: { owner: string; scan: string; status: Status; extra: Record<string, unknown> } | null = null;
  jobsCreated = 0;
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
    if (path.startsWith("/api/scan/research?")) {
      const scan = new URL(path, "http://x").searchParams.get("scan_id");
      return this.job && this.job.owner === owner && this.job.scan === scan ? this.ok() : jsonResponse({ status: "not_found" }, 404);
    }
    if (path === "/api/scan/research" && call.method === "POST") {
      const scan = JSON.parse(String(call.body)).scan_id as string;
      if (this.scans.get(scan) !== owner) return jsonResponse({ status: "not_found" }, 404);
      if (this.job && this.job.owner === owner && this.job.scan === scan) return this.ok(200);
      this.jobsCreated += 1;
      this.job = { owner, scan, status: "queued", extra: {} };
      return this.ok(201);
    }
    if (path.startsWith("/api/scan/research/")) {
      const id = decodeURIComponent(path.slice("/api/scan/research/".length));
      return this.job && this.job.owner === owner && id === JOB ? this.ok() : jsonResponse({ status: "not_found" }, 404);
    }
    throw new Error(`unexpected request ${call.method} ${path}`);
  };
  private ok(status = 200) {
    const j = this.job!;
    return jsonResponse({ status: "ok", created: status === 201 ? true : undefined, job: researchJob(j.scan, j.status, j.extra) }, status);
  }
  set(status: Status, extra: Record<string, unknown> = {}) { if (this.job) { this.job.status = status; this.job.extra = extra; } }
  get posts() { return this.calls.filter((c) => c.method === "POST" && c.url === "/api/scan/research"); }
  get researchGets() { return this.calls.filter((c) => c.method === "GET" && c.url.startsWith("/api/scan/research")); }
  get lookups() { return this.calls.filter((c) => c.method === "GET" && c.url.startsWith("/api/scan/research?")); }
  mark() { return this.calls.length; }
  since(mark: number) { return this.calls.slice(mark); }
}

let server: Server;
let store: Storage;
const mount = (strict = false) => harness.mount(strict ? createElement(StrictMode, null, createElement(ScanWorkspace, { catalog })) : createElement(ScanWorkspace, { catalog }));
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const scanPanel = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[0];
const historyPanel = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1];
const research = (el: HTMLElement) => scanPanel(el).querySelector<HTMLElement>(".sc-research");
const state = (el: HTMLElement) => research(el)?.getAttribute("data-research-state") ?? null;
const phase = (el: HTMLElement) => research(el)?.getAttribute("data-research-phase") ?? null;
const tab = (el: HTMLElement, name: RegExp) => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => name.test(t.textContent ?? ""))!;
const checkpoint = () => store.getItem(RESUME_STORAGE_KEY);

/** The first visit: sign in as the owner, scan a label (the one POST /api/scan), research is asked for once. */
async function firstVisit(options: { strict?: boolean } = {}) {
  const el = await mount(options.strict);
  await advance(0);
  await stageAndScan(el);
  await advance(0);
  return el;
}
/** A destructive full reload: the tree and every in-memory thing are gone; storage and the session survive. */
async function reload(options: { strict?: boolean } = {}) {
  await harness.cleanup();
  forgetResearchJobs();
  noteResearchOwner(null);
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
  forgetResearchJobs();
  noteResearchOwner(null);
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
  it("holds ONLY version, owner id, scan id and intent: no token, email, photo, analysis, job, result or model text", async () => {
    await firstVisit();
    const raw = checkpoint()!;
    expect(JSON.parse(raw)).toEqual({ v: 1, owner: OWNER.id, scan: RUN, intent: "saved" }); // "saved": the job is known to exist by now
    for (const secret of ["tok-owner", "owner@example.com", "Vitamin D3", "Acme", "PMID", "result", "audit", "label", "analysis"]) expect(raw).not.toContain(secret);
    expect(raw.length).toBeLessThan(200);
    expect(window.localStorage.getItem(RESUME_STORAGE_KEY)).toBeNull(); // this tab only, not shared storage
  });

  it("is written when the scan is stored, before the research request has an answer, as 'fresh'", async () => {
    server.fault = (c) => (c.method === "POST" && c.url === "/api/scan/research" ? new Promise<Response>(() => undefined) : undefined); // the request never answers
    await firstVisit();
    expect(JSON.parse(checkpoint()!)).toEqual({ v: 1, owner: OWNER.id, scan: RUN, intent: "fresh" });
  });

  it("a scan that was not stored (history off / failed) writes nothing", async () => {
    server.handler.bind(server);
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => (String(url) === "/api/scan" ? jsonResponse({ ...vitaminD(), persistence: { status: "failed" } }) : server.handler(url, init))));
    await firstVisit();
    expect(checkpoint()).toBeNull();
  });
});

describe("reload while the research is RUNNING", () => {
  it("puts the same scan back and the same job on the loading screen -- then the finished card appears BY ITSELF, with no rescan and no new job", async () => {
    const first = await firstVisit();
    server.set("running");
    await advance(2500);
    expect(state(first)).toBe("running");
    expect(server.scanPosts).toBe(1);
    expect(server.posts).toHaveLength(1);

    const el = await reload();
    // restored from the checkpoint: the saved scan is read again, its job is READ (never created), the loading screen is back
    expect(scanPanel(el).querySelector(".scan-lab-result")).not.toBeNull();
    expect(scanPanel(el).textContent).toContain("Vitamin D3");
    expect(state(el)).toBe("running");
    expect(phase(el)).toBe("loading");
    expect(scanPanel(el).querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    expect(buttonByText(scanPanel(el), /request live research/i)).toBeUndefined();
    expect(scanPanel(el).querySelector('[data-testid="replay-note"]')?.textContent).toMatch(/reloaded.*put back.*nothing was scanned again/i);
    expect(server.scanPosts).toBe(1); // no second label read, no model call
    expect(server.posts).toHaveLength(1); // no second research request
    expect(server.jobsCreated).toBe(1);
    expect(server.lookups.length).toBeGreaterThanOrEqual(1);

    // ... the worker finishes; nobody presses anything, nobody refreshes
    server.set("succeeded", { result: RESULT });
    await advance(2500);
    expect(phase(el)).toBe("result");
    expect(state(el)).toBe("succeeded");
    expect(scanPanel(el).querySelectorAll('[data-testid="research-audit"]')).toHaveLength(1);
    expect(scanPanel(el).querySelectorAll('[role="progressbar"]')).toHaveLength(0);
    expect(server.posts).toHaveLength(1);
    expect(server.jobsCreated).toBe(1);
    expect(server.scanPosts).toBe(1);
    await advance(120_000); // finished: it stops asking
    const settled = server.calls.length;
    await advance(120_000);
    expect(server.calls.length).toBe(settled);
  });

  it("the full journey on one reload: queued -> running -> succeeded without a button or a refresh, across TWO reloads, one POST in total", async () => {
    await firstVisit();
    let el = await reload();
    expect(state(el)).toBe("queued");
    server.set("running");
    await advance(2500);
    expect(state(el)).toBe("running");
    el = await reload();
    expect(state(el)).toBe("running");
    server.set("succeeded", { result: RESULT });
    await advance(2500);
    expect(phase(el)).toBe("result");
    expect(server.posts).toHaveLength(1);
    expect(server.jobsCreated).toBe(1);
    expect(server.scanPosts).toBe(1);
  });

  it("StrictMode (effects run twice) and re-renders send no second request: still one POST in total", async () => {
    await firstVisit({ strict: true });
    expect(server.posts).toHaveLength(1);
    const el = await reload({ strict: true });
    expect(state(el)).toBe("queued");
    await advance(10_000);
    expect(server.posts).toHaveLength(1);
    expect(server.jobsCreated).toBe(1);
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/history/"))).toHaveLength(1); // the saved scan is read once for the restore
  });

  it("a hidden tab that comes back reads the same job once (visibility / focus), never a second poll loop, never a POST", async () => {
    await firstVisit();
    const el = await reload();
    const mark = server.mark();
    await advance(1100);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(0); });
    const reads = server.since(mark).filter((c) => c.url === `/api/scan/research/${JOB}`);
    expect(reads.length).toBeGreaterThanOrEqual(1);
    expect(server.since(mark).some((c) => c.method === "POST")).toBe(false);
    server.set("succeeded", { result: RESULT });
    await advance(2500);
    expect(phase(el)).toBe("result");
    const done = server.calls.length;
    await advance(60_000);
    expect(server.calls.length).toBe(done);
  });

  it("switching to History and back (the tab stays mounted) keeps ONE poll running and loses nothing", async () => {
    await firstVisit();
    const el = await reload();
    await click(tab(el, /history/i));
    await advance(0);
    await click(tab(el, /^scan$/i));
    await advance(0);
    expect(state(el)).toBe("queued");
    server.set("succeeded", { result: RESULT });
    await advance(2500);
    expect(phase(el)).toBe("result");
    expect(server.posts).toHaveLength(1);
  });
});

describe("reload after the research COMPLETED", () => {
  it("shows the finished card from the saved scan and its job, with no POST and no waiting screen", async () => {
    await firstVisit();
    server.set("succeeded", { result: RESULT });
    await advance(2500);
    const el = await reload();
    expect(phase(el)).toBe("result");
    expect(scanPanel(el).querySelectorAll('[data-testid="research-audit"]')).toHaveLength(1);
    expect(server.posts).toHaveLength(1);
    expect(server.jobsCreated).toBe(1);
    await advance(60_000);
    expect(server.researchGets.filter((c) => c.url === `/api/scan/research/${JOB}`).length).toBeLessThanOrEqual(3);
  });

  it("a job that FAILED shows the failure, not endless progress", async () => {
    await firstVisit();
    server.set("failed", { failure_code: "claude_quota_or_rate_limit" });
    const el = await reload();
    expect(state(el)).toBe("failed");
    expect(phase(el)).toBe("problem");
    expect(scanPanel(el).textContent).toContain("claude_quota_or_rate_limit");
    expect(scanPanel(el).querySelectorAll('[role="progressbar"]')).toHaveLength(0);
    expect(server.posts).toHaveLength(1);
  });

  it("a 'succeeded' job whose payload this page will not draw is an integrity message, never a blank card", async () => {
    await firstVisit();
    server.set("succeeded", { result: { ...RESULT, provenance: { ...RESULT.provenance, affects_score: true } } });
    const el = await reload();
    expect(state(el)).toBe("invalid");
    expect(scanPanel(el).textContent).toContain("did not pass this page’s checks");
    expect(scanPanel(el).querySelector('[data-testid="research-audit"]')).toBeNull();
  });
});

describe("a pending FRESH intent never gets stuck, and a History view never starts research", () => {
  it("the reload cut the page off between 'saved' and 'queued': the restored fresh scan asks for research ONCE (the server has none), then reads it", async () => {
    server.fault = (c) => (c.method === "POST" && c.url === "/api/scan/research" ? new Promise<Response>(() => undefined) : undefined);
    await firstVisit();
    expect(JSON.parse(checkpoint()!).intent).toBe("fresh");
    expect(server.jobsCreated).toBe(0);
    server.fault = null;
    let el = await reload();
    expect(server.posts.length).toBe(2); // the one that never answered, and the restored scan's own: the server made exactly one job
    expect(server.jobsCreated).toBe(1);
    expect(state(el)).toBe("queued");
    expect(JSON.parse(checkpoint()!).intent).toBe("saved");
    // and from now on a reload only reads
    el = await reload();
    expect(state(el)).toBe("queued");
    expect(server.posts.length).toBe(2);
    expect(server.jobsCreated).toBe(1);
  });

  it("the request had reached the server and only its answer was lost: the restored scan FINDS the job and sends nothing", async () => {
    server.fault = (c) => {
      if (c.method === "POST" && c.url === "/api/scan/research") {
        const fault = server.fault;
        server.fault = null; // the server DID get it ...
        void server.handler(c.url, { method: "POST", headers: c.headers, body: c.body as string });
        server.fault = fault;
        return new Promise<Response>(() => undefined); // ... and its answer never came back
      }
      return undefined;
    };
    await firstVisit();
    expect(server.jobsCreated).toBe(1);
    server.fault = null;
    const postsBefore = server.posts.length;
    const el = await reload();
    expect(server.posts.length).toBe(postsBefore);
    expect(server.jobsCreated).toBe(1);
    expect(state(el)).toBe("queued");
  });

  it("a scan merely OPENED from History (no checkpoint) and refreshed asks for nothing: the lookup says none -> 'not requested' + a deliberate button; reload -> landing, no request at all", async () => {
    server.scans.set(RUN, OWNER.id); // an old saved scan with no research
    const el = await mount();
    await advance(0);
    await click(tab(el, /history/i));
    await advance(0);
    await click(el.querySelector("button.sw-run"));
    await advance(0);
    expect(historyPanel(el).querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("idle");
    expect(buttonByText(historyPanel(el), /request live research for this scan/i)).toBeDefined();
    expect(checkpoint()).toBeNull(); // viewing History writes no pointer
    const mark = server.mark();
    const after = await reload();
    expect(scanPanel(after).querySelector(".scan-lab-result")).toBeNull(); // the landing, not the old scan
    expect(server.posts).toHaveLength(0);
    expect(server.since(mark).filter((c) => c.url.startsWith("/api/scan/research"))).toHaveLength(0);
    await advance(120_000);
    expect(server.jobsCreated).toBe(0);
  });

  it("a restored scan whose intent is 'saved' and whose job no longer exists says 'not requested' and never asks by itself", async () => {
    await firstVisit();
    server.job = null; // an operator removed it
    const el = await reload();
    expect(state(el)).toBe("idle");
    expect(buttonByText(scanPanel(el), /request live research for this scan/i)).toBeDefined();
    await advance(60_000);
    expect(server.posts).toHaveLength(1); // only the original
    expect(server.jobsCreated).toBe(1);
  });

  it("'Scan another' clears the pointer: the next reload is the landing screen", async () => {
    await firstVisit();
    const el = await reload();
    await click(buttonByText(scanPanel(el), /scan another/i));
    await advance(0);
    expect(checkpoint()).toBeNull();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    const after = await reload();
    expect(scanPanel(after).querySelector(".scan-lab-result")).toBeNull();
    expect(server.posts).toHaveLength(1);
  });
});

describe("the pointer is only a hint: the server decides", () => {
  const seed = (value: unknown) => store.setItem(RESUME_STORAGE_KEY, typeof value === "string" ? value : JSON.stringify(value));
  const quiet = (el: HTMLElement) => {
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/history/") || c.url.startsWith("/api/scan/research"))).toHaveLength(0);
  };

  it("a hostile, malformed or foreign value is deleted and the normal screen shows; nothing is requested", async () => {
    for (const bad of ["not json", "{}", "[]", `{"v":1}`, JSON.stringify({ v: 2, owner: OWNER.id, scan: RUN, intent: "saved" }), JSON.stringify({ v: 1, owner: OWNER.id, scan: "../etc/passwd", intent: "saved" }), JSON.stringify({ v: 1, owner: OWNER.id, scan: RUN, intent: "admin" }), JSON.stringify({ v: 1, owner: OWNER.id, scan: RUN, intent: "saved", token: "tok-owner" }), "x".repeat(5000)]) {
      seed(bad);
      const el = await reload();
      quiet(el);
      expect(checkpoint(), String(bad).slice(0, 30)).toBeNull();
    }
  });

  it("another account's pointer is deleted without a single request for it", async () => {
    seed({ v: 1, owner: STRANGER.id, scan: RUN, intent: "fresh" });
    server.scans.set(RUN, STRANGER.id);
    const el = await reload();
    quiet(el);
    expect(checkpoint()).toBeNull();
  });

  it("lost or edited: the pointer names a scan that is not the signed-in person's -> the SAME uniform 404, a clean landing, the pointer deleted, no research request", async () => {
    seed({ v: 1, owner: OWNER.id, scan: RUN, intent: "fresh" });
    server.scans.set(RUN, STRANGER.id); // somebody else's scan
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(scanPanel(el).querySelector('[data-testid="resume-restoring"], [data-testid="resume-failed"]')).toBeNull();
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/research"))).toHaveLength(0);
    expect(server.jobsCreated).toBe(0);
    expect(checkpoint()).toBeNull();
  });

  it("signed out at load: the pointer is dropped and the sign-in screen shows; it is never used by the next person", async () => {
    seed({ v: 1, owner: OWNER.id, scan: RUN, intent: "saved" });
    server.scans.set(RUN, OWNER.id);
    fakeAuth.session = null;
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(checkpoint()).toBeNull();
    await act(async () => { fakeAuth.setSession(sessionFor(STRANGER, "tok-stranger")); });
    await advance(0);
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull(); // the stranger is shown nothing of the owner's
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/"))).toHaveLength(0);
  });

  it("a deployment with no sign-in has nothing to restore, whatever the storage says", async () => {
    seed({ v: 1, owner: OWNER.id, scan: RUN, intent: "fresh" });
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
    forgetResearchJobs(); noteResearchOwner(null); resetGoogleSignInForTests();
    const mark = server.mark();
    const el = await mount();
    await advance(0);
    expect(checkpoint()).not.toBeNull(); // the SDK has not answered: nothing is decided, nothing is deleted
    expect(scanPanel(el).querySelector('[data-testid="resume-restoring"]')).not.toBeNull();
    expect(server.since(mark)).toHaveLength(0);
    fakeAuth.releaseSession();
    await advance(0);
    expect(scanPanel(el).querySelector('[data-testid="resume-restoring"]')).toBeNull();
    expect(state(el)).toBe("queued");
    expect(server.posts).toHaveLength(1);
  });

  it("signing out while the restored job is being followed clears the screen and the pointer, and nothing more is asked", async () => {
    await firstVisit();
    const el = await reload();
    expect(state(el)).toBe("queued");
    await act(async () => { fakeAuth.setSession(null); });
    await advance(0);
    expect(scanPanel(el).querySelector(".scan-lab-result, .sc-research")).toBeNull();
    expect(checkpoint()).toBeNull();
    const mark = server.mark();
    await advance(60_000);
    expect(server.since(mark)).toHaveLength(0);
    expect(el.textContent).not.toMatch(/Vitamin D3|Researching your supplement/);
  });

  for (const [name, answer] of [["200 with their scan", () => jsonResponse({ status: "ok", run_id: RUN, analysis: { ...vitaminD(), persistence: undefined } })], ["403", () => jsonResponse({ status: "forbidden" }, 403)], ["401", () => jsonResponse({ status: "unauthorized" }, 401)]] as const) {
    it(`a LATE answer for the person who signed out (${name}) shows nothing of theirs and leaves nothing behind`, async () => {
      await firstVisit();
      let late!: (r: Response) => void;
      server.fault = (c) => (c.url.startsWith("/api/scan/history/") ? new Promise<Response>((resolve) => { late = resolve; }) : undefined);
      await harness.cleanup(); forgetResearchJobs(); noteResearchOwner(null); resetGoogleSignInForTests();
      const el = await mount();
      await advance(0);
      expect(scanPanel(el).querySelector('[data-testid="resume-restoring"]')).not.toBeNull();
      await act(async () => { fakeAuth.setSession(null); });
      await advance(0);
      await act(async () => { late(answer()); });
      await advance(5000);
      expect(scanPanel(el).querySelector(".scan-lab-result, .sc-research, [data-testid='research-audit'], [data-testid='resume-failed']")).toBeNull();
      expect(el.textContent).not.toContain("Vitamin D3");
      expect(checkpoint()).toBeNull();
      const researchAsked = server.calls.filter((c) => c.url.startsWith("/api/scan/research")).length;
      fakeAuth.setSession(sessionFor(OWNER, "tok-owner")); // signing in again later shows the landing, not the old scan, and asks for nothing
      await advance(5000);
      expect(el.textContent).not.toContain("Vitamin D3");
      expect(server.calls.filter((c) => c.url.startsWith("/api/scan/research")).length).toBe(researchAsked);
    });
  }

  it("an account switch while a scan is on screen clears the pointer; the next account's reload shows nothing of the first", async () => {
    await firstVisit();
    await act(async () => { fakeAuth.setSession(sessionFor(STRANGER, "tok-stranger")); });
    await advance(0);
    expect(checkpoint()).toBeNull();
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(el.textContent).not.toContain("Vitamin D3");
  });

  it("a 401 on the restore read refreshes the token ONCE and retries; a second 401 ends the session on screen instead of looping", async () => {
    await firstVisit();
    fakeAuth.refreshTo = sessionFor(OWNER, "tok-owner-2");
    let firstTry = true;
    server.fault = (c) => { if (c.url.startsWith("/api/scan/history/") && firstTry) { firstTry = false; return jsonResponse({ status: "unauthorized" }, 401); } return undefined; };
    const el = await reload();
    expect(fakeAuth.refreshCalls).toBe(1);
    expect(server.calls.filter((c) => c.url.startsWith("/api/scan/history/")).map((c) => c.headers.Authorization)).toEqual(["Bearer tok-owner", "Bearer tok-owner-2"]);
    expect(state(el)).toBe("queued");

    fakeAuth.refreshTo = sessionFor(OWNER, "tok-owner");
    server.fault = (c) => (c.url.startsWith("/api/scan/history/") ? jsonResponse({ status: "unauthorized" }, 401) : undefined);
    const again = await reload();
    expect(fakeAuth.signOutCalls).toBeGreaterThanOrEqual(1);
    expect(scanPanel(again).querySelector(".scan-lab-result")).toBeNull();
  });
});

describe("a transient failure never leaves a silent 'running' screen", () => {
  it("the restore read failing (network) shows a visible retry that restores the scan; 'Start a new scan' clears the pointer", async () => {
    await firstVisit();
    let down = true;
    server.fault = (c) => { if (c.url.startsWith("/api/scan/history/") && down) return Promise.reject(new TypeError("Load failed")); return undefined; };
    const el = await reload();
    expect(scanPanel(el).querySelector('[data-testid="resume-failed"]')?.getAttribute("role")).toBe("alert");
    expect(checkpoint()).not.toBeNull(); // still the person's: nothing was lost
    down = false;
    await click(buttonByText(scanPanel(el), /try again/i));
    await advance(0);
    expect(state(el)).toBe("queued");
    expect(server.posts).toHaveLength(1);

    down = true;
    const failed = await reload();
    await click(buttonByText(scanPanel(failed), /start a new scan/i));
    await advance(0);
    expect(checkpoint()).toBeNull();
    expect(scanPanel(failed).querySelector('[data-testid="resume-failed"]')).toBeNull();
    expect(scanPanel(failed).querySelector(".sc-viewfinder, .sc-capture")).not.toBeNull();
  });

  it("the job read failing in a transient way while it is being followed: a visible 'retrying' line, the same GET again, and the card still arrives by itself", async () => {
    await firstVisit();
    const el = await reload();
    let fail = 2;
    server.fault = (c) => { if (c.url === `/api/scan/research/${JOB}` && fail > 0) { fail -= 1; return Promise.reject(new TypeError("Load failed")); } return undefined; };
    await advance(2500);
    expect(scanPanel(el).querySelector('[data-testid="research-reconnecting"]')).not.toBeNull();
    expect(phase(el)).toBe("loading");
    server.set("succeeded", { result: RESULT });
    await advance(2500 + 5000);
    expect(phase(el)).toBe("result");
    expect(scanPanel(el).querySelector('[data-testid="research-reconnecting"]')).toBeNull();
    expect(server.posts).toHaveLength(1);
  });

  it("a read that never finishes is abandoned after its ceiling and asked again (the phone slept; the connection died quietly)", async () => {
    await firstVisit();
    const el = await reload();
    let hang = true;
    server.fault = (c) => (c.url === `/api/scan/research/${JOB}` && hang ? new Promise<Response>(() => undefined) : undefined);
    await advance(2500);
    expect(state(el)).toBe("queued");
    hang = false;
    server.set("succeeded", { result: RESULT });
    await advance(RESEARCH_REQUEST_TIMEOUT_MS + 2500 + 100);
    expect(phase(el)).toBe("result");
    expect(server.posts).toHaveLength(1);
  });
});

describe("the storage itself may be unavailable", () => {
  it("a storage that throws on write or read leaves the fresh flow working (research is still requested once) and a reload just shows the landing", async () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("denied"); }, clear: () => undefined, key: () => null, length: 0 } as unknown as Storage;
    Object.defineProperty(window, "sessionStorage", { value: broken, configurable: true, writable: true });
    const first = await firstVisit();
    expect(state(first)).toBe("queued");
    expect(server.posts).toHaveLength(1);
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(server.posts).toHaveLength(1);
  });

  it("no sessionStorage at all behaves the same", async () => {
    Object.defineProperty(window, "sessionStorage", { value: undefined, configurable: true, writable: true });
    const first = await firstVisit();
    expect(state(first)).toBe("queued");
    const el = await reload();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
  });
});

describe("the restored screen is the same accessible screen, in both languages", () => {
  it("the restoring line and the failure card are announced (status / alert), keyboard-reachable buttons, and Lithuanian when the page is", async () => {
    await firstVisit();
    window.localStorage.setItem("bsproof.lang", "lt");
    resetLangMemory();
    server.fault = (c) => (c.url.startsWith("/api/scan/history/") ? Promise.reject(new TypeError("Load failed")) : undefined);
    const el = await reload();
    const failed = scanPanel(el).querySelector('[data-testid="resume-failed"]')!;
    expect(failed.getAttribute("role")).toBe("alert");
    expect(failed.textContent).toContain("Nepavyko atkurti tavo skenavimo");
    for (const b of Array.from(failed.querySelectorAll("button"))) expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    expect(Array.from(failed.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Bandyti dar kartą", "Pradėti naują skenavimą"]);
  });
});

describe("what the job target is is untouched", () => {
  it("the facts the research used are still the saved scan's (sanity: this test file's job is the server's, not a new target)", () => {
    expect(TARGET.version).toBe("ResearchJobV1");
  });
});
