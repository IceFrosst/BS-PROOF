/*
 * The /scan RESULT STATE (design pass 2026-09-16,
 * docs/design/2026-09-16-scan-design-system.md). Drives the REAL <ScanFlow>
 * in jsdom against the rich photo fixture and pins the behaviours that were
 * the point of the redesign:
 *
 *   1. After a scan finishes the capture chrome is GONE (no "Scan this
 *      label", no Retake) and a scanned-product header with "Scan another"
 *      owns the top -- people had concluded "no results after photo" when the
 *      result rendered under the staged photo.
 *   2. Focus moves to that header (a phone user sees the state change).
 *   3. The run-validity banner renders BEFORE any composite number in DOM
 *      order (CLAUDE.md invariant: it is load-bearing, not decoration), inside
 *      one "Before you read the score" stack together with the caveats and the
 *      funding / publication-bias / MLM disclosures, each keeping the
 *      `la-alert la-alert-warn` class every disclosure has always carried.
 *   4. Invariant 8: an arc at `0.00 @ 0%` and one at `-0.70 @ 100%` never
 *      render alike -- the empty one says so in words.
 *   5. A typed entry never looks like a label read (no read confidence, no
 *      "Read from", the `user_input` badge present).
 *   6. Everything that was collapsed is still in the DOM: badge legend, run
 *      parameters, models, timings, run id, app version.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScanFlow } from "@/components/scan-flow";
import { ingredientCatalog } from "@/lib/analyze/catalog";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

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
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ScanFlow, { catalog }));
  });
  return container;
}

function mockFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })),
  );
}

async function scanPhoto(el: HTMLElement) {
  const input = el.querySelector<HTMLInputElement>("#scan-file");
  if (!input) throw new Error("no upload input rendered");
  const file = new File(["fake-bytes"], "label.png", { type: "image/png" });
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const scanButton = Array.from(el.querySelectorAll("button")).find((b) => /scan this label/i.test(b.textContent ?? ""));
  if (!scanButton) throw new Error("staged state must offer 'Scan this label'");
  await act(async () => {
    scanButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function buttons(el: HTMLElement, re: RegExp) {
  return Array.from(el.querySelectorAll("button")).filter((b) => re.test(b.textContent ?? ""));
}

describe("/scan result state", () => {
  it("collapses the capture chrome into a scanned-product header, moves focus there, and offers 'Scan another'", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    expect(el.querySelector(".scan-result")).not.toBeNull();
    expect(buttons(el, /scan this label/i)).toHaveLength(0);
    expect(buttons(el, /retake photo/i)).toHaveLength(0);
    expect(el.querySelector(".sc-viewfinder")).toBeNull();

    const header = el.querySelector<HTMLElement>(".sc-scanned");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("Creatine Pro 5000");
    expect(header?.textContent).toContain("Nordic Labs");
    expect(document.activeElement).toBe(header);
    // Top and bottom: thumb-reachable either way.
    expect(buttons(el, /^scan another$/i).length).toBeGreaterThanOrEqual(2);

    // "Scan another" returns to the landing state with the search pill.
    await act(async () => {
      buttons(el, /^scan another$/i)[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(el.querySelector(".scan-result")).toBeNull();
    expect(buttons(el, /search your supplement/i)).toHaveLength(1);
  });

  it("puts the validity banner and every disclosure in ONE stack before the first score", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    const stack = el.querySelector<HTMLElement>(".sc-notices");
    expect(stack).not.toBeNull();
    const validity = stack?.querySelector(".la-alert-warn");
    expect(validity?.textContent).toContain("Not a product claim");
    // Validity is not collapsed -- the load-bearing line is always visible.
    expect(validity?.querySelector("details")).toBeNull();

    // The first number on the page is an outcome-row score in the Outcomes tab.
    const firstScore = el.querySelector(".sc-outcome-row-score");
    expect(firstScore).not.toBeNull();
    // DOM order: the stack precedes the first composite number.
    expect(stack!.compareDocumentPosition(firstScore!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Caveat, funding, publication bias and MLM are all rows of the same stack,
    // still carrying the class every disclosure has always used, with the full
    // text reachable inside a native <details>.
    const bundle = stack!.querySelector<HTMLDetailsElement>(".sc-warning-bundle");
    expect(bundle).not.toBeNull();
    expect(bundle!.open).toBe(false);
    expect(bundle!.querySelector(":scope > summary")?.textContent).toContain("4 warnings");

    const titles = Array.from(stack!.querySelectorAll(".la-alert-warn strong")).map((s) => s.textContent);
    expect(titles).toEqual(
      expect.arrayContaining(["Multi ingredient product", "Funding & independence", "Publication bias", "MLM / direct-selling business model"]),
    );
    const mlm = stack!.querySelector(".la-alert.la-alert-warn[aria-label='Business model disclosure']");
    expect(mlm?.querySelector("details")).not.toBeNull();
    expect(mlm?.textContent).toContain("does not affect the evidence score");
    // Only one yellow-box family exists on the page: every warn alert is in the stack.
    expect(el.querySelectorAll(".la-alert-warn").length).toBe(stack!.querySelectorAll(".la-alert-warn").length);
  });

  it("outcome tabs: an Outcomes list lands first under a general (mean) score; each other tab is one outcome", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>("[role='tab']"));
    expect(tabs).toHaveLength(fixture.evidence.rows.length + 1);
    expect(tabs[0].textContent).toMatch(/^Outcomes/);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    // The landing tab lists every outcome and shows no evidence card yet.
    const listRows = Array.from(el.querySelectorAll<HTMLButtonElement>(".sc-outcome-row"));
    expect(listRows).toHaveLength(fixture.evidence.rows.length);
    expect(el.querySelectorAll(".scan-evidence")).toHaveLength(0);
    // The general score is the plain mean of the outcome composites and says so.
    const composites = fixture.evidence.rows.map((r) => r.composite).filter((c): c is number => typeof c === "number");
    const mean = Math.round(composites.reduce((a, b) => a + b, 0) / composites.length);
    const general = el.querySelector(".sc-general");
    expect(general?.querySelector(".sc-general-score")?.textContent).toBe(String(mean));
    expect(general?.textContent).toContain(`Average of ${composites.length} outcome scores`);

    // Tapping a row opens that outcome's tab with exactly one card.
    await act(async () => listRows[1].click());
    const selected = el.querySelector("[role='tab'][aria-selected='true']");
    expect(selected?.textContent).toBe(fixture.evidence.rows[1].outcome_label);
    const cards = el.querySelectorAll(".scan-evidence");
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector("h4")?.textContent).toBe(fixture.evidence.rows[1].outcome_label);
    expect(cards[0].querySelectorAll(".sc-arc")).toHaveLength(4);
    // Back to the list.
    await act(async () => tabs[0].click());
    expect(el.querySelectorAll(".scan-evidence")).toHaveLength(0);
    expect(el.querySelectorAll(".sc-outcome-row")).toHaveLength(fixture.evidence.rows.length);
  });

  it("uses score direction for red/amber/green and evidence coverage for signal strength", async () => {
    const source = fixture.evidence.rows[0];
    const rows = [
      { ...source, outcome: "bad", outcome_label: "Bad", composite: 20, arcs: { ...source.arcs, evidence: { ...source.arcs.evidence, coverage: 1 } } },
      { ...source, outcome: "middle", outcome_label: "Middle", composite: 55, arcs: { ...source.arcs, evidence: { ...source.arcs.evidence, coverage: 1 } } },
      { ...source, outcome: "good", outcome_label: "Good", composite: 85, arcs: { ...source.arcs, evidence: { ...source.arcs.evidence, coverage: 1 } } },
      { ...source, outcome: "weak", outcome_label: "Weak signal", composite: 55, arcs: { ...source.arcs, evidence: { ...source.arcs.evidence, coverage: 0.1 } } },
    ];
    mockFetch({ ...fixture, evidence: { ...fixture.evidence, rows } });
    const el = await mount();
    await scanPhoto(el);
    const colors = Array.from(el.querySelectorAll<HTMLElement>(".sc-outcome-row-fill")).map((bar) => bar.style.background);
    const rgb = colors.map((color) => (color.match(/\d+/g) ?? []).map(Number));
    expect(rgb[0][0]).toBeGreaterThan(rgb[0][1] * 2); // low score: red/orange
    expect(rgb[1][0]).toBeGreaterThan(rgb[1][1]); // middle score: amber
    expect(rgb[1][1]).toBeGreaterThan(rgb[1][2] * 2);
    expect(rgb[2][1]).toBeGreaterThan(rgb[2][0]); // high score: green
    expect(colors[3]).not.toBe(colors[1]); // same score, weaker evidence: less saturated/lighter
  });

  /* Open every outcome tab in turn and collect its (single) card. */
  async function eachCard(el: HTMLElement): Promise<HTMLElement[]> {
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>("[role='tab']")).slice(1);
    const out: HTMLElement[] = [];
    for (const tab of tabs) {
      await act(async () => tab.click());
      const card = el.querySelector<HTMLElement>(".scan-evidence");
      expect(card).not.toBeNull();
      // React reuses the one panel node between tabs, so snapshot it.
      out.push(card!.cloneNode(true) as HTMLElement);
    }
    return out;
  }

  it("renders four prominent evidence rows in every outcome card", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    const cards = await eachCard(el);
    expect(cards.length).toBe(fixture.evidence.rows.length);
    for (const card of cards) {
      const arcs = Array.from(card.querySelectorAll<HTMLElement>(".sc-arc"));
      expect(arcs).toHaveLength(4);
      expect(arcs.map((arc) => arc.querySelector(".sc-arc-label")?.textContent)).toEqual([
        "Does it work?",
        "In your form?",
        "At your dose?",
        "Well studied?",
      ]);
      // Each dimension owns a separate full-width track below its readable
      // label/value/coverage header; it is no longer a tiny inline meter.
      for (const arc of arcs) {
        expect(arc.querySelector(":scope > .sc-arc-head .sc-arc-value")).not.toBeNull();
        expect(arc.querySelector(":scope > .sc-arc-head .sc-arc-cov")).not.toBeNull();
        expect(arc.querySelector(":scope > .sc-arc-track")).not.toBeNull();
      }
    }
  });

  it("invariant 8: effect, form and dose render directional verdicts with coverage, distinguishing 0.00 @ 0% from -0.70 @ 100%", async () => {
    const source = fixture.evidence.rows[0];
    const dimensions = ["effect", "form", "dose"] as const;
    const rows = dimensions.flatMap((dimension) => {
      const target = source.arcs[dimension];
      return [
        {
          ...source,
          outcome: `untested_${dimension}`,
          outcome_label: `Untested ${dimension}`,
          arcs: {
            ...source.arcs,
            [dimension]: { ...target, verdict: 0, coverage: 0, strength: 0.91, closeness: 0.88 },
          },
        },
        {
          ...source,
          outcome: `failed_${dimension}`,
          outcome_label: `Failed ${dimension}`,
          arcs: {
            ...source.arcs,
            [dimension]: { ...target, verdict: -0.7, coverage: 1, strength: 0.91, closeness: 0.88 },
          },
        },
      ];
    });
    mockFetch({ ...fixture, evidence: { ...fixture.evidence, rows } });
    const el = await mount();
    await scanPhoto(el);

    const cards = await eachCard(el);
    expect(cards).toHaveLength(6);
    dimensions.forEach((dimension, index) => {
      const untested = cards[index * 2].querySelector<HTMLElement>(`.sc-arc-${dimension}`)!;
      const failed = cards[index * 2 + 1].querySelector<HTMLElement>(`.sc-arc-${dimension}`)!;

      // The displayed form/dose values must be the signed directional verdict,
      // not their positive strength/closeness metadata (set above to 0.91/0.88).
      expect(untested.querySelector(".sc-arc-value")?.textContent).toBe("0.00");
      expect(failed.querySelector(".sc-arc-value")?.textContent).toBe("−0.70");
      expect(untested.textContent).not.toContain("0.91");
      expect(untested.textContent).not.toContain("0.88");

      expect(untested.textContent).toContain("0% · untested");
      expect(untested.classList.contains("sc-arc-untested")).toBe(true);
      expect(untested.querySelector<HTMLElement>(".sc-arc-fill")?.style.width).toBe("0%");
      expect(failed.textContent).toContain("100% coverage");
      expect(failed.classList.contains("sc-arc-untested")).toBe(false);
      expect(failed.querySelector<HTMLElement>(".sc-arc-fill")?.style.width).toBe("100%");
      expect(untested.textContent).not.toEqual(failed.textContent);
    });

    // Every arc row names its coverage in its accessible label.
    for (const card of cards) {
      for (const arc of card.querySelectorAll(".sc-arc")) {
        expect(arc.getAttribute("aria-label")).toMatch(/coverage/);
      }
    }
  });

  it("keeps every collapsed fact reachable: legend, run parameters, models, timings, run id, app version", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    const text = el.textContent ?? "";
    for (const legendLabel of ["Evidence run", "Public registry", "Curated & cited", "As printed", "Typed by you", "Model knowledge"]) {
      expect(text).toContain(legendLabel);
    }
    const technical = el.querySelector<HTMLElement>(".sc-technical");
    expect(technical?.textContent).toContain(fixture.meta.models.vision);
    expect(technical?.textContent).toContain(fixture.meta.models.text);
    expect(technical?.textContent).toContain(fixture.run_id);
    expect(technical?.textContent).toContain(fixture.app_version.package_version);
    expect(technical?.textContent).toContain("How these numbers were produced");
    expect(technical?.querySelector('a[href="/methodology"]')).not.toBeNull();
    // Label facts (read confidence, quoted spans) live in the collapsed details, still in the DOM.
    expect(text).toContain("Read confidence");
    expect(text).toContain("Read from:");
  });

  it("a typed entry never looks like a label read", async () => {
    const manual = {
      ...fixture,
      source: "manual",
      label: undefined,
      input: {
        ingredient: "creatine",
        ingredient_label: "Creatine",
        form: "creatine_monohydrate",
        form_label: "Creatine monohydrate",
        dose_per_serving: { value: 5, unit: "g", mg: 5000 },
        servings_per_day: 1,
        basis: "user_input",
      },
      company: { ...fixture.company, status: "no_brand_on_label", basis_used: [] },
    };
    mockFetch(manual);
    const el = await mount();
    // Drive the manual path through the sheet, exactly as a person would.
    await act(async () => {
      buttons(el, /search your supplement/i)[0].click();
    });
    const combo = el.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await act(async () => {
      // React tracks the value through the prototype setter; set it there so the
      // synthetic input event carries the new text.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(combo, "creatine");
      combo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      combo.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    await act(async () => {
      combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    const select = el.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      select.value = "creatine_monohydrate";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const header = el.querySelector(".sc-scanned");
    expect(header?.textContent).toContain("What you entered");
    expect(header?.querySelector("img")).toBeNull();
    const identity = el.querySelector(".sc-identity");
    expect(identity?.querySelector(".scan-badge-user_input")).not.toBeNull();
    expect(identity?.textContent).toContain("Typed, not read from a label");
    expect(identity?.textContent).not.toContain("Read confidence");
    expect(identity?.textContent).not.toContain("Read from:");
    expect(el.querySelector(".sc-technical")?.textContent).not.toContain("Vision model");
  });
});
