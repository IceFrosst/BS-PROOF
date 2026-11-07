/*
 * EN/LT localization, the parts that need no browser and no model:
 *   - the persisted locale contract (same key/values as Ignas PR3)
 *   - both languages are complete and structurally identical
 *   - the Lithuanian dose reading/note is re-rendered from the stored numbers and
 *     its ENGLISH twin is byte-identical to what lib/analyze/dose-effectiveness.ts
 *     emits, so the two cannot drift
 *   - every fixed sentence the real server emits has a deterministic Lithuanian
 *     rendering (so the model translator is only ever asked about real prose)
 *   - translations are display-only: scoring / ledger / dose / catalog modules do
 *     not import them
 */
import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { installLocalStorage } from "./helpers/local-storage";

import { doseEffectivenessSection, type DoseRowInput } from "@/lib/analyze/dose-effectiveness";
import { registryRecalls } from "@/lib/analyze/company";
import { scoreProduct } from "@/lib/analyze/product-score";
import { analyzeManual, type ScanDeps } from "@/lib/analyze/scan";
import { businessModelDisclosure } from "@/lib/analyze/business-model";
import { literatureDisclosures } from "@/lib/analyze/literature-disclosures";
import { FLOW_COPY } from "@/lib/i18n/copy/flow";
import { HISTORY_COPY } from "@/lib/i18n/copy/history";
import { RESULT_COPY, enumWord, ledgerWord, strengthLabel } from "@/lib/i18n/copy/result";
import { SEARCH_COPY } from "@/lib/i18n/copy/search";
import { doseNoteText, doseReadingBody, knownServerText } from "@/lib/i18n/deterministic";
import { LANG_KEY, normalizeLang, readStoredLang, resetLangMemory, writeLang } from "@/lib/i18n/locale";
import { score, ledgerFromAudit } from "@/lib/evidence-ledger";
import { retainedAuditForProduct } from "@/lib/evidence-ledger/retained-audits";

const ROOT = process.cwd();

/** Same key set, same value kinds, recursively -- so a missing LT key fails the build and this test. */
// Lookup tables that only exist to REWORD a stored value; English shows the stored value itself.
const LOOKUPS = new Set(["stageNames", "persistenceStatus", "statusWords"]);
function shape(value: unknown): unknown {
  if (typeof value === "function") return "fn";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !LOOKUPS.has(k)).map(([k, v]) => [k, shape(v)]).sort());
  return typeof value;
}

describe("locale contract (same as Ignas PR3: bsproof.lang = en | lt, English default)", () => {
  beforeEach(() => {
    installLocalStorage();
    resetLangMemory();
  });

  it("uses the PR3 storage key and only ever yields en or lt", () => {
    expect(LANG_KEY).toBe("bsproof.lang");
    expect(normalizeLang("lt")).toBe("lt");
    for (const bad of ["en", "LT", "de", "", null, undefined, 3]) expect(normalizeLang(bad)).toBe("en");
  });

  it("persists the choice and survives a reload; blocked storage still switches for the visit", () => {
    resetLangMemory();
    window.localStorage.removeItem(LANG_KEY);
    expect(readStoredLang()).toBe("en");
    writeLang("lt");
    expect(window.localStorage.getItem(LANG_KEY)).toBe("lt");
    resetLangMemory();
    expect(readStoredLang()).toBe("lt");
    window.localStorage.setItem(LANG_KEY, "garbage");
    expect(readStoredLang()).toBe("en");
    writeLang("en");
    window.localStorage.removeItem(LANG_KEY);
    resetLangMemory();
  });
});

describe("dictionaries", () => {
  it.each([
    ["flow", FLOW_COPY],
    ["result", RESULT_COPY],
    ["history", HISTORY_COPY],
    ["search", SEARCH_COPY],
  ] as const)("%s: LT has exactly the keys and kinds EN has", (_name, copy) => {
    expect(shape(copy.lt)).toEqual(shape(copy.en));
  });

  it("every LT string differs from EN unless it is a name, glyph or unit (no silent English left in LT)", () => {
    const same: string[] = [];
    const walk = (en: unknown, lt: unknown, at: string) => {
      if (typeof en === "string" && typeof lt === "string") {
        if (en === lt && /[A-Za-z]{3}/.test(en)) same.push(`${at} = ${en}`);
      } else if (Array.isArray(en) && Array.isArray(lt)) en.forEach((v, i) => walk(v, lt[i], `${at}[${i}]`));
      else if (en && lt && typeof en === "object") for (const k of Object.keys(en)) walk((en as Record<string, unknown>)[k], (lt as Record<string, unknown>)[k], `${at}.${k}`);
    };
    for (const [name, copy] of Object.entries({ flow: FLOW_COPY, result: RESULT_COPY, history: HISTORY_COPY, search: SEARCH_COPY })) walk(copy.en, copy.lt, name);
    expect(same).toEqual([]);
  });

  it("LT servings plural and function templates keep every number", () => {
    const lt = FLOW_COPY.lt;
    expect(lt.servingsPerDay(1)).toBe("1 porcija per dieną");
    expect(lt.servingsPerDay(2)).toBe("2 porcijos per dieną");
    expect(lt.servingsPerDay(10)).toBe("10 porcijų per dieną");
    expect(lt.servingsPerDay(21)).toBe("21 porcija per dieną");
    expect(lt.imageTooLarge("13.4")).toContain("13.4");
    expect(lt.imageTooLarge("13.4")).toContain("12 MB");
    expect(lt.requestFailed(502)).toContain("502");
    expect(RESULT_COPY.lt.formEvidenceStrength("0.85", "ladder")).toContain("0.85");
    expect(HISTORY_COPY.lt.latest(3)).toContain("3");
    expect(RESULT_COPY.lt.warningCount(2)).toMatch(/^2 /);
  });

  it("English copy is the wording the app always had (guards the wording the existing tests key on)", () => {
    expect(FLOW_COPY.en.scanThis).toBe("Scan this label");
    expect(FLOW_COPY.en.signInHistoryTitle).toBe("Sign in to see your history");
    expect(RESULT_COPY.en.warningCount(1)).toBe("1 evidence warning");
    expect(RESULT_COPY.en.warningCount(2)).toBe("2 evidence warnings");
    expect(enumWord("en", "no_effect")).toBe("no effect");
    expect(strengthLabel("en", "limited")).toBe("limited evidence");
  });

  it("ledger words are display-only: the scorer keeps its English and its numbers", () => {
    const audit = retainedAuditForProduct({ ingredient: "creatine", form: "creatine_monohydrate", compoundDoseMg: 4000, servingsPerDay: 1, isMultiIngredient: false, actives: [{ name: "Creatine", compoundDoseMg: 4000 }], otherActives: [] })!;
    for (const outcome of audit.audit.outcomes) {
      const scored = score(ledgerFromAudit(outcome));
      // every word the ledger can print has an LT rendering; none is left as English
      for (const word of [scored.effectWord, scored.certaintyWord, scored.formWord, scored.doseWord, scored.label, ...scored.firedGates]) {
        expect(ledgerWord("lt", word), word).not.toBe(word);
        expect(ledgerWord("en", word)).toBe(word);
      }
    }
  });
});

describe("dose reading + note: Lithuanian is re-rendered from stored numbers; English is pinned to the server", () => {
  const rows: DoseRowInput[] = [
    { outcome: "a_in", outcome_label: "In range", composite: 1, verdict: null, arcs: { dose: { closeness: 1, product_match: "in_band" } }, benefit_dose_range_mg: { low: 3000, high: 5000 }, null_dose_range_mg: null },
    { outcome: "b_in_contested", outcome_label: "Contested", composite: 1, verdict: null, arcs: { dose: { closeness: 1, product_match: "in_band" } }, benefit_dose_range_mg: { low: 3000, high: 5000 }, null_dose_range_mg: { low: 4000, high: 6000 } },
    { outcome: "c_below", outcome_label: "Below", composite: 1, verdict: null, arcs: { dose: { closeness: 0.1, product_match: "below_50" } }, benefit_dose_range_mg: { low: 8000, high: 9000 }, null_dose_range_mg: null },
    { outcome: "d_above", outcome_label: "Above", composite: 1, verdict: null, arcs: { dose: { closeness: 0.3, product_match: "above_200" } }, benefit_dose_range_mg: { low: 500, high: 900 }, null_dose_range_mg: null },
    { outcome: "e_noband", outcome_label: null, composite: null, verdict: null, arcs: { dose: { closeness: null, product_match: null } }, benefit_dose_range_mg: null, null_dose_range_mg: { low: 100, high: 200 } },
    { outcome: "f_noband_nonull", outcome_label: "No band", composite: null, verdict: null, arcs: {}, benefit_dose_range_mg: null, null_dose_range_mg: null },
    { outcome: "g_other", outcome_label: "Other", composite: 1, verdict: null, arcs: { dose: { closeness: 0.62, product_match: "mid" } }, benefit_dose_range_mg: { low: 4000, high: 4500 }, null_dose_range_mg: null },
    { outcome: "h_below_by_close", outcome_label: "Below by closeness", composite: 1, verdict: null, arcs: { dose: { closeness: 0.5, product_match: null } }, benefit_dose_range_mg: { low: 9000, high: 9500 }, null_dose_range_mg: null },
    { outcome: "i_above_by_close", outcome_label: "Above by closeness", composite: 1, verdict: null, arcs: { dose: { closeness: 0.5, product_match: null } }, benefit_dose_range_mg: { low: 100, high: 300 }, null_dose_range_mg: null },
  ];
  const inputs: Array<[string, { perServing: number | null; servings: number | null }]> = [
    ["daily", { perServing: 4000, servings: 1 }],
    ["daily x2", { perServing: 2500.5, servings: 2 }],
    ["per serving", { perServing: 4000, servings: null }],
    ["no dose", { perServing: null, servings: 1 }],
  ];

  it.each(inputs)("%s: EN twin equals the server text; LT keeps every number and the tone", (_label, input) => {
    const section = doseEffectivenessSection({ perServingElementalMg: input.perServing, servingsPerDay: input.servings, conversionBasis: "converted", rows });
    expect(doseNoteText("en", section)).toBe(section.note);
    const lt = doseNoteText("lt", section);
    for (const n of section.note.match(/\d+(?:\.\d+)?/g) ?? []) expect(lt, `note keeps ${n}`).toContain(n);
    section.outcomes.forEach((o) => {
      const parts = { dose: section.scored_dose_mg, benefit: o.benefit_range_mg, nulls: o.null_range_mg, productMatch: o.product_match, closeness: o.closeness };
      const en = doseReadingBody("en", parts);
      const name = o.outcome_label ?? o.outcome.replace(/_/g, " ");
      expect(`${name}: ${en.body}`, o.outcome).toBe(o.reading);
      expect(en.tone).toBe(o.tone);
      const ltBody = doseReadingBody("lt", parts);
      expect(ltBody.tone).toBe(o.tone);
      // every figure (doses, ranges, closeness) is copied, not recomputed or reformatted
      for (const n of en.body.match(/\d+(?:\.\d+)?/g) ?? []) expect(ltBody.body, `${o.outcome} keeps ${n}`).toContain(n);
      expect(ltBody.body).not.toBe(en.body);
    });
  });

  it("scoring and ledger modules never import the i18n or translation layer", () => {
    for (const rel of ["lib/analyze/scoring.ts", "lib/analyze/product-score.ts", "lib/analyze/dose-effectiveness.ts", "lib/analyze/manual-dose.ts", "lib/evidence-ledger/index.ts", "lib/evidence-ledger/retained-audits.ts", "lib/analyze/vocab.ts", "lib/analyze/catalog.ts"]) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(text, rel).not.toMatch(/i18n|analyze\/translate|from "\.\/translate"/);
    }
  });
});

describe("fixed server sentences all have a deterministic Lithuanian rendering", () => {
  function offlineDeps(): ScanDeps {
    let t = 0;
    return {
      readLabel: async () => {
        throw new Error("no label read");
      },
      chatJson: null,
      fetch: (async () => new Response(JSON.stringify({ hitCount: 7 }), { status: 200 })) as typeof fetch,
      scoreProduct,
      budgetMs: 55_000,
      now: () => (t += 10),
    };
  }

  it("caveats the real analyzer emits (typed path variants)", async () => {
    const variants = [
      { ingredient: "creatine", form: "creatine_monohydrate", dose: null, servings_per_day: null },
      { ingredient: "magnesium", form: "magnesium_glycinate", dose: { value: 300, unit: "mg" }, servings_per_day: null },
      { ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 5, unit: "g" }, servings_per_day: 1 },
    ];
    const texts = new Set<string>();
    for (const input of variants) {
      const out = await analyzeManual(input, offlineDeps());
      for (const c of out.caveats ?? []) texts.add(c.text);
    }
    expect(texts.size).toBeGreaterThan(1);
    for (const text of texts) {
      const lt = knownServerText("lt", text);
      expect(lt, text).not.toBeNull();
      expect(lt).not.toBe(text);
      expect(knownServerText("en", text)).toBe(text);
    }
  });

  it("the evidence-prior disclaimer, reasons and the registry note", async () => {
    const out = await analyzeManual({ ingredient: "magnesium", form: "magnesium_glycinate", dose: { value: 300, unit: "mg" }, servings_per_day: 1 }, offlineDeps());
    const fixed = [out.evidence_prior?.disclaimer, out.evidence_prior?.reason, out.compatibility?.model.reason, out.company?.profile.reason, out.literature_warnings?.reason].filter((x): x is string => Boolean(x));
    expect(fixed.length).toBeGreaterThanOrEqual(3);
    for (const text of fixed) expect(knownServerText("lt", text), text).not.toBeNull();
    const registry = await registryRecalls(
      { brand: "Nordic Labs", manufacturer: null, product_name: null, certifications: [], country_of_origin: null },
      { chatJson: null, fetch: (async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as typeof fetch, timeoutMs: 1000, allowModel: false },
    );
    expect(knownServerText("lt", registry.note)).not.toBeNull();
  });

  it("the manual-entry validation messages and prior dose readings", () => {
    const samples = [
      "The dose must be a positive number.",
      "Servings per day must be 24 or fewer.",
      "Servings per day must be a whole number of 1 or more, or left empty.",
      "The dose unit must be one of mg, g, mcg. IU is not accepted — enter the mass printed beside it.",
      "The dose is too large to be a per-serving amount — the form accepts up to 100000 mg per serving.",
      "4 g/day sits inside the range the model recalls as effective (3 g–5 g).",
      "1 g/day is below the range the model recalls as effective (3 g).",
      "9 g/day is above the range the model recalls as effective (3 g–5 g); more is not evidence of more effect.",
      "Your dose could not be read off the label, so it cannot be compared.",
    ];
    for (const text of samples) {
      const lt = knownServerText("lt", text);
      expect(lt, text).not.toBeNull();
      for (const n of text.match(/\d+/g) ?? []) expect(lt).toContain(n);
    }
    expect(knownServerText("lt", "An invented sentence the server never emits.")).toBeNull();
  });
});

describe("disclosure templates: Lithuanian wording, same decision rule, model text passed through", () => {
  const warnings = {
    funding_independence: { status: "concern" as const, basis: "Most positive trials were funded by one supplier.", confidence: "medium" as const, notable_funders: ["AlzChem"] },
    publication_bias: { status: "no_concern" as const, basis: "", confidence: "low" as const },
  };

  it("only concerns render, in both languages; basis goes through tr; funders stay as written", () => {
    const en = literatureDisclosures(warnings);
    const lt = literatureDisclosures(warnings, { lang: "lt", tr: (s) => `«${s}»`, confidenceWord: (v) => enumWord("lt", v) });
    expect(en).toHaveLength(1);
    expect(lt).toHaveLength(1);
    expect(lt[0].title).toBe("Finansavimas ir nepriklausomumas");
    expect(lt[0].body).toContain("«Most positive trials were funded by one supplier.»");
    expect(lt[0].body).toContain("AlzChem");
    expect(lt[0].body).toContain("nekeičia įrodymų balo");
    expect(lt[0].body).toContain("vidutinis");
  });

  it("MLM disclosure: only confirmed/suspected render", () => {
    const bm = (status: "confirmed_mlm" | "suspected_mlm" | "no_evidence") => ({ status, basis: "Recruits distributors.", confidence: "high" as const });
    const loc = { lang: "lt" as const, tr: (s: string) => s, confidenceWord: (v: string) => enumWord("lt", v) };
    expect(businessModelDisclosure(bm("no_evidence"), loc)).toBeNull();
    expect(businessModelDisclosure(bm("confirmed_mlm"), loc)?.body).toContain("yra organizuota kaip MLM");
    expect(businessModelDisclosure(bm("suspected_mlm"), loc)?.body).toContain("gali būti organizuota kaip MLM");
    expect(businessModelDisclosure(bm("suspected_mlm"))?.body).toContain("may be organised as an MLM");
  });
});
