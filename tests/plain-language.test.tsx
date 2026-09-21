/*
 * The lab A/B card reads in plain language by default; the audit's own wording
 * stays verbatim behind "Exact wording from the audit". These tests pin both
 * halves of that deal — the rewrite is shown, the original is still in the DOM,
 * and a field the sidecar never covered falls back to the audit text instead of
 * disappearing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AbPrototype from "@/app/design-lab/ab/prototype";
import { outcomeKey } from "@/app/design-lab/ab/effect-presentation";
import {
  PLAIN_DIMENSIONS, VERBATIM_SUMMARY, parsePlainFile, plainFor, plainPair, plainText,
  type PlainDimension, type PlainProductKey,
} from "@/app/design-lab/ab/plain-language";
import type { AuditFile } from "@/app/design-lab/ab/ledger";
import creatine from "@/app/design-lab/ab/audits/creatine.json";
import vitaminD from "@/app/design-lab/ab/audits/vitamin-d.json";
import magnesium from "@/app/design-lab/ab/audits/magnesium.json";

type AuditOutcome = AuditFile["outcomes"][number] & { absolute_effect?: string; clinically_meaningful?: string };
const products: { key: PlainProductKey; file: string; audit: AuditFile }[] = [
  { key: "creatine", file: "creatine.json", audit: creatine as unknown as AuditFile },
  { key: "vitaminD", file: "vitamin-d.json", audit: vitaminD as unknown as AuditFile },
  { key: "magnesium", file: "magnesium.json", audit: magnesium as unknown as AuditFile },
];
const byName = (a: AuditFile, name: string): AuditOutcome => {
  const o = a.outcomes.find((x) => x.name === name);
  if (!o) throw new Error(`no outcome ${name}`);
  return o as AuditOutcome;
};
/** React escapes &, <, >, " and ' in text nodes; compare escaped so a quoted sentence still matches. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("plain-language sidecars", () => {
  it("(a) every retained audit outcome has a sidecar entry with all four dimensions", () => {
    for (const { key, audit } of products) {
      for (const o of audit.outcomes) {
        const entry = plainFor(key, outcomeKey(o.name, o.population));
        expect(entry, `${key} / ${o.name}`).not.toBeNull();
        for (const dim of PLAIN_DIMENSIONS) {
          expect(entry?.[dim]?.found, `${key} / ${o.name} / ${dim}.found`).toBeTruthy();
        }
        expect(entry?.summary, `${key} / ${o.name} / summary`).toBeTruthy();
      }
    }
    expect(products.reduce((n, p) => n + p.audit.outcomes.length, 0)).toBe(30);
  });

  it("(b) each sidecar file parses, is keyed name||population, and holds no empty string", () => {
    for (const { key, file } of products) {
      const raw: unknown = JSON.parse(readFileSync(`app/design-lab/ab/audits/plain/${file}`, "utf8"));
      expect(() => parsePlainFile(raw, file)).not.toThrow();
      const parsed = parsePlainFile(raw, file);
      expect(Object.keys(parsed).length).toBeGreaterThan(0);
      for (const [outcome, entry] of Object.entries(parsed)) {
        expect(outcome, `${key} key`).toContain("||");
        const groups = entry as unknown as Record<string, Record<string, string>>;
        for (const [group, fields] of Object.entries(groups)) {
          for (const [field, text] of Object.entries(fields)) {
            expect(text.trim(), `${key} / ${outcome} / ${group}.${field}`).not.toBe("");
          }
        }
      }
    }
  });

  it("(b2) a malformed or blank sidecar is rejected at load, not rendered as a gap", () => {
    expect(() => parsePlainFile({ "a||b": { effect: { found: "   " } } }, "t")).toThrow(/empty/);
    expect(() => parsePlainFile({ "no-population-key": { effect: { found: "x" } } }, "t")).toThrow(/name.*population/);
    expect(() => parsePlainFile({ "a||b": { nonsense: { found: "x" } } }, "t")).toThrow(/unknown group/);
    expect(() => parsePlainFile({ "a||b": { effect: { nonsense: "x" } } }, "t")).toThrow(/unknown field/);
    expect(() => parsePlainFile("not an object", "t")).toThrow();
  });

  it("(c) the card renders the plain body and keeps the audit's exact wording inside the details", () => {
    const o = byName(products[0].audit, "Strength when you lift weights");
    const key = outcomeKey(o.name, o.population);
    const entry = plainFor("creatine", key);
    const plainFound = entry?.effect?.found ?? "";
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "creatine", outcome: key, open: "effect" }} />);

    expect(html).toContain(esc(plainFound));
    expect(html).toContain(esc(o.detail.effect.found));
    expect(html).toContain(VERBATIM_SUMMARY);
    // Plain text above the disclosure, audit wording below it.
    const cut = html.indexOf(VERBATIM_SUMMARY);
    expect(html.indexOf(esc(plainFound))).toBeLessThan(cut);
    expect(html.indexOf(esc(o.detail.effect.found))).toBeGreaterThan(cut);
    // Reported-effect lines get the same treatment, both versions present.
    expect(html).toContain(esc(entry?.summary?.absolute_effect ?? ""));
    expect(html).toContain(esc(o.absolute_effect ?? ""));
    // Untouched: the audit stamp, the labels and the source links.
    expect(html).toContain("Previous AI audit · not reverified");
    expect(html).toContain("Found");
    expect(html).toContain("Missing");
    expect(html).toContain("Would move it");
    expect(html).toContain("pubmed.ncbi.nlm.nih.gov");
    // The plain layer says it is a rewrite where the original is revealed.
    expect(html).toContain("Plain-language rewrite");
  });

  it("(c2) every retained outcome shows its plain Effect text with the audit sentence still in the DOM", () => {
    for (const { key, audit } of products) {
      for (const o of audit.outcomes) {
        const rowKey = outcomeKey(o.name, o.population);
        const entry = plainFor(key, rowKey);
        const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: key, outcome: rowKey, open: "effect" }} />);
        expect(html, `${key} / ${o.name} plain`).toContain(esc(entry?.effect?.found ?? ""));
        expect(html, `${key} / ${o.name} original`).toContain(esc(o.detail.effect.found));
        expect(html, `${key} / ${o.name} details`).toContain(VERBATIM_SUMMARY);
      }
    }
  });

  it("(c3) the Evidence row keeps its current-rubric sentence on both the plain body and the original", () => {
    const o = byName(products[1].audit, "Fractures with calcium, frail 70+");
    const key = outcomeKey(o.name, o.population);
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "vitaminD", outcome: key, open: "evidence" }} />);
    expect(html).toContain(esc(plainFor("vitaminD", key)?.evidence?.found ?? ""));
    // The audit's own limitations prose, verbatim, is still there.
    expect(html).toContain("nephrolithiasis RR 1.17");
    expect((html.match(/Current rubric:/g) ?? []).length).toBe(2);
  });

  it("(d) a field the sidecar does not cover falls back to the audit's own text", () => {
    // Unit: an absent key, an absent group and an absent entry all fall back.
    const original = "AUDIT SENTENCE";
    expect(plainPair(null, "effect", "found", original)).toEqual({ plain: original, original, rewritten: false });
    expect(plainPair({ effect: { found: "plain" } }, "effect", "missing", original).plain).toBe(original);
    expect(plainPair({ effect: { found: "plain" } }, "dose", "move", original).rewritten).toBe(false);
    expect(plainText({ effect: { found: "plain" } }, "effect", "found", original)).toBe("plain");
    expect(plainFor("not-a-product", "x||y")).toBeNull();

    // Real fallback in the shipped data: creatine's Form group has no "move".
    const o = byName(products[0].audit, "Strength when you lift weights");
    const key = outcomeKey(o.name, o.population);
    const entry = plainFor("creatine", key);
    expect(entry?.form?.move).toBeUndefined();
    expect(plainText(entry, "form" as PlainDimension, "move", o.detail.form.move)).toBe(o.detail.form.move);
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "creatine", outcome: key, open: "form" }} />);
    expect(html).toContain(esc(entry?.form?.found ?? ""));
    expect(html).toContain(esc(o.detail.form.missing));
    expect(html).toContain(esc(o.detail.form.move));
  });
});
