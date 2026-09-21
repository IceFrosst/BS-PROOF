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
import { retainedAuditForProduct } from "@/lib/evidence-ledger/retained-audits";

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
  it("renders a matched retained audit with provenance, native scales, exact wording, sources, and score colors", async () => {
    const ledgerAudit = retainedAuditForProduct({
      ingredient: "creatine",
      form: "creatine_monohydrate",
      compoundDoseMg: 4000,
      servingsPerDay: 1,
      isMultiIngredient: false,
      actives: [{ name: "Creatine Monohydrate", compoundDoseMg: 4000 }],
      otherActives: [],
    });
    expect(ledgerAudit).not.toBeNull();
    const matched = { ...structuredClone(fixture), ledger_audit: ledgerAudit };
    mockFetch(matched);
    const el = await mount();
    await scanPhoto(el);

    const stack = el.querySelector<HTMLElement>(".sc-notices");
    const firstNumber = el.querySelector(".sc-general-score, .sc-outcome-row-score, .sc-outcome-number");
    expect(stack?.textContent).toContain("Retained previous audit · not reverified");
    expect(stack?.textContent).toContain("audit-v0.2");
    expect(stack && firstNumber && (stack.compareDocumentPosition(firstNumber) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(el.querySelector(".sc-no-ledger-audit")).toBeNull();

    const general = el.querySelector<HTMLElement>(".sc-general");
    expect(general?.textContent).toContain("not a probability");
    expect(general?.style.getPropertyValue("--sc-score-color")).toMatch(/hsl/);
    const tabs = el.querySelectorAll<HTMLElement>(".sc-ledger-tabs .sc-tab");
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs[1].style.getPropertyValue("--sc-tab-score")).toMatch(/hsl/);

    const firstOutcome = el.querySelector<HTMLButtonElement>(".sc-ledger-tabs .sc-outcome-row");
    expect(firstOutcome).not.toBeNull();
    await act(async () => firstOutcome!.click());
    const card = el.querySelector<HTMLElement>(".sc-ledger-card")!;
    expect(card.querySelector(".sc-arc-effect .sc-arc-value")?.textContent).not.toMatch(/\/4/);
    expect(card.querySelector(".sc-arc-certainty .sc-arc-value")?.textContent).toMatch(/\/4|—/);
    expect(card.querySelector(".sc-arc-form .sc-arc-value")?.textContent).toMatch(/\/4|—/);
    expect(card.querySelector(".sc-arc-dose .sc-arc-value")?.textContent).toMatch(/\/4|—/);
    expect(card.querySelector(".sc-arc-evidence")).toBeNull();
    expect(card.querySelectorAll(".sc-ledger-row")).toHaveLength(4);

    const effect = card.querySelector<HTMLButtonElement>(".sc-arc-effect .sc-arc-row")!;
    await act(async () => effect.click());
    const detail = card.querySelector<HTMLElement>(".sc-arc-effect .sc-arc-detail")!;
    const auditOutcome = ledgerAudit!.audit.outcomes[0];
    expect(detail.textContent).toContain(auditOutcome.detail.effect.found);
    expect(detail.querySelectorAll("a[href^='https://']").length).toBeGreaterThan(0);
    expect(detail.querySelector("a[href*='doi.org'], a[href*='pubmed.ncbi.nlm.nih.gov']")).not.toBeNull();
    const headline = card.querySelector<HTMLElement>(".sc-outcome-headline");
    expect(headline?.style.getPropertyValue("--sc-score-color")).toMatch(/hsl/);
  });

  it("matched tabs rove with wraparound and panel labelling survives punctuation in a composite key", async () => {
    const ledgerAudit = retainedAuditForProduct({
      ingredient: "creatine",
      form: "creatine_monohydrate",
      compoundDoseMg: 4000,
      servingsPerDay: 1,
      isMultiIngredient: false,
      actives: [{ name: "Creatine Monohydrate", compoundDoseMg: 4000 }],
      otherActives: [],
    });
    expect(ledgerAudit).not.toBeNull();
    const matched = structuredClone(ledgerAudit!);
    matched.audit.outcomes[0].name = "Endurance / recovery (acute),";
    mockFetch({ ...structuredClone(fixture), ledger_audit: matched });
    const el = await mount();
    await scanPhoto(el);
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>(".sc-ledger-tabs [role='tab']"));
    const panel = el.querySelector<HTMLElement>("[role='tabpanel']")!;
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1].id);
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)).toBe(tabs[1]);
    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await act(async () => tabs[tabs.length - 1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await act(async () => tabs[tabs.length - 1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
  });

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
    const summary = bundle!.querySelector(":scope > summary");
    expect(summary?.textContent).toContain("4 warnings");
    // One clean row: the count IS the label (founder 2026-09-16).
    expect(summary?.textContent?.trim()).toBe("4 warnings");
    expect(summary?.querySelector("small")).toBeNull();

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

  it("unmatched tabs rove with wraparound and panel labelling resolves sanitized composite ids", async () => {
    mockFetch({ ...structuredClone(fixture), evidence: { ...fixture.evidence, rows: [{ ...fixture.evidence.rows[0], outcome: "dose/form, exact" }, ...fixture.evidence.rows.slice(1)] } });
    const el = await mount();
    await scanPhoto(el);
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>(".sc-ledger-tabs [role='tab']"));
    const panel = el.querySelector<HTMLElement>("[role='tabpanel']")!;
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    expect(tabs[tabs.length - 1].getAttribute("aria-selected")).toBe("true");
    await act(async () => tabs[tabs.length - 1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1].id);
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)).toBe(tabs[1]);
    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
  });

  it("unmatched scans use the retained lab shell without exposing continuous scores", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    expect(el.querySelector(".sc-ledger-tabs")).not.toBeNull();
    expect(el.querySelector(".sc-tabs:not(.sc-ledger-tabs)")).toBeNull();
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>(".sc-ledger-tabs [role='tab']"));
    expect(tabs).toHaveLength(fixture.evidence.rows.length + 1);
    expect(tabs[0].textContent).toBe("General");
    expect(el.querySelector(".sc-general-score")?.textContent).toBe("—");
    expect(el.querySelector(".sc-general")?.textContent).toContain("Not assessed");
    expect(el.querySelector(".sc-no-ledger-audit")?.textContent).toContain("not converted into quarters");

    const listRows = Array.from(el.querySelectorAll<HTMLButtonElement>(".sc-ledger-tabs .sc-outcome-row"));
    expect(listRows).toHaveLength(fixture.evidence.rows.length);
    for (const row of listRows) {
      expect(row.querySelector(".sc-outcome-row-score")?.textContent).toBe("—");
      expect(row.querySelectorAll("button, a, input").length).toBe(0);
      expect(row.querySelectorAll(".sc-outcome-row-track")).toHaveLength(1);
    }

    await act(async () => listRows[1].click());
    const card = el.querySelector<HTMLElement>(".sc-ledger-card")!;
    expect(card.querySelector("h4")?.textContent).toBe(fixture.evidence.rows[1].outcome_label);
    expect(card.querySelector(".sc-outcome-number")?.textContent).toBe("—");
    expect(Array.from(card.querySelectorAll(".sc-arc-label")).map((node) => node.textContent)).toEqual(["Effect", "Evidence certainty", "Form", "Dose"]);
    for (const dimension of card.querySelectorAll(".sc-ledger-row")) {
      expect(dimension.querySelector(".sc-arc-value")?.textContent).toBe("—");
      expect(dimension.querySelector(".sc-arc-word")?.textContent).toContain("Not assessed");
    }
    expect(card.textContent).not.toMatch(/\b(?:\d+%|\d+\/100|probably works|possibly works)\b/i);
    const effect = card.querySelector<HTMLButtonElement>(".sc-arc-effect .sc-arc-row")!;
    await act(async () => effect.click());
    expect(card.querySelector(".sc-arc-effect .sc-arc-detail")?.textContent).toContain("not converted into quarters");
  });

  it("does not expose continuous composite, verdict, or coverage values in the unmatched card", async () => {
    mockFetch({ ...fixture, evidence: { ...fixture.evidence, rows: fixture.evidence.rows.map((row) => ({ ...row, composite: 99, verdict: "probably works", arcs: { ...row.arcs, evidence: { ...row.arcs.evidence, coverage: 1 } } })) } });
    const el = await mount();
    await scanPhoto(el);
    expect(el.querySelector(".sc-ledger-tabs")).not.toBeNull();
    expect(el.querySelector(".sc-tabs:not(.sc-ledger-tabs)")).toBeNull();
    expect(el.textContent).not.toContain("probably works");
    expect(el.querySelectorAll(".sc-ledger-tabs .sc-outcome-row-score strong")).toHaveLength(fixture.evidence.rows.length);
    expect(Array.from(el.querySelectorAll(".sc-ledger-tabs .sc-outcome-row-score strong")).every((node) => node.textContent === "—")).toBe(true);
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

  it("renders four expandable Not assessed dimensions for each unmatched outcome", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    const cards = await eachCard(el);
    expect(cards.length).toBe(fixture.evidence.rows.length);
    cards.forEach((card) => {
      const arcs = Array.from(card.querySelectorAll<HTMLElement>(".sc-ledger-row"));
      expect(arcs).toHaveLength(4);
      expect(arcs.map((arc) => arc.querySelector(".sc-arc-label")?.textContent)).toEqual(["Effect", "Evidence certainty", "Form", "Dose"]);
      // Each dimension is one accessible tappable line with an honest dash.
      for (const arc of arcs) {
        const row = arc.querySelector<HTMLButtonElement>(":scope > .sc-arc-row");
        expect(row).not.toBeNull();
        expect(row!.getAttribute("aria-expanded")).toBe("false");
        expect(row!.querySelector(":scope > .sc-arc-value")?.textContent).toBe("—");
        expect(row!.querySelector(":scope > .sc-arc-word")?.textContent).toContain("Not assessed");
        // One control per row, nothing interactive nested inside it.
        expect(row!.querySelectorAll("button, a, input").length).toBe(0);
      }
    });
  });

  it("expands an unmatched dimension with the honest no-audit explanation", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);
    await act(async () => el.querySelectorAll<HTMLButtonElement>(".sc-outcome-row")[0].click());
    const card = el.querySelector<HTMLElement>(".sc-ledger-card")!;
    expect(card.querySelectorAll(".sc-ledger-row")).toHaveLength(4);
    const effect = card.querySelector<HTMLButtonElement>(".sc-arc-effect .sc-arc-row")!;
    expect(effect.getAttribute("aria-expanded")).toBe("false");
    await act(async () => effect.click());
    expect(effect.getAttribute("aria-expanded")).toBe("true");
    expect(card.querySelector(".sc-arc-effect .sc-arc-detail")?.textContent).toContain("not converted into quarters");
    expect(card.textContent).toContain("No source-verified /4 audit matches this exact form and daily dose");
  });

  it("never routes an unmatched scan through the legacy continuous renderer", async () => {
    const rows = fixture.evidence.rows.map((row) => ({ ...row, composite: 99, verdict: "probably works" }));
    mockFetch({ ...fixture, evidence: { ...fixture.evidence, rows } });
    const el = await mount();
    await scanPhoto(el);
    expect(el.querySelector(".sc-ledger-tabs")).not.toBeNull();
    expect(el.querySelector(".sc-tabs:not(.sc-ledger-tabs)")).toBeNull();
    expect(Array.from(el.querySelectorAll(".sc-ledger-tabs .sc-outcome-row-score strong")).every((node) => node.textContent === "—")).toBe(true);
    expect(el.textContent).not.toContain("probably works");
  });

  /* Nothing currently reachable may become unreachable: the design pass that
   * adopted the design-lab card's geometry must leave every empty / error
   * state exactly as reachable as it was. */
  it("still renders every empty and error state", async () => {
    const cases: Array<[string, unknown, RegExp]> = [
      [
        "analyzer_unavailable",
        { status: "analyzer_unavailable", basis_legend: fixture.basis_legend, meta: fixture.meta, caveats: [] },
        /Scanning is not configured on this deployment/i,
      ],
      [
        "not_a_supplement_label",
        { ...fixture, status: "not_a_supplement_label", evidence: undefined, product: undefined, dose_effectiveness: undefined, compatibility: undefined, company: undefined },
        /does not look like a supplement label/i,
      ],
      [
        "ingredient_not_supported",
        {
          ...fixture,
          status: "ingredient_not_supported",
          ingredient_label_text: "Ashwagandha",
          supported_ingredients: ["creatine"],
          evidence: undefined,
          product: undefined,
          dose_effectiveness: undefined,
          compatibility: undefined,
        },
        /is not in the evidence vocabulary yet/i,
      ],
      [
        "form_not_scored",
        { ...fixture, evidence: { status: "form_not_scored", rows: [], scored_forms: ["creatine_monohydrate"] }, dose_effectiveness: undefined },
        /That form has not been run/i,
      ],
      [
        "not_scored",
        { ...fixture, evidence: { status: "not_scored", rows: [] }, dose_effectiveness: undefined },
        /No evidence run exists for this ingredient/i,
      ],
    ];

    for (const [name, body, expected] of cases) {
      mockFetch(body);
      const el = await mount();
      await scanPhoto(el);
      expect(el.textContent, name).toMatch(expected);
      if (name === "form_not_scored" || name === "not_scored") {
        expect(el.querySelector(".sc-ledger-tabs"), name).not.toBeNull();
        expect(el.querySelector(".sc-no-ledger-audit"), name).not.toBeNull();
        expect(el.querySelectorAll(".sc-outcome-row"), name).toHaveLength(0);
      }
      // The scanned-product header and both "Scan another" buttons survive.
      expect(el.querySelector(".sc-scanned"), name).not.toBeNull();
      expect(buttons(el, /^scan another$/i).length, name).toBeGreaterThanOrEqual(1);
      await act(async () => root?.unmount());
      container?.remove();
      root = null;
      container = null;
    }

    // A network failure is its own state: the error alert, not a silent blank.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const el = await mount();
    await scanPhoto(el);
    const alert = el.querySelector(".sc-error");
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toMatch(/Could not reach the analyzer/i);
    expect(el.querySelector(".scan-result")).toBeNull();
    expect(buttons(el, /^scan another$/i).length).toBeGreaterThanOrEqual(1);
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
