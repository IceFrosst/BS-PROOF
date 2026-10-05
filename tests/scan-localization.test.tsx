/*
 * EN/LT localization of the whole /scan workspace in jsdom, with ZERO live model
 * calls: the translator endpoint is a fake that returns "LT» <original>".
 *
 * What is pinned:
 *   - one persisted choice (bsproof.lang) drives the landing, the camera copy, the
 *     tabs, the footer/skip link, the sign-in card, History and a replayed scan
 *   - LIVE-ONLY (2026-10-05): a result is the read-label facts plus the live research
 *     screen, in Lithuanian, with the SAME numbers as English. The old retained-card /
 *     model-recall / company prose is not drawn, so the translator is asked for nothing;
 *     the live research narrative itself is never machine-translated (it stays original,
 *     tagged English: tests/scan-research-panel.test.tsx and the e2e spec pin that)
 *   - errors, refusals, auth notices and manual-form validation are reworded live
 *   - English never calls the translator
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ingredientCatalog } from "@/lib/analyze/catalog";
import { retainedAuditForProduct } from "@/lib/evidence-ledger/retained-audits";
import { LANG_KEY, resetLangMemory, writeLang } from "@/lib/i18n/locale";
import { resetTranslationsForTests } from "@/lib/i18n/translate-client";

import { USER_A, fakeAuth, installFakeGoogle, removeFakeGoogle, sessionFor } from "./helpers/fake-supabase-browser";
import { installLocalStorage } from "./helpers/local-storage";
import { Harness, click, jsonResponse, record, settle } from "./helpers/scan-ui";

vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());
let pathname = "/scan";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { ScanFlow } = await import("@/components/scan-flow");
const { ScanWorkspace } = await import("@/components/scan-workspace");
const { SiteFooter, SiteHeader } = await import("@/components/site-shell");
const { useScanLang } = await import("@/lib/i18n/locale");
const { resetGoogleSignInForTests } = await import("@/components/google-sign-in");

const rich = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const catalog = ingredientCatalog();
const harness = new Harness();

function creatineAudit() {
  return retainedAuditForProduct({ ingredient: "creatine", form: "creatine_monohydrate", compoundDoseMg: 4000, servingsPerDay: 1, isMultiIngredient: false, actives: [{ name: "Creatine Monohydrate", compoundDoseMg: 4000 }], otherActives: [] })!;
}
const withAudit = () => ({ ...structuredClone(rich), ledger_audit: creatineAudit() });

let translateBodies: string[][] = [];
type Mode = "ok" | "down";
function stubApi(opts: { scan?: unknown; translate?: Mode; history?: unknown } = {}) {
  translateBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const call = record(url, init);
      if (call.url === "/api/scan/translate") {
        const texts = (JSON.parse(String(init?.body)) as { texts: string[] }).texts;
        translateBodies.push(texts);
        if (opts.translate === "down") return jsonResponse({ status: "translator_unavailable", translations: texts.map(() => null) }, 503);
        return jsonResponse({ status: "ok", translations: texts.map((t) => `LT» ${t}`) });
      }
      if (call.url === "/api/scan") return jsonResponse(opts.scan ?? rich);
      if (call.url === "/api/scan/history") return jsonResponse({ status: "ok", runs: opts.history ?? [], next_cursor: null });
      if (call.url.startsWith("/api/scan/history/")) return jsonResponse({ status: "ok", run_id: call.url.split("/").pop(), analysis: opts.scan ?? rich });
      throw new Error(`unexpected request ${call.method} ${call.url}`);
    }),
  );
}

beforeEach(() => {
  installLocalStorage();
  resetLangMemory();
  resetTranslationsForTests();
  fakeAuth.reset();
  resetGoogleSignInForTests();
  installFakeGoogle();
  pathname = "/scan";
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
});
afterEach(async () => {
  await harness.cleanup();
  removeFakeGoogle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.lang = "";
});

async function stage(el: HTMLElement) {
  const input = el.querySelector<HTMLInputElement>("#scan-file")!;
  await act(async () => {
    Object.defineProperty(input, "files", { value: [new File(["bytes"], "label.png", { type: "image/png" })], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function scanPhoto(el: HTMLElement) {
  await stage(el);
  await click(el.querySelector("button.la-analyze"));
  await settle();
}
const mountFlow = () => harness.mount(createElement(ScanFlow, { catalog }));
const mountWorkspace = () => harness.mount(createElement(ScanWorkspace, { catalog }));
const numbers = (el: Element) => (el.textContent ?? "").match(/\d+(?:[.,]\d+)?/g)?.sort() ?? [];
const text = (el: Element | null) => el?.textContent ?? "";

describe("the persisted choice", () => {
  it("English is the default and never calls the translator", async () => {
    stubApi();
    const el = await mountFlow();
    expect(text(el.querySelector("h1"))).toBe("Does your Supplement actually work?");
    await scanPhoto(el);
    expect(text(el)).toContain("Live research is off on this deployment");
    expect(text(el)).not.toContain("Is your dose the dose that worked?");
    expect(translateBodies).toEqual([]);
  });

  it("workspace: toggle switches EN<->LT, persists under bsproof.lang, sets <html lang>, and rewords tabs + camera", async () => {
    stubApi();
    const el = await mountWorkspace();
    const toggle = () => el.querySelector<HTMLButtonElement>('[data-testid="lang-toggle"]')!;
    expect(toggle().getAttribute("aria-label")).toBe("Lietuviškai");
    await click(toggle());
    expect(window.localStorage.getItem(LANG_KEY)).toBe("lt");
    expect(document.documentElement.lang).toBe("lt");
    expect(Array.from(el.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(["Skenuoti", "Istorija"]);
    expect(el.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Skenavimo erdvė");
    expect(text(el.querySelector("h1"))).toBe("Ar tavo papildas tikrai veikia?");
    expect(el.querySelector('button.sc-search-cta[aria-label="Ieškoti papildo"]')).not.toBeNull();
    expect(el.querySelector('label.sc-icon-btn[aria-label="Įkelti nuotrauką"]')).not.toBeNull();
    expect(text(el.querySelector(".sc-subline"))).toBe("Nuskenuok ir pamatyk.");
    expect(el.querySelector('.sc-viewfinder')?.getAttribute("aria-label")).toBe("Gyvas kameros vaizdas");
    expect(toggle().getAttribute("aria-label")).toBe("English");
    await click(toggle());
    expect(window.localStorage.getItem(LANG_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(text(el.querySelector("h1"))).toBe("Does your Supplement actually work?");
  });

  it("exactly one language switch is visible, the workspace top bar, on both tabs", async () => {
    stubApi();
    const el = await mountWorkspace();
    const toggles = () => Array.from(el.querySelectorAll<HTMLElement>('[data-testid="lang-toggle"]')).filter((t) => !t.closest("[hidden]"));
    expect(toggles().map((t) => t.className)).toEqual(["sc-lang"]);
    await click(Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'))[1]);
    expect(toggles().map((t) => t.className)).toEqual(["sc-lang"]);
    await click(toggles()[0]);
    expect(window.localStorage.getItem(LANG_KEY)).toBe("lt");
    expect(Array.from(el.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(["Skenuoti", "Istorija"]);
    await click(Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'))[0]);
    expect(toggles().map((t) => t.className)).toEqual(["sc-lang"]);
    expect(text(el.querySelector("h1"))).toBe("Ar tavo papildas tikrai veikia?");
  });

  it("a stored lt is honoured on load", async () => {
    window.localStorage.setItem(LANG_KEY, "lt");
    stubApi();
    const el = await mountWorkspace();
    await settle();
    expect(text(el.querySelector("h1"))).toBe("Ar tavo papildas tikrai veikia?");
  });

  it("footer, skip link and nav follow the choice on /scan only", async () => {
    writeLang("lt");
    const host = await harness.mount(createElement("div", null, createElement(SiteHeader), createElement(SiteFooter)));
    expect(text(host.querySelector(".skip-link"))).toBe("Pereiti prie pagrindinio turinio");
    expect(text(host.querySelector("footer"))).toContain("Balai nėra medicininis patarimas");
    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe("Pagrindinė naršymo juosta");
    pathname = "/methodology";
    await harness.rerender(createElement("div", null, createElement(SiteHeader), createElement(SiteFooter)));
    expect(text(host.querySelector(".skip-link"))).toBe("Skip to main content");
    expect(text(host.querySelector("footer"))).toContain("Scores are not medical advice");
  });
});

describe("shared components outside /scan", () => {
  function Probe() {
    return createElement("p", null, useScanLang());
  }

  it("useScanLang follows the choice on /scan (and with no router), and is English on /tester, /methodology and /", async () => {
    writeLang("lt");
    const host = await harness.mount(createElement(Probe));
    expect(text(host)).toBe("lt");
    for (const outside of ["/tester", "/methodology", "/"]) {
      pathname = outside;
      await harness.rerender(createElement(Probe));
      expect(text(host), outside).toBe("en");
    }
    pathname = "/scan";
    await harness.rerender(createElement(Probe));
    expect(text(host)).toBe("lt");
  });
});

describe("a Lithuanian result", () => {
  async function renderBoth(body: unknown) {
    stubApi({ scan: body });
    const en = await mountFlow();
    await scanPhoto(en);
    const enFacts = numbers(en.querySelector('[data-testid="read-facts"]')!);
    await harness.cleanup();

    writeLang("lt");
    stubApi({ scan: body });
    const lt = await mountFlow();
    await scanPhoto(lt);
    await settle(6);
    return { lt, ltResult: lt.querySelector(".scan-lab-result")!, enFacts };
  }

  it("shows the read-label facts and the live research screen in Lithuanian, with the same numbers as English and no retained card", async () => {
    const { lt, ltResult, enFacts } = await renderBoth(withAudit());
    expect(numbers(ltResult.querySelector('[data-testid="read-facts"]')!)).toEqual(enFacts);
    expect(text(ltResult.querySelector('[data-testid="read-facts"]'))).toContain("Etiketės duomenys");
    expect(text(ltResult.querySelector('[data-testid="read-facts"]'))).toContain("Porcijos per dieną");
    expect(text(ltResult.querySelector(".scan-badge-label"))).toBe("Kaip atspausdinta");
    // the live research screen, in Lithuanian (here sign-in is not configured, so research is off and NOTHING takes its place)
    expect(text(ltResult.querySelector(".sc-research h2"))).toBe("Šiam skenavimui tiesioginis tyrimas nepasiekiamas");
    expect(text(ltResult)).toContain("Šiame diegime tiesioginis tyrimas išjungtas");
    expect(text(ltResult)).toContain("Šiame puslapyje rodomas tik tiesioginis tyrimas");
    expect(text(ltResult.querySelector(".sc-research-tags"))).toBe("EksperimentinisBe įvertinimo");
    expect(text(ltResult)).toContain("Techninė informacija");
    expect(text(lt)).toContain("Skenuoti kitą");
    // none of the retired retained / recall / company card
    expect(text(ltResult)).not.toMatch(/Bendras balas|Ar tavo dozė — ta, kuri veikė|Finansavimas ir nepriklausomumas|Įrodymų balas|Išsaugotas auditas/);
    expect(ltResult.querySelector(".ab-tabs, .scan-legend, .scan-section, .scan-lab-validity")).toBeNull();
  });

  it("asks the translator for nothing, in Lithuanian too: no retained prose, company text or recall is drawn to translate", async () => {
    await renderBoth(withAudit());
    expect(translateBodies).toEqual([]);
  });

  it("flips between English and Lithuanian live with no request and no machine-translated text", async () => {
    const { lt } = await renderBoth(withAudit());
    expect(text(lt)).toContain("tiesioginis tyrimas");
    await act(async () => writeLang("en"));
    await settle();
    expect(text(lt)).toContain("Live research is not available for this scan");
    expect(text(lt)).not.toContain("LT» ");
    expect(translateBodies).toEqual([]);
  });
});

describe("states around the result, in Lithuanian", () => {
  it("an unreachable analyzer, then a live switch back to English, rewords the SAME error", async () => {
    writeLang("lt");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const el = await mountFlow();
    await scanPhoto(el);
    expect(text(el.querySelector(".sc-error"))).toBe("Nepavyko nuskenuoti.Nepavyko pasiekti analizatoriaus: Error: offline");
    await act(async () => writeLang("en"));
    expect(text(el.querySelector(".sc-error"))).toBe("Could not scan that.Could not reach the analyzer: Error: offline");
  });

  it("server refusals, a formerly unsupported ingredient and a non-label photo have Lithuanian words", async () => {
    writeLang("lt");
    stubApi({ scan: { status: "scan_history_required_unavailable", error: "SCAN_HISTORY_REQUIRED is on" } });
    let el = await mountFlow();
    await scanPhoto(el);
    expect(text(el.querySelector(".sc-error"))).toContain("Skenavimas sustabdytas");
    expect(text(el.querySelector(".sc-error"))).not.toContain("SCAN_HISTORY_REQUIRED");
    await harness.cleanup();

    stubApi({ scan: { ...rich, status: "not_a_supplement_label", product: undefined, evidence: undefined, label: undefined, ledger_audit: undefined } });
    el = await mountFlow();
    await scanPhoto(el);
    expect(text(el)).toContain("Atrodo, tai nėra papildo etiketė.");
    await harness.cleanup();

    stubApi({ scan: { ...rich, status: "ingredient_not_supported", ingredient_label_text: "Ashwagandha", supported_ingredients: ["creatine"], product: undefined, evidence: undefined, label: undefined, ledger_audit: undefined, queue: { queued: true } } });
    el = await mountFlow();
    await scanPhoto(el);
    // live-only: an ingredient the old evidence dictionary lacks is no longer a "nothing was run" card;
    // it is a scan like any other and its live research screen speaks (off here, so it says so, in Lithuanian)
    expect(text(el)).not.toMatch(/dar nėra įrodymų žodyne|Tai ne žemas balas|Tavo užklausa užfiksuota|Kol kas apima/);
    expect(text(el.querySelector(".sc-research h2"))).toBe("Šiam skenavimui tiesioginis tyrimas nepasiekiamas");
    expect(text(el)).toContain("Šiame diegime tiesioginis tyrimas išjungtas");
  });

  it("an oversize photo is refused with the size and the limit in Lithuanian", async () => {
    writeLang("lt");
    stubApi();
    const el = await mountFlow();
    const input = el.querySelector<HTMLInputElement>("#scan-file")!;
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 13_400_000 });
    await act(async () => {
      Object.defineProperty(input, "files", { value: [big], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(text(el.querySelector(".sc-error"))).toContain("Šis paveikslėlis yra 13.4 MB. Riba — 12 MB.");
  });

  it("the manual search sheet: labels, help, validation and the typed result are Lithuanian", async () => {
    writeLang("lt");
    stubApi({ scan: { ...structuredClone(rich), source: "manual", label: undefined, input: { basis: "user_input", ingredient: "creatine", ingredient_label: "Creatine", form: "creatine_monohydrate", form_label: "Creatine monohydrate", dose_per_serving: { value: 5, unit: "g", mg: 5000 }, servings_per_day: 2 } } });
    const el = await mountFlow();
    await click(el.querySelector(".sc-search-cta"));
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(text(dialog.querySelector("h2"))).toBe("Ieškoti papildo");
    expect(dialog.querySelector(".sc-sheet-close")?.getAttribute("aria-label")).toBe("Uždaryti paiešką");
    expect(text(dialog.querySelector(".sc-search-lede"))).toContain("rezultatas bus pažymėtas kaip įvestas");
    expect(text(dialog.querySelector("label"))).toBe("Veiklioji medžiaga");
    const combo = dialog.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    expect(combo.getAttribute("placeholder")).toBe("pvz., magnis, kreatinas, vitaminas D");
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(combo, "creatine"); combo.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(text(dialog)).toContain("Tiksli „");
    const select = dialog.querySelector<HTMLSelectElement>("select")!;
    await act(async () => { select.value = "creatine_monohydrate"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(text(dialog)).toContain("Dozė porcijoje (nebūtina)");
    // an invalid dose -> the shared validator's message, reworded
    const amount = Array.from(dialog.querySelectorAll<HTMLInputElement>("input")).find((i) => i.getAttribute("placeholder") === "pvz., 400")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(amount, "-3"); amount.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => dialog.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(text(dialog.querySelector(".sc-problem"))).toBe("Dozė turi būti teigiamas skaičius.");
    await act(async () => writeLang("en"));
    expect(text(dialog.querySelector(".sc-problem"))).toBe("The dose must be a positive number.");
    await act(async () => writeLang("lt"));
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(amount, "5"); amount.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => dialog.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle(6);
    expect(text(el)).toContain("Ką įvedei");
    expect(text(el)).toContain("2 porcijos per dieną");
  });
});

describe("sign-in and History (Google configured)", () => {
  beforeEach(() => {
    fakeAuth.configured = true;
  });

  it("the sign-in card, its notice and the Google statuses are Lithuanian", async () => {
    writeLang("lt");
    stubApi();
    const el = await mountFlow();
    await settle();
    await stage(el);
    const card = el.querySelector('[data-testid="signin-card"]')!;
    expect(text(card.querySelector("strong"))).toBe("Prisijunk, kad nuskenuotum šią etiketę");
    expect(text(card)).toContain("Nuotrauka lieka tavo įrenginyje, kol nuskenuoji.");
    expect(text(card.querySelector(".sc-google-status"))).toBeDefined();
    expect(text(el.querySelector(".sc-secondary-row"))).toContain("Fotografuoti iš naujo");
  });

  it.each(["en", "lt"] as const)("a replayed legacy scan draws no compatibility / active-ingredient chips in %s and asks for nothing", async (lang) => {
    writeLang(lang);
    fakeAuth.configured = false;
    const legacy = structuredClone(rich);
    legacy.compatibility.actives = [{
      printed: "Magnesium glycinate",
      canonical: "magnesium",
      compound_dose_mg: 200,
      form_text: "glycinate",
    }];
    stubApi({ scan: legacy });

    const el = await harness.mount(createElement(ScanFlow, {
      catalog,
      initialResult: { analysis: legacy as never, runId: "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878", savedAt: null },
    }));
    await settle(6);
    expect(el.querySelector('[data-testid="replay-note"]')).not.toBeNull();
    expect(el.querySelector(".scan-actives, .scan-chip, .scan-section")).toBeNull();
    expect(text(el)).not.toMatch(/200 mg (compound per serving|junginio porcijoje)|Magnesium glycinate/);
    const calls = (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }).mock.calls;
    expect(calls).toHaveLength(0);
  });

  it("History: signed out -> Lithuanian card; signed in -> list, empty state and a replayed scan, dated in Lithuanian, no re-run", async () => {
    writeLang("lt");
    // signed out
    stubApi();
    let el = await mountWorkspace();
    await settle();
    await click(Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => /istorija/i.test(t.textContent ?? ""))!);
    await settle();
    expect(text(el.querySelectorAll('[role="tabpanel"]')[1])).toContain("Prisijunk, kad pamatytum istoriją");
    await harness.cleanup();

    // signed in, empty list
    fakeAuth.session = sessionFor(USER_A, "tok-a");
    stubApi({ history: [] });
    el = await mountWorkspace();
    await settle();
    await click(Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => /istorija/i.test(t.textContent ?? ""))!);
    await settle();
    let panel = el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1];
    expect(text(panel.querySelector(".sw-title"))).toBe("Tavo skenavimai");
    expect(text(panel.querySelector('[data-testid="history-empty"]'))).toContain("Išsaugotų skenavimų dar nėra.");
    expect(text(panel)).toContain("Prisijungta kaip");
    await harness.cleanup();

    // signed in, one run, replayed
    const run = { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-09-20T10:30:00Z", source: "photo", status: "ok", product_name: "Creatine Pro 5000" };
    stubApi({ history: [run, { ...run, id: "22222222-2222-4222-8222-222222222222", source: "manual", status: "ingredient_not_supported", product_name: null }], scan: withAudit() });
    el = await mountWorkspace();
    await settle();
    await click(Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => /istorija/i.test(t.textContent ?? ""))!);
    await settle();
    panel = el.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1];
    const rows = Array.from(panel.querySelectorAll<HTMLButtonElement>("button.sw-run"));
    expect(text(rows[0])).toContain("Creatine Pro 5000");
    expect(text(rows[0])).toContain("Nuotraukos skenavimas");
    expect(text(rows[1])).toContain("Įvestas papildas");
    expect(text(rows[1])).toContain("medžiaga nepalaikoma");
    await click(rows[0]);
    await settle(6);
    const note = panel.querySelector('[data-testid="replay-note"]')!;
    expect(text(note)).toContain("Išsaugotas skenavimas,");
    expect(text(note)).toContain("Nieko nebuvo paleista iš naujo");
    expect(panel.querySelector('[aria-label="Atgal į istoriją"]')).not.toBeNull();
    // live-only: no stored evidence card; "live research not requested" and a deliberate button, in Lithuanian
    expect(text(panel)).not.toContain("Bendras balas");
    expect(text(panel.querySelector(".sc-research h2"))).toBe("Tiesioginis tyrimas neužsakytas");
    expect(text(panel.querySelector(".sc-research-btn"))).toBe("Užsakyti šio skenavimo tiesioginį tyrimą");
    // the replay used the stored record: no scan POST, and opening it requested no research (stubApi throws on any other request)
    const calls = (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }).mock.calls;
    expect(calls.some(([url, init]) => String(url) === "/api/scan" && init?.method === "POST")).toBe(false);
    expect(calls.some(([url]) => String(url).startsWith("/api/scan/research"))).toBe(false);
    expect(translateBodies).toEqual([]);
  });
});
