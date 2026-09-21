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
    /* Each row is ONE unit and ONE control (founder 2026-09-16): name + score
     * on the first line, a single chevron affordance, the bar underneath. The
     * lone "More" link that floated mid-row is gone, and nothing interactive is
     * nested inside the button. */
    for (const row of listRows) {
      expect(row.textContent).not.toContain("More");
      expect(row.querySelectorAll("button, a, input").length).toBe(0);
      expect(row.querySelectorAll(".sc-outcome-row-more svg")).toHaveLength(1);
      expect(row.querySelectorAll(".sc-outcome-row-track")).toHaveLength(1);
      const kids = Array.from(row.children).map((c) => c.className);
      expect(kids).toEqual(["sc-outcome-row-name", "sc-outcome-row-score", "sc-outcome-row-more", "sc-outcome-row-track"]);
    }
    // The run's population is a plain FACT line, stated once (it is recorded
    // per run, not per outcome) and never drawn as a scored bar.
    const popLines = el.querySelectorAll(".sc-list-pop");
    expect(popLines).toHaveLength(1);
    expect(popLines[0].textContent).toContain("healthy adults, men and women");
    expect(popLines[0].querySelector(".sc-arc-track, .sc-outcome-row-track")).toBeNull();

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
    // The same ramp drives the number, only darkened so 22px type clears WCAG
    // 1.4.3 (axe reported 2.6:1 before): same hue, lower lightness.
    const text = Array.from(el.querySelectorAll<HTMLElement>(".sc-outcome-row-score strong")).map((s) =>
      (s.style.color.match(/\d+/g) ?? []).map(Number),
    );
    const dominant = (c: number[]) => c.indexOf(Math.max(...c));
    text.forEach((c, i) => {
      // Same ramp: the dominant channel (red for a low score, green for a high
      // one) is identical to the bar's.
      expect(dominant(c)).toBe(dominant(rgb[i]));
      // Darker, so 22px type clears WCAG 1.4.3 (axe measured 2.6:1 before).
      expect(Math.max(...c)).toBeLessThan(Math.max(...rgb[i]));
    });
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

  it("renders four prominent evidence rows, each carrying its verdict AND its coverage, in every outcome card", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);

    const cards = await eachCard(el);
    expect(cards.length).toBe(fixture.evidence.rows.length);
    cards.forEach((card, i) => {
      const source = fixture.evidence.rows[i];
      const arcs = Array.from(card.querySelectorAll<HTMLElement>(".sc-arc"));
      expect(arcs).toHaveLength(4);
      expect(arcs.map((arc) => arc.querySelector(".sc-arc-label")?.textContent)).toEqual([
        "Does it work?",
        "In your form?",
        "At your dose?",
        "Well studied?",
      ]);
      // Each dimension is ONE tappable line (the design-lab card's geometry)
      // whose value and coverage sit together above its own full-width track.
      for (const arc of arcs) {
        const row = arc.querySelector<HTMLButtonElement>(":scope > .sc-arc-row");
        expect(row).not.toBeNull();
        expect(row!.getAttribute("aria-expanded")).toBe("false");
        expect(row!.querySelector(":scope > .sc-arc-value")).not.toBeNull();
        expect(row!.querySelector(":scope > .sc-arc-cov")).not.toBeNull();
        expect(row!.querySelector(":scope > .sc-arc-track")).not.toBeNull();
        // One control per row, nothing interactive nested inside it.
        expect(row!.querySelectorAll("button, a, input").length).toBe(0);
      }
      // The three signed dimensions print the run's own signed verdict, and
      // every dimension prints the run's own coverage (invariant 8).
      const dims = ["effect", "form", "dose"] as const;
      dims.forEach((dim, idx) => {
        const v = source.arcs[dim].verdict as number;
        const shown = arcs[idx].querySelector(".sc-arc-value")?.textContent ?? "";
        expect(shown).toBe(`${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${Math.abs(v).toFixed(2)}`);
      });
      arcs.forEach((arc, idx) => {
        const dim = (["effect", "form", "dose", "evidence"] as const)[idx];
        const cov = source.arcs[dim].coverage as number;
        expect(arc.querySelector(".sc-arc-cov")?.textContent).toContain(`${Math.round(cov * 100)}%`);
      });
    });
  });

  it("expands a dimension in place with facts the run really carries, and no lab affordance production cannot back", async () => {
    mockFetch(fixture);
    const el = await mount();
    await scanPhoto(el);
    await act(async () => el.querySelectorAll<HTMLButtonElement>(".sc-outcome-row")[0].click());

    const card = el.querySelector<HTMLElement>(".scan-evidence")!;
    const dose = card.querySelector<HTMLElement>(".sc-arc-dose")!;
    const row = dose.querySelector<HTMLButtonElement>(".sc-arc-row")!;
    expect(dose.querySelector(".sc-arc-detail")).toBeNull();
    await act(async () => row.click());
    const detail = dose.querySelector<HTMLElement>(".sc-arc-detail");
    expect(detail).not.toBeNull();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(row.getAttribute("aria-controls")).toBe(detail!.id);
    // Real dose facts: the scored daily dose, the benefit band and the
    // server's own reading sentence for this outcome.
    expect(detail!.textContent).toContain("4.4 g");
    expect(detail!.textContent).toContain("Benefit range");
    // The server's own reading sentence, minus the outcome-name prefix the
    // card already shows (the same strip the dose bar has always done).
    const reading: string = fixture.dose_effectiveness.outcomes[0].reading;
    expect(detail!.textContent).toContain(reading.slice(`${fixture.evidence.rows[0].outcome_label}: `.length + 1));
    // The dose word is the tone the server computed, not an invented grade,
    // and the run's own dose tier stays reachable (it used to be a footnote).
    expect(row.textContent).toContain("in range");
    expect(detail!.textContent).toContain("Dose match");
    expect(detail!.textContent).toContain("in band");

    // Only one dimension is open at a time; opening another closes this one.
    await act(async () => card.querySelector<HTMLButtonElement>(".sc-arc-evidence .sc-arc-row")!.click());
    expect(dose.querySelector(".sc-arc-detail")).toBeNull();
    const evidence = card.querySelector<HTMLElement>(".sc-arc-evidence .sc-arc-detail")!;
    expect(evidence.textContent).toContain(fixture.evidence.run.id);
    expect(evidence.textContent).toContain("3 trials");

    // NOT adopted from the design-lab card, because production has no such
    // data: a fifth person-fit bar, rubric ordinals, and an interval axis.
    expect(card.querySelectorAll(".sc-arc")).toHaveLength(4);
    expect(card.textContent).not.toContain("Studied in you");
    expect(card.textContent).not.toMatch(/\b\d\/4\b/);
    expect(card.querySelector(".sc-interval, .ab-interval")).toBeNull();
    // The population IS shown -- as a plain fact line, never as a scored bar.
    const pop = card.querySelector<HTMLElement>(".sc-pop");
    expect(pop?.textContent).toContain("healthy adults");
    expect(pop?.querySelector(".sc-arc-track")).toBeNull();
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

    // Every arc row names its coverage in its accessible name.
    for (const card of cards) {
      for (const row of card.querySelectorAll(".sc-arc .sc-arc-row")) {
        expect(row.getAttribute("aria-label")).toMatch(/coverage/);
      }
    }
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
