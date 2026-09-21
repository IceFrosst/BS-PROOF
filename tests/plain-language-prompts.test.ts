/**
 * THE PLAIN-LANGUAGE RULE LIVES IN THE PROMPT, NOT ONLY IN THE DISPLAY LAYER.
 *
 * Every prompt whose free text a person reads on /scan or in the lab carries
 * the SAME block, byte for byte, and each one's version constant moved with it
 * (invariant 3: edit a prompt, bump its version, or a cache serves stale text).
 *
 * `prompts/_shared.md` is NOT the carrier: it is prepended by
 * `claude_adapter._system_prompt()` to the S1-S8 extraction agents only, and
 * the deployed app's loaders (`lib/analyze/*.ts`) read their prompt file
 * directly with no shared preamble. Putting the block there would have missed
 * every user-facing prompt and invalidated ~1000 cached extractions instead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COMPAT_PROMPT_VERSION } from "@/lib/analyze/compatibility";
import { COMPANY_PROMPT_VERSION } from "@/lib/analyze/company";
import { EVIDENCE_PRIOR_PROMPT_VERSION } from "@/lib/analyze/evidence-prior";
import { LITERATURE_WARNINGS_PROMPT_VERSION } from "@/lib/analyze/literature-warnings";

const read = (f: string) => readFileSync(join(process.cwd(), "prompts", f), "utf8");

/** The prompts whose free text is shown to a reader. */
const USER_FACING = ["compatibility.md", "company.md", "literature_warnings.md", "evidence_prior.md", "research_audit.md"];

const HEADING = "## Plain-language rule for every sentence a person will read";

function block(text: string): string {
  const start = text.indexOf(HEADING);
  expect(start, "prompt is missing the plain-language block").toBeGreaterThan(-1);
  const end = text.indexOf('("the evidence is indirect").', start);
  expect(end, "prompt block is truncated").toBeGreaterThan(-1);
  return text.slice(start, end + '("the evidence is indirect").'.length);
}

describe("the plain-language rule is in the prompts themselves", () => {
  it("is byte-identical in every user-facing prompt", () => {
    const blocks = USER_FACING.map((f) => block(read(f)));
    expect(new Set(blocks).size).toBe(1);
  });

  it("states each rule the founder asked for", () => {
    const b = block(read("company.md"));
    expect(b).toContain("Write 2 to 4 short sentences");
    expect(b).toContain("active voice, sentence case");
    expect(b).toContain("Keep every number, unit, confidence interval, p-value and sample size exactly");
    expect(b).toContain("Never round one, never drop one, never invent one");
    expect(b).toContain("Explain a technical term inline the first time you use it");
    expect(b).toContain("A hedge stays a hedge");
    expect(b).toContain("add advice, a recommendation");
    expect(b).toContain("No markdown, no bullet characters, no emoji, no em dashes joining clauses");
    expect(b).toContain('State uncertainty as a plain fact ("nobody has tested this")');
  });

  it("is NOT pasted into the extraction prompts, which nobody reads as prose", () => {
    // _shared.md feeds S1-S8 only; their output is numbers, enums and verbatim
    // spans, so a "write 2 to 4 sentences" rule there would be wrong.
    for (const f of ["_shared.md", "label.md", "s1_design.md", "s3_study.md", "s5_conclusion.md", "s8_funding.md"]) {
      expect(read(f), f).not.toContain(HEADING);
    }
  });

  it("bumped every version constant alongside the prompt it pins", () => {
    expect(COMPAT_PROMPT_VERSION).toBe("compat-v1.1");
    expect(COMPANY_PROMPT_VERSION).toBe("company-v1.2");
    expect(EVIDENCE_PRIOR_PROMPT_VERSION).toBe("evidence-prior-v1.1");
    expect(LITERATURE_WARNINGS_PROMPT_VERSION).toBe("literature-warnings-v1.1");
    expect(read("research_audit.md")).toContain("**Version `audit-v0.4`.");
  });
});
