/*
 * MLM / DIRECT-SELLING DISCLOSURE (company.business_model, added 2026-09-16).
 *
 * What is pinned:
 *   - schemas/company.json requires business_model and constrains its enum
 *   - a model that omits the field entirely still validates, defaulted to the
 *     honest "unknown" (never guessed toward no_evidence)
 *   - businessModelDisclosure renders a warning ONLY for confirmed/suspected,
 *     never calls it a pyramid scheme or illegal, and always says
 *     "Model knowledge — unverified" and "does not affect the evidence score"
 *   - no_evidence / unknown render a plain, honest, non-accusatory line
 *   - the field is invisible to every scoring path: two runs that differ ONLY
 *     in business_model produce byte-identical product/evidence/dose output
 *   - no scoring source file even mentions it
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { businessModelDisclosure, type BusinessModel } from "@/lib/analyze/business-model";
import { companySection, COMPANY_PROMPT_VERSION } from "@/lib/analyze/company";
import { chatJson, ModelCallError, validateAgainstSchema, type ChatJsonFn } from "@/lib/analyze/llm";
import { analyzeScan, type ScanDeps } from "@/lib/analyze/scan";
import { scoreProduct } from "@/lib/analyze/product-score";
import type { LabelRead } from "@/lib/analyze/vision";

const ROOT = process.cwd();

const baseCompanyFields = { brand: "Acme", known: true, summary: "A sports nutrition brand.", confidence: "medium" as const };

describe("schemas/company.json — business_model", () => {
  it("is required, and its status is constrained to the four honest states", () => {
    expect(() => validateAgainstSchema({ ...baseCompanyFields }, "company.json")).toThrow(/business_model/);
    expect(() =>
      validateAgainstSchema({ ...baseCompanyFields, business_model: { status: "pyramid_scheme", basis: "x", confidence: "low" } }, "company.json"),
    ).toThrow();
    expect(() => validateAgainstSchema({ ...baseCompanyFields, business_model: { status: "unknown" } }, "company.json")).toThrow(); // basis and confidence are required too
    for (const status of ["confirmed_mlm", "suspected_mlm", "no_evidence", "unknown"]) {
      const ok = validateAgainstSchema({ ...baseCompanyFields, business_model: { status, basis: "reason", confidence: "low" } }, "company.json");
      expect(ok.business_model).toEqual({ status, basis: "reason", confidence: "low" });
    }
  });
});

describe("chatJson defaults — a model that omits business_model gets the honest unknown", () => {
  const saved = { ...process.env };
  afterEach(() => {
    if (saved.DEEPSEEK_API_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = saved.DEEPSEEK_API_KEY;
  });

  it("fills the field rather than failing validation", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(baseCompanyFields) } }], // no business_model at all
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const { value } = await chatJson<{ business_model: BusinessModel }>({
        purpose: "company profile",
        schemaFile: "company.json",
        defaults: {
          founded_year: null,
          headquarters_country: null,
          parent_company: null,
          ownership_type: "unknown",
          third_party_testing: { program: null, status: "unknown" },
          transparency: { coa_published: "unknown" },
          regulatory_history: [],
          reputation_notes: [],
          business_model: { status: "unknown", basis: "model did not report a business-model assessment", confidence: "low" },
          caveats: [],
        },
        messages: [{ role: "user", content: "x" }],
      });
      expect(value.business_model).toEqual({ status: "unknown", basis: "model did not report a business-model assessment", confidence: "low" });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("businessModelDisclosure — rendering decision, pure", () => {
  it("warns for confirmed and suspected, honestly, never calling it illegal", () => {
    const confirmed = businessModelDisclosure({ status: "confirmed_mlm", basis: "recruits distributors who earn on downline sales", confidence: "high" });
    expect(confirmed.tone).toBe("warning");
    expect(confirmed.title).toBe("MLM / direct-selling business model");
    expect(confirmed.body).toMatch(/Model knowledge — unverified/);
    expect(confirmed.body).toMatch(/does not affect the evidence score/);
    expect(confirmed.body.toLowerCase()).not.toMatch(/pyramid scheme|illegal|scam|fraud/);
    expect(confirmed.title.toLowerCase()).not.toMatch(/pyramid scheme|illegal/);

    const suspected = businessModelDisclosure({ status: "suspected_mlm", basis: "recruitment-based compensation language", confidence: "low" });
    expect(suspected.tone).toBe("warning");
    expect(suspected.body).toMatch(/may be organised/);
    expect(suspected.body.toLowerCase()).not.toMatch(/pyramid scheme|illegal/);
  });

  it("renders NOTHING for no_evidence, unknown or an absent field (founder: only show if confirmed or suspected)", () => {
    expect(businessModelDisclosure({ status: "no_evidence", basis: "sold only through retail", confidence: "medium" })).toBeNull();
    expect(businessModelDisclosure({ status: "unknown", basis: "", confidence: "low" })).toBeNull();
    // Absent entirely (e.g. a profile predating v1.1) is silence, not a crash.
    expect(businessModelDisclosure(null)).toBeNull();
    expect(businessModelDisclosure(undefined)).toBeNull();
  });
});

describe("company profile version", () => {
  it("bumped COMPANY_PROMPT_VERSION alongside the new field, and again for the plain-language rewrite", () => {
    // v1.1 added `business_model`; v1.2 (2026-09-16) added the shared
    // plain-language rule to prompts/company.md, which changes the prose the
    // model writes, so the version had to move with it (invariant 3).
    expect(COMPANY_PROMPT_VERSION).toBe("company-v1.2");
  });
});

/* -------------------------------------------------------------------------- */
/*  Proof: business_model never reaches scoring                               */
/* -------------------------------------------------------------------------- */

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
    actives: [],
    certifications: [],
    manufacturer: "Testbrand Labs Ltd",
    country_of_origin: null,
    warnings_printed: [],
    claims_printed: [],
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

function companyFixture(businessModel: BusinessModel) {
  return {
    brand: "Testbrand",
    known: true,
    summary: "A sports nutrition brand.",
    founded_year: 2010,
    headquarters_country: "United Kingdom",
    parent_company: null,
    ownership_type: "private" as const,
    third_party_testing: { program: null, status: "unknown" as const },
    transparency: { coa_published: "unknown" as const },
    regulatory_history: [],
    reputation_notes: [],
    business_model: businessModel,
    confidence: "medium" as const,
    caveats: [],
  };
}

function fakeChatJson(answers: Record<string, unknown>): ChatJsonFn {
  return (async <T,>(request: { purpose: string }) => {
    const value = answers[request.purpose];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new ModelCallError("http", `no fixture for ${request.purpose}`);
    return { value: structuredClone(value) as T, meta: { text: "", model: "fake-text", backend: "fake", elapsed_s: 0.2, input_tokens: null, output_tokens: null, finish_reason: "stop" } };
  }) as ChatJsonFn;
}

function fakeFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 })) as typeof fetch;
}

function deps(businessModel: BusinessModel): ScanDeps {
  let t = 0;
  return {
    readLabel: async () => label(),
    chatJson: fakeChatJson({
      "company profile": companyFixture(businessModel),
      compatibility: { pairs: [], form_notes: [], overall: "No documented interaction." },
    }),
    fetch: fakeFetch(),
    scoreProduct,
    budgetMs: 55_000,
    now: () => (t += 10),
  };
}

describe("business_model never reaches scoring", () => {
  it("companySection surfaces the field only under profile.data, never mixed into label/registry facts", async () => {
    const section = await companySection(
      { brand: "Testbrand", manufacturer: "Testbrand Labs Ltd", product_name: "Testbrand Creatine", certifications: [], country_of_origin: null },
      { chatJson: fakeChatJson({ "company profile": companyFixture({ status: "confirmed_mlm", basis: "recruits distributors", confidence: "high" }) }), allowModel: true, timeoutMs: 1000, fetch: fakeFetch() },
    );
    expect(section.profile.data?.business_model.status).toBe("confirmed_mlm");
    expect(section.profile.basis).toBe("model_prior");
  });

  it("identical product, different business_model -> byte-identical product/evidence/dose_effectiveness", async () => {
    const confirmed = await analyzeScan("aW1n", "image/png", deps({ status: "confirmed_mlm", basis: "recruits distributors who earn on downline sales", confidence: "high" }));
    const noEvidence = await analyzeScan("aW1n", "image/png", deps({ status: "no_evidence", basis: "sold only through retail", confidence: "medium" }));
    const unknown = await analyzeScan("aW1n", "image/png", deps({ status: "unknown", basis: "", confidence: "low" }));

    expect(confirmed.status).toBe("scored");
    expect(confirmed.product).toEqual(noEvidence.product);
    expect(confirmed.product).toEqual(unknown.product);
    expect(confirmed.evidence).toEqual(noEvidence.evidence);
    expect(confirmed.evidence).toEqual(unknown.evidence);
    expect(confirmed.dose_effectiveness).toEqual(noEvidence.dose_effectiveness);
    expect(confirmed.dose_effectiveness).toEqual(unknown.dose_effectiveness);

    // The three runs differ ONLY in the company profile's business_model.
    expect(confirmed.company?.profile.data?.business_model.status).toBe("confirmed_mlm");
    expect(noEvidence.company?.profile.data?.business_model.status).toBe("no_evidence");
    expect(unknown.company?.profile.data?.business_model.status).toBe("unknown");
  });

  it("no scoring source file mentions business_model or MLM in any form", () => {
    const scoringFiles = [
      "pipeline/scoring.py",
      "pipeline/arcs.py",
      "pipeline/dose.py",
      "lib/analyze/scoring.ts",
      "lib/analyze/product-score.ts",
      "lib/analyze/dose-effectiveness.ts",
      "lib/analyze/vocab.ts",
    ];
    for (const rel of scoringFiles) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(text.toLowerCase(), rel).not.toMatch(/business_model|mlm|direct[- ]selling/);
    }
  });
});
