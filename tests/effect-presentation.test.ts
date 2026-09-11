/**
 * The Effect bar and the Outcomes tab (development-only /design-lab/ab).
 *
 * What these pin, and why each one exists:
 *
 *  - There is NO overall average, number or band anywhere. A product is not one
 *    benefit, and averaging outcomes across populations invented one.
 *  - The Effect bar never draws `effectPoints / 3` again. "Size not graded",
 *    "no evidence found" and "no meaningful benefit" are three different
 *    sentences about the world and must render as three different states.
 *  - The three shipped audits keep their own effect text and source ids
 *    reachable, stamped as the previous run's and not reverified.
 *  - The caffeine pass is EFFECT ONLY: sources, an unknown practical
 *    importance, and NO fabricated certainty / form / dose / person bars.
 *  - Malformed effect data is refused, not scored.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import creatineAudit from "@/app/design-lab/ab/audits/creatine.json";
import magnesiumAudit from "@/app/design-lab/ab/audits/magnesium.json";
import vitaminDAudit from "@/app/design-lab/ab/audits/vitamin-d.json";
import caffeineRaw from "@/app/design-lab/ab/effect-research/caffeine.json";
import {
  EFFECT_RESEARCH_PROMPT_VERSION, parseEffectResearch, sourceUrl, validateEffectResearch,
} from "@/app/design-lab/ab/effect-contract";
import {
  NOT_ASSESSED_WORD, NO_EVIDENCE_WORD, NO_MEANINGFUL_BENEFIT_WORD, PREVIOUS_AUDIT_LABEL, REPORTED_ESTIMATE_LABEL,
  SIZE_NOT_GRADED_WORD, fictionalEffectBar, intervalScale, legacyEffectBar, notAssessedReason, outcomeKey, pickByKey,
  researchEffectBar, sourcesFor,
} from "@/app/design-lab/ab/effect-presentation";
import AbPrototype from "@/app/design-lab/ab/prototype";

const caffeine = parseEffectResearch(caffeineRaw);
type LegacyAudit = {
  outcomes: Array<{
    name: string; population?: string;
    ledger: { effectPoints: string; gates: { rctCount: number } };
    inventory: Array<{ id: string; access: string }>;
    absolute_effect?: string; clinically_meaningful?: string; strongest_doubt?: string;
  }>;
};
const AUDITS: Array<[string, LegacyAudit]> = [
  ["creatine", creatineAudit as unknown as LegacyAudit],
  ["vitamin-d", vitaminDAudit as unknown as LegacyAudit],
  ["magnesium", magnesiumAudit as unknown as LegacyAudit],
];
const barFor = (o: LegacyAudit["outcomes"][number]) => legacyEffectBar({
  effectPoints: o.ledger.effectPoints === "unclear" ? "unclear" : Number(o.ledger.effectPoints),
  rctCount: o.ledger.gates.rctCount,
  inventory: o.inventory,
  absoluteEffect: o.absolute_effect,
  clinicallyMeaningful: o.clinically_meaningful,
  strongestDoubt: o.strongest_doubt,
});

describe("the landing tab is Outcomes, and there is no overall number", () => {
  const markup = renderToStaticMarkup(createElement(AbPrototype, { initial: { product: "creatine" } }));

  it("renders an Outcomes list, not an Overall average", () => {
    expect(markup).toContain("Outcomes");
    expect(markup).not.toContain("Overall");
    expect(markup).not.toMatch(/Average of the/);
    expect(markup).not.toContain("ab-number"); // the big headline tile is gone from the landing tab
  });

  it("carries no overall band label", () => {
    for (const band of ["Probably works", "Probably does not work", "Evidence against"]) {
      // A band may appear as a per-row legacy label, never as a product verdict tile.
      expect(markup).not.toContain(`<h2>${band}</h2>`);
    }
  });

  it("qualifies every outcome row by its population and says suggestions are not a promise", () => {
    expect(markup).toContain("Adults under 50 doing resistance training");
    expect(markup).toContain("not a measure of how many people buy it");
    expect(markup).toContain("Previous rubric · unchanged");
  });

  it("drops the product-level for-whom claim that implied one global benefit", () => {
    expect(markup).not.toContain("Worth it if");
    expect(markup).not.toContain("Not shown to help if");
  });
});

describe("three states that must never render the same", () => {
  it("size not graded, no evidence and no meaningful benefit are distinct", () => {
    const graded = legacyEffectBar({ effectPoints: 2, rctCount: 8, inventory: [{ id: "PMID 1234567" }], absoluteEffect: "prose" });
    const nothing = legacyEffectBar({ effectPoints: "unclear", rctCount: 0, inventory: [] });
    const nullResult = legacyEffectBar({ effectPoints: 0, rctCount: 9, inventory: [{ id: "PMID 1234567" }] });
    expect([graded.kind, nothing.kind, nullResult.kind]).toEqual(["not_graded", "no_evidence", "no_meaningful_benefit"]);
    expect([graded.word, nothing.word, nullResult.word]).toEqual([SIZE_NOT_GRADED_WORD, NO_EVIDENCE_WORD, NO_MEANINGFUL_BENEFIT_WORD]);
    expect(new Set([graded.word, nothing.word, nullResult.word]).size).toBe(3);
  });

  it("a missing size is NEVER a zero fill", () => {
    for (const bar of [
      legacyEffectBar({ effectPoints: 2, rctCount: 8, inventory: [{ id: "PMID 1" }] }),
      legacyEffectBar({ effectPoints: "unclear", rctCount: 0, inventory: [] }),
      legacyEffectBar({ effectPoints: 0, rctCount: 9, inventory: [{ id: "PMID 1" }] }),
    ]) {
      expect(bar.fill).toBeNull();
      expect(bar.pts).toBe("—");
    }
  });

  it("only the explicitly fictional ledgers keep a numeric fill, and they say so", () => {
    const fake = fictionalEffectBar(2, 24);
    expect(fake.kind).toBe("fictional_points");
    expect(fake.fill).toBeCloseTo(2 / 3);
    expect(fake.provenance).toContain("Fictional");
  });
});

describe("the three shipped audits keep their own text, stamped and not reverified", () => {
  it.each(AUDITS)("%s: every row reaches its reported effect, its doubt and its source ids", (_name, audit) => {
    for (const o of audit.outcomes) {
      const bar = barFor(o);
      expect(bar.provenance).toBe(PREVIOUS_AUDIT_LABEL);
      const body = bar.lines.map((l) => l.body).join("\n");
      if (o.absolute_effect) expect(body).toContain(o.absolute_effect);
      if (o.strongest_doubt) expect(body).toContain(o.strongest_doubt);
      if (o.clinically_meaningful) {
        expect(body).toContain(o.clinically_meaningful);
        const label = bar.lines.find((l) => l.body === o.clinically_meaningful)?.label ?? "";
        expect(label).toMatch(/AS CLAIMED|not reverified/);
      }
      expect(bar.sourceLinks.map((s) => s.id)).toEqual(o.inventory.map((s) => s.id));
      expect(bar.fill).toBeNull();
    }
  });

  it("legacy source ids resolve to a real link where an identifier exists", () => {
    const bar = barFor(AUDITS[0][1].outcomes[0]);
    expect(bar.sourceLinks.some((s) => (s.url ?? "").startsWith("https://"))).toBe(true);
  });

  it("does not re-assert the undefendable share-of-gain sentence as the card's own summary", () => {
    const row = AUDITS[0][1].outcomes[0];
    const key = outcomeKey(row.name, row.population);
    const summary = renderToStaticMarkup(createElement(AbPrototype, { initial: { product: "creatine", outcome: key } }));
    expect(summary).not.toMatch(/a third more than training alone/);
    expect(summary).toContain("Previous rubric · unchanged");
  });

  it("but the previous run's own effect text stays reachable under the expansion", () => {
    const row = AUDITS[0][1].outcomes[0];
    const key = outcomeKey(row.name, row.population);
    const opened = renderToStaticMarkup(createElement(AbPrototype, { initial: { product: "creatine", outcome: key, open: "effect" } }));
    expect(opened).toContain(PREVIOUS_AUDIT_LABEL);
    expect(opened).toContain("Reported effect, previous audit");
    expect(opened).toContain("pubmed.ncbi.nlm.nih.gov/39519498");
    expect(opened).toMatch(/Size not graded/);
  });
});

describe("effect-research-v0.1 refuses malformed data rather than scoring it", () => {
  const clone = () => JSON.parse(JSON.stringify(caffeineRaw)) as Record<string, unknown>;
  const outcomesOf = (f: Record<string, unknown>) => f.outcomes as Array<Record<string, unknown>>;
  const errorsFor = (mutate: (f: Record<string, unknown>) => void): string[] => {
    const f = clone();
    mutate(f);
    const result = validateEffectResearch(f);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.errors;
  };

  it("accepts the shipped caffeine file", () => {
    const result = validateEffectResearch(caffeineRaw);
    expect(result.ok).toBe(true);
    expect(caffeine.meta.prompt).toBe(EFFECT_RESEARCH_PROMPT_VERSION);
    expect(caffeine.meta.human_verified).toBe(false);
  });

  it("rejects an interval that does not bracket its estimate", () => {
    const errors = errorsFor((f) => { (outcomesOf(f)[1].estimate as Record<string, unknown>).ciLow = -0.2; });
    expect(errors.join(" ")).toMatch(/interval must bracket the estimate/);
  });

  it("rejects half an interval and a non-finite number", () => {
    expect(errorsFor((f) => { (outcomesOf(f)[1].estimate as Record<string, unknown>).ciHigh = null; }).join(" "))
      .toMatch(/both bounds or neither/);
    expect(errorsFor((f) => { (outcomesOf(f)[1].estimate as Record<string, unknown>).value = "NaN"; }).join(" "))
      .toMatch(/value must be a finite number/);
  });

  it("rejects a non-positive risk ratio", () => {
    const errors = errorsFor((f) => {
      Object.assign(outcomesOf(f)[1].estimate as Record<string, unknown>, { metric: "rr", unit: "risk ratio", value: 0, ciLow: -0.2, ciHigh: 0.4 });
    });
    expect(errors.join(" ")).toMatch(/risk ratio must be positive/);
  });

  it("rejects a quote or cross-check pointing at a source id that was never declared", () => {
    expect(errorsFor((f) => { (outcomesOf(f)[0].quote as Record<string, unknown>).source = "S99"; }).join(" "))
      .toMatch(/quote.source must resolve/);
    expect(errorsFor((f) => { (outcomesOf(f)[0].cross_checks as Array<Record<string, unknown>>)[0].source = "S99"; }).join(" "))
      .toMatch(/source must resolve/);
  });

  it("refuses to call an unknown overlap an independent replication", () => {
    const errors = errorsFor((f) => { (outcomesOf(f)[1].cross_checks as Array<Record<string, unknown>>)[0].independent_replication = true; });
    expect(errors.join(" ")).toMatch(/independent_replication requires overlap "none"/);
  });

  it("refuses a file that claims human verification", () => {
    expect(errorsFor((f) => { (f.meta as Record<string, unknown>).human_verified = true; }).join(" "))
      .toMatch(/human_verified must be false/);
  });

  it("throws on load rather than rendering a rejected file", () => {
    expect(() => parseEffectResearch({ meta: {} })).toThrow(/effect-research file rejected/);
  });

  it("validates against schemas/effect_research.json", () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas/effect_research.json"), "utf8"));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    const ok = validate(caffeineRaw);
    if (!ok) throw new Error((validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("\n"));
    expect(ok).toBe(true);
  });
});

describe("caffeine is effect-only: reported estimates, no invented bars", () => {
  const attention = caffeine.outcomes[0];
  const endurance = caffeine.outcomes[1];

  it("draws an interval only when one was reported, and never a fake one", () => {
    const withInterval = researchEffectBar(caffeine, endurance);
    expect(withInterval.kind).toBe("reported_interval");
    expect(withInterval.scale?.lowPct).not.toBeNull();
    expect(withInterval.provenance).toContain(REPORTED_ESTIMATE_LABEL);

    const pointOnly = researchEffectBar(caffeine, attention);
    expect(pointOnly.kind).toBe("reported_point");
    expect(pointOnly.scale?.lowPct).toBeNull();
    expect(pointOnly.scale?.highPct).toBeNull();
    expect(pointOnly.provenance).toMatch(/No confidence interval is available/);
    expect(pointOnly.pts).toBe("0.28 Hedges g");
  });

  it("keeps SMD as SMD and never converts a metric", () => {
    expect(attention.estimate.metric).toBe("smd");
    expect(endurance.estimate.metric).toBe("smd");
    const bar = researchEffectBar(caffeine, attention);
    const text = [bar.pts, ...bar.lines.map((l) => l.body)].join(" ");
    // no number is ever expressed in a converted unit; "not converted into
    // milliseconds" is allowed to be SAID, but no ms/second/kg value may appear
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(ms|milliseconds|seconds|minutes|kg)\b/i);
    expect(bar.pts).toBe("0.28 Hedges g");
  });

  it("surfaces the quote, comparator, population, timeframe and dose gap with source ids", () => {
    const bar = researchEffectBar(caffeine, endurance);
    const labels = bar.lines.map((l) => l.label);
    for (const label of ["Quoted estimate", "Comparator", "Population", "Timeframe", "Dose applicability", "Practical importance"]) {
      expect(labels).toContain(label);
    }
    const quote = bar.lines.find((l) => l.label === "Quoted estimate")!.body;
    expect(quote).toContain("Low-dose capsules most effectively reduced completion time");
    expect(quote).toContain("PMID 41374083");
    expect(bar.lines.find((l) => l.label === "Dose applicability")!.body).toMatch(/NOT A FIXED 200 mg DOSE/);
  });

  it("states the dose-applicability gap instead of claiming 200 mg was tested", () => {
    expect(endurance.dose_applicability).toMatch(/mg\/kg/);
    expect(endurance.dose_applicability).toMatch(/not\b.*'?the effect of 200 mg|NOT 'the effect of 200 mg/i);
  });

  it("keeps practical importance unknown even though the result is significant", () => {
    expect(attention.practical_importance.status).toBe("unknown");
    expect(endurance.practical_importance.status).toBe("unknown");
    const bar = researchEffectBar(caffeine, endurance);
    expect(bar.lines.find((l) => l.label === "Practical importance")!.body).toMatch(/^Unknown\./);
    // the elite-sport 2.2% framing is reported, not adopted
    expect(bar.lines.find((l) => l.label === "Practical importance")!.body).toMatch(/not adopted as a threshold/);
  });

  it("never merges the two evidence bases and never auto-combines estimates", () => {
    const ids = caffeine.outcomes.map((o) => outcomeKey(o.name, o.population));
    expect(new Set(ids).size).toBe(2);
    const bar = researchEffectBar(caffeine, endurance);
    const crossCheck = bar.lines.find((l) => l.label.startsWith("Cross-check"))!;
    expect(crossCheck.body).toMatch(/NOT counted as independent replication/);
    expect(crossCheck.body).toContain("SMD \u22120.32");
    expect(crossCheck.body).toMatch(/never combined|NEVER combined/);
  });

  it("separates a different population and a different endpoint from the finding", () => {
    const bar = researchEffectBar(caffeine, attention);
    const notes = bar.lines.filter((l) => l.label.startsWith("Cross-check")).map((l) => l.body).join("\n");
    expect(notes).toMatch(/DIFFERENT population/);
    expect(notes).toMatch(/DIFFERENT endpoint/);
    expect(notes).toMatch(/not a contradiction|NOT evidence against/i);
  });

  it("reports funding as disclosure and never as a penalty", () => {
    const bar = researchEffectBar(caffeine, endurance);
    const funding = bar.lines.find((l) => l.label.startsWith("Funding"))!;
    expect(funding.label).toMatch(/disclosure only/);
    expect(funding.body).toContain("Shanghai University of Sport");
  });

  it("links every source it leans on", () => {
    for (const outcome of caffeine.outcomes) {
      const links = researchEffectBar(caffeine, outcome).sourceLinks;
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((l) => l.url === null || l.url.startsWith("https://"))).toBe(true);
    }
    expect(sourceUrl(sourcesFor(caffeine, attention)[0])).toBe("https://doi.org/10.1007/s00213-025-06775-1");
  });

  it("names the bars it did not assess instead of scoring them", () => {
    for (const bar of ["evidence", "form", "dose", "person"] as const) {
      expect(notAssessedReason(caffeine, bar)).toBeTruthy();
    }
  });

  it("renders the caffeine card with no numeric headline and four not-assessed bars", () => {
    const key = outcomeKey(endurance.name, endurance.population);
    const markup = renderToStaticMarkup(createElement(AbPrototype, { initial: { product: "caffeine", outcome: key, open: "effect" } }));
    expect(markup).not.toContain("ab-number");
    const notAssessedRows = markup.match(new RegExp(`ab-bar-word">${NOT_ASSESSED_WORD}`, "g")) ?? [];
    expect(notAssessedRows).toHaveLength(4);
    expect(markup).toContain("Effect only. No overall number for this product");
    expect(markup).toContain(REPORTED_ESTIMATE_LABEL);
    expect(markup).toContain("https://doi.org/10.3390/nu17233792");
    expect(markup).toContain("Unknown.");
    expect(markup).not.toMatch(/\d\/4/); // no fabricated certainty/form/dose points
    expect(markup).not.toMatch(/\d\/3/); // no fabricated person or effect tier
  });
});

describe("a row is keyed by name AND population", () => {
  const rows = [
    { name: "Sleep quality", population: "Adults with poor sleep" },
    { name: "Sleep quality", population: "Adults with no sleep complaint" },
  ];

  it("two rows sharing a name select independently", () => {
    const a = outcomeKey(rows[0].name, rows[0].population);
    const b = outcomeKey(rows[1].name, rows[1].population);
    expect(a).not.toBe(b);
    expect(pickByKey(rows, a)).toBe(rows[0]);
    expect(pickByKey(rows, b)).toBe(rows[1]);
  });

  it("keying by name alone would collide — that is the bug this replaces", () => {
    expect(new Set(rows.map((r) => r.name)).size).toBe(1);
    expect(new Set(rows.map((r) => outcomeKey(r.name, r.population))).size).toBe(2);
  });

  it("no shipped audit row loses its population qualifier", () => {
    for (const [, audit] of AUDITS) {
      for (const o of audit.outcomes) expect((o.population ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("the interval is a reported estimate, not a graded scale", () => {
  it("places the estimate inside its interval and marks the no-effect line", () => {
    const scale = intervalScale(caffeine.outcomes[1].estimate);
    expect(scale.lowPct!).toBeLessThan(scale.markerPct);
    expect(scale.markerPct).toBeLessThan(scale.highPct!);
    expect(scale.nullPct).toBeGreaterThan(scale.highPct!); // the whole interval sits below zero
    expect(scale.nullLabel).toBe("0 (no effect)");
    expect(scale.unit).toBe("SMD");
  });

  it("uses 1 as the no-effect line for a ratio, and never rescales the metric", () => {
    const scale = intervalScale({
      what: "example", metric: "rr", unit: "risk ratio", value: 0.8, ciLow: 0.6, ciHigh: 1.05,
      interval_note: "", direction: "lower_better", source: "S1",
    });
    expect(scale.nullLabel).toBe("1 (no effect)");
    expect(scale.markerLabel).toBe("0.80");
  });
});

describe("the unwired effect.ts grading engine stays unwired", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });

  it("no app/ or lib/ module imports it", () => {
    const offenders = [...walk(join(process.cwd(), "app")), ...walk(join(process.cwd(), "lib"))]
      .filter((p) => !p.endsWith(join("design-lab", "ab", "effect.ts")))
      .filter((p) => /from\s+["'](\.\/effect|@\/app\/design-lab\/ab\/effect)["']/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
