/*
 * LITERATURE DISCLOSURE WARNINGS -- funding independence and publication bias,
 * "decided by the system prompt" the same way the MLM disclosure is (founder
 * 2026-09-16). What is pinned:
 *
 *   - schemas/literature_warnings.json requires both topics and constrains
 *     their status enum, and a model that omits a topic entirely still
 *     validates, defaulted to the honest "unknown"
 *   - literatureWarningsSection never throws, degrades to `unavailable` on a
 *     model failure, a missing provider, or an exhausted time budget
 *   - literatureDisclosures renders a warning ONLY for "concern", keeps the
 *     two topics independent, and never says "fraud"/"fabricated"/"rigged"
 *   - the section is wired into analyzeFromLabel for EVERY scan -- scored,
 *     not-scored, and ingredient-not-supported -- in parallel with 2b/4/5
 *   - it never reaches product/evidence/dose_effectiveness: two runs
 *     identical except for the literature-warnings answer (or with the
 *     section unavailable entirely) produce byte-identical deterministic
 *     blocks
 *   - no scoring source file mentions it at all
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { literatureDisclosures, type LiteratureWarnings } from "@/lib/analyze/literature-disclosures";
import { LITERATURE_WARNINGS_PROMPT_VERSION, literatureWarningsSection } from "@/lib/analyze/literature-warnings";
import { chatJson, ModelCallError, validateAgainstSchema, type ChatJsonFn } from "@/lib/analyze/llm";
import { analyzeScan, type ScanDeps } from "@/lib/analyze/scan";
import { scoreProduct } from "@/lib/analyze/product-score";
import type { LabelRead } from "@/lib/analyze/vision";

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

const companyFixture = {
  brand: "Testbrand",
  known: true,
  summary: "A sports nutrition brand.",
  founded_year: null,
  headquarters_country: null,
  parent_company: null,
  ownership_type: "unknown" as const,
  third_party_testing: { program: null, status: "unknown" as const },
  transparency: { coa_published: "unknown" as const },
  regulatory_history: [],
  reputation_notes: [],
  business_model: { status: "unknown" as const, basis: "", confidence: "low" as const },
  confidence: "medium" as const,
  caveats: [],
};

const compatFixture = {
  pairs: [],
  form_notes: [],
  overall: "No documented interaction between these actives.",
};

const priorFixture = {
  ingredient: "Magnesium",
  recognised: true,
  summary: "An essential mineral.",
  evidence_landscape: { syntheses_exist: "many", note: null },
  outcomes: [],
  form_assessment: { form: "magnesium glycinate", verdict: "well_absorbed", note: null },
  safety_notes: [],
  confidence: "medium",
  caveats: [],
};

function literatureWarningsFixture(
  fundingStatus: "concern" | "no_concern" | "unknown",
  biasStatus: "concern" | "no_concern" | "unknown",
): LiteratureWarnings {
  return {
    funding_independence: {
      status: fundingStatus,
      basis:
        fundingStatus === "concern"
          ? "Industry and trade-body funding dominates the published trial base for this ingredient."
          : fundingStatus === "no_concern"
            ? "Trials are independently and publicly funded across multiple countries."
            : "No specific funding pattern recalled.",
      confidence: "medium",
      notable_funders: fundingStatus === "concern" ? ["National Dairy Council"] : [],
    },
    publication_bias: {
      status: biasStatus,
      basis:
        biasStatus === "concern"
          ? "A 2025 meta-analysis of strength outcomes found funnel-plot asymmetry."
          : biasStatus === "no_concern"
            ? "A funnel-plot analysis specifically did not find asymmetry."
            : "No specific asymmetry analysis recalled.",
      confidence: "medium",
      signals: biasStatus === "concern" ? ["Egger's test significant in a 2025 meta-analysis"] : [],
    },
    caveats: [],
  };
}

function fakeChatJson(answers: Record<string, unknown>): ChatJsonFn {
  return (async <T,>(request: { purpose: string }) => {
    const value = answers[request.purpose];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new ModelCallError("http", `no fixture for ${request.purpose}`);
    return {
      value: structuredClone(value) as T,
      meta: { text: "", model: "fake-text", backend: "fake", elapsed_s: 0.2, input_tokens: null, output_tokens: null, finish_reason: "stop" },
    };
  }) as ChatJsonFn;
}

function fakeFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 })) as typeof fetch;
}

function deps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  let t = 0;
  return {
    readLabel: async () => label(),
    chatJson: fakeChatJson({
      "company profile": companyFixture,
      compatibility: compatFixture,
      "evidence prior": priorFixture,
      "literature warnings": literatureWarningsFixture("no_concern", "unknown"),
    }),
    fetch: fakeFetch(),
    scoreProduct,
    budgetMs: 55_000,
    now: () => (t += 10),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */

describe("schemas/literature_warnings.json", () => {
  it("requires both topics and constrains status to the three honest states", () => {
    expect(() => validateAgainstSchema({}, "literature_warnings.json")).toThrow();
    expect(() =>
      validateAgainstSchema(
        {
          funding_independence: { status: "worried", basis: "x", confidence: "low" },
          publication_bias: { status: "unknown", basis: "x", confidence: "low" },
        },
        "literature_warnings.json",
      ),
    ).toThrow();
    for (const status of ["concern", "no_concern", "unknown"]) {
      const ok = validateAgainstSchema(
        {
          funding_independence: { status, basis: "x", confidence: "low" },
          publication_bias: { status, basis: "x", confidence: "low" },
        },
        "literature_warnings.json",
      );
      expect((ok.funding_independence as { status: string }).status).toBe(status);
      expect((ok.publication_bias as { status: string }).status).toBe(status);
    }
  });

  it("caps string and array lengths", () => {
    expect(() =>
      validateAgainstSchema(
        {
          funding_independence: { status: "concern", basis: "x".repeat(301), confidence: "low" },
          publication_bias: { status: "unknown", basis: "x", confidence: "low" },
        },
        "literature_warnings.json",
      ),
    ).toThrow();
    expect(() =>
      validateAgainstSchema(
        {
          funding_independence: { status: "concern", basis: "x", confidence: "low", notable_funders: Array(6).fill("A") },
          publication_bias: { status: "unknown", basis: "x", confidence: "low" },
        },
        "literature_warnings.json",
      ),
    ).toThrow();
  });

  it("does not require notable_funders / signals -- a model that leaves them out still validates", () => {
    const ok = validateAgainstSchema(
      {
        funding_independence: { status: "unknown", basis: "x", confidence: "low" },
        publication_bias: { status: "unknown", basis: "x", confidence: "low" },
      },
      "literature_warnings.json",
    );
    expect(ok).toBeTruthy();
  });
});

describe("chatJson defaults -- a model that omits either topic gets the honest unknown", () => {
  const saved = { ...process.env };
  afterEach(() => {
    if (saved.DEEPSEEK_API_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = saved.DEEPSEEK_API_KEY;
  });

  it("fills both fields rather than failing validation", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), { status: 200 })) as typeof fetch;
    try {
      const { value } = await chatJson<LiteratureWarnings>({
        purpose: "literature warnings",
        schemaFile: "literature_warnings.json",
        defaults: {
          funding_independence: { status: "unknown", basis: "model did not report a funding-independence assessment", confidence: "low", notable_funders: [] },
          publication_bias: { status: "unknown", basis: "model did not report a publication-bias assessment", confidence: "low", signals: [] },
          caveats: [],
        },
        messages: [{ role: "user", content: "x" }],
      });
      expect(value.funding_independence.status).toBe("unknown");
      expect(value.publication_bias.status).toBe("unknown");
      expect(value.funding_independence.notable_funders).toEqual([]);
      expect(value.publication_bias.signals).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("literatureDisclosures -- rendering decision, pure", () => {
  it("renders a warning for a funding concern, and only that one", () => {
    const list = literatureDisclosures(literatureWarningsFixture("concern", "no_concern"));
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Funding & independence");
    expect(list[0].body).toMatch(/Model knowledge — unverified/);
    expect(list[0].body).toMatch(/does not affect the evidence score/);
    expect(list[0].body).toContain("National Dairy Council");
    expect(list[0].body.toLowerCase()).not.toMatch(/fraud|fabricated|rigged|invalid/);
  });

  it("renders a warning for a publication-bias concern, independently of funding", () => {
    const list = literatureDisclosures(literatureWarningsFixture("unknown", "concern"));
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Publication bias");
    expect(list[0].body).toContain("Egger's test significant");
    expect(list[0].body.toLowerCase()).not.toMatch(/fraud|fabricated|rigged|invalid/);
  });

  it("renders both when both are concerns, and NEITHER when neither is", () => {
    const both = literatureDisclosures(literatureWarningsFixture("concern", "concern"));
    expect(both.map((d) => d.title)).toEqual(["Funding & independence", "Publication bias"]);

    for (const [f, b] of [
      ["no_concern", "no_concern"],
      ["unknown", "unknown"],
      ["no_concern", "unknown"],
    ] as const) {
      expect(literatureDisclosures(literatureWarningsFixture(f, b))).toHaveLength(0);
    }
  });

  it("renders nothing for null, undefined, or an absent section", () => {
    expect(literatureDisclosures(null)).toEqual([]);
    expect(literatureDisclosures(undefined)).toEqual([]);
  });
});

describe("literature-warnings prompt version", () => {
  it("has its own cache domain (invariant 3)", () => {
    expect(LITERATURE_WARNINGS_PROMPT_VERSION).toBe("literature-warnings-v1.0");
  });
});

describe("literatureWarningsSection -- never throws", () => {
  it("degrades to unavailable, not a throw, on a model failure", async () => {
    const section = await literatureWarningsSection(
      { ingredientText: "Creatine", formText: "monohydrate", brand: null, manufacturer: null },
      { chatJson: fakeChatJson({ "literature warnings": new ModelCallError("timeout", "slow") }), timeoutMs: 1000, allowModel: true },
    );
    expect(section.status).toBe("unavailable");
    expect(section.reason).toBe("slow");
    expect(section.basis).toBe("model_prior");
  });

  it("is unavailable with an honest reason when there is no provider or no time budget", async () => {
    const noProvider = await literatureWarningsSection(
      { ingredientText: "Creatine", formText: null, brand: null, manufacturer: null },
      { chatJson: null, timeoutMs: 1000, allowModel: true },
    );
    expect(noProvider.status).toBe("unavailable");
    expect(noProvider.reason).toMatch(/no model provider/);

    const noBudget = await literatureWarningsSection(
      { ingredientText: "Creatine", formText: null, brand: null, manufacturer: null },
      { chatJson: fakeChatJson({}), timeoutMs: 1000, allowModel: false },
    );
    expect(noBudget.status).toBe("unavailable");
    expect(noBudget.reason).toMatch(/time budget/);
  });

  it("returns ok data with its model and elapsed time on success", async () => {
    const section = await literatureWarningsSection(
      { ingredientText: "Creatine", formText: "monohydrate", brand: null, manufacturer: null },
      { chatJson: fakeChatJson({ "literature warnings": literatureWarningsFixture("no_concern", "unknown") }), timeoutMs: 1000, allowModel: true },
    );
    expect(section.status).toBe("ok");
    expect(section.model).toBe("fake-text");
    expect(section.prompt_version).toBe(LITERATURE_WARNINGS_PROMPT_VERSION);
    expect(section.data?.funding_independence.status).toBe("no_concern");
  });
});

describe("wired into analyzeFromLabel for EVERY scan (fakes only)", () => {
  it("present on the scored path (creatine monohydrate has a retained run)", async () => {
    const out = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        chatJson: fakeChatJson({
          "company profile": companyFixture,
          compatibility: compatFixture,
          "literature warnings": literatureWarningsFixture("concern", "concern"),
        }),
      }),
    );
    expect(out.status).toBe("scored");
    expect(out.literature_warnings?.status).toBe("ok");
    expect(out.literature_warnings?.data?.funding_independence.status).toBe("concern");
    expect(out.literature_warnings?.data?.publication_bias.status).toBe("concern");
    expect(out.meta.prompt_versions.literature_warnings).toBe(LITERATURE_WARNINGS_PROMPT_VERSION);
  });

  it("present on the not-scored path (magnesium is in vocabulary, has no retained run)", async () => {
    const out = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        readLabel: async () =>
          label({
            ingredient_vocab_id: "magnesium",
            ingredient_label_text: "Magnesium Bisglycinate",
            form_vocab_id: "magnesium_glycinate",
            compound_dose_mg: 2000,
            servings_per_day: 1,
            actives: [{ name: "Magnesium (as magnesium bisglycinate)", compound_dose_mg: 2000, dose_unit_as_printed: "2000 mg", form_text: "bisglycinate" }],
          }),
        chatJson: fakeChatJson({
          "company profile": companyFixture,
          compatibility: compatFixture,
          "evidence prior": priorFixture,
          "literature warnings": literatureWarningsFixture("unknown", "concern"),
        }),
      }),
    );
    expect(out.status).toBe("not_scored");
    expect(out.literature_warnings?.status).toBe("ok");
    expect(out.literature_warnings?.data?.publication_bias.status).toBe("concern");
  });

  it("present on the ingredient-not-supported path", async () => {
    const out = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        readLabel: async () => label({ ingredient_vocab_id: null, ingredient_label_text: "Shilajit", form_vocab_id: null }),
        chatJson: fakeChatJson({
          "company profile": companyFixture,
          compatibility: compatFixture,
          "evidence prior": priorFixture,
          "literature warnings": literatureWarningsFixture("concern", "unknown"),
        }),
      }),
    );
    expect(out.status).toBe("ingredient_not_supported");
    expect(out.literature_warnings?.status).toBe("ok");
    expect(out.literature_warnings?.data?.funding_independence.status).toBe("concern");
  });
});

describe("literature_warnings never reaches scoring", () => {
  it("identical product, different (or absent) literature-warnings content -> byte-identical product/evidence/dose_effectiveness", async () => {
    const concern = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        chatJson: fakeChatJson({
          "company profile": companyFixture,
          compatibility: compatFixture,
          "literature warnings": literatureWarningsFixture("concern", "concern"),
        }),
      }),
    );
    const noConcern = await analyzeScan(
      "aW1n",
      "image/png",
      deps({
        chatJson: fakeChatJson({
          "company profile": companyFixture,
          compatibility: compatFixture,
          "literature warnings": literatureWarningsFixture("no_concern", "no_concern"),
        }),
      }),
    );
    // "Off": no model provider at all, so the section is unavailable rather
    // than ok -- the deterministic blocks must still match byte for byte.
    const off = await analyzeScan("aW1n", "image/png", deps({ chatJson: null }));

    expect(concern.status).toBe("scored");
    expect(concern.product).toEqual(noConcern.product);
    expect(concern.product).toEqual(off.product);
    expect(concern.evidence).toEqual(noConcern.evidence);
    expect(concern.evidence).toEqual(off.evidence);
    expect(concern.dose_effectiveness).toEqual(noConcern.dose_effectiveness);
    expect(concern.dose_effectiveness).toEqual(off.dose_effectiveness);

    expect(concern.literature_warnings?.status).toBe("ok");
    expect(noConcern.literature_warnings?.status).toBe("ok");
    expect(off.literature_warnings?.status).toBe("unavailable");
  });

  it("no scoring source file mentions literature_warnings, funding_independence or publication_bias in any form", () => {
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
      expect(text.toLowerCase(), rel).not.toMatch(/literature_warnings|funding_independence|publication_bias/);
    }
  });
});
