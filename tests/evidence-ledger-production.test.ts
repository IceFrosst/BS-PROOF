import { describe, expect, it } from "vitest";

import { ledgerFromAudit, score, type Ledger } from "@/lib/evidence-ledger";
import { retainedAuditForProduct, retainedAuditTargets } from "@/lib/evidence-ledger/retained-audits";

const facts = (
  ingredient: string,
  form: string,
  mg: number | null,
  servings = 1,
  multi = false,
  actives = [{ name: ingredient, compoundDoseMg: mg }],
  otherActives: string[] = [],
) => ({
  ingredient, form, compoundDoseMg: mg, servingsPerDay: servings, isMultiIngredient: multi, actives, otherActives,
});

describe("retained Evidence Ledger audit selector", () => {
  it.each(retainedAuditTargets)("matches the exact $ingredient/$form target", (target) => {
    const found = retainedAuditForProduct(facts(target.ingredient, target.form, target.doseMicrograms / 1000));
    expect(found).not.toBeNull();
    expect(found?.provenance.prompt_version).toBe("audit-v0.2");
    expect(found?.provenance.target_dose).toContain("per day");
    expect(found?.audit.outcomes.length).toBeGreaterThan(0);
  });

  it("rejects every nearby or unverifiable product without tolerance", () => {
    const [creatine] = retainedAuditTargets;
    expect(retainedAuditForProduct(facts(creatine.ingredient, creatine.form, 4001))).toBeNull();
    expect(retainedAuditForProduct(facts(creatine.ingredient, creatine.form, 4000.0004))).toBeNull();
    expect(retainedAuditForProduct(facts(creatine.ingredient, creatine.form, 2000, 2))).not.toBeNull();
    expect(retainedAuditForProduct(facts(creatine.ingredient, "creatine_hcl", 4000))).toBeNull();
    expect(retainedAuditForProduct(facts(creatine.ingredient, creatine.form, 4000, 0))).toBeNull();
    expect(retainedAuditForProduct(facts(creatine.ingredient, creatine.form, null))).toBeNull();
    expect(retainedAuditForProduct(facts(creatine.ingredient, creatine.form, 4000, 1, true))).toBeNull();
  });

  it("refuses contradictory active lists rather than trusting is_multi_ingredient", () => {
    const [creatine] = retainedAuditTargets;
    const exact = facts(creatine.ingredient, creatine.form, 4000);
    expect(retainedAuditForProduct({ ...exact, otherActives: ["Vitamin D3"] })).toBeNull();
    expect(retainedAuditForProduct({ ...exact, actives: [...exact.actives, { name: "Vitamin D3", compoundDoseMg: 0.05 }] })).toBeNull();
    expect(retainedAuditForProduct({ ...exact, isMultiIngredient: true })).toBeNull();
    expect(retainedAuditForProduct({ ...exact, isMultiIngredient: false, actives: [{ name: "Creatine", compoundDoseMg: null }, { name: "Vitamin D3", compoundDoseMg: 0.05 }] })).toBeNull();
  });

  it("uses one score implementation and does not let disclosure fields change certainty", () => {
    const audit = retainedAuditForProduct(facts("creatine", "creatine_monohydrate", 4000))!;
    const outcome = audit.audit.outcomes[0];
    const base = ledgerFromAudit(outcome);
    const changed: Ledger = { ...base, checklist: { ...base.checklist, publication_bias: "concern" }, gates: { ...base.gates, allPositiveIndustryOrOneLab: true } };
    expect(score(changed)).toEqual(score(base));
    expect(score(base).headline).toBeGreaterThanOrEqual(0);
    expect(score(base).headline).toBeLessThanOrEqual(100);
  });

  it("keeps unknown fit as a dash-sized state, never a fabricated zero", () => {
    const audit = retainedAuditForProduct(facts("magnesium", "magnesium_glycinate", 300))!;
    const unknown = audit.audit.outcomes.find((o) => o.ledger.formFit === "unknown");
    expect(unknown).toBeDefined();
    expect(score(ledgerFromAudit(unknown!)).formWord).toBe("Not tested");
  });
});
