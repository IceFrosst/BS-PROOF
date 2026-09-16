/*
 * THE MLM / DIRECT-SELLING DISCLOSURE, RENDERED (not just computed).
 *
 * tests/company-business-model.test.ts pins businessModelDisclosure() as a
 * pure function; this file drives the real <ScanFlow> through its manual
 * search path against a mocked `fetch` and asserts what actually lands in the
 * DOM: the warning box uses the SAME class as every other disclosure on this
 * page (`la-alert la-alert-warn`), says "MLM / direct-selling business
 * model", never "pyramid scheme" or "illegal", and a no_evidence/unknown
 * profile renders no warning box at all -- just an honest neutral line.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ScanFlow } from "@/components/scan-flow";
import type { BusinessModel } from "@/lib/analyze/business-model";
import { ingredientCatalog } from "@/lib/analyze/catalog";
import type { CompanySection } from "@/lib/analyze/company";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const catalog = ingredientCatalog();

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalFetch: typeof fetch;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  if (originalFetch) global.fetch = originalFetch;
});

function baseCompany(business_model: BusinessModel): CompanySection {
  return {
    status: "ok",
    basis_used: ["label", "model_prior"],
    brand: "Acme Wellness",
    manufacturer: "Acme Wellness LLC",
    country_of_origin: null,
    certifications_printed: [],
    registry: { status: "no_matches", queried: ["Acme Wellness"], recalls: [], reason: null, source: "openFDA food enforcement reports", note: "" },
    profile: {
      status: "ok",
      reason: null,
      basis: "model_prior",
      prompt_version: "company-v1.1",
      model: "fake-text",
      elapsed_s: 0.2,
      data: {
        brand: "Acme Wellness",
        known: true,
        summary: "A supplement brand.",
        founded_year: null,
        headquarters_country: null,
        parent_company: null,
        ownership_type: "unknown",
        third_party_testing: { program: null, status: "unknown" },
        transparency: { coa_published: "unknown" },
        regulatory_history: [],
        reputation_notes: [],
        business_model,
        confidence: "medium",
        caveats: [],
      },
    },
  };
}

function fixture(business_model: BusinessModel) {
  return {
    schema_version: "ScanAnalysisV1",
    analyzed_at: new Date().toISOString(),
    source: "manual",
    status: "scored",
    input: {
      basis: "user_input",
      ingredient: "creatine",
      ingredient_label: "Creatine",
      form: "creatine_monohydrate",
      form_label: "Monohydrate",
      dose_per_serving: null,
      servings_per_day: null,
    },
    basis_legend: {
      evidence_run: { label: "Evidence run", means: "x", rank: 1 },
      registry: { label: "Public registry", means: "x", rank: 2 },
      curated_table: { label: "Curated & cited", means: "x", rank: 3 },
      label: { label: "As printed", means: "x", rank: 4 },
      user_input: { label: "Typed by you", means: "x", rank: 5 },
      model_prior: { label: "Model knowledge", means: "x", rank: 6 },
    },
    company: baseCompany(business_model),
    meta: { timing_s: 0.1, stages: {}, provider_configured: true, models: { vision: null, text: "fake-text" }, prompt_versions: { company: "company-v1.1" } },
  };
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ScanFlow, { catalog }));
  });
  return container;
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(el: HTMLElement, keyName: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }));
  });
}

async function searchCreatineMonohydrate(el: HTMLElement) {
  await act(async () => {
    el.querySelector<HTMLButtonElement>(".sc-search-toggle")?.click();
  });
  const input = el.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!input) throw new Error("no combobox rendered");
  await type(input, "creatine");
  await key(input, "ArrowDown");
  await key(input, "Enter");
  const select = el.querySelector<HTMLSelectElement>("select");
  await act(async () => {
    if (select) {
      select.value = "creatine_monohydrate";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await act(async () => {
    el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function mockFetchOnce(body: unknown) {
  originalFetch = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
}

describe("MLM disclosure rendered in the company section", () => {
  it("confirmed_mlm renders the SAME warning box class as every other /scan disclosure, with honest wording", async () => {
    mockFetchOnce(fixture({ status: "confirmed_mlm", basis: "recruits distributors who earn on downline sales", confidence: "high" }));
    const el = await mount();
    await searchCreatineMonohydrate(el);

    const warning = el.querySelector(".la-alert.la-alert-warn[aria-label='Business model disclosure']");
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain("MLM / direct-selling business model");
    expect(warning?.textContent).toContain("Model knowledge — unverified");
    expect(warning?.textContent).toContain("does not affect the evidence score");
    expect(warning?.textContent?.toLowerCase()).not.toMatch(/pyramid scheme|illegal|scam|fraud/);

    // Same class already used by the caveats/validity warnings elsewhere on this page.
    const otherWarnings = el.querySelectorAll(".la-alert-warn");
    expect(otherWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("suspected_mlm also warns; no_evidence and unknown render an honest neutral line, no warning box", async () => {
    mockFetchOnce(fixture({ status: "suspected_mlm", basis: "recruitment-based compensation language", confidence: "low" }));
    const suspected = await mount();
    await searchCreatineMonohydrate(suspected);
    expect(suspected.querySelector(".la-alert.la-alert-warn[aria-label='Business model disclosure']")).toBeTruthy();
    await act(async () => root?.unmount());
    container?.remove();

    mockFetchOnce(fixture({ status: "no_evidence", basis: "sold only through retail", confidence: "medium" }));
    const noEvidence = await mount();
    await searchCreatineMonohydrate(noEvidence);
    expect(noEvidence.querySelector(".la-alert.la-alert-warn[aria-label='Business model disclosure']")).toBeNull();
    expect(noEvidence.textContent).toMatch(/No evidence of an MLM/);
    await act(async () => root?.unmount());
    container?.remove();

    mockFetchOnce(fixture({ status: "unknown", basis: "", confidence: "low" }));
    const unknown = await mount();
    await searchCreatineMonohydrate(unknown);
    expect(unknown.querySelector(".la-alert.la-alert-warn[aria-label='Business model disclosure']")).toBeNull();
    expect(unknown.textContent).toMatch(/not confirmed either way/);
  });
});
