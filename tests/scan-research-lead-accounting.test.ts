// @vitest-environment node
/*
 * The worker (pipeline/research_leads.py) derives the follow-through verdict from the tool receipts before it posts;
 * this server (lib/scan-research/lead-accounting.ts) recomputes it from the posted receipts before it stores a result.
 * Both run over ONE shared fixture (tests/fixtures/lead-accounting-cases.json, also run by tests/test_research_leads.py)
 * so they cannot drift apart: a disagreement would strand a job (the worker treats a 422 as "do not retry").
 *
 * `real_*` cases embed the search result text of the immutable 2026-10-05 v0.4 validation capture byte for byte.
 * Expectations are hand-written, not generated from either implementation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { account, leadKey, parseLinks, urlRecordIds, type LeadEvent } from "@/lib/scan-research/lead-accounting";
import { groundedIdsV3 } from "@/lib/scan-research/source-access-v3";

type Case = {
  name: string;
  why: string;
  events: LeadEvent[];
  ledger: unknown[];
  inventory_empty: boolean;
  expect: {
    satisfied: boolean;
    problems: [string, string][];
    summary?: Record<string, number | boolean>;
    lead_outcomes?: string[];
    warnings?: [string, string][];
    content_via?: string[];
  };
};
const F = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "lead-accounting-cases.json"), "utf8")) as {
  cases: Case[];
  address_cases: { url: string; key: string | null; record_ids: string[] }[];
  links_cases: { text: string; expect: string[] }[];
  grounding_cases: { name: string; why: string; events: LeadEvent[]; expect_grounded: string[] }[];
};

describe("server grounding agrees with the worker's: what the tool printed, minus what the model typed into the same call", () => {
  it("has the shared grounding cases", () => expect(F.grounding_cases.length).toBeGreaterThanOrEqual(8));
  for (const c of F.grounding_cases) {
    it(c.name, () => {
      expect([...groundedIdsV3(c.events)].sort()).toEqual([...c.expect_grounded].sort());
    });
  }
});

describe("server lead accounting agrees with the worker's on every shared case", () => {
  for (const c of F.cases) {
    it(c.name, () => {
      const rep = account(c.events, c.ledger, c.inventory_empty);
      expect(rep.satisfied).toBe(c.expect.satisfied);
      expect(rep.problems.map((p) => [p.code, p.address])).toEqual(c.expect.problems);
      for (const [k, v] of Object.entries(c.expect.summary ?? {})) expect(rep.summary[k], k).toBe(v);
      if (c.expect.lead_outcomes) expect(rep.leads.filter((l) => l.from_search || l.attempted).map((l) => l.outcome)).toEqual(c.expect.lead_outcomes);
      if (c.expect.warnings) expect(rep.warnings.map((w) => [w.code, w.address])).toEqual(c.expect.warnings);
      if (c.expect.content_via) expect(rep.leads.filter((l) => l.content_via).map((l) => l.content_via)).toEqual(c.expect.content_via);
    });
  }
  for (const a of F.address_cases) {
    it(`address ${JSON.stringify(a.url)} -> ${a.key}`, () => {
      expect(leadKey(a.url)).toBe(a.key);
      expect(urlRecordIds(a.url)).toEqual([...a.record_ids].sort());
    });
  }
  for (const [i, l] of F.links_cases.entries()) {
    it(`Links line parsing #${i}`, () => {
      expect(parseLinks(l.text)).toEqual(l.expect);
    });
  }
});

describe("the verdict is not a fetch-count quota and not a reading of free text", () => {
  const link = (u: string) => `Web search results for query: "q"\n\nLinks: ${JSON.stringify([{ title: "t", url: u }])}\n`;
  it("one fetch can satisfy it and a hundred fetches can fail it", () => {
    const search: LeadEvent = { tool: "WebSearch", kind: "request", request: { query: "q1" }, returned_text: link("https://a.example.org/1") };
    const ok = account([search, { tool: "WebFetch", kind: "request", request: { url: "https://a.example.org/1" }, returned_text: "s" }], [{ address: "https://a.example.org/1", disposition: "opened", note: "n" }], false);
    expect(ok.satisfied).toBe(true);
    const many: LeadEvent[] = [search];
    for (let i = 0; i < 100; i++) many.push({ tool: "WebFetch", kind: "error", request: { url: "https://a.example.org/1" }, returned_text: "" });
    const bad = account(many, [{ address: "https://a.example.org/1", disposition: "opened", note: "n" }], false);
    expect(bad.satisfied).toBe(false);
    expect(bad.problems.map((p) => p.code)).toEqual(["blocked_without_independent_attempt"]);
  });
  it("a note that says 'not opened' changes nothing: only the request in the stream counts", () => {
    const search: LeadEvent = { tool: "WebSearch", kind: "request", request: { query: "q1" }, returned_text: link("https://a.example.org/1") };
    const fetched: LeadEvent = { tool: "WebFetch", kind: "request", request: { url: "https://a.example.org/1" }, returned_text: "s" };
    const a = account([search, fetched], [{ address: "https://a.example.org/1", disposition: "opened", note: "this page was not opened" }], false);
    const b = account([search, fetched], [{ address: "https://a.example.org/1", disposition: "opened", note: "opened and read" }], false);
    expect(a.problems).toEqual(b.problems);
    expect(a.satisfied).toBe(true);
  });
});
