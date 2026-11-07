/*
 * The client session hook (lib/auth/use-supabase-session.ts), driven through a
 * tiny probe component against the shared fake Supabase client. What matters
 * for the scan screens built on it:
 *   - unconfigured never touches the SDK;
 *   - "loading" ends in every case (a failed first read is signed-out, not an
 *     endless spinner), and a late first read never overwrites a newer event;
 *   - the rendered token is only a snapshot: getAccessToken() re-reads the live
 *     session, refuses a session that belongs to someone else, and can refresh;
 *   - the subscription is released on unmount.
 */
import { act, createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAuth, sessionFor, USER_A, USER_B } from "./helpers/fake-supabase-browser";
import { Harness, settle } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { useSupabaseSession } = await import("@/lib/auth/use-supabase-session");
type Session = ReturnType<typeof useSupabaseSession>;

const harness = new Harness();
let latest: Session;

function Probe({ skip = false }: { skip?: boolean }) {
  const session = useSupabaseSession({ skip });
  useEffect(() => {
    latest = session;
  });
  return createElement("output", { "data-state": JSON.stringify({ configured: session.configured, loading: session.loading, email: session.email, userId: session.userId, accessToken: session.accessToken }) });
}

const state = (el: HTMLElement) => JSON.parse(el.querySelector("output")?.getAttribute("data-state") ?? "{}");

beforeEach(() => {
  fakeAuth.reset();
});

afterEach(async () => {
  await harness.cleanup();
  vi.restoreAllMocks();
});

describe("useSupabaseSession", () => {
  it("never touches the SDK when sign-in is not configured", async () => {
    fakeAuth.configured = false;
    const el = await harness.mount(createElement(Probe));
    await settle();
    expect(state(el)).toMatchObject({ configured: false, loading: false, userId: null, email: null });
    expect(fakeAuth.listeners).toHaveLength(0);
    expect(await latest.getAccessToken()).toBeNull();
  });

  it("is loading until the first read resolves, then reports who is signed in", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    fakeAuth.holdSession();
    const el = await harness.mount(createElement(Probe));
    expect(state(el)).toMatchObject({ configured: true, loading: true, userId: null });
    fakeAuth.releaseSession();
    await settle();
    expect(state(el)).toEqual({ configured: true, loading: false, email: "a@example.com", userId: "user-a", accessToken: "tok-a" });
  });

  it("a failed first read is 'not signed in', never an endless loading state", async () => {
    fakeAuth.configured = true;
    fakeAuth.getSessionFails = true;
    const el = await harness.mount(createElement(Probe));
    await settle();
    expect(state(el)).toMatchObject({ loading: false, userId: null });
  });

  it("a late first read never overwrites a newer auth event", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    fakeAuth.holdSession();
    const el = await harness.mount(createElement(Probe));
    // Someone else signs in while the first read is still pending.
    await act(async () => {
      fakeAuth.setSession(sessionFor(USER_B, "tok-b"));
    });
    fakeAuth.releaseSession();
    await settle();
    expect(state(el)).toMatchObject({ userId: "user-b", accessToken: "tok-b" });
  });

  it("follows sign-out, an account switch and a token refresh", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-1");
    const el = await harness.mount(createElement(Probe));
    await settle();
    await act(async () => fakeAuth.setSession(sessionFor(USER_A, "tok-2"), "TOKEN_REFRESHED"));
    expect(state(el)).toMatchObject({ userId: "user-a", accessToken: "tok-2" });
    await act(async () => fakeAuth.setSession(sessionFor(USER_B, "tok-b")));
    expect(state(el)).toMatchObject({ userId: "user-b", email: "b@example.com" });
    await act(async () => fakeAuth.setSession(null));
    expect(state(el)).toMatchObject({ loading: false, userId: null, email: null, accessToken: null });
  });

  it("getAccessToken() returns the LIVE token, not the one captured at render", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-render");
    const el = await harness.mount(createElement(Probe));
    await settle();
    expect(state(el).accessToken).toBe("tok-render");
    // The SDK refreshed behind the page's back (no render yet).
    fakeAuth.session = sessionFor(USER_A, "tok-live");
    expect(await latest.getAccessToken()).toBe("tok-live");
  });

  it("getAccessToken({ userId }) refuses a session that belongs to someone else, or to no one", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    await harness.mount(createElement(Probe));
    await settle();
    expect(await latest.getAccessToken({ userId: "user-a" })).toBe("token-user-a");
    expect(await latest.getAccessToken({ userId: "user-b" })).toBeNull();
    fakeAuth.session = null;
    expect(await latest.getAccessToken({ userId: "user-a" })).toBeNull();
  });

  it("getAccessToken({ forceRefresh }) asks Supabase to refresh and returns the new token; a failed refresh is null", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-old");
    await harness.mount(createElement(Probe));
    await settle();
    fakeAuth.refreshTo = sessionFor(USER_A, "tok-new");
    expect(await latest.getAccessToken({ forceRefresh: true })).toBe("tok-new");
    expect(fakeAuth.refreshCalls).toBe(1);
    fakeAuth.refreshTo = undefined;
    expect(await latest.getAccessToken({ forceRefresh: true })).toBeNull();
  });

  it("signOut() ends the session on screen even when the SDK call throws", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    const el = await harness.mount(createElement(Probe));
    await settle();
    const original = fakeAuth.client.auth.signOut;
    fakeAuth.client.auth.signOut = async () => {
      throw new Error("offline");
    };
    try {
      await act(async () => {
        await latest.signOut();
      });
    } finally {
      fakeAuth.client.auth.signOut = original;
    }
    expect(state(el)).toMatchObject({ userId: null, loading: false });
  });

  it("releases its subscription on unmount, and a skipped hook never subscribes", async () => {
    fakeAuth.configured = true;
    await harness.mount(createElement(Probe));
    await settle();
    expect(fakeAuth.listeners).toHaveLength(1);
    await harness.cleanup();
    expect(fakeAuth.unsubscribed).toBe(1);
    expect(fakeAuth.listeners).toHaveLength(0);

    await harness.mount(createElement(Probe, { skip: true }));
    await settle();
    expect(fakeAuth.listeners).toHaveLength(0);
  });
});
