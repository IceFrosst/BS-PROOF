/*
 * <ScanFlow> and the server's REFUSAL responses that carry no analysis
 * (owner finding, 2026-10-03: with the intended production configuration,
 * SCAN_HISTORY_REQUIRED=1, a scan that could not be recorded came back as
 * `scan_history_required_failed`, and the UI drew a header "Result" with a "!"
 * and no words at all -- `scan_history_required_unavailable` and
 * `payload_too_large` did the same).
 *
 * Pinned here: each refusal is shown as an alert with a plain-language sentence
 * that says what happened and what to do, on the photo and the typed path, never
 * echoes the server's deployment detail (env-var names, run ids, persistence
 * blocks), never draws a result, and never signs the person out.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";

import { USER_A, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { Harness, jsonResponse, openSearch, record, settle, stageAndScan, submitMagnesium, type RecordedCall } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { fakeAuth } = await import("./helpers/fake-supabase-browser");
const { ScanFlow } = await import("@/components/scan-flow");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const harness = new Harness();
const mountFlow = () => harness.mount(createElement(ScanFlow, { catalog: ingredientCatalog() }));

beforeEach(() => {
  fakeAuth.reset();
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

function stubFetch(answer: Response) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      calls.push(record(url, init));
      return Promise.resolve(answer.clone());
    }),
  );
  return calls;
}

const HISTORY_FAILED = {
  status: "scan_history_required_failed",
  run_id: "run-secret-id-123",
  error: "The analysis completed but could not be durably recorded, and this deployment requires that it is.",
  persistence: { status: "failed", detail: "SUPABASE_SERVICE_ROLE_KEY rejected" },
};
const HISTORY_UNAVAILABLE = {
  status: "scan_history_required_unavailable",
  error: "This deployment requires durable scan history (SCAN_HISTORY_REQUIRED=1) but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured.",
};
const TOO_LARGE = {
  status: "payload_too_large",
  error: "That request is too large. A typed entry is at most 16 KiB.",
  source: "manual",
};

/** The one alert, the absence of any result, and the absence of server internals. */
function expectActionableAlert(el: HTMLElement, wording: RegExp) {
  const alert = el.querySelector(".sc-error");
  expect(alert, "an error alert must be drawn, not a blank result card").not.toBeNull();
  expect(alert?.getAttribute("role")).toBe("alert");
  const words = (alert?.textContent ?? "").replace(/Could not scan that\./, "").trim();
  expect(words.length).toBeGreaterThan(40); // a sentence, not a stub
  expect(words).toMatch(wording);
  expect(words).toMatch(/try again/i); // and an action
  for (const internal of ["SUPABASE", "SCAN_HISTORY_REQUIRED", "SERVICE_ROLE", "run-secret-id-123", "durably", "persistence"]) {
    expect(el.textContent).not.toContain(internal);
  }
  expect(el.querySelector(".la-result")).toBeNull();
  expect(el.querySelector(".scan-lab-result")).toBeNull();
}

describe("a photo scan the server refuses without an analysis", () => {
  it("scan_history_required_failed (500): says the scan could not be saved and to try again", async () => {
    stubFetch(jsonResponse(HISTORY_FAILED, 500));
    const el = await mountFlow();
    await stageAndScan(el);
    await settle();
    expectActionableAlert(el, /could not save/i);
  });

  it("scan_history_required_unavailable (503): says scanning is paused and nothing was scanned", async () => {
    stubFetch(jsonResponse(HISTORY_UNAVAILABLE, 503));
    const el = await mountFlow();
    await stageAndScan(el);
    await settle();
    expectActionableAlert(el, /paused/i);
    expect(el.textContent).toMatch(/nothing was scanned/i);
  });

  it("payload_too_large (413): says the request is too large and to use a smaller one", async () => {
    stubFetch(jsonResponse(TOO_LARGE, 413));
    const el = await mountFlow();
    await stageAndScan(el);
    await settle();
    const alert = el.querySelector(".sc-error");
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toMatch(/too large/i);
    expect(alert?.textContent).toMatch(/smaller photo/i);
    expect(alert?.textContent).toMatch(/try again/i);
    expect(alert?.textContent).not.toMatch(/KiB/); // the typed-entry limit is not advice for a photo
    expect(el.querySelector(".la-result")).toBeNull();
  });

  it("payload_too_large without a usable server message still gets words", async () => {
    stubFetch(jsonResponse({ status: "payload_too_large" }, 413));
    const el = await mountFlow();
    await stageAndScan(el);
    await settle();
    expect(el.querySelector(".sc-error")?.textContent).toMatch(/too large.*try again/i);
  });

  it("a payload_too_large message that names a setting is never echoed", async () => {
    stubFetch(jsonResponse({ status: "payload_too_large", error: "MAX_JSON_BYTES exceeded" }, 413));
    const el = await mountFlow();
    await stageAndScan(el);
    await settle();
    expect(el.textContent).not.toContain("MAX_JSON_BYTES");
    expect(el.querySelector(".sc-error")?.textContent).toMatch(/too large/i);
  });
});

describe("the typed (manual) path gets the same words", () => {
  it("scan_history_required_failed after a typed search", async () => {
    const calls = stubFetch(jsonResponse(HISTORY_FAILED, 500));
    const el = await mountFlow();
    await openSearch(el);
    await submitMagnesium();
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/scan");
    expectActionableAlert(el, /could not save/i);
  });

  it("payload_too_large after a typed search", async () => {
    stubFetch(jsonResponse(TOO_LARGE, 413));
    const el = await mountFlow();
    await openSearch(el);
    await submitMagnesium();
    await settle();
    expect(el.querySelector(".sc-error")?.textContent).toMatch(/too large/i);
  });
});

describe("signed in (the intended production configuration)", () => {
  it("scan_history_required_failed is an honest error: not a result, not a sign-out, and the next scan still works", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    const calls = stubFetch(jsonResponse(HISTORY_FAILED, 500));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    expect(calls[0].headers.Authorization).toBe("Bearer tok-a");
    expectActionableAlert(el, /could not save/i);
    expect(fakeAuth.signOutCalls).toBe(0);
    expect(el.querySelector('[data-testid="signin-card"]')).toBeNull();
    // The way back is there: "Scan another" returns to the capture state.
    const again = Array.from(el.querySelectorAll("button")).find((b) => /scan another/i.test(b.textContent ?? ""));
    expect(again).toBeDefined();
  });
});
