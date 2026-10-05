// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fixture JSON is intentionally mutated for adversarial validation cases. */
/*
 * SourceAccessV3 (live-research-v0.5): the server's check of a result whose receipts say what each tool call REQUESTED and
 * whose lead ledger is the model's account of the source leads. The shared fixture tests/fixtures/source-access-v3.json is
 * EMITTED by the real Python adapter (tests/test_source_access_v3.py pins the equality), so the two languages cannot drift.
 *
 * What is pinned, each as an adversarial trace rather than a happy path:
 *   - the model's own request, echoed back by a tool, cannot ground the identifier it typed;
 *   - an error / wall / refusal result cannot ground a citation, whatever text it carries;
 *   - wrong, missing and unprinted ids are refused; a printed id is recognised;
 *   - the ledger cannot certify a page that was not requested; an invented address, a silent lead and an unfollowed error are refused;
 *   - a premature empty run (one search, no page) and the real shape of the two failed validation runs are refused;
 *   - the V2 wire cannot carry a v0.5 audit and the V3 wire cannot carry an older one;
 *   - the stored projection holds counters only: no ledger, no query, no address, no returned text.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkLiveResearchResultV2, idsIn } from "@/lib/scan-research/source-access-v2";
import { checkLiveResearchResultV3 } from "@/lib/scan-research/source-access-v3";

type Fixture = { audit: Record<string, any>; source_access_v3: Record<string, any> };
const original = JSON.parse(readFileSync("tests/fixtures/source-access-v3.json", "utf8")) as Fixture;
const v2 = JSON.parse(readFileSync("tests/fixtures/source-access-v2.json", "utf8"));
const copy = (): Fixture => JSON.parse(JSON.stringify(original)) as Fixture;
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const check = (f: Fixture = copy()) => checkLiveResearchResultV3(f.audit, f.source_access_v3);
const errorsOf = (f: Fixture) => {
  const r = check(f);
  return r.ok ? [] : r.errors;
};
const PUB = "https://pubmed.ncbi.nlm.nih.gov/12345678/";
const BLOG = "https://blog.example.org/post/magnesium-sleep";
const WALLED = "https://journal.example.org/articles/sleep-trial";

/** Replace one event's returned text, keeping its bytes and hash honest (so only the semantic check can object). */
function setText(f: Fixture, i: number, text: string) {
  const e = f.source_access_v3.events[i];
  e.returned_text = text;
  e.text_bytes = Buffer.byteLength(text, "utf8");
  e.text_sha256 = sha(text);
}
const cite = (f: Fixture, id: string) => { f.audit.outcomes[0].inventory[0].id = id; };
const search = (query: string, links: string[], prose = "Prose.") =>
  `Web search results for query: "${query}"\n\nLinks: ${JSON.stringify(links.map((u) => ({ title: "t", url: u })))}\n\n${prose}\n`;
const ev = (tool: "WebSearch" | "WebFetch", kind: string, req: Record<string, string>, text: string, n: number) => ({
  tool, tool_use_id: `t${n}`, kind, request: req,
  returned_kind: kind !== "request" ? "no_content" : tool === "WebSearch" ? "search_snippet" : "fetch_model_summary",
  returned_text: text, text_bytes: Buffer.byteLength(text, "utf8"), text_sha256: sha(text),
});
/** Rebuild events and the matching summary counters from a list. */
function setEvents(f: Fixture, events: any[]) {
  f.source_access_v3.events = events;
  const s = { requests: 0, errors: 0, walls: 0, refusals: 0, search_snippets: 0, fetch_summaries: 0, original_documents: 0 };
  for (const e of events) {
    s[e.kind === "request" ? "requests" : e.kind === "error" ? "errors" : e.kind === "wall" ? "walls" : "refusals"]++;
    if (e.kind === "request" && e.returned_text) s[e.returned_kind === "search_snippet" ? "search_snippets" : "fetch_summaries"]++;
  }
  f.source_access_v3.summary = s;
}
const empty = (f: Fixture) => { for (const o of f.audit.outcomes) o.inventory = []; };

describe("SourceAccessV3: the shared fixture (emitted by the real adapter)", () => {
  it("validates, and returns only an owner-safe projection with counters of the follow-through", () => {
    const r = check();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.audit).toEqual(original.audit);
    expect(r.result.source_access).toEqual({
      version: "SourceAccessSummaryV2",
      summary: { requests: 2, errors: 1, walls: 1, refusals: 0, search_snippets: 1, fetch_summaries: 1, original_documents: 0 },
      inventory: [{ id: "pmid:12345678", evidence_class: "derived_snippet" }],
      limitations: [
        "WebSearch snippets and WebFetch model summaries are not original papers.",
        "ID matching does not verify study numbers or clinical validity.",
        "Follow-through counts requests the tools received; it does not show that a page was read in full or that the research is complete.",
      ],
      follow_through: {
        version: "lead-accounting-v1", user_turns: 2, started_at: "2026-10-03T12:00:00.000Z", finished_at: "2026-10-03T12:00:03.000Z",
        searches: 2, distinct_queries: 2, fetches: 2, fetches_with_content: 1, fetches_failed: 1,
        leads: 3, leads_with_content: 1, leads_blocked: 1, leads_unattempted: 1, ledger_rows: 3,
      },
    });
    expect(r.result.provenance).toMatchObject({ model: "claude-sonnet-5-5", prompt_version: "live-research-v0.5", cli_version: "2.1.287", source_access_version: "SourceAccessV3", clinically_approved: false, human_verified: false, affects_score: false });
    const stored = JSON.stringify(r.result);
    for (const needle of ["lead_ledger", "blog.example.org", "journal.example.org", "pubmed.ncbi.nlm.nih.gov", "randomized trial", "tool-search-1", "fetched; summary printed", "Please complete the CAPTCHA"]) {
      expect(stored, needle).not.toContain(needle);
    }
  });

  it("an honest 'exhausted' run is accepted: the blocked lead was followed by a new query, the other lead is dismissed with a stated reason", () => {
    const f = copy();
    expect(f.source_access_v3.events.map((e: any) => [e.tool, e.kind])).toEqual([["WebSearch", "request"], ["WebFetch", "request"], ["WebFetch", "wall"], ["WebSearch", "error"]]);
    expect(check(f).ok).toBe(true);
  });
});

describe("grounding: only what a tool PRINTED, never the model's own request", () => {
  it("control: an id printed in a content-bearing result is recognised", () => {
    const f = copy();
    cite(f, "PMID 87654321");
    setText(f, 1, "Summary for PMID: 87654321: randomized sleep trial, title and year as printed.");
    expect(check(f).ok).toBe(true);
  });

  it("a raw query echo cannot ground the id the model typed itself", () => {
    const f = copy();
    cite(f, "PMID 99999999");
    const q = "PMID 99999999 magnesium sleep";
    f.source_access_v3.events[0].request.query = q;
    setText(f, 0, search(q, [PUB, WALLED, BLOG], "A randomized trial is listed."));
    expect(errorsOf(f).join("\n")).toMatch(/inventory\/0\/id not grounded/);
    // the same result under V2 rules WOULD have grounded it: this is the correction, not a restatement
    expect([...idsIn(f.source_access_v3.events[0].returned_text)]).toContain("pmid:99999999");
  });

  it("the same id printed OUTSIDE the echo is grounded", () => {
    const f = copy();
    cite(f, "PMID 99999999");
    const q = "PMID 99999999 magnesium sleep";
    f.source_access_v3.events[0].request.query = q;
    setText(f, 0, search(q, [PUB, WALLED, BLOG], "A randomized trial is listed. PMID: 99999999 reports sleep outcomes."));
    expect(check(f).ok).toBe(true);
  });

  it("a DOI typed in the query and echoed back does not ground itself", () => {
    const f = copy();
    cite(f, "10.1234/abcd.5678");
    const q = "doi 10.1234/abcd.5678";
    f.source_access_v3.events[0].request.query = q;
    setText(f, 0, search(q, [PUB, WALLED, BLOG]));
    expect(errorsOf(f).join("\n")).toMatch(/not grounded/);
  });

  it("a fetched address that carries a PMID, echoed back by the tool, does not ground that PMID", () => {
    const f = copy();
    cite(f, "PMID 77777777");
    const url = "https://pubmed.ncbi.nlm.nih.gov/77777777/";
    f.source_access_v3.events[1].request.url = url;
    setText(f, 1, `Fetched ${url} and summarised it. The page has a title and abstract.`);
    expect(errorsOf(f).join("\n")).toMatch(/not grounded/);
    expect([...idsIn(f.source_access_v3.events[1].returned_text)]).toContain("pmid:77777777");   // what V2 would have accepted
  });

  it("an id printed only in an error / wall / refusal result cannot ground a citation", () => {
    for (const kind of ["error", "wall", "refusal"] as const) {
      const f = copy();
      cite(f, "PMID 88888888");
      const events = f.source_access_v3.events;
      events[2] = ev("WebFetch", kind, { url: WALLED }, "PMID: 88888888 Please complete the CAPTCHA", 3);   // the text carries the id; the kind says it was no access
      setEvents(f, events);                                                                                 // counters recomputed: only the grounding can object
      expect(errorsOf(f).join("\n"), kind).toMatch(/inventory\/0\/id not grounded/);
    }
  });

  it("wrong, missing and malformed ids are refused", () => {
    for (const id of ["PMID 12345679", "PMID 1234", "not an id", "", "10.9999/never.printed", "NCT00000000"]) {
      const f = copy();
      cite(f, id);
      const errs = errorsOf(f);
      expect(errs.length, JSON.stringify(id)).toBeGreaterThan(0);
    }
  });

  it("access other than snippet is refused", () => {
    for (const access of ["abstract", "full_text"]) {
      const f = copy();
      f.audit.outcomes[0].inventory[0].access = access;
      expect(errorsOf(f).join("\n"), access).toMatch(/access must be snippet/);
    }
  });
});

describe("the lead ledger is checked against the requests, never believed", () => {
  it("a silent lead (no ledger row) is refused", () => {
    const f = copy();
    f.source_access_v3.lead_ledger = f.source_access_v3.lead_ledger.filter((r: any) => r.address !== BLOG);
    expect(errorsOf(f).join("\n")).toMatch(/lead_unaccounted x1/);
  });

  it("the ledger cannot claim an open for a page that was never requested", () => {
    const f = copy();
    f.source_access_v3.lead_ledger.find((r: any) => r.address === BLOG).disposition = "opened";
    expect(errorsOf(f).join("\n")).toMatch(/ledger_claims_open_without_request x1/);
  });

  it("an address that no search listed and nothing fetched is refused", () => {
    const f = copy();
    f.source_access_v3.lead_ledger.push({ address: "https://invented.example.org/study", disposition: "opened", note: "n" });
    expect(errorsOf(f).join("\n")).toMatch(/ledger_unknown_address x1/);
  });

  it("a blocked page followed by the same page in another language is NOT an independent attempt", () => {
    const f = copy();
    const alias = "https://journal.example.org/es/articles/sleep-trial";
    setEvents(f, [
      f.source_access_v3.events[0],
      f.source_access_v3.events[1],
      ev("WebFetch", "error", { url: WALLED }, "", 3),
      ev("WebFetch", "error", { url: alias }, "", 4),
    ]);
    const errs = errorsOf(f).join("\n");
    expect(errs).toMatch(/blocked_without_independent_attempt x1/);
  });

  it("a blocked page followed by the identical query again is NOT an independent attempt either", () => {
    const f = copy();
    setEvents(f, [
      f.source_access_v3.events[0],
      f.source_access_v3.events[1],
      ev("WebFetch", "error", { url: WALLED }, "", 3),
      ev("WebSearch", "request", { query: "  MAGNESIUM glycinate  sleep randomized trial " }, search("magnesium glycinate sleep randomized trial", [PUB, WALLED, BLOG]), 4),
    ]);
    expect(errorsOf(f).join("\n")).toMatch(/blocked_without_independent_attempt x1/);
  });

  it("a mirror of the same record (Europe PMC for the listed PubMed address) counts as opened content", () => {
    const f = copy();
    setEvents(f, [
      f.source_access_v3.events[0],
      ev("WebFetch", "request", { url: "https://europepmc.org/article/MED/12345678" }, "Summary for PMID: 12345678: randomized sleep trial.", 2),
    ]);
    f.source_access_v3.lead_ledger = [
      { address: PUB, disposition: "opened", note: "Europe PMC mirror of the same record" },
      { address: WALLED, disposition: "not_opened_off_topic", note: "n" },
      { address: BLOG, disposition: "not_opened_secondary", note: "n" },
    ];
    expect(check(f).ok).toBe(true);
  });

  it("a malformed ledger is refused by the schema: bad disposition, extra key, missing note, too long", () => {
    const mut: Array<(r: any[]) => void> = [
      (r) => { r[0].disposition = "I did not get to it"; },
      (r) => { r[0].extra = 1; },
      (r) => { delete r[0].note; },
      (r) => { r[0].note = "x".repeat(301); },
      (r) => { r[0].address = "short"; },
    ];
    for (const m of mut) {
      const f = copy();
      m(f.source_access_v3.lead_ledger);
      expect(check(f).ok).toBe(false);
    }
  });
});

describe("premature and thin runs are not accepted", () => {
  const nineLinks = (): string[] => Array.from({ length: 9 }, (_, i) => `https://lead${i}.example.org/page`);

  it("the v0.3 shape: one search, no page opened, empty inventory", () => {
    const f = copy();
    empty(f);
    setEvents(f, [ev("WebSearch", "request", { query: "q" }, search("q", nineLinks()), 1)]);
    f.source_access_v3.lead_ledger = [];
    const errs = errorsOf(f).join("\n");
    expect(errs).toMatch(/lead_unaccounted x9/);
    expect(errs).toMatch(/empty_without_any_page_request x1/);
  });

  it("the v0.4 shape: one search, two requests to ONE record in two locales, both 403, empty inventory", () => {
    const f = copy();
    empty(f);
    const links = [PUB, ...nineLinks().slice(0, 7), "https://pubs.rsc.org/es/content/articlelanding/2020/fo/c9fo03063h"];
    setEvents(f, [
      ev("WebSearch", "request", { query: "q" }, search("q", links), 1),
      ev("WebFetch", "error", { url: "https://pubs.rsc.org/en/content/articlelanding/2020/fo/c9fo03063h" }, "", 2),
      ev("WebFetch", "error", { url: "https://pubs.rsc.org/es/content/articlelanding/2020/fo/c9fo03063h" }, "", 3),
    ]);
    f.source_access_v3.lead_ledger = [];
    const errs = errorsOf(f).join("\n");
    expect(errs).toMatch(/identifier_lead_unopened x1/);
    expect(errs).toMatch(/blocked_without_independent_attempt x1/);
    expect(errs).toMatch(/lead_unaccounted x9/);
  });

  it("dismissing every lead in the ledger does not rescue an empty run that left an identifier-bearing lead unrequested", () => {
    const f = copy();
    empty(f);
    setEvents(f, [ev("WebSearch", "request", { query: "q" }, search("q", [PUB, BLOG]), 1)]);
    f.source_access_v3.lead_ledger = [
      { address: PUB, disposition: "not_opened_off_topic", note: "n" },
      { address: BLOG, disposition: "not_opened_secondary", note: "n" },
    ];
    const errs = errorsOf(f).join("\n");
    expect(errs).toMatch(/identifier_lead_unopened x1/);
    expect(errs).toMatch(/empty_without_any_page_request x1/);
  });

  it("an empty run IS accepted when every lead was requested or honestly dismissed and the errors were followed up", () => {
    const f = copy();
    empty(f);
    setEvents(f, [
      ev("WebSearch", "request", { query: "q" }, search("q", [PUB, BLOG]), 1),
      ev("WebFetch", "error", { url: PUB }, "", 2),
      ev("WebSearch", "request", { query: "study title pubmed" }, search("study title pubmed", [BLOG]), 3),
    ]);
    f.source_access_v3.lead_ledger = [
      { address: PUB, disposition: "opened", note: "HTTP error; searched again by title" },
      { address: BLOG, disposition: "not_opened_secondary", note: "blog" },
    ];
    expect(check(f).ok).toBe(true);   // honest exhaustion is a valid terminal result; it is not a successful smoke by itself
  });

  it("it is not a fetch-count quota: many failed fetches of one lead still fail, one content fetch passes", () => {
    const f = copy();
    const events: any[] = [f.source_access_v3.events[0]];
    for (let i = 0; i < 40; i++) events.push(ev("WebFetch", "error", { url: WALLED }, "", i + 2));
    setEvents(f, events);
    cite(f, "PMID 12345678");
    expect(errorsOf(f).join("\n")).toMatch(/blocked_without_independent_attempt/);
    const g = copy();
    expect(check(g).ok).toBe(true);   // two fetches in total
  });
});

describe("wire discipline", () => {
  it("the V2 wire refuses a v0.5 audit", () => {
    const audit = JSON.parse(JSON.stringify(v2.audit));
    audit.meta.prompt = "live-research-v0.5";
    const access = JSON.parse(JSON.stringify(v2.source_access_v2));
    access.runner.prompt_version = "live-research-v0.5";
    const r = checkLiveResearchResultV2(audit, access, "live-research-v0.5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/source_access_v3|prompt_version/);
  });

  it("the V3 wire refuses an older audit and an older runner", () => {
    for (const older of ["live-research-v0.4", "live-research-v0.3", "live-research-v0.2"]) {
      let f = copy(); f.audit.meta.prompt = older;
      expect(check(f).ok, `audit ${older}`).toBe(false);
      f = copy(); f.source_access_v3.runner.prompt_version = older;
      expect(check(f).ok, `runner ${older}`).toBe(false);
    }
  });

  it("the audit and the runner must name the same prompt, model and login", () => {
    let f = copy(); f.audit.meta.model = "other";
    expect(check(f).ok).toBe(false);
    f = copy(); f.source_access_v3.runner.api_key_source = "ANTHROPIC_API_KEY";
    expect(check(f).ok).toBe(false);
    f = copy(); f.source_access_v3.runner.cli_version = "2.1.0";
    expect(check(f).ok).toBe(false);
    f = copy(); delete f.source_access_v3.runner.user_turns;
    expect(check(f).ok).toBe(false);
  });

  it("request metadata must match the tool: a search has a query, a fetch has a url, never both or neither", () => {
    const mut: Array<(e: any[]) => void> = [
      (e) => { e[0].request = { url: PUB }; },
      (e) => { e[1].request = { query: "q" }; },
      (e) => { e[0].request = { query: "q", url: PUB }; },
      (e) => { e[0].request = {}; },
      (e) => { delete e[0].request; },
      (e) => { e[0].request = { query: "" }; },
    ];
    for (const m of mut) {
      const f = copy();
      m(f.source_access_v3.events);
      expect(check(f).ok).toBe(false);
    }
  });

  it("rejects changed text bytes/hash, counters, duplicate tool ids, request-without-content and non-request-with-content", () => {
    let f = copy(); f.source_access_v3.events[0].text_bytes++;
    expect(errorsOf(f).join("\n")).toMatch(/text_bytes/);
    f = copy(); f.source_access_v3.events[0].text_sha256 = "0".repeat(64);
    expect(errorsOf(f).join("\n")).toMatch(/text_sha256/);
    f = copy(); f.source_access_v3.summary.requests++;
    expect(errorsOf(f).join("\n")).toMatch(/summary/);
    f = copy(); f.source_access_v3.events[1].tool_use_id = f.source_access_v3.events[0].tool_use_id;
    expect(errorsOf(f).join("\n")).toMatch(/duplicate/);
    f = copy(); setText(f, 1, ""); f.source_access_v3.events[1].returned_kind = "no_content";
    expect(errorsOf(f).join("\n")).toMatch(/request without content|summary/);
    f = copy(); f.source_access_v3.events[2].returned_kind = "fetch_model_summary";
    expect(errorsOf(f).join("\n")).toMatch(/nonrequest with content/);
  });

  it("the audit is validated against the CANONICAL schema untouched: an extra key or a missing field is refused", () => {
    let f = copy(); f.audit.lead_ledger = [];
    expect(check(f).ok).toBe(false);
    f = copy(); delete f.audit.confidence_note;
    expect(check(f).ok).toBe(false);
  });

  it("original_documents stays 0 and the request cap holds", () => {
    let f = copy(); f.source_access_v3.summary.original_documents = 1;
    expect(check(f).ok).toBe(false);
    f = copy(); f.source_access_v3.events[0].returned_text = "x".repeat(800_000);
    expect(check(f).ok).toBe(false);
  });
});
