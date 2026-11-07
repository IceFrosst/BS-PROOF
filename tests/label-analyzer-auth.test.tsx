/*
 * /tester's <LabelAnalyzer> and the Google sign-in gate (owner finding,
 * 2026-10-03: `POST /api/analyze-label` spends the same model call as
 * `POST /api/scan`, and /tester called it with no bearer token).
 *
 * Drives the REAL <LabelAnalyzer> in jsdom with only
 * `@/lib/auth/supabase-browser` replaced (the one module that would otherwise
 * reach a real Supabase project), exactly like tests/scan-signin.test.tsx does
 * for <ScanFlow>, so the gate, the bearer header, session expiry and the
 * account-switch rules run as a browser would run them. Zero network, zero model
 * calls: `fetch` is a recording stub.
 *
 * What is pinned here:
 *   - unconfigured (local/CI): the analyzer is what it always was -- no gate, no
 *     sign-in UI, no Authorization header;
 *   - configured: a photo can be staged but NO request (and no anonymous request)
 *     is made until a Supabase session exists; a returning session being read is
 *     "checking", neither signed out nor open; the Google card replaces Analyze;
 *   - every POST /api/analyze-label carries `Bearer <current token>`;
 *   - sign-out, expiry and an account switch abort the request in flight, discard
 *     its late answer and remove the result (no leak to the next person);
 *   - 401 refreshes once and retries once; a second 401 / a failed refresh signs
 *     out on screen; 503 auth_unavailable and a not-set-up 401 are honest errors.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { USER_A, USER_B, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { Harness, buttonByText, click, jsonResponse, record, settle, type RecordedCall } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { fakeAuth } = await import("./helpers/fake-supabase-browser");
const { LabelAnalyzer } = await import("@/components/label-analyzer");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const harness = new Harness();
const mount = () => harness.mount(createElement(LabelAnalyzer));

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

/** A response the real renderer draws as a result (a not-in-vocabulary label: no scoring needed). */
function labelAnswer(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "LabelAnalysisV1",
    status: "ingredient_not_supported",
    ingredient_label_text: "Ashwagandha",
    supported_ingredients: ["creatine"],
    ...overrides,
  };
}

function stubFetch(answer: (call: RecordedCall) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      const call = record(url, init);
      calls.push(call);
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

async function stage(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>("#la-file");
  if (!input) throw new Error("no upload input rendered");
  const file = new File(["fake-bytes"], "label.png", { type: "image/png" });
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const analyzeButton = (root: HTMLElement) => buttonByText(root, /^analyze/i);

async function stageAndAnalyze(root: HTMLElement) {
  await stage(root);
  const button = analyzeButton(root);
  if (!button) throw new Error("no Analyze button rendered after staging a file");
  await click(button);
}

const hasStagedPhoto = (root: HTMLElement) => root.querySelector('img[alt="The label you staged for analysis"]') !== null;
const card = (root: HTMLElement) => root.querySelector('[data-testid="signin-card"]');

describe("unconfigured deployment (local/CI): nothing changes", () => {
  it("analyzes with no sign-in UI and no Authorization header", async () => {
    fakeAuth.configured = false;
    const calls = stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await stageAndAnalyze(el);
    await settle();

    expect(card(el)).toBeNull();
    expect(el.querySelector('[data-testid="la-signin-hint"]')).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/analyze-label");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect(el.querySelector(".la-result")).not.toBeNull();
    expect(el.textContent).toContain("Ashwagandha");
    expect(el.textContent).not.toMatch(/signed in as/i);
  });
});

describe("configured: a Google session is required before any request", () => {
  it("signed out: the landing says so, a photo can be staged, and the sign-in card replaces Analyze (nothing is sent)", async () => {
    fakeAuth.configured = true;
    const calls = stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await settle();

    expect(el.querySelector('[data-testid="la-signin-hint"]')?.textContent).toMatch(/google sign-in/i);
    expect(card(el)).toBeNull();

    await stage(el);
    await settle();
    expect(hasStagedPhoto(el)).toBe(true);
    expect(card(el)?.textContent).toMatch(/sign in to analyze this label/i);
    expect(el.querySelector('[data-testid="google-signin-button"]')).not.toBeNull();
    expect(analyzeButton(el)).toBeUndefined();
    expect(el.textContent).toMatch(/sign in and press analyze/i);
    expect(el.querySelector(".la-result")).toBeNull();
    // No anonymous request, ever.
    expect(calls).toHaveLength(0);
  });

  it("while a returning session is being read it shows neither the sign-in card nor Analyze, and sends nothing", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    fakeAuth.holdSession();
    const calls = stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await stage(el);

    expect(hasStagedPhoto(el)).toBe(true);
    expect(card(el)).toBeNull();
    expect(analyzeButton(el)).toBeUndefined();
    expect(el.querySelector('[data-testid="la-checking"]')?.textContent).toMatch(/checking your sign-in/i);
    expect(calls).toHaveLength(0);

    fakeAuth.releaseSession();
    await settle();
    expect(analyzeButton(el)).toBeDefined();
    expect(card(el)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("signing in turns the same staged photo into an analyzable one", async () => {
    fakeAuth.configured = true;
    const el = await mount();
    await stage(el);
    await settle();
    expect(analyzeButton(el)).toBeUndefined();

    fakeAuth.setSession(sessionFor(USER_A));
    await settle();
    expect(card(el)).toBeNull();
    expect(hasStagedPhoto(el)).toBe(true);
    expect(analyzeButton(el)).toBeDefined();
  });

  it("a session that vanished before the request sends nothing and ends the session on screen", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    const calls = stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await settle();
    await stage(el);
    fakeAuth.session = null; // the SDK lost it without telling this tab
    await click(analyzeButton(el));
    await settle();

    expect(calls).toHaveLength(0);
    expect(card(el)).not.toBeNull();
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/session ended/i);
  });
});

describe("configured and signed in: the request carries the session", () => {
  it("sends Bearer <the live access token> on a multipart POST and shows who is signed in", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    const calls = stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/analyze-label");
    expect(calls[0].headers.Authorization).toBe("Bearer tok-a");
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect(el.querySelector(".la-result")).not.toBeNull();
    expect(el.textContent).toContain("a@example.com");
  });

  it("re-reads the token at send time: a token refreshed after the page rendered is the one sent", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-old");
    const calls = stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await settle();
    await stage(el);
    fakeAuth.session = sessionFor(USER_A, "tok-fresh"); // refreshed without an auth event
    await click(analyzeButton(el));
    await settle();

    expect(calls.map((c) => c.headers.Authorization)).toEqual(["Bearer tok-fresh"]);
  });

  it("an unreadable label is still shown as the route's own error, not as an auth problem", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse({ status: "label_unreadable", error: "Too blurry to read." }));
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    expect(el.querySelector(".la-alert-bad")?.textContent).toMatch(/too blurry/i);
    expect(fakeAuth.signOutCalls).toBe(0);
  });
});

describe("sign-out, expiry and account switches never leak a result", () => {
  it("sign-out removes the result entirely, says why, and brings the gate back", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();
    expect(el.querySelector(".la-result")).not.toBeNull();

    await click(buttonByText(el, /sign out/i));
    await settle();

    expect(fakeAuth.signOutCalls).toBe(1);
    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.textContent).not.toContain("Ashwagandha");
    expect(el.textContent).not.toContain("a@example.com");
    expect(el.querySelector('[data-testid="la-signin-notice"]')?.textContent).toMatch(/signed out/i);
    expect(el.querySelector('[data-testid="la-signin-hint"]')).not.toBeNull();
  });

  it("switching Google accounts removes the previous person's result and shows nothing for the new one", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse(labelAnswer()));
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();
    expect(el.textContent).toContain("Ashwagandha");

    fakeAuth.setSession(sessionFor(USER_B));
    await settle();

    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.textContent).not.toContain("Ashwagandha");
    expect(el.textContent).not.toContain("a@example.com");
    expect(el.textContent).not.toContain("b@example.com");
    expect(card(el)).toBeNull(); // B is signed in, so B's own capture UI is open
  });

  it("an account switch mid-analysis aborts the request, drops a late answer, and B scans with B's own token", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    const hanging = stubHangingFetch();
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();
    expect(hanging.calls).toHaveLength(1);
    expect(hanging.calls[0].headers.Authorization).toBe("Bearer tok-a");
    expect(hanging.calls[0].signal?.aborted).toBe(false);
    expect(el.querySelector(".la-stage")).not.toBeNull();

    fakeAuth.setSession(sessionFor(USER_B, "tok-b"));
    await settle();
    expect(hanging.calls[0].signal?.aborted).toBe(true);
    expect(el.querySelector(".la-stage")).toBeNull();

    // Even if the network delivers A's answer anyway, B never sees it.
    hanging.release(jsonResponse(labelAnswer({ ingredient_label_text: "A-only product" })));
    await settle();
    expect(el.textContent).not.toContain("A-only product");
    expect(el.querySelector(".la-result")).toBeNull();
    // A's photo was the one being analyzed, so it is gone too.
    expect(hasStagedPhoto(el)).toBe(false);

    const calls = stubFetch(() => jsonResponse(labelAnswer({ ingredient_label_text: "B product" })));
    await stageAndAnalyze(el);
    await settle();
    expect(calls[0].headers.Authorization).toBe("Bearer tok-b");
    expect(el.textContent).toContain("B product");
  });

  it("signing out mid-analysis aborts the request and a late answer never appears", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    const hanging = stubHangingFetch();
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    fakeAuth.setSession(null);
    await settle();
    expect(hanging.calls[0].signal?.aborted).toBe(true);
    hanging.release(jsonResponse(labelAnswer({ ingredient_label_text: "Late A result" })));
    await settle();

    expect(el.textContent).not.toContain("Late A result");
    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.querySelector(".la-stage")).toBeNull();
    expect(el.querySelector('[data-testid="la-signin-notice"]')?.textContent).toMatch(/analysis in progress was stopped/i);
    expect(hasStagedPhoto(el)).toBe(false);
    expect(analyzeButton(el)).toBeUndefined();
  });

  it("an aborted request that rejects does not surface its error to the next person", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    fakeAuth.setSession(sessionFor(USER_B));
    await settle();
    expect(el.querySelector(".la-alert-bad")).toBeNull();
    expect(el.textContent).not.toMatch(/could not reach the analyzer/i);
  });
});

describe("the API rejects the session", () => {
  it("401 refreshes the token once and retries with it", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-old");
    fakeAuth.refreshTo = sessionFor(USER_A, "tok-new");
    const calls = stubFetch((call) =>
      call.headers.Authorization === "Bearer tok-new" ? jsonResponse(labelAnswer()) : jsonResponse({ status: "unauthorized" }, 401),
    );
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
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
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    expect(calls).toHaveLength(2);
    expect(fakeAuth.signOutCalls).toBe(1);
    expect(el.querySelector(".la-result")).toBeNull();
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/session ended/i);
    expect(card(el)).not.toBeNull();
    expect(hasStagedPhoto(el)).toBe(true); // the photo was only staged, never answered: it survives sign-in
  });

  it("a refresh that fails signs the person out instead of retrying the same token", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-old");
    fakeAuth.refreshTo = undefined;
    const calls = stubFetch(() => jsonResponse({ status: "unauthorized" }, 401));
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    expect(calls).toHaveLength(1);
    expect(fakeAuth.signOutCalls).toBe(1);
    expect(el.querySelector('[data-testid="signin-notice"]')?.textContent).toMatch(/session ended/i);
  });

  it("503 auth_unavailable is a generic, honest error -- not a result and not a sign-out", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse({ status: "auth_unavailable", error: "SUPABASE_JWT_SECRET missing at db.internal:5432" }, 503));
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    const alert = el.querySelector(".la-alert-bad");
    expect(alert?.textContent).toMatch(/sign-in is unavailable/i);
    expect(alert?.textContent).not.toContain("db.internal");
    expect(el.querySelector(".la-result")).toBeNull();
    expect(fakeAuth.signOutCalls).toBe(0);
  });

  it("the deployment-wide analyzer_unavailable 503 keeps its own (non-error) state", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    stubFetch(() => jsonResponse({ status: "analyzer_unavailable", error: "off" }, 503));
    const el = await mount();
    await settle();
    await stageAndAnalyze(el);
    await settle();

    expect(el.textContent).toMatch(/label reading is not configured/i);
    expect(el.querySelector(".la-alert-bad")).toBeNull();
    expect(fakeAuth.signOutCalls).toBe(0);
  });
});

describe("configured page, but the server is not (a 401 that no refresh can fix)", () => {
  it("is not reachable without sign-in config: an unconfigured page that gets a 401 says the page is not set up", async () => {
    fakeAuth.configured = false; // no public sign-in vars in this build, but the server demands one
    const calls = stubFetch(() => jsonResponse({ status: "unauthorized", error: "Sign in with Google to continue." }, 401));
    const el = await mount();
    await stageAndAnalyze(el);
    await settle();

    expect(calls).toHaveLength(1); // no refresh loop on a page that cannot sign in
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(el.querySelector(".la-alert-bad")?.textContent).toMatch(/not set up to sign in/i);
    expect(el.querySelector(".la-result")).toBeNull();
  });
});
