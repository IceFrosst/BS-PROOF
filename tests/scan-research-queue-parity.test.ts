// @vitest-environment node
/*
 * The route tests run against tests/helpers/fake-research-queue.ts, an in-memory copy of the six SQL functions.
 * A copy can drift from the original and keep every route test green. This test runs ONE scripted history --
 * enqueue, cap, claim, heartbeat, lease expiry (final: ONE attempt per job, no re-claim), stale tokens,
 * completion replay, conflict, a retryable fail that is still final, jobs a legacy 3-attempt policy left behind
 * (running with attempts 2, queued with attempts already spent) -- against the fake AND against the real
 * docs/research-jobs.sql (PGlite), and requires the two to answer identically at every step. A second test runs
 * the same history against the PRODUCTION shape (the 2026-10-04 baseline + migration 001). If they differ, the
 * fake is wrong.
 */
import { afterAll, describe, expect, it } from "vitest";

import { FakeResearchQueue } from "./helpers/fake-research-queue";
import { FakeSupabase } from "./helpers/fake-supabase";
import { Queue, appliedProject, closeProjects, migratedProject, resultFor, uuid } from "./helpers/research-sql";

afterAll(closeProjects);

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- jsonb answers are compared, not typed

interface Backend {
  enqueue(owner: string, scan: string): Promise<Json>;
  get(owner: string, id: string): Promise<Json>;
  claim(): Promise<Json>;
  heartbeat(id: string, token: string): Promise<Json>;
  complete(id: string, token: string, result: unknown): Promise<Json>;
  fail(id: string, token: string, code: string, message: string | null, retryable: boolean): Promise<Json>;
  expireLease(id: string): Promise<void>;
  /** Fix the order jobs were queued in (the SQL orders by created_at; the fake by insertion). */
  age(id: string, n: number): Promise<void>;
  /** Put a job in a state the old 3-attempt policy could leave behind. */
  setAttempts(id: string, attempts: number): Promise<void>;
}

const sqlBackend = (q: Queue): Backend => ({
  enqueue: (o, s) => q.enqueue(o, s),
  get: (o, id) => q.get(o, id),
  claim: () => q.claim(),
  heartbeat: (id, t) => q.heartbeat(id, t),
  complete: (id, t, r) => q.complete(id, t, r),
  fail: (id, t, c, m, r) => q.fail(id, t, c, m, r),
  expireLease: (id) => q.expireLease(id),
  age: (id, n) => q.setCreatedAt(id, `2000-01-01T00:00:${String(n).padStart(2, "0")}Z`),
  setAttempts: async (id, n) => {
    await q.db.query("update public.bsproof_research_jobs set attempts = $2 where id = $1::uuid", [id, n]);
  },
});

const fakeBackend = (f: FakeResearchQueue): Backend => ({
  enqueue: async (o, s) => f.bsproof_research_enqueue({ p_owner: o, p_scan: s, p_target: { version: "ResearchJobV1", ingredient: { vocab_id: "magnesium", label: "Magnesium" } }, p_prompt_version: "live-research-v0.2" }),
  get: async (o, id) => f.bsproof_research_get({ p_owner: o, p_id: id }),
  claim: async () => f.bsproof_research_claim(),
  heartbeat: async (id, t) => f.bsproof_research_heartbeat({ p_id: id, p_lease_token: t }),
  complete: async (id, t, r) => f.bsproof_research_complete({ p_id: id, p_lease_token: t, p_result: r }),
  fail: async (id, t, c, m, r) => f.bsproof_research_fail({ p_id: id, p_lease_token: t, p_code: c, p_message: m, p_retryable: r }),
  expireLease: async (id) => f.expireLease(id),
  age: async () => {},
  setAttempts: async (id, n) => {
    const j = f.jobs.find((x) => x.id === id);
    if (j) j.attempts = n;
  },
});

const TIME_KEYS = new Set(["created_at", "updated_at", "completed_at", "lease_expires_at"]);

/** Run the history through `b`; ids and lease tokens become stable symbols, timestamps are dropped. */
async function history(b: Backend): Promise<Array<[string, unknown]>> {
  const log: Array<[string, unknown]> = [];
  const symbols = new Map<string, string>();
  const name = (prefix: string, value: string) => {
    if (!symbols.has(value)) symbols.set(value, `${prefix}${[...symbols.values()].filter((v) => v.startsWith(prefix)).length + 1}`);
    return symbols.get(value)!;
  };
  const norm = (x: Json): Json => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([k]) => !TIME_KEYS.has(k)).map(([k, v]) => [k, norm(v)]));
    return typeof x === "string" && symbols.has(x) ? symbols.get(x) : x;
  };
  const step = async (label: string, run: Promise<Json>) => {
    const out = await run;
    // register ids/tokens the answer introduced BEFORE normalising it
    if (out?.job?.id) name("J", out.job.id);
    if (out?.job?.lease_token) name("T", out.job.lease_token);
    log.push([label, norm(out)]);
    return out;
  };

  const O1 = uuid(101);
  const O2 = uuid(102);
  let age = 0;
  const queue = async (label: string, owner: string, scan: number) => {
    const out = await step(label, b.enqueue(owner, uuid(200 + scan)));
    if (out.status === "created") await b.age(out.job.id, ++age);
    return out;
  };

  const A = (await queue("enqueue A", O1, 1)).job.id;
  await queue("enqueue A again", O1, 1);
  const X = (await queue("enqueue X (other owner, same scan)", O2, 1)).job.id;
  const B = (await queue("enqueue B", O1, 2)).job.id;
  const C = (await queue("enqueue C", O1, 3)).job.id;
  await queue("enqueue D over the cap", O1, 4);
  await step("get A as owner", b.get(O1, A));
  await step("get A as someone else", b.get(O2, A));
  await step("get unknown", b.get(O1, uuid(999)));

  // A: lease, heartbeat, stale tokens, expiry. ONE attempt: the expired lease is final, never re-claimed.
  const a1 = (await step("claim -> A", b.claim())).job;
  await step("heartbeat A", b.heartbeat(A, a1.lease_token));
  await step("heartbeat A wrong token", b.heartbeat(A, "0".repeat(64)));
  await step("heartbeat B with A's token", b.heartbeat(B, a1.lease_token));
  await b.expireLease(A);
  await step("heartbeat A expired", b.heartbeat(A, a1.lease_token));
  await step("complete A expired", b.complete(A, a1.lease_token, resultFor("late")));
  await step("fail A expired", b.fail(A, a1.lease_token, "late", null, false));
  await step("get A expired, not yet swept", b.get(O1, A));
  const x1 = (await step("claim after A's expiry -> X (A is not re-claimed)", b.claim())).job;
  await step("get A failed lease_expired", b.get(O1, A));
  await step("heartbeat A with the dead token", b.heartbeat(A, a1.lease_token));
  await step("complete A with the dead token", b.complete(A, a1.lease_token, resultFor("old")));
  await step("fail A with the dead token", b.fail(A, a1.lease_token, "old", null, false));
  await queue("enqueue D after A's slot freed", O1, 4);

  // X: completion compare-and-set and replay
  await step("complete X", b.complete(X, x1.lease_token, resultFor("one")));
  await step("complete X replay", b.complete(X, x1.lease_token, resultFor("one")));
  await step("complete X different result", b.complete(X, x1.lease_token, resultFor("two")));
  await step("fail X after completion", b.fail(X, x1.lease_token, "late", null, false));
  await step("fail X after completion, other token", b.fail(X, a1.lease_token, "late", null, false));
  await step("get X done", b.get(O2, X));

  // B: a retryable fail is still final (it used to requeue for a second and third model run)
  const b1 = (await step("claim -> B", b.claim())).job;
  await step("fail B retryable", b.fail(B, b1.lease_token, "worker_internal_error", "boom", true));
  await step("fail B replay", b.fail(B, b1.lease_token, "worker_internal_error", "boom", true));
  await step("heartbeat B dead", b.heartbeat(B, b1.lease_token));
  await step("complete B after failure", b.complete(B, b1.lease_token, resultFor("x")));
  await step("get B", b.get(O1, B));

  // C: a non-retryable fail, then the job after it
  const c1 = (await step("claim -> C", b.claim())).job;
  await step("fail C for good", b.fail(C, c1.lease_token, "claude_quota_or_rate_limit", "limit", false));
  await step("get C", b.get(O1, C));
  const d = (await step("claim -> D", b.claim())).job;
  await step("claim with nothing claimable", b.claim());
  await step("complete D", b.complete(d.id, d.lease_token, resultFor("d")));
  await step("claim, queue empty", b.claim());

  // What the OLD 3-attempt policy can have left behind (set directly; the migration tests reach it through the
  // real baseline functions): a running job on attempt 2 finishes on its current lease ...
  const E = (await queue("enqueue E (legacy running)", O2, 5)).job.id;
  const e1 = (await step("claim -> E", b.claim())).job;
  await b.setAttempts(E, 2);
  await step("heartbeat E (attempts 2)", b.heartbeat(E, e1.lease_token));
  await step("complete E (attempts 2)", b.complete(E, e1.lease_token, resultFor("legacy")));
  await step("get E", b.get(O2, E));
  // ... a running job on attempt 3 that fails does not requeue ...
  const G = (await queue("enqueue G (legacy running, attempt 3)", O2, 7)).job.id;
  const g1 = (await step("claim -> G", b.claim())).job;
  await b.setAttempts(G, 3);
  await step("fail G retryable (attempts 3)", b.fail(G, g1.lease_token, "claude_cli_error", "boom", true));
  // ... and a queued job whose attempt was already spent is never claimed
  const F = (await queue("enqueue F (queued, attempt already spent)", O2, 6)).job.id;
  await b.setAttempts(F, 1);
  await step("claim, F is skipped", b.claim());
  await step("get F stays queued", b.get(O2, F));
  return log;
}

describe("the in-memory queue used by the route tests behaves exactly like docs/research-jobs.sql", { timeout: 120_000 }, () => {
  it("answers an identical scripted history identically", async () => {
    const fake = await history(fakeBackend(new FakeResearchQueue(new FakeSupabase())));
    const db = await appliedProject();
    try {
      const real = await history(sqlBackend(new Queue(db)));
      expect(real.length).toBeGreaterThan(50);
      expect(fake.map(([label]) => label)).toEqual(real.map(([label]) => label));
      for (let i = 0; i < real.length; i++) expect(fake[i], `step ${i}: ${real[i][0]}`).toEqual(real[i]);
    } finally {
      await db.close();
    }
  });

  it("... and identically against the PRODUCTION shape: the applied 2026-10-04 file plus migration 001", async () => {
    const fake = await history(fakeBackend(new FakeResearchQueue(new FakeSupabase())));
    const db = await migratedProject();
    try {
      const real = await history(sqlBackend(new Queue(db)));
      expect(fake.map(([label]) => label)).toEqual(real.map(([label]) => label));
      for (let i = 0; i < real.length; i++) expect(fake[i], `step ${i}: ${real[i][0]}`).toEqual(real[i]);
    } finally {
      await db.close();
    }
  });
});
