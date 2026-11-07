/*
 * Google sign-in is the gate in front of real scan results wherever it is
 * configured (2026-09-23, founder: results depend on a Google login; replaces
 * the 2026-09-16 "Save your result" nudge, the blurred result lock and the late
 * /api/scan/claim). Drives the REAL <ScanFlow> in jsdom, mocking only
 * `@/lib/auth/supabase-browser` (the one module that would otherwise reach a
 * real Supabase project), so the gate, the bearer header, session expiry and the
 * account-switch rules run exactly as a browser would run them.
 *
 * What is pinned here:
 *   - unconfigured (local/CI): the flow is exactly what it always was -- no gate,
 *     no Authorization header, no persistence claim;
 *   - configured: NO request is sent until a Supabase session exists, and a
 *     returning session being read is neither "signed out" nor "unlocked";
 *   - every POST /api/scan (photo AND typed) carries `Bearer <current token>`,
 *     and /api/scan/claim is never called;
 *   - sign-out, expiry and an account switch remove the result, abort the
 *     request in flight and discard its late answer.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";

import { USER_A, USER_B, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import {
  Harness,
  STORED,
  analysis,
  buttonByText,
  click,
  jsonResponse,
  openSearch,
  record,
  settle,
  stageAndScan,
  stagePhoto,
  submitMagnesium,
  type RecordedCall,
} from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { fakeAuth } = await import("./helpers/fake-supabase-browser");
const { ScanFlow } = await import("@/components/scan-flow");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const catalog = ingredientCatalog();
const harness = new Harness();

const mountFlow = () => harness.mount(createElement(ScanFlow, { catalog }));

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

/** A fetch stub that records every call and answers by URL. */
function stubFetch(answer: (call: RecordedCall) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      const call = record(url, init);
      // The owner-private research panel probes /api/scan/research once a stored result is on screen
      // (tests/scan-research-panel.test.tsx covers that contract). These tests are about the scan
      // request, so the probe is answered like any other call but is not part of `calls`.
      if (call.url !== "/api/scan/research") calls.push(call);
      return Promise.resolve(answer(call));
    }),
  );
  return calls;
}

/** A fetch that stays pending until `release` is called (and never honours abort on its own). */
function stubHangingFetch() {
  const calls: RecordedCall[] = [];
  let release!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      calls.push(record(url, init));
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }),
  );
  return { calls, release: (r: Response) => release(r) };
}

describe("unconfigured deployment (local/CI): nothing changes", () => {
  it("scans with no sign-in UI, no Authorization header, and no persistence claim", async () => {
    fakeAuth.configured = false;
    const calls = stubFetch(() => jsonResponse(analysis({ persistence: STORED })));
    const el = await mountFlow();
    await stageAndScan(el);
    await settle();

    expect(el.querySelector('[data-testid="signin-card"]')).toBeNull();
    expect(el.querySelector('[data-testid="signin-hint"]')).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/scan");
    expect(calls[0].headers.Authorization).toBeUndefined();
    // The result is drawn, unblurred and not inert.
    const result = el.querySelector(".la-result");
    expect(result).not.toBeNull();
    expect(result?.hasAttribute("inert")).toBe(false);
    expect(result?.classList.contains("sc-locked")).toBe(false);
    // With no account there is nothing to "save to", so no such sentence.
    expect(el.querySelector('[data-testid="save-status"]')).toBeNull();
    expect(fakeAuth.client.auth.getSession).toBeDefined();
    expect(fakeAuth.listeners).toHaveLength(0);
  });
});

describe("configured: a Google session is required before any request", () => {
  it("while a returning session is being read it shows neither the sign-in card nor a scan button, and sends nothing", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    fakeAuth.holdSession();
    const calls = stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await stagePhoto(el);

    // Staged and safe, but neither "signed out" (no card) nor open (no scan button).
    expect(el.querySelector('img[alt="The label you staged for analysis"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="signin-card"]')).toBeNull();
    expect(buttonByText(el, /scan this label/i)).toBeUndefined();
    expect(el.textContent).toMatch(/checking your sign-in/i);
    expect(el.querySelector(".la-result")).toBeNull();
    expect(calls).toHaveLength(0);

    // The session arrives: now (and only now) the same staged photo can be scanned.
    fakeAuth.releaseSession();
    await settle();
    expect(buttonByText(el, /scan this label/i)).toBeDefined();
    expect(el.querySelector('[data-testid="signin-card"]')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("signed out: a photo can be staged but is not sent -- the sign-in card replaces the scan button", async () => {
    fakeAuth.configured = true;
    const calls = stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await settle();

    // The landing explains the rule without loading Google yet.
    expect(el.querySelector('[data-testid="signin-hint"]')?.textContent).toMatch(/google sign-in/i);
    expect(el.querySelector('[data-testid="signin-card"]')).toBeNull();

    await stagePhoto(el);
    await settle();
    const card = el.querySelector('[data-testid="signin-card"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toMatch(/sign in to scan this label/i);
    expect(el.querySelector('[data-testid="google-signin-button"]')).not.toBeNull();
    expect(buttonByText(el, /scan this label/i)).toBeUndefined();
    // The photo is still there, and no result exists to be misread.
    expect(el.querySelector('img[alt="The label you staged for analysis"]')).not.toBeNull();
    expect(el.querySelector(".la-result")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("signed out: the search sheet offers the sign-in card instead of a form that could not be sent", async () => {
    fakeAuth.configured = true;
    const calls = stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await settle();
    await openSearch(el);
    await settle();

    const sheet = document.querySelector(".sc-sheet");
    expect(sheet?.querySelector('[data-testid="signin-card"]')).not.toBeNull();
    expect(sheet?.querySelector('input[role="combobox"]')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("signing in turns the same staged photo into a scannable one", async () => {
    fakeAuth.configured = true;
    const el = await mountFlow();
    await stagePhoto(el);
    await settle();
    expect(buttonByText(el, /scan this label/i)).toBeUndefined();

    fakeAuth.setSession(sessionFor(USER_A));
    await settle();
    expect(el.querySelector('[data-testid="signin-card"]')).toBeNull();
    expect(buttonByText(el, /scan this label/i)).toBeDefined();
  });
});

describe("configured and signed in: requests carry the session", () => {
  it("a photo scan sends Bearer <access token>, never calls /api/scan/claim, and says it was saved only when stored", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-photo");
    const calls = stubFetch(() => jsonResponse(analysis({ persistence: STORED })));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    expect(calls.map((c) => c.url)).toEqual(["/api/scan"]);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe("Bearer tok-photo");
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect((calls[0].body as FormData).get("image")).toBeInstanceOf(File);
    expect(el.textContent).toContain("a@example.com");
    expect(el.querySelector(".la-result")?.hasAttribute("inert")).toBe(false);
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toBe("Saved to your history.");
  });

  it("a typed (manual) scan carries the same bearer header and a JSON body", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-manual");
    const calls = stubFetch(() => jsonResponse(analysis({ source: "manual", persistence: STORED })));
    const el = await mountFlow();
    await settle();
    await openSearch(el);
    await submitMagnesium();
    await settle();

    expect(calls.map((c) => c.url)).toEqual(["/api/scan"]);
    expect(calls[0].headers.Authorization).toBe("Bearer tok-manual");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(calls[0].body))).toMatchObject({ source: "manual", ingredient: "magnesium", form: "magnesium_glycinate" });
  });

  it("reports a storage failure honestly instead of implying the scan was saved", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse(analysis({ persistence: { ...STORED, status: "failed" } })));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    const note = el.querySelector('[data-testid="save-status"]');
    expect(note?.getAttribute("data-persistence")).toBe("failed");
    expect(note?.textContent).toMatch(/failed/i);
    expect(note?.textContent).not.toMatch(/^saved to your history/i);
  });

  it("says nothing about saving when the server reported no persistence outcome", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();
    expect(el.querySelector(".la-result")).not.toBeNull();
    expect(el.querySelector('[data-testid="save-status"]')).toBeNull();
  });

  it("a routine token refresh for the same user neither clears the result nor looks like an account switch", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-1");
    stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();
    expect(el.querySelector(".la-result")).not.toBeNull();

    fakeAuth.setSession(sessionFor(USER_A, "tok-2"), "TOKEN_REFRESHED");
    await settle();
    expect(el.querySelector(".la-result")).not.toBeNull();
  });
});

describe("sign-out, expiry and account switches never leak a result", () => {
  it("sign-out removes the result entirely (not blurred), says why, and brings the gate back", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();
    expect(el.querySelector(".la-result")).not.toBeNull();

    await click(buttonByText(el, /sign out/i));
    await settle();

    expect(fakeAuth.signOutCalls).toBe(1);
    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.textContent).not.toContain("Ashwagandha");
    expect(el.textContent).not.toContain("a@example.com");
    // Back on the landing, comprehensible: the controls are there and the rule is stated.
    expect(el.querySelector("#scan-file")).not.toBeNull();
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/signed out/i);
    expect(el.querySelector('[data-testid="signin-hint"]')).not.toBeNull();
  });

  it("switching Google accounts removes the previous person's result and shows nothing for the new one", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();
    expect(el.textContent).toContain("Ashwagandha");

    fakeAuth.setSession(sessionFor(USER_B));
    await settle();

    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.textContent).not.toContain("Ashwagandha");
    expect(el.textContent).not.toContain("a@example.com");
    expect(el.textContent).not.toContain("b@example.com");
    // B is signed in, so B's capture UI is open -- no sign-in card, no stale notice.
    expect(el.querySelector('[data-testid="signin-card"]')).toBeNull();
    expect(el.querySelector('[data-testid="signin-notice"]')).toBeNull();
  });

  it("an account switch mid-scan aborts the request and drops a late answer for the previous user", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    const hanging = stubHangingFetch();
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();
    expect(hanging.calls).toHaveLength(1);
    expect(hanging.calls[0].headers.Authorization).toBe("Bearer tok-a");
    expect(hanging.calls[0].signal?.aborted).toBe(false);
    expect(el.querySelector(".sc-progress")).not.toBeNull();

    fakeAuth.setSession(sessionFor(USER_B, "tok-b"));
    await settle();
    // A's request is cancelled and B is not shown A's progress.
    expect(hanging.calls[0].signal?.aborted).toBe(true);
    expect(el.querySelector(".sc-progress")).toBeNull();

    // Even if the network delivers A's answer anyway, B never sees it.
    hanging.release(jsonResponse(analysis({ ingredient_label_text: "A-only product" })));
    await settle();
    expect(el.textContent).not.toContain("A-only product");
    expect(el.querySelector(".la-result")).toBeNull();
    // A's photo was the one being scanned, so it is gone too: B starts from the landing,
    // and scans afterwards with B's own token.
    expect(el.querySelector('img[alt="The label you staged for analysis"]')).toBeNull();
    expect(buttonByText(el, /scan this label/i)).toBeUndefined();
    const calls = stubFetch(() => jsonResponse(analysis({ ingredient_label_text: "B product" })));
    await stageAndScan(el);
    await settle();
    expect(calls[0].headers.Authorization).toBe("Bearer tok-b");
    expect(el.textContent).toContain("B product");
  });

  it("signing out mid-scan aborts the request and a late answer never appears", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    const hanging = stubHangingFetch();
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    fakeAuth.setSession(null);
    await settle();
    expect(hanging.calls[0].signal?.aborted).toBe(true);
    hanging.release(jsonResponse(analysis({ ingredient_label_text: "Late A result" })));
    await settle();

    expect(el.textContent).not.toContain("Late A result");
    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.querySelector(".sc-progress")).toBeNull();
    expect(buttonByText(el, /scan this label/i)).toBeUndefined();
    // Comprehensible afterwards: the rule and the reason are stated, the controls are there.
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/scan in progress was stopped/i);
    expect(el.querySelector('[data-testid="signin-hint"]')).not.toBeNull();
    expect(el.querySelector("#scan-file")).not.toBeNull();
    expect(el.querySelector('img[alt="The label you staged for analysis"]')).toBeNull();
  });

  it("a session that vanished before the request sends nothing and ends the session on screen", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    const calls = stubFetch(() => jsonResponse(analysis()));
    const el = await mountFlow();
    await settle();
    await stagePhoto(el);
    // The SDK lost the session without telling this tab (storage cleared elsewhere).
    fakeAuth.session = null;
    await click(buttonByText(el, /scan this label/i));
    await settle();

    expect(calls).toHaveLength(0);
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/session ended/i);
    expect(el.querySelector('[data-testid="signin-card"]')).not.toBeNull();
  });
});

describe("the API rejects the session", () => {
  it("401 refreshes the token once and retries with it (the server did no model work for the first)", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-old");
    fakeAuth.refreshTo = sessionFor(USER_A, "tok-new");
    const calls = stubFetch((call) =>
      call.headers.Authorization === "Bearer tok-new" ? jsonResponse(analysis({ persistence: STORED })) : jsonResponse({ status: "unauthorized" }, 401),
    );
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    expect(calls.map((c) => c.headers.Authorization)).toEqual(["Bearer tok-old", "Bearer tok-new"]);
    expect(fakeAuth.refreshCalls).toBe(1);
    expect(el.querySelector(".la-result")).not.toBeNull();
  });

  it("a second 401 stops (no loop), signs out, and asks the person to sign in again", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-old");
    fakeAuth.refreshTo = sessionFor(USER_A, "tok-new");
    const calls = stubFetch(() => jsonResponse({ status: "unauthorized" }, 401));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    expect(calls).toHaveLength(2);
    expect(fakeAuth.signOutCalls).toBe(1);
    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/session ended/i);
    expect(el.querySelector('[data-testid="signin-card"]')).not.toBeNull();
  });

  it("a refresh that fails signs the person out instead of retrying the same token", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-old");
    fakeAuth.refreshTo = undefined;
    const calls = stubFetch(() => jsonResponse({ status: "unauthorized" }, 401));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    expect(calls).toHaveLength(1);
    expect(fakeAuth.signOutCalls).toBe(1);
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/session ended/i);
  });

  it("503 auth_unavailable is a generic, honest error -- not a result and not a sign-out", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse({ status: "auth_unavailable", error: "SUPABASE_JWT_SECRET missing at db.internal:5432" }, 503));
    const el = await mountFlow();
    await settle();
    await stageAndScan(el);
    await settle();

    const alert = el.querySelector(".sc-error");
    expect(alert?.textContent).toMatch(/sign-in is unavailable/i);
    // The server's own detail is never echoed to the person.
    expect(alert?.textContent).not.toContain("db.internal");
    expect(el.querySelector(".la-result")).toBeNull();
    expect(fakeAuth.signOutCalls).toBe(0);
  });
});
