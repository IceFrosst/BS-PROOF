import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AbPrototype from "@/app/design-lab/ab/prototype";
import { score, ledgerFromAudit, type AuditFile, type Ledger } from "@/app/design-lab/ab/ledger";
import { auditWarnings, evidenceDetail, gateWarnings, productWarnings } from "@/app/design-lab/ab/evidence-warnings";
import { businessModelDisclosure } from "@/lib/analyze/business-model";
import { outcomeKey } from "@/app/design-lab/ab/effect-presentation";
import creatine from "@/app/design-lab/ab/audits/creatine.json";
import vitaminD from "@/app/design-lab/ab/audits/vitamin-d.json";
import magnesium from "@/app/design-lab/ab/audits/magnesium.json";

const audits = [creatine, vitaminD, magnesium] as unknown as AuditFile[];
const byName = (a: AuditFile, name: string) => {
  const o = a.outcomes.find((x) => x.name === name);
  if (!o) throw new Error(`no outcome ${name}`);
  return o;
};
describe("test-site disclosure-only policy", () => {
  it("funding and publication-bias state cannot change any scored field, in any retained outcome", () => {
    for (const audit of audits) for (const o of audit.outcomes) {
      const l = ledgerFromAudit(o);
      const baseline = score(l);
      for (const publication_bias of ["concern", "supported", "unknown"] as const) {
        for (const allPositiveIndustryOrOneLab of [true, false]) {
          expect(score({ ...l, checklist: { ...l.checklist, publication_bias }, gates: { ...l.gates, allPositiveIndustryOrOneLab } })).toEqual(baseline);
        }
      }
    }
  });
  it("still deducts methodological concerns and preserves non-funding caps", () => {
    const l = ledgerFromAudit(audits[0].outcomes[0]);
    const large = { ...l, gates: { ...l.gates, largestRctN: 300, longestRctWeeks: 12, surrogate: false } };
    expect(score({ ...large, checklist: { ...large.checklist, risk_of_bias: "concern" } }).certainty).toBe(score(large).certainty - 1);
    expect(score({ ...large, gates: { ...large.gates, rctCount: 1 } }).certainty).toBe(1);
    expect(score({ ...large, gates: { ...large.gates, rctCount: 0 } }).headline).toBeNull();
    expect(score(l).certainty).toBe(2); // small-RCT cap, not funding
  });
  /* Founder decision 2026-09-16: a warning is built ONLY for a real concern.
   * Unknown / supported / not-assessed build nothing at all. */
  it("keeps a reported concern visible as a warning", () => {
    const o = audits[0].outcomes[0]; // publication_bias: concern, industry/one-lab flag: false
    const w = auditWarnings(o);
    expect(w.map((x) => x.id)).toEqual(["publication"]);
    expect(w[0].status).toBe("Concern reported");
    expect(w[0].reported.join(" ")).toContain("Egger");
    expect(evidenceDetail(ledgerFromAudit(o), "found", "move").missing).not.toContain("publication bias (one point");
  });

  it("builds no warning at all when nothing is reported, and both when both are", () => {
    const o = audits[0].outcomes[0];
    const quiet = { ...o, ledger: { ...o.ledger, checklist: { ...o.ledger.checklist, publication_bias: "unknown" } } } as AuditFile["outcomes"][number];
    expect(auditWarnings(quiet)).toEqual([]);
    const supported = { ...o, ledger: { ...o.ledger, checklist: { ...o.ledger.checklist, publication_bias: "supported" } } } as AuditFile["outcomes"][number];
    expect(auditWarnings(supported)).toEqual([]);
    const both = { ...o, ledger: { ...o.ledger, gates: { ...o.ledger.gates, allPositiveIndustryOrOneLab: true } } } as AuditFile["outcomes"][number];
    expect(auditWarnings(both).map((x) => x.id)).toEqual(["funding", "publication"]);
    expect(auditWarnings(both)[0].status).toBe("Funding / one-lab flag reported");
    // Every retained audit outcome whose state is unknown/supported is silent.
    for (const audit of audits) for (const row of audit.outcomes) {
      const ids = auditWarnings(row).map((x) => x.id);
      expect(ids.includes("publication")).toBe(row.ledger.checklist.publication_bias === "concern");
      expect(ids.includes("funding")).toBe(row.ledger.gates.allPositiveIndustryOrOneLab === true);
    }
  });

  it("renders no warnings block for an outcome whose funding and publication status are unknown", () => {
    // Magnesium 'Sleep quality (poor sleepers)': publication_bias unknown and no
    // industry/one-lab flag. Nothing to disclose, so nothing is drawn.
    const o = byName(audits[2], "Sleep quality (poor sleepers)");
    expect(o.ledger.checklist.publication_bias).toBe("unknown");
    expect(o.ledger.gates.allPositiveIndustryOrOneLab).toBe(false);
    expect(auditWarnings(o)).toEqual([]);
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "magnesium", outcome: outcomeKey(o.name, o.population) }} />);
    expect(html).not.toContain("ab-warnings");
    expect(html).not.toContain("evidence warning");
    expect(html).not.toContain("Funding completeness unknown");
    expect(html).not.toContain("Not established");
  });
  it("public page offers six real fixtures, no fictional picker or fake research interaction", () => {
    const html = renderToStaticMarkup(<AbPrototype publicTest />);
    expect(html).toContain("SUPPLEMENT TEST SITE");
    expect(html).toContain("not human-verified");
    expect(html).toContain("not a live research service");
    expect(html).not.toContain("Fictional test ledgers");
    expect(html).not.toContain("PHOTO PLACEMENT");
    expect((html.match(/aria-pressed="(?:true|false)"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
  it("keeps the audit's own Evidence limitations, including harm estimates, on the public card", () => {
    const o = byName(audits[1], "Fractures with calcium, frail 70+");
    const d = evidenceDetail(ledgerFromAudit(o), "f", "m", o.detail.evidence.missing);
    expect(d.missing).toContain("nephrolithiasis RR 1.17");
    expect(d.missing).toContain("Funding and publication bias are separate clickable warnings");
    expect(d.missing).not.toMatch(/publication[^.]*one point/i);
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "vitaminD", outcome: outcomeKey(o.name, o.population), open: "evidence" }} />);
    expect(html).toContain("nephrolithiasis RR 1.17");
  });

  it("carries every retained audit's limitations prose into the rendered Evidence row", () => {
    for (const [product, audit, name, needle] of [
      ["vitaminD", audits[1], "Treating depression", "heterogeneity is 88%"],
      ["magnesium", audits[2], "Falling asleep faster, age 55+", "rests on 55 people"],
      ["creatine", audits[0], "Sprint power without lifting", "interaction p = 0.022"],
    ] as const) {
      const o = byName(audit, name);
      const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product, outcome: outcomeKey(o.name, o.population), open: "evidence" }} />);
      expect(html, `${product} / ${name}`).toContain(needle);
    }
  });

  it("funding warning quotes independence disclosures only, not any sentence containing 'author'", () => {
    // The flag decides WHETHER the warning exists; this pins WHAT it quotes.
    const flagged = (a: AuditFile, name: string) => {
      const o = byName(a, name);
      const forced = { ...o, ledger: { ...o.ledger, gates: { ...o.ledger.gates, allPositiveIndustryOrOneLab: true } } } as AuditFile["outcomes"][number];
      return auditWarnings(forced).find((x) => x.id === "funding")!.reported.join(" ");
    };
    const lean = flagged(audits[0], "Lean mass (part is water)");
    expect(lean).toContain("industry sponsorship");
    expect(lean).toContain("conflict-of-interest");
    expect(flagged(audits[2], "Sleep quality (poor sleepers)")).toContain("co-author of the exact-form trial");
    expect(flagged(audits[2], "Constipation relief")).not.toContain("first of its kind");
  });

  it("survives an audit outcome with no evidence detail instead of blanking the page", () => {
    const o = byName(audits[0], "Lean mass (part is water)");
    const partial = { ...o, detail: {}, ledger: { ...o.ledger, gates: { ...o.ledger.gates, allPositiveIndustryOrOneLab: true }, checklist: { ...o.ledger.checklist, publication_bias: "concern" } } } as unknown as AuditFile["outcomes"][number];
    expect(() => auditWarnings(partial)).not.toThrow();
    expect(auditWarnings(partial)).toHaveLength(2);
    expect(auditWarnings(partial).every((w) => w.reported.length === 0)).toBe(true);
  });

  it("public card names the model and run date, like the lab page does", () => {
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "creatine" }} />);
    expect(html).toContain(audits[0].meta.model);
    expect(html).toContain("not human-verified");
  });

  /* ---- the four warnings added 2026-09-16, each true-condition-only ---- */

  it("builds no product warning when a scenario declares nothing", () => {
    expect(productWarnings(undefined)).toEqual([]);
    expect(productWarnings(null)).toEqual([]);
    expect(productWarnings({})).toEqual([]);
    expect(productWarnings({ note: "a note alone discloses nothing" })).toEqual([]);
    expect(productWarnings({ multiIngredient: false, servingsNotStated: false, businessModel: null })).toEqual([]);
    for (const status of ["no_evidence", "unknown"] as const) {
      expect(productWarnings({ businessModel: { status, basis: "", confidence: "low" } })).toEqual([]);
    }
  });

  it("builds exactly one product warning per declared fact, in product order", () => {
    expect(productWarnings({ multiIngredient: true }).map((w) => w.id)).toEqual(["multi_ingredient_product"]);
    expect(productWarnings({ servingsNotStated: true }).map((w) => w.id)).toEqual(["servings_not_stated"]);
    const mlmOnly = productWarnings({ businessModel: { status: "suspected_mlm", basis: "b", confidence: "low" } });
    expect(mlmOnly.map((w) => w.id)).toEqual(["mlm"]);
    const all = productWarnings({ multiIngredient: true, servingsNotStated: true, businessModel: { status: "confirmed_mlm", basis: "b", confidence: "high" }, note: "Fictional sample" });
    expect(all.map((w) => w.id)).toEqual(["multi_ingredient_product", "servings_not_stated", "mlm"]);
    expect(all.every((w) => w.scope === "product" && w.auditQuoted === false && w.reported.length === 0)).toBe(true);
    expect(all.every((w) => w.note === "Fictional sample")).toBe(true);
  });

  it("uses the exact production wording for the three product warnings", () => {
    const scanSource = readFileSync("lib/analyze/scan.ts", "utf8");
    const multi = productWarnings({ multiIngredient: true })[0].explanation;
    // The production caveat interpolates the ingredient name; both halves of
    // the shipped sentence must appear in lib/analyze/scan.ts verbatim.
    expect(scanSource).toContain("This product contains more than one active ingredient. The evidence score is about ");
    expect(scanSource).toContain("on its own. A blend is a different question, and this score does not answer it.");
    expect(multi).toBe("This product contains more than one active ingredient. The evidence score is about this ingredient on its own. A blend is a different question, and this score does not answer it.");
    const servings = productWarnings({ servingsNotStated: true })[0].explanation;
    expect(servings).toBe("The label does not say how many servings are taken a day, so the dose in one serving was scored. Your daily dose may be higher.");
    expect(scanSource).toContain(servings);
    // MLM title/body are produced by the production function itself.
    const model = { status: "confirmed_mlm", basis: "Basis sentence.", confidence: "high" } as const;
    const shipped = businessModelDisclosure(model)!;
    const row = productWarnings({ businessModel: model })[0];
    expect(row.title).toBe(shipped.title);
    expect(row.explanation).toBe(shipped.body);
    expect(row.explanation).toContain("does not affect the evidence score");
    expect(row.explanation).not.toContain("pyramid");
  });

  it("derives the no-human-controlled-trial warning from the ledger gate only", () => {
    const l = ledgerFromAudit(audits[2].outcomes.find((o) => o.ledger.gates.rctCount === 0)!);
    expect(gateWarnings(l).map((w) => w.id)).toEqual(["no_human_controlled_trial"]);
    expect(gateWarnings(l)[0].scope).toBe("outcome");
    // It is a CAP, and says so: score() holds certainty at 0 and shows no number.
    expect(score(l).firedGates).toContain("No human controlled trial");
    expect(score(l).certainty).toBe(0);
    expect(score(l).headline).toBeNull();
    expect(gateWarnings(l)[0].explanation).toContain("cap, not a disclosure");
    expect(gateWarnings(undefined)).toEqual([]);
    expect(gateWarnings(null)).toEqual([]);
    for (const rctCount of [1, 2, 40]) {
      expect(gateWarnings({ ...l, gates: { ...l.gates, rctCount } } as Ledger)).toEqual([]);
    }
    // Every retained audit outcome: the row exists exactly when rctCount === 0.
    for (const audit of audits) for (const o of audit.outcomes) {
      expect(gateWarnings(ledgerFromAudit(o)).length).toBe(o.ledger.gates.rctCount === 0 ? 1 : 0);
    }
  });

  it("never prints a multi-ingredient, servings or MLM warning on a real audited product", () => {
    // The three retained audits are single-ingredient products with a stated
    // daily dose and no known MLM seller. None of them declares those facts,
    // so the card must not assert any of them anywhere.
    for (const [product, audit] of [["creatine", audits[0]], ["vitaminD", audits[1]], ["magnesium", audits[2]]] as const) {
      for (const o of audit.outcomes) {
        const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product, outcome: outcomeKey(o.name, o.population) }} />);
        for (const id of ["multi_ingredient_product", "servings_not_stated", "mlm"]) {
          expect(html, `${product} / ${o.name} / ${id}`).not.toContain(`data-warning="${id}"`);
        }
        expect(html).not.toContain("MLM / direct-selling");
        expect(html).not.toContain("more than one active");
        expect(html).not.toContain("Servings per day");
      }
    }
    for (const product of ["creatineEffect", "caffeine", "omega3"]) {
      const html = renderToStaticMarkup(<AbPrototype initial={{ product }} />);
      expect(html).not.toContain("data-warning=");
    }
  });

  it("shows the gate warning on the one real audit outcome with zero trials", () => {
    const o = byName(audits[2], "Diagnosed anxiety disorder");
    expect(o.ledger.gates.rctCount).toBe(0);
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "magnesium", outcome: outcomeKey(o.name, o.population) }} />);
    expect(html).toContain("⚠ 1 evidence warning<");
    expect(html).toContain('data-warning="no_human_controlled_trial"');
    expect(html).toContain("No randomised human trial was found for this outcome");
    // Derived from counted trials, so it carries no retained-audit quote block.
    expect(html).not.toContain("No specific source detail was retained");
  });

  it("stacks the fictional blend's declared label facts before the outcome-level cap, and counts them", () => {
    const html = renderToStaticMarkup(<AbPrototype initial={{ product: "none", outcome: outcomeKey("Cognitive function") }} />);
    expect(html).toContain("⚠ 3 evidence warnings<");
    const order = [...html.matchAll(/data-warning="([a-z_]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["multi_ingredient_product", "servings_not_stated", "no_human_controlled_trial"]);
    expect(html).toContain("Fictional sample label");
    expect(html).toContain("Your daily dose may be higher.");
  });

  it("attaches MLM only to the fictional seller, and names it as fictional", () => {
    const html = renderToStaticMarkup(<AbPrototype initial={{ product: "thin", outcome: outcomeKey("Testosterone (blood level)") }} />);
    expect(html).toContain("⚠ 1 evidence warning<");
    expect(html).toContain('data-warning="mlm"');
    expect(html).toContain("MLM / direct-selling business model");
    expect(html).toContain("Fictional sample seller");
    expect(html).toContain("seller is fictional too");
    expect(html).not.toContain('data-warning="multi_ingredient_product"');
    // Same product, an outcome with no trials: the seller row plus the cap.
    const energy = renderToStaticMarkup(<AbPrototype initial={{ product: "thin", outcome: outcomeKey("Energy") }} />);
    expect(energy).toContain("⚠ 2 evidence warnings<");
    expect([...energy.matchAll(/data-warning="([a-z_]+)"/g)].map((m) => m[1])).toEqual(["mlm", "no_human_controlled_trial"]);
  });

  it("renders no warnings block for a fictional outcome where none of the four conditions holds", () => {
    const html = renderToStaticMarkup(<AbPrototype initial={{ product: "solid", outcome: outcomeKey("Muscle strength") }} />);
    expect(html).not.toContain("ab-warnings");
    expect(html).not.toContain("evidence warning");
    expect(html).not.toContain("data-warning=");
  });

  it("the warning count always equals the number of rows drawn", () => {
    const cases: [string, string][] = [
      ["creatine", outcomeKey("Strength when you lift weights", "Adults under 50 doing resistance training")],
      ["magnesium", outcomeKey("Diagnosed anxiety disorder", "Adults with a diagnosed anxiety disorder")],
      ["none", outcomeKey("Cognitive function")],
      ["none", outcomeKey("Focus")],
      ["thin", outcomeKey("Testosterone (blood level)")],
      ["thin", outcomeKey("Libido")],
    ];
    for (const [product, outcome] of cases) {
      const html = renderToStaticMarkup(<AbPrototype initial={{ product, outcome }} />);
      const rows = [...html.matchAll(/data-warning="/g)].length;
      const stated = html.match(/⚠ (\d+) evidence warning/);
      expect(Number(stated?.[1] ?? 0), `${product} / ${outcome}`).toBe(rows);
      expect(rows, `${product} / ${outcome}`).toBeGreaterThan(0);
    }
  });

  it("/scan still carries the same three product warnings in its own bundle", () => {
    // Nothing in this task changes /scan; this pins that the surfaces agree.
    const flow = readFileSync("components/scan-flow.tsx", "utf8");
    expect(flow).toContain("businessModelDisclosure");
    expect(flow).toMatch(/warningCount = \(data\?\.caveats\?\.length \?\? 0\)[^\n]*\(mlm \? 1 : 0\)/);
    const scanSource = readFileSync("lib/analyze/scan.ts", "utf8");
    expect(scanSource).toContain('code: "multi_ingredient_product"');
    expect(scanSource).toContain('code: "servings_not_stated"');
  });

  it("warnings use native keyboard-operable details with no nested buttons", () => {
    const o = audits[0].outcomes[0];
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "creatine", outcome: `${o.name}||${o.population}` }} />);
    // The count alone is the label: the "disclosure only, no score penalty"
    // sub-line was deleted 2026-09-16 (founder), leaving one clean summary row.
    expect(html).toContain('<details class="ab-warnings"><summary><span>⚠ 1 evidence warning</span></summary>');
    expect(html).toContain('data-warning="publication"');
    expect(html).not.toContain('data-warning="funding"'); // no funding flag on this outcome
    expect(html).not.toContain("disclosure only, no score penalty");
    expect(html).not.toContain("Nothing here was recomputed");
  });
});
