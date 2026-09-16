/*
 * THE SCAN ORCHESTRATION, with zero model calls.
 *
 * lib/analyze/scan.ts takes its label read, its model and its fetch as
 * injectable dependencies, so the whole flow -- label -> identity -> evidence
 * -> dose -> compatibility -> company -> summary -> one ScanAnalysisV1 -- runs
 * here against the fakes in tests/fixtures/scan-fakes.ts. What is pinned:
 *
 *   - every section carries a basis, and model output is basis model_prior
 *   - a failing model call degrades ONE section, never the evidence score
 *   - the curated table is cited and only references real form ids
 *   - openFDA parsing, including its 404-means-no-matches convention
 *   - the daily-dose rule (per serving x servings/day) for the scored dose
 *   - the JSON extractor and the schema validator refuse what they must
 *   - the plain-language summary mints no number, stamps every estimate, and
 *     never turns "not scored" into a low tone
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { companySection, registryRecalls } from "@/lib/analyze/company";
import {
  curatedFormNotes,
  curatedInteractions,
  loadCompatVocab,
  normaliseActive,
  resolveActives,
  uncoveredPairs,
} from "@/lib/analyze/compatibility";
import { doseEffectivenessSection, scoredDose } from "@/lib/analyze/dose-effectiveness";
import { readPriorDose, type PriorOutcome } from "@/lib/analyze/evidence-prior";
import { ModelCallError, extractJson, validateAgainstSchema } from "@/lib/analyze/llm";
import { analyzeScan } from "@/lib/analyze/scan";
import type { Finding } from "@/lib/analyze/summary";
import { validateLabel } from "@/lib/analyze/vision";
import { SCENARIOS, companyFixture, deps, fakeChatJson, fakeFetch, label, magnesiumLabel, openFdaRecord } from "@/tests/fixtures/scan-fakes";

type Json = Record<string, unknown>;

const ROOT = process.cwd();

describe("curated compatibility table", () => {
  it("only references form ids that exist in vocab/form.json and cites every entry", () => {
    const forms = JSON.parse(fs.readFileSync(path.join(ROOT, "vocab", "form.json"), "utf8")) as {
      ingredients: Record<string, { forms: Array<{ id: string }> }>;
    };
    const ids = new Set(Object.values(forms.ingredients).flatMap((b) => b.forms.map((f) => f.id)));
    const vocab = loadCompatVocab();
    for (const note of vocab.form_notes) {
      expect(forms.ingredients[note.ingredient], `ingredient ${note.ingredient}`).toBeTruthy();
      if (note.form_id !== null) expect(ids.has(note.form_id), `form ${note.form_id}`).toBe(true);
      expect(note.source.url).toMatch(/^https:\/\//);
    }
    for (const row of vocab.interactions) {
      expect(vocab.aliases[row.a], `alias ${row.a}`).toBeTruthy();
      expect(vocab.aliases[row.b], `alias ${row.b}`).toBeTruthy();
      expect(row.source.url).toMatch(/^https:\/\//);
      expect(["info", "moderate", "high"]).toContain(row.severity);
    }
  });

  it("normalises printed names by whole-word alias, longest match first", () => {
    expect(normaliseActive("Calcium (as calcium carbonate) 500 mg")).toBe("calcium");
    expect(normaliseActive("Vitamin D3 (cholecalciferol) 2000 IU")).toBe("vitamin_d");
    expect(normaliseActive("Ferrous bisglycinate")).toBe("iron");
    expect(normaliseActive("Bioperine")).toBe("piperine");
    expect(normaliseActive("Silica")).toBeNull();
  });

  it("finds the cited calcium-iron competition and the creatine monohydrate reference note", () => {
    const actives = resolveActives(
      "iron",
      [
        { name: "Iron (as ferrous sulfate)", compound_dose_mg: 65, dose_unit_as_printed: "65 mg", form_text: "ferrous sulfate" },
        { name: "Calcium carbonate", compound_dose_mg: 500, dose_unit_as_printed: "500 mg", form_text: null },
        { name: "Silica", compound_dose_mg: null, dose_unit_as_printed: null, form_text: null },
      ],
      [],
    );
    const rows = curatedInteractions(actives);
    expect(rows.map((r) => r.kind)).toContain("absorption_competition");
    expect(rows.every((r) => r.basis === "curated_table" && r.source !== null)).toBe(true);
    // Silica matched no alias, so its pairs are left for the model fill-in.
    const pairs = uncoveredPairs(actives, rows);
    expect(pairs.some(([a, b]) => [a.printed, b.printed].includes("Silica"))).toBe(true);
    expect(pairs.some(([a, b]) => new Set([a.canonical, b.canonical]).has("calcium") && new Set([a.canonical, b.canonical]).has("iron"))).toBe(false);

    const notes = curatedFormNotes("creatine", "creatine_monohydrate");
    expect(notes).toHaveLength(1);
    expect(notes[0].source?.url).toContain("doi.org");
    expect(notes[0].kind).toBe("reference_form");
    expect(curatedFormNotes("creatine", "creatine_hcl")).toHaveLength(0);
    // The curated kind travels on the row so the summary reacts to WHAT a note says.
    expect(curatedFormNotes("magnesium", "magnesium_oxide").map((n) => n.kind)).toContain("low_bioavailability");
  });
});

describe("company background", () => {
  it("parses openFDA enforcement rows and treats 404 as no matches", async () => {
    const hit = await registryRecalls(
      { brand: "Testbrand", manufacturer: null, product_name: null, certifications: [], country_of_origin: null },
      {
        chatJson: null,
        allowModel: false,
        timeoutMs: 1000,
        fetch: fakeFetch({ openfda: () => new Response(JSON.stringify({ results: [openFdaRecord] }), { status: 200 }) }),
      },
    );
    expect(hit.status).toBe("ok");
    expect(hit.recalls).toHaveLength(1); // the same record from two queries is deduplicated
    expect(hit.recalls[0].initiated).toBe("2019-03-15");
    expect(hit.recalls[0].basis).toBe("registry");

    const miss = await registryRecalls(
      { brand: "Nobody", manufacturer: null, product_name: null, certifications: [], country_of_origin: null },
      { chatJson: null, allowModel: false, timeoutMs: 1000, fetch: fakeFetch({}) },
    );
    expect(miss.status).toBe("no_matches");
  });

  it("marks the model profile as model_prior and flags an uncorroborated recall", async () => {
    const section = await companySection(
      { brand: "Testbrand", manufacturer: "Testbrand Labs Ltd", product_name: "Testbrand Creatine", certifications: ["Informed Sport"], country_of_origin: null },
      { chatJson: fakeChatJson({ "company profile": companyFixture }), allowModel: true, timeoutMs: 1000, fetch: fakeFetch({}) },
    );
    expect(section.status).toBe("ok");
    expect(section.profile.basis).toBe("model_prior");
    expect(section.profile.data?.regulatory_history[0].registry_corroborated).toBe(false);
    expect(section.certifications_printed[0].basis).toBe("label");
    expect(section.basis_used).toEqual(expect.arrayContaining(["label", "model_prior"]));
    expect(section.basis_used).not.toContain("registry");
  });

  it("degrades the profile, not the section, when the model fails", async () => {
    const section = await companySection(
      { brand: "Testbrand", manufacturer: null, product_name: null, certifications: [], country_of_origin: null },
      { chatJson: fakeChatJson({ "company profile": new ModelCallError("timeout", "slow") }), allowModel: true, timeoutMs: 1000, fetch: fakeFetch({}) },
    );
    expect(section.profile.status).toBe("unavailable");
    expect(section.profile.reason).toBe("slow");
    expect(section.registry.status).toBe("no_matches");
  });
});

describe("dose effectiveness", () => {
  it("scores the daily dose when servings per day are printed, per serving otherwise", () => {
    expect(scoredDose(3000, 2)).toEqual({ dose: 6000, basis: "daily", daily: 6000 });
    expect(scoredDose(3000, null)).toEqual({ dose: 3000, basis: "per_serving", daily: null });
    expect(scoredDose(null, 2)).toEqual({ dose: null, basis: "none", daily: null });
  });

  it("reads a row into plain language with its tone", () => {
    const section = doseEffectivenessSection({
      perServingElementalMg: 2000,
      servingsPerDay: 1,
      conversionBasis: "converted",
      rows: [
        {
          outcome: "muscle_power",
          outcome_label: "Power",
          composite: 54,
          verdict: "unclear",
          arcs: { dose: { closeness: 0.1, product_match: "below_50", coverage: 0.22 } },
          benefit_dose_range_mg: { low: 17584, high: 17824, basis: "observed_benefit_doses" },
          null_dose_range_mg: { low: 17584, high: 19729 },
        },
      ],
    });
    expect(section.status).toBe("ok");
    expect(section.outcomes[0].tone).toBe("below");
    expect(section.outcomes[0].reading).toContain("below the range");
    expect(section.basis).toBe("evidence_run");
  });
});

describe("model boundary helpers", () => {
  it("forgives a markdown fence and refuses non-objects", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow(ModelCallError);
    expect(() => extractJson("[1,2]")).toThrow(ModelCallError);
  });

  it("validates against a schema, dropping unknown keys but refusing wrong types", () => {
    const ok = validateAgainstSchema({ ...companyFixture, note: "extra" }, "company.json");
    expect("note" in ok).toBe(false);
    expect(() => validateAgainstSchema({ ...companyFixture, founded_year: "2010" }, "company.json")).toThrow(/founded_year/);
    expect(() => validateAgainstSchema({ pairs: [{ a: "x", b: "y", interaction: "magic", severity: "info", confidence: "high" }], overall: "" }, "compatibility.json")).toThrow(ModelCallError);
  });

  it("a label read with the v1.1 whole-panel fields validates, and legacy nulls default", () => {
    const read = validateLabel({
      ingredient_vocab_id: "creatine",
      form_vocab_id: "creatine_monohydrate",
      compound_dose_mg: 5000,
      is_multi_ingredient: false,
      confidence: "high",
      evidence_spans: ["Creatine Monohydrate 5 g"],
      other_actives: null,
      actives: ["Creatine Monohydrate"],
      certifications: null,
    });
    expect(read.actives).toEqual([{ name: "Creatine Monohydrate", compound_dose_mg: null, dose_unit_as_printed: null, form_text: null }]);
    expect(read.certifications).toEqual([]);
    expect(read.other_actives).toEqual([]);
  });
});

describe("analyzeScan end to end (fakes only)", () => {
  it("returns every section with its basis and never lets a model failure touch the score", async () => {
    const ok = await analyzeScan("aW1n", "image/png", deps());
    expect(ok.schema_version).toBe("ScanAnalysisV1");
    expect(ok.label?.brand).toBe("Testbrand");
    expect(ok.product?.scored_dose_basis).toBe("daily");
    expect(ok.dose_effectiveness?.basis).toBe("evidence_run");
    expect(ok.compatibility?.status).toBe("single_active");
    expect(ok.company?.profile.status).toBe("ok");
    expect(ok.company?.profile.basis).toBe("model_prior");
    expect(Object.keys(ok.basis_legend)).toEqual(expect.arrayContaining(["evidence_run", "model_prior", "registry", "curated_table", "label"]));
    expect(ok.meta.prompt_versions.label).toBe("label-v1.1");

    const broken = await analyzeScan(
      "aW1n",
      "image/png",
      deps({ chatJson: fakeChatJson({ "company profile": new ModelCallError("http", "boom"), compatibility: new ModelCallError("http", "boom") }) }),
    );
    expect(broken.status).toBe(ok.status);
    expect((broken.evidence as Json).status).toBe((ok.evidence as Json).status);
    expect(broken.company?.profile.status).toBe("unavailable");
  });

  it("skips the text model calls when the label read consumed the time budget", async () => {
    let t = 0;
    const slow = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        budgetMs: 20_000,
        now: () => (t += 1),
        readLabel: async () => {
          t += 19_000;
          return label();
        },
      }),
    );
    expect(slow.company?.profile.status).toBe("unavailable");
    expect(slow.company?.profile.reason).toMatch(/time budget/);
    expect(slow.caveats?.some((c) => c.code === "model_sections_skipped")).toBe(true);
  });

  it("an unsupported ingredient still gets an orientation, compatibility, company and a queue entry", async () => {
    const out = await analyzeScan("aW1n", "image/png", SCENARIOS.shilajit());
    expect(out.status).toBe("ingredient_not_supported");
    expect(out.company?.status).toBe("ok");
    expect(out.compatibility?.status).toBeTruthy();
    // The whole point of stage 2b: no run, but still an answer.
    expect(out.evidence_prior?.status).toBe("ok");
    expect(out.evidence_prior?.basis).toBe("model_prior");
    expect(out.evidence).toBeUndefined();
    expect(out.supported_ingredients).toContain("creatine");
  });

  it("an in-vocabulary ingredient with no run gets the orientation, with dose placed against the recalled range", async () => {
    const out = await analyzeScan("aW1n", "image/png", deps({ readLabel: async () => magnesiumLabel() }));
    expect(out.status).toBe("not_scored");
    expect(out.evidence_prior?.status).toBe("ok");
    const sleep = out.evidence_prior?.data?.outcomes[0];
    // The dose the model is asked about, and placed against, is ELEMENTAL:
    // 2000 mg of bisglycinate is 282 mg of magnesium, inside the recalled
    // 200-400 mg range. Comparing the printed 2000 mg would have read as
    // wildly above it -- the salt-mass error the conversion exists to stop.
    expect(out.evidence_prior?.scored_dose_mg).toBeCloseTo(282.1, 0);
    expect(sleep?.dose_closeness).toBe(1);
    expect(sleep?.dose_reading).toMatch(/inside the range/);
    // An outcome with no recalled range gets no comparison rather than a guess.
    expect(out.evidence_prior?.data?.outcomes[1].dose_closeness).toBeNull();
    expect(out.meta.prompt_versions.evidence_prior).toBe("evidence-prior-v1.0");
  });

  it("a scored ingredient never gets the model orientation", async () => {
    const out = await analyzeScan("aW1n", "image/png", deps());
    expect(out.status).toBe("scored");
    expect(out.evidence_prior).toBeUndefined();
  });

  it("places a dose against a recalled range with the same ramp as the scored path", () => {
    const row = (low: number | null, high: number | null): PriorOutcome => ({
      outcome: "x",
      direction: "benefit",
      evidence_strength: "moderate",
      effective_daily_dose_low_mg: low,
      effective_daily_dose_high_mg: high,
      pooled_effect_recalled: null,
      population: null,
      note: null,
      confidence: "medium",
    });
    expect(readPriorDose(row(200, 400), 300).closeness).toBe(1);
    expect(readPriorDose(row(200, 400), 300).reading).toMatch(/inside the range/);
    expect(readPriorDose(row(200, 400), 50).closeness).toBe(0.1);
    expect(readPriorDose(row(200, 400), 900).reading).toMatch(/above the range/);
    // A one-sided recall is a floor, not a refusal.
    expect(readPriorDose(row(200, null), 300).closeness).not.toBeNull();
    expect(readPriorDose(row(null, null), 300).closeness).toBeNull();
    expect(readPriorDose(row(200, 400), null).closeness).toBeNull();
  });

  it("a non-label image stops after the read", async () => {
    const out = await analyzeScan("aW1n", "image/png", SCENARIOS.notlabel());
    expect(out.status).toBe("not_a_supplement_label");
    expect(out.company).toBeUndefined();
    expect(out.summary).toBeUndefined();
  });
});

/*
 * THE PLAIN-LANGUAGE SUMMARY (lib/analyze/summary.ts, 2026-09-15). It is a
 * translation of statuses and verdict labels into words. What it must never
 * do is the subject of every test below: mint a number, hide an estimate, or
 * read "not scored" as "scores badly".
 */
describe("plain-language summary", () => {
  const KEYS: Array<Finding["key"]> = ["evidence", "dose", "form", "combination", "company"];
  const SCORE_LIKE = /\b\d{1,3}\s*(\/|out of)\s*100\b|\d+(\.\d+)?\s*%/;

  it("a scored product is MEASURED: five findings in order, no score in any headline, every finding sourced", async () => {
    const out = await analyzeScan("aW1n", "image/png", SCENARIOS.creatine());
    const s = out.summary!;
    expect(s.schema_version).toBe("ScanSummaryV1");
    expect(s.certainty).toBe("measured");
    expect(s.findings.map((f) => f.key)).toEqual(KEYS);
    for (const f of s.findings) {
      expect(f.headline, f.key).not.toMatch(SCORE_LIKE);
      expect(f.headline.length, f.key).toBeGreaterThan(0);
      expect(["good", "mixed", "caution", "concern", "unknown"]).toContain(f.tone);
    }
    expect(Object.values(s.tally).reduce((a, b) => a + b, 0)).toBe(5);

    const [evidence, dose, form, combination, company] = s.findings;
    // The evidence finding leads with one of the scorer's own verdict labels; it is a measurement, so it is not an estimate.
    expect(evidence.estimated).toBe(false);
    expect(evidence.basis).toEqual(["evidence_run"]);
    expect(evidence.headline).toMatch(/^(Works|Probably works|Unclear|Probably does not work|Does not work|Barely studied|Works, but [a-z ]+) for /);
    expect(evidence.detail).toMatch(/trials we read and can quote/);
    // The dose finding rests on the run plus the label, never on the model.
    expect(dose.basis).toEqual(expect.arrayContaining(["evidence_run", "label"]));
    expect(dose.estimated).toBe(false);
    // Monohydrate is the exact form the run scored, and the curated note says reference form -> good.
    expect(form.tone).toBe("good");
    expect(form.headline).toMatch(/creatine monohydrate is the form the trials used/i);
    // One active on the panel.
    expect(combination.tone).toBe("good");
    // Registry: no recall on file. Model: a recall NOT corroborated by the registry, testing "claimed", a seal printed.
    // That is "mixed", never "concern": an uncorroborated recollection does not get to indict a firm.
    expect(company.tone).toBe("mixed");
    expect(company.estimated).toBe(false);
    expect(company.basis).toEqual(expect.arrayContaining(["registry", "label"]));
    // And the top line says what the whole page rests on, including that it is not a product claim yet.
    expect(s.headline).toContain("Testbrand Creatine");
    expect(s.subline).toMatch(/nothing here is a product claim/);
  });

  it("no run -> ESTIMATED: the evidence, dose and form findings are stamped, and a limited-evidence benefit is 'may help', not 'works'", async () => {
    const out = await analyzeScan("aW1n", "image/png", SCENARIOS.magnesium());
    const s = out.summary!;
    expect(s.certainty).toBe("estimated");
    expect(s.headline).toMatch(/model estimate/);
    const [evidence, dose, form] = s.findings;
    expect(evidence.estimated).toBe(true);
    expect(evidence.basis).toEqual(["model_prior"]);
    expect(evidence.headline).toBe("May help sleep quality");
    expect(evidence.tone).toBe("mixed");
    expect(evidence.detail).toMatch(/model's reading of the literature/);
    // 282 mg elemental inside the recalled 200-400 mg -> good, placed by our ramp, still an estimate because the range is the model's.
    expect(dose.estimated).toBe(true);
    expect(dose.tone).toBe("good");
    expect(dose.basis).toEqual(expect.arrayContaining(["model_prior", "label"]));
    // The model's form assessment is used only because no run scored the form, and it is stamped.
    expect(form.estimated).toBe(true);
    expect(form.tone).toBe("good");
    expect(form.headline).toMatch(/well-absorbed/);
  });

  it("no run and no model -> UNKNOWN, never a concern: 'not scored' is not 'scores badly'", async () => {
    const out = await analyzeScan("aW1n", "image/png", SCENARIOS.nomodel());
    const s = out.summary!;
    expect(s.certainty).toBe("none");
    const [evidence, dose, form] = s.findings;
    expect(evidence.tone).toBe("unknown");
    expect(evidence.headline).toBe("Not measured yet");
    expect(evidence.detail).toMatch(/not a low score/);
    expect(evidence.estimated).toBe(false);
    expect(dose.tone).toBe("unknown");
    expect(form.tone).toBe("unknown");
    expect(s.tally.concern).toBe(0);
    expect(s.tally.caution).toBe(0);
  });

  it("a recall on the public registry is the one thing that makes the company finding a concern", async () => {
    const out = await analyzeScan("aW1n", "image/png", SCENARIOS.recall());
    const company = out.summary!.findings[4];
    expect(company.tone).toBe("concern");
    expect(company.basis).toEqual(["registry"]);
    expect(company.estimated).toBe(false);
    expect(company.headline).toMatch(/1 FDA recall on file/);
    expect(company.detail).toMatch(/2019-03-15/);
  });

  it("a model-recalled warning letter is a CAUTION stamped as an estimate, not a registry fact", async () => {
    const out = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        chatJson: fakeChatJson({
          "company profile": { ...companyFixture, regulatory_history: [{ kind: "fda_warning_letter", year: 2021, summary: "Labelling claims.", confidence: "medium" }] },
        }),
      }),
    );
    const company = out.summary!.findings[4];
    expect(company.tone).toBe("caution");
    expect(company.estimated).toBe(true);
    expect(company.basis).toContain("model_prior");
    expect(company.detail).toMatch(/not corroborated by a registry/i);
  });

  it("a poorly absorbed form is a caution from the curated, cited table, even when the model calls it fine", async () => {
    const out = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        readLabel: async () =>
          magnesiumLabel({
            form_vocab_id: "magnesium_oxide",
            ingredient_label_text: "Magnesium Oxide",
            actives: [{ name: "Magnesium (as magnesium oxide)", compound_dose_mg: 500, dose_unit_as_printed: "500 mg", form_text: "oxide" }],
          }),
      }),
    );
    const form = out.summary!.findings[2];
    expect(form.tone).toBe("caution");
    expect(form.basis).toContain("curated_table");
    expect(form.detail).toMatch(/absorbed less/);
  });

  it("an out-of-vocabulary ingredient still gets all five findings", async () => {
    const out = await analyzeScan("aW1n", "image/png", SCENARIOS.shilajit());
    const s = out.summary!;
    expect(s.findings.map((f) => f.key)).toEqual(KEYS);
    expect(s.certainty).toBe("estimated");
    expect(s.findings[0].estimated).toBe(true);
    expect(s.findings[4].tone).not.toBe("unknown");
  });
});
