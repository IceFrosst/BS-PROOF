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

/*
 * LIVE-ONLY /scan (2026-10-05): the funding / publication-bias disclosures are written by a
 * model from its own recall of the ingredient (basis "model_prior"). /scan shows live research
 * only, so none of them is drawn -- beside the research or instead of it -- whatever the saved
 * analysis carries. (literatureDisclosures() itself is unchanged and still pinned by
 * tests/literature-warnings.test.ts for the surfaces that use it.)
 */
describe("legacy literature disclosures are NOT drawn on /scan", () => {
  it.each([
    ["a funding concern", warnings("concern", "no_concern")],
    ["a publication-bias concern", warnings("unknown", "concern")],
    ["both concerns", warnings("concern", "concern")],
  ])("%s in the analysis renders no model-recall warning, only the live research screen", async (_name, concerns) => {
    mockFetchOnce(fixture(section(concerns)));
    const el = await mount();
    await searchCreatineMonohydrate(el);

    expect(el.querySelector(".scan-lab-result")).not.toBeNull(); // the scan did complete and is on screen
    expect(findDisclosure(el, "Funding & independence")).toBeNull();
    expect(findDisclosure(el, "Publication bias")).toBeNull();
    expect(el.querySelector(".la-alert-warn")).toBeNull();
    expect(el.textContent).not.toMatch(/Funding & independence|Publication bias|National Dairy Council|Egger|Model knowledge/);
    // what IS there is the live research screen (here: sign-in is not configured, so it says research is off, and nothing replaces it)
    expect(el.querySelector(".sc-research")?.getAttribute("data-research-state")).toBe("disabled");
    expect(el.textContent).toContain("No saved, cached or model-recalled evidence is shown in its place");
  });
});
