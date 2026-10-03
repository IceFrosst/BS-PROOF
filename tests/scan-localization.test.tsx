/*
 * EN/LT localization of the whole /scan workspace in jsdom, with ZERO live model
 * calls: the translator endpoint is a fake that returns "LT» <original>".
 *
 * What is pinned:
 *   - one persisted choice (bsproof.lang) drives the landing, the camera copy, the
 *     tabs, the footer/skip link, the sign-in card, History and a replayed scan
 *   - a result in Lithuanian shows the SAME numbers as in English: scores,
 *     scales, doses, ranges, closeness, counts (a token-for-token comparison of
 *     every number on the card), and the A/B four-axis structure
 *   - model-authored / retained prose is requested through /api/scan/translate and
 *     shown translated; product names, raw FDA records, source quotes and the
 *     audit's "exact wording" stay original; nothing numeric/enum is sent
 *   - a failed translator leaves English on screen with a visible note
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
    expect(text(el)).toContain("Is your dose the dose that worked?");
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

  it("exactly one language switch is visible: the PR3 top bar on Scan, the workspace's on History", async () => {
    stubApi();
    const el = await mountWorkspace();
    const toggles = () => Array.from(el.querySelectorAll<HTMLElement>('[data-testid="lang-toggle"]')).filter((t) => !t.closest("[hidden]"));
    expect(toggles().map((t) => t.className)).toEqual(["sc-lang"]);
    await click(Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'))[1]);
    expect(toggles().map((t) => t.className)).toEqual(["sw-lang"]);
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
    const enResult = en.querySelector(".scan-lab-result")!;
    const enNumbers = numbers(enResult);
    const enScores = Array.from(enResult.querySelectorAll(".ab-general-score, .ab-bar-pts")).map((n) => n.textContent);
    const enDimensions = Array.from(enResult.querySelectorAll(".ab-bars.outcomes li")).length;
    await harness.cleanup();

    writeLang("lt");
    stubApi({ scan: body });
    const lt = await mountFlow();
    await scanPhoto(lt);
    await settle(6);
    return { lt, ltResult: lt.querySelector(".scan-lab-result")!, enNumbers, enScores, enDimensions };
  }

  it("shows the same numbers, scores and structure as English, with Lithuanian labels", async () => {
    const { lt, ltResult, enNumbers, enScores, enDimensions } = await renderBoth(withAudit());
    // every number on the card, token for token (mock translation keeps digits)
    expect(numbers(ltResult)).toEqual(enNumbers);
    expect(Array.from(ltResult.querySelectorAll(".ab-general-score, .ab-bar-pts")).map((n) => n.textContent)).toEqual(enScores);
    expect(ltResult.querySelectorAll(".ab-bars.outcomes li")).toHaveLength(enDimensions);
    // labels
    expect(text(ltResult)).toContain("Bendras balas");
    expect(text(ltResult)).toContain("Ar tavo dozė — ta, kuri veikė?");
    expect(text(ltResult)).toContain("Ar forma ir mišinys atlaiko patikrą?");
    expect(text(ltResult)).toContain("Kas tai gamina ir kas apie tai užfiksuota?");
    expect(text(ltResult)).toContain("Techninė informacija");
    expect(text(lt.querySelector(".ab-tabs button"))).toBe("Rezultatai");
    expect(text(lt)).toContain("Skenuoti kitą");
    // the retained-audit stamp: identifiers original, dose phrase localized, label localized
    expect(text(ltResult.querySelector(".scan-lab-validity"))).toContain("Išsaugotas auditas · nepatikrintas iš naujo");
    expect(text(ltResult.querySelector(".scan-lab-validity"))).toContain("audit-v0.2");
    expect(text(ltResult.querySelector(".scan-lab-validity"))).toContain("Creatine monohydrate");
    // basis badges
    expect(text(ltResult.querySelector(".scan-badge-label"))).toBe("Kaip atspausdinta");
    expect(text(ltResult.querySelector(".scan-legend"))).toContain("Kaip skaityti šaltinių ženklelius");
    // disclosures (fixed templates), caveat title + body, warning count
    expect(text(ltResult)).toContain("Finansavimas ir nepriklausomumas");
    expect(text(ltResult)).toContain("Publikavimo šališkumas");
    expect(text(ltResult)).toContain("Keleto veikliųjų medžiagų produktas");
    expect(text(ltResult)).toContain("Įrodymų balas yra tik apie creatine");
    expect(text(ltResult)).toMatch(/\d+ įrodymų įspėjim/);
    // dose reading re-rendered from the stored numbers
    expect(text(ltResult.querySelector(".scan-dose"))).toContain("patenka į intervalą, kuriame tyrimuose rasta nauda (2.86 g–2.86 g)");
    expect(text(ltResult.querySelector(".scan-note"))).toContain("Vertinta pagal paros dozę");
  });

  it("opens an outcome with the four axes in Lithuanian; the score arithmetic and the audit's exact wording are untouched", async () => {
    const { lt, ltResult } = await renderBoth(withAudit());
    const first = ltResult.querySelector<HTMLButtonElement>(".ab-bars.outcomes li > button")!;
    await click(first);
    await settle(6);
    const rows = Array.from(lt.querySelectorAll("[data-row-id]"));
    expect(rows.map((r) => r.getAttribute("data-row-id"))).toEqual(["effect", "evidence", "form", "dose"]);
    expect(rows.map((r) => text(r.querySelector(".ab-bar-name")))).toEqual(["Poveikis", "Įrodymai", "Forma", "Dozė"]);
    // scales are the scorer's own: -3..+3 for effect, /4 for the rest
    expect(text(rows[0].querySelector(".ab-bar-pts"))).toMatch(/[−+]?\d\/3/);
    for (const r of rows.slice(1)) expect(text(r.querySelector(".ab-bar-pts"))).toMatch(/^(—|\d\/4)$/);
    expect(text(rows[0].querySelector(".ab-bar-pts"))).not.toContain("/4");
    // open the effect row: labels in LT, plain summary translated, exact wording ORIGINAL
    await click(rows[0].querySelector("button"));
    await settle(6);
    const detail = document.getElementById(rows[0].querySelector("button")!.getAttribute("aria-controls")!)!;
    expect(text(detail)).toContain("Rasta");
    expect(text(detail)).toContain("Santrauka paprastai");
    expect(text(detail)).toContain("LT» ");
    const exact = detail.querySelector(".sc-audit-exact")!;
    expect(text(exact.querySelector("summary"))).toBe("Tikslios audito formuluotės");
    const audit = creatineAudit().audit.outcomes[0];
    expect(text(exact)).toContain(audit.detail.effect.found);
    expect(text(exact)).not.toContain("LT» ");
    // sources list label localized; its identifiers stay original
    expect(text(detail.querySelector(".sc-audit-sources b"))).toBe("Šiam rezultatui atidaryti šaltiniai");
  });

  it("asks the translator only for prose, and never for names, raw FDA fields, quotes, numbers or enums", async () => {
    await renderBoth(withAudit());
    const sent = translateBodies.flat();
    expect(sent.length).toBeGreaterThan(3);
    expect(sent).toContain(rich.company.profile.data.summary);
    expect(sent).toContain(rich.literature_warnings.data.funding_independence.basis);
    for (const raw of ["Nordic Labs", "Nordic Labs OÜ", "Creatine Pro 5000, 500 g tub", "Undeclared allergen (milk)", "Class II", "Informed Sport", "F-1234-2024", "private", "claimed", "medium", "recall"]) {
      expect(sent, raw).not.toContain(raw);
    }
    for (const t of sent) expect(t).toMatch(/[A-Za-z]{3}/);
    // each distinct string is requested once (cache), and batches stay within the endpoint's limit
    expect(new Set(sent).size).toBe(sent.length);
    for (const batch of translateBodies) expect(batch.length).toBeLessThanOrEqual(24);
  });

  it("translated prose appears in place; original product names, recall record and label quotes stay original", async () => {
    const { ltResult } = await renderBoth(withAudit());
    const profile = text(ltResult.querySelector(".scan-profile"));
    expect(profile).toContain("LT» " + rich.company.profile.data.summary);
    const registry = text(ltResult.querySelector(".scan-recalls"));
    expect(registry).toContain("Creatine Pro 5000, 500 g tub");
    expect(registry).toContain("Undeclared allergen (milk)");
    expect(registry).toContain("Nordic Labs OÜ");
    expect(text(ltResult)).toContain("Informed Sport");
    expect(text(ltResult)).toContain("Nordic Labs");
    // the header keeps the product name as read
    expect(text(ltResult.closest(".sc-result-wrap")?.querySelector(".ab-title strong"))).toBe(rich.label.product_name ?? text(ltResult.closest(".sc-result-wrap")?.querySelector(".ab-title strong")));
  });

  it("flips back to English live and shows the original text again, with no new request", async () => {
    const { lt } = await renderBoth(withAudit());
    expect(text(lt)).toContain("LT» ");
    const before = translateBodies.length;
    await act(async () => writeLang("en"));
    await settle();
    expect(text(lt)).not.toContain("LT» ");
    expect(text(lt)).toContain("Is your dose the dose that worked?");
    expect(translateBodies.length).toBe(before);
  });

  it("a failed translator leaves the English on screen and says so", async () => {
    writeLang("lt");
    stubApi({ scan: withAudit(), translate: "down" });
    const el = await mountFlow();
    await scanPhoto(el);
    await settle(6);
    expect(text(el)).toContain(rich.company.profile.data.summary);
    expect(text(el)).not.toContain("LT» ");
    expect(text(el.querySelector('[data-testid="translate-status"]'))).toBe("Dalis teksto rodoma originalia anglų kalba.");
    // the deterministic Lithuanian does not depend on the translator
    expect(text(el)).toContain("Ar tavo dozė — ta, kuri veikė?");
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

  it("server refusals, an unsupported ingredient and a non-label photo have Lithuanian words", async () => {
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
    expect(text(el)).toContain("Ashwagandha dar nėra įrodymų žodyne.");
    expect(text(el)).toContain("Tai ne žemas balas — tai duomenų nebuvimas.");
    expect(text(el)).toContain("Tavo užklausa užfiksuota.");
    expect(text(el)).toContain("Kol kas apima: creatine");
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
    expect(text(panel)).toContain("Bendras balas");
    // the replay used the stored record: no scan POST
    const calls = (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }).mock.calls;
    expect(calls.some(([url, init]) => String(url) === "/api/scan" && init?.method === "POST")).toBe(false);
    // translation calls carried the bearer token
    expect(translateBodies.length).toBeGreaterThan(0);
  });
});
