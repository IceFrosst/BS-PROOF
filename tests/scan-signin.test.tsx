/*
 * Google sign-in while a scan/search's results load (2026-09-16, founder:
 * "people log in once so we capture their email"). Drives the REAL
 * <ScanFlow> in jsdom, mocking only `@/lib/auth/supabase-browser` (the one
 * module that would otherwise talk to a real Supabase project) so the whole
 * gating logic — card appears only when configured and signed out, results
 * lock/unlock, the claim call fires once a session and a run_id both exist —
 * is exercised exactly as a browser would run it.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BASIS_LEGEND } from "@/lib/analyze/scan";
import { ingredientCatalog } from "@/lib/analyze/catalog";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// ---- mock the ONE module that would otherwise touch a real Supabase project ----
let configured = false;
let session: { user: { email: string; id: string }; access_token: string } | null = null;
const authStateCallbacks: Array<(event: string, session: unknown) => void> = [];

function emitAuthState(event: string) {
  authStateCallbacks.forEach((cb) => cb(event, session));
}

const fakeSupabaseClient = {
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
      authStateCallbacks.push(cb);
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    signOut: async () => {
      session = null;
      emitAuthState("SIGNED_OUT");
    },
    signInWithIdToken: async () => ({ data: { session }, error: null }),
  },
};

vi.mock("@/lib/auth/supabase-browser", () => ({
  authFullyConfigured: () => configured,
  supabaseUrl: () => (configured ? "https://example.supabase.co" : null),
  supabaseAnonKey: () => (configured ? "anon-key" : null),
  googleClientId: () => (configured ? "test-client-id.apps.googleusercontent.com" : null),
  getSupabaseBrowserClient: () => (configured ? fakeSupabaseClient : null),
}));

const { ScanFlow } = await import("@/components/scan-flow");

const catalog = ingredientCatalog();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  configured = false;
  session = null;
  authStateCallbacks.length = 0;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ScanFlow, { catalog }));
  });
  return container;
}

function stubAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "ScanAnalysisV1",
    analyzed_at: new Date().toISOString(),
    source: "photo",
    status: "ingredient_not_supported",
    ingredient_label_text: "Ashwagandha",
    supported_ingredients: ["creatine"],
    basis_legend: BASIS_LEGEND,
    run_id: "run-abc-123",
    meta: { timing_s: 1, stages: {}, provider_configured: true, models: { vision: null, text: null }, prompt_versions: {} },
    ...overrides,
  };
}

async function stageAndSubmit(el: HTMLElement) {
  const input = el.querySelector<HTMLInputElement>("#scan-file");
  if (!input) throw new Error("no upload input rendered");
  const file = new File(["fake-bytes"], "label.png", { type: "image/png" });
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const scanButton = Array.from(el.querySelectorAll("button")).find((b) => /scan this label/i.test(b.textContent ?? ""));
  if (!scanButton) throw new Error("no 'Scan this label' button rendered after staging a file");
  await act(async () => {
    scanButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("sign-in card — env gating", () => {
  it("never renders when sign-in is not configured (the default: local/CI)", async () => {
    configured = false;
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve))),
    );
    const el = await mount();
    await stageAndSubmit(el);
    // Busy now — the card must not appear during loading either.
    expect(el.querySelector('[data-testid="save-result-card"]')).toBeNull();

    await act(async () => {
      resolveFetch(new Response(JSON.stringify(stubAnalysis()), { status: 200 }));
      await Promise.resolve();
    });
    expect(el.querySelector('[data-testid="save-result-card"]')).toBeNull();
    // Results render unlocked, with no blur/inert.
    const result = el.querySelector(".la-result");
    expect(result).not.toBeNull();
    expect(result?.hasAttribute("inert")).toBe(false);
    expect(result?.classList.contains("sc-locked")).toBe(false);
  });

  it("shows the card while loading, and locks the finished result, when configured and signed out", async () => {
    configured = true;
    session = null;
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/api/scan/claim")) return Promise.resolve(new Response(JSON.stringify({ status: "claimed" }), { status: 200 }));
        return new Promise<Response>((resolve) => (resolveFetch = resolve));
      }),
    );
    const el = await mount();
    await stageAndSubmit(el);
    expect(el.querySelector('[data-testid="save-result-card"]')).not.toBeNull();

    await act(async () => {
      resolveFetch(new Response(JSON.stringify(stubAnalysis()), { status: 200 }));
      await Promise.resolve();
    });

    // The card is still shown, now above a LOCKED, inert copy of the result.
    expect(el.querySelector('[data-testid="save-result-card"]')).not.toBeNull();
    const result = el.querySelector(".la-result");
    expect(result).not.toBeNull();
    expect(result?.classList.contains("sc-locked")).toBe(true);
    expect(result?.hasAttribute("inert")).toBe(true);
    // No "signed in as" line while signed out.
    expect(el.textContent).not.toMatch(/signed in as/i);
  });

  it("does not lock results, and shows no card, once a session exists", async () => {
    configured = true;
    session = { user: { email: "person@example.com", id: "user-1" }, access_token: "token-xyz" };
    let resolveFetch!: (r: Response) => void;
    const claimCalls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url).includes("/api/scan/claim")) {
          claimCalls.push({ url: String(url), headers: (init?.headers as Record<string, string>) ?? {}, body: String(init?.body) });
          return Promise.resolve(new Response(JSON.stringify({ status: "claimed" }), { status: 200 }));
        }
        return new Promise<Response>((resolve) => (resolveFetch = resolve));
      }),
    );
    const el = await mount();
    await stageAndSubmit(el);
    // Already signed in — no save-result card even while loading.
    expect(el.querySelector('[data-testid="save-result-card"]')).toBeNull();

    await act(async () => {
      resolveFetch(new Response(JSON.stringify(stubAnalysis()), { status: 200 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const result = el.querySelector(".la-result");
    expect(result?.classList.contains("sc-locked")).toBe(false);
    expect(result?.hasAttribute("inert")).toBe(false);
    expect(el.textContent).toMatch(/signed in as/i);
    expect(el.textContent).toContain("person@example.com");

    // The claim call fired with the bearer token and the run id from the result.
    expect(claimCalls.length).toBeGreaterThan(0);
    expect(claimCalls[0].headers.Authorization).toBe("Bearer token-xyz");
    expect(JSON.parse(claimCalls[0].body)).toEqual({ run_id: "run-abc-123" });
  });

  it("sign-out clears the session and re-locks a still-visible result", async () => {
    configured = true;
    session = { user: { email: "person@example.com", id: "user-1" }, access_token: "token-xyz" };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/api/scan/claim")) return Promise.resolve(new Response(JSON.stringify({ status: "claimed" }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify(stubAnalysis()), { status: 200 }));
      }),
    );
    const el = await mount();
    await stageAndSubmit(el);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(el.textContent).toMatch(/signed in as/i);

    const signOutBtn = Array.from(el.querySelectorAll("button")).find((b) => /sign out/i.test(b.textContent ?? ""));
    expect(signOutBtn).toBeTruthy();
    await act(async () => {
      signOutBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(el.querySelector(".la-result")?.classList.contains("sc-locked")).toBe(true);
  });
});
