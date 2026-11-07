/*
 * The Google button must never leave a blank card (2026-09-23). Every failure --
 * the Identity Services script not loading, never answering, loading without the
 * API, the button failing to render, Google handing back a credential that
 * Supabase then refuses, a missing credential, a slow exchange -- ends in words
 * and an action, and no message ever contains the credential.
 *
 * Runs the real <GoogleSignInButton> / <SignInCard> in jsdom against the shared
 * fake Supabase client; the Identity Services script is simulated by installing
 * `window.google` or by firing load/error events on the injected <script>.
 */
import { createElement } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor, USER_A } from "./helpers/fake-supabase-browser";
import { Harness, buttonByText, click, settle } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { GOOGLE_EXCHANGE_FAILED, GOOGLE_EXCHANGE_SLOW, GOOGLE_LOAD_FAILED, GoogleSignInButton, SignInCard, resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const harness = new Harness();
const SCRIPT = 'script[src="https://accounts.google.com/gsi/client"]';

beforeEach(() => {
  fakeAuth.reset();
  fakeAuth.configured = true;
  resetGoogleSignInForTests();
  removeFakeGoogle();
});

afterEach(async () => {
  await harness.cleanup();
  removeFakeGoogle();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Google Identity Services script", () => {
  it("renders Google's button once the script is available and initialises it a single time for any number of cards", async () => {
    const google = installFakeGoogle();
    const el = await harness.mount(createElement("div", null, createElement(GoogleSignInButton), createElement(GoogleSignInButton)));
    await settle();

    expect(google.initializeCalls).toEqual([{ client_id: "test-client-id.apps.googleusercontent.com" }]);
    expect(google.renderCalls).toBe(2);
    expect(el.querySelectorAll("[data-fake-google-button]")).toHaveLength(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it("says so and offers a retry when the script fails to load, then recovers on retry", async () => {
    const el = await harness.mount(createElement(GoogleSignInButton));
    const first = document.querySelector<HTMLScriptElement>(SCRIPT);
    expect(first).not.toBeNull();
    expect(el.textContent).toMatch(/loading google sign-in/i);

    await act(async () => {
      first?.dispatchEvent(new Event("error"));
    });
    await settle();
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(GOOGLE_LOAD_FAILED);
    expect(el.textContent).not.toMatch(/loading google sign-in/i);
    // The failed tag is gone, so a retry starts a real second attempt.
    expect(document.querySelector(SCRIPT)).toBeNull();

    await click(buttonByText(el, /try again/i));
    const second = document.querySelector<HTMLScriptElement>(SCRIPT);
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(el.textContent).toMatch(/loading google sign-in/i);

    const google = installFakeGoogle();
    await act(async () => {
      second?.dispatchEvent(new Event("load"));
    });
    await settle();
    expect(google.renderCalls).toBe(1);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector("[data-fake-google-button]")).not.toBeNull();
  });

  it("does not wait forever on a script that never answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const el = await harness.mount(createElement(GoogleSignInButton));
    expect(el.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(GOOGLE_LOAD_FAILED);
    expect(buttonByText(el, /try again/i)).toBeDefined();
  });

  it("treats a script that loads without the Google API as a failure", async () => {
    const el = await harness.mount(createElement(GoogleSignInButton));
    await act(async () => {
      document.querySelector<HTMLScriptElement>(SCRIPT)?.dispatchEvent(new Event("load"));
    });
    await settle();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(GOOGLE_LOAD_FAILED);
  });

  it("shows the same recoverable error when Google's button cannot render", async () => {
    installFakeGoogle({ renderThrows: true });
    const el = await harness.mount(createElement(GoogleSignInButton));
    await settle();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(GOOGLE_LOAD_FAILED);
    expect(buttonByText(el, /try again/i)).toBeDefined();
  });
});

describe("turning a Google credential into a Supabase session", () => {
  it("exchanges the credential with signInWithIdToken for the google provider and then the session exists", async () => {
    const google = installFakeGoogle();
    const el = await harness.mount(createElement(GoogleSignInButton));
    await settle();

    await act(async () => {
      google.deliver("cred-secret-123");
    });
    await settle();

    expect(fakeAuth.signInCalls).toEqual([{ provider: "google", token: "cred-secret-123" }]);
    expect(fakeAuth.session?.user.id).toBe(USER_A.id);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    // The credential is never put on the page.
    expect(el.innerHTML).not.toContain("cred-secret-123");
  });

  it("shows 'signing you in' while the exchange is running", async () => {
    const google = installFakeGoogle();
    fakeAuth.holdIdToken();
    const el = await harness.mount(createElement(GoogleSignInButton));
    await settle();
    await act(async () => {
      google.deliver("cred-1");
    });
    expect(el.textContent).toMatch(/signing you in/i);
    fakeAuth.releaseIdToken();
    await settle();
    expect(el.textContent).not.toMatch(/signing you in/i);
  });

  it("an exchange Supabase refuses is an actionable error that leaves the Google button in place and leaks nothing", async () => {
    const google = installFakeGoogle();
    fakeAuth.idTokenError = { message: "Unacceptable audience in id_token: [client-xyz] token=cred-secret-123" };
    const el = await harness.mount(createElement(GoogleSignInButton));
    await settle();
    await act(async () => {
      google.deliver("cred-secret-123");
    });
    await settle();

    const alert = el.querySelector('[data-testid="google-exchange-error"]');
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toBe(GOOGLE_EXCHANGE_FAILED);
    expect(el.innerHTML).not.toContain("cred-secret-123");
    expect(el.innerHTML).not.toContain("Unacceptable audience");
    expect(el.querySelector("[data-fake-google-button]")).not.toBeNull();
    expect(fakeAuth.session).toBeNull();
  });

  it("a thrown network error gets the same treatment, and a later attempt that works clears it", async () => {
    const google = installFakeGoogle();
    fakeAuth.idTokenThrows = true;
    const el = await harness.mount(createElement(GoogleSignInButton));
    await settle();
    await act(async () => {
      google.deliver("cred-1");
    });
    await settle();
    expect(el.querySelector('[data-testid="google-exchange-error"]')?.textContent).toBe(GOOGLE_EXCHANGE_FAILED);

    fakeAuth.idTokenThrows = false;
    await act(async () => {
      google.deliver("cred-2");
    });
    await settle();
    expect(el.querySelector('[data-testid="google-exchange-error"]')).toBeNull();
    expect(fakeAuth.session).not.toBeNull();
  });

  it("a callback with no credential is an error, not a silent no-op, and never reaches Supabase", async () => {
    const google = installFakeGoogle();
    const el = await harness.mount(createElement(GoogleSignInButton));
    await settle();
    await act(async () => {
      google.deliver(undefined);
    });
    await settle();
    expect(el.querySelector('[data-testid="google-exchange-error"]')?.textContent).toBe(GOOGLE_EXCHANGE_FAILED);
    expect(fakeAuth.signInCalls).toHaveLength(0);
  });

  it("a slow exchange is called out, and the real answer still wins when it arrives", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const google = installFakeGoogle();
    fakeAuth.holdIdToken();
    const el = await harness.mount(createElement(GoogleSignInButton));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      google.deliver("cred-slow");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(el.querySelector('[data-testid="google-exchange-error"]')?.textContent).toBe(GOOGLE_EXCHANGE_SLOW);

    fakeAuth.releaseIdToken();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(el.querySelector('[data-testid="google-exchange-error"]')).toBeNull();
    expect(fakeAuth.session).not.toBeNull();
  });

  it("two sign-in cards on the page share one exchange status", async () => {
    const google = installFakeGoogle();
    fakeAuth.idTokenError = { message: "nope" };
    const el = await harness.mount(createElement("div", null, createElement(GoogleSignInButton), createElement(GoogleSignInButton)));
    await settle();
    await act(async () => {
      google.deliver("cred-1");
    });
    await settle();
    expect(el.querySelectorAll('[data-testid="google-exchange-error"]')).toHaveLength(2);
  });
});

describe("<SignInCard>", () => {
  it("is a labelled region with the reason (if any), the explanation and the Google button", async () => {
    installFakeGoogle();
    fakeAuth.session = sessionFor(USER_A);
    const el = await harness.mount(createElement(SignInCard, { title: "Sign in to see your history", body: "Saved scans belong to your account.", notice: "Your session ended. Sign in again to continue." }));
    await settle();
    const card = el.querySelector('[data-testid="signin-card"]');
    expect(card?.tagName).toBe("SECTION");
    const labelId = card?.getAttribute("aria-labelledby");
    expect(document.getElementById(labelId ?? "")?.textContent).toBe("Sign in to see your history");
    expect(el.querySelector('[data-testid="signin-notice"]')?.getAttribute("role")).toBe("status");
    expect(el.textContent).toContain("Saved scans belong to your account.");
    expect(el.querySelector('[data-testid="google-signin-button"]')).not.toBeNull();
  });
});
