/*
 * FAKES FOR THE SCAN ORCHESTRATION. Zero model calls, zero network.
 *
 * Shared by tests/scan.test.ts, tests/dashboard/scan-report.test.tsx and the
 * development-only preview at app/scan/preview (which renders the real
 * ScanReport over a real analyzeScan run, with these standing in for the
 * label read, the text model and the two public APIs). One copy so the three
 * never drift apart.
 *
 * Nothing here imports vitest; it must load inside a Next.js server component.
 */
import { ModelCallError, type ChatJsonFn } from "@/lib/analyze/llm";
import { scoreProduct } from "@/lib/analyze/product-score";
import type { ScanDeps } from "@/lib/analyze/scan";
import type { LabelRead } from "@/lib/analyze/vision";

export function label(overrides: Partial<LabelRead> = {}): LabelRead {
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

/** A magnesium glycinate label: in the vocabulary, but no retained run. */
export function magnesiumLabel(overrides: Partial<LabelRead> = {}): LabelRead {
  return label({
    ingredient_vocab_id: "magnesium",
    ingredient_label_text: "Magnesium Bisglycinate",
    form_vocab_id: "magnesium_glycinate",
    compound_dose_mg: 2000,
    dose_unit_as_printed: "2000 mg",
    servings_per_day: 1,
    actives: [{ name: "Magnesium (as magnesium bisglycinate)", compound_dose_mg: 2000, dose_unit_as_printed: "2000 mg", form_text: "bisglycinate" }],
    claims_printed: ["Supports restful sleep"],
    product_name: "Testbrand Magnesium Glycinate",
    evidence_spans: ["Magnesium (as bisglycinate) 2000 mg"],
    ...overrides,
  });
}

export const companyFixture = {
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

export const priorFixture = {
  ingredient: "Magnesium",
  recognised: true,
  summary: "An essential mineral taken for sleep, cramps and migraine prophylaxis.",
  evidence_landscape: { syntheses_exist: "many", note: "Multiple meta-analyses exist." },
  outcomes: [
    {
      outcome: "sleep quality",
      direction: "benefit",
      evidence_strength: "limited",
      effective_daily_dose_low_mg: 200,
      effective_daily_dose_high_mg: 400,
      pooled_effect_recalled: "SMD 0.30 [0.10, 0.50]",
      population: "older adults with insomnia",
      note: "A few small RCTs, heterogeneous.",
      confidence: "medium",
    },
    {
      outcome: "migraine frequency",
      direction: "insufficient",
      evidence_strength: "limited",
      effective_daily_dose_low_mg: null,
      effective_daily_dose_high_mg: null,
      pooled_effect_recalled: null,
      population: null,
      note: "Mixed trials.",
      confidence: "low",
    },
  ],
  form_assessment: { form: "magnesium glycinate", verdict: "well_absorbed", note: "Chelated forms are better tolerated." },
  safety_notes: ["Supplemental magnesium above 350 mg/day can cause diarrhoea."],
  confidence: "medium",
  caveats: [],
};

export const compatFixture = {
  pairs: [{ a: "Creatine Monohydrate", b: "Beta-Alanine", interaction: "none", severity: "info", mechanism: "", confidence: "high" }],
  form_notes: [],
  overall: "No documented interaction between these actives.",
};

export function fakeChatJson(answers: Record<string, unknown>): ChatJsonFn {
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

export const openFdaRecord = {
  recall_number: "F-0001-2019",
  reason_for_recall: "Undeclared allergen",
  status: "Terminated",
  classification: "Class II",
  product_description: "Testbrand Creatine 500 g tub",
  recalling_firm: "Testbrand Labs Ltd",
  recall_initiation_date: "20190315",
};

export function fakeFetch(handlers: { openfda?: (url: string) => Response; pmc?: () => Response }): typeof fetch {
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

export function deps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  let t = 0;
  return {
    readLabel: async () => label(),
    chatJson: fakeChatJson({ "company profile": companyFixture, compatibility: compatFixture, "evidence prior": priorFixture }),
    fetch: fakeFetch({}),
    scoreProduct,
    budgetMs: 55_000,
    now: () => (t += 10),
    ...overrides,
  };
}

/** Named scenarios the preview route and the render test both use. */
export const SCENARIOS = {
  /** Creatine monohydrate: the one product with a retained run. Measured path. */
  creatine: () => deps(),
  /** Magnesium glycinate: in vocabulary, no run. Model orientation path. */
  magnesium: () => deps({ readLabel: async () => magnesiumLabel() }),
  /** Out-of-vocabulary botanical: orientation + company + mix only. */
  shilajit: () => deps({ readLabel: async () => label({ ingredient_vocab_id: null, ingredient_label_text: "Shilajit", form_vocab_id: null, product_name: "Himalayan Shilajit Resin", actives: [{ name: "Shilajit", compound_dose_mg: 500, dose_unit_as_printed: "500 mg", form_text: null }] }) }),
  /** Creatine with an FDA recall on file for the firm. */
  recall: () => deps({ fetch: fakeFetch({ openfda: () => new Response(JSON.stringify({ results: [openFdaRecord] }), { status: 200 }) }) }),
  /** Magnesium with no model at all: what a keyless deployment answers. */
  nomodel: () => deps({ readLabel: async () => magnesiumLabel(), chatJson: null }),
  /** Not a label. */
  notlabel: () => deps({ readLabel: async () => label({ is_supplement_label: false }) }),
} as const;

export type ScenarioName = keyof typeof SCENARIOS;
