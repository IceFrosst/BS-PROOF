// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readLabel: vi.fn(), scoreProduct: vi.fn() }));
vi.mock("@/lib/analyze/vision", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analyze/vision")>()),
  readLabel: mocks.readLabel,
  analyzerEnabled: () => true,
}));
vi.mock("@/lib/analyze/product-score", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analyze/product-score")>()),
  scoreProduct: mocks.scoreProduct,
}));
import { POST } from "@/app/api/analyze-label/route";

async function post() {
  const form = new FormData();
  form.append("image", new File([new Uint8Array([1])], "label.png", { type: "image/png" }));
  return POST(new Request("http://test/api/analyze-label", { method: "POST", body: form }));
}

const label = (elemental: number | null) => ({
  ingredient_vocab_id: "magnesium", ingredient_label_text: "Magnesium",
  form_vocab_id: "magnesium_glycinate", compound_dose_mg: elemental === null ? 200 : null,
  printed_elemental_dose_mg: elemental, is_multi_ingredient: false, other_actives: [],
  is_supplement_label: true, confidence: "high", evidence_spans: [],
});

describe("analyze-label route dose parity", () => {
  beforeEach(() => {
    mocks.readLabel.mockReset();
    mocks.scoreProduct.mockReset().mockReturnValue({ status: "scored", rows: [] });
    delete process.env.SCAN_REQUIRE_AUTH;
  });
  it("scores declared elemental magnesium as stated and legacy compound as converted", async () => {
    mocks.readLabel.mockResolvedValueOnce(label(200));
    let body = await (await post()).json();
    expect(body.product.elemental_dose_mg).toEqual({ low: 200, high: 200, basis: "elemental_stated" });
    expect(mocks.scoreProduct).toHaveBeenLastCalledWith("magnesium", "magnesium_glycinate", 200);
    expect(body.caveats ?? []).not.toContainEqual(expect.objectContaining({ code: "dose_not_convertible" }));

    mocks.readLabel.mockResolvedValueOnce(label(null));
    body = await (await post()).json();
    expect(body.product.elemental_dose_mg).toEqual({ low: 28.192, high: 28.192, basis: "converted" });
    expect(mocks.scoreProduct).toHaveBeenLastCalledWith("magnesium", "magnesium_glycinate", 28.192);
  });
});
