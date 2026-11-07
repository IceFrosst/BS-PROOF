/*
 * The browser side of display translation (lib/i18n/translate-client.tsx), driven
 * through a tiny probe component and a fake /api/scan/translate. ZERO model calls.
 *
 * Pinned:
 *   - a SUCCESSFUL translation is never silent: a standing "machine-translated,
 *     not checked" note with a way back to the English original
 *   - a string over the per-item limit is never sent (it would 400 the batch), cannot
 *     spin an empty-batch loop, and does not poison the strings around it
 *   - batches are small enough for the model's answer budget
 *   - failures recorded while signed out are forgotten when the owner changes, a stale
 *     answer for the previous owner is dropped, and a 401 is retried once with a refreshed token
 *   - the language toggle still works when storage can be read but not written
 */
import { act, createElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LANG_KEY, resetLangMemory, useLang, writeLang } from "@/lib/i18n/locale";
import { TRANSLATE_MAX_ITEM_CHARS } from "@/lib/i18n/translate-limits";
import { TranslationProvider, TranslationStatus, resetTranslationsForTests, useTr, type TranslateHeaders } from "@/lib/i18n/translate-client";

import { installLocalStorage } from "./helpers/local-storage";
import { Harness, click, jsonResponse, settle } from "./helpers/scan-ui";

const harness = new Harness();

interface Sent {
  texts: string[];
  auth: string | null;
}
let sent: Sent[] = [];

function stubTranslate(answer: (call: Sent, n: number) => Response | Promise<Response> = (call) => jsonResponse({ status: "ok", translations: call.texts.map((t) => `LT» ${t}`) })) {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const call: Sent = { texts: (JSON.parse(String(init?.body)) as { texts: string[] }).texts, auth: headers.Authorization ?? null };
      sent.push(call);
      return answer(call, sent.length);
    }),
  );
}

function Probe({ texts }: { texts: string[] }) {
  const tr = useTr();
  return createElement("div", null, createElement(TranslationStatus), ...texts.map((t, i) => createElement("p", { key: i, "data-i": i }, tr(t))));
}

const tokenHeaders: TranslateHeaders = async () => ({ Authorization: "Bearer tok" });
const mountProbe = (texts: string[], getHeaders: TranslateHeaders = tokenHeaders, ownerKey: string | null = null) =>
  harness.mount(provide(texts, getHeaders, ownerKey));
function provide(texts: string[], getHeaders: TranslateHeaders, ownerKey: string | null): ReactElement {
  return createElement(TranslationProvider, { getHeaders, ownerKey }, createElement(Probe, { texts }));
}
const para = (el: HTMLElement, i: number) => el.querySelector(`p[data-i="${i}"]`)?.textContent ?? "";
const q = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  installLocalStorage();
  resetLangMemory();
  resetTranslationsForTests();
});
afterEach(async () => {
  await harness.cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a successful machine translation is always labelled, with the original reachable", () => {
  it("shows the standing note (Lithuanian) once a translation is on screen, and the button returns to the English original", async () => {
    writeLang("lt");
    stubTranslate();
    const el = await mountProbe(["The creatine summary sentence."]);
    await settle();
    expect(para(el, 0)).toBe("LT» The creatine summary sentence.");
    const note = q(el, "translate-machine-note")!;
    expect(note.textContent).toContain("išversta automatiškai");
    expect(note.textContent).toContain("netikrinta");
    expect(q(el, "translate-status")).toBeNull(); // nothing in flight, nothing failed
    await click(q(el, "translate-show-original"));
    await settle();
    expect(window.localStorage.getItem(LANG_KEY)).toBe("en");
    expect(para(el, 0)).toBe("The creatine summary sentence.");
    expect(q(el, "translate-machine-note")).toBeNull();
  });

  it("is there on the very first render when the translation is already cached (a History replay), with no new request and no state set in render", async () => {
    writeLang("lt");
    stubTranslate();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const el = await mountProbe(["First sentence here."]);
    await settle();
    expect(sent).toHaveLength(1);
    await harness.cleanup();
    // a second mount (the replay) reuses the session map: shown translated AND labelled at once
    const again = await mountProbe(["First sentence here."]);
    expect(para(again, 0)).toBe("LT» First sentence here.");
    expect(q(again, "translate-machine-note")).not.toBeNull();
    await settle();
    expect(sent).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled(); // React would log "Cannot update a component while rendering"
    void el;
  });

  it("English shows no note and never calls the translator; nothing translated yet shows none either", async () => {
    stubTranslate();
    const el = await mountProbe(["Some English prose here."]);
    await settle();
    expect(sent).toHaveLength(0);
    expect(q(el, "translate-machine-note")).toBeNull();
  });
});

describe("queue safety", () => {
  it("never sends a string over the per-item limit, never spins, and still translates its neighbours", async () => {
    writeLang("lt");
    stubTranslate();
    const long = `${"Long sentence about muscles. ".repeat(200)}`.slice(0, TRANSLATE_MAX_ITEM_CHARS + 500);
    const el = await mountProbe([long, "Short sentence here.", "Another short one."]);
    await settle(10);
    expect(sent.flatMap((c) => c.texts)).toEqual(["Short sentence here.", "Another short one."]);
    expect(para(el, 0)).toBe(long); // English, kept
    expect(para(el, 1)).toBe("LT» Short sentence here.");
    expect(q(el, "translate-status")?.textContent).toBe("Dalis teksto rodoma originalia anglų kalba.");
    const calls = sent.length;
    await settle(10);
    expect(sent.length).toBe(calls); // no empty-batch / retry loop
  });

  it("a lone over-long string produces no request at all, and says so", async () => {
    writeLang("lt");
    stubTranslate();
    const el = await mountProbe(["x words ".repeat(700)]);
    await settle(10);
    expect(sent).toHaveLength(0);
    expect(q(el, "translate-status")).not.toBeNull();
  });

  it("keeps batches small: <= 12 strings and <= 4,000 characters per request, every string answered", async () => {
    writeLang("lt");
    stubTranslate();
    const texts = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} ${"padding words ".repeat(35)}`);
    const el = await mountProbe(texts);
    await settle(30);
    expect(sent.length).toBeGreaterThan(3);
    for (const call of sent) {
      expect(call.texts.length).toBeLessThanOrEqual(12);
      expect(call.texts.reduce((n, t) => n + t.length, 0)).toBeLessThanOrEqual(4_000);
    }
    expect(sent.flatMap((c) => c.texts).sort()).toEqual([...texts].sort());
    for (let i = 0; i < texts.length; i += 1) expect(para(el, i)).toBe(`LT» ${texts[i]}`);
  });
});

describe("owner changes and expired tokens", () => {
  it("failures recorded while signed out do not stick: signing in retries and translates", async () => {
    writeLang("lt");
    stubTranslate();
    let token: string | null = null;
    const getHeaders: TranslateHeaders = async () => (token ? { Authorization: `Bearer ${token}` } : null);
    const el = await mountProbe(["Needs a signed in user."], getHeaders, null);
    await settle(6);
    expect(sent).toHaveLength(0);
    expect(para(el, 0)).toBe("Needs a signed in user.");
    expect(q(el, "translate-status")?.textContent).toContain("originalia");
    token = "tok-a";
    await harness.rerender(provide(["Needs a signed in user."], getHeaders, "user-a"));
    await settle(6);
    expect(sent.map((c) => c.auth)).toEqual(["Bearer tok-a"]);
    expect(para(el, 0)).toBe("LT» Needs a signed in user.");
    expect(q(el, "translate-status")).toBeNull();
  });

  it("drops what the previous owner fetched, and an answer that arrives for the previous owner is never shown", async () => {
    writeLang("lt");
    let release: ((r: Response) => void) | null = null;
    stubTranslate((call, n) => (n === 1 ? new Promise<Response>((resolve) => (release = resolve)) : jsonResponse({ status: "ok", translations: call.texts.map((t) => `B» ${t}`) })));
    const el = await mountProbe(["Private prose of owner A."], tokenHeaders, "user-a");
    await settle(4);
    expect(sent).toHaveLength(1);
    await harness.rerender(provide(["Private prose of owner A."], tokenHeaders, "user-b"));
    await act(async () => release?.(jsonResponse({ status: "ok", translations: ["A» stale"] })));
    await settle(8);
    expect(el.textContent).not.toContain("A» stale");
    expect(para(el, 0)).toBe("B» Private prose of owner A.");
    expect(sent.map((c) => c.texts[0])).toHaveLength(2);
    // and switching owner again forgets B's translation too
    await harness.rerender(provide(["Private prose of owner A."], tokenHeaders, null));
    expect(para(el, 0)).toBe("Private prose of owner A.");
  });

  it("a 401 is retried once with a refreshed token; a refresh that yields the same token (or none) stays English", async () => {
    writeLang("lt");
    stubTranslate((call) => (call.auth === "Bearer fresh" ? jsonResponse({ status: "ok", translations: call.texts.map((t) => `LT» ${t}`) }) : jsonResponse({ status: "unauthorized" }, 401)));
    const refreshed: Array<boolean | undefined> = [];
    const getHeaders: TranslateHeaders = async (options) => {
      refreshed.push(options?.forceRefresh);
      return { Authorization: options?.forceRefresh ? "Bearer fresh" : "Bearer stale" };
    };
    const el = await mountProbe(["Token expired mid session."], getHeaders, "user-a");
    await settle(6);
    expect(sent.map((c) => c.auth)).toEqual(["Bearer stale", "Bearer fresh"]);
    expect(refreshed).toEqual([undefined, true]);
    expect(para(el, 0)).toBe("LT» Token expired mid session.");
    await harness.cleanup();

    resetTranslationsForTests();
    stubTranslate(() => jsonResponse({ status: "unauthorized" }, 401));
    const same = await mountProbe(["Token expired mid session."], async () => ({ Authorization: "Bearer stale" }), "user-a");
    await settle(6);
    expect(sent).toHaveLength(1); // no second try with an identical token
    expect(para(same, 0)).toBe("Token expired mid session.");
    expect(q(same, "translate-status")?.textContent).toContain("originalia");
  });
});

describe("language toggle when storage can be read but not written", () => {
  function Toggle() {
    const { lang, toggleLang } = useLang();
    return createElement("button", { type: "button", "data-testid": "t", onClick: toggleLang }, lang);
  }
  it("still switches EN -> LT -> EN for the visit, and storage wins again once it can be written", async () => {
    const real = installLocalStorage();
    const readOnly: Storage = Object.assign(Object.create(real), {
      getItem: (k: string) => real.getItem(k),
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    Object.defineProperty(window, "localStorage", { value: readOnly, configurable: true, writable: true });
    const el = await harness.mount(createElement(Toggle));
    expect(q(el, "t")?.textContent).toBe("en");
    await click(q(el, "t"));
    expect(q(el, "t")?.textContent).toBe("lt");
    await click(q(el, "t"));
    expect(q(el, "t")?.textContent).toBe("en");
    await click(q(el, "t"));
    expect(q(el, "t")?.textContent).toBe("lt");
    // storage comes back: the write goes through and is the truth
    Object.defineProperty(window, "localStorage", { value: real, configurable: true, writable: true });
    await act(async () => writeLang("en"));
    expect(real.getItem(LANG_KEY)).toBe("en");
    expect(q(el, "t")?.textContent).toBe("en");
  });
});
