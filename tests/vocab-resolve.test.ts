/*
 * resolveIngredientForm — the deterministic repair for the model's most common
 * vocabulary slip: the FORM id in the ingredient field. Measured live on the
 * DeepSeek backend 2026-08-23 (HANDOFF.md): "creatine_monohydrate" arrived as
 * the ingredient, matched no catalog entry, and a fully-scored product fell
 * through to not_scored + census. Every form id has exactly one parent in
 * vocab/form.json, so the repair invents nothing.
 */
import { describe, expect, it } from "vitest";

import { resolveIngredientForm } from "@/lib/analyze/vocab";

describe("resolveIngredientForm", () => {
  it("keeps a real ingredient id untouched", () => {
    expect(resolveIngredientForm("creatine", "creatine_monohydrate")).toEqual({
      ingredient: "creatine",
      form: "creatine_monohydrate",
    });
  });

  it("maps a form id in the ingredient field to its parent (the measured DeepSeek slip)", () => {
    expect(resolveIngredientForm("creatine_monohydrate", null)).toEqual({
      ingredient: "creatine",
      form: "creatine_monohydrate",
    });
  });

  it("keeps an agreeing form field", () => {
    expect(resolveIngredientForm("magnesium_glycinate", "magnesium_glycinate")).toEqual({
      ingredient: "magnesium",
      form: "magnesium_glycinate",
    });
  });

  it("never overrules a CONTRADICTING form field", () => {
    // The ingredient slot says monohydrate, the form slot says HCl. That is a
    // contradiction to surface downstream, not to smooth over here.
    expect(resolveIngredientForm("creatine_monohydrate", "creatine_hcl")).toEqual({
      ingredient: "creatine",
      form: "creatine_hcl",
    });
  });

  it("passes unknown ids through for the not-supported path", () => {
    expect(resolveIngredientForm("unicorn_dust", null)).toEqual({
      ingredient: "unicorn_dust",
      form: null,
    });
    expect(resolveIngredientForm(null, "creatine_hcl")).toEqual({
      ingredient: null,
      form: "creatine_hcl",
    });
  });
});
