/* Production scan result invariants retargeted to the shared A/B primitives. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanFlow } from "@/components/scan-flow";
import { ingredientCatalog } from "@/lib/analyze/catalog";
import { retainedAuditForProduct } from "@/lib/evidence-ledger/retained-audits";

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
function audit() {
  return retainedAuditForProduct({ ingredient: "creatine", form: "creatine_monohydrate", compoundDoseMg: 4000, servingsPerDay: 1, isMultiIngredient: false, actives: [{ name: "Creatine Monohydrate", compoundDoseMg: 4000 }], otherActives: [] });
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

  it("places validity before the first number and keeps audit provenance, native scales, and links", async () => {
    const retained = audit(); expect(retained).not.toBeNull();
    const el = await mount(); await photo(el, { ...structuredClone(fixture), ledger_audit: retained });
    const validity = el.querySelector(".scan-lab-validity")!;
    const firstNumber = el.querySelector(".ab-general-score, .ab-number")!;
    expect(validity.compareDocumentPosition(firstNumber) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(validity.textContent).toContain("audit-v0.2");
    const first = el.querySelector<HTMLButtonElement>(".ab-bars.outcomes li > button")!;
    await act(async () => first.click());
    const effect = el.querySelector("[data-row-id=effect]")!;
    expect(effect.textContent).toMatch(/[−+]?\d\/3/);
    expect(effect.textContent).not.toContain("/4");
    await act(async () => effect.querySelector("button")!.click());
    expect(effect.querySelector("a[href^='https://']")).not.toBeNull();
  });

  it("keeps tab roving and panel labelling valid for punctuation in outcome keys", async () => {
    const retained = audit()!;
    retained.audit.outcomes[0].name = "Endurance / recovery (acute),";
    const el = await mount(); await photo(el, { ...structuredClone(fixture), ledger_audit: retained });
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>(".ab-tabs [role=tab]"));
    const panel = el.querySelector<HTMLElement>("[role=tabpanel]")!;
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1].id);
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)).toBe(tabs[1]);
    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await act(async () => tabs[tabs.length - 1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
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
    expect(technical).not.toBeNull(); expect(technical.textContent).toContain("How these numbers were produced");
    expect(technical.querySelector('a[href="/methodology"]')).not.toBeNull();
  });

  it("uses shared A/B styling once and the real photo hero with a fallback jar", () => {
    const globals = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    expect(globals).toContain('@import "./design-lab/ab/ab.css"');
    expect(readFileSync(join(process.cwd(), "app", "scan-lab-result.css"), "utf8")).not.toContain(".ab-photo-hero{");
  });

  it("uses the shared A/B primitives and styles the selected tab", async () => {
    const retained = audit(); const el = await mount(); await photo(el, { ...structuredClone(fixture), ledger_audit: retained });
    expect(el.querySelector(".ab-photo-hero")).not.toBeNull();
    expect(el.querySelector(".ab-card")).not.toBeNull();
    const selected = el.querySelector(".ab-tabs [role=tab][aria-selected=true]")!;
    expect(selected).not.toBeNull();
    expect(selected.textContent).toContain("Outcomes");
  });

  it("keeps unmatched outcomes honest while retaining their four reachable dimensions", async () => {
    const el = await mount(); await photo(el);
    expect(el.querySelector(".ab-general-score")?.textContent).toBe("—");
    const first = el.querySelector<HTMLButtonElement>(".ab-bars.outcomes li > button")!;
    await act(async () => first.click());
    expect(el.querySelectorAll(".ab-bars:not(.outcomes) li")).toHaveLength(4);
    expect(el.textContent).not.toMatch(/\d+\/100|probably works/);
  });

  it("replaces a failed photo element with the exact jar fallback", async () => {
    const el = await mount(); await photo(el);
    const image = el.querySelector<HTMLImageElement>(".scan-lab-photo")!;
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(el.querySelector(".scan-lab-photo")).toBeNull();
    expect(el.querySelector(".ab-photo-hero > .ab-jar")).not.toBeNull();
  });

  it("marks the active outcome tab with aria-selected and keeps the selected pill dark", async () => {
    const el = await mount(); await photo(el);
    const tabs = el.querySelectorAll<HTMLButtonElement>(".ab-tabs [role=tab]");
    await act(async () => tabs[1].click());
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("tabindex")).toBe("0");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
  });

  it("places an outcome warning bundle between the headline and its dimensions", async () => {
    const el = await mount(); await photo(el);
    await act(async () => el.querySelector<HTMLButtonElement>(".ab-bars.outcomes li > button")!.click());
    const headline = el.querySelector(".ab-headline")!;
    const warnings = el.querySelector(".ab-warnings")!;
    const bars = el.querySelector(".ab-bars:not(.outcomes)")!;
    expect(headline.compareDocumentPosition(warnings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warnings.compareDocumentPosition(bars) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /* The reference card draws one hairline BETWEEN the "Outcomes" heading and
     the list (`.ab-listhead` closes at the heading). Wrapping the list inside
     the same element moved that rule to the foot of the last row. */
  it("closes the list head at the heading so its rule divides heading from list", async () => {
    const el = await mount(); await photo(el);
    const head = el.querySelector(".ab-listhead")!;
    expect(head.querySelector(".ab-general")).not.toBeNull();
    expect(head.querySelector("h2")?.textContent).toBe("Outcomes");
    expect(head.querySelector(".ab-bars.outcomes")).toBeNull();
    const list = el.querySelector(".ab-bars.outcomes")!;
    expect(head.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("labels the panel only through the actual selected tab", async () => {
    const el = await mount(); await photo(el);
    const panel = el.querySelector<HTMLElement>("[role=tabpanel]")!;
    expect(panel.getAttribute("aria-label")).toBeNull();
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)).toBe(el.querySelector("[role=tab][aria-selected=true]"));
  });
});
