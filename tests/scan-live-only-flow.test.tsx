// @vitest-environment jsdom
/*
 * /scan is LIVE-ONLY (2026-10-05): label read -> saved, owned scan -> a TOP-LEVEL live-research loading
 * screen with an indeterminate progress bar -> the completed live audit, and nothing else as evidence.
 * Every API answer here is mocked (a fake Supabase session, fake /api/scan and /api/scan/research
 * jobs) and every clock is frozen: no model, no research, no network, no new real job.
 *
 * What is pinned: the state machine and its screens; no retained / cached / "no evidence run" / model
 * recall / company evidence anywhere; no early result; one switch to the result; one POST ever per
 * scan; the stale-owner / unmount / leave rules; History never researches by itself; failures and
 * missing facts are visible and actionable; Lithuanian controls with untouched English narrative.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StrictMode, act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";
import { LANG_KEY, resetLangMemory } from "@/lib/i18n/locale";
import { resetTranslationsForTests } from "@/lib/i18n/translate-client";
import { forgetResearchJobs, noteResearchOwner } from "@/lib/scan-research/client";

import { USER_A, USER_B, fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { JOB_ID, RESULT, SENTENCE, STUDY, researchJob } from "./helpers/live-research-fixtures";
import { installLocalStorage } from "./helpers/local-storage";
import { Harness, STORED, buttonByText, click, jsonResponse, record, stageAndScan, stagePhoto, type RecordedCall } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { ScanWorkspace } = await import("@/components/scan-workspace");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const rich = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const catalog = ingredientCatalog();
const harness = new Harness();

const RUN = "11111111-1111-4111-8111-111111111111";

/** A vitamin D label read (the scan that showed "No evidence run exists"): form unknown, 50 mcg, NO daily regimen. */
function vitaminD(overrides: Record<string, unknown> = {}) {
  const scan = structuredClone(rich);
  scan.label = { ...scan.label, ingredient_vocab_id: "vitamin_d", ingredient_label_text: "Vitamin D3", form_vocab_id: null, compound_dose_mg: 0.05, printed_elemental_dose_mg: null, dose_unit_as_printed: "mcg", servings_per_day: null, is_multi_ingredient: false, other_actives: [], actives: [], product_name: "Vitamin D3 2000 IU", brand: "Acme" };
  return { ...scan, run_id: RUN, persistence: { ...STORED, run_id: RUN }, ...overrides };
}
const LEGACY = /No evidence run|evidence run exists|That form has not been run|not a low score|Is your dose the dose that worked|Model knowledge|MLM|Funding & independence|Publication bias|Evidence orientation|Nordic Labs/i;
const LEGACY_LT = /įrodymų paleidimo nėra|Ši forma dar nebuvo tirta|Bendras balas|Finansavimas ir nepriklausomumas|Publikavimo šališkumas/;

type Answer = Response | Promise<Response> | undefined;
interface Routes {
  scan?: (c: RecordedCall) => Answer;
  research?: (c: RecordedCall) => Answer;
  list?: (c: RecordedCall) => Answer;
  detail?: (c: RecordedCall, id: string) => Answer;
}
/** Route fetch by URL, record every call, fail loudly on anything unexpected (translator included). */
function stubApi(routes: Routes) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
    const call = record(url, init);
    calls.push(call);
    const path = call.url;
    let answer: Answer;
    if (path === "/api/scan") answer = routes.scan?.(call);
    else if (path === "/api/scan/research" || path.startsWith("/api/scan/research/")) answer = routes.research?.(call);
    else if (path === "/api/scan/history") answer = routes.list?.(call);
    else if (path.startsWith("/api/scan/history/")) answer = routes.detail?.(call, decodeURIComponent(path.slice("/api/scan/history/".length)));
    if (!answer) throw new Error(`unexpected request ${call.method} ${path}`);
    return answer;
  }));
  return calls;
}
const researchCalls = (calls: RecordedCall[]) => calls.filter((c) => c.url.startsWith("/api/scan/research"));
const posts = (calls: RecordedCall[]) => calls.filter((c) => c.method === "POST" && c.url === "/api/scan/research");
const ok = (job: unknown, status = 200) => jsonResponse({ status: "ok", job }, status);

/** A research route that walks a script: the first answer is the POST, each later one a poll. */
function scripted(...jobs: Array<Response | (() => Response)>) {
  let n = 0;
  return () => {
    const next = jobs[Math.min(n, jobs.length - 1)];
    n += 1;
    return typeof next === "function" ? next() : next.clone();
  };
}

const mount = (strict = false) => harness.mount(strict ? createElement(StrictMode, null, createElement(ScanWorkspace, { catalog })) : createElement(ScanWorkspace, { catalog }));
/** Frozen clock: advance fake time and let every promise it wakes settle. */
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const scanPanel = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[0];
const historyPanel = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1];
const stage = (el: HTMLElement) => scanPanel(el).querySelector(".scan-lab-result")?.getAttribute("data-scan-stage") ?? null;
const text = (el: Element | null | undefined) => el?.textContent ?? "";
const tab = (el: HTMLElement, name: RegExp) => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => name.test(t.textContent ?? ""))!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T19:00:30Z"));
  installLocalStorage();
  resetLangMemory();
  resetTranslationsForTests();
  forgetResearchJobs();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.lang = "";
});

describe("fresh scan: label read -> saved scan -> live research loading screen -> live result only", () => {
  it("walks label loading -> research loading (bar, no early result) -> ONE switch to the audit, with exactly one POST and no legacy card at any step", async () => {
    let release!: (r: Response) => void;
    const calls = stubApi({
      scan: () => new Promise<Response>((resolve) => { release = resolve; }),
      research: scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "running", { updated_at: "2026-10-04T19:01:00+00:00" })), ok(researchJob(RUN, "succeeded"))),
    });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);

    // 1. the label is being analysed: its own loading panel, and nothing about research yet
    expect(scanPanel(el).querySelector(".sc-progress")).not.toBeNull();
    expect(scanPanel(el).querySelector(".sc-research")).toBeNull();
    expect(researchCalls(calls)).toHaveLength(0);

    // 2. the scan is saved: the research loading screen replaces it (one screen, not a card under a result)
    await act(async () => { release(jsonResponse(vitaminD())); });
    await advance(0);
    expect(scanPanel(el).querySelector(".sc-progress")).toBeNull();
    expect(stage(el)).toBe("loading");
    const loading = scanPanel(el).querySelector(".sc-research")!;
    expect(loading.getAttribute("data-research-phase")).toBe("loading");
    expect(loading.getAttribute("data-research-state")).toBe("queued");
    expect(scanPanel(el).querySelectorAll(".sc-research")).toHaveLength(1);
    expect(text(loading.querySelector("h2"))).toBe("Researching your supplement live");
    expect(text(loading.querySelector('[role="status"]'))).toBe("Queued for the private research worker.");
    expect(text(loading)).toContain("Queued 2026-10-04 19:00 UTC");
    // an INDETERMINATE bar: named, present, and with no value, no style and no number anywhere
    const bars = scanPanel(el).querySelectorAll('[role="progressbar"]');
    expect(bars).toHaveLength(1);
    for (const attribute of ["aria-valuenow", "aria-valuemin", "aria-valuemax", "value", "style"]) expect(bars[0].hasAttribute(attribute)).toBe(false);
    expect(bars[0].getAttribute("aria-label")).toBe("Live research progress (indeterminate)");
    expect(text(loading)).not.toMatch(/\d\s*%|\bETA\b|remaining|minutes? left|\d+ (studies|papers|sources) found/i);
    // no early result and no legacy anything; the photo hero is not drawn while waiting
    expect(scanPanel(el).querySelector('[data-testid="research-audit"]')).toBeNull();
    expect(scanPanel(el).querySelector(".ab-photo-hero")).toBeNull();
    expect(text(scanPanel(el))).not.toMatch(LEGACY);
    expect(scanPanel(el).querySelector(".ab-tabs, .scan-section, .scan-lab-validity, .la-empty, .ab-card")).toBeNull();
    // what was read stays beside the wait: exact numbers, the unit as printed, and the unknowns said out loud
    const facts = text(scanPanel(el).querySelector('[data-testid="read-facts"]'));
    expect(facts).toContain("0.05 mg compound per serving");
    expect(facts).toContain("mcg");
    expect(facts).toContain("form not stated");
    expect(facts).toContain("servings per day not stated (not assumed)");
    expect(facts).not.toMatch(/\b1 serving|elemental|\b0 mg\b/);
    expect(text(loading.querySelector('[data-testid="research-missing"]'))).toContain("servings per day; form");
    // the person is not frozen: sign-out, the language switch and History stay reachable while it waits
    expect(buttonByText(scanPanel(el), /sign out/i)).toBeDefined();
    expect(tab(el, /history/i).disabled).toBe(false);
    expect(buttonByText(scanPanel(el), /scan another/i)).toBeDefined();
    expect(text(loading)).toContain("You can leave this screen");

    // 3. the job runs: still the loading screen, still no result
    await advance(2500);
    expect(stage(el)).toBe("loading");
    expect(scanPanel(el).querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("running");
    expect(text(scanPanel(el).querySelector(".sc-research-status"))).toBe("Research is running.");
    expect(text(scanPanel(el))).toContain("Last update from the worker: 2026-10-04 19:01 UTC");
    expect(scanPanel(el).querySelector('[data-testid="research-audit"]')).toBeNull();
    expect(scanPanel(el).querySelectorAll('[role="progressbar"]')).toHaveLength(1);

    // 4. completed: ONE switch to the live audit; the loading screen and its bar are gone
    await advance(2500);
    expect(stage(el)).toBe("result");
    expect(scanPanel(el).querySelectorAll('[data-testid="research-audit"]')).toHaveLength(1);
    expect(scanPanel(el).querySelectorAll(".sc-research")).toHaveLength(1);
    expect(scanPanel(el).querySelector('[role="progressbar"]')).toBeNull();
    expect(scanPanel(el).querySelector(".sc-research-loading")).toBeNull();
    expect(scanPanel(el).querySelector(".ab-photo-hero")).not.toBeNull();
    expect(text(scanPanel(el).querySelector(".sc-research-tags"))).toBe("ExperimentalUngraded");
    // the model's own words, character for character, and no score of any kind
    expect(text(scanPanel(el))).toContain(SENTENCE);
    expect(text(scanPanel(el))).toContain(STUDY);
    expect(text(scanPanel(el))).toContain("PMID:123456");
    expect(text(scanPanel(el))).toContain("Changes a score: no");
    expect(text(scanPanel(el))).not.toMatch(LEGACY);
    expect(text(scanPanel(el))).not.toMatch(/\d+(\.\d+)?\s*\/\s*(100|4|3)\b/);
    expect(scanPanel(el).querySelector("svg, meter, progress, .ab-general-score, .ab-bar-pts")).toBeNull();
    // focus is handed to the new state, not left on a removed screen
    expect(document.activeElement?.classList.contains("sc-research-status")).toBe(true);

    // the job is final: nothing is asked again, and research was requested exactly once for this scan
    await advance(60_000);
    expect(posts(calls)).toHaveLength(1);
    expect(researchCalls(calls)).toHaveLength(3);
    expect(JSON.parse(String(posts(calls)[0].body))).toEqual({ scan_id: RUN });
    expect(posts(calls)[0].headers.Authorization).toBe("Bearer tok-a");
  });

  it("never POSTs twice: StrictMode double effects, a language switch, a trip to History and back and a re-render all reuse the one request", async () => {
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research: scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "running"))) });
    const el = await mount(true);
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    expect(posts(calls)).toHaveLength(1);

    await click(el.querySelector('[data-testid="lang-toggle"]'));
    await advance(0);
    expect(text(scanPanel(el).querySelector(".sc-research h2"))).toBe("Tiesiogiai tiriame jūsų papildą");
    fakeAuth.setSession(sessionFor(USER_A, "tok-a-refreshed"), "TOKEN_REFRESHED"); // a routine refresh is not an account switch
    await advance(0);
    expect(scanPanel(el).querySelector(".sc-research")?.getAttribute("data-research-phase")).toBe("loading");

    stubHistory(calls);
    await click(tab(el, /istorija/i));
    await advance(2500); // the Scan tab is only hidden: it keeps polling in the background
    await click(tab(el, /skenuoti/i));
    await advance(2500);
    expect(posts(calls)).toHaveLength(1);
    expect(researchCalls(calls).filter((c) => c.method === "GET").length).toBeGreaterThanOrEqual(2);
    expect(scanPanel(el).querySelectorAll(".sc-research")).toHaveLength(1);
    expect(scanPanel(el).querySelector(".sc-research")?.getAttribute("data-research-phase")).toBe("loading");
  });

  it("History stays reachable while it waits, and the finished audit is waiting there when the person comes back", async () => {
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research: scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "queued")), ok(researchJob(RUN, "succeeded"))) });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    stubHistory(calls);
    await click(tab(el, /history/i));
    await advance(0);
    expect(historyPanel(el).hidden).toBe(false);
    expect(scanPanel(el).hidden).toBe(true);
    await advance(5000); // finishes while History is showing: no focus is pulled away
    expect(document.activeElement?.classList.contains("sc-research-status")).toBe(false);
    await click(tab(el, /scan/i));
    expect(stage(el)).toBe("result");
    expect(scanPanel(el).querySelectorAll('[data-testid="research-audit"]')).toHaveLength(1);
    expect(posts(calls)).toHaveLength(1);
  });

  it("a scan the server did not save has no run to research: no request, a problem screen that says so, and 'Scan this photo again' as the retry", async () => {
    const calls = stubApi({ scan: () => jsonResponse(vitaminD({ persistence: { status: "failed" } })) });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    expect(researchCalls(calls)).toHaveLength(0);
    expect(stage(el)).toBe("problem");
    const panel = scanPanel(el).querySelector(".sc-research")!;
    expect(panel.getAttribute("data-research-state")).toBe("no-id");
    expect(text(panel)).toContain("was not saved to your history");
    expect(text(panel)).toContain("No saved, cached or model-recalled evidence is shown in its place");
    expect(text(scanPanel(el))).not.toMatch(LEGACY);
    expect(scanPanel(el).querySelector('[role="progressbar"]')).toBeNull();

    const callsBefore = calls.length;
    await click(buttonByText(panel as HTMLElement, /scan this photo again/i));
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    expect(buttonByText(scanPanel(el), /scan this label/i)).toBeDefined(); // back to the staged photo, ready to retry
    expect(calls.length).toBe(callsBefore); // retrying is a deliberate press: nothing was sent by going back
  });

  it("scans that are not supplements keep their label-analysis card and ask for no research, and never show a 'no evidence run' card", async () => {
    const calls = stubApi({ scan: () => jsonResponse({ ...structuredClone(rich), status: "not_a_supplement_label", label: undefined, product: undefined, evidence: undefined, ledger_audit: undefined, run_id: RUN, persistence: { ...STORED, run_id: RUN } }) });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    expect(researchCalls(calls)).toHaveLength(0);
    expect(text(scanPanel(el))).toContain("Not a supplement label");
    expect(scanPanel(el).querySelector(".sc-research")).toBeNull();
    expect(text(scanPanel(el))).not.toMatch(LEGACY);
    expect(buttonByText(scanPanel(el), /scan another/i)).toBeDefined();
  });
});

function stubHistory(calls: RecordedCall[]) {
  // the History tab asks for its list when opened; answer it without touching the research script
  const inner = globalThis.fetch as unknown as (url: unknown, init?: RequestInit) => Promise<Response>;
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url) === "/api/scan/history") { calls.push(record(url, init)); return jsonResponse({ status: "ok", runs: [], next_cursor: null }); }
    return inner(url, init);
  }));
}

describe("problems are visible, actionable and never a blank or a legacy card", () => {
  async function scanWith(research: () => Response | Promise<Response>) {
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    return { el, calls };
  }

  it("a failed job shows its safe failure code, that nothing replaced it, and the way back", async () => {
    const { el, calls } = await scanWith(scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "failed"))));
    expect(stage(el)).toBe("loading");
    await advance(2500);
    expect(stage(el)).toBe("problem");
    const panel = scanPanel(el).querySelector(".sc-research")!;
    expect(panel.getAttribute("data-research-state")).toBe("failed");
    expect(text(panel.querySelector("h2"))).toBe("Live research is not available for this scan");
    expect(text(panel.querySelector('[role="status"]'))).toBe("Research did not complete.");
    expect(text(panel)).toContain("Failure code: worker_failed");
    expect(text(panel)).toContain("No saved, cached or model-recalled evidence is shown in its place");
    expect(text(panel.querySelector(".sc-research-steps li[data-failed='true']"))).toBe("Failed");
    expect(scanPanel(el).querySelector('[role="progressbar"]')).toBeNull();
    expect(text(scanPanel(el))).not.toMatch(LEGACY);
    expect(buttonByText(scanPanel(el), /scan another/i)).toBeDefined();
    await advance(30_000);
    expect(researchCalls(calls)).toHaveLength(2); // a failed job is final
  });

  it.each([
    [502, "research_failed", "Research status could not be loaded", "error", "Check again"],
    [503, "research_unavailable", "temporarily unavailable", "unavailable", "Check again"],
    [429, "research_busy", "research worker is busy", "busy", "Check again"],
    [422, "scan_not_researchable", "not eligible for live research", "not-researchable", null],
    [503, "research_disabled", "Live research is off", "disabled", null],
    [404, "not_found", "No research was found for this account", "not-found", "Request live research for this scan"],
  ])("HTTP %s %s: a problem screen, no raw server text, no legacy card", async (httpStatus, code, phrase, state, action) => {
    const { el, calls } = await scanWith(() => jsonResponse({ status: code, error: "Traceback sk-live-SECRET at /srv/app.js" }, httpStatus));
    expect(stage(el)).toBe("problem");
    const panel = scanPanel(el).querySelector(".sc-research")!;
    expect(panel.getAttribute("data-research-state")).toBe(state);
    expect(text(panel)).toContain(phrase);
    expect(text(scanPanel(el))).not.toMatch(/Traceback|sk-live|SECRET|\/srv\//);
    expect(text(scanPanel(el))).not.toMatch(LEGACY);
    expect(text(panel)).toContain("No saved, cached or model-recalled evidence is shown in its place");
    const buttons = Array.from(panel.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(action ? [action] : []);
    expect(posts(calls)).toHaveLength(1);
  });

  it("'Check again' after a transient error is a deliberate press that asks again once and then shows the job", async () => {
    const { el, calls } = await scanWith(scripted(jsonResponse({ status: "research_failed" }, 502), ok(researchJob(RUN, "queued"), 201)));
    expect(scanPanel(el).querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("error");
    await advance(30_000);
    expect(posts(calls)).toHaveLength(1); // nothing retried by itself
    await click(buttonByText(scanPanel(el), /check again/i));
    await advance(0);
    expect(posts(calls)).toHaveLength(2);
    expect(stage(el)).toBe("loading");
    expect(scanPanel(el).querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("queued");
  });

  it("a network failure is an error screen, not a hang", async () => {
    const { el } = await scanWith(() => { throw new Error("offline"); });
    expect(stage(el)).toBe("problem");
    expect(text(scanPanel(el).querySelector(".sc-research"))).toContain("Research status could not be loaded");
    expect(scanPanel(el).querySelector('[role="progressbar"]')).toBeNull();
  });

  it("a succeeded job whose result the client refuses is an error, never a half-drawn audit", async () => {
    const { el } = await scanWith(scripted(ok({ ...researchJob(RUN, "succeeded"), result: { ...RESULT, provenance: { ...RESULT.provenance, affects_score: true } } }, 201)));
    expect(stage(el)).toBe("problem");
    expect(scanPanel(el).querySelector('[data-testid="research-audit"]')).toBeNull();
    expect(scanPanel(el).querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("error");
  });

  it("Google/session errors: a 401 refreshes the token ONCE and retries; a second 401 says to sign in instead of looping", async () => {
    // a transient 401, then the refreshed token is accepted
    fakeAuth.refreshTo = sessionFor(USER_A, "tok-a2");
    let first = true;
    const { el, calls } = await scanWith(() => { if (first) { first = false; return jsonResponse({ status: "unauthorized" }, 401); } return ok(researchJob(RUN, "queued"), 201); });
    expect(posts(calls).map((c) => c.headers.Authorization)).toEqual(["Bearer tok-a", "Bearer tok-a2"]);
    expect(fakeAuth.refreshCalls).toBe(1);
    expect(stage(el)).toBe("loading");
    await harness.cleanup();

    // a refresh that hands back the same token is not recoverable
    forgetResearchJobs(); noteResearchOwner(null); fakeAuth.reset(); fakeAuth.configured = true; fakeAuth.session = sessionFor(USER_A, "tok-a"); fakeAuth.refreshTo = sessionFor(USER_A, "tok-a");
    const second = await scanWith(() => jsonResponse({ status: "unauthorized" }, 401));
    expect(fakeAuth.refreshCalls).toBe(1);
    expect(posts(second.calls)).toHaveLength(1);
    expect(stage(second.el)).toBe("problem");
    expect(second.el.querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("auth");
    expect(text(second.el.querySelector(".sc-research"))).toContain("Sign in to view private live research.");
    await advance(30_000);
    expect(researchCalls(second.calls)).toHaveLength(1); // no loop
  });

  it("missing facts stay visible and are never filled in: no servings, form or dose is assumed on the loading screen or the result", async () => {
    const { el } = await scanWith(scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "succeeded"))));
    const missing = () => text(scanPanel(el).querySelector('[data-testid="research-missing"]'));
    expect(missing()).toContain("Not recorded on this scan, so research did not guess them: servings per day; form.");
    expect(text(scanPanel(el).querySelector(".sc-research-facts"))).toContain("scan again or type the supplement with its daily servings");
    await advance(2500);
    expect(stage(el)).toBe("result");
    expect(missing()).toContain("servings per day; form");
    expect(text(scanPanel(el))).not.toMatch(/Servings per day\s*1\b|1 serving/);
  });
});

describe("a late reply never reaches the wrong person or a screen that is gone", () => {
  it("signing out while research is starting aborts the request, removes everything, and discards the late answer", async () => {
    let late!: (r: Response) => void;
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research: () => new Promise<Response>((resolve) => { late = resolve; }) });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    const post = posts(calls)[0];
    expect(post.signal?.aborted).toBe(false);
    expect(scanPanel(el).querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("starting");

    fakeAuth.setSession(null);
    await advance(0);
    expect(post.signal?.aborted).toBe(true);
    expect(scanPanel(el).querySelector(".sc-research")).toBeNull();
    expect(scanPanel(el).querySelector(".scan-lab-result")).toBeNull();
    // the late answer for the signed-out person's job arrives: it is dropped, not drawn
    await act(async () => { late(ok(researchJob(RUN, "succeeded"), 201)); });
    await advance(5000);
    expect(el.querySelector(".sc-research, [data-testid='research-audit']")).toBeNull();
    expect(text(el)).not.toContain("PMID:123456");
    expect(researchCalls(calls)).toHaveLength(1);
  });

  it("an account switch never shows the previous person's job, queued or finished, and never polls with their token", async () => {
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research: scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "succeeded"))) });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    expect(stage(el)).toBe("loading");
    const poll = researchCalls(calls)[0];

    fakeAuth.setSession(sessionFor(USER_B, "tok-b"));
    await advance(0);
    expect(poll.signal?.aborted).toBe(true);
    expect(scanPanel(el).querySelector(".scan-lab-result, .sc-research")).toBeNull();
    await advance(10_000);
    expect(researchCalls(calls)).toHaveLength(1); // nothing further was asked, with anybody's token
    expect(text(el)).not.toMatch(/PMID|Vitamin D3|Researching your supplement/);
  });

  it("unmounting aborts the poll and nothing is requested afterwards", async () => {
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research: scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "running"))) });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    const signal = researchCalls(calls)[0].signal;
    await harness.cleanup();
    expect(signal?.aborted).toBe(true);
    await advance(30_000);
    expect(researchCalls(calls)).toHaveLength(1);
    expect(el.isConnected).toBe(false);
  });

  it("'Scan another' while it waits leaves the screen, cancels this page's polling, and ignores the late reply (the job itself is not cancelled)", async () => {
    let late!: (r: Response) => void;
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research: () => new Promise<Response>((resolve) => { late = resolve; }) });
    const el = await mount();
    await advance(0);
    await stageAndScan(el);
    await advance(0);
    const request = posts(calls)[0];
    await click(buttonByText(scanPanel(el), /scan another/i));
    expect(request.signal?.aborted).toBe(true);
    expect(scanPanel(el).querySelector(".scan-lab-result, .sc-research")).toBeNull();
    expect(scanPanel(el).querySelector(".sc-viewfinder, .sc-capture")).not.toBeNull(); // the landing, not a blank
    await act(async () => { late(ok(researchJob(RUN, "succeeded"), 201)); });
    await advance(5000);
    expect(scanPanel(el).querySelector(".sc-research, [data-testid='research-audit']")).toBeNull();
    expect(researchCalls(calls)).toHaveLength(1);
  });
});

describe("History: a saved scan never researches by itself", () => {
  const listRun = { id: RUN, created_at: "2026-09-20T10:30:00Z", source: "photo", status: "ok", product_name: "Vitamin D3 2000 IU" };
  async function openSaved(research?: Routes["research"]) {
    const calls = stubApi({
      list: () => jsonResponse({ status: "ok", runs: [listRun], next_cursor: null }),
      detail: (_c, id) => jsonResponse({ status: "ok", run_id: id, analysis: vitaminD({ persistence: undefined }) }),
      research,
    });
    const el = await mount();
    await advance(0);
    await click(tab(el, /history/i));
    await advance(0);
    await click(el.querySelector("button.sw-run"));
    await advance(0);
    return { el, calls };
  }

  it("opening it shows 'Live research not requested' and a deliberate button; no research request, no legacy card, no spend", async () => {
    const { el, calls } = await openSaved();
    const panel = historyPanel(el);
    expect(researchCalls(calls)).toHaveLength(0);
    expect(token(calls)).toBe("Bearer tok-a");
    expect(panel.querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("idle");
    expect(text(panel.querySelector(".sc-research h2"))).toBe("Live research not requested");
    expect(text(panel)).toContain("Nothing was re-run");
    expect(text(panel)).toContain("No saved, cached or model-recalled evidence is shown in its place");
    expect(Array.from(panel.querySelectorAll(".sc-research button")).map((b) => b.textContent)).toEqual(["Request live research for this scan"]);
    expect(text(panel)).not.toMatch(LEGACY);
    expect(panel.querySelector(".ab-tabs, .scan-section, .scan-lab-validity, .la-empty, [role='progressbar']")).toBeNull();
    // the read-label facts are kept, with the regimen unknown said out loud
    expect(text(panel.querySelector('[data-testid="read-facts"]'))).toContain("servings per day not stated (not assumed)");
    await advance(60_000);
    expect(researchCalls(calls)).toHaveLength(0);
  });

  it("the button asks ONCE; the server's idempotent answer (the job already exists) is shown, not a second job, and the poll then drives the loading screen", async () => {
    const { el, calls } = await openSaved(scripted(ok(researchJob(RUN, "running"), 200), ok(researchJob(RUN, "succeeded"))));
    await click(buttonByText(historyPanel(el), /request live research for this scan/i));
    await advance(0);
    expect(posts(calls)).toHaveLength(1);
    expect(JSON.parse(String(posts(calls)[0].body))).toEqual({ scan_id: RUN });
    expect(historyPanel(el).querySelector(".sc-research")?.getAttribute("data-research-phase")).toBe("loading");
    expect(historyPanel(el).querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    await advance(2500);
    expect(historyPanel(el).querySelectorAll('[data-testid="research-audit"]')).toHaveLength(1);
    expect(posts(calls)).toHaveLength(1);
    // opening the same scan again looks the job up (GET); it never asks again
    await click(historyPanel(el).querySelector('[aria-label="Back to history"]'));
    await advance(0);
    await click(el.querySelector("button.sw-run"));
    await advance(0);
    expect(posts(calls)).toHaveLength(1);
    expect(researchCalls(calls).some((c) => c.url === `/api/scan/research/${JOB_ID}`)).toBe(true);
    expect(historyPanel(el).querySelectorAll('[data-testid="research-audit"]')).toHaveLength(1);
  });

  const token = (calls: RecordedCall[]) => calls.find((c) => c.url.startsWith("/api/scan/history/"))?.headers.Authorization;
});

describe("Lithuanian: every control, caveat and state is Lithuanian; the research narrative stays original English", () => {
  it("loading screen, bar, unknown regimen, result and problem screens are Lithuanian; model text is tagged lang=en and unchanged; the translator is never called", async () => {
    window.localStorage.setItem(LANG_KEY, "lt");
    const calls = stubApi({ scan: () => jsonResponse(vitaminD()), research: scripted(ok(researchJob(RUN, "queued"), 201), ok(researchJob(RUN, "succeeded"))) });
    const el = await mount();
    await advance(0);
    await stagePhoto(el);
    await click(el.querySelector("button.la-analyze"));
    await advance(0);
    const loading = scanPanel(el).querySelector(".sc-research")!;
    expect(text(loading.querySelector("h2"))).toBe("Tiesiogiai tiriame jūsų papildą");
    expect(scanPanel(el).querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe("Tiesioginio tyrimo eiga (neapibrėžta)");
    expect(text(loading.querySelector('[role="status"]'))).toBe("Laukia eilėje privačiam tyrimų vykdytojui.");
    expect(text(loading)).toContain("Juosta tyčia neapibrėžta");
    expect(text(loading)).toContain("Galite palikti šį ekraną");
    expect(text(loading.querySelector('[data-testid="research-missing"]'))).toContain("porcijos per dieną; forma");
    expect(text(scanPanel(el).querySelector('[data-testid="read-facts"]'))).toContain("porcijų per dieną nenurodyta (prielaida nedaroma)");
    expect(text(loading.querySelector(".sc-research-tags"))).toBe("EksperimentinisBe įvertinimo");
    expect(text(scanPanel(el))).not.toMatch(LEGACY_LT);

    await advance(2500);
    const result = scanPanel(el).querySelector(".sc-research")!;
    expect(result.getAttribute("data-research-phase")).toBe("result");
    expect(text(result.querySelector('[role="status"]'))).toBe("Gautas tyrimo auditas.");
    expect(text(result)).toContain("Modelio parašytas tyrimo tekstas rodomas originalia anglų kalba");
    const statement = Array.from(result.querySelectorAll<HTMLElement>('p[lang="en"]')).find((p) => p.textContent?.includes("Modelio teiginys"));
    expect(statement?.textContent).toBe(`Modelio teiginys: ${SENTENCE}`);
    expect(result.querySelector('h3[lang="en"]')?.textContent).toBe("Serum 25(OH)D");
    expect(text(result)).toContain(STUDY);
    expect(calls.some((c) => c.url === "/api/scan/translate")).toBe(false);
  });

  it("a problem screen and the History 'not requested' screen are Lithuanian too", async () => {
    window.localStorage.setItem(LANG_KEY, "lt");
    stubApi({ scan: () => jsonResponse(vitaminD({ persistence: { status: "failed" } })) });
    const el = await mount();
    await advance(0);
    await stagePhoto(el);
    await click(buttonByText(el, /skenuoti šią etiketę/i));
    await advance(0);
    const panel = scanPanel(el).querySelector(".sc-research")!;
    expect(text(panel.querySelector("h2"))).toBe("Šiam skenavimui tiesioginis tyrimas nepasiekiamas");
    expect(text(panel)).toContain("nebuvo išsaugotas jūsų istorijoje");
    expect(text(panel)).toContain("Šiame puslapyje rodomas tik tiesioginis tyrimas");
    expect(Array.from(panel.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Skenuoti šią nuotrauką dar kartą"]);
    expect(text(scanPanel(el))).not.toMatch(LEGACY_LT);
  });
});

describe("public retained pages are not touched by this change", () => {
  it("/tests/supplements and the retained run pages import nothing from the scan flow or the live research modules", () => {
    const files = ["app/tests/supplements/page.tsx", "app/design-lab/ab/prototype.tsx"];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/scan-flow|scan-research-panel|scan-research|use-live-research/);
    }
  });
});
