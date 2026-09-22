/*
 * label-v1.3 regression: prompts/label.md must state every list cap that
 * schemas/label.json enforces. A real busy-panel scan failed the whole read on
 * "/evidence_spans must NOT have more than 12 items" because the prompt never
 * mentioned the cap -- a faithful model broke a limit it was never told about.
 * If someone changes a maxItems in the schema without updating the prompt's
 * "Size limits" table (or vice versa), this fails.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", "label.json"), "utf8")) as {
  properties: Record<string, { type?: unknown; maxItems?: number }>;
};
const prompt = fs.readFileSync(path.join(ROOT, "prompts", "label.md"), "utf8");

const capped = Object.entries(schema.properties).filter(([, def]) => typeof def.maxItems === "number");

describe("prompts/label.md states the schema's list limits", () => {
  it("covers at least the lists that have failed or can fail on a busy panel", () => {
    const names = capped.map(([name]) => name);
    for (const name of ["evidence_spans", "actives", "other_actives", "certifications"]) {
      expect(names).toContain(name);
    }
  });

  it.each(capped)("%s: the prompt's size table gives the schema's maxItems", (name, def) => {
    const row = prompt.split("\n").find((line) => line.startsWith(`| \`${name}\` |`));
    expect(row, `no size-limit row for ${name} in prompts/label.md`).toBeDefined();
    const cells = row!.split("|").map((c) => c.trim());
    expect(Number(cells[2])).toBe(def.maxItems);
  });
});
