// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LiveResultCard } from "@/components/live-result-card";
import { RESEARCH_CARD_COPY } from "@/lib/i18n/copy/research-card";
import { RESEARCH_COPY } from "@/lib/i18n/copy/research";
import { RESULT_COPY } from "@/lib/i18n/copy/result";
import { parseResearchResult, type ResearchFacts } from "@/lib/scan-research/client";
import { buildLiveResultCard } from "@/lib/scan-research/result-card";
import {
  CHECKLIST_UNKNOWN, GATES_NONE, KNOWN_FACTS, SYN_DOUBT, SYN_EVIDENCE_FOUND, SYN_QUOTE, SYN_RANGE, SYN_SENTENCE,
  audit, blendAudit, facts, liveResult, outcome, publicD3K2Audit, UNKNOWN_ROW,
} from "@/tests/helpers/live-result-card-fixtures";

type Json = Record<string, unknown>;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function mount(a: Json, f: ResearchFacts | null = KNOWN_FACTS, lang: "en" | "lt" = "en") {
  const raw = liveResult(a);
  const parsed = parseResearchResult(raw);
  if (!parsed) throw new Error("mock rejected by the browser parser");
  const card = buildLiveResultCard(parsed, raw, f);
  act(() => root.render(createElement(LiveResultCard, { card, facts: f, lang })));
  return card;
}
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
const tabs = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const selectedTab = () => tabs().filter((t) => t.getAttribute("aria-selected") === "true");
const tabNamed = (label: string) => tabs().find((t) => t.textContent?.startsWith(label))!;
const rows = () => Array.from(host.querySelectorAll<HTMLLIElement>('[data-testid="research-axes"] > li'));
const row = (id: string) => host.querySelector<HTMLLIElement>(`[data-testid="research-axes"] > li[data-row-id="${id}"]`)!;
const rowButton = (id: string) => row(id).querySelector("button")!;
const text = () => host.textContent ?? "";
const warnings = () => host.querySelector('[data-testid="research-warnings"]');
const warningIds = () => Array.from(host.querySelectorAll("[data-warning]")).map((n) => n.getAttribute("data-warning"));

describe("the established card: Outcomes tab, one tab per outcome", () => {
  it("opens on the Outcomes list: tab 1 selected, one row per outcome with its name, population and the research's sentence, no bars, no warnings block, no rows", () => {
    mount(audit());
    expect(tabs().map((t) => t.textContent)).toEqual([RESULT_COPY.en.outcomesTab, "Sleep quality", "Muscle cramps"]);
    expect(selectedTab()).toHaveLength(1);
    expect(selectedTab()[0].textContent).toBe(RESULT_COPY.en.outcomesTab);
    const list = host.querySelectorAll('[data-testid="research-outcome-list"] > li');
    expect(list).toHaveLength(2);
    expect(list[0].textContent).toContain("Adults with self-rated poor sleep");
    expect(list[0].textContent).toContain(SYN_SENTENCE);
    expect(warnings()).toBeNull();
    expect(rows()).toHaveLength(0);
    expect(host.querySelector('[data-testid="research-audit"]')).not.toBeNull();
    expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(RESULT_COPY.en.outcomeTablist);
  });

  it("selecting an outcome tab shows ONLY that outcome: four rows in the order Effect, Evidence, Form, Dose, its headline and its warnings", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    expect(selectedTab()[0].textContent).toBe("Sleep quality");
    expect(host.querySelector('[data-testid="research-outcome-list"]')).toBeNull();
    expect(rows().map((r) => r.querySelector(".ab-bar-name")?.textContent)).toEqual(["Effect", "Evidence", "Form", "Dose"]);
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["effect", "evidence", "form", "dose"]);
    const head = host.querySelector('[data-testid="research-outcome-head"]')!;
    expect(head.querySelector("h3")?.textContent).toBe("Sleep quality");
    expect(head.textContent).toContain("Adults with self-rated poor sleep");
    expect(head.textContent).toContain(SYN_SENTENCE);
    // the other outcome's facts are nowhere on this tab
    expect(text()).not.toContain("Mock: nothing could be sized for cramps in this run.");
    click(tabNamed("Muscle cramps"));
    expect(host.querySelector('[data-testid="research-outcome-head"]')?.textContent).toContain("Mock: nothing could be sized for cramps in this run.");
    expect(text()).not.toContain(SYN_SENTENCE);
    click(tabNamed(RESULT_COPY.en.outcomesTab));
    expect(rows()).toHaveLength(0);
    expect(host.querySelectorAll('[data-testid="research-outcome-list"] > li')).toHaveLength(2);
  });

  it("clicking an outcome in the list opens its tab and moves focus to that tab (a keyboard user is not dropped)", async () => {
    mount(audit());
    const first = host.querySelector<HTMLButtonElement>('[data-testid="research-outcome-list"] > li button')!;
    await act(async () => { first.click(); await Promise.resolve(); });
    expect(selectedTab()[0].textContent).toBe("Sleep quality");
    expect(document.activeElement).toBe(selectedTab()[0]);
  });

  it("the tablist is keyboard operable: roving tabindex, ArrowRight/ArrowLeft wrap, Home and End, focus follows selection", async () => {
    mount(audit());
    const press = async (name: string) => { await act(async () => { (document.activeElement ?? tabs()[0]).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })); await Promise.resolve(); }); };
    tabs()[0].focus();
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    await press("ArrowRight");
    expect(selectedTab()[0].textContent).toBe("Sleep quality");
    expect(document.activeElement).toBe(selectedTab()[0]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    await press("End");
    expect(selectedTab()[0].textContent).toBe("Muscle cramps");
    await press("ArrowRight"); // wraps to Outcomes
    expect(selectedTab()[0].textContent).toBe(RESULT_COPY.en.outcomesTab);
    await press("ArrowLeft"); // wraps back
    expect(selectedTab()[0].textContent).toBe("Muscle cramps");
    await press("Home");
    expect(selectedTab()[0].textContent).toBe(RESULT_COPY.en.outcomesTab);
    await press("a"); // any other key does nothing
    expect(selectedTab()[0].textContent).toBe(RESULT_COPY.en.outcomesTab);
  });

  it("the tablist/tab/tabpanel relationship is real: aria-controls resolves, the panel is labelled by the selected tab", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    const tab = selectedTab()[0];
    const panel = host.querySelector('[role="tabpanel"]')!;
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
    expect(host.querySelectorAll("[id]").length).toBe(new Set(Array.from(host.querySelectorAll("[id]")).map((n) => n.id)).size);
  });

  it("two cards on one page never share an id (a saved scan opened from History beside the live one)", () => {
    const a = document.createElement("div"); const b = document.createElement("div"); document.body.append(a, b);
    const ra = createRoot(a); const rb = createRoot(b);
    const raw = liveResult(audit()); const parsed = parseResearchResult(raw)!; const card = buildLiveResultCard(parsed, raw, KNOWN_FACTS);
    act(() => { ra.render(createElement(LiveResultCard, { card, facts: KNOWN_FACTS, lang: "en" })); rb.render(createElement(LiveResultCard, { card, facts: KNOWN_FACTS, lang: "en" })); });
    const all = [...a.querySelectorAll("[id]"), ...b.querySelectorAll("[id]")].map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
    act(() => { ra.unmount(); rb.unmount(); }); a.remove(); b.remove();
  });
});

describe("the four rows: explicit state, horizontal fill only where the adapter allows it", () => {
  const trackOf = (id: string) => row(id).querySelector(".ab-bar-track")!;
  const fillWidth = (id: string) => (trackOf(id).querySelector("i") as HTMLElement | null)?.style.width ?? null;
  const word = (id: string) => row(id).querySelector(".ab-bar-word")?.textContent;
  const pts = (id: string) => row(id).querySelector(".ab-bar-pts")?.textContent;

  it("known eligible outcome: Form and Dose are FILLED to the audit's own 3/4 and 2/4; Effect and Evidence are unfilled and say why", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    expect(trackOf("form").classList.contains("fill")).toBe(true);
    expect(fillWidth("form")).toBe("75%");
    expect([word("form"), pts("form")]).toEqual(["Close match", "3/4"]);
    expect(fillWidth("dose")).toBe("50%");
    expect([word("dose"), pts("dose")]).toEqual(["Partial match", "2/4"]);
    for (const id of ["effect", "evidence"]) {
      expect(trackOf(id).classList.contains("hatch"), id).toBe(true);
      expect(trackOf(id).querySelector("i"), id).toBeNull();
      expect(pts(id)).toBe("—");
    }
    expect(word("effect")).toBe(RESEARCH_CARD_COPY.en.axisWord.effectData);
    expect(row("effect").getAttribute("data-axis-state")).toBe("data");
    expect(row("form").getAttribute("data-axis-state")).toBe("filled");
    // the bars are decorative: the same facts are text beside them
    for (const id of ["effect", "evidence", "form", "dose"]) expect(trackOf(id).getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the established per-row colours (Effect r1, Evidence r4, Form r2, Dose r3) for a drawn fill", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    expect((trackOf("form").querySelector("i") as HTMLElement).style.background).toContain("--ab-r2");
    expect((trackOf("dose").querySelector("i") as HTMLElement).style.background).toContain("--ab-r3");
  });

  it("unknown outcome (nothing cited): all four rows unfilled and 'Not assessed' — never a zero fill, never 'no evidence'", () => {
    mount(audit());
    click(tabNamed("Muscle cramps"));
    for (const id of ["effect", "evidence", "form", "dose"]) {
      expect(trackOf(id).classList.contains("hatch"), id).toBe(true);
      expect(fillWidth(id)).toBeNull();
      expect(word(id)).toBe(RESEARCH_CARD_COPY.en.axisWord.not_assessed);
      expect(row(id).getAttribute("data-axis-state")).toBe("not_assessed");
    }
    expect(text()).not.toMatch(/no evidence (exists|found)|0\/4|0\/3/i);
  });

  it("scan facts unknown: Dose is 'Unknown' with the servings reason (no one-serving default); Form stays filled", () => {
    mount(audit(), facts({ servingsPerDay: null }));
    click(tabNamed("Sleep quality"));
    expect(row("dose").getAttribute("data-axis-state")).toBe("unknown");
    expect(word("dose")).toBe(RESEARCH_CARD_COPY.en.axisWord.unknown);
    expect(fillWidth("dose")).toBeNull();
    click(rowButton("dose"));
    expect(host.querySelector('[data-testid="research-axis-dose"]')?.textContent).toContain(RESEARCH_CARD_COPY.en.reasons.servings_not_stated);
    expect(row("form").getAttribute("data-axis-state")).toBe("filled");
  });

  it("each row expands and collapses with aria-expanded / aria-controls, and several rows can be read one after another", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    const effect = rowButton("effect");
    expect(effect.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector('[data-testid="research-axis-effect"]')).toBeNull();
    click(effect);
    expect(effect.getAttribute("aria-expanded")).toBe("true");
    const detail = host.querySelector('[data-testid="research-axis-effect"]')!;
    expect(effect.getAttribute("aria-controls")).toBe(detail.id);
    click(rowButton("evidence"));
    expect(effect.getAttribute("aria-expanded")).toBe("false");
    expect(rowButton("evidence").getAttribute("aria-expanded")).toBe("true");
    click(rowButton("evidence"));
    expect(host.querySelector('[data-testid="research-axis-evidence"]')).toBeNull();
    // switching tab closes whatever was open
    click(rowButton("form"));
    click(tabNamed("Muscle cramps"));
    expect(host.querySelector('[data-testid^="research-axis-"]')).toBeNull();
  });

  it("Effect expanded: the audit's own wording, estimate, study note, doubt, tier-as-text, found/missing/move and every source ID, untouched", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    click(rowButton("effect"));
    const d = host.querySelector('[data-testid="research-axis-effect"]')!.textContent!;
    for (const s of [SYN_QUOTE, SYN_DOUBT, "Mock absolute effect: +12 min (95% CI 3 to 21), ARR not derivable.", "unknown. Mock: no MCID established for sleep minutes.", "Mock effect found: +12 min.", "Mock effect missing: long-term follow-up.", "Mock effect move: a 24-week trial.", "Mock: a 24-week independent RCT of 400 mg elemental.", "PMID:10000001", "10.0000/mock.0002", "Mock note: pooled estimate, snippet only."]) expect(d).toContain(s);
    expect(d).toContain("Moderate benefit (2)"); // the model's tier, as text
    expect(d).toContain(RESEARCH_CARD_COPY.en.reasons.size_not_graded);
    expect(d).toContain(RESEARCH_CARD_COPY.en.axisStamp.data);
  });

  it("source links exist only for DOI / PMID / PMC shaped IDs; each source says it is a snippet, never a paper read", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    click(rowButton("effect"));
    const hrefs = Array.from(host.querySelectorAll<HTMLAnchorElement>('[data-testid="research-sources"] a')).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://pubmed.ncbi.nlm.nih.gov/10000001/", "https://doi.org/10.0000/mock.0002"]);
    const src = host.querySelector('[data-testid="research-sources"]')!.textContent!;
    expect(src).toContain("snippet");
    expect(src).toContain(RESEARCH_CARD_COPY.en.labels.sourcesNote);
    expect(src).not.toMatch(/paper (read|opened)|full text/i);
  });

  it("Evidence expanded: gates, body type and the checklist as the audit stated them; unknown is not a pass; the zero note shows when a 0 may mean 'not reported'", () => {
    mount(audit([outcome({ ledger: { checklist: { risk_of_bias: "concern", consistency: "unknown", precision: "supported", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 8, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false } } })]));
    click(tabNamed("Sleep quality"));
    click(rowButton("evidence"));
    const d = host.querySelector('[data-testid="research-axis-evidence"]')!.textContent!;
    expect(d).toContain("Randomised trials counted 8");
    expect(d).toContain("risk of bias: concern");
    expect(d).toContain("consistency: unknown");
    expect(d).toContain(RESEARCH_CARD_COPY.en.labels.uncheckedNote);
    expect(d).toContain(RESEARCH_CARD_COPY.en.labels.zeroNote);
    expect(d).toContain(RESEARCH_CARD_COPY.en.reasons.snippet_only);
    expect(d).toContain(SYN_EVIDENCE_FOUND);
  });

  it("Form and Dose expanded show the scan's own facts beside the audit's: form on the label, dose per serving, servings, daily dose, dose note, effective range", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    click(rowButton("form"));
    expect(host.querySelector('[data-testid="research-axis-form"]')?.textContent).toContain("Form on your scan Magnesium bisglycinate");
    expect(host.querySelector('[data-testid="research-axis-form"]')?.textContent).toContain("3 of 4");
    click(rowButton("dose"));
    const d = host.querySelector('[data-testid="research-axis-dose"]')!.textContent!;
    for (const s of ["Compound mass per serving 1000 mg", "Printed elemental amount per serving 200 mg", "Unit as printed mg", "Servings per day on your scan 2", "400 mg elemental per day (2 servings)", "Mock dose note: elemental amount as printed; two servings a day as supplied.", SYN_RANGE, "2 of 4", "Mock dose found: 300–400 mg elemental studied."]) expect(d).toContain(s);
  });

  it("a per-serving dose is shown unrounded as recorded (0.05 mg stays 0.05 mg)", () => {
    mount(audit(), facts({ compoundPerServingMg: 0.05, printedElementalPerServingMg: null, unitAsPrinted: "mcg" }));
    click(tabNamed("Sleep quality"));
    click(rowButton("dose"));
    const d = host.querySelector('[data-testid="research-axis-dose"]')!.textContent!;
    expect(d).toContain("Compound mass per serving 0.05 mg");
    expect(d).toContain("Unit as printed mcg");
    // the elemental basis was not printed: it is said to be unknown, and nothing is converted
    expect(d).toContain(`Printed elemental amount per serving ${RESEARCH_CARD_COPY.en.labels.elementalNotStated}`);
  });
});

describe("warnings: scoped to the selected outcome, counted, deduped, and silence is not 'no risk'", () => {
  it("shows the outcome's own warnings under the 'n evidence warnings' summary; the other outcome's warnings are not counted", () => {
    mount(audit(), facts({ servingsPerDay: null }));
    click(tabNamed("Sleep quality"));
    // product: servings_not_stated; outcome: methodology (risk of bias), funding, publication
    expect(warningIds()).toEqual(["servings_not_stated", "methodology", "funding", "publication"]);
    expect(warnings()?.getAttribute("data-warning-count")).toBe("4");
    expect(warnings()?.querySelector("summary")?.textContent).toBe(RESULT_COPY.en.warningCount(4));
    click(tabNamed("Muscle cramps"));
    // product: servings_not_stated; outcome: no randomised trial counted
    expect(warningIds()).toEqual(["servings_not_stated", "no_human_controlled_trial"]);
    expect(warnings()?.querySelector("summary")?.textContent).toBe(RESULT_COPY.en.warningCount(2));
  });

  it("funding and publication warnings quote the audit's own sentence verbatim and say they change no score", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    const d = host.querySelector('[data-warning="funding"]')!.textContent!;
    expect(d).toContain(RESEARCH_CARD_COPY.en.warnings.funding.body);
    expect(d).toContain(SYN_EVIDENCE_FOUND);
    expect(RESEARCH_CARD_COPY.en.warnings.funding.body).toMatch(/changes no score/);
    expect(RESEARCH_CARD_COPY.en.warnings.publication.body).toMatch(/changes no score/);
    expect(host.querySelector('[data-warning="methodology"]')?.textContent).toContain(RESEARCH_CARD_COPY.en.methodReasons.risk_of_bias);
  });

  it("a funding warning with no kept sentence says 'unknown', not 'absent'", () => {
    mount(audit([outcome({ detail: { effect: { found: "x", missing: "x", move: "x" }, evidence: { found: "nothing relevant", missing: "—", move: "—" }, form: { found: "x", missing: "x", move: "x" }, dose: { found: "x", missing: "x", move: "x" } } })]));
    click(tabNamed("Sleep quality"));
    expect(host.querySelector('[data-warning="funding"]')?.textContent).toContain(RESEARCH_CARD_COPY.en.noneReported);
  });

  it("an outcome with nothing recorded draws NO warnings block and says so without claiming safety", () => {
    mount(audit([outcome({ ledger: { checklist: { ...CHECKLIST_UNKNOWN }, gates: { rctCount: 4, largestRctN: 80, longestRctWeeks: 8, chronicOutcome: false, surrogate: false, allPositiveIndustryOrOneLab: false } } })]), facts());
    click(tabNamed("Sleep quality"));
    expect(warnings()).toBeNull();
    const note = host.querySelector('[data-testid="research-no-warning"]')!.textContent!;
    expect(note).toBe(RESEARCH_CARD_COPY.en.noWarning);
    expect(text()).not.toMatch(/\bno risks?\b|risk[- ]free|\bsafe\b|nothing is wrong\.(?! )/i);
  });

  it("the warnings block is a native disclosure: collapsed until opened, each warning its own disclosure", () => {
    mount(audit());
    click(tabNamed("Sleep quality"));
    const block = warnings() as HTMLDetailsElement;
    expect(block.tagName).toBe("DETAILS");
    expect(block.open).toBe(false);
    expect(block.querySelectorAll("details").length).toBe(3);
  });

  it("a blend scan: the blend warning (the existing blend note) is on every outcome tab, identical, once", () => {
    mount(blendAudit(), facts({ multiIngredient: true }));
    for (const name of ["This exact D3 + K2 product", "Bone density (D plus K context)"]) {
      click(tabNamed(name));
      expect(warningIds().filter((id) => id === "blend")).toHaveLength(1);
      expect(host.querySelector('[data-warning="blend"]')?.textContent).toContain(RESEARCH_COPY.en.blendNote);
    }
  });

  it("never prints a company, brand or MLM finding", () => {
    mount(blendAudit(), facts({ multiIngredient: true }));
    for (const name of ["This exact D3 + K2 product", "Bone density (D plus K context)"]) { click(tabNamed(name)); }
    expect(text()).not.toMatch(/multi-level|\bMLM\b|direct[- ]sales|business model|company profile|brand/i);
  });
});

describe("DO_NOT_GRADE: the user's D3 + K2 case and context rows", () => {
  it("the public D3 + K2 audit: one outcome, every row empty and named, the audit's finding expanded, no formula efficacy", () => {
    mount(publicD3K2Audit(), facts({ form: "Vitamin D3 (cholecalciferol)", servingsPerDay: null, multiIngredient: true }));
    click(tabNamed("Whole D3 + K2 product"));
    for (const r of rows()) {
      expect(r.querySelector(".ab-bar-track")?.classList.contains("hatch")).toBe(true);
      expect(r.querySelector(".ab-bar-track i")).toBeNull();
      expect(r.querySelector(".ab-bar-pts")?.textContent).toBe("—");
    }
    expect(row("effect").querySelector(".ab-bar-word")?.textContent).toBe(RESEARCH_CARD_COPY.en.axisWord.not_assessed);
    expect(row("form").querySelector(".ab-bar-word")?.textContent).toBe(RESEARCH_CARD_COPY.en.axisWord.not_gradeable);
    click(rowButton("effect"));
    const d = host.querySelector('[data-testid="research-axis-effect"]')!.textContent!;
    expect(d).toContain("No verified study of this exact combination was found.");
    expect(d).toContain(RESEARCH_CARD_COPY.en.reasons.no_source);
    click(rowButton("evidence"));
    expect(host.querySelector('[data-testid="research-axis-evidence"]')?.textContent).toContain("Nothing could be confirmed. This is a case of no verified evidence, not evidence of no benefit.");
    expect(text().match(/effective for (this|the) (product|formula)|probably works/i)?.[0] ?? null).toBeNull();
  });

  it("a CONTEXT ONLY row: tagged on its tab, banner on its page, every row 'Not gradeable' and unfilled even though the audit gave 3 / 4 / 0", () => {
    mount(blendAudit(), facts({ multiIngredient: true, servingsPerDay: 1 }));
    const tab = tabNamed("Bone density (D plus K context)");
    expect(tab.textContent).toContain(RESEARCH_CARD_COPY.en.contextTag);
    expect(host.querySelectorAll('[data-testid="research-outcome-list"] > li')[1].getAttribute("data-context")).toBe("true");
    click(tab);
    expect(host.querySelector('[data-testid="research-context-banner"]')?.textContent).toBe(RESEARCH_CARD_COPY.en.contextBanner);
    for (const r of rows()) {
      expect(r.getAttribute("data-axis-state")).toBe("not_gradeable");
      expect(r.querySelector(".ab-bar-word")?.textContent).toBe(RESEARCH_CARD_COPY.en.axisWord.not_gradeable);
      expect(r.querySelector(".ab-bar-track i")).toBeNull();
    }
    expect(text()).toContain("CONTEXT ONLY: single ingredient, not this product."); // the population, verbatim
    click(rowButton("dose"));
    const d = host.querySelector('[data-testid="research-axis-dose"]')!.textContent!;
    expect(d).toContain("0 of 4"); // the audit's own text, not drawn
    expect(d).toContain(RESEARCH_CARD_COPY.en.labels.textOnly);
  });

  it("the exact-combination row is never given the component row's numbers", () => {
    mount(blendAudit(), facts({ multiIngredient: true }));
    click(tabNamed("This exact D3 + K2 product"));
    expect(rows().every((r) => r.querySelector(".ab-bar-track i") === null)).toBe(true);
    expect(text()).not.toContain("4/4");
  });
});

describe("no score anywhere: no headline, no general number, no band", () => {
  it("has no number tile, no General score, no percentage and no band word on the list or on any outcome tab", () => {
    mount(audit());
    const check = () => {
      expect(host.querySelector(".ab-number, .ab-general, .ab-general-score")).toBeNull();
      // the chrome that carries a score in the approved card: tabs, state words and the number column
      const chrome = Array.from(host.querySelectorAll(".ab-tabs, .ab-bar-word, .ab-bar-pts, .ab-warnings > summary")).map((n) => n.textContent).join(" | ");
      expect(chrome.match(/General score|Not scored|Probably works|Works\b|Evidence against|\d+\s*\/\s*100|\d+%/)?.[0] ?? null).toBeNull();
      expect(chrome.match(/\d+\s*\/\s*3\b/)?.[0] ?? null).toBeNull(); // no effect 0-3 number either
    };
    check();
    for (const t of tabs()) { click(t); check(); }
  });
});

describe("Lithuanian", () => {
  it("has identical structure in both languages, no empty LT string, and no LT string equal to its English twin", () => {
    const shape = (v: unknown): unknown => (typeof v === "function" ? "fn" : typeof v === "string" ? "str" : Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shape(x)])));
    expect(shape(RESEARCH_CARD_COPY.lt)).toEqual(shape(RESEARCH_CARD_COPY.en));
    const leaves = (v: unknown): string[] => (typeof v === "string" ? [v] : typeof v === "function" ? [(v as (n: number) => string)(2)] : v && typeof v === "object" ? Object.values(v).flatMap(leaves) : []);
    const en = new Set(leaves(RESEARCH_CARD_COPY.en));
    for (const v of leaves(RESEARCH_CARD_COPY.lt)) { expect(v.trim()).not.toBe(""); if (v.length > 6) expect(en.has(v)).toBe(false); }
  });

  it("the whole card's controls, states, reasons and warnings are Lithuanian; the model's text is verbatim in an element tagged lang=en", () => {
    mount(audit(), facts({ servingsPerDay: null }), "lt");
    const c = RESEARCH_CARD_COPY.lt;
    const r = RESULT_COPY.lt;
    expect(tabs()[0].textContent).toBe(r.outcomesTab);
    expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(r.outcomeTablist);
    expect(host.querySelector(".scan-lab-validity")?.textContent).toContain(c.stamp);
    click(tabNamed("Sleep quality"));
    expect(rows().map((x) => x.querySelector(".ab-bar-name")?.textContent)).toEqual([r.dimEffect, r.dimEvidence, r.dimForm, r.dimDose]);
    expect(warnings()?.querySelector("summary")?.textContent).toBe(r.warningCount(4));
    expect(row("effect").querySelector(".ab-bar-word")?.textContent).toBe(c.axisWord.effectData);
    expect(row("dose").querySelector(".ab-bar-word")?.textContent).toBe(c.axisWord.unknown);
    expect(row("form").querySelector(".ab-bar-word")?.textContent).toBe("Artimas atitikimas");
    click(rowButton("effect"));
    const d = host.querySelector('[data-testid="research-axis-effect"]')!;
    expect(d.textContent).toContain(c.reasons.size_not_graded);
    expect(d.textContent).toContain("Vidutinė nauda (2)");
    for (const s of [SYN_QUOTE, SYN_DOUBT, "Mock effect found: +12 min.", "PMID:10000001"]) {
      const holder = Array.from(d.querySelectorAll('[lang="en"]')).find((n) => n.textContent?.includes(s));
      expect(holder, s).toBeTruthy();
    }
    // the research's own sentences are English, tagged, and not translated
    click(tabNamed(r.outcomesTab));
    const sentence = Array.from(host.querySelectorAll('[lang="en"]')).find((n) => n.textContent === SYN_SENTENCE);
    expect(sentence).toBeTruthy();
    click(tabNamed("Sleep quality"));
    const warn = warnings()!;
    expect(warn.textContent).toContain(c.warnings.servings_not_stated.title);
    expect(warn.textContent).toContain("(prielaida nedaroma)");
  });

  it("no English copy string of the card appears outside an element tagged lang=en in the Lithuanian view", () => {
    mount(audit(), facts({ servingsPerDay: null }), "lt");
    click(tabNamed("Sleep quality"));
    for (const id of ["effect", "evidence", "form", "dose"]) { click(rowButton(id)); }
    click(rowButton("effect"));
    for (const w of host.querySelectorAll("[data-warning]")) (w as HTMLDetailsElement).open = true;
    const clone = host.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[lang="en"]').forEach((n) => { n.querySelectorAll('[lang="lt"]').forEach((l) => n.before(l)); n.remove(); });
    const visible = clone.textContent ?? "";
    const english: string[] = [];
    const collect = (v: unknown) => { if (typeof v === "string") english.push(v); else if (v && typeof v === "object") Object.values(v).forEach(collect); };
    collect(RESEARCH_CARD_COPY.en.reasons); collect(RESEARCH_CARD_COPY.en.axisStamp); collect(RESEARCH_CARD_COPY.en.axisWord); collect(RESEARCH_CARD_COPY.en.warnings); collect(RESEARCH_CARD_COPY.en.labels.sourcesNote);
    for (const s of english) expect(visible, s).not.toContain(s);
  });
});

describe("regression: GATES_NONE / UNKNOWN_ROW fixtures stay schema-shaped", () => {
  it("keeps the helper fixtures honest (an audit row with nothing cited renders its four rows)", () => {
    mount(audit([UNKNOWN_ROW()]));
    click(tabNamed("Muscle cramps"));
    expect(rows()).toHaveLength(4);
    expect(GATES_NONE.rctCount).toBe(0);
    expect(KNOWN_FACTS.multiIngredient).toBe(false);
  });
});
