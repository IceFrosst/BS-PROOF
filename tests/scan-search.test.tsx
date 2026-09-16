/*
 * The /scan surface, carried forward through the 2026-09-16 dark camera-first
 * redesign:
 *
 *   - the "Search for your supplement" combobox is operable by KEYBOARD alone
 *     and follows the ARIA combobox pattern (role, expanded, activedescendant,
 *     listbox/option, Arrow / Enter / Escape), then demands the exact form
 *   - matchCatalog ranks label > alias > form and finds an ingredient by the
 *     name printed on a tub ("bisglycinate", "Magtein")
 *   - / stays the waitlist with no scanner; /scan carries the capture input,
 *     the upload input, the search sheet and no waitlist; /tester is not
 *     touched by any of it
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import ScanPage from "@/app/scan/page";
import TesterPage from "@/app/tester/page";
import { matchCatalog, SupplementSearch } from "@/components/supplement-search";
import { ingredientCatalog } from "@/lib/analyze/catalog";
import type { ManualScanInput } from "@/lib/analyze/scan";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const catalog = ingredientCatalog();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function mount(onSubmit: (input: ManualScanInput) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(SupplementSearch, { catalog, busy: false, onSubmit }));
  });
  return container;
}

function combobox(el: HTMLElement): HTMLInputElement {
  const input = el.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!input) throw new Error("no combobox rendered");
  return input;
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    // React reads the tracked value; set it natively then fire the input event.
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

describe("matchCatalog", () => {
  it("ranks a label prefix first and finds an ingredient by a form's printed name", () => {
    expect(matchCatalog(catalog, "")).toEqual([]);
    expect(matchCatalog(catalog, "mag")[0].ingredient.id).toBe("magnesium");
    expect(matchCatalog(catalog, "Vitamin")[0].ingredient.label).toMatch(/^Vitamin/);
    const viaForm = matchCatalog(catalog, "bisglycinate");
    expect(viaForm.map((m) => m.ingredient.id)).toEqual(expect.arrayContaining(["magnesium", "iron", "zinc"]));
    expect(viaForm.find((m) => m.ingredient.id === "magnesium")?.via).toMatch(/bisglycinate/i);
    expect(matchCatalog(catalog, "magtein")[0]).toMatchObject({ ingredient: { id: "magnesium" }, via: "Magtein" });
    expect(matchCatalog(catalog, "turmeric")[0].ingredient.id).toBe("curcumin");
    expect(matchCatalog(catalog, "unobtainium")).toEqual([]);
    expect(matchCatalog(catalog, "i").length).toBeLessThanOrEqual(8);
  });
});

describe("SupplementSearch combobox", () => {
  it("is operable by keyboard: type, arrow, enter selects; escape closes; exact form is then required", async () => {
    const submitted: ManualScanInput[] = [];
    const el = await mount((input) => submitted.push(input));
    const input = combobox(el);

    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    const listId = input.getAttribute("aria-controls");
    expect(listId).toBeTruthy();

    await type(input, "mag");
    const list = el.querySelector<HTMLUListElement>(`#${listId}`);
    expect(list?.getAttribute("role")).toBe("listbox");
    expect(list?.hidden).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const options = [...(list?.querySelectorAll('[role="option"]') ?? [])];
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].textContent).toContain("Magnesium");
    // Nothing active until the user arrows.
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);

    await key(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");

    await key(input, "Escape");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(list?.hidden).toBe(true);

    await key(input, "ArrowDown");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    await key(input, "Enter");

    // Selected: the input shows the label, the list closes, the form select appears with no default.
    expect(input.value).toBe("Magnesium");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    const select = el.querySelector<HTMLSelectElement>("select");
    expect(select).toBeTruthy();
    expect(select?.value).toBe("");
    const formIds = [...(select?.querySelectorAll("option") ?? [])].map((o) => o.value).filter(Boolean);
    expect(formIds).toEqual(catalog.find((i) => i.id === "magnesium")?.forms.map((f) => f.id));
    // "not stated" is offered, but last.
    expect(formIds[formIds.length - 1]).toBe("magnesium_unspecified");
    const submit = el.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(true);

    // Pick the form; the dose fieldset appears with mg/g/mcg and nothing else.
    await act(async () => {
      if (select) {
        select.value = "magnesium_glycinate";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const units = [...el.querySelectorAll<HTMLOptionElement>("select option")].map((o) => o.value).filter((v) => ["mg", "g", "mcg", "IU"].includes(v));
    expect(units).toEqual(["mg", "g", "mcg"]);
    expect(submit?.disabled).toBe(false);

    const dose = el.querySelector<HTMLInputElement>('input[type="number"][inputmode="decimal"]');
    if (!dose) throw new Error("no dose input");
    await type(dose, "2000");
    await act(async () => {
      el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(submitted).toEqual([{ ingredient: "magnesium", form: "magnesium_glycinate", dose: { value: 2000, unit: "mg" }, servings_per_day: null }]);
  });

  it("refuses to submit without a form and tells the user why", async () => {
    const onSubmit = vi.fn();
    const el = await mount(onSubmit);
    const input = combobox(el);
    await type(input, "creatine");
    await key(input, "ArrowDown");
    await key(input, "Enter");
    expect(input.value).toBe("Creatine");
    await act(async () => {
      el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/exact form/i);
  });

  it("clears dose, unit and servings when the ingredient changes, so hidden stale values cannot submit", async () => {
    const submitted: ManualScanInput[] = [];
    const el = await mount((input) => submitted.push(input));
    const input = combobox(el);

    // Pick creatine monohydrate and fill in every detail field.
    await type(input, "creatine");
    await key(input, "ArrowDown");
    await key(input, "Enter");
    const pickForm = async (id: string) => {
      const select = el.querySelector<HTMLSelectElement>("select");
      await act(async () => {
        if (select) {
          select.value = id;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    };
    await pickForm("creatine_monohydrate");
    const dose = () => el.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    const servings = () => el.querySelector<HTMLInputElement>('input[inputmode="numeric"]');
    const unit = () => [...el.querySelectorAll<HTMLSelectElement>("select")].find((s) => s.value === "mg" || s.value === "g" || s.value === "mcg");
    await type(dose()!, "5");
    await type(servings()!, "2");
    await act(async () => {
      const u = unit();
      if (u) {
        u.value = "g";
        u.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(dose()?.value).toBe("5");
    expect(unit()?.value).toBe("g");
    expect(servings()?.value).toBe("2");
    // The field limits match the shared validation.
    expect(dose()?.getAttribute("max")).toBe("100");
    expect(servings()?.getAttribute("min")).toBe("1");
    expect(servings()?.getAttribute("max")).toBe("24");
    expect(servings()?.getAttribute("step")).toBe("1");

    // Retype the ingredient: the detail fields disappear AND their state is gone.
    await type(input, "mag");
    expect(el.querySelector("select")).toBeNull();
    expect(dose()).toBeNull();
    await key(input, "ArrowDown");
    await key(input, "Enter");
    expect(input.value).toBe("Magnesium");
    await pickForm("magnesium_glycinate");
    expect(dose()?.value).toBe("");
    expect(unit()?.value).toBe("mg");
    expect(servings()?.value).toBe("");
    expect(dose()?.getAttribute("max")).toBe("100000");

    await act(async () => {
      el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(submitted).toEqual([{ ingredient: "magnesium", form: "magnesium_glycinate", dose: null, servings_per_day: null }]);
  });

  it("refuses an over-ceiling dose and a fractional or over-limit servings count with the server's wording", async () => {
    const onSubmit = vi.fn();
    const el = await mount(onSubmit);
    const input = combobox(el);
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
    const dose = el.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    const servings = el.querySelector<HTMLInputElement>('input[inputmode="numeric"]');
    if (!dose || !servings) throw new Error("dose fields not rendered");
    const submit = async () =>
      act(async () => {
        el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    const alert = () => el.querySelector('[role="alert"]')?.textContent ?? "";

    await type(dose, "100001");
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alert()).toMatch(/too large/);

    await type(dose, "5000");
    await type(servings, "1.5");
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alert()).toMatch(/whole number/);

    await type(servings, "25");
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alert()).toMatch(/24 or fewer/);

    await type(servings, "24");
    await submit();
    expect(onSubmit).toHaveBeenCalledWith({ ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 5000, unit: "mg" }, servings_per_day: 24 });
  });

  it("hides the mass dose for a CFU-counted ingredient", async () => {
    const el = await mount(() => undefined);
    const input = combobox(el);
    await type(input, "probiotic");
    await key(input, "ArrowDown");
    await key(input, "Enter");
    const select = el.querySelector<HTMLSelectElement>("select");
    await act(async () => {
      if (select) {
        select.value = "lactobacillus_rhamnosus_gg";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(el.querySelector('input[inputmode="decimal"]')).toBeNull();
    expect(el.textContent).toMatch(/counted in CFU/i);
  });
});

describe("/ vs /scan vs /tester", () => {
  it("the waitlist page offers no scanner and no search", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    expect(html).toContain('class="waitlist-input');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Take a photo");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("/tester");
    expect(html).not.toContain("/scan");
  });

  it("the scan page is dark, camera-first, and carries no waitlist", () => {
    const html = renderToStaticMarkup(createElement(ScanPage));
    expect(html).toContain('class="scan-page"');
    expect(html).toContain("/scan-mark.svg");
    // The camera fallback file input exists (getUserMedia cannot run in
    // renderToStaticMarkup / SSR at all, so ScanCamera always server-renders
    // its fallback fill -- exactly the "unavailable" state a real denial
    // reaches) and it still carries `capture="environment"`, unconditionally
    // mounted so the 2026-09-15 fallback path never regresses.
    const inputTag = (id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    expect(inputTag("scan-capture")).toContain('type="file"');
    expect(inputTag("scan-capture")).toContain('capture="environment"');
    // ...and a plain upload input remains as the fallback, without capture.
    expect(inputTag("scan-file")).toContain('type="file"');
    expect(inputTag("scan-file")).not.toContain("capture=");
    // The page's single H1 is the overlay headline on the camera block, exact
    // founder copy, and still carries #scan-title for tests/e2e continuity.
    expect(html).toMatch(/<h1[^>]*id="scan-title"[^>]*>Does your Supplement actually work\?<\/h1>/);
    expect(html).toContain("Scan and see.");
    expect((html.match(/<h1[^>]*>/g) ?? []).length).toBe(1);
    // "Search your supplement" is a button ABOVE the capture block, opening a
    // dialog (not the 2026-09-15 inline expand/collapse panel) -- order in
    // the first viewport: search cta, then the capture controls.
    const order = ["Search your supplement", "sc-viewfinder", "Upload a photo"].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // No inline expand/collapse toggle or "or" divider survive the redesign.
    expect(html).not.toContain("sc-search-toggle");
    expect(html).not.toContain('role="separator"');
    expect(html).not.toContain("waitlist-input");
    // The old dark .analyze-hero (from /tester) never appears here either --
    // this page has its own dark styling scoped to .scan-page, not that class.
    expect(html).not.toContain("analyze-hero");
  });

  it("'Search your supplement' opens an accessible dialog carrying the combobox", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const { ScanFlow } = await import("@/components/scan-flow");
    const { ingredientCatalog } = await import("@/lib/analyze/catalog");
    await act(async () => {
      root?.render(createElement(ScanFlow, { catalog: ingredientCatalog() }));
    });
    const cta = Array.from(container.querySelectorAll("button")).find((b) => /search your supplement/i.test(b.textContent ?? ""));
    expect(cta).toBeTruthy();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      cta?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.querySelector('input[role="combobox"]')).toBeTruthy();
    const closeBtn = dialog?.querySelector<HTMLButtonElement>('button[aria-label="Close search"]');
    await act(async () => {
      closeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("the tester page is untouched: dark hero, its own analyzer, no search control", () => {
    const html = renderToStaticMarkup(createElement(TesterPage));
    expect(html).toContain("analyze-hero");
    expect(html).toContain("la-drop");
    expect(html).not.toContain("Search for your supplement");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("scan-page");
  });
});
