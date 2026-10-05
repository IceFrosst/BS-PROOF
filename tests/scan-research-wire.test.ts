// @vitest-environment node
/*
 * CROSS-MODULE WIRE: the exact JSON the real routes send, through the exact
 * reader the browser panel uses (lib/scan-research/client.ts).
 *
 * The backend tests pin what the routes emit; the UI tests pin what the panel
 * accepts from fixtures written by hand. Neither would notice if the two drifted
 * apart (a renamed provenance field, a summary key, an inventory class), because
 * each side tests against its own picture of the other. This file runs ONE job
 * through the real worker and owner routes (in-memory Supabase / queue fakes, no
 * network, no model, no real key) and feeds every owner-facing reply into the
 * panel's parsers.
 *
 * Pinned: queued / running / succeeded / failed all parse; the scan's recorded
 * facts (and the ones it did NOT record) arrive as the panel expects; the stored
 * result is accepted whole by `parseResearchResult` with the model's text, the
 * summary counters and the inventory IDs unchanged (nothing re-worded, nothing
 * defaulted, original_documents 0, affects_score false); the owner reply carries
 * no receipt text, hash, lease token, owner id or worker message; and a result
 * that over-claims is refused by the reader instead of being drawn.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are untyped audit JSON on purpose */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as enqueue } from "@/app/api/scan/research/route";
import { GET as status } from "@/app/api/scan/research/[id]/route";
import { POST as worker } from "@/app/api/scan/research/worker/route";
import { parseResearchJob, parseResearchResult, missingFacts } from "@/lib/scan-research/client";
import { RESEARCH_PROMPT_VERSION } from "@/lib/scan-research/contract";
import { FakeResearchQueue } from "./helpers/fake-research-queue";
import { FAKE_KEY, FAKE_URL, FakeSupabase, USER_A, googleUser } from "./helpers/fake-supabase";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_REQUIRE_AUTH", "SCAN_LIVE_RESEARCH_ENABLED", "SCAN_LIVE_RESEARCH_OWNER_IDS", "BS_PROOF_RESEARCH_WORKER_TOKEN"] as const;
const saved = { ...process.env };
const originalFetch = global.fetch;
const WORKER_TOKEN = "w".repeat(48);
const SCAN = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/source-access-v3.json"), "utf8"));
const FIXTURE_V2 = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/source-access-v2.json"), "utf8"));

let fake: FakeSupabase;
let queue: FakeResearchQueue;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
  process.env.SCAN_LIVE_RESEARCH_ENABLED = "owners";
  process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = USER_A;
  process.env.BS_PROOF_RESEARCH_WORKER_TOKEN = WORKER_TOKEN;
  fake = new FakeSupabase();
  fake.addUser("tok-a", googleUser(USER_A, "alice@example.com"));
  fake.addRun({
    id: SCAN,
    user_id: USER_A,
    user_email: "alice@example.com",
    analysis: {
      schema_version: "ScanAnalysisV1",
      status: "scored",
      source: "manual",
      input: {
        basis: "user_input",
        ingredient: "creatine",
        ingredient_label: "Creatine",
        form: "creatine_monohydrate",
        form_label: "Creatine monohydrate",
        dose_per_serving: { value: 4000, unit: "mg", mg: 4000 },
        servings_per_day: null,
      },
      product: {
        ingredient: "creatine",
        form: "creatine_monohydrate",
        compound_dose_mg: 4000,
        elemental_dose_mg: null,
        servings_per_day: null,
        scored_dose_mg: null,
        scored_dose_basis: null,
        is_multi_ingredient: false,
        other_actives: [],
      },
    },
  });
  queue = new FakeResearchQueue(fake);
  global.fetch = queue.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const auth = { Authorization: "Bearer tok-a" };
const ask = () =>
  enqueue(new Request("http://localhost/api/scan/research/", { method: "POST", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ scan_id: SCAN }) }));
const read = (id: string) => status(new Request(`http://localhost/api/scan/research/${id}/`, { headers: auth }), { params: Promise.resolve({ id }) });
const work = (body: unknown) =>
  worker(new Request("http://localhost/api/scan/research/worker/", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${WORKER_TOKEN}` }, body: JSON.stringify(body) }));
const j = async (res: Response) => (await res.json()) as Record<string, any>;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("real route replies, read by the panel's own parsers", () => {
  it("queued -> running -> succeeded: every stage parses, facts are the scan's own, the result is accepted whole and unchanged", async () => {
    const created = await j(await ask());
    expect(created.status).toBe("ok");
    const id = created.job.id as string;

    // The POST reply's job is a job the panel can read.
    const fromPost = parseResearchJob(created.job);
    expect(fromPost).not.toBeNull();
    expect(fromPost!.status).toBe("queued");
    expect(fromPost!.result).toBeNull();

    // The scan recorded a compound dose and a form but NOT servings/day, and a typed entry says nothing about
    // other ingredients (target.ts: "unknown, not single"): the panel must see both gaps, not a default.
    const queuedJob = parseResearchJob((await j(await read(id))).job);
    expect(queuedJob!.status).toBe("queued");
    expect(queuedJob!.facts).toMatchObject({
      basis: "user_input",
      ingredient: "Creatine",
      form: "Creatine monohydrate",
      compoundPerServingMg: 4000,
      servingsPerDay: null,
      multiIngredient: null,
    });
    expect(missingFacts(queuedJob!.facts)).toEqual(["servings_per_day", "other_ingredients"]);

    // The worker claims it (the lease token is for the worker only).
    const claim = (await j(await work({ action: "claim" }))).job;
    expect(claim.id).toBe(id);
    const runningReply = await j(await read(id));
    expect(parseResearchJob(runningReply.job)!.status).toBe("running");
    expect(JSON.stringify(runningReply)).not.toContain(claim.lease_token);

    // The worker completes it with the real strict V3 fixture (the wire of live-research-v0.5, emitted by the real adapter).
    const done = await work({ action: "complete", job_id: id, lease_token: claim.lease_token, audit: clone(FIXTURE.audit), source_access_v3: clone(FIXTURE.source_access_v3) });
    expect(done.status).toBe(200);

    const reply = await j(await read(id));
    const finished = parseResearchJob(reply.job);
    expect(finished!.status).toBe("succeeded");
    // (completed_at/updated_at are stamped by the SQL, which tests/research-jobs-sql-exec.test.ts executes; this fake does not.)
    const result = parseResearchResult(finished!.result);
    expect(result, "the panel must accept exactly what the server stores").not.toBeNull();

    // The model's own words and numbers are carried verbatim: no re-wording, no defaulting.
    const audit = FIXTURE.audit;
    expect(result!.audit.outcomes).toHaveLength(audit.outcomes.length);
    audit.outcomes.forEach((outcome: any, i: number) => {
      expect(result!.audit.outcomes[i].name).toBe(outcome.name);
      expect(result!.audit.outcomes[i].sentence).toBe(outcome.sentence);
      expect(result!.audit.outcomes[i].strongest_study).toBe(outcome.strongest_study);
      expect(result!.audit.outcomes[i].strongest_doubt).toBe(outcome.strongest_doubt);
      expect(result!.audit.outcomes[i].inventory.map((x) => x.id)).toEqual(outcome.inventory.map((x: any) => x.id));
    });
    expect(result!.audit.daily_dose).toBe(audit.daily_dose);
    expect(result!.audit.could_not_access).toEqual(audit.could_not_access);

    // Experimental, ungraded, no score; access is snippets/summaries, never an original document.
    expect(result!.provenance).toMatchObject({
      affects_score: false,
      clinically_approved: false,
      human_verified: false,
      model: "claude-sonnet-5-5",
      prompt_version: RESEARCH_PROMPT_VERSION,
      cli_version: "2.1.287",
      source_access_version: "SourceAccessV3",
    });
    expect(result!.source_access.version).toBe("SourceAccessSummaryV2");
    expect(result!.source_access.summary.original_documents).toBe(0);
    expect(Object.keys(result!.source_access.summary).sort()).toEqual(["errors", "fetch_summaries", "original_documents", "refusals", "requests", "search_snippets", "walls"]);
    expect(result!.source_access.inventory.every((x) => x.evidence_class === "derived_snippet")).toBe(true);

    // The stored record of the follow-through is counters and timestamps only; the ledger, the queries and the addresses are not stored.
    const stored = (finished!.result as any).source_access.follow_through;
    expect(stored).toMatchObject({ version: "lead-accounting-v1", user_turns: 2, searches: 2, fetches: 2, fetches_with_content: 1, fetches_failed: 1, leads: 3, leads_with_content: 1, leads_blocked: 1, leads_unattempted: 1, ledger_rows: 3 });
    expect(Object.values(stored).every((v) => typeof v === "number" || typeof v === "string")).toBe(true);

    // Nothing private rides along on the owner reply.
    const text = JSON.stringify(reply);
    for (const needle of [claim.lease_token, "text_sha256", '"events"', '"lead_ledger"', "blog.example.org", "journal.example.org", "randomized trial", WORKER_TOKEN, FAKE_KEY, USER_A, "alice@example.com"]) {
      expect(text, needle).not.toContain(needle);
    }
  });

  it("a historical v0.4 result (SourceAccessV2 provenance) is still stored and still read by the same parser", async () => {
    const id = (await j(await ask())).job.id as string;
    const claim = (await j(await work({ action: "claim" }))).job;
    const done = await work({ action: "complete", job_id: id, lease_token: claim.lease_token, audit: clone(FIXTURE_V2.audit), source_access_v2: clone(FIXTURE_V2.source_access_v2) });
    expect(done.status).toBe(200);
    const result = parseResearchResult(parseResearchJob((await j(await read(id))).job)!.result);
    expect(result).not.toBeNull();
    expect(result!.provenance).toMatchObject({ prompt_version: "live-research-v0.4", source_access_version: "SourceAccessV2" });
  });

  it("a worker failure arrives as a failed job with only a safe machine code, never the worker's message", async () => {
    const id = (await j(await ask())).job.id as string;
    const claim = (await j(await work({ action: "claim" }))).job;
    const secretish = "WORKER_PRIVATE_DIAGNOSTIC_do_not_show";
    const res = await work({ action: "fail", job_id: id, lease_token: claim.lease_token, code: "claude_quota_or_rate_limit", message: secretish, retryable: false });
    expect(res.status).toBe(200);
    const reply = await j(await read(id));
    const failed = parseResearchJob(reply.job);
    expect(failed!.status).toBe("failed");
    expect(failed!.failure_code).toBe("claude_quota_or_rate_limit");
    expect(failed!.result).toBeNull();
    expect(JSON.stringify(reply)).not.toContain(secretish);
  });

  it("a stored result that over-claims is refused by the reader, not drawn (defence in depth against a drifted server)", async () => {
    const id = (await j(await ask())).job.id as string;
    const claim = (await j(await work({ action: "claim" }))).job;
    await work({ action: "complete", job_id: id, lease_token: claim.lease_token, audit: clone(FIXTURE.audit), source_access_v3: clone(FIXTURE.source_access_v3) });
    const stored = (await j(await read(id))).job.result;
    expect(parseResearchResult(stored)).not.toBeNull();

    const mutants: Array<[string, (r: any) => void]> = [
      ["affects_score true", (r) => (r.provenance.affects_score = true)],
      ["human_verified true", (r) => (r.provenance.human_verified = true)],
      ["clinically_approved true", (r) => (r.provenance.clinically_approved = true)],
      ["an original document is claimed", (r) => (r.source_access.summary.original_documents = 1)],
      ["inventory above snippet", (r) => (r.audit.outcomes[0].inventory[0].access = "abstract")],
      ["old SourceAccessV1 summary", (r) => (r.source_access.version = "SourceAccessSummaryV1")],
      ["inventory evidence class above derived snippet", (r) => { if (r.source_access.inventory[0]) r.source_access.inventory[0].evidence_class = "full_text"; else r.source_access.inventory = [{ id: "x", evidence_class: "full_text" }]; }],
    ];
    for (const [label, mutate] of mutants) {
      const copy = clone(stored);
      mutate(copy);
      expect(parseResearchResult(copy), label).toBeNull();
    }
  });
});
