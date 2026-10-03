/*
 * The /scan landing: persisted EN/LT switch, the loading view's honesty, the
 * sign-in hint under the control row, and the large-upload shrink before POST
 * (Ignas PR3 merge, 2026-10-03). Real <ScanFlow> in jsdom; fetch is a stub and
 * no model is ever called. The result report stays English -- only landing and
 * loading copy are translated in this pass.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";

import { USER_A, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { Harness, analysis, click, jsonResponse, record, settle, stagePhoto, buttonByText, type RecordedCall } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());

const { fakeAuth } = await import("./helpers/fake-supabase-browser");
const { ScanFlow } = await import("@/components/scan-flow");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");
const { UPLOAD_REENCODE_BYTES } = await import("@/lib/camera/capture");

const catalog = ingredientCatalog();
const harness = new Harness();
const mountFlow = () => harness.mount(createElement(ScanFlow, { catalog }));

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  fakeAuth.reset();
  resetGoogleSignInForTests();
  installFakeGoogle();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
});

afterEach(async () => {
  vi.useRealTimers();
  await harness.cleanup();
  removeFakeGoogle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function hangingFetch() {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      calls.push(record(url, init));
      return new Promise<Response>(() => {});
    }),
  );
  return calls;
}

const langButton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>(".sc-lang");

describe("EN/LT switch", () => {
  it("is English by default, switches to Lithuanian, and remembers the choice per browser", async () => {
    const el = await mountFlow();
    expect(el.querySelector("#scan-title")?.textContent).toBe("Does your Supplement actually work?");
    expect(langButton(el)?.textContent).toBe("LT");

    await click(langButton(el));
    expect(el.querySelector("#scan-title")?.textContent).toBe("Ar tavo papildas tikrai veikia?");
    expect(el.textContent).toContain("Nuskenuok ir pamatyk.");
    expect(langButton(el)?.textContent).toBe("EN");
    expect(store["bsproof.lang"]).toBe("lt");
    // The control row and framing hint are translated too.
    expect(el.textContent).toContain("Įkelti");
    expect(el.textContent).toContain("Užpildyk rėmelį");

    await harness.cleanup();
    const again = await mountFlow();
    await settle();
    expect(again.querySelector("#scan-title")?.textContent).toBe("Ar tavo papildas tikrai veikia?");

    await click(langButton(again));
    expect(store["bsproof.lang"]).toBe("en");
    expect(again.querySelector("#scan-title")?.textContent).toBe("Does your Supplement actually work?");
  });

  it("falls back to English when storage is blocked, and the staged step is translated", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const el = await mountFlow();
    expect(el.querySelector("#scan-title")?.textContent).toBe("Does your Supplement actually work?");
    await click(langButton(el)); // still switches for this visit
    await stagePhoto(el);
    expect(el.textContent).toContain("Skenuoti šią etiketę");
    expect(el.textContent).toContain("Fotografuoti iš naujo");
  });

  it("is not drawn for a saved scan opened from History", async () => {
    const el = await harness.mount(createElement(ScanFlow, { catalog, initialResult: { analysis: analysis() as never } }));
    expect(el.querySelector(".sc-topbar")).toBeNull();
  });
});

describe("loading view claims no backend progress", () => {
  it("lists what the check covers, with no determinate bar, no done ticks and no current step, however long it takes", async () => {
    hangingFetch();
    const el = await mountFlow();
    await stagePhoto(el);
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout"] });
    await click(buttonByText(el, /scan this label/i));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(el.querySelector(".sc-progress")).not.toBeNull();
    expect(el.querySelectorAll(".sc-stages li").length).toBe(5);
    expect(el.querySelector(".sc-stages .is-done")).toBeNull();
    expect(el.querySelector(".sc-stages .is-current")).toBeNull();
    expect(el.querySelector("[aria-current]")).toBeNull();
    expect(el.querySelector(".sc-progress-bar.is-steps")).toBeNull();
    expect(el.querySelector(".sc-progress-bar span")?.getAttribute("style")).toBeNull();
    expect(el.textContent).toContain("This check covers");
  });

  it("is translated while loading", async () => {
    store["bsproof.lang"] = "lt";
    hangingFetch();
    const el = await mountFlow();
    await settle();
    await stagePhoto(el);
    await click(buttonByText(el, /skenuoti šią etiketę/i));
    expect(el.textContent).toContain("Tikriname tavo papildą");
    expect(el.textContent).toContain("Šis patikrinimas apima");
    expect(el.textContent).toContain("Skaitome etiketę");
  });
});

describe("signed out: auth gate is preserved on the new landing", () => {
  it("shows the sign-in hint (translated), and no request is made until a session exists", async () => {
    fakeAuth.configured = true;
    const calls = hangingFetch();
    const el = await mountFlow();
    await settle();
    expect(el.querySelector('[data-testid="signin-hint"]')?.textContent).toContain("Results need a Google sign-in");
    await click(langButton(el));
    expect(el.querySelector('[data-testid="signin-hint"]')?.textContent).toContain("prisijungti su Google");
    await stagePhoto(el);
    expect(el.querySelector('[data-testid="signin-card"]')).not.toBeNull();
    expect(buttonByText(el, /scan this label|skenuoti/i)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("signed in: the account initial shows, and the bearer token is sent", async () => {
    fakeAuth.configured = true;
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    const calls = hangingFetch();
    const el = await mountFlow();
    await settle();
    expect(el.querySelector(".sc-avatar")?.textContent).toBe(USER_A.email.charAt(0).toUpperCase());
    await stagePhoto(el);
    await click(buttonByText(el, /scan this label/i));
    await settle();
    expect(calls[0].headers.Authorization).toBe("Bearer tok-a");
  });
});

describe("large uploads are shrunk below the Vercel body limit before POST", () => {
  it("re-encodes a photo over the threshold once and posts the smaller JPEG", async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const drawn: Array<[number, number]> = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => drawn.push([w, h]) } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) => cb(new Blob(["small"], { type: "image/jpeg" })));
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown, init?: RequestInit) => {
        calls.push(record(url, init));
        return Promise.resolve(jsonResponse(analysis()));
      }),
    );
    const el = await mountFlow();
    const input = el.querySelector<HTMLInputElement>("#scan-file")!;
    const big = new File([new Uint8Array(UPLOAD_REENCODE_BYTES + 1)], "huge.png", { type: "image/png" });
    await act(async () => {
      Object.defineProperty(input, "files", { value: [big], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(buttonByText(el, /scan this label/i));
    await settle();
    expect(calls).toHaveLength(1);
    const sent = (calls[0].body as FormData).get("image") as File;
    expect(sent.type).toBe("image/jpeg");
    expect(sent.size).toBeLessThan(big.size);
    expect(drawn[0]).toEqual([2560, 1920]);
  });

  it("passes a small photo through untouched", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const calls: RecordedCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown, init?: RequestInit) => {
        calls.push(record(url, init));
        return Promise.resolve(jsonResponse(analysis()));
      }),
    );
    const el = await mountFlow();
    await stagePhoto(el);
    await click(buttonByText(el, /scan this label/i));
    await settle();
    expect(decode).not.toHaveBeenCalled();
    expect(((calls[0].body as FormData).get("image") as File).name).toBe("label.png");
  });
});
