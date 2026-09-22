import { describe, expect, it } from "vitest";

import type { ChatFn, ChatRequest, ChatResult } from "@/lib/analyze/llm";
import { LABEL_PROMPT_VERSION, readLabel } from "@/lib/analyze/vision";

const VALID_LABEL = {
  ingredient_vocab_id: "creatine",
  ingredient_label_text: "Creatine Monohydrate",
  form_vocab_id: "creatine_monohydrate",
  compound_dose_mg: 4000,
  dose_unit_as_printed: "4 g",
  servings_per_day: 1,
  is_multi_ingredient: false,
  other_actives: [],
  actives: [{ name: "Creatine Monohydrate", compound_dose_mg: 4000, dose_unit_as_printed: "4 g", form_text: "Creatine Monohydrate" }],
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
  evidence_spans: ["Creatine Monohydrate 4 g"],
};

function result(text: string): ChatResult {
  return {
    text,
    model: "vision-test",
    backend: "test.invalid",
    elapsed_s: 0.01,
    input_tokens: 1,
    output_tokens: 1,
    finish_reason: "stop",
  };
}

describe("label vision JSON contract", () => {
  it("requests native JSON mode and sends an explicit typed object template", async () => {
    let request: ChatRequest | null = null;
    const fake: ChatFn = async (value) => {
      request = value;
      return result(JSON.stringify(VALID_LABEL));
    };

    const label = await readLabel("aW1n", "image/png", fake);

    expect(request).not.toBeNull();
    expect(request!.jsonMode).toBe(true);
    expect(request!.disableThinking).toBe(true);
    const parts = request!.messages[0].content;
    expect(Array.isArray(parts)).toBe(true);
    const prompt = (parts as Array<{ type: string; text?: string }>).map((part) => part.text ?? "").join("\n");
    expect(prompt).toContain('"is_multi_ingredient": false');
    expect(prompt).toContain('"is_supplement_label": false');
    expect(prompt).toContain("booleans");
    expect(prompt).toContain("are `true` or `false`, never quoted strings");
    expect(label.is_multi_ingredient).toBe(false);
    expect(label._meta.prompt_version).toBe("label-v1.3");
    expect(LABEL_PROMPT_VERSION).toBe("label-v1.3");
  });

  it("still fails closed when the model returns prose instead of an object", async () => {
    const fake: ChatFn = async () => result("I cannot read this image clearly.");
    await expect(readLabel("aW1n", "image/png", fake)).rejects.toThrow("no JSON object in model output");
  });

  it("does not coerce a quoted boolean into a label fact", async () => {
    const malformed = { ...VALID_LABEL, is_multi_ingredient: "false" };
    const fake: ChatFn = async () => result(JSON.stringify(malformed));
    await expect(readLabel("aW1n", "image/png", fake)).rejects.toThrow("must be boolean");
  });
});
