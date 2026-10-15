/**
 * lib/analyze/grade-v2.ts against the Python originals. The goldens are
 * computed by scripts/golden_grade_v2.py through Python's FULL path (pool the
 * trials for that product, then pipeline/grade.grade); the port only gets the
 * stored evidence_v2 block. If grade.py or pool.py changes, regenerate the
 * goldens and this suite fails until the port follows.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gradeBlock, gradeProductV2, TABLE } from "@/lib/analyze/grade-v2";

type Expected = {
  letter: string;
  level: number;
  benefit: string;
  letters_at: Record<string, string>;
  downgrade_points: Record<string, number>;
};
type Golden = {
  block: Record<string, unknown>;
  cases: Array<{ form: string | null; dose_mg: number | null; expected: Record<string, Expected> }>;
};

const golden = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests", "golden_grade_v2.json"), "utf8"),
) as Golden;

describe("evidence v2 grade parity with pipeline/grade.py", () => {
  for (const c of golden.cases) {
    it(`form=${c.form} dose=${c.dose_mg}`, () => {
      const got = Object.fromEntries(gradeBlock(golden.block, c.form, c.dose_mg, c.dose_mg).map((g) => [g.outcome, g]));
      for (const [outcome, exp] of Object.entries(c.expected)) {
        const g = got[outcome];
        expect(g, outcome).toBeDefined();
        expect([g.letter, g.level, g.benefit], outcome).toEqual([exp.letter, exp.level, exp.benefit]);
        expect(g.letters_at, outcome).toEqual(exp.letters_at);
        expect(Object.fromEntries(Object.entries(g.downgrades).map(([d, [p]]) => [d, p])), outcome).toEqual(
          exp.downgrade_points,
        );
      }
    });
  }

  it("the goldens exercise several letters, both indirectness axes and the registry rule", () => {
    const letters = new Set(golden.cases.flatMap((c) => Object.values(c.expected).map((e) => e.letter)));
    expect(letters.size).toBeGreaterThanOrEqual(4);
    const domains = new Set(golden.cases.flatMap((c) => Object.values(c.expected).flatMap((e) => Object.keys(e.downgrade_points))));
    expect([...domains]).toEqual(expect.arrayContaining(["indirectness", "publication_bias", "imprecision"]));
  });

  it("very low certainty is always I", () => {
    for (const row of Object.values(TABLE)) expect(row[1]).toBe("I");
  });
});

describe("gradeProductV2", () => {
  it("reads the newest retained run context with an evidence_v2 block for the ingredient", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grade-v2-"));
    const write = (name: string, art: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(art));
    write("20260101_000000_creatine_x_context.json", { product: { ingredient: "creatine" }, evidence_v2: golden.block });
    write("20260202_000000_creatine_x_context.json", { product: { ingredient: "creatine" } });
    const r = gradeProductV2("creatine", "creatine_monohydrate", 5000, dir);
    expect(r.status).toBe("graded");
    if (r.status === "graded") {
      expect(r.run_id).toBe("20260101_000000_creatine_x");
      expect(r.outcomes.find((o) => o.outcome === "muscle_strength")?.letter).toBe("A");
    }
    expect(gradeProductV2("vitamin_c", null, null, dir).status).toBe("not_assessed");
  });
});

describe("the scan does not carry a grade yet", () => {
  it("analyzeManual answers not_graded and no evidence_v2, even with a retained v2 run", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grade-v2-scan-"));
    fs.writeFileSync(path.join(dir, "20260101_000000_creatine_x_context.json"),
      JSON.stringify({ product: { ingredient: "creatine" }, evidence_v2: golden.block }));
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.stubEnv("EVIDENCE_V2_RUNS_DIR", dir);
    try {
      const { analyzeManual } = await import("@/lib/analyze/scan");
      let t = 0;
      const out = await analyzeManual(
        { ingredient: "creatine", form: "creatine_monohydrate", dose: { value: 5, unit: "g" }, servings_per_day: 1 },
        {
          readLabel: async () => { throw new Error("manual path"); },
          chatJson: null,
          fetch: (async () => new Response(JSON.stringify({ hitCount: 7 }), { status: 200 })) as typeof fetch,
          budgetMs: 55_000,
          now: () => (t += 10),
        },
      );
      expect(out.status).toBe("not_graded");
      expect("evidence_v2" in out).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
