/* /scan result invariants. Evidence grading is not active (2026-10-15): no result shows a grade. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanFlow } from "@/components/scan/scan-flow";
import { ingredientCatalog } from "@/lib/analyze/catalog";

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean | undefined; }
const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const catalog = ingredientCatalog();
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove(); root = null; container = null;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function mount() {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(ScanFlow, { catalog })));
  return container;
}
function mockFetch(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })));
}
async function photo(el: HTMLElement, body: unknown = fixture) {
  mockFetch(body);
  const input = el.querySelector<HTMLInputElement>("#scan-file")!;
  await act(async () => {
    Object.defineProperty(input, "files", { value: [new File(["bytes"], "label.png", { type: "image/png" })], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => el.querySelector<HTMLButtonElement>("button.la-analyze")?.click());
  await act(async () => { await Promise.resolve(); });
}

describe("/scan result state", () => {
  it("delivers the exact failed-scan reason with recovery chrome", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const el = await mount();
    const input = el.querySelector<HTMLInputElement>("#scan-file")!;
    await act(async () => { Object.defineProperty(input, "files", { value: [new File(["bytes"], "label.png", { type: "image/png" })], configurable: true }); input.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => el.querySelector<HTMLButtonElement>("button.la-analyze")?.click());
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector(".sc-error")?.textContent).toContain("Could not reach the analyzer: Error: offline");
    expect(el.querySelector(".sc-again")).not.toBeNull();
  });

  it("says grading is not active, on the landing screen and on the result, and shows no grade", async () => {
    const el = await mount();
    expect(el.querySelector(".sc-grading-notice")?.textContent).toContain("Evidence grades are not active yet");
    await photo(el);
    expect(el.querySelector(".scan-result .sc-grading-notice")).not.toBeNull();
    expect(el.querySelector(".ab-tabs, .ab-general-score, .ab-bars")).toBeNull();
    expect(el.textContent).not.toMatch(/\d+\/100|probably works|\d\/3\b/);
  });

  it("collapses capture chrome after a result, moves focus, and offers Scan another", async () => {
    const el = await mount(); await photo(el);
    expect(el.querySelector(".scan-result")).not.toBeNull();
    expect(el.querySelector(".sc-viewfinder")).toBeNull();
    expect(Array.from(el.querySelectorAll("button")).filter((b) => /scan another/i.test(b.textContent ?? "")).length).toBeGreaterThanOrEqual(1);
    expect(document.activeElement?.classList.contains("sc-scanned")).toBe(true);
  });

  it("restores quiet identity facts for typed entries without read confidence or Read from", async () => {
    const manual = { ...fixture, source: "manual", label: undefined, input: { ingredient: "creatine", ingredient_label: "Creatine", form: "creatine_monohydrate", form_label: "Creatine monohydrate", dose_per_serving: { value: 5, unit: "g", mg: 5000 }, servings_per_day: 1, basis: "user_input" }, company: { ...fixture.company, status: "no_brand_on_label", basis_used: [] } };
    const el = await mount();
    await act(async () => el.querySelector<HTMLButtonElement>(".sc-search-cta")!.click());
    const combo = el.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(combo, "creatine"); combo.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    const select = el.querySelector<HTMLSelectElement>("select")!;
    await act(async () => { select.value = "creatine_monohydrate"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    mockFetch(manual);
    await act(async () => el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => { await Promise.resolve(); });
    expect(el.querySelector(".scan-lab-disclosure")?.textContent).toContain("Servings per day");
    expect(el.textContent).not.toContain("Read confidence");
    expect(el.textContent).not.toContain("Read from:");
  });

  it("keeps warning titles inside the panel and leaves technical details reachable", async () => {
    const el = await mount(); await photo(el);
    const warnings = el.querySelector(".ab-warnings");
    expect(warnings).not.toBeNull();
    expect(warnings?.closest(".ab-card")).not.toBeNull();
    for (const title of ["Multi ingredient product", "Funding & independence", "Publication bias", "MLM / direct-selling business model"]) expect(el.textContent).toContain(title);
    const technical = el.querySelector(".sc-technical") as HTMLDetailsElement;
    expect(technical).not.toBeNull(); expect(technical.textContent).toContain("Text model");
  });

  it("uses shared A/B styling once and the real photo hero with a fallback jar", () => {
    const globals = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    expect(globals).toContain('@import "./styles/ab.css"');
    expect(readFileSync(join(process.cwd(), "app", "styles", "scan-ledger-result.css"), "utf8")).not.toContain(".ab-photo-hero{");
  });

  it("replaces a failed photo element with the exact jar fallback", async () => {
    const el = await mount(); await photo(el);
    const image = el.querySelector<HTMLImageElement>(".scan-lab-photo")!;
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(el.querySelector(".scan-lab-photo")).toBeNull();
    expect(el.querySelector(".ab-photo-hero > .ab-jar")).not.toBeNull();
  });


});
