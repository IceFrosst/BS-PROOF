/*
 * The /scan workspace: two tabs, Scan (default) and History, over one page
 * (2026-09-23). Drives the real <ScanWorkspace> in jsdom.
 *
 * Pinned here: the WAI-ARIA tab pattern (roles, selected state, roving
 * tabindex, Arrow/Home/End, labelled panels), that the Scan tab keeps its state
 * while History is open, that exactly one h1 is exposed at a time, that History
 * says plainly when it is unavailable, and that the Scan tab is still the
 * approved camera-first page (the h1, the search pill, the upload fallback).
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";

import { USER_A, fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { Harness, buttonByText, click, jsonResponse, keydown, record, settle, stagePhoto } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { ScanWorkspace } = await import("@/components/scan-workspace");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const catalog = ingredientCatalog();
const harness = new Harness();
const mountWorkspace = () => harness.mount(createElement(ScanWorkspace, { catalog }));

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

const tabs = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const tab = (el: HTMLElement, name: RegExp) => tabs(el).find((t) => name.test(t.textContent ?? ""))!;
const visiblePanels = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[role="tabpanel"]')).filter((p) => !p.hidden);

describe("tabs", () => {
  it("offers Scan (selected by default) and History as an accessible tablist with labelled panels", async () => {
    const el = await mountWorkspace();
    const list = el.querySelector('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Scan workspace");
    expect(tabs(el).map((t) => t.textContent)).toEqual(["Scan", "History"]);
    expect(tabs(el).map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs(el).map((t) => t.tabIndex)).toEqual([0, -1]);

    for (const t of tabs(el)) {
      const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(t.id);
    }
    const [scanPanel, historyPanel] = Array.from(el.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    expect(scanPanel.hidden).toBe(false);
    expect(historyPanel.hidden).toBe(true);
  });

  it("keeps the approved camera-first Scan page: the single h1, the search pill and the upload fallback", async () => {
    const el = await mountWorkspace();
    const h1s = el.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].id).toBe("scan-title");
    expect(buttonByText(el, /search your supplement/i)).toBeDefined();
    expect(el.querySelector("#scan-file")).not.toBeNull();
    expect(el.querySelector("#scan-capture")).not.toBeNull();
  });

  it("the redesigned landing keeps the Scan | History tabs and a sign-out control reachable when signed in", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "ok", runs: [], next_cursor: null })));
    const el = await mountWorkspace();
    await settle();
    expect(tabs(el).map((t) => t.textContent)).toEqual(["Scan", "History"]);
    expect(el.querySelector(".sc-avatar")?.getAttribute("aria-label")).toBe(`Signed in as ${USER_A.email}`);
    const signOut = buttonByText(visiblePanels(el)[0], /^sign out$/i);
    expect(signOut).toBeDefined();
    await click(signOut);
    await settle();
    expect(fakeAuth.signOutCalls).toBe(1);
    expect(tabs(el).map((t) => t.textContent)).toEqual(["Scan", "History"]);
    expect(el.querySelector(".sc-avatar")).toBeNull();
  });

  it("click selects a tab and swaps the visible panel; exactly one h1 is exposed per tab", async () => {
    const el = await mountWorkspace();
    await click(tab(el, /history/i));
    expect(tab(el, /history/i).getAttribute("aria-selected")).toBe("true");
    expect(tab(el, /scan/i).getAttribute("aria-selected")).toBe("false");
    expect(tab(el, /history/i).tabIndex).toBe(0);
    expect(tab(el, /^scan$/i).tabIndex).toBe(-1);
    expect(visiblePanels(el)).toHaveLength(1);
    expect(visiblePanels(el)[0].querySelectorAll("h1")).toHaveLength(1);
    expect(visiblePanels(el)[0].querySelector("h1")?.textContent).toBe("Your scans");

    await click(tab(el, /^scan$/i));
    expect(visiblePanels(el)[0].querySelectorAll("h1")).toHaveLength(1);
    expect(visiblePanels(el)[0].querySelector("h1")?.id).toBe("scan-title");
  });

  it("arrow keys, Home and End move focus and selection between the tabs, wrapping at the ends", async () => {
    const el = await mountWorkspace();
    const scan = tab(el, /^scan$/i);
    const history = tab(el, /history/i);
    scan.focus();

    await keydown(scan, "ArrowRight");
    expect(history.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(history);

    await keydown(history, "ArrowRight"); // wraps
    expect(scan.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(scan);

    await keydown(scan, "ArrowLeft"); // wraps backwards
    expect(history.getAttribute("aria-selected")).toBe("true");

    await keydown(history, "Home");
    expect(scan.getAttribute("aria-selected")).toBe("true");
    await keydown(scan, "End");
    expect(history.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(history);
  });

  it("the Scan tab keeps its staged photo while History is open", async () => {
    const el = await mountWorkspace();
    await stagePhoto(el);
    expect(el.querySelector('img[alt="The label you staged for analysis"]')).not.toBeNull();

    await click(tab(el, /history/i));
    const scanPanel = el.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(scanPanel.hidden).toBe(true);
    // Still mounted (state intact), just not shown.
    expect(scanPanel.querySelector('img[alt="The label you staged for analysis"]')).not.toBeNull();

    await click(tab(el, /^scan$/i));
    expect(scanPanel.hidden).toBe(false);
    expect(el.querySelector('img[alt="The label you staged for analysis"]')).not.toBeNull();
  });
});

describe("History where it cannot work", () => {
  it("unconfigured deployment: says plainly that history needs sign-in, and asks for nothing", async () => {
    fakeAuth.configured = false;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const el = await mountWorkspace();
    await click(tab(el, /history/i));
    await settle();
    const note = el.querySelector('[data-testid="history-unconfigured"]');
    expect(note?.textContent).toMatch(/not available/i);
    expect(note?.textContent).toMatch(/google sign-in/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("configured and signed out: the sign-in card, and no request", async () => {
    fakeAuth.configured = true;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const el = await mountWorkspace();
    await settle();
    await click(tab(el, /history/i));
    await settle();
    const card = visiblePanels(el)[0].querySelector('[data-testid="signin-card"]');
    expect(card?.textContent).toMatch(/sign in to see your history/i);
    expect(visiblePanels(el)[0].querySelector('[data-testid="google-signin-button"]')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("configured and the session still loading: neither the card nor the list, and no request", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A);
    fakeAuth.holdSession();
    const fetchSpy = vi.fn(async (url: unknown, init?: RequestInit) => {
      record(url, init);
      return jsonResponse({ status: "ok", runs: [], next_cursor: null });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const el = await mountWorkspace();
    await click(tab(el, /history/i));
    expect(visiblePanels(el)[0].textContent).toMatch(/checking your sign-in/i);
    expect(visiblePanels(el)[0].querySelector('[data-testid="signin-card"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    fakeAuth.releaseSession();
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
