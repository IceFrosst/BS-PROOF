// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESEARCH_COPY, type ResearchCopy } from "@/lib/i18n/copy/research";
import { forgetResearchJobs, noteResearchOwner, rememberResearchJob } from "@/lib/scan-research/client";
import { ScanResearchPanel } from "@/components/scan-research-panel";

const SCAN = "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878";
const JOB = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
const T0 = "2026-10-04T19:00:00.000000+00:00";
const T0_MS = Date.parse("2026-10-04T19:00:00Z");

/* The model's own words: numbers with units and signs, a verbatim quotation, ids, a citation, hedges. None of it may change on its way to the screen. */
const SENTENCE = "May modestly shorten sleep latency (−0.31 SD, 95% CI −0.52 to −0.10; p<0.05; n=1,204; 400 mg/day) across 12 RCTs, and “no serious adverse events” were reported (Smith et al., 2019; PMID:12345678; NCT01234567).";
const STUDY = "Smith J, Lee K. Sleep. 2019;42(3):zsy123. doi:10.1093/sleep/zsy123 — probably not generalisable.";
const DOUBT = "Unclear whether benefits persist beyond 8 weeks; possibly industry-funded (Jones 2020).";
const RANGE = "300–400 mg/day (as printed: 200 mg × 2)";

const audit = {
  meta: { model: "claude-sonnet-5-5", prompt: "live-research-v0.2" },
  product: "Magnesium glycinate capsules", ingredient: "Magnesium", form: "Magnesium glycinate", daily_dose: "200 mg per day (as printed)", dose_note: "Dose is as printed on the label.",
  could_not_access: ["Full paper unavailable"],
  outcomes: [{ name: "Sleep latency", population: "Adults with self-rated poor sleep", sentence: SENTENCE, strongest_study: STUDY, strongest_doubt: DOUBT, study_that_would_move_this: "A larger preregistered trial.", ledger: { effectPoints: "1", effective_daily_range: RANGE }, inventory: [{ id: "PMID:123456", access: "snippet" as const }] }],
};
const result = {
  audit,
  source_access: { version: "SourceAccessSummaryV2" as const, summary: { requests: 3, errors: 2, walls: 1, refusals: 4, search_snippets: 2, fetch_summaries: 1, original_documents: 0 as const }, inventory: [{ id: "PMID:123456", evidence_class: "derived_snippet" as const }], limitations: ["WebSearch snippets and WebFetch model summaries are not original papers.", "ID matching does not verify study numbers or clinical validity."] },
  provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.2", cli_version: "2.1.287", adapter_version: "adapter-test", classifier_version: "classifier-test", source_access_version: "SourceAccessV2" as const },
};
const TARGET = { version: "ResearchJobV1", fact_basis: "label", product: { brand: "Acme", product_name: "Mag 200" }, ingredient: { vocab_id: "magnesium", label: "Magnesium" }, form: { vocab_id: "magnesium_glycinate", label: null }, dose: { compound_per_serving_mg: 200, printed_elemental_per_serving_mg: null, unit_as_printed: "mg", elemental_per_serving_mg: null, daily_elemental_mg: null }, servings_per_day: null, is_multi_ingredient: false, actives: [], other_actives: [], handling: { text_fields_are_untrusted_data: true, component_evidence_is_not_blend_efficacy: true } };
const job = (status: "queued" | "running" | "succeeded" | "failed", extra: Record<string, unknown> = {}) => ({
  id: JOB, scan_id: SCAN, status, prompt_version: "live-research-v0.2", target: TARGET, created_at: T0, updated_at: T0, completed_at: status === "succeeded" || status === "failed" ? "2026-10-04T19:03:10.500000+00:00" : null,
  failure_code: status === "failed" ? "worker_failed" : null, result: status === "succeeded" ? result : null, ...extra,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (j: unknown, status = 200) => response({ status: "ok", job: j }, status);
/** A fetch that answers EVERY call with a fresh Response (a Response body can be read once). */
const always = (body: () => Response) => vi.fn().mockImplementation(() => Promise.resolve(body()));

let root: Root, host: HTMLDivElement;
const token = vi.fn(async () => "owner-token" as string | null);
type Props = { scanId?: string | null; ownerId?: string | null; enabled?: boolean; lang?: "en" | "lt"; replay?: boolean; clock?: () => number };
function mount(props: Props = {}) {
  act(() => root.render(createElement(ScanResearchPanel, { scanId: SCAN, ownerId: "owner-1", lang: "en", getAccessToken: token, clock: () => T0_MS, ...props })));
}
/** Real timers: let the request chain (token -> fetch -> stream -> state) finish. */
const settle = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
/** Fake timers: advance the clock; this also drains the microtask queue between timers. */
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const text = () => host.textContent ?? "";
const status = () => host.querySelector('[role="status"]')?.textContent ?? "";
const state = () => host.querySelector("section")?.getAttribute("data-research-state");
const button = () => host.querySelector("button");
const calls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit)?.method ?? "GET"} ${String(c[0])}`);

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  token.mockClear(); token.mockResolvedValue("owner-token");
  forgetResearchJobs(); noteResearchOwner(null);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); forgetResearchJobs(); noteResearchOwner(null); });

describe("live research panel: a saved, owned run", () => {
  it("asks once for the stored run id with the owner's bearer token, then follows the job's real queued → running → succeeded status", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(job("queued"), 201)).mockResolvedValueOnce(ok(job("running", { updated_at: "2026-10-04T19:01:00+00:00" }))).mockResolvedValueOnce(ok(job("succeeded")));
    vi.stubGlobal("fetch", fetchMock);
    mount(); await advance(0);
    expect(calls(fetchMock)).toEqual(["POST /api/scan/research"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ scan_id: SCAN });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer owner-token" });
    expect(state()).toBe("queued"); expect(status()).toBe("Queued for the private research worker.");
    expect(host.querySelector('[aria-current="step"]')?.textContent).toBe("Queued");
    expect(text()).toContain("Queued 2026-10-04 19:00 UTC");

    await advance(2500);
    expect(calls(fetchMock)).toEqual(["POST /api/scan/research", `GET /api/scan/research/${JOB}`]);
    expect(state()).toBe("running"); expect(status()).toBe("Research is running.");
    expect(host.querySelector('[aria-current="step"]')?.textContent).toBe("Running");
    expect(text()).toContain("Last update from the worker: 2026-10-04 19:01 UTC");

    await advance(2500);
    expect(calls(fetchMock)).toHaveLength(3);
    expect(state()).toBe("succeeded"); expect(status()).toBe("Research audit returned.");
    expect(host.querySelector('[aria-current="step"]')?.textContent).toBe("Completed");
    expect(text()).toContain("Finished 2026-10-04 19:03 UTC");
    expect(host.querySelector('[data-testid="research-audit"]')).not.toBeNull();
    // the job is final: no further request is ever made for it
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(token).toHaveBeenCalledWith({ userId: "owner-1" });
  });

  it("never requests anything without a saved UUID run id, a signed-in owner, or a deployment with sign-in", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    mount({ scanId: null }); await settle(); expect(text()).toContain("no verified saved run ID");
    mount({ scanId: "saved-1" }); await settle(); expect(text()).toContain("no verified saved run ID");
    mount({ scanId: `${SCAN}/../x` }); await settle(); expect(text()).toContain("no verified saved run ID");
    mount({ ownerId: null }); await settle(); expect(text()).toContain("Sign in to view");
    mount({ enabled: false }); await settle(); expect(text()).toContain("Live research is off");
    expect(fetchMock).not.toHaveBeenCalled(); expect(token).not.toHaveBeenCalled();
    expect(button()).toBeNull();
  });

  it("when no bearer token is available it says to sign in and sends nothing", async () => {
    token.mockResolvedValue(null); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    mount(); await settle(); expect(text()).toContain("Sign in to view"); expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [503, "research_disabled", "Live research is off", "disabled"], [503, "research_unavailable", "temporarily unavailable", "unavailable"], [503, "auth_unavailable", "temporarily unavailable", "unavailable"],
    [429, "research_busy", "worker is busy", "busy"], [422, "scan_not_researchable", "not eligible", "not-researchable"], [401, "unauthorized", "Sign in to view", "auth"], [404, "not_found", "No research was found for this account", "not-found"], [502, "research_failed", "could not be loaded", "error"],
  ])("shows the honest state for %s %s", async (httpStatus, code, phrase, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: code, error: "Traceback sk-live-SECRET at /srv/app.js" }, httpStatus)));
    mount(); await settle();
    expect(text()).toContain(phrase); expect(state()).toBe(expected);
    expect(text()).not.toMatch(/Traceback|sk-live|SECRET|\/srv\//);
  });
});

describe("live research panel: real progress only", () => {
  it("shows no percentage, no progress bar and no time estimate in any state, and says so", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(job("queued"))).mockResolvedValueOnce(ok(job("running"))).mockResolvedValueOnce(ok(job("succeeded")));
    vi.stubGlobal("fetch", fetchMock);
    const seen: string[] = [];
    // the panel's own text: the model's study notes (which legitimately print "95% CI") are not the panel's progress claims
    const own = () => { const clone = host.cloneNode(true) as HTMLElement; clone.querySelectorAll("article").forEach((n) => n.remove()); return clone.textContent ?? ""; };
    mount(); await advance(0); seen.push(own());
    expect(text()).toContain("No percentage or time estimate is shown because the worker reports none.");
    await advance(2500); seen.push(own());
    await advance(2500); seen.push(own());
    for (const t of seen) expect(t).not.toMatch(/\d\s*%|\bETA\b|remaining|minutes? left|about \d+ (min|sec)/i);
    expect(host.querySelector('progress, [role="progressbar"], meter')).toBeNull();
  });

  it("flags a RUNNING job with no worker signal for longer than its lease as stalled, from the injected clock only, and keeps checking", async () => {
    vi.useFakeTimers();
    let now = T0_MS + 299_000;
    const fetchMock = always(() => ok(job("running")));
    vi.stubGlobal("fetch", fetchMock);
    mount({ clock: () => now }); await advance(0);
    expect(status()).toBe("Research is running.");
    now = T0_MS + 301_000; await advance(2500);
    expect(status()).toContain("No update from the worker since 2026-10-04 19:00 UTC");
    expect(status()).toContain("no estimate is available");
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    // a fresh heartbeat clears it
    fetchMock.mockImplementation(() => Promise.resolve(ok(job("running", { updated_at: "2026-10-04T19:05:00+00:00" }))));
    await advance(2500);
    expect(status()).toBe("Research is running.");
  });

  it("never calls a queued job stalled, however old", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", always(() => ok(job("queued"))));
    mount({ clock: () => T0_MS + 86_400_000 }); await advance(0);
    expect(status()).toBe("Queued for the private research worker.");
  });

  it("a failed job shows only its safe code and offers no rerun; an unsafe code is replaced, and server detail never appears", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("failed", { failure_message: "Traceback sk-live-SECRET", result: { audit: "leak" } }))));
    mount(); await settle();
    expect(state()).toBe("failed"); expect(text()).toContain("Failure code: worker_failed"); expect(text()).toContain("Failed");
    expect(button()).toBeNull(); expect(host.querySelector('[data-testid="research-audit"]')).toBeNull();
    expect(text()).not.toMatch(/Traceback|SECRET|leak/);
    act(() => root.unmount()); root = createRoot(host);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("failed", { failure_code: "Traceback: sk-live-123 at /srv/x" }))));
    mount(); await settle();
    expect(text()).toContain("Failure code: unavailable"); expect(text()).not.toMatch(/Traceback|sk-live|\/srv/);
  });
});

describe("live research panel: experimental and ungraded", () => {
  async function showResult(props: Props = {}) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("succeeded"))));
    mount(props); await settle();
  }

  it("draws the audit with no score, bar or verdict, and says it is experimental, ungraded and does not change the scan score", async () => {
    await showResult();
    expect(host.querySelector('[data-testid="research-audit"]')).not.toBeNull();
    expect(host.querySelector(".sc-research-tags")?.textContent).toBe("ExperimentalUngraded");
    expect(text()).toContain("Experimental and ungraded");
    expect(text()).toContain("This audit does not change the retained scan score.");
    expect(text()).toContain("Changes scan score: no");
    expect(text()).toContain("Evidence status: experimental, not validated");
    expect(text()).not.toMatch(/\d+(\.\d+)?\s*\/\s*(100|4)\b/);
    expect(host.querySelector('svg, progress, meter, [role="progressbar"], [role="img"], canvas')).toBeNull();
    expect(text()).not.toMatch(/not scored|Small benefit|Moderate benefit|\bStrong\b|certainty|average|mean score|\bGeneral\b/i);
  });

  it("shows source access as returned content versus no content, and says page summaries are Haiku-written, not papers", async () => {
    await showResult();
    for (const label of ["requests that returned content: 3", "search snippets: 2", "page summaries (written by Claude Haiku): 1", "original documents opened: 0", "errors (HTTP errors such as 403, redirects not followed): 2", "walls (CAPTCHA, cookie or bot checks): 1", "refusals: 4"]) expect(text()).toContain(label);
    expect(text()).toContain("Returned content"); expect(text()).toContain("Returned no content (not counted as access)");
    expect(text()).toContain("Claude Haiku"); expect(text()).toContain("It is not the paper");
    expect(text()).toContain("Errors, walls and refusals returned no content, so they are not counted as access, and this page shows no text from them.");
    // the two groups are not mixed: the no-content counters sit only under the no-content heading
    const groups = Array.from(host.querySelectorAll(".sc-research-counts")).map((ul) => ul.textContent ?? "");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatch(/requests that returned content: 3.*search snippets: 2.*page summaries.*: 1.*original documents opened: 0/);
    expect(groups[1]).toMatch(/errors.*: 2.*walls.*: 1.*refusals: 4/);
    expect(groups[0]).not.toMatch(/errors|walls|refusals/);
    expect(text()).toContain("PMID:123456"); expect(text()).toContain("paper not opened");
    expect(text()).toContain("Search snippets and page summaries written by a model are not original papers.");
    expect(text()).toContain("Matching an ID does not verify study numbers or clinical validity.");
    expect(text()).toContain("Full paper unavailable");
    // nothing here is presented as a quotation or as a paper read
    expect(host.querySelector("blockquote, q, cite")).toBeNull();
    expect(text()).toContain("not quotations from papers");
    expect(text()).not.toMatch(/papers? (read|accessed|opened: [1-9])|full text (read|accessed)/i);
  });

  it("never claims exhaustive coverage or superiority over any provider, in either language", () => {
    const claims = /exhaustive|comprehensive|thorough|superior|better than|outperform|more complete|\ball (studies|sources|papers)\b|\bevery (study|source|paper)\b|išsami|visapusiš|geresnis|pranašesn|išsamiau|visi (tyrimai|šaltiniai)|visus (tyrimus|šaltinius)/i;
    for (const lang of ["en", "lt"] as const) for (const value of leaves(RESEARCH_COPY[lang])) expect(value).not.toMatch(claims);
  });

  it("shows the model's text verbatim: every number, unit, quotation, id, citation and hedge survives untouched", async () => {
    await showResult();
    for (const s of [SENTENCE, STUDY, DOUBT, RANGE]) expect(text()).toContain(s);
    expect(text()).toContain("Model’s statement: " + SENTENCE);
  });

  it("does not add a numeric bar or a blended number for a result, and leaves the retained audit alone (no import of its scorer)", async () => {
    await showResult();
    const panel = host.querySelector(".sc-research-audit")!;
    expect(panel.querySelectorAll("article")).toHaveLength(1); // one outcome in, one outcome out: no "overall"
    expect(panel.textContent).not.toMatch(/overall|combined|blend score|weighted/i);
  });
});

describe("live research panel: the facts it used, and the ones it did not have", () => {
  it("lists a missing serving count and recorded facts without defaulting any of them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("queued"))));
    mount(); await settle();
    const missing = host.querySelector('[data-testid="research-missing"]')!;
    expect(missing.textContent).toContain("Not recorded on this scan, so research did not guess them:");
    expect(missing.textContent).toContain("servings per day");
    expect(missing.textContent).not.toContain("dose per serving"); // 200 mg compound is recorded
    expect(host.querySelector('[data-testid="research-facts"]')?.textContent).toContain("Research is requested from your saved scan only");
    const recorded = host.querySelector("details")!;
    expect(recorded.textContent).toContain("Compound mass per serving200 mg");
    expect(recorded.textContent).toContain("Source of the factsRead from the label photo");
    expect(recorded.textContent).not.toContain("Printed elemental"); // not recorded: not shown, not converted
    expect(recorded.textContent).not.toMatch(/Servings per day/); // missing: not defaulted to 1
    expect(text()).not.toMatch(/\b1 serving|Serving 1|servings per day: 1|Servings per day1/i);
  });

  it("lists dose per serving as missing when neither a compound nor a printed elemental amount was read, and shows an elemental amount as elemental", async () => {
    const noDose = { ...TARGET, dose: { compound_per_serving_mg: null, printed_elemental_per_serving_mg: null, unit_as_printed: null }, servings_per_day: 2 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("queued", { target: noDose }))));
    mount(); await settle();
    expect(host.querySelector('[data-testid="research-missing"]')?.textContent).toContain("dose per serving");
    expect(host.querySelector("details")?.textContent).toContain("Servings per day2");
    act(() => root.unmount()); root = createRoot(host);
    const elemental = { ...TARGET, dose: { compound_per_serving_mg: null, printed_elemental_per_serving_mg: 200, unit_as_printed: "mg" }, servings_per_day: 1 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("queued", { target: elemental }))));
    mount(); await settle();
    expect(host.querySelector('[data-testid="research-missing"]')).toBeNull();
    const recorded = host.querySelector("details")!.textContent!;
    expect(recorded).toContain("Printed elemental amount per serving200 mg");
    expect(recorded).not.toContain("Compound mass");
  });

  it("draws no facts block at all when the job carries no target", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("queued", { target: null }))));
    mount(); await settle(); expect(host.querySelector('[data-testid="research-facts"]')).toBeNull();
  });
});

describe("live research panel: a replay never asks by itself", () => {
  it("shows the saved scan as it was, sends nothing on open, and asks (once, with the owner's token) only when the person presses the button", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(job("queued"), 201)); vi.stubGlobal("fetch", fetchMock);
    mount({ replay: true }); await settle();
    expect(fetchMock).not.toHaveBeenCalled(); expect(token).not.toHaveBeenCalled();
    expect(state()).toBe("idle"); expect(status()).toContain("Nothing was re-run");
    expect(button()?.textContent).toBe("Look up live research for this scan");
    expect(document.getElementById(button()!.getAttribute("aria-describedby")!)?.textContent).toContain("queues one");
    const pressed = button()!;
    pressed.focus();
    await act(async () => { pressed.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle();
    expect(document.activeElement).toBe(host.querySelector('[role="status"]')); // focus is not dropped when the button goes
    expect(calls(fetchMock)).toEqual(["POST /api/scan/research"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ scan_id: SCAN });
    expect(state()).toBe("queued");
  });

  it("looks up (GET) a job this page already knows, and never asks for research again", async () => {
    vi.useFakeTimers();
    noteResearchOwner("owner-1"); rememberResearchJob("owner-1", SCAN, JOB);
    const fetchMock = vi.fn().mockResolvedValue(ok(job("succeeded"))); vi.stubGlobal("fetch", fetchMock);
    mount({ replay: true }); await advance(0);
    expect(calls(fetchMock)).toEqual([`GET /api/scan/research/${JOB}`]);
    expect(state()).toBe("succeeded"); expect(host.querySelector('[data-testid="research-audit"]')).not.toBeNull();
  });

  it("a replayed job that is another account's or gone is the same 404 and shows nothing of it", async () => {
    noteResearchOwner("owner-1"); rememberResearchJob("owner-1", SCAN, JOB);
    const fetchMock = vi.fn().mockResolvedValue(response({ status: "not_found", error: "No research job of yours with that id." }, 404)); vi.stubGlobal("fetch", fetchMock);
    mount({ replay: true }); await settle();
    expect(state()).toBe("not-found"); expect(text()).toContain("No research was found for this account");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("'Check again' after a transient error looks the known job up (GET); it does not post a second research request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(job("queued"), 201)).mockResolvedValueOnce(response({ status: "research_failed" }, 502)).mockImplementation(() => Promise.resolve(ok(job("failed"))));
    vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock);
    mount(); await advance(0); await advance(2500);
    expect(state()).toBe("error"); expect(text()).toContain("could not be loaded");
    expect(host.querySelector(".sc-research-steps")).not.toBeNull(); // the last good job is still shown
    expect(button()?.textContent).toBe("Check again");
    await act(async () => { button()!.dispatchEvent(new MouseEvent("click", { bubbles: true })); await vi.advanceTimersByTimeAsync(0); });
    expect(calls(fetchMock)).toEqual(["POST /api/scan/research", `GET /api/scan/research/${JOB}`, `GET /api/scan/research/${JOB}`]);
    expect(state()).toBe("failed");
  });
});

describe("live research panel: the owner, the session and stale answers", () => {
  it("an answer from a job of another scan, or an unusable job, is dropped, never drawn", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("succeeded", { scan_id: "11111111-1111-4111-8111-111111111111" }))));
    mount(); await settle(); expect(state()).toBe("error"); expect(host.querySelector('[data-testid="research-audit"]')).toBeNull();
    act(() => root.unmount()); root = createRoot(host);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ id: "job-1", scan_id: "saved-1", status: "queued" })));
    mount(); await settle(); expect(state()).toBe("error");
  });

  it("a poll that answers for a different job is dropped and stops the poll", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(job("queued"))).mockImplementation(() => Promise.resolve(ok(job("succeeded", { id: "22222222-2222-4222-8222-222222222222" }))));
    vi.stubGlobal("fetch", fetchMock);
    mount(); await advance(0); await advance(2500);
    expect(state()).toBe("error"); expect(host.querySelector('[data-testid="research-audit"]')).toBeNull();
    await advance(10_000); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a poll that says 404 (not this owner's, or gone) ends the poll and shows nothing of the job", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(job("running"))).mockImplementation(() => Promise.resolve(response({ status: "not_found" }, 404)));
    vi.stubGlobal("fetch", fetchMock);
    mount(); await advance(0); expect(host.querySelector(".sc-research-steps")).not.toBeNull();
    await advance(2500);
    expect(state()).toBe("not-found"); expect(host.querySelector(".sc-research-steps")).toBeNull(); expect(host.querySelector('[data-testid="research-facts"]')).toBeNull();
    await advance(10_000); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("an owner change aborts the prior request, and its late result is never drawn", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; })).mockImplementation(() => Promise.resolve(ok(job("queued", { scan_id: SCAN }))));
    vi.stubGlobal("fetch", fetchMock);
    mount({ ownerId: "owner-old" }); await settle();
    const oldSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    mount({ ownerId: "owner-new" }); await settle();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolve(ok(job("succeeded"))));
    expect(token).toHaveBeenCalledWith({ userId: "owner-old" }); expect(token).toHaveBeenCalledWith({ userId: "owner-new" });
    expect(text()).not.toContain("PMID:123456"); expect(host.querySelector('[data-testid="research-audit"]')).toBeNull();
    expect(state()).toBe("queued");
  });

  it("the previous owner's finished result is not on screen for the next owner, not even for the first render after the switch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok(job("succeeded"))).mockImplementation(() => new Promise<Response>(() => {})));
    mount({ ownerId: "owner-a" }); await settle();
    expect(host.querySelector('[data-testid="research-audit"]')).not.toBeNull();
    mount({ ownerId: "owner-b" }); // no await: this is the first render after the switch
    expect(host.querySelector('[data-testid="research-audit"]')).toBeNull();
    expect(text()).not.toContain("PMID:123456"); expect(text()).not.toContain("Magnesium");
    expect(state()).toBe("starting");
  });

  it("sign-out (no owner) aborts the poll at once and discards the job; no further request follows", async () => {
    vi.useFakeTimers();
    const fetchMock = always(() => ok(job("running"))); vi.stubGlobal("fetch", fetchMock);
    mount(); await advance(0);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    mount({ ownerId: null }); await advance(0);
    expect(signal.aborted).toBe(true); expect(state()).toBe("auth"); expect(text()).toContain("Sign in to view");
    expect(host.querySelector(".sc-research-steps")).toBeNull(); expect(host.querySelector('[data-testid="research-facts"]')).toBeNull();
    await advance(30_000); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an unmount aborts a pending wait and draws nothing afterwards", async () => {
    vi.useFakeTimers();
    const fetchMock = always(() => ok(job("queued"))); vi.stubGlobal("fetch", fetchMock);
    mount(); await advance(0); expect(token).toHaveBeenCalledWith({ userId: "owner-1" });
    act(() => root.unmount());
    await advance(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(host.textContent).toBe("");
    root = createRoot(host);
  });

  it("a parent that re-creates its token callback or clock on every render cannot restart the flow (no second request)", async () => {
    vi.useFakeTimers();
    const fetchMock = always(() => ok(job("queued"))); vi.stubGlobal("fetch", fetchMock);
    mount({}); await advance(0);
    mount({ clock: () => T0_MS }); mount({ clock: () => T0_MS }); await advance(0);
    act(() => root.render(createElement(ScanResearchPanel, { scanId: SCAN, ownerId: "owner-1", lang: "en", getAccessToken: async () => "another", clock: () => T0_MS })));
    await advance(0);
    expect(calls(fetchMock)).toEqual(["POST /api/scan/research"]);
  });

  it("a succeeded job whose result is unusable shows only the error status, never a half-drawn audit", async () => {
    for (const bad of [{ ...result, provenance: null }, { ...result, provenance: { ...result.provenance, affects_score: true } }, { ...result, source_access: { ...result.source_access, version: "SourceAccessV1" } }, { ...result, source_access: { ...result.source_access, summary: { ...result.source_access.summary, original_documents: 1 } } }, null]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("succeeded", { result: bad }))));
      mount(); await settle();
      expect(text()).toContain("Research status could not be loaded"); expect(text()).not.toContain("Research audit returned");
      expect(host.querySelector('[data-testid="research-audit"]')).toBeNull();
      act(() => root.unmount()); root = createRoot(host);
    }
  });
});

describe("live research panel: Lithuanian", () => {
  const visibleControls = () => {
    // everything except the model's English narrative blocks (their LT label spans are kept)
    const clone = host.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[lang="en"]').forEach((n) => { n.querySelectorAll('[lang="lt"]').forEach((l) => n.before(l)); n.remove(); });
    return clone.textContent ?? "";
  };
  const english = (copy: ResearchCopy) => leaves(copy).filter((s) => s.length > 3);
  const word = (s: string) => new RegExp(`(^|[^\\p{L}])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");

  it("has every control and note in both languages with identical structure; no empty or untranslated LT string", () => {
    const shape = (v: unknown): unknown => (typeof v === "function" ? "fn" : typeof v === "string" ? "str" : Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shape(x)])));
    expect(shape(RESEARCH_COPY.lt)).toEqual(shape(RESEARCH_COPY.en));
    for (const value of leaves(RESEARCH_COPY.lt)) expect(value.trim()).not.toBe("");
    for (const key of ["queuedAt", "lastSignal", "finishedAt", "stalled"] as const) expect(RESEARCH_COPY.lt[key]("T")).not.toBe(RESEARCH_COPY.en[key]("T"));
    const en = new Set(leaves(RESEARCH_COPY.en)); for (const v of leaves(RESEARCH_COPY.lt)) if (v.length > 6) expect(en.has(v)).toBe(false);
  });

  it("shows no English control text anywhere in the Lithuanian view of a finished result, and tags the model's text English", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("succeeded"))));
    mount({ lang: "lt" }); await settle();
    const lt = RESEARCH_COPY.lt;
    const controls = visibleControls();
    for (const s of english(RESEARCH_COPY.en)) expect(controls, s).not.toMatch(word(s));
    for (const s of [lt.title, lt.tagExperimental, lt.tagUngraded, lt.succeeded, lt.stages.queued, lt.stages.completed, lt.access, lt.haikuNote, lt.notAccessedNote, lt.narrativeNote, lt.ownWordsNote, lt.factLabels.servingsPerDay.length ? lt.missingLead : "", lt.missingHow, lt.notAffectScore, `${lt.affectsScore}: ${lt.no}`, `${lt.summaryLabels.requests}: 3`, `${lt.summaryLabels.walls}: 1`, lt.knownLimitations["ID matching does not verify study numbers or clinical validity."], lt.accessNone, lt.inventoryItem]) expect(text()).toContain(s);
    // the narrative is the original English, byte for byte, in an element tagged lang="en"
    for (const s of [SENTENCE, STUDY, DOUBT, RANGE]) {
      const holder = Array.from(host.querySelectorAll('[lang="en"]')).find((n) => n.textContent?.includes(s));
      expect(holder, s).toBeTruthy();
    }
    expect(host.querySelector("[role=note]")?.textContent).toBe(lt.narrativeNote);
    // the English words the model wrote are not mistaken for controls; the LT page has no EN yes/no/none
    expect(controls).not.toMatch(/: (yes|no)\b/);
  });

  it.each([
    ["starting", () => vi.fn().mockImplementation(() => new Promise<Response>(() => {})), "starting"],
    ["queued", () => vi.fn().mockResolvedValue(ok(job("queued"))), "queued"],
    ["running", () => vi.fn().mockResolvedValue(ok(job("running"))), "running"],
    ["failed", () => vi.fn().mockResolvedValue(ok(job("failed"))), "failed"],
    ["disabled", () => vi.fn().mockResolvedValue(response({ status: "research_disabled" }, 503)), "disabled"],
    ["unavailable", () => vi.fn().mockResolvedValue(response({ status: "research_unavailable" }, 503)), "unavailable"],
    ["busy", () => vi.fn().mockResolvedValue(response({ status: "research_busy" }, 429)), "busy"],
    ["not-researchable", () => vi.fn().mockResolvedValue(response({ status: "scan_not_researchable" }, 422)), "notResearchable"],
    ["not-found", () => vi.fn().mockResolvedValue(response({ status: "not_found" }, 404)), "notFound"],
    ["error", () => vi.fn().mockResolvedValue(response({ status: "research_failed" }, 502)), "error"],
  ] as const)("the %s status line and its controls are Lithuanian", async (name, makeFetch, key) => {
    vi.stubGlobal("fetch", makeFetch());
    mount({ lang: "lt" }); await settle();
    expect(state()).toBe(name);
    expect(status()).toBe(RESEARCH_COPY.lt[key]);
    const controls = visibleControls();
    for (const s of english(RESEARCH_COPY.en)) expect(controls, s).not.toMatch(word(s));
    if (name === "unavailable" || name === "busy" || name === "error") expect(button()?.textContent).toBe(RESEARCH_COPY.lt.retry);
  });

  it("the replay prompt, its button and the stalled notice are Lithuanian too", async () => {
    mount({ lang: "lt", replay: true }); await settle();
    expect(status()).toBe(RESEARCH_COPY.lt.idle); expect(button()?.textContent).toBe(RESEARCH_COPY.lt.load); expect(text()).toContain(RESEARCH_COPY.lt.loadHint);
    act(() => root.unmount()); root = createRoot(host);
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("running"))));
    mount({ lang: "lt", clock: () => T0_MS + 400_000 }); await advance(0);
    expect(status()).toBe(RESEARCH_COPY.lt.stalled("2026-10-04 19:00 UTC"));
    expect(host.querySelector('[aria-current="step"]')?.textContent).toBe(RESEARCH_COPY.lt.stages.running);
  });

  it("the facts and the missing-fact list are Lithuanian and still never default a serving count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("queued"))));
    mount({ lang: "lt" }); await settle();
    const lt = RESEARCH_COPY.lt;
    expect(host.querySelector('[data-testid="research-missing"]')?.textContent).toBe(`${lt.missingLead} ${lt.missing.servings_per_day}.`);
    expect(host.querySelector("details summary")?.textContent).toBe(lt.factsTitle);
    expect(host.querySelector("details")?.textContent).toContain(`${lt.factLabels.compoundPerServing}200 mg`);
    expect(host.querySelector("details")?.textContent).not.toContain(lt.factLabels.servingsPerDay);
  });

  it("switching language redraws the same job in the other language without a new request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(job("succeeded"))); vi.stubGlobal("fetch", fetchMock);
    mount({ lang: "en" }); await settle(); expect(status()).toBe("Research audit returned.");
    mount({ lang: "lt" }); await settle(); expect(status()).toBe(RESEARCH_COPY.lt.succeeded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const s of [SENTENCE, STUDY, DOUBT]) expect(text()).toContain(s);
  });
});

describe("live research panel: accessibility", () => {
  it("is a labelled region with one polite status line, a labelled step list and buttons that have names", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: "research_failed" }, 502)));
    mount(); await settle();
    const section = host.querySelector("section")!;
    const heading = host.querySelector("h2")!;
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(button()?.textContent?.trim()).toBeTruthy(); expect(button()?.getAttribute("type")).toBe("button");
    act(() => root.unmount()); root = createRoot(host);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(job("running"))));
    mount(); await settle();
    const steps = host.querySelector("ol.sc-research-steps")!;
    expect(steps.getAttribute("aria-label")).toBe("Research status (real job status, no estimate)");
    expect(steps.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(host.querySelectorAll("h1")).toHaveLength(0); // the page owns its single h1; no second top bar or tab list
    expect(host.querySelector('[role="tablist"], [role="tab"], nav, header')).toBeNull();
  });
});

function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String((value as (s: string) => string)("X"))];
  if (typeof value === "object" && value !== null) return Object.entries(value).flatMap(([, v]) => leaves(v));
  return [];
}
