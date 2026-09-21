/*
 * LITERATURE DISCLOSURE WARNINGS, RENDERED (not just computed).
 *
 * tests/literature-warnings.test.ts pins literatureDisclosures() as a pure
 * function; this file drives the real <ScanFlow> through its manual search
 * path against a mocked `fetch` and asserts what actually lands in the DOM:
 * each warning uses the SAME class as every other disclosure on this page
 * (`la-alert la-alert-warn`), sits above the Evidence section, never says
 * "fraud"/"fabricated"/"rigged", and a no_concern/unknown/absent section
 * renders no warning box at all.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ScanFlow } from "@/components/scan-flow";
import type { LiteratureWarnings } from "@/lib/analyze/literature-disclosures";
import { ingredientCatalog } from "@/lib/analyze/catalog";
import type { LiteratureWarningsSection } from "@/lib/analyze/literature-warnings";

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

function section(data: LiteratureWarnings | null): LiteratureWarningsSection {
  return {
    status: data ? "ok" : "unavailable",
    basis: "model_prior",
    reason: data ? null : "no model provider configured",
    data,
    prompt_version: "literature-warnings-v1.1",
    model: data ? "fake-text" : null,
    elapsed_s: data ? 0.2 : null,
  };
}

function fixture(literatureWarnings: LiteratureWarningsSection) {
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
    literature_warnings: literatureWarnings,
    meta: { timing_s: 0.1, stages: {}, provider_configured: true, models: { vision: null, text: "fake-text" }, prompt_versions: { literature_warnings: "literature-warnings-v1.1" } },
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
    // 2026-09-16 redesign: "Search your supplement" is a button that opens an
    // accessible dialog (components/search-sheet.tsx) rather than the earlier
    // inline expand/collapse panel; find it by its accessible name, not a
    // class that no longer exists.
    Array.from(el.querySelectorAll("button")).find((b) => /search your supplement/i.test(b.textContent ?? ""))?.click();
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

function warnings(
  fundingStatus: "concern" | "no_concern" | "unknown",
  biasStatus: "concern" | "no_concern" | "unknown",
): LiteratureWarnings {
  return {
    funding_independence: {
      status: fundingStatus,
      basis: fundingStatus === "concern" ? "Industry and trade-body funding dominates the trial base." : "x",
      confidence: "medium",
      notable_funders: fundingStatus === "concern" ? ["National Dairy Council"] : [],
    },
    publication_bias: {
      status: biasStatus,
      basis: biasStatus === "concern" ? "A 2025 meta-analysis found funnel-plot asymmetry." : "x",
      confidence: "medium",
      signals: biasStatus === "concern" ? ["Egger's test significant"] : [],
    },
    caveats: [],
  };
}

// jsdom's selector engine chokes on "&" inside an attribute-selector string
// literal, so disclosures are found by role + title text rather than by
// querying `[aria-label='...']` directly.
function findDisclosure(el: HTMLElement, title: string): HTMLElement | null {
  return (
    Array.from(el.querySelectorAll<HTMLElement>(".la-alert.la-alert-warn[role='note']")).find((node) =>
      node.querySelector("strong")?.textContent === title,
    ) ?? null
  );
}

describe("literature disclosures rendered on /scan", () => {
  it("a funding concern renders the SAME warning box class as every other disclosure, with honest wording", async () => {
    mockFetchOnce(fixture(section(warnings("concern", "no_concern"))));
    const el = await mount();
    await searchCreatineMonohydrate(el);

    const warning = findDisclosure(el, "Funding & independence");
    expect(warning).toBeTruthy();
    expect(warning?.getAttribute("role")).toBe("note");
    expect(warning?.textContent).toContain("Funding & independence");
    expect(warning?.textContent).toContain("Model knowledge — unverified");
    expect(warning?.textContent).toContain("does not affect the evidence score");
    expect(warning?.textContent).toContain("National Dairy Council");
    expect(warning?.textContent?.toLowerCase()).not.toMatch(/fraud|fabricated|rigged|invalid/);

    // Publication bias is no_concern here, so it must not render.
    expect(findDisclosure(el, "Publication bias")).toBeNull();
  });

  it("a publication-bias concern renders independently of funding", async () => {
    mockFetchOnce(fixture(section(warnings("unknown", "concern"))));
    const el = await mount();
    await searchCreatineMonohydrate(el);

    expect(findDisclosure(el, "Funding & independence")).toBeNull();
    const warning = findDisclosure(el, "Publication bias");
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain("Publication bias");
    expect(warning?.textContent).toContain("Egger's test significant");
    expect(warning?.textContent?.toLowerCase()).not.toMatch(/fraud|fabricated|rigged|invalid/);
  });

  it("both render when both are concerns", async () => {
    mockFetchOnce(fixture(section(warnings("concern", "concern"))));
    const el = await mount();
    await searchCreatineMonohydrate(el);

    expect(findDisclosure(el, "Funding & independence")).toBeTruthy();
    expect(findDisclosure(el, "Publication bias")).toBeTruthy();
  });

  it("no_concern, unknown, and an unavailable section render NOTHING about either topic", async () => {
    for (const s of [section(warnings("no_concern", "no_concern")), section(warnings("unknown", "unknown")), section(null)]) {
      mockFetchOnce(fixture(s));
      const el = await mount();
      await searchCreatineMonohydrate(el);
      expect(findDisclosure(el, "Funding & independence")).toBeNull();
      expect(findDisclosure(el, "Publication bias")).toBeNull();
      expect(el.textContent).not.toMatch(/Funding & independence|Publication bias/);
      await act(async () => root?.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });
});
