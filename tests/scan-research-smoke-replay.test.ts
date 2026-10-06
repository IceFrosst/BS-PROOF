// @vitest-environment node
/*
 * The ONE successful live-research-v0.5 smoke (4228a3f, 2026-10-05), replayed OFFLINE under the W1 + W2 guards.
 *
 * Opt-in: set BS_PROOF_REPLAY_SMOKE_RUN to the private run directory of that smoke (the original; it is only read).
 * Without it every test here is skipped, like the full-capture replay in tests/test_grounding_replay.py. No model, no network.
 * Nothing is repaired or re-requested: if the original payload stopped passing, that is a failure of this file, not something to adjust.
 *
 * It re-applies, on the BYTE-IDENTICAL result.json the worker posted, the server's own acceptance (checkLiveResearchResultV3),
 * and the lead accounting at both checkpoints of the run (after turn 1 and after turn 2), against what the run itself recorded.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { account, groundingText, hasPageContent, ownRequestText, type LeadEvent } from "@/lib/scan-research/lead-accounting";
import { checkLiveResearchResultV3, groundedIdsV3, ownRequestIds } from "@/lib/scan-research/source-access-v3";
import { idsIn } from "@/lib/scan-research/source-access-v2";
import { parseResearchJob, parseResearchResult } from "@/lib/scan-research/client";
import { buildLiveResultCard } from "@/lib/scan-research/result-card";
import { publicJob } from "@/lib/scan-research/store";

const RUN = process.env.BS_PROOF_REPLAY_SMOKE_RUN;
const SHA = {
  "result.json": "a4a29161362e5e5600effe640f440a53eb1a11ccc0c66c6f9afb8b96f8746035",
  "raw-stream.jsonl": "b0e95533dafc8f1e1670c89fd1cfcfcad56e2afa239afefdd8bbc8e8b1240f7b",
};
const have = Boolean(RUN) && existsSync(path.join(RUN as string, "result.json"));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const read = (name: string) => readFileSync(path.join(RUN as string, name));

describe.skipIf(!have)("the successful v0.5 smoke, original bytes, under the W1 + W2 server code", () => {
  it("the inputs are the original bytes", () => {
    for (const [name, digest] of Object.entries(SHA)) expect(sha(read(name)), name).toBe(digest);
  });

  it("the server accepts the original payload unchanged: one inventory id, the recorded counters", () => {
    const p = JSON.parse(read("result.json").toString("utf8"));
    const r = checkLiveResearchResultV3(p.audit, p.source_access_v3);
    expect(r.ok, r.ok ? "" : r.errors.join("; ")).toBe(true);
    if (!r.ok) return;
    expect(r.result.source_access.inventory).toEqual([{ id: "pmid:32219282", evidence_class: "derived_snippet" }]);
    expect(r.result.source_access.follow_through).toMatchObject({ user_turns: 2, searches: 2, distinct_queries: 2, fetches: 13, fetches_with_content: 4, fetches_failed: 9, leads: 15, leads_with_content: 3, leads_blocked: 6, leads_unattempted: 6, ledger_rows: 15 });
  });

  it("the finished job that the server would STORE for it is drawn by the browser's own parsers: publicJob -> parseResearchJob -> parseResearchResult -> the result card (the completion path ends in a card, not an error)", () => {
    const p = JSON.parse(read("result.json").toString("utf8"));
    const checked = checkLiveResearchResultV3(p.audit, p.source_access_v3);
    expect(checked.ok, checked.ok ? "" : checked.errors.join("; ")).toBe(true);
    if (!checked.ok) return;
    const row = {
      id: "7d1f2a9e-3b4c-4d5e-8f60-123456789abc", scan_id: "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878", status: "succeeded", prompt_version: "live-research-v0.5", target: null,
      created_at: "2026-10-05T21:04:00+00:00", updated_at: "2026-10-05T21:06:00+00:00", completed_at: "2026-10-05T21:06:00+00:00", failure_code: null,
      result: JSON.parse(JSON.stringify(checked.result)), // what jsonb hands back
    };
    const job = parseResearchJob(publicJob(row));
    expect(job?.status).toBe("succeeded");
    const parsed = parseResearchResult(job?.result);
    expect(parsed, "the client must be able to draw what the server stored").not.toBeNull();
    expect(parsed?.provenance.source_access_version).toBe("SourceAccessV3");
    expect(parsed?.source_access.inventory).toEqual([{ id: "pmid:32219282", evidence_class: "derived_snippet" }]);
    expect(parsed!.audit.outcomes.length).toBeGreaterThan(0);
    expect(buildLiveResultCard(parsed!, job?.result, job?.facts ?? null).rows.length).toBeGreaterThan(0);
  });

  it("the cited id is grounded by a fetch whose typed address does not carry it; four fetches returned content", () => {
    const p = JSON.parse(read("result.json").toString("utf8"));
    const events = p.source_access_v3.events as LeadEvent[];
    const sources = events.flatMap((e, i) => (e.kind === "request" && e.returned_text && idsIn(groundingText(e)).has("pmid:32219282") ? [i] : []));
    expect(sources).toEqual([4]);
    expect(ownRequestIds(ownRequestText(events[4])).has("pmid:32219282")).toBe(false);
    expect(groundedIdsV3(events).has("pmid:32219282")).toBe(true);
    expect(events.flatMap((e, i) => (hasPageContent(e) ? [i] : []))).toEqual([4, 9, 13, 14]);
  });

  it("the lead accounting at both checkpoints equals what the run recorded (continue, then satisfied)", () => {
    const p = JSON.parse(read("result.json").toString("utf8"));
    const events = p.source_access_v3.events as LeadEvent[];
    const recorded = JSON.parse(read("followthrough.json").toString("utf8")).turns as { tool_events: number; problems: [string, string][]; decision: string; summary: Record<string, number | boolean> }[];
    const results = read("raw-stream.jsonl").toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "result");
    expect(results.length).toBe(2);
    results.forEach((res, k) => {
      const so = res.structured_output as { audit: { outcomes: { inventory: unknown[] }[] }; lead_ledger: unknown[] };
      const inventoryEmpty = so.audit.outcomes.reduce((n, o) => n + o.inventory.length, 0) === 0;
      const rep = account(events.slice(0, recorded[k].tool_events), so.lead_ledger, inventoryEmpty);
      expect(rep.problems.map((x) => [x.code, x.address]), `turn ${k + 1}`).toEqual(recorded[k].problems);
      expect(rep.satisfied, `turn ${k + 1}`).toBe(recorded[k].decision === "satisfied");
      for (const [key, v] of Object.entries(recorded[k].summary)) expect(rep.summary[key], `${key} turn ${k + 1}`).toBe(v);
    });
  });
});
