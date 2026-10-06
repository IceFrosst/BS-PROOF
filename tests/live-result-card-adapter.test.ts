import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { legacyEffectBar, SIZE_NOT_GRADED_WORD } from "@/app/design-lab/ab/effect-presentation";
import { RESEARCH_CARD_COPY } from "@/lib/i18n/copy/research-card";
import { parseResearchResult, type ResearchFacts } from "@/lib/scan-research/client";
import { AXIS_ORDER, buildLiveResultCard, parseFit, sourceHref, type AxisView, type LiveResultCardData, type OutcomeCard } from "@/lib/scan-research/result-card";
import {
  CHECKLIST_UNKNOWN, GATES_NONE, KNOWN_FACTS, SYN_DOUBT, SYN_EVIDENCE_FOUND, SYN_QUOTE, SYN_RANGE, SYN_SENTENCE,
  audit, blendAudit, facts, liveResult, outcome, publicD3K2Audit, UNKNOWN_ROW,
} from "@/tests/helpers/live-result-card-fixtures";

type Json = Record<string, unknown>;
const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas/research_audit.json"), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

function card(a: Json, f: ResearchFacts | null = KNOWN_FACTS): LiveResultCardData {
  const raw = liveResult(a);
  const parsed = parseResearchResult(raw);
  expect(parsed, "the mock must pass the same browser parser the app uses").not.toBeNull();
  return buildLiveResultCard(parsed!, raw, f);
}
const axis = (row: OutcomeCard, id: AxisView["id"]) => row.axes.find((a) => a.id === id)!;
const only = (a: Json[], f: ResearchFacts | null = KNOWN_FACTS) => card(audit(a), f).rows[0];
const ids = (row: OutcomeCard) => row.warnings.map((w) => w.id);

describe("the mock audits are real audit-v0.4 shapes", () => {
  it.each([
    ["eligible + unknown rows", () => audit()],
    ["blend with a CONTEXT ONLY row", () => blendAudit()],
    ["the public D3 + K2 audit", () => publicD3K2Audit()],
  ])("%s validates against schemas/research_audit.json", (_name, make) => {
    const ok = validate(make());
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe("row order and shape", () => {
  it("every outcome has exactly four rows, always Effect, Evidence, Form, Dose", () => {
    expect([...AXIS_ORDER]).toEqual(["effect", "evidence", "form", "dose"]);
    for (const row of card(audit()).rows) expect(row.axes.map((a) => a.id)).toEqual(["effect", "evidence", "form", "dose"]);
  });
  it("keeps one row per audit outcome, in the audit's order, with unique keys even when name and population repeat", () => {
    const twin = outcome({ name: "Sleep quality", population: "Adults with self-rated poor sleep" });
    const c = card(audit([outcome(), twin]));
    expect(c.rows.map((r) => r.name)).toEqual(["Sleep quality", "Sleep quality"]);
    expect(new Set(c.rows.map((r) => r.key)).size).toBe(2);
  });
});

describe("fill policy: a bar is filled ONLY from the audit's own Form / Dose number, for an eligible row with known scan facts", () => {
  it("known single-ingredient product, form + dose + servings recorded: Form 3/4 and Dose 2/4 are filled; Effect and Evidence are NOT", () => {
    const row = only([outcome()]);
    expect(axis(row, "effect")).toMatchObject({ state: "data", reason: "size_not_graded", fill: null, fit: null });
    expect(axis(row, "evidence")).toMatchObject({ state: "data", reason: "snippet_only", fill: null, fit: null });
    expect(axis(row, "form")).toMatchObject({ state: "filled", reason: "fit_model_reported", fill: 0.75, fit: 3 });
    expect(axis(row, "dose")).toMatchObject({ state: "filled", reason: "fit_model_reported", fill: 0.5, fit: 2 });
  });

  it("the Effect tier a model chose never draws a bar: every tier leaves Effect unfilled, and the tier stays as text", () => {
    for (const tier of ["-3", "0", "1", "2", "3"]) {
      const row = only([outcome({ ledger: { effectPoints: tier } })]);
      expect(axis(row, "effect")).toMatchObject({ state: "data", fill: null, fit: null });
      expect(row.effectTier).toBe(tier);
    }
  });

  it("an audit fit of 0 on an eligible row is the audit's own 'no match' (a drawn, empty, non-hatched bar), never a stand-in for unknown", () => {
    const row = only([outcome({ ledger: { formFit: "0", doseFit: "unknown" } })]);
    expect(axis(row, "form")).toMatchObject({ state: "filled", fill: 0, fit: 0 });
    expect(axis(row, "dose")).toMatchObject({ state: "unknown", reason: "fit_unknown", fill: null, fit: null });
  });

  it("unknown, missing or malformed fits are unknown and unfilled: never 0, never a quarter, never clamped", () => {
    for (const bad of ["unknown", undefined, "", "5", "-1", "2.5", null, "two", 7]) {
      const row = only([outcome({ ledger: { formFit: bad, doseFit: bad } })]);
      for (const id of ["form", "dose"] as const) {
        expect(axis(row, id).state, `${String(bad)} ${id}`).toBe("unknown");
        expect(axis(row, id).fill).toBeNull();
        expect(axis(row, id).fit).toBeNull();
      }
    }
    expect(parseFit("unknown")).toBe("unknown");
    expect(parseFit("3")).toBe(3);
    expect(parseFit(3)).toBe(3);
    expect(parseFit("9")).toBeNull();
    expect(parseFit(undefined)).toBeNull();
  });

  it("an 'unclear' effect is unknown (not zero, not 'no effect'); an empty inventory is NOT ASSESSED (not 'no evidence exists')", () => {
    const unclear = only([outcome({ ledger: { effectPoints: "unclear" } })]);
    expect(axis(unclear, "effect")).toMatchObject({ state: "unknown", reason: "effect_unclear", fill: null });
    const empty = only([UNKNOWN_ROW()]);
    for (const id of ["effect", "evidence", "form", "dose"] as const) {
      expect(axis(empty, id).state, id).toBe("not_assessed");
      expect(axis(empty, id).fill).toBeNull();
    }
    // form/dose with a cited-nothing row but known facts and a (made-up) number: still nothing assessed, still unfilled
    const numbersButNoSource = only([outcome({ inventory: [] })]);
    expect(axis(numbersButNoSource, "form")).toMatchObject({ state: "not_assessed", reason: "no_source", fill: null });
    expect(axis(numbersButNoSource, "dose")).toMatchObject({ state: "not_assessed", reason: "no_source", fill: null });
  });

  it("form not stated on the scan: Form is unknown and unfilled whatever number the model gave", () => {
    const row = only([outcome({ ledger: { formFit: "4" } })], facts({ form: null }));
    expect(axis(row, "form")).toMatchObject({ state: "unknown", reason: "form_not_stated", fill: null });
    expect(axis(row, "dose").state).toBe("filled"); // an unrelated unknown does not blank the other bar
  });

  it("servings per day not stated (or 0): Dose is unknown, never one serving a day and never the per-serving number", () => {
    for (const servingsPerDay of [null, 0]) {
      const row = only([outcome({ ledger: { doseFit: "4" } })], facts({ servingsPerDay }));
      expect(axis(row, "dose")).toMatchObject({ state: "unknown", reason: "servings_not_stated", fill: null, fit: null });
      expect(axis(row, "form").state).toBe("filled");
    }
  });

  it("no dose per serving recorded (neither compound nor printed elemental): Dose is unknown", () => {
    const row = only([outcome()], facts({ compoundPerServingMg: null, printedElementalPerServingMg: null }));
    expect(axis(row, "dose")).toMatchObject({ state: "unknown", reason: "dose_not_stated", fill: null });
  });

  it("a recorded elemental amount alone, or a compound mass alone, is a recorded dose; nothing is converted", () => {
    expect(axis(only([outcome()], facts({ compoundPerServingMg: null })), "dose").state).toBe("filled");
    expect(axis(only([outcome()], facts({ printedElementalPerServingMg: null })), "dose").state).toBe("filled");
  });

  it("scan facts unavailable: Form and Dose are unknown, with a product warning saying so", () => {
    const row = only([outcome()], null);
    expect(axis(row, "form")).toMatchObject({ state: "unknown", reason: "facts_unavailable", fill: null });
    expect(axis(row, "dose")).toMatchObject({ state: "unknown", reason: "facts_unavailable", fill: null });
    expect(ids(row)).toContain("facts_unavailable");
  });

  it("whether other ingredients are present is unknown (typed entry): rows can still fill, and the unknown is a product warning", () => {
    const row = only([outcome()], facts({ multiIngredient: null }));
    expect(axis(row, "form").state).toBe("filled");
    expect(ids(row)).toContain("other_ingredients_unknown");
  });

  it("PROPERTY: over every combination of tier, fits, inventory and scan facts, only Form/Dose ever fill, only from the audit's own number, only when every dependency is known", () => {
    const tiers = ["-3", "0", "1", "2", "3", "unclear"];
    const fits = ["0", "1", "2", "3", "4", "unknown"];
    const factSets: Array<ResearchFacts | null> = [
      null, KNOWN_FACTS, facts({ form: null }), facts({ servingsPerDay: null }), facts({ compoundPerServingMg: null, printedElementalPerServingMg: null }), facts({ multiIngredient: true }), facts({ multiIngredient: null }),
    ];
    let filled = 0;
    for (const tier of tiers) for (const formFit of fits) for (const doseFit of fits) for (const hasSource of [true, false]) for (const f of factSets) {
      const row = only([outcome({ ledger: { effectPoints: tier, formFit, doseFit }, ...(hasSource ? {} : { inventory: [] }) })], f);
      expect(row.axes).toHaveLength(4);
      expect(axis(row, "effect").fill).toBeNull();
      expect(axis(row, "evidence").fill).toBeNull();
      for (const a of row.axes) {
        if (a.fill === null) { expect(a.fit).toBeNull(); expect(a.state).not.toBe("filled"); continue; }
        filled += 1;
        expect(["form", "dose"]).toContain(a.id);
        expect(a.state).toBe("filled");
        expect(a.fill).toBe((a.fit as number) / 4);
        expect(String(a.fit)).toBe(a.id === "form" ? formFit : doseFit);
        expect(hasSource).toBe(true);
        expect(f).not.toBeNull();
        expect(f!.multiIngredient).not.toBe(true);
        if (a.id === "form") expect(f!.form).not.toBeNull();
        if (a.id === "dose") { expect(f!.servingsPerDay).toBeGreaterThan(0); expect(f!.compoundPerServingMg !== null || f!.printedElementalPerServingMg !== null).toBe(true); }
      }
    }
    expect(filled).toBeGreaterThan(0);
  });
});

describe("the legacy / science boundary (why the live card does not reuse the retained fill)", () => {
  it("the existing legacy Effect renderer still fills |tier|/3 for the RETAINED audits (unchanged), and still reports an unclear tier as a hatched 'Size not graded'; the live card does neither fill", () => {
    const legacy = legacyEffectBar({ effectPoints: 2, rctCount: 6, inventory: [{ id: "PMID:10000001", access: "snippet" }] });
    expect(legacy.kind).toBe("fictional_points");
    expect(legacy.fill).toBeCloseTo(2 / 3);
    const unclear = legacyEffectBar({ effectPoints: "unclear", rctCount: 6, inventory: [{ id: "PMID:10000001", access: "snippet" }] });
    expect(unclear).toMatchObject({ kind: "not_graded", fill: null, word: SIZE_NOT_GRADED_WORD });
    // the live card: the same two inputs, never a fill, and the approved wording for the non-numeric state
    expect(axis(only([outcome({ ledger: { effectPoints: "2" } })]), "effect").fill).toBeNull();
    expect(axis(only([outcome({ ledger: { effectPoints: "unclear" } })]), "effect").fill).toBeNull();
    expect(RESEARCH_CARD_COPY.en.axisWord.effectData).toBe(SIZE_NOT_GRADED_WORD);
  });
});

describe("DO_NOT_GRADE: context rows and blends are shown, never graded, never averaged", () => {
  it("the user's D3 + K2 case (the public audit): one exact-combination row, every bar unfilled, nothing is 'no risk' or 'zero'", () => {
    const c = card(publicD3K2Audit(), facts({ form: "Vitamin D3 (cholecalciferol)", servingsPerDay: null, multiIngredient: true }));
    expect(c.blend).toBe(true);
    expect(c.rows).toHaveLength(1);
    const row = c.rows[0];
    expect(row.axes.every((a) => a.fill === null && a.fit === null && a.state !== "filled")).toBe(true);
    expect(axis(row, "effect").state).toBe("not_assessed");
    expect(axis(row, "form")).toMatchObject({ state: "not_gradeable", reason: "blend" });
    expect(axis(row, "dose")).toMatchObject({ state: "not_gradeable", reason: "blend" });
    expect(row.context).toBe(false);
    expect(row.formFitRaw).toBe("unknown");
  });

  it("a CONTEXT ONLY row keeps its numbers as TEXT but every one of its four bars is unfilled and not gradeable", () => {
    const c = card(blendAudit(), facts({ multiIngredient: true, servingsPerDay: 1 }));
    const [combo, context] = c.rows;
    expect(combo.context).toBe(false);
    expect(context.context).toBe(true);
    for (const a of context.axes) expect(a, a.id).toMatchObject({ state: "not_gradeable", reason: "context_only", fill: null, fit: null });
    // the audit said effect 3, form 4, dose 0: shown verbatim as text, drawn as nothing
    expect(context.effectTier).toBe("3");
    expect(context.formFitRaw).toBe("4");
    expect(context.doseFitRaw).toBe("0");
    expect(ids(context)).toContain("context_only");
    expect(ids(combo)).not.toContain("context_only");
    // the exact-combination row is also not gradeable for form/dose: a blend has no single form or dose match
    expect(axis(combo, "form")).toMatchObject({ state: "not_gradeable", reason: "blend", fill: null });
    expect(axis(combo, "dose")).toMatchObject({ state: "not_gradeable", reason: "blend", fill: null });
  });

  it("the audit marking a row context-only makes the product a blend even if the scan did not say so (never grade a blend as one ingredient)", () => {
    const c = card(blendAudit(), facts({ multiIngredient: false }));
    expect(c.blend).toBe(true);
    for (const row of c.rows) for (const id of ["form", "dose"] as const) expect(axis(row, id).fill).toBeNull();
  });

  it("no row of a blend is averaged into another: nothing in the card data is a combined number", () => {
    const keys = new Set<string>();
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
    walk(card(blendAudit(), facts({ multiIngredient: true })));
    for (const k of keys) expect(k).not.toMatch(/headline|score|general|average|\bmean\b|overall|composite|certainty|grade/i);
  });

  it("only the exact words CONTEXT ONLY mark a context row; a similar population does not", () => {
    const rows = card(audit([outcome({ population: "Adults, context for sleep" }), outcome({ population: "context only: lower case still counts" })])).rows;
    expect(rows[0].context).toBe(false);
    expect(rows[1].context).toBe(true);
  });
});

describe("warnings: from the audit's own ledger and the scan's own facts, scoped per outcome, deduped, never 'no risk'", () => {
  it("product warnings come from the scan's unknowns, identical on every outcome, one per id", () => {
    const c = card(audit([outcome(), UNKNOWN_ROW(), outcome({ name: "Third" })]), facts({ form: null, servingsPerDay: null, compoundPerServingMg: null, printedElementalPerServingMg: null, multiIngredient: null }));
    const product = (r: OutcomeCard) => r.warnings.filter((w) => w.scope === "product").map((w) => w.id);
    expect(product(c.rows[0])).toEqual(["other_ingredients_unknown", "servings_not_stated", "dose_not_stated", "form_not_stated"]);
    for (const r of c.rows) {
      expect(product(r)).toEqual(product(c.rows[0]));
      expect(new Set(ids(r)).size).toBe(ids(r).length);
    }
  });

  it("a blend scan raises the blend warning and not the unknown-other-ingredients one", () => {
    const row = only([outcome()], facts({ multiIngredient: true }));
    expect(ids(row)).toContain("blend");
    expect(ids(row)).not.toContain("other_ingredients_unknown");
  });

  it("outcome warnings are built from THAT outcome's own ledger and never leak to another outcome", () => {
    const flagged = outcome(); // funding flag + publication concern + risk_of_bias concern + 6 RCTs
    const clean = outcome({
      name: "Clean row",
      ledger: { checklist: { risk_of_bias: "supported", consistency: "supported", precision: "supported", directness: "supported", publication_bias: "supported" }, gates: { rctCount: 5, largestRctN: 200, longestRctWeeks: 12, chronicOutcome: false, surrogate: false, allPositiveIndustryOrOneLab: false } },
    });
    const noTrial = outcome({ name: "No trial", ledger: { gates: { ...GATES_NONE }, checklist: { ...CHECKLIST_UNKNOWN } }, inventory: [] });
    const [a, b, z] = card(audit([flagged, clean, noTrial])).rows;
    expect(ids(a)).toEqual(expect.arrayContaining(["funding", "publication", "methodology"]));
    expect(a.warnings.find((w) => w.id === "methodology")!.reasons).toEqual(["risk_of_bias"]);
    expect(ids(a)).not.toContain("no_human_controlled_trial");
    expect(ids(b)).toEqual([]);
    expect(ids(z)).toEqual(["no_human_controlled_trial"]);
  });

  it("funding and publication warnings quote the audit's OWN evidence sentences verbatim (existing evidence-warnings helper)", () => {
    const row = only([outcome()]);
    expect(row.warnings.find((w) => w.id === "funding")!.reported).toContain(SYN_EVIDENCE_FOUND);
    expect(row.warnings.find((w) => w.id === "publication")!.reported).toContain(SYN_EVIDENCE_FOUND);
  });

  it("methodology lists every recorded concern and gate, and a 0 'largest trial' is NOT read as a small trial (the schema has no unknown)", () => {
    const row = only([outcome({ ledger: { checklist: { risk_of_bias: "concern", consistency: "concern", precision: "concern", directness: "concern", publication_bias: "supported" }, gates: { rctCount: 1, largestRctN: 30, longestRctWeeks: 2, chronicOutcome: true, surrogate: true, allPositiveIndustryOrOneLab: false } } })]);
    expect(row.warnings.find((w) => w.id === "methodology")!.reasons).toEqual(["risk_of_bias", "consistency", "precision", "directness", "one_rct", "small_or_short", "surrogate"]);
    const zeros = only([outcome({ ledger: { checklist: { ...CHECKLIST_UNKNOWN }, gates: { rctCount: 8, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false } } })]);
    expect(ids(zeros)).toEqual([]);
  });

  it("an unassessed outcome (all unknown) raises no concern: the absence of a warning is never turned into one, or into a clean bill", () => {
    const row = only([outcome({ ledger: { checklist: { ...CHECKLIST_UNKNOWN }, gates: { rctCount: 4, largestRctN: 80, longestRctWeeks: 8, chronicOutcome: false, surrogate: false, allPositiveIndustryOrOneLab: false } } })]);
    expect(row.warnings.filter((w) => w.scope === "outcome")).toEqual([]);
    expect(row.checklist.every((c) => c.judgement === "unknown")).toBe(true); // kept as the audit's own words
  });

  it("no business-model, MLM or brand finding is ever produced", () => {
    const allowed = new Set(["context_only", "blend", "other_ingredients_unknown", "servings_not_stated", "dose_not_stated", "form_not_stated", "facts_unavailable", "no_human_controlled_trial", "methodology", "funding", "publication"]);
    for (const f of [null, KNOWN_FACTS, facts({ multiIngredient: true })]) for (const a of [audit(), blendAudit(), publicD3K2Audit()]) {
      for (const row of card(a, f).rows) for (const w of row.warnings) expect(allowed.has(w.id)).toBe(true);
    }
  });
});

describe("source faithfulness: the audit's own strings pass through byte for byte", () => {
  it("name, population, sentence, study note, doubt, range, effect text, detail blocks and source ids are identical to the audit", () => {
    const a = audit([outcome({ name: "Sleep quality  (double  space)", population: " Adults, trailing space " })]);
    const raw = (a.outcomes as Json[])[0];
    const row = card(a).rows[0];
    expect(row.name).toBe(raw.name);
    expect(row.population).toBe(raw.population);
    expect(row.sentence).toBe(SYN_SENTENCE);
    expect(row.strongestStudy).toBe(SYN_QUOTE);
    expect(row.strongestDoubt).toBe(SYN_DOUBT);
    expect(row.effectiveDailyRange).toBe(SYN_RANGE);
    expect(row.absoluteEffect).toBe(raw.absolute_effect);
    expect(row.clinicallyMeaningful).toBe(raw.clinically_meaningful);
    expect(row.studyThatWouldMove).toBe(raw.study_that_would_move_this);
    expect(row.effectBasis).toBe((raw.ledger as Json).effect_basis);
    expect(row.detail).toEqual(raw.detail);
    expect(row.sources.map((s) => s.id)).toEqual((raw.inventory as Array<{ id: string }>).map((i) => i.id));
    expect(row.sources.map((s) => s.note)).toEqual((raw.inventory as Array<{ note: string }>).map((i) => i.note));
    expect(row.sources.map((s) => [s.year, s.design, s.n, s.direction, s.funding])).toEqual((raw.inventory as Array<Json>).map((i) => [i.year, i.design, i.n, i.direction, i.funding]));
    expect(row.sources.every((s) => s.access === "snippet")).toBe(true);
  });

  it("the audit-level product, dose, dose note and the audit's own access note are verbatim", () => {
    const a = audit();
    const c = card(a);
    expect(c.audit).toMatchObject({ product: a.product, ingredient: a.ingredient, form: a.form, dailyDose: a.daily_dose, doseNote: a.dose_note, note: (a.meta as Json).note, runAt: "2026-10-05", selfConfidence: "medium-low" });
  });

  it("source links are built from the shape of a DOI / PMID / PMCID only; everything else stays plain text", () => {
    expect(sourceHref("PMID:32219282")).toBe("https://pubmed.ncbi.nlm.nih.gov/32219282/");
    expect(sourceHref("10.1093/sleep/zsy123")).toBe("https://doi.org/10.1093/sleep/zsy123");
    expect(sourceHref("PMC1234567")).toBe("https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/");
    expect(sourceHref("NCT01234567")).toBeNull();
    expect(sourceHref("12345")).toBeNull();
  });

  it("missing optional fields stay missing (null), they are never filled with a dash, a zero or a default", () => {
    const partial = { ...outcome(), detail: { effect: { found: "only found" } } } as Json;
    delete partial.absolute_effect;
    delete partial.clinically_meaningful;
    const raw = liveResult(audit([partial]));
    const parsed = parseResearchResult(raw)!;
    const row = buildLiveResultCard(parsed, raw, KNOWN_FACTS).rows[0];
    expect(row.absoluteEffect).toBeNull();
    expect(row.clinicallyMeaningful).toBeNull();
    expect(row.detail.effect).toEqual({ found: "only found", missing: null, move: null });
    expect(row.detail.evidence).toBeNull();
  });

  it("a ledger-less result (older or partial) keeps only validated fields: every bar unfilled, nothing is invented", () => {
    const raw = liveResult(audit([{ name: "Bare", population: "Anyone", sentence: "s", strongest_study: "x", strongest_doubt: "y", study_that_would_move_this: "z", inventory: [{ id: "PMID:1", access: "snippet" }] }]));
    const row = buildLiveResultCard(parseResearchResult(raw)!, raw, KNOWN_FACTS).rows[0];
    expect(row.axes.map((a) => a.fill)).toEqual([null, null, null, null]);
    expect(axis(row, "form")).toMatchObject({ state: "unknown", reason: "fit_missing" });
    expect(row.effectTier).toBeNull();
    expect(row.gates).toBeNull();
    expect(row.warnings.filter((w) => w.scope === "outcome")).toEqual([]);
  });

  it("raw rows that do not line up with the validated rows are ignored, never trusted", () => {
    const raw = liveResult(audit([outcome()])) as { audit: { outcomes: Json[] } };
    const parsed = parseResearchResult(raw)!;
    const tampered = JSON.parse(JSON.stringify(raw));
    tampered.audit.outcomes[0].name = "A different outcome";
    const row = buildLiveResultCard(parsed, tampered, KNOWN_FACTS).rows[0];
    expect(row.effectTier).toBeNull();
    expect(row.axes.every((a) => a.fill === null)).toBe(true);
  });
});

const PRIVATE = process.env.BSPROOF_PRIVATE_LIVE_AUDIT;
describe.skipIf(!PRIVATE || !existsSync(PRIVATE))("PRIVATE opt-in: a real captured live audit (never committed; set BSPROOF_PRIVATE_LIVE_AUDIT to a JSON with an `audit` key)", () => {
  it("builds a card whose rows obey the same invariants", () => {
    const real = JSON.parse(readFileSync(PRIVATE as string, "utf8")) as { audit: Json };
    const inventory = (real.audit.outcomes as Json[]).flatMap((o) => (o.inventory as Json[]).map((i) => i.id));
    const raw = { ...liveResult(real.audit), source_access: { ...(liveResult(real.audit).source_access as Json), inventory: inventory.map((id) => ({ id, evidence_class: "derived_snippet" })) } };
    const parsed = parseResearchResult(raw);
    expect(parsed).not.toBeNull();
    const c = buildLiveResultCard(parsed!, raw, facts({ multiIngredient: true, servingsPerDay: null, form: "Vitamin D3" }));
    expect(c.rows.length).toBeGreaterThan(0);
    for (const row of c.rows) {
      expect(row.axes.map((a) => a.id)).toEqual(["effect", "evidence", "form", "dose"]);
      for (const a of row.axes) expect(a.fill).toBeNull();
    }
    expect(c.rows.filter((r) => r.context).every((r) => r.axes.every((a) => a.state === "not_gradeable"))).toBe(true);
  });
});
