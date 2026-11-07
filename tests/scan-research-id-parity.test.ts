// @vitest-environment node
/*
 * The worker (pipeline/claude_research_adapter.py `extract_ids`) grounds every inventory id against the text WebSearch
 * / WebFetch returned BEFORE it posts a result; this server (lib/scan-research/source-access-v2.ts `idsIn`) recomputes
 * the same grounding from the receipts in `complete`, and answers 422 invalid_result when it disagrees -- which the
 * worker treats as "rejected, do not retry", so a disagreement strands the job. Both are therefore run over ONE shared
 * fixture (tests/fixtures/id-extraction-cases.json, also run by tests/test_source_access_v2.py).
 *
 * The positive shapes are verbatim from the 2026-10-05 Vitamin D captures (a Markdown-bold "**PMID:** 123" label, a DOI
 * inside a URL ending in /full or /pdf); the NEG cases are the ways a wrong id could be grounded and must stay ungrounded.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkLiveResearchResultV2, idsIn, normalizeId } from "@/lib/scan-research/source-access-v2";

const read = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", f), "utf8"));
const CASES = read("id-extraction-cases.json") as { cases: Array<{ name: string; text: string; ids: string[] }>; audit_ids: Array<{ raw: string; normalised: string | null }> };
const BASE = read("source-access-v2.json");
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("server idsIn / normalizeId agree with the worker's extract_ids on every shared case", () => {
  for (const c of CASES.cases) {
    it(c.name, () => {
      expect([...idsIn(c.text)].sort()).toEqual(c.ids);
    });
  }
  for (const a of CASES.audit_ids) {
    it(`audit id ${JSON.stringify(a.raw)} -> ${a.normalised}`, () => {
      expect(normalizeId(a.raw)).toBe(a.normalised);
    });
  }
});

/** The shared valid V2 fixture with ONE request receipt and ONE inventory row, so only that row's id decides the verdict. */
function withReceiptAndRow(returnedText: string, rowId: string, kind: "request" | "error" = "request") {
  const audit = JSON.parse(JSON.stringify(BASE.audit));
  const access = JSON.parse(JSON.stringify(BASE.source_access_v2));
  for (const outcome of audit.outcomes) outcome.inventory = [];
  audit.outcomes[0].inventory = [{ ...BASE.audit.outcomes[0].inventory[0], id: rowId, access: "snippet" }];
  const ok = kind === "request";
  access.events = [{
    tool: "WebFetch", tool_use_id: "toolu_1", kind, returned_kind: ok ? "fetch_model_summary" : "no_content",
    returned_text: ok ? returnedText : "", text_bytes: Buffer.byteLength(ok ? returnedText : "", "utf8"), text_sha256: sha(ok ? returnedText : ""),
  }];
  access.summary = { requests: ok ? 1 : 0, errors: ok ? 0 : 1, walls: 0, refusals: 0, search_snippets: 0, fetch_summaries: ok ? 1 : 0, original_documents: 0 };
  return checkLiveResearchResultV2(audit, access, "live-research-v0.2");
}

describe("the server accepts what the worker now accepts, and still refuses what it must", () => {
  const RECORD = "# Summary of Research Records\n\n## Record 1\n**PMID:** 35939577  \n**Title:** \"Supplemental Vitamin D and Incident Fractures in Midlife and Older Adults\"  \n**Year:** 2022";

  it("a Markdown-bold PMID label grounds the paper it names", () => {
    const r = withReceiptAndRow(RECORD, "35939577");
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(withReceiptAndRow(RECORD, "PMID:35939577").ok).toBe(true);
  });

  it("a different paper's id is not grounded by that receipt", () => {
    const r = withReceiptAndRow(RECORD, "35939578");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("not grounded");
  });

  it("a failed receipt cannot ground a row even if it names the id", () => {
    const r = withReceiptAndRow(RECORD, "35939577", "error");
    expect(r.ok).toBe(false);
  });

  it("a summary that names the paper but does not print its id grounds nothing", () => {
    const r = withReceiptAndRow(RECORD.replace("**PMID:** 35939577  \n", ""), "35939577");
    expect(r.ok).toBe(false);
  });

  it("a bare number in a list line and a number in a link address ground nothing", () => {
    expect(withReceiptAndRow("The PMID list from the search results is:\n\n**36853379**", "36853379").ok).toBe(false);
    expect(withReceiptAndRow('{"title":"full citation","url":"https://www.unboundmedicine.com/medline/citation/31454046/full_citation"}', "31454046").ok).toBe(false);
  });

  it("a DOI printed in a URL that ends in /full grounds the bare DOI; a different DOI does not", () => {
    const url = 'Links: [{"title":"SYSTEMATIC REVIEW article","url":"https://frontiersin.org/articles/10.3389/fpubh.2022.979649/full"}]';
    expect(withReceiptAndRow(url, "10.3389/fpubh.2022.979649").ok).toBe(true);
    expect(withReceiptAndRow(url, "10.3389/fpubh.2022.979650").ok).toBe(false);
    expect(withReceiptAndRow(url.replace("/full", "/fullxyz"), "10.3389/fpubh.2022.979649").ok).toBe(false);
  });
});
