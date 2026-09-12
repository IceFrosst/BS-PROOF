import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A guardrail suite that silently never runs is worse than no suite: it passes
 * CI by not executing. tests/evidence-warnings.test.tsx was exactly that until
 * the include glob was widened to {ts,tsx}.
 */
describe("vitest include globs", () => {
  it("every top-level .tsx test is inside an include glob", () => {
    const cfg = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");
    const tsxTests = readdirSync(join(process.cwd(), "tests")).filter((f) => f.endsWith(".test.tsx"));
    if (tsxTests.length > 0) expect(cfg, `top-level .tsx tests exist: ${tsxTests.join(", ")}`).toContain("tests/*.test.{ts,tsx}");
  });
});
