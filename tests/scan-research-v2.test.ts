/* eslint-disable @typescript-eslint/no-explicit-any -- fixture JSON is intentionally mutated for adversarial validation cases. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkLiveResearchResultV2 } from "@/lib/scan-research/source-access-v2";

type Fixture = { audit: Record<string, any>; source_access_v2: Record<string, any> };
const original = JSON.parse(readFileSync("tests/fixtures/source-access-v2.json", "utf8")) as Fixture;
const copy = (): Fixture => JSON.parse(JSON.stringify(original)) as Fixture;
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const check = (f: Fixture = copy(), prompt = "live-research-v0.2") => checkLiveResearchResultV2(f.audit, f.source_access_v2, prompt);

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
    expect(result.result.provenance).toMatchObject({ model: "claude-sonnet-5-5", prompt_version: "live-research-v0.2", cli_version: "2.1.287", source_access_version: "SourceAccessV2", clinically_approved: false, affects_score: false });
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
});
