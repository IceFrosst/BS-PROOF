/*
 * THE SCAN ORCHESTRATION, with zero model calls.
 *
 * lib/analyze/scan.ts takes its label read, its model and its fetch as
 * injectable dependencies, so the whole flow -- label -> identity -> evidence
 * -> dose -> compatibility -> company -> one ScanAnalysisV1 -- runs here
 * against fakes. What is pinned:
 *
 *   - every section carries a basis, and model output is basis model_prior
 *   - a failing model call degrades ONE section, never the evidence score
 *   - the curated table is cited and only references real form ids
 *   - openFDA parsing, including its 404-means-no-matches convention
 *   - the daily-dose rule (per serving x servings/day) for the scored dose
 *   - the JSON extractor and the schema validator refuse what they must
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
import { ModelCallError, extractJson, validateAgainstSchema, type ChatJsonFn } from "@/lib/analyze/llm";
import { analyzeScan, type ScanDeps } from "@/lib/analyze/scan";
import { scoreProduct } from "@/lib/analyze/product-score";
import { validateLabel, type LabelRead } from "@/lib/analyze/vision";

type Json = Record<string, unknown>;

const ROOT = process.cwd();

function label(overrides: Partial<LabelRead> = {}): LabelRead {
  return {
    ingredient_vocab_id: "creatine",
    ingredient_label_text: "Creatine Monohydrate",
    form_vocab_id: "creatine_monohydrate",
    compound_dose_mg: 5000,
    dose_unit_as_printed: "5 g",
    servings_per_day: 1,
    is_multi_ingredient: false,
    other_actives: [],
    actives: [{ name: "Creatine Monohydrate", compound_dose_mg: 5000, dose_unit_as_printed: "5 g", form_text: "monohydrate" }],
    certifications: ["Informed Sport"],
    manufacturer: "Testbrand Labs Ltd",
    country_of_origin: null,
    warnings_printed: [],
    claims_printed: ["Supports muscle strength"],
    brand: "Testbrand",
    product_name: "Testbrand Creatine",
    is_supplement_label: true,
    confidence: "high",
    unreadable_reason: null,
    evidence_spans: ["Creatine Monohydrate 5 g"],
    _meta: { model: "fake-vision", prompt_version: "label-v1.1", elapsed_s: 0.1, backend: "fake", input_tokens: null, output_tokens: null },
    ...overrides,
  };
}

const companyFixture = {
  brand: "Testbrand",
  known: true,
  summary: "A sports nutrition brand.",
  founded_year: 2010,
  headquarters_country: "United Kingdom",
  parent_company: null,
  ownership_type: "private",
  third_party_testing: { program: "Informed Sport", status: "claimed" },
  transparency: { coa_published: "unknown" },
  regulatory_history: [{ kind: "recall", year: 2019, summary: "A voluntary recall of one lot.", confidence: "low" }],
  reputation_notes: [],
  confidence: "medium",
  caveats: ["Recall details not confirmed."],
};

const compatFixture = {
  pairs: [
    { a: "Creatine Monohydrate", b: "Beta-Alanine", interaction: "none", severity: "info", mechanism: "", confidence: "high" },
  ],
  form_notes: [],
  overall: "No documented interaction between these actives.",
};

function fakeChatJson(answers: Record<string, unknown>): ChatJsonFn {
  return (async <T,>(request: { purpose: string }) => {
    const value = answers[request.purpose];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new ModelCallError("http", `no fixture for ${request.purpose}`);
    // A fresh object per call, as the real chatJson returns: callers may
    // annotate their copy (company.ts adds registry_corroborated) and a shared
    // fixture would leak that into the next test.
    return { value: structuredClone(value) as T, meta: { text: "", model: "fake-text", backend: "fake", elapsed_s: 0.2, input_tokens: null, output_tokens: null, finish_reason: "stop" } };
  }) as ChatJsonFn;
}

const openFdaRecord = {
  recall_number: "F-0001-2019",
  reason_for_recall: "Undeclared allergen",
  status: "Terminated",
  classification: "Class II",
  product_description: "Testbrand Creatine 500 g tub",
  recalling_firm: "Testbrand Labs Ltd",
  recall_initiation_date: "20190315",
};

function fakeFetch(handlers: { openfda?: (url: string) => Response; pmc?: () => Response }): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.fda.gov/")) {
      return handlers.openfda ? handlers.openfda(url) : new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 });
    }
    if (url.includes("europepmc")) {
      return handlers.pmc ? handlers.pmc() : new Response(JSON.stringify({ hitCount: 42 }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
}

function deps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  let t = 0;
  return {
    readLabel: async () => label(),
    chatJson: fakeChatJson({ "company profile": companyFixture, compatibility: compatFixture }),
    fetch: fakeFetch({}),
    scoreProduct,
    budgetMs: 55_000,
    now: () => (t += 10),
    ...overrides,
  };
}

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
    expect(curatedFormNotes("creatine", "creatine_hcl")).toHaveLength(0);
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

  it("an unsupported ingredient still gets its company background and a queue entry", async () => {
    const out = await analyzeScan(
      "aW1n",
      "image/png",
      deps({ readLabel: async () => label({ ingredient_vocab_id: null, ingredient_label_text: "Shilajit", form_vocab_id: null }) }),
    );
    expect(out.status).toBe("ingredient_not_supported");
    expect(out.company?.status).toBe("ok");
    expect(out.evidence).toBeUndefined();
    expect(out.supported_ingredients).toContain("creatine");
  });

  it("a non-label image stops after the read", async () => {
    const out = await analyzeScan("aW1n", "image/png", deps({ readLabel: async () => label({ is_supplement_label: false }) }));
    expect(out.status).toBe("not_a_supplement_label");
    expect(out.company).toBeUndefined();
  });
});
