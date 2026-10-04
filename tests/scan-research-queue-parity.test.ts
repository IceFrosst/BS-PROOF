// @vitest-environment node
/*
 * The route tests run against tests/helpers/fake-research-queue.ts, an in-memory copy of the six SQL functions.
 * A copy can drift from the original and keep every route test green. This test runs ONE scripted history --
 * enqueue, cap, claim, heartbeat, lease expiry, re-claim, stale tokens, completion replay, conflict, retryable
 * and final failures, final-attempt expiry -- against the fake AND against the real docs/research-jobs.sql
 * (PGlite), and requires the two to answer identically at every step. If they differ, the fake is wrong.
 */
import { afterAll, describe, expect, it } from "vitest";

import { FakeResearchQueue } from "./helpers/fake-research-queue";
import { FakeSupabase } from "./helpers/fake-supabase";
import { Queue, appliedProject, closeProjects, resultFor, uuid } from "./helpers/research-sql";

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

  // A: lease, heartbeat, expiry, re-claim, stale tokens, completion CAS and replay
  const a1 = (await step("claim -> A", b.claim())).job;
  await step("heartbeat A", b.heartbeat(A, a1.lease_token));
  await step("heartbeat A wrong token", b.heartbeat(A, "0".repeat(64)));
  await step("heartbeat B with A's token", b.heartbeat(B, a1.lease_token));
  await b.expireLease(A);
  await step("heartbeat A expired", b.heartbeat(A, a1.lease_token));
  await step("complete A expired", b.complete(A, a1.lease_token, resultFor("late")));
  await step("fail A expired", b.fail(A, a1.lease_token, "late", null, false));
  const a2 = (await step("claim -> A again", b.claim())).job;
  await step("heartbeat A with the old token", b.heartbeat(A, a1.lease_token));
  await step("complete A with the old token", b.complete(A, a1.lease_token, resultFor("old")));
  await step("fail A with the old token", b.fail(A, a1.lease_token, "old", null, false));
  await step("complete A", b.complete(A, a2.lease_token, resultFor("one")));
  await step("complete A replay", b.complete(A, a2.lease_token, resultFor("one")));
  await step("complete A different result", b.complete(A, a2.lease_token, resultFor("two")));
  await step("fail A after completion", b.fail(A, a2.lease_token, "late", null, false));
  await step("fail A after completion, old token", b.fail(A, a1.lease_token, "late", null, false));
  await step("get A done", b.get(O1, A));
  await queue("enqueue D after a slot freed", O1, 4);

  // X: retryable failures until the third attempt
  for (const n of [1, 2]) {
    const x = (await step(`claim -> X #${n}`, b.claim())).job;
    await step(`fail X retryable #${n}`, b.fail(X, x.lease_token, "claude_cli_error", "boom", true));
    await step(`fail X replay #${n}`, b.fail(X, x.lease_token, "claude_cli_error", "boom", true));
    await step(`heartbeat X dead #${n}`, b.heartbeat(X, x.lease_token));
  }
  const x3 = (await step("claim -> X #3", b.claim())).job;
  await step("fail X retryable, no attempts left", b.fail(X, x3.lease_token, "claude_cli_error", "boom", true));
  await step("fail X replay", b.fail(X, x3.lease_token, "claude_cli_error", "boom", true));
  await step("complete X after failure", b.complete(X, x3.lease_token, resultFor("x")));
  await step("get X", b.get(O2, X));

  // B: three expired leases -> failed for good at the next claim, which moves on to C
  for (const n of [1, 2, 3]) {
    const bj = (await step(`claim -> B #${n}`, b.claim())).job;
    await b.expireLease(bj.id);
  }
  const c1 = (await step("claim after B's final expiry -> C", b.claim())).job;
  await step("get B", b.get(O1, B));
  await step("fail C for good", b.fail(C, c1.lease_token, "claude_quota_or_rate_limit", "limit", false));
  await step("get C", b.get(O1, C));
  const d = (await step("claim -> D", b.claim())).job;
  await step("claim with nothing claimable", b.claim());
  await step("complete D", b.complete(d.id, d.lease_token, resultFor("d")));
  await step("claim, queue empty", b.claim());
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
});
