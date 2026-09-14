/*
 * THE MANUAL SEARCH PATH on /scan (2026-09-15), with zero model calls.
 *
 * What is pinned:
 *   - the catalog is derived from vocab/form.json, covers it exactly, and
 *     leaks no molar-mass internals
 *   - dose units are mg / g / mcg with exact factors; IU is refused
 *   - analyzeManual runs the SAME stages 1-5 as a photo (via analyzeFromLabel)
 *     and its answer says source: "manual" with a user_input basis — never a
 *     LabelRead, never a read confidence, never quoted spans
 *   - the photo path still says source: "photo" and carries no `input`
 *   - POST /api/scan takes a JSON body on the existing route: bad input is 400,
 *     the kill switch is 503 for both bodies, and a photo without a provider
 *     is 503 while a typed entry still answers
 *   - public/scan-mark.svg is exactly what scripts/write_scan_mark.mjs derives
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/scan/route";
import { catalogForm, catalogIngredient, ingredientCatalog } from "@/lib/analyze/catalog";
import {
  checkManualDose,
  checkServingsPerDay,
  doseToMg,
  isManualDoseUnit,
  MANUAL_DOSE_UNITS,
  MAX_MANUAL_DOSE_MG,
  MAX_SERVINGS_PER_DAY,
  maxManualDoseInUnit,
} from "@/lib/analyze/manual-dose";
import { availableProducts, scoreProduct } from "@/lib/analyze/product-score";
import { analyzeManual, analyzeScan, validateManualInput, type ScanDeps } from "@/lib/analyze/scan";
import type { LabelRead } from "@/lib/analyze/vision";
import { elementalDoseRangeMg } from "@/lib/analyze/vocab";
// @ts-expect-error -- plain ESM script, no declaration file; the test imports its one pure export.
import { deriveScanMark } from "../scripts/write_scan_mark.mjs";

const ROOT = process.cwd();

type FormVocab = {
  ingredients: Record<string, { dose_basis_kind?: string; forms: Array<{ id: string; salt_family: string | null; aliases?: string[] }> }>;
};
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, "vocab", "form.json"), "utf8")) as FormVocab;

function offlineDeps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  let t = 0;
  return {
    readLabel: async () => {
      throw new Error("the manual path must never read a label");
    },
    chatJson: null,
    fetch: (async () => new Response(JSON.stringify({ hitCount: 7 }), { status: 200 })) as typeof fetch,
    scoreProduct,
    budgetMs: 55_000,
    now: () => (t += 10),
    ...overrides,
  };
}

function photoLabel(): LabelRead {
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
    manufacturer: null,
    country_of_origin: null,
    warnings_printed: [],
    claims_printed: [],
    brand: null,
    product_name: null,
    is_supplement_label: true,
    confidence: "high",
    unreadable_reason: null,
    evidence_spans: ["Creatine Monohydrate 5 g"],
    _meta: { model: "fake-vision", prompt_version: "label-v1.1", elapsed_s: 0.1, backend: "fake", input_tokens: null, output_tokens: null },
  };
}

describe("ingredient catalog", () => {
  const catalog = ingredientCatalog();

  it("covers vocab/form.json exactly — every ingredient, every form, nothing extra", () => {
    const vocabIngredients = Object.keys(vocab.ingredients).sort();
    expect(catalog.map((i) => i.id).sort()).toEqual(vocabIngredients);
    for (const ing of catalog) {
      const vocabForms = vocab.ingredients[ing.id].forms.map((f) => f.id).sort();
      expect(ing.forms.map((f) => f.id).sort(), ing.id).toEqual(vocabForms);
      expect(ing.label.length, ing.id).toBeGreaterThan(0);
      expect(ing.label).not.toContain("_");
      expect(ing.dose_basis_kind).toBe(vocab.ingredients[ing.id].dose_basis_kind);
      // Exactly one "not stated" form per ingredient, and it is listed last.
      expect(ing.forms.filter((f) => f.unspecified)).toHaveLength(1);
      expect(ing.forms[ing.forms.length - 1].unspecified).toBe(true);
    }
  });

  it("exposes no molar-mass internals", () => {
    const text = JSON.stringify(catalog);
    // Keys, quoted as JSON keys, so a label like "formulation not stated" is not a false hit.
    for (const key of ["molar_mass_g_mol", "active_mass_g_mol", "hydrate_molar_mass_g_mol", "formula", "hydrate_formula", "atomic_masses_g_mol", "iu_per_mg", "conversion_safe", "hydration_note"]) {
      expect(text, key).not.toContain(`"${key}":`);
    }
  });

  it("describes the converter's behaviour rather than its inputs", () => {
    for (const ing of catalog) {
      for (const form of ing.forms) {
        const probe = elementalDoseRangeMg(ing.id, form.id, 1000).basis;
        const expected = probe === "converted" ? "exact" : probe === "bounded" ? "bounded" : "refused";
        expect(form.dose_conversion, `${ing.id}/${form.id}`).toBe(expected);
      }
    }
    expect(catalogForm("creatine", "creatine_monohydrate")?.dose_conversion).toBe("exact");
    expect(catalogForm("magnesium", "magnesium_chloride")?.dose_conversion).toBe("bounded");
    expect(catalogForm("ashwagandha", "ashwagandha_ksm66")?.dose_conversion).toBe("refused");
  });

  it("marks exactly the retained, usable products as scored", () => {
    const scored = new Set(availableProducts().map((p) => `${p.ingredient}|${p.form}`));
    const flagged = catalog.flatMap((i) => i.forms.filter((f) => f.scored).map((f) => `${i.id}|${f.id}`));
    expect(new Set(flagged)).toEqual(scored);
    expect(scored.has("creatine|creatine_monohydrate")).toBe(true);
  });

  it("derives display names from the vocabulary's own labels", () => {
    expect(catalogIngredient("vitamin_d")?.label).toBe("Vitamin D");
    expect(catalogIngredient("folic_acid")?.label).toBe("Folate");
    expect(catalogIngredient("magnesium")?.forms.find((f) => f.id === "magnesium_glycinate")?.aliases).toContain("magnesium bisglycinate");
    expect(catalogIngredient("nope")).toBeNull();
    expect(catalogForm("magnesium", "creatine_monohydrate")).toBeNull();
  });
});

describe("manual dose units", () => {
  it("accepts exactly mg, g and mcg with exact factors", () => {
    expect([...MANUAL_DOSE_UNITS]).toEqual(["mg", "g", "mcg"]);
    expect(doseToMg(400, "mg")).toBe(400);
    expect(doseToMg(5, "g")).toBe(5000);
    expect(doseToMg(25, "mcg")).toBe(0.025);
    expect(doseToMg(0.5, "g")).toBe(500);
  });

  it("refuses IU and anything that is not a positive finite number", () => {
    expect(isManualDoseUnit("IU")).toBe(false);
    expect(isManualDoseUnit("µg")).toBe(false);
    expect(doseToMg(1000, "IU")).toBeNull();
    expect(doseToMg(0, "mg")).toBeNull();
    expect(doseToMg(-5, "mg")).toBeNull();
    expect(doseToMg(Number.NaN, "mg")).toBeNull();
    expect(doseToMg("5", "mg")).toBeNull();
  });

  it("refuses a conversion that overflows or exceeds the form's sanity ceiling, with the reason", () => {
    // 1e308 g * 1000 is Infinity: must be refused, never passed on as a dose.
    expect(doseToMg(1e308, "g")).toBeNull();
    expect(doseToMg(Number.MAX_VALUE, "mg")).toBeNull();
    expect(doseToMg(Number.POSITIVE_INFINITY, "mcg")).toBeNull();
    expect(checkManualDose(1e308, "g")).toMatchObject({ ok: false, error: /too large/ });
    // The ceiling is inclusive and expressed per unit.
    expect(MAX_MANUAL_DOSE_MG).toBe(100_000);
    expect(maxManualDoseInUnit("mg")).toBe(100_000);
    expect(maxManualDoseInUnit("g")).toBe(100);
    expect(maxManualDoseInUnit("mcg")).toBe(100_000_000);
    expect(doseToMg(100, "g")).toBe(100_000);
    expect(doseToMg(100.001, "g")).toBeNull();
    expect(doseToMg(100_000, "mg")).toBe(100_000);
    expect(doseToMg(100_001, "mg")).toBeNull();
    // A value that rounds to nothing is not a dose either.
    expect(doseToMg(1e-12, "mcg")).toBeNull();
    // The unit is checked before the value, so IU carries its own message.
    expect(checkManualDose(5, "IU")).toMatchObject({ ok: false, error: /IU is not accepted/ });
    expect(checkManualDose(5, "g")).toEqual({ ok: true, mg: 5000 });
  });

  it("servings per day is a positive whole number at or under the sanity limit", () => {
    expect(MAX_SERVINGS_PER_DAY).toBe(24);
    expect(checkServingsPerDay(1)).toEqual({ ok: true, servings: 1 });
    expect(checkServingsPerDay(24)).toEqual({ ok: true, servings: 24 });
    for (const bad of [0, -1, 1.5, 0.5, 25, 1e9, Number.NaN, Number.POSITIVE_INFINITY, "2", null, undefined]) {
      expect(checkServingsPerDay(bad).ok, String(bad)).toBe(false);
    }
    expect(checkServingsPerDay(1.5)).toMatchObject({ ok: false, error: /whole number/ });
    expect(checkServingsPerDay(25)).toMatchObject({ ok: false, error: /24 or fewer/ });
  });
});

describe("validateManualInput", () => {
  it("checks ingredient, form membership, unit, sign and CFU against the catalog", () => {
    expect(validateManualInput(null)).toMatchObject({ ok: false });
    expect(validateManualInput({ ingredient: "unobtainium", form: "x" })).toMatchObject({ ok: false, error: /catalog/ });
    expect(validateManualInput({ ingredient: "magnesium", form: "creatine_monohydrate" })).toMatchObject({ ok: false, error: /form of Magnesium/ });
    expect(validateManualInput({ ingredient: "vitamin_d", form: "vitamin_d3_cholecalciferol", dose: { value: 2000, unit: "IU" } })).toMatchObject({
      ok: false,
      error: /IU is not accepted/,
    });
    expect(validateManualInput({ ingredient: "magnesium", form: "magnesium_oxide", dose: { value: -1, unit: "mg" } })).toMatchObject({ ok: false, error: /positive/ });
    expect(validateManualInput({ ingredient: "probiotics", form: "lactobacillus_rhamnosus_gg", dose: { value: 10, unit: "mg" } })).toMatchObject({
      ok: false,
      error: /CFU/,
    });
    expect(validateManualInput({ ingredient: "magnesium", form: "magnesium_oxide", servings_per_day: 0 })).toMatchObject({ ok: false, error: /Servings/ });
    // Ceilings and integer-ness are enforced on the server through the shared module.
    expect(validateManualInput({ ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 1e308, unit: "g" } })).toMatchObject({
      ok: false,
      error: /too large/,
    });
    expect(validateManualInput({ ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 100_001, unit: "mg" } })).toMatchObject({
      ok: false,
      error: /too large/,
    });
    expect(validateManualInput({ ingredient: "creatine", form: "creatine_monohydrate", servings_per_day: 1.5 })).toMatchObject({
      ok: false,
      error: /whole number/,
    });
    expect(validateManualInput({ ingredient: "creatine", form: "creatine_monohydrate", servings_per_day: 25 })).toMatchObject({
      ok: false,
      error: /24 or fewer/,
    });
    expect(validateManualInput({ ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 100, unit: "g" }, servings_per_day: 24 })).toMatchObject({
      ok: true,
    });

    const ok = validateManualInput({ ingredient: "vitamin_d", form: "vitamin_d3_cholecalciferol", dose: { value: 25, unit: "mcg" }, servings_per_day: 1 });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.entry.basis).toBe("user_input");
      expect(ok.entry.dose_per_serving).toEqual({ value: 25, unit: "mcg", mg: 0.025 });
      expect(ok.facts.compound_dose_mg).toBe(0.025);
      // Nothing typed, nothing claimed.
      expect(ok.facts.brand).toBeNull();
      expect(ok.facts.actives).toEqual([]);
      expect(ok.facts.is_multi_ingredient).toBe(false);
    }
  });
});

describe("analyzeManual (offline, zero model calls)", () => {
  it("scores a typed creatine monohydrate entry through the same stages as a photo", async () => {
    const typed = await analyzeManual(
      { ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 5, unit: "g" }, servings_per_day: 1 },
      offlineDeps(),
    );
    const photo = await analyzeScan("aW1n", "image/png", offlineDeps({ readLabel: async () => photoLabel() }));

    expect(typed.status).toBe("scored");
    expect(typed.source).toBe("manual");
    expect(typed.input?.basis).toBe("user_input");
    expect(typed.input?.dose_per_serving).toEqual({ value: 5, unit: "g", mg: 5000 });
    expect(typed.label).toBeUndefined();
    expect(typed.product?.compound_dose_mg).toBe(5000);
    expect(typed.product?.scored_dose_basis).toBe("daily");
    // Same tub typed and photographed -> identical product facts and rows.
    expect(typed.product).toEqual(photo.product);
    expect(typed.evidence).toEqual(photo.evidence);
    expect(typed.dose_effectiveness).toEqual(photo.dose_effectiveness);
    // No vision anywhere on the typed path: no model, no prompt, and no label
    // stage timing at all (null, not 0 -- the stage never ran).
    expect(typed.meta.models.vision).toBeNull();
    expect(typed.meta.prompt_versions.label).toBeUndefined();
    expect(typed.meta.stages.label).toBeNull();
    expect(photo.meta.stages.label).not.toBeNull();
    expect(JSON.stringify(typed)).not.toContain("evidence_spans");
    expect(JSON.stringify(typed)).not.toContain("read confidence");
    // The standing honesty caveat, and the typed wording of the dose caveats.
    expect(typed.caveats?.map((c) => c.code)).toContain("typed_not_verified");
    expect(typed.basis_legend.user_input.rank).toBeGreaterThan(typed.basis_legend.label.rank);
    expect(typed.basis_legend.user_input.rank).toBeLessThan(typed.basis_legend.model_prior.rank);
    // No brand was typed, so there is no company to look up and no model call to make.
    expect(typed.company?.status).toBe("no_brand_on_label");
    expect(typed.compatibility?.status).toBe("single_active");
  });

  it("the photo path says photo and carries no typed entry", async () => {
    const photo = await analyzeScan("aW1n", "image/png", offlineDeps({ readLabel: async () => photoLabel() }));
    expect(photo.source).toBe("photo");
    expect(photo.input).toBeUndefined();
    expect(photo.label?.confidence).toBe("high");
    expect(photo.caveats?.map((c) => c.code) ?? []).not.toContain("typed_not_verified");
  });

  it("without a dose the dose axis is unavailable and the caveat says it was not entered", async () => {
    const out = await analyzeManual({ ingredient: "creatine", form: "creatine_monohydrate", dose: null, servings_per_day: null }, offlineDeps());
    expect(out.status).toBe("scored");
    expect(out.product?.scored_dose_basis).toBe("none");
    const caveat = out.caveats?.find((c) => c.code === "dose_not_convertible");
    expect(caveat?.text).toMatch(/no per-serving dose was entered/);
    expect(caveat?.text).not.toMatch(/printed on the label/);
  });

  it("a typed per-serving dose without servings is scored per serving, worded for typing", async () => {
    const out = await analyzeManual({ ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 3000, unit: "mg" } }, offlineDeps());
    expect(out.product?.scored_dose_basis).toBe("per_serving");
    expect(out.caveats?.find((c) => c.code === "servings_not_stated")?.text).toMatch(/were not entered/);
  });

  it("an unscored typed product degrades its model sections and still returns the census", async () => {
    const out = await analyzeManual(
      { ingredient: "magnesium", form: "magnesium_glycinate", dose: { value: 2000, unit: "mg" }, servings_per_day: 1 },
      offlineDeps(),
    );
    expect(out.status).toBe("not_scored");
    expect(out.source).toBe("manual");
    // 2000 mg bisglycinate -> ~282 mg elemental, converted exactly as on the photo path.
    expect(out.product?.elemental_dose_mg.low).toBeCloseTo(282.1, 0);
    expect(out.evidence_prior?.status).toBe("unavailable");
    expect(out.evidence_prior?.basis).toBe("model_prior");
    expect((out.census as { available?: boolean }).available).toBe(true);
  });

  it("refuses bad input with a status the route maps to 400", async () => {
    const out = await analyzeManual({ ingredient: "creatine", form: "magnesium_oxide" }, offlineDeps());
    expect(out.status).toBe("manual_input_invalid");
    expect(out.error).toMatch(/form of Creatine/);
    expect(out.product).toBeUndefined();
  });
});

describe("POST /api/scan with a JSON body", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const key of ["LABEL_ANALYZER_ENABLED", "DEEPSEEK_API_KEY", "VISION_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function noProvider() {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.VISION_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LABEL_ANALYZER_ENABLED;
  }

  const json = (body: unknown) =>
    new Request("http://test/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("answers a typed entry even when no model provider is configured", async () => {
    noProvider();
    const res = await POST(json({ source: "manual", ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 5, unit: "g" }, servings_per_day: 1 }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { source: string; status: string; input: { basis: string }; label?: unknown; meta: { provider_configured: boolean } };
    expect(body.source).toBe("manual");
    expect(body.status).toBe("scored");
    expect(body.input.basis).toBe("user_input");
    expect(body.label).toBeUndefined();
    expect(body.meta.provider_configured).toBe(false);
  });

  it("refuses a photo upload without a provider but not a typed entry", async () => {
    noProvider();
    const form = new FormData();
    form.append("image", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
    const photo = await POST(new Request("http://test/api/scan", { method: "POST", body: form }));
    expect(photo.status).toBe(503);
    expect(((await photo.json()) as { error: string }).error).toMatch(/Searching for a supplement by name still works/);
  });

  it("maps invalid typed input to 400 and never runs the analysis", async () => {
    noProvider();
    for (const body of [
      { ingredient: "creatine", form: "creatine_monohydrate" }, // no source
      { source: "manual", ingredient: "creatine", form: "magnesium_oxide" },
      { source: "manual", ingredient: "vitamin_d", form: "vitamin_d3_cholecalciferol", dose: { value: 1000, unit: "IU" } },
    ]) {
      const res = await POST(json(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      const out = (await res.json()) as { status: string; product?: unknown };
      expect(["bad_request", "manual_input_invalid"]).toContain(out.status);
      expect(out.product).toBeUndefined();
    }
    const malformed = await POST(new Request("http://test/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }));
    expect(malformed.status).toBe(400);
  });

  it("maps an overflowing dose and a fractional or huge servings count to 400 through the route", async () => {
    noProvider();
    for (const body of [
      { source: "manual", ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 1e308, unit: "g" } },
      { source: "manual", ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 100_001, unit: "mg" } },
      { source: "manual", ingredient: "creatine", form: "creatine_monohydrate", servings_per_day: 1.5 },
      { source: "manual", ingredient: "creatine", form: "creatine_monohydrate", servings_per_day: 25 },
    ]) {
      const res = await POST(json(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      const out = (await res.json()) as { status: string; product?: unknown };
      expect(out.status).toBe("manual_input_invalid");
      expect(out.product).toBeUndefined();
    }
  });

  it("refuses an oversize JSON body by Content-Length before reading it, and by bytes read otherwise", async () => {
    noProvider();
    const limit = 16 * 1024;
    const small = JSON.stringify({ source: "manual", ingredient: "creatine", form: "creatine_monohydrate" });

    // Declared oversize: refused without the body ever being read.
    let read = false;
    const declared = new Request("http://test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(limit + 1) },
      body: small,
    });
    const originalText = declared.text.bind(declared);
    Object.defineProperty(declared, "text", {
      value: async () => {
        read = true;
        return originalText();
      },
    });
    const pre = await POST(declared);
    expect(pre.status).toBe(413);
    expect(read).toBe(false);
    const preBody = (await pre.json()) as { status: string; error: string };
    expect(preBody.status).toBe("payload_too_large");
    expect(preBody.error).toMatch(/too large/);

    // No usable Content-Length (chunked / mis-declared) but an oversize body: still 413, same status.
    const padded = JSON.stringify({ source: "manual", ingredient: "creatine", form: "creatine_monohydrate", pad: "x".repeat(limit) });
    const post = await POST(new Request("http://test/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: padded }));
    expect(post.status).toBe(413);
    expect(((await post.json()) as { status: string }).status).toBe("payload_too_large");

    // Byte length, not UTF-16 length: multibyte padding that is short in code units is still oversize.
    const multibyte = JSON.stringify({ source: "manual", ingredient: "creatine", form: "creatine_monohydrate", pad: "€".repeat(Math.ceil(limit / 3)) });
    expect(multibyte.length).toBeLessThan(limit);
    const mb = await POST(new Request("http://test/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: multibyte }));
    expect(mb.status).toBe(413);

    // A correctly declared small body is untouched by the precheck.
    const ok = await POST(
      new Request("http://test/api/scan", { method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(small)) }, body: small }),
    );
    expect(ok.status).toBe(200);
  });

  it("the kill switch stops both bodies", async () => {
    noProvider();
    process.env.LABEL_ANALYZER_ENABLED = "0";
    const typed = await POST(json({ source: "manual", ingredient: "creatine", form: "creatine_monohydrate" }));
    expect(typed.status).toBe(503);
    const form = new FormData();
    form.append("image", new File([new Uint8Array([1])], "x.png", { type: "image/png" }));
    const photo = await POST(new Request("http://test/api/scan", { method: "POST", body: form }));
    expect(photo.status).toBe(503);
  });

  it("GET exposes the slim catalog and the manual contract, never molar masses", async () => {
    noProvider();
    const res = await GET();
    const body = (await res.json()) as { catalog: unknown[]; manual_available: boolean; manual_input: { dose_units: string[] }; basis_legend: Record<string, unknown> };
    expect(body.manual_available).toBe(true);
    expect(body.catalog.length).toBe(Object.keys(vocab.ingredients).length);
    expect(body.manual_input.dose_units).toEqual(["mg", "g", "mcg"]);
    expect(Object.keys(body.basis_legend)).toContain("user_input");
    expect(JSON.stringify(body.catalog)).not.toMatch(/molar|g_mol|active_mass/);
  });
});

describe("scan mark asset", () => {
  it("public/scan-mark.svg is exactly what the generator derives from the app icon", () => {
    const icon = fs.readFileSync(path.join(ROOT, "public", "pwa-icon.svg"), "utf8");
    const committed = fs.readFileSync(path.join(ROOT, "public", "scan-mark.svg"), "utf8");
    const derived = deriveScanMark(icon) as string;
    expect(committed).toBe(derived);
    // Transparent ground, green frame, white bottle (outlined so it reads on white), blue pixels.
    expect(committed).not.toContain('<rect width="512" height="512"');
    expect(committed).toContain("#12B76A");
    expect(committed).toContain('fill="#FFFFFF" stroke="#0B0F14"');
    expect(committed).toContain("#1A73F0");
  });
});
