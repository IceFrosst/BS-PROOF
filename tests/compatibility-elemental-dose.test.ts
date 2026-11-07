import { describe, expect, it } from "vitest";

import { compatibilitySection } from "@/lib/analyze/compatibility";

describe("printed active dose basis in compatibility", () => {
  it("keeps elemental and compound text distinct in the model prompt", async () => {
    let prompt = "";
    const chatJson = async <T>(request: { messages: Array<{ content: unknown }> }) => {
      prompt = String(request.messages[0].content);
      return { value: { pairs: [], form_notes: [], overall: "ok" } as T, meta: { model: "test", elapsed_s: 0 } };
    };
    await compatibilitySection({
      ingredient: "magnesium", formId: "magnesium_glycinate", otherActives: [],
      actives: [
        { name: "Magnesium elemental", compound_dose_mg: null, printed_elemental_dose_mg: 200, form_text: null },
        { name: "Magnesium glycinate", compound_dose_mg: 200, form_text: null },
      ],
      evidenceFormFit: { status: "unknown", scored_forms: [], form_strength: null, form_basis: null },
    }, { chatJson: chatJson as never, allowModel: true, timeoutMs: 1000 });
    expect(prompt).toContain("200 mg elemental (as printed)");
    expect(prompt).toContain("200 mg compound (as printed)");
  });
});
