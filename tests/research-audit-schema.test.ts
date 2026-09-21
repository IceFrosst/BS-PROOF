/**
 * The audit JSON in app/design-lab/ab/audits/ is what a live model returns for
 * prompts/research_audit.md (now audit-v0.4; the three retained files were run
 * against audit-v0.2 and still record that, because that is the prompt they
 * were actually produced under -- v0.3 changed the WRITING rules only, not the
 * schema or any gate). These pin the contract between the
 * model's output and the code that scores it, so a malformed or drifting audit
 * fails here rather than rendering a wrong number on a card.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { ledgerFromAudit, score, type AuditFile } from "@/app/design-lab/ab/ledger";

const AUDIT_DIR = join(process.cwd(), "app/design-lab/ab/audits");
const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas/research_audit.json"), "utf8"));
const files = readdirSync(AUDIT_DIR).filter((f) => f.endsWith(".json"));
const load = (f: string) => JSON.parse(readFileSync(join(AUDIT_DIR, f), "utf8")) as AuditFile;

describe("research_audit schema (prompt audit-v0.4, retained files audit-v0.2)", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  it("ships at least one live audit", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s validates against schemas/research_audit.json", (f) => {
    const ok = validate(load(f));
    if (!ok) {
      const msg = (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("\n");
      throw new Error(`${f} failed schema:\n${msg}`);
    }
    expect(ok).toBe(true);
  });

  it.each(files)("%s keeps its historical prompt metadata while allowing current audit-v0.4", (f) => {
    const prompt = load(f).meta.prompt;
    expect(["audit-v0.2", "audit-v0.4"]).toContain(prompt);
    // These checked-in retained audits were actually produced under v0.2; do
    // not rewrite their provenance merely because the current prompt is v0.4.
    expect(prompt).toBe("audit-v0.2");
  });

  it.each(files)("%s scores end to end without the model writing a number", (f) => {
    const audit = load(f);
    for (const o of audit.outcomes) {
      const r = score(ledgerFromAudit(o));
      // Either a real 0-100 headline, or an honest refusal to score.
      if (r.headline === null) expect(r.label).toBe("Not scored");
      else {
        expect(r.headline).toBeGreaterThanOrEqual(0);
        expect(r.headline).toBeLessThanOrEqual(100);
      }
      expect(r.certainty).toBeGreaterThanOrEqual(0);
      expect(r.certainty).toBeLessThanOrEqual(4);
    }
  });

  it.each(files)("%s keeps population as a first-class axis: no duplicate name+population", (f) => {
    const audit = load(f);
    const keys = audit.outcomes.map((o) => `${o.name}||${o.population ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(files)("%s never claims an RCT body with zero RCTs", (f) => {
    for (const o of load(f).outcomes) {
      if (o.ledger.gates.rctCount === 0) expect(o.ledger.bodyIsRct).toBe(false);
    }
  });

  it.each(files)("%s cites an id and an access level for every study it leans on", (f) => {
    for (const o of load(f).outcomes) {
      for (const s of o.inventory) {
        expect(s.id.trim().length).toBeGreaterThan(0);
        expect(["full_text", "abstract", "snippet"]).toContain(s.access);
      }
      // An empty inventory is allowed, but then the row must not assert an effect.
      if (o.inventory.length === 0) expect(o.ledger.effectPoints).toBe("unclear");
    }
  });

  it.each(files)("%s discloses provenance and does not claim human verification", (f) => {
    const { meta } = load(f);
    expect(meta.run_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.model.length).toBeGreaterThan(0);
    expect(meta.note.toLowerCase()).toMatch(/not .*(verified|human)|unverified/);
  });
});
