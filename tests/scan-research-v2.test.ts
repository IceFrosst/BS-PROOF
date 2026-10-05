/* eslint-disable @typescript-eslint/no-explicit-any -- fixture JSON is intentionally mutated for adversarial validation cases. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { JSON_SCHEMA_2020_12, checkLiveResearchResultV2, compileStrict2020 } from "@/lib/scan-research/source-access-v2";

type Fixture = { audit: Record<string, any>; source_access_v2: Record<string, any> };
const original = JSON.parse(readFileSync("tests/fixtures/source-access-v2.json", "utf8")) as Fixture;
const copy = (): Fixture => JSON.parse(JSON.stringify(original)) as Fixture;
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const check = (f: Fixture = copy(), prompt = "live-research-v0.3") => checkLiveResearchResultV2(f.audit, f.source_access_v2, prompt);

describe("SourceAccessV2 validation and owner projection", () => {
  it("validates shared fixture and returns only owner-safe projection", () => {
    const result = check();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.source_access).toEqual({
      version: "SourceAccessSummaryV2",
      summary: { requests: 2, errors: 1, walls: 1, refusals: 0, search_snippets: 1, fetch_summaries: 1, original_documents: 0 },
      inventory: [{ id: "pmid:12345678", evidence_class: "derived_snippet" }],
      limitations: ["WebSearch snippets and WebFetch model summaries are not original papers.", "ID matching does not verify study numbers or clinical validity."],
    });
    expect(result.result.provenance).toMatchObject({ model: "claude-sonnet-5-5", prompt_version: "live-research-v0.3", cli_version: "2.1.287", source_access_version: "SourceAccessV2", clinically_approved: false, affects_score: false });
    expect(JSON.stringify(result.result)).not.toContain("PubMed PMID");
    expect(JSON.stringify(result.result)).not.toContain("tool-search-1");
    expect(result.result.audit).toEqual(original.audit);
  });

  it("rejects changed text bytes/hash, counters, and duplicate tool ids", () => {
    let f = copy(); f.source_access_v2.events[0].text_bytes++;
    expect(check(f)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("text_bytes")]) });
    f = copy(); f.source_access_v2.events[0].text_sha256 = "0".repeat(64);
    expect(check(f)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("text_sha256")]) });
    f = copy(); f.source_access_v2.summary.requests++;
    expect(check(f)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("summary")]) });
    f = copy(); f.source_access_v2.events[1].tool_use_id = f.source_access_v2.events[0].tool_use_id;
    expect(check(f)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("duplicate")]) });
  });

  it("matches normalized DOI identifiers using existing extractor semantics", () => {
    const f = copy();
    f.audit.outcomes[0].inventory[0].id = "10.1000/ABC.5";
    f.source_access_v2.events[0].returned_text += " DOI 10.1000/abc.5.";
    f.source_access_v2.events[0].text_bytes = Buffer.byteLength(f.source_access_v2.events[0].returned_text, "utf8");
    f.source_access_v2.events[0].text_sha256 = hash(f.source_access_v2.events[0].returned_text);
    const result = check(f);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.source_access.inventory).toEqual([{ id: "doi:10.1000/abc.5", evidence_class: "derived_snippet" }]);
  });

  it("rejects abstract/full-text inventory claims and IDs found only outside returned request text", () => {
    for (const access of ["abstract", "full_text"]) {
      const f = copy(); f.audit.outcomes[0].inventory[0].access = access;
      expect(check(f)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("must be snippet")]) });
    }
    const f = copy(); f.audit.outcomes[0].inventory[0].id = "PMID 99999999";
    expect(check(f)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("not grounded")]) });
  });

  it("rejects runner/audit/prompt mismatches, invalid request pairing, NUL and oversized payloads", () => {
    let f = copy(); f.source_access_v2.runner.model = "claude-opus-5-5";
    expect(check(f).ok).toBe(false);
    f = copy(); f.source_access_v2.runner.api_key_source = "environment";
    expect(check(f).ok).toBe(false);
    f = copy(); f.audit.meta.model = "claude-opus-5-5";
    expect(check(f).ok).toBe(false);
    f = copy(); f.source_access_v2.events[0].returned_kind = "fetch_model_summary";
    f.source_access_v2.events[0].text_sha256 = hash(f.source_access_v2.events[0].returned_text);
    expect(check(f).ok).toBe(false);
    f = copy(); f.audit.product = "bad\u0000value";
    expect(check(f).ok).toBe(false);
    f = copy(); f.audit.confidence_note = "x".repeat(800_000);
    expect(check(f).ok).toBe(false);
    expect(check(copy(), "live-research-v0.1").ok).toBe(false);
  });

  it("prompt versions: v0.3 is current, v0.2 (a not-yet-upgraded worker) is still accepted and stamped as what ran, anything else is refused", () => {
    const asVersion = (v: string, runner = v) => {
      const f = copy();
      f.audit.meta.prompt = v;
      f.source_access_v2.runner.prompt_version = runner;
      return f;
    };
    const v2 = check(asVersion("live-research-v0.2"), "live-research-v0.2");
    expect(v2.ok).toBe(true);
    if (v2.ok) expect(v2.result.provenance.prompt_version).toBe("live-research-v0.2"); // what actually ran, not what the site now stamps
    const v3 = check(asVersion("live-research-v0.3"));
    expect(v3.ok).toBe(true);
    if (v3.ok) expect(v3.result.provenance.prompt_version).toBe("live-research-v0.3");
    // the audit and the receipt must name the same prompt, and it must be one of the two
    expect(check(asVersion("live-research-v0.3", "live-research-v0.2")).ok).toBe(false);
    expect(check(asVersion("live-research-v0.2", "live-research-v0.3")).ok).toBe(false);
    expect(check(asVersion("live-research-v0.1")).ok).toBe(false);
    expect(check(asVersion("live-research-v0.4")).ok).toBe(false);
    expect(check(asVersion("live-research-v0.3"), "live-research-v0.1").ok).toBe(false);
  });
});

describe("JSON Schema 2020-12 is enforced fail-closed", () => {
  const audit = JSON.parse(readFileSync("schemas/research_audit.json", "utf8")) as Record<string, any>;
  const receipt = JSON.parse(readFileSync("schemas/source_access_v2.json", "utf8")) as Record<string, any>;

  it("both canonical schemas declare Draft 2020-12 and compile in strict mode", () => {
    expect(audit.$schema).toBe(JSON_SCHEMA_2020_12);
    expect(receipt.$schema).toBe(JSON_SCHEMA_2020_12);
    expect(() => compileStrict2020(audit)).not.toThrow();
    expect(() => compileStrict2020(receipt)).not.toThrow();
  });

  it("a schema that is not 2020-12, declares no draft, or uses an unknown keyword/format does not compile (never validates)", () => {
    expect(() => compileStrict2020({ ...receipt, $schema: "http://json-schema.org/draft-07/schema#" })).toThrow(/Draft 2020-12/);
    const { $schema, ...undeclared } = receipt;
    void $schema;
    expect(() => compileStrict2020(undeclared)).toThrow(/Draft 2020-12/);
    expect(() => compileStrict2020(null)).toThrow(/Draft 2020-12/);
    expect(() => compileStrict2020({ ...receipt, minimumLenght: 3 })).toThrow(/unknown keyword/i);
    expect(() => compileStrict2020({ $schema: JSON_SCHEMA_2020_12, type: "string", format: "no-such-format" })).toThrow(/format/i);
  });

  it("the audit schema is the strict contract: an unknown top-level key, a wrong type and a non-finite number are rejected", () => {
    const f = copy(); f.audit.extra_field = 1;
    expect(check(f).ok).toBe(false);
    const g = copy(); g.audit.outcomes = "not-a-list";
    expect(check(g).ok).toBe(false);
    const h = copy(); h.source_access_v2.summary.requests = Number.POSITIVE_INFINITY;
    expect(check(h).ok).toBe(false);
  });
});
