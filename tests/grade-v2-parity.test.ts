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

import { gradeBlock, gradeProductV2, loadLiveGrades, TABLE } from "@/lib/analyze/grade-v2";

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

  it("the letter table matches Python's, every row and cell", () => {
    expect(JSON.parse(JSON.stringify(TABLE))).toEqual(golden.table);
  });

  it("very low certainty is always I", () => {
    for (const row of Object.values(TABLE)) expect(row[1]).toBe("I");
  });
});

describe("gradeProductV2", () => {
  const setup = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grade-v2-"));
    const write = (name: string, art: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(art));
    write("20260101_000000_creatine_x_context.json", { product: { ingredient: "creatine" }, evidence_v2: golden.block });
    write("20260303_000000_creatine_y_context.json", { product: { ingredient: "creatine" }, evidence_v2: golden.block });
    return dir;
  };
  const strength = [{ ingredient: "creatine", run_id: "20260101_000000_creatine_x", outcomes: ["muscle_strength"] }];

  it("grades only the pinned run and the listed outcomes (vocab/grades_live.json)", () => {
    const r = gradeProductV2("creatine", "creatine_monohydrate", 5000, setup(), strength);
    expect(r.status).toBe("graded");
    if (r.status === "graded") {
      expect(r.run_id).toBe("20260101_000000_creatine_x");   // pinned, although a newer run exists
      expect(r.outcomes.map((o) => o.outcome)).toEqual(["muscle_strength"]);
      expect(r.outcomes[0].letter).toBe("A");
    }
  });

  it("answers not_assessed without an entry, for a missing run, or with no listed outcome", () => {
    const dir = setup();
    expect(gradeProductV2("creatine", null, null, dir, []).status).toBe("not_assessed");
    expect(gradeProductV2("vitamin_c", null, null, dir, strength).status).toBe("not_assessed");
    expect(gradeProductV2("creatine", null, null, dir,
      [{ ingredient: "creatine", run_id: "20990101_000000_missing", outcomes: ["muscle_strength"] }]).status).toBe("not_assessed");
    expect(gradeProductV2("creatine", null, null, dir,
      [{ ingredient: "creatine", run_id: "20260101_000000_creatine_x", outcomes: ["not_an_outcome"] }]).status).toBe("not_assessed");
  });

  it("the committed list is empty until validation (METHOD §16)", () => {
    expect(loadLiveGrades()).toEqual([]);
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
