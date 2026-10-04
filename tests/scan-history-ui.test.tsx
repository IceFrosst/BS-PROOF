/*
 * The History tab (2026-09-23): the signed-in person's latest scans, and
 * replaying one WITHOUT a new model call. Drives the real <ScanWorkspace> (so
 * tab switching, the shared session and <ScanFlow>'s replay are all real) with
 * a routed fetch stub standing in for the API.
 *
 * Contract under test:
 *   GET /api/scan/history          Bearer, no-store -> { status:"ok", runs:[...], next_cursor:null }
 *   GET /api/scan/history/<uuid>   Bearer, no-store -> { status:"ok", run_id, analysis }
 *   401 = sign in again, 404 = not found, 503 = unavailable (all generic text)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";
import { forgetResearchJobs, noteResearchOwner } from "@/lib/scan-research/client";

import { USER_A, USER_B, fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { Harness, STORED, analysis, buttonByText, click, jsonResponse, record, settle, stageAndScan, type RecordedCall } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { ScanWorkspace } = await import("@/components/scan-workspace");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const rich = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const catalog = ingredientCatalog();
const harness = new Harness();

const RUN_1 = "11111111-1111-4111-8111-111111111111";
const RUN_2 = "22222222-2222-4222-8222-222222222222";
const run1 = { id: RUN_1, created_at: "2026-09-20T10:30:00Z", source: "photo", status: "ok", product_name: "Creatine Pro 5000" };
const run2 = { id: RUN_2, created_at: "2026-09-19T08:00:00Z", source: "manual", status: "ingredient_not_supported", product_name: null };
const RESEARCH_JOB = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
const researchJob = (status: "queued" | "running") => ({ id: RESEARCH_JOB, scan_id: RUN_1, status, prompt_version: "live-research-v0.2", target: null, created_at: "2026-09-20T10:31:00+00:00", updated_at: "2026-09-20T10:31:00+00:00", completed_at: null, failure_code: null, result: null });
const listOf = (...runs: unknown[]) => jsonResponse({ status: "ok", runs, next_cursor: null });
const detailOf = (id: string, body: unknown = rich) => jsonResponse({ status: "ok", run_id: id, analysis: body });

beforeEach(() => {
  forgetResearchJobs(); // what the page remembers about research jobs is page-lifetime state: start each test as a fresh page
  noteResearchOwner(null);
  fakeAuth.reset();
  fakeAuth.configured = true;
  fakeAuth.session = sessionFor(USER_A, "tok-a");
  resetGoogleSignInForTests();
  installFakeGoogle();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
});

afterEach(async () => {
  await harness.cleanup();
  removeFakeGoogle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Answer = Response | Promise<Response> | undefined;

/** Route fetch by URL; every call is recorded. Unmatched calls fail loudly. */
function stubApi(routes: { list?: (call: RecordedCall) => Answer; detail?: (call: RecordedCall, id: string) => Answer; scan?: (call: RecordedCall) => Answer; research?: (call: RecordedCall) => Answer }) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const call = record(url, init);
      calls.push(call);
      const path = call.url;
      let answer: Answer;
      if (path === "/api/scan/history") answer = routes.list?.(call);
      else if (path.startsWith("/api/scan/history/")) answer = routes.detail?.(call, decodeURIComponent(path.slice("/api/scan/history/".length)));
      else if (path === "/api/scan") answer = routes.scan?.(call);
      else if (path === "/api/scan/research" || path.startsWith("/api/scan/research/")) answer = routes.research?.(call) ?? jsonResponse({ status: "research_disabled" }, 503);
      if (!answer) throw new Error(`unexpected request ${call.method} ${path}`);
      return answer;
    }),
  );
  return calls;
}

const mountWorkspace = () => harness.mount(createElement(ScanWorkspace, { catalog }));
const tab = (el: HTMLElement, name: RegExp) => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => name.test(t.textContent ?? ""))!;
const historyPanel = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1];
async function openHistory(el: HTMLElement) {
  await settle();
  await click(tab(el, /history/i));
  await settle();
}
const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>("button.sw-run"));

describe("the list", () => {
  it("fetches the latest runs with the bearer token, uncached, and lists them with their saved date", async () => {
    const calls = stubApi({ list: () => listOf(run1, run2) });
    const el = await mountWorkspace();
    await openHistory(el);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/scan/history", method: "GET" });
    expect(calls[0].headers.Authorization).toBe("Bearer tok-a");
    const init = (globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0][1];
    expect(init.cache).toBe("no-store");

    expect(rows(el)).toHaveLength(2);
    expect(rows(el)[0].textContent).toContain("Creatine Pro 5000");
    expect(rows(el)[0].textContent).toMatch(/photo scan/i);
    expect(rows(el)[1].textContent).toMatch(/typed supplement/i);
    expect(rows(el)[1].textContent).toMatch(/ingredient not supported/i);
    const time = rows(el)[0].querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-09-20T10:30:00Z");
    expect(time?.textContent).toMatch(/2026/);
    expect(rows(el)[0].textContent).toMatch(/^.*Saved/);
    expect(el.textContent).toContain("a@example.com");
  });

  it("shows a loading state while it waits, announced politely, and no list yet", async () => {
    let release!: (r: Response) => void;
    stubApi({ list: () => new Promise<Response>((resolve) => (release = resolve)) });
    const el = await mountWorkspace();
    await openHistory(el);
    const loading = el.querySelector('[data-testid="history-loading"]');
    expect(loading?.getAttribute("role")).toBe("status");
    expect(loading?.textContent).toMatch(/loading your scans/i);
    expect(rows(el)).toHaveLength(0);

    release(listOf(run1));
    await settle();
    expect(el.querySelector('[data-testid="history-loading"]')).toBeNull();
    expect(rows(el)).toHaveLength(1);
  });

  it("an empty history is an invitation, with a way back to the camera", async () => {
    stubApi({ list: () => listOf() });
    const el = await mountWorkspace();
    await openHistory(el);
    const empty = el.querySelector('[data-testid="history-empty"]');
    expect(empty?.textContent).toMatch(/no saved scans yet/i);
    await click(buttonByText(empty as HTMLElement, /go to scan/i));
    expect(tab(el, /^scan$/i).getAttribute("aria-selected")).toBe("true");
    expect(el.querySelector<HTMLElement>('[role="tabpanel"]')?.hidden).toBe(false);
  });

  it("an unavailable service is a generic alert with Try again, which really retries", async () => {
    let answer: Response = jsonResponse({ status: "unavailable", error: "relation scan_runs does not exist (db.internal)" }, 503);
    const calls = stubApi({ list: () => answer });
    const el = await mountWorkspace();
    await openHistory(el);

    const alert = el.querySelector('[data-testid="history-error"]');
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toMatch(/unavailable right now/i);
    expect(alert?.textContent).not.toContain("db.internal");
    expect(rows(el)).toHaveLength(0);

    answer = listOf(run1);
    await click(buttonByText(alert as HTMLElement, /try again/i));
    await settle();
    expect(calls).toHaveLength(2);
    expect(el.querySelector('[data-testid="history-error"]')).toBeNull();
    expect(rows(el)).toHaveLength(1);
  });

  it("a network failure and a malformed body are errors too, never an empty list", async () => {
    let mode: "throw" | "garbage" = "throw";
    stubApi({
      list: () => {
        if (mode === "throw") throw new Error("offline");
        return jsonResponse({ status: "ok", runs: "not-an-array" });
      },
    });
    const el = await mountWorkspace();
    await openHistory(el);
    expect(el.querySelector('[data-testid="history-error"]')?.textContent).toMatch(/could not load your scans/i);

    mode = "garbage";
    await click(buttonByText(el.querySelector('[data-testid="history-error"]') as HTMLElement, /try again/i));
    await settle();
    expect(el.querySelector('[data-testid="history-error"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="history-empty"]')).toBeNull();
  });

  it("a 401 refreshes the token once and retries; if it still fails the session ends on screen", async () => {
    fakeAuth.refreshTo = sessionFor(USER_A, "tok-new");
    const calls = stubApi({ list: (c) => (c.headers.Authorization === "Bearer tok-new" ? listOf(run1) : jsonResponse({ status: "unauthorized" }, 401)) });
    const el = await mountWorkspace();
    await openHistory(el);
    expect(calls.map((c) => c.headers.Authorization)).toEqual(["Bearer tok-a", "Bearer tok-new"]);
    expect(rows(el)).toHaveLength(1);

    // A stricter server: refreshing does not help.
    await harness.cleanup();
    fakeAuth.reset();
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    fakeAuth.refreshTo = undefined;
    stubApi({ list: () => jsonResponse({ status: "unauthorized" }, 401) });
    const el2 = await mountWorkspace();
    await openHistory(el2);
    expect(fakeAuth.signOutCalls).toBe(1);
    expect(historyPanel(el2).querySelector('[data-testid="signin-card"]')).not.toBeNull();
    expect(historyPanel(el2).querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/session ended/i);
    expect(rows(el2)).toHaveLength(0);
  });
});

describe("opening a saved scan", () => {
  it("fetches only that run, draws it through the same result card, dates it, and makes no scan or model call", async () => {
    const calls = stubApi({ list: () => listOf(run1, run2), detail: (_c, id) => detailOf(id) });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    await settle();

    // Opening a saved scan asks for NOTHING but that run: no scan, no model call, and no research request either.
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/scan/history", `GET /api/scan/history/${RUN_1}`]);
    expect(calls[1].headers.Authorization).toBe("Bearer tok-a");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(calls.some((c) => c.url === "/api/scan")).toBe(false);

    const panel = historyPanel(el);
    // The SAME renderer: the lab card, its validity stamp... and no capture chrome.
    expect(panel.querySelector(".scan-lab-result")).not.toBeNull();
    expect(panel.textContent).toContain("Creatine Pro 5000");
    expect(panel.querySelector("#scan-file")).toBeNull();
    expect(panel.querySelector("#scan-capture")).toBeNull();
    expect(buttonByText(panel, /search your supplement/i)).toBeUndefined();
    // Dated, and explicit that nothing was re-run.
    const note = panel.querySelector('[data-testid="replay-note"]');
    expect(note?.textContent).toMatch(/saved scan from/i);
    expect(note?.textContent).toMatch(/2026/);
    expect(note?.textContent).toMatch(/nothing was re-run/i);
    expect(note?.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-20T10:30:00Z");
    // No "scan another", no persistence claim for something that was merely replayed.
    expect(panel.querySelector('[aria-label="Scan another"]')).toBeNull();
    expect(panel.querySelector('[aria-label="Back to history"]')).not.toBeNull();
    expect(panel.querySelector('[data-testid="save-status"]')).toBeNull();
    // Focus lands on the dated note so a screen reader hears what this is.
    expect(document.activeElement).toBe(note);
  });

  it("its live research is requested only when the person presses the button (their token, that run's id); opening the same scan again looks the job up instead of asking again", async () => {
    const calls = stubApi({
      list: () => listOf(run1),
      detail: (_c, id) => detailOf(id),
      research: (c) => jsonResponse({ status: "ok", job: researchJob("queued") }, c.method === "POST" ? 201 : 200),
    });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    await settle();
    const panel = () => historyPanel(el).querySelector<HTMLElement>(".sc-research");
    expect(panel()?.getAttribute("data-research-state")).toBe("idle");
    expect(panel()?.textContent).toMatch(/nothing was re-run/i);
    expect(calls.some((c) => c.url.startsWith("/api/scan/research"))).toBe(false);

    await click(buttonByText(historyPanel(el), /look up live research/i));
    await settle();
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ url: "/api/scan/research" });
    expect(posts[0].headers.Authorization).toBe("Bearer tok-a");
    expect(JSON.parse(String(posts[0].body))).toEqual({ scan_id: RUN_1 });
    expect(panel()?.getAttribute("data-research-state")).toBe("queued");
    expect(panel()?.textContent).toContain("Queued for the private research worker.");

    // Back and open the same saved scan again: the job is LOOKED UP (GET), research is not asked for a second time.
    await click(historyPanel(el).querySelector('[aria-label="Back to history"]'));
    await settle();
    await click(rows(el)[0]);
    await settle();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(calls.filter((c) => c.url === `/api/scan/research/${RESEARCH_JOB}`).length).toBeGreaterThanOrEqual(1);
    expect(panel()?.getAttribute("data-research-state")).toBe("queued");
  });

  it("signing out while its research is queued aborts the poll and removes the panel with the rest of the account's data", async () => {
    const calls = stubApi({
      list: () => listOf(run1),
      detail: (_c, id) => detailOf(id),
      research: () => jsonResponse({ status: "ok", job: researchJob("running") }),
    });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    await settle();
    await click(buttonByText(historyPanel(el), /look up live research/i));
    await settle();
    const research = calls.find((c) => c.url === "/api/scan/research")!;
    expect(historyPanel(el).querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("running");
    expect(research.signal?.aborted).toBe(false);

    fakeAuth.setSession(null);
    await settle();
    expect(research.signal?.aborted).toBe(true);
    expect(historyPanel(el).querySelector(".sc-research")).toBeNull();
    expect(historyPanel(el).querySelector('[data-testid="signin-card"]')).not.toBeNull();
    expect(historyPanel(el).textContent).not.toMatch(/Magnesium|research is running/i);
  });

  it("Back returns to the list and puts focus on the row that was opened", async () => {
    stubApi({ list: () => listOf(run1, run2), detail: (_c, id) => detailOf(id) });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[1] ?? rows(el)[0]);
    await settle();
    const back = historyPanel(el).querySelector<HTMLButtonElement>('[aria-label="Back to history"]');
    await click(back);
    await settle();
    expect(historyPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(rows(el)).toHaveLength(2);
    expect(document.activeElement).toBe(rows(el)[1]);
  });

  it("a saved typed entry and a saved non-result both replay through the same renderer", async () => {
    const saved = analysis({ source: "manual", run_id: RUN_2, input: undefined });
    stubApi({ list: () => listOf(run2), detail: (_c, id) => detailOf(id, saved) });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    await settle();
    expect(historyPanel(el).textContent).toMatch(/is not in the evidence vocabulary yet/i);
    expect(historyPanel(el).querySelector('[data-testid="replay-note"]')).not.toBeNull();
  });

  it("while it opens there is a status, and a failure is generic with the right action", async () => {
    let release!: (r: Response) => void;
    let mode: "hang" | "404" | "503" | "bad-id" | "ok" = "hang";
    const calls = stubApi({
      list: () => listOf(run1),
      detail: (_c, id) => {
        if (mode === "hang") return new Promise<Response>((resolve) => (release = resolve));
        if (mode === "404") return jsonResponse({ status: "not_found", error: "no row in scan_runs for owner=user-a" }, 404);
        if (mode === "503") return jsonResponse({ status: "unavailable" }, 503);
        if (mode === "bad-id") return detailOf(RUN_2);
        return detailOf(id);
      },
    });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    expect(historyPanel(el).querySelector('[data-testid="history-detail-loading"]')?.getAttribute("role")).toBe("status");

    mode = "404";
    release(jsonResponse({ status: "not_found" }, 404));
    await settle();
    let alert = historyPanel(el).querySelector('[data-testid="history-detail-error"]');
    expect(alert?.textContent).toMatch(/not found/i);
    expect(alert?.textContent).not.toContain("user-a");
    expect(buttonByText(alert as HTMLElement, /try again/i)).toBeUndefined(); // nothing to retry

    // Back, then 503: retryable.
    await click(buttonByText(historyPanel(el), /back to history/i));
    await settle();
    mode = "503";
    await click(rows(el)[0]);
    await settle();
    alert = historyPanel(el).querySelector('[data-testid="history-detail-error"]');
    expect(alert?.textContent).toMatch(/unavailable right now/i);
    mode = "ok";
    await click(buttonByText(alert as HTMLElement, /try again/i));
    await settle();
    expect(historyPanel(el).querySelector(".scan-lab-result")).not.toBeNull();

    // A response for a DIFFERENT run than the one asked for is refused.
    await click(historyPanel(el).querySelector('[aria-label="Back to history"]'));
    await settle();
    mode = "bad-id";
    await click(rows(el)[0]);
    await settle();
    expect(historyPanel(el).querySelector('[data-testid="history-detail-error"]')?.textContent).toMatch(/could not be opened/i);
    expect(historyPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(calls.filter((c) => c.url === `/api/scan/history/${RUN_1}`).length).toBeGreaterThanOrEqual(4);
  });

  it("an unusable stored analysis is refused rather than half-drawn", async () => {
    stubApi({ list: () => listOf(run1), detail: (_c, id) => detailOf(id, { status: "scored" }) });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    await settle();
    expect(historyPanel(el).querySelector('[data-testid="history-detail-error"]')).not.toBeNull();
    expect(historyPanel(el).querySelector(".scan-lab-result")).toBeNull();
  });

  it("a FRESH scan that was really stored asks for its research once, with the owner's token and the stored run id; an unsaved one asks for nothing", async () => {
    const stored = { ...structuredClone(rich), run_id: RUN_1, persistence: { ...STORED, run_id: RUN_1 } };
    const calls = stubApi({
      scan: () => jsonResponse(stored),
      research: () => jsonResponse({ status: "ok", job: researchJob("queued") }, 201),
    });
    const el = await mountWorkspace();
    await settle();
    await stageAndScan(el);
    await settle();
    const asked = calls.filter((c) => c.url.startsWith("/api/scan/research"));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ method: "POST", url: "/api/scan/research" });
    expect(asked[0].headers.Authorization).toBe("Bearer tok-a");
    expect(JSON.parse(String(asked[0].body))).toEqual({ scan_id: RUN_1 });
    expect(el.querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("queued");
  });

  it("a fresh scan the server did not store has no run id to research: no research request is made and the panel says so", async () => {
    const unsaved = { ...structuredClone(rich), run_id: RUN_1, persistence: { status: "failed" } };
    const calls = stubApi({ scan: () => jsonResponse(unsaved) });
    const el = await mountWorkspace();
    await settle();
    await stageAndScan(el);
    await settle();
    expect(calls.some((c) => c.url.startsWith("/api/scan/research"))).toBe(false);
    expect(el.querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("no-id");
  });

  it("a saved run never duplicates element ids with the live Scan tab's own result", async () => {
    const calls = stubApi({
      list: () => listOf(run1),
      detail: (_c, id) => detailOf(id),
      scan: () => jsonResponse({ ...structuredClone(rich), persistence: STORED }),
    });
    const el = await mountWorkspace();
    await settle();
    await stageAndScan(el);
    await settle();
    expect(el.querySelector(".scan-lab-result")).not.toBeNull();

    await click(tab(el, /history/i));
    await settle();
    await click(rows(el)[0]);
    await settle();
    expect(calls.filter((c) => c.url === "/api/scan")).toHaveLength(1); // only the original live scan

    const ids = Array.from(el.querySelectorAll("[id]")).map((n) => n.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
    // Both results' tab controls resolve to their own panels.
    for (const t of Array.from(el.querySelectorAll('[role="tab"][aria-controls^="_r"], [role="tab"][aria-controls*="ab-scan-tabpanel"]'))) {
      expect(el.querySelector(`[id="${t.getAttribute("aria-controls")}"]`)).not.toBeNull();
    }
  });
});

describe("one person's history is never shown to the next", () => {
  it("switching accounts drops the list at once, shows the new person's own, and ignores a late answer for the old one", async () => {
    let releaseA!: (r: Response) => void;
    const calls = stubApi({
      list: (c) => {
        if (c.headers.Authorization === "Bearer token-user-a") {
          return new Promise<Response>((resolve) => (releaseA = resolve));
        }
        return listOf({ ...run2, product_name: "B-only product" });
      },
    });
    fakeAuth.session = sessionFor(USER_A);
    const el = await mountWorkspace();
    await openHistory(el);
    expect(el.querySelector('[data-testid="history-loading"]')).not.toBeNull();

    fakeAuth.setSession(sessionFor(USER_B));
    await settle();
    expect(calls[0].signal?.aborted).toBe(true);
    expect(rows(el).map((r) => r.textContent)).toEqual([expect.stringContaining("B-only product")]);
    expect(el.textContent).toContain("b@example.com");
    expect(el.textContent).not.toContain("a@example.com");

    // A's answer finally arrives; it must not appear for B.
    releaseA(listOf({ ...run1, product_name: "A-only product" }));
    await settle();
    expect(el.textContent).not.toContain("A-only product");
    expect(rows(el)).toHaveLength(1);
  });

  it("switching accounts closes a saved scan that was open and never shows it to the new person", async () => {
    stubApi({
      list: (c) => (c.headers.Authorization === "Bearer token-user-a" ? listOf(run1) : listOf()),
      detail: (_c, id) => detailOf(id),
    });
    fakeAuth.session = sessionFor(USER_A);
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    await settle();
    expect(historyPanel(el).querySelector(".scan-lab-result")).not.toBeNull();

    fakeAuth.setSession(sessionFor(USER_B));
    await settle();
    expect(historyPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(historyPanel(el).textContent).not.toContain("Creatine Pro 5000");
    expect(historyPanel(el).querySelector('[data-testid="history-empty"]')).not.toBeNull();
  });

  it("signing out while a saved scan is loading aborts it; the late answer never appears and the sign-in card returns", async () => {
    let releaseDetail!: (r: Response) => void;
    const calls = stubApi({ list: () => listOf(run1), detail: () => new Promise<Response>((resolve) => (releaseDetail = resolve)) });
    const el = await mountWorkspace();
    await openHistory(el);
    await click(rows(el)[0]);
    expect(calls[1].signal?.aborted).toBe(false);

    fakeAuth.setSession(null);
    await settle();
    expect(calls[1].signal?.aborted).toBe(true);
    releaseDetail(detailOf(RUN_1));
    await settle();
    expect(historyPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(historyPanel(el).querySelector('[data-testid="signin-card"]')).not.toBeNull();
    expect(historyPanel(el).textContent).not.toContain("Creatine Pro 5000");
  });

  it("signing out removes the list itself, leaving only the way to sign back in", async () => {
    stubApi({ list: () => listOf(run1) });
    const el = await mountWorkspace();
    await openHistory(el);
    expect(rows(el)).toHaveLength(1);
    await click(buttonByText(historyPanel(el), /sign out/i));
    await settle();
    expect(fakeAuth.signOutCalls).toBe(1);
    expect(rows(el)).toHaveLength(0);
    expect(historyPanel(el).textContent).not.toContain("Creatine Pro 5000");
    expect(historyPanel(el).querySelector('[data-testid="signin-card"]')).not.toBeNull();
  });
});

describe("History stays current after a scan that was stored", () => {
  it("opens fresh every time, and a scan stored while History is open refetches the list", async () => {
    let scanRelease!: (r: Response) => void;
    let runs: unknown[] = [run2];
    const calls = stubApi({
      list: () => listOf(...runs),
      scan: () => new Promise<Response>((resolve) => (scanRelease = resolve)),
    });
    const el = await mountWorkspace();
    await settle();
    await stageAndScan(el);
    await settle();

    await click(tab(el, /history/i));
    await settle();
    expect(calls.filter((c) => c.url === "/api/scan/history")).toHaveLength(1);
    expect(rows(el)).toHaveLength(1);

    // The scan finishes (in the hidden Scan tab) and the server reports it stored.
    runs = [run1, run2];
    scanRelease(jsonResponse(analysis({ persistence: STORED, ingredient_label_text: "Creatine Pro 5000" })));
    await settle();
    expect(calls.filter((c) => c.url === "/api/scan/history")).toHaveLength(2);
    expect(rows(el)).toHaveLength(2);
  });

  it("a scan that was NOT stored does not pretend History changed", async () => {
    let scanRelease!: (r: Response) => void;
    const calls = stubApi({ list: () => listOf(run2), scan: () => new Promise<Response>((resolve) => (scanRelease = resolve)) });
    const el = await mountWorkspace();
    await settle();
    await stageAndScan(el);
    await settle();
    await click(tab(el, /history/i));
    await settle();
    scanRelease(jsonResponse(analysis({ persistence: { ...STORED, status: "failed" } })));
    await settle();
    expect(calls.filter((c) => c.url === "/api/scan/history")).toHaveLength(1);
  });

  it("returning to History after a stored scan asks again", async () => {
    const calls = stubApi({ list: () => listOf(run2), scan: () => jsonResponse(analysis({ persistence: STORED })) });
    const el = await mountWorkspace();
    await settle();
    await click(tab(el, /history/i));
    await settle();
    await click(tab(el, /^scan$/i));
    await stageAndScan(el);
    await settle();
    await click(tab(el, /history/i));
    await settle();
    expect(calls.filter((c) => c.url === "/api/scan/history")).toHaveLength(2);
  });
});
