// @vitest-environment node
/*
 * docs/research-jobs.sql, EXECUTED. Every assertion below runs the committed file in a real PostgreSQL 17
 * (PGlite) behind the three Supabase API roles and checks what the database does -- the opposite of the static
 * text checks in scan-research-target-sql.test.ts, which only prove what the file says.
 *
 * ONE ATTEMPT PER JOB (user decision 2026-10-06). The file that was applied to the shared project (SHA-256
 * 48783cd3..., 3 attempts) is kept byte-for-byte as tests/fixtures/research-jobs-baseline-48783cd3.sql; the current
 * docs/research-jobs.sql is the one-attempt revision, and docs/research-jobs-migration-001-one-attempt.sql is the
 * narrow step that moves an already-provisioned project from the first to the second. The last two describe blocks
 * prove that step by EXECUTING it on top of the baseline. This test never touches any database but its own
 * in-memory one. See tests/helpers/research-sql.ts for what the harness can and cannot prove (no concurrent claims;
 * no clock is waited for).
 *
 * The second half is a mutation suite: each mutant is the same file with ONE guarantee removed. Every mutant
 * must still apply cleanly and must then be caught by the scenario that owns that guarantee. A guarantee that
 * no scenario catches is not tested, however green the suite is.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

import {
  API_FUNCTIONS,
  BASELINE_SHA256,
  BASELINE_SQL,
  HELPER_FUNCTIONS,
  MIGRATION_SQL,
  PROMPT,
  Queue,
  RESEARCH_SQL,
  TARGET,
  appliedProject,
  baselineProject,
  catalogSnapshot,
  closeProjects,
  emptyProject,
  migratedProject,
  neighbourSnapshot,
  resultFor,
  sha256hex,
  uuid,
} from "./helpers/research-sql";

const O1 = uuid(101);
const O2 = uuid(102);
const S = (n: number) => uuid(200 + n);
const TOKEN_RE = /^[0-9a-f]{64}$/;
const VIEW_KEYS = ["completed_at", "created_at", "failure_code", "id", "prompt_version", "result", "scan_id", "status", "target", "updated_at"];

type Scenario = (q: Queue) => Promise<void>;
type DbScenario = (db: PGlite) => Promise<void>;

afterAll(closeProjects);

// ----------------------------------------------------------------------------------------------------------------
// queue behaviour (each scenario runs on its own fresh clone of the applied project)

const enqueueIsIdempotentCappedAndOwnerScoped: Scenario = async (q) => {
  const a = await q.enqueue(O1, S(1));
  expect(a.status).toBe("created");
  expect(a.job).toMatchObject({ scan_id: S(1), status: "queued", prompt_version: PROMPT, target: TARGET, result: null, failure_code: null });
  await q.setCreatedAt(a.job.id, "2000-01-01T00:00:00Z");

  const again = await q.enqueue(O1, S(1), { version: "ResearchJobV1", ingredient: { label: "A different target" } });
  expect(again.status).toBe("existing");
  expect(again.job.id).toBe(a.job.id);
  expect(again.job.target).toEqual(TARGET); // a job's target never changes after it is queued
  expect(await q.count()).toBe(1);

  expect((await q.enqueue(O2, S(1))).status).toBe("created"); // same scan id, another owner: its own job
  expect((await q.enqueue(O1, S(2))).status).toBe("created");
  expect((await q.enqueue(O1, S(3))).status).toBe("created");
  expect(await q.enqueue(O1, S(4))).toEqual({ status: "busy" }); // the open-job cap is 3 per owner
  expect(await q.count()).toBe(4);

  const c = await q.claim(); // the oldest open job is O1's first
  expect(c.job.id).toBe(a.job.id);
  expect((await q.complete(c.job.id, c.job.lease_token, resultFor("done"))).status).toBe("completed");
  expect((await q.enqueue(O1, S(4))).status).toBe("created"); // a finished job frees its slot

  for (const bad of [
    () => q.enqueue(null, S(9)),
    () => q.enqueue(O1, null),
    () => q.enqueue(O1, S(9), null),
    () => q.enqueue(O1, S(9), [1, 2]),
    () => q.enqueue(O1, S(9), TARGET, null),
  ]) expect(await bad()).toEqual({ status: "invalid" });
};

const getIsOwnerFilteredAndProjectsOnlySafeFields: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const queued = (await q.get(O1, id)).job;
  expect(Object.keys(queued).sort()).toEqual(VIEW_KEYS);
  expect(queued).toMatchObject({ status: "queued", result: null, failure_code: null });
  expect(await q.get(O2, id)).toEqual({ job: null }); // someone else's job and a missing job look the same
  expect(await q.get(O1, uuid(999))).toEqual({ job: null });

  const c = await q.claim();
  const running = await q.get(O1, id);
  expect(running.job).toMatchObject({ status: "running", result: null, failure_code: null });
  expect(JSON.stringify(running)).not.toContain(c.job.lease_token);
  expect(JSON.stringify(running)).not.toContain(sha256hex(c.job.lease_token));
  expect((await q.complete(id, c.job.lease_token, resultFor("shown"))).status).toBe("completed");
  const done = (await q.get(O1, id)).job;
  expect(done).toMatchObject({ status: "succeeded", failure_code: null });
  expect(done.result).toEqual(resultFor("shown"));
  expect(done.completed_at).not.toBeNull();

  const id2 = (await q.enqueue(O1, S(2))).job.id;
  const c2 = await q.claim();
  expect(c2.job.id).toBe(id2);
  await q.fail(id2, c2.job.lease_token, "claude_quota_or_rate_limit", "operator-only diagnostic text", false);
  const failed = await q.get(O1, id2);
  expect(failed.job).toMatchObject({ status: "failed", failure_code: "claude_quota_or_rate_limit", result: null });
  expect(JSON.stringify(failed)).not.toContain("operator-only");
  expect(Object.keys(failed.job).sort()).toEqual(VIEW_KEYS);
};

const claimIsOldestFirstAndStoresOnlyTheLeaseHash: Scenario = async (q) => {
  const ids: string[] = [];
  for (const n of [1, 2, 3]) ids.push((await q.enqueue(O1, S(n))).job.id);
  // Age them in REVERSE insertion order: the claim order must follow age, not insertion.
  await q.setCreatedAt(ids[0], "2000-01-03T00:00:00Z");
  await q.setCreatedAt(ids[1], "2000-01-02T00:00:00Z");
  await q.setCreatedAt(ids[2], "2000-01-01T00:00:00Z");
  const claimed = [await q.claim(), await q.claim(), await q.claim()];
  expect(claimed.map((c) => c.job.id)).toEqual([ids[2], ids[1], ids[0]]);
  for (const { job } of claimed) {
    expect(Object.keys(job).sort()).toEqual(["id", "lease_token", "prompt_version", "target"]);
    expect(job.lease_token).toMatch(TOKEN_RE);
    expect(job.target).toEqual(TARGET);
    expect(job.prompt_version).toBe(PROMPT);
    const row = await q.row(job.id);
    expect(row).toMatchObject({ status: "running", attempts: 1, lease_token_hash: sha256hex(job.lease_token) });
    expect(JSON.stringify(row)).not.toContain(job.lease_token); // only the hash is ever stored
  }
  expect(new Set(claimed.map((c) => c.job.lease_token)).size).toBe(3);
  expect(await q.claim()).toEqual({ job: null });
};

const leaseLengthIsClamped: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c = await q.claim(5);
  const secs = async () => Number((await q.db.query<{ s: number }>("select extract(epoch from lease_expires_at - now())::float8 as s from public.bsproof_research_jobs where id = $1::uuid", [id])).rows[0].s);
  expect(await secs()).toBeGreaterThan(20);
  expect(await secs()).toBeLessThan(31); // asked for 5 s, got the 30 s floor
  await q.heartbeat(id, c.job.lease_token, 100000);
  expect(await secs()).toBeGreaterThan(800);
  expect(await secs()).toBeLessThan(901); // asked for ~28 h, got the 900 s ceiling
};

const heartbeatExtendsOnlyTheCurrentValidLease: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const other = (await q.enqueue(O1, S(2))).job.id;
  const c = await q.claim();
  const secs = async (job: string) => Number((await q.db.query<{ s: number }>("select extract(epoch from lease_expires_at - now())::float8 as s from public.bsproof_research_jobs where id = $1::uuid", [job])).rows[0].s);
  await q.db.query("update public.bsproof_research_jobs set lease_expires_at = now() + interval '5 seconds' where id = $1::uuid", [id]);
  const hb = await q.heartbeat(id, c.job.lease_token);
  expect(hb.status).toBe("ok");
  expect(typeof hb.lease_expires_at).toBe("string");
  expect(await secs(id)).toBeGreaterThan(200); // 5 s -> a fresh 300 s

  for (const wrong of ["", "0".repeat(64), c.job.lease_token.slice(1)]) expect(await q.heartbeat(id, wrong)).toEqual({ status: "lease_invalid" });
  expect(await q.heartbeat(other, c.job.lease_token)).toEqual({ status: "lease_invalid" }); // a token is for its own job only

  await q.expireLease(id);
  expect(await q.heartbeat(id, c.job.lease_token)).toEqual({ status: "lease_invalid" }); // an expired lease cannot be revived
  expect(await secs(id)).toBeLessThan(0);
};

const anExpiredLeaseIsFinalAndTheOldTokenIsDead: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c1 = (await q.claim()).job;
  await q.expireLease(id);
  const R = resultFor("late");
  expect(await q.heartbeat(id, c1.lease_token)).toEqual({ status: "lease_invalid" }); // an expired lease cannot be revived
  expect(await q.complete(id, c1.lease_token, R)).toEqual({ status: "lease_invalid" }); // a result that arrives after expiry is refused
  expect(await q.fail(id, c1.lease_token, "late", null, false)).toEqual({ status: "lease_invalid" });
  expect(await q.row(id)).toMatchObject({ status: "running", attempts: 1, failure_code: null }); // nothing has swept it yet

  // ONE attempt: the expired lease is NOT handed to a second run. The next claim ends the job instead.
  expect(await q.claim()).toEqual({ job: null });
  expect(await q.row(id)).toMatchObject({ status: "failed", attempts: 1, failure_code: "lease_expired", lease_token_hash: null });
  expect((await q.get(O1, id)).job).toMatchObject({ status: "failed", failure_code: "lease_expired", result: null });

  // ... and the dead token still can do nothing at all.
  expect(await q.heartbeat(id, c1.lease_token)).toEqual({ status: "lease_invalid" });
  expect(await q.complete(id, c1.lease_token, R)).toEqual({ status: "lease_invalid" });
  expect(await q.fail(id, c1.lease_token, "late", null, false)).toEqual({ status: "lease_invalid" });
  expect(await q.claim()).toEqual({ job: null });
};

const aRunningJobRejectsEveryTokenButItsOwn: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const other = (await q.enqueue(O1, S(2))).job.id;
  const c = (await q.claim()).job;
  const o = (await q.claim()).job; // a second job, a second token
  expect([c.id, o.id]).toEqual([id, other]);
  for (const wrong of ["", "0".repeat(64), c.lease_token.slice(1), o.lease_token]) {
    expect(await q.complete(id, wrong, resultFor("x")), "complete").toEqual({ status: "lease_invalid" });
    expect(await q.fail(id, wrong, "x", null, false), "fail").toEqual({ status: "lease_invalid" });
    expect(await q.heartbeat(id, wrong), "heartbeat").toEqual({ status: "lease_invalid" });
  }
  expect((await q.row(id)).status).toBe("running"); // a wrong token touched nothing
  expect(await q.complete(id, c.lease_token, resultFor("mine"))).toEqual({ status: "completed" });
};

const aJobGetsOneAttemptAndItsExpiredLeaseFailsForGood: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c = (await q.claim()).job;
  expect(c.id).toBe(id);
  expect((await q.row(id)).attempts).toBe(1);
  await q.expireLease(id);
  expect(await q.claim()).toEqual({ job: null }); // no second attempt
  expect(await q.row(id)).toMatchObject({ status: "failed", failure_code: "lease_expired", attempts: 1, lease_token_hash: null });
  expect((await q.get(O1, id)).job).toMatchObject({ status: "failed", failure_code: "lease_expired" });
  expect(await q.complete(id, c.lease_token, resultFor("too late"))).toEqual({ status: "lease_invalid" });
  expect(await q.fail(id, c.lease_token, "x", null, false)).toEqual({ status: "lease_invalid" });
  expect(await q.claim()).toEqual({ job: null }); // and it stays that way
  expect((await q.row(id)).attempts).toBe(1);
};

const completionIsACompareAndSetAndReplaySafe: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c = (await q.claim()).job;
  const r1 = resultFor("one");
  const r2 = resultFor("two");
  expect(await q.complete(id, c.lease_token, r1)).toEqual({ status: "completed" });
  expect(await q.row(id)).toMatchObject({ status: "succeeded", result: r1, lease_expires_at: null, failure_code: null });
  expect((await q.row(id)).completed_at).not.toBeNull();

  expect(await q.complete(id, c.lease_token, r1)).toEqual({ status: "already_completed" }); // a lost HTTP response is safe to replay
  const reordered = { provenance: r1.provenance, source_access: r1.source_access, audit: r1.audit };
  expect(await q.complete(id, c.lease_token, reordered)).toEqual({ status: "already_completed" }); // jsonb equality, not text equality
  expect(await q.complete(id, c.lease_token, r2)).toEqual({ status: "conflict" }); // a different result never replaces the first
  expect((await q.row(id)).result).toEqual(r1);

  expect(await q.fail(id, c.lease_token, "late_failure", "x", false)).toEqual({ status: "already_completed" }); // a stale fail cannot overwrite a completion
  expect(await q.row(id)).toMatchObject({ status: "succeeded", failure_code: null });
  expect(await q.complete(id, "f".repeat(64), r1)).toEqual({ status: "lease_invalid" }); // a token that was never issued
  expect(await q.fail(id, "f".repeat(64), "x", null, false)).toEqual({ status: "lease_invalid" });
};

const aJobOnAnotherPromptVersionCannotBeCompleted: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1), TARGET, "live-research-v0.1")).job.id;
  const c = (await q.claim()).job;
  expect(await q.complete(id, c.lease_token, resultFor("x"))).toEqual({ status: "unsupported_prompt_version" });
  expect((await q.row(id)).status).toBe("running");
};

const completeRefusesAnythingButTheExactSummaryShape: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c = (await q.claim()).job;
  const good = resultFor("shape");
  const { provenance, ...noProvenance } = good;
  void provenance;
  const bad: unknown[] = [
    noProvenance,
    { ...good, extra: 1 },
    { ...good, source_access: { ...good.source_access, version: "SourceAccessV1" } },
    { ...good, source_access: { summary: {} } },
    { ...good, source_access: "SourceAccessSummaryV2" },
    [good],
    "text",
    42,
    null,
  ];
  for (const b of bad) expect(await q.complete(id, c.lease_token, b)).toEqual({ status: "invalid" });
  expect((await q.row(id)).status).toBe("running"); // nothing was stored
  expect(await q.complete(id, c.lease_token, good)).toEqual({ status: "completed" });
};

const failureIsSanitisedBoundedAndReplaySafe: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c = (await q.claim()).job;
  expect(await q.fail(id, c.lease_token, "NOT a snake_case code!", "x".repeat(500), false)).toEqual({ status: "failed" });
  const row = await q.row(id);
  expect(row).toMatchObject({ status: "failed", failure_code: "worker_failed" }); // an unusable code is replaced, never stored raw
  expect(row.failure_message).toHaveLength(300);
  expect(await q.fail(id, c.lease_token, "NOT a snake_case code!", "x".repeat(500), false)).toEqual({ status: "already_failed" });
  expect(await q.complete(id, c.lease_token, resultFor("after failure"))).toEqual({ status: "lease_invalid" }); // a failed job cannot be completed
  expect((await q.row(id)).status).toBe("failed");
};

/**
 * The state the OLD retry policy could leave behind: queued, attempts already >= 1. Under one attempt such a job is
 * never claimed (its model run was already spent), which is exactly why migration 001 refuses to apply while one exists.
 */
const aQueuedJobWhoseAttemptIsAlreadySpentIsNeverClaimed: Scenario = async (q) => {
  const spent = (await q.enqueue(O1, S(1))).job.id;
  const fresh = (await q.enqueue(O1, S(2))).job.id;
  await q.setCreatedAt(spent, "2000-01-01T00:00:00Z"); // older: it would be first in line
  await q.db.query("update public.bsproof_research_jobs set attempts = 1 where id = $1::uuid", [spent]);
  const c = (await q.claim()).job;
  expect(c.id).toBe(fresh); // the spent job is skipped, the never-claimed one is served
  expect(await q.complete(fresh, c.lease_token, resultFor("served"))).toEqual({ status: "completed" });
  expect(await q.claim()).toEqual({ job: null });
  expect(await q.row(spent)).toMatchObject({ status: "queued", attempts: 1, lease_token_hash: null }); // untouched, not failed, not claimed
};

const aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c = (await q.claim()).job;
  expect((await q.row(id)).attempts).toBe(1);
  // `retryable: true` used to requeue the job for a second model run. It no longer can.
  expect(await q.fail(id, c.lease_token, "worker_internal_error", "inventory ID is not grounded", true)).toEqual({ status: "failed" });
  expect(await q.row(id)).toMatchObject({ status: "failed", attempts: 1, failure_code: "worker_internal_error", failure_message: "inventory ID is not grounded" });
  expect((await q.get(O1, id)).job).toMatchObject({ status: "failed", failure_code: "worker_internal_error", result: null });
  expect(await q.fail(id, c.lease_token, "worker_internal_error", "inventory ID is not grounded", true)).toEqual({ status: "already_failed" }); // a replay is harmless
  expect(await q.heartbeat(id, c.lease_token)).toEqual({ status: "lease_invalid" });
  expect(await q.complete(id, c.lease_token, resultFor("after failure"))).toEqual({ status: "lease_invalid" });
  expect(await q.claim()).toEqual({ job: null }); // the failed job is never offered again, retryable or not
  expect((await q.row(id)).attempts).toBe(1);

  // the flag is irrelevant either way: false and null are the same single, final failure
  for (const [n, retryable] of [[2, false], [3, null]] as const) {
    const id2 = (await q.enqueue(O1, S(n))).job.id;
    const c2 = (await q.claim()).job;
    expect(c2.id).toBe(id2);
    expect(await q.fail(id2, c2.lease_token, "claude_cli_error", "boom", retryable as unknown as boolean)).toEqual({ status: "failed" });
    expect(await q.claim()).toEqual({ job: null });
    expect(await q.row(id2)).toMatchObject({ status: "failed", attempts: 1, failure_code: "claude_cli_error" });
  }
};

/**
 * A job left running by the OLD 3-attempt policy (attempts 2 or 3, live lease) must keep working: it can heartbeat and
 * finish with its CURRENT token. It is simulated here by the operator-editable `attempts` column; the migration tests
 * below reach the same state through the real baseline functions.
 */
const aLegacyRunningJobWithSeveralAttemptsCanFinishItsCurrentLease: Scenario = async (q) => {
  const done = (await q.enqueue(O1, S(1))).job.id;
  const failing = (await q.enqueue(O1, S(2))).job.id;
  const expiring = (await q.enqueue(O1, S(3))).job.id;
  const c1 = (await q.claim()).job;
  const c2 = (await q.claim()).job;
  const c3 = (await q.claim()).job;
  expect([c1.id, c2.id, c3.id]).toEqual([done, failing, expiring]);
  await q.db.query("update public.bsproof_research_jobs set attempts = 2 where id = $1::uuid", [done]);
  await q.db.query("update public.bsproof_research_jobs set attempts = 3 where id = $1::uuid", [failing]);
  await q.db.query("update public.bsproof_research_jobs set attempts = 2 where id = $1::uuid", [expiring]);

  expect((await q.heartbeat(done, c1.lease_token)).status).toBe("ok");
  expect(await q.complete(done, c1.lease_token, resultFor("legacy"))).toEqual({ status: "completed" });
  expect(await q.row(done)).toMatchObject({ status: "succeeded", attempts: 2 });

  expect(await q.fail(failing, c2.lease_token, "claude_cli_error", "boom", true)).toEqual({ status: "failed" }); // not requeued
  expect(await q.row(failing)).toMatchObject({ status: "failed", attempts: 3 });

  await q.expireLease(expiring); // its lease is gone: it is final, not re-offered
  expect(await q.claim()).toEqual({ job: null });
  expect(await q.row(expiring)).toMatchObject({ status: "failed", failure_code: "lease_expired", attempts: 2 });
};

const identityTargetAndFinishedStatesCannotBeEdited: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const update = (col: string, val: unknown, job = id) => q.db.query(`update public.bsproof_research_jobs set ${col} = $1 where id = $2::uuid`, [val, job]);
  for (const [col, val] of [
    ["id", uuid(9)],
    ["owner_id", O2],
    ["scan_id", S(9)],
    ["prompt_version", "live-research-v9"],
    ["target", '{"version":"ResearchJobV1","ingredient":{"label":"swapped"}}'],
    ["created_at", "2001-01-01T00:00:00Z"],
  ] as const) await expect(update(col, val)).rejects.toThrow(/identity and target are immutable/);
  await update("attempts", 2); // operational columns stay editable by the operator
  expect((await q.row(id)).attempts).toBe(2);
  await update("attempts", 0); // (a queued job with attempts >= 1 is never claimed: put it back)
  expect((await q.row(id)).attempts).toBe(0);

  const c = (await q.claim()).job;
  await q.complete(id, c.lease_token, resultFor("final"));
  await expect(update("status", "queued")).rejects.toThrow(/finished job is final/);
  await expect(update("result", JSON.stringify(resultFor("edited")))).rejects.toThrow(/finished job is final/);
  await expect(update("failure_code", "x")).rejects.toThrow(/finished job is final/);

  const id2 = (await q.enqueue(O1, S(2))).job.id;
  const c2 = (await q.claim()).job;
  await q.fail(id2, c2.lease_token, "gone", null, false);
  await expect(update("status", "queued", id2)).rejects.toThrow(/finished job is final/);
  await expect(update("failure_code", "other", id2)).rejects.toThrow(/finished job is final/);
};

// ----------------------------------------------------------------------------------------------------------------
// privileges and catalog (what the roles can actually do), and the shared-project guard

const privilegesAreClosedToEveryRoleButTheSixFunctions: DbScenario = async (db) => {
  const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;
  const T = "public.bsproof_research_jobs";
  expect((await rows(`select relrowsecurity from pg_class where oid = '${T}'::regclass`))[0].relrowsecurity).toBe(true);
  expect(await rows("select policyname from pg_policies where tablename = 'bsproof_research_jobs'")).toEqual([]);
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const priv of ["select", "insert", "update", "delete", "truncate", "references", "trigger"]) {
      expect((await rows("select has_table_privilege($1, $2, $3) as ok", [role, T, priv]))[0].ok).toBe(false);
    }
  }
  expect(await rows(`select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where c.oid = '${T}'::regclass and a.grantee = 0`)).toEqual([]);

  for (const sig of [...API_FUNCTIONS, ...HELPER_FUNCTIONS]) {
    const fq = sig.startsWith("public.") ? sig : `public.${sig}`;
    const isApi = (API_FUNCTIONS as readonly string[]).includes(sig);
    const can = async (role: string) => (await rows("select has_function_privilege($1, $2, 'execute') as ok", [role, fq]))[0].ok;
    expect(await can("service_role"), `${sig} for service_role`).toBe(isApi);
    expect(await can("anon"), `${sig} for anon`).toBe(false);
    expect(await can("authenticated"), `${sig} for authenticated`).toBe(false);
    expect(await rows(`select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = '${fq}'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'`), `${sig} for PUBLIC`).toEqual([]);
    const meta = (await rows("select p.prosecdef, p.proconfig::text as cfg, obj_description(p.oid, 'pg_proc') as comment from pg_proc p where p.oid = $1::regprocedure", [fq]))[0];
    expect(meta.prosecdef, `${sig} security definer`).toBe(isApi);
    expect(String(meta.cfg ?? ""), `${sig} search_path`).toContain("search_path=pg_catalog, pg_temp");
    expect(String(meta.comment)).toMatch(/^BS-PROOF research jobs:/);
  }
  expect(String((await rows(`select obj_description('${T}'::regclass, 'pg_class') as c`))[0].c)).toMatch(/^BS-PROOF research jobs:/);

  // ... and what that means when a role actually tries.
  const as = async (role: string, sql: string) => {
    await db.exec(`set role ${role}`);
    try {
      return await db.query(sql);
    } finally {
      await db.exec("reset role");
    }
  };
  await expect(as("service_role", `select * from ${T}`)).rejects.toThrow(/permission denied for table/); // even the service role has no direct table access
  await expect(as("service_role", `delete from ${T}`)).rejects.toThrow(/permission denied for table/);
  for (const role of ["anon", "authenticated"]) {
    await expect(as(role, `select public.bsproof_research_claim(300)`), role).rejects.toThrow(/permission denied for function/);
    await expect(as(role, `select public.bsproof_research_get('${uuid(1)}', '${uuid(2)}')`), role).rejects.toThrow(/permission denied for function/);
    await expect(as(role, `select * from ${T}`), role).rejects.toThrow(/permission denied for table/);
  }
  await expect(as("service_role", `select public.bsproof_research_view(j) from ${T} j`)).rejects.toThrow(/permission denied/); // the helper is not an API
  await expect(as("service_role", `select public.bsproof_research_jobs_guard()`)).rejects.toThrow(/permission denied/);
};

const FOREIGN_OBJECTS: Array<{ name: string; seed: string; message: RegExp; survives: string }> = [
  {
    name: "a table of that name BS-PROOF did not create",
    seed: "create table public.bsproof_research_jobs (x int); insert into public.bsproof_research_jobs values (7);",
    message: /bsproof_research_jobs already exists and BS-PROOF did not create it/,
    survives: "select x::text as v from public.bsproof_research_jobs",
  },
  {
    name: "a function in the bsproof_research_ namespace BS-PROOF did not create",
    seed: `create function public.bsproof_research_claim(integer) returns jsonb language sql as $$ select '{"foreign": true}'::jsonb $$;`,
    message: /function (?:public\.)?bsproof_research_claim\(integer\) already exists and BS-PROOF did not create it/,
    survives: "select public.bsproof_research_claim(1)::text as v",
  },
  {
    name: "an index of that name on another table",
    seed: "create table public.someone_elses (a int); create index bsproof_research_jobs_open_idx on public.someone_elses (a);",
    message: /index (?:public\.)?bsproof_research_jobs_open_idx already exists outside BS-PROOF research jobs/,
    survives: "select indexname as v from pg_indexes where indexname = 'bsproof_research_jobs_open_idx'",
  },
  {
    name: "a trigger of that name on another table",
    seed: `create table public.someone_elses (a int);
           create function public.someone_elses_fn() returns trigger language plpgsql as $$ begin return new; end $$;
           create trigger bsproof_research_jobs_guard before update on public.someone_elses for each row execute function public.someone_elses_fn();`,
    message: /trigger bsproof_research_jobs_guard already exists on another relation/,
    survives: "select tgname as v from pg_trigger where tgname = 'bsproof_research_jobs_guard'",
  },
];

/** Apply `sql` next to a foreign object: it must refuse, and leave the project exactly as it found it. */
async function guardRefuses(sql: string, foreign: (typeof FOREIGN_OBJECTS)[number]): Promise<void> {
  const db = await emptyProject();
  try {
    await db.exec(foreign.seed);
    const before = { neighbours: await neighbourSnapshot(db), survivor: (await db.query(foreign.survives)).rows };
    await expect(db.exec(sql)).rejects.toThrow(foreign.message);
    expect(await neighbourSnapshot(db)).toEqual(before.neighbours);
    expect((await db.query(foreign.survives)).rows).toEqual(before.survivor); // the foreign object is intact
    // The refusal happens before anything is created and the whole script is one transaction: nothing of ours is left.
    const left = (await db.query<{ n: number }>("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'bsproof\\_research\\_%' and obj_description(p.oid, 'pg_proc') like 'BS-PROOF research jobs:%'")).rows[0].n;
    expect(left).toBe(0);
  } finally {
    await db.close();
  }
}

// ----------------------------------------------------------------------------------------------------------------

const QUEUE_SCENARIOS: Record<string, Scenario> = {
  enqueueIsIdempotentCappedAndOwnerScoped,
  getIsOwnerFilteredAndProjectsOnlySafeFields,
  claimIsOldestFirstAndStoresOnlyTheLeaseHash,
  leaseLengthIsClamped,
  heartbeatExtendsOnlyTheCurrentValidLease,
  anExpiredLeaseIsFinalAndTheOldTokenIsDead,
  aRunningJobRejectsEveryTokenButItsOwn,
  aJobGetsOneAttemptAndItsExpiredLeaseFailsForGood,
  completionIsACompareAndSetAndReplaySafe,
  aJobOnAnotherPromptVersionCannotBeCompleted,
  completeRefusesAnythingButTheExactSummaryShape,
  failureIsSanitisedBoundedAndReplaySafe,
  aQueuedJobWhoseAttemptIsAlreadySpentIsNeverClaimed,
  aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain,
  aLegacyRunningJobWithSeveralAttemptsCanFinishItsCurrentLease,
  identityTargetAndFinishedStatesCannotBeEdited,
};

async function withQueue(scenario: Scenario, sql: string = RESEARCH_SQL): Promise<void> {
  const db = await appliedProject(sql);
  try {
    await scenario(new Queue(db));
  } finally {
    await db.close();
  }
}
async function withDb(scenario: DbScenario, sql: string = RESEARCH_SQL): Promise<void> {
  const db = await appliedProject(sql);
  try {
    await scenario(db);
  } finally {
    await db.close();
  }
}

describe("docs/research-jobs.sql executed on PostgreSQL 17 (PGlite)", { timeout: 120_000 }, () => {
  it("runs on a PostgreSQL 17 server (the shared project is 17.x)", async () => {
    const db = await emptyProject();
    try {
      const v = (await db.query<{ v: string }>("select current_setting('server_version') as v")).rows[0].v;
      expect(v.split(".")[0]).toBe("17");
    } finally {
      await db.close();
    }
  });

  it("applies cleanly, creates exactly its own objects and changes nothing else in the project", async () => {
    const empty = await emptyProject();
    const applied = await appliedProject();
    try {
      const before = await neighbourSnapshot(empty);
      expect(await neighbourSnapshot(applied)).toEqual(before); // scan_runs, other apps' tables/policies/rows, roles, extensions, schemas
      const snap = await catalogSnapshot(applied);
      expect(snap.functions.map((f) => String(f.sig).split("(")[0]).sort()).toEqual([...API_FUNCTIONS, ...HELPER_FUNCTIONS].map((s) => s.split("(")[0]).sort());
      expect(snap.table).toHaveLength(1);
      expect(snap.triggers.map((t) => t.tgname)).toEqual(["bsproof_research_jobs_guard"]);
      expect(snap.indexes.map((i) => i.indexname).sort()).toEqual(["bsproof_research_jobs_open_idx", "bsproof_research_jobs_owner_scan_key", "bsproof_research_jobs_pkey"]);
    } finally {
      await empty.close();
      await applied.close();
    }
  });

  it("is idempotent: a second application changes nothing and keeps live jobs and their leases", async () => {
    const db = await appliedProject();
    try {
      const q = new Queue(db);
      const id = (await q.enqueue(O1, S(1))).job.id;
      const c = (await q.claim()).job;
      const before = { catalog: await catalogSnapshot(db), neighbours: await neighbourSnapshot(db), row: await q.row(id) };
      await db.exec(RESEARCH_SQL);
      expect(await catalogSnapshot(db)).toEqual(before.catalog);
      expect(await neighbourSnapshot(db)).toEqual(before.neighbours);
      expect(await q.row(id)).toEqual(before.row);
      expect((await q.heartbeat(id, c.lease_token)).status).toBe("ok"); // the running lease survived the re-run
    } finally {
      await db.close();
    }
  });

  it("closes every table and function to anon, authenticated, PUBLIC and (for the table and helpers) service_role", async () => {
    await withDb(privilegesAreClosedToEveryRoleButTheSixFunctions);
  });

  for (const f of FOREIGN_OBJECTS) {
    it(`refuses to run next to ${f.name}, and leaves the project untouched`, async () => {
      await guardRefuses(RESEARCH_SQL, f);
    });
  }

  for (const [name, scenario] of Object.entries(QUEUE_SCENARIOS)) {
    it(name, async () => {
      await withQueue(scenario);
    });
  }
});

// ----------------------------------------------------------------------------------------------------------------
// mutation suite: one removed guarantee per mutant

type Mutant = { name: string; find: string; replace: string; killedBy: { queue: string } | { db: "privileges" } | { guard: number } };

const MUTANTS: Mutant[] = [
  { name: "heartbeat revives an expired lease", find: "    and lease_expires_at > now()\n  returning lease_expires_at into expires;", replace: "  returning lease_expires_at into expires;", killedBy: { queue: "heartbeatExtendsOnlyTheCurrentValidLease" } },
  {
    name: "complete accepts any token while the job is running",
    find: "  if not found or j.lease_token_hash is distinct from h then\n    return jsonb_build_object('status', 'lease_invalid');\n  end if;\n\n  if j.prompt_version",
    replace: "  if not found then\n    return jsonb_build_object('status', 'lease_invalid');\n  end if;\n\n  if j.prompt_version",
    killedBy: { queue: "aRunningJobRejectsEveryTokenButItsOwn" },
  },
  {
    name: "fail ignores lease expiry",
    find: "    return jsonb_build_object('status', 'already_failed');\n  end if;\n  if j.status <> 'running' or j.lease_expires_at <= now() then",
    replace: "    return jsonb_build_object('status', 'already_failed');\n  end if;\n  if j.status <> 'running' then",
    killedBy: { queue: "anExpiredLeaseIsFinalAndTheOldTokenIsDead" },
  },
  { name: "get is not filtered by owner", find: "where id = p_id and owner_id = p_owner;", replace: "where id = p_id;", killedBy: { queue: "getIsOwnerFilteredAndProjectsOnlySafeFields" } },
  { name: "open-job cap is raised to 300", find: "if open_jobs >= 3 then", replace: "if open_jobs >= 300 then", killedBy: { queue: "enqueueIsIdempotentCappedAndOwnerScoped" } },
  // --- the one-attempt policy: the former 3-attempt knobs, each put back, must be caught ---
  { name: "the expiry sweep waits for a third attempt", find: "where status = 'running' and lease_expires_at <= now() and attempts >= 1;", replace: "where status = 'running' and lease_expires_at <= now() and attempts >= 3;", killedBy: { queue: "aJobGetsOneAttemptAndItsExpiredLeaseFailsForGood" } },
  { name: "the expiry sweep never fails a job", find: "where status = 'running' and lease_expires_at <= now() and attempts >= 1;", replace: "where status = 'running' and lease_expires_at <= now() and attempts >= 30;", killedBy: { queue: "anExpiredLeaseIsFinalAndTheOldTokenIsDead" } },
  { name: "claim cap back at 3 (a requeued job is claimed again)", find: "  where attempts < 1\n    and (status = 'queued'", replace: "  where attempts < 3\n    and (status = 'queued'", killedBy: { queue: "aQueuedJobWhoseAttemptIsAlreadySpentIsNeverClaimed" } },
  { name: "claim has no attempts filter at all", find: "  where attempts < 1\n    and (status = 'queued'", replace: "  where (true)\n    and (status = 'queued'", killedBy: { queue: "aQueuedJobWhoseAttemptIsAlreadySpentIsNeverClaimed" } },
  { name: "a retryable fail requeues the job (fail cap back at 3)", find: "if coalesce(p_retryable, false) and j.attempts < 1 then", replace: "if coalesce(p_retryable, false) and j.attempts < 3 then", killedBy: { queue: "aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain" } },
  { name: "a retryable fail always requeues", find: "if coalesce(p_retryable, false) and j.attempts < 1 then", replace: "if coalesce(p_retryable, false) then", killedBy: { queue: "aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain" } },
  { name: "a legacy running job loses its lease (claim fails every running job)", find: "where status = 'running' and lease_expires_at <= now() and attempts >= 1;", replace: "where status = 'running' and attempts >= 1;", killedBy: { queue: "aLegacyRunningJobWithSeveralAttemptsCanFinishItsCurrentLease" } },
  { name: "the lease token is stored in the clear", find: "lease_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'),", replace: "lease_token_hash = token,", killedBy: { queue: "claimIsOldestFirstAndStoresOnlyTheLeaseHash" } },
  { name: "claim hands out the newest job first", find: "order by created_at, id\n  limit 1\n  for update skip locked;", replace: "order by created_at desc, id\n  limit 1\n  for update skip locked;", killedBy: { queue: "claimIsOldestFirstAndStoresOnlyTheLeaseHash" } },
  { name: "an identical replayed completion is a conflict", find: "if j.result = p_result then", replace: "if false then", killedBy: { queue: "completionIsACompareAndSetAndReplaySafe" } },
  {
    name: "complete does not check the summary version",
    find: "\n     or (p_result->'source_access'->>'version') is distinct from 'SourceAccessSummaryV2' then",
    replace: " then",
    killedBy: { queue: "completeRefusesAnythingButTheExactSummaryShape" },
  },
  { name: "a job's target can be changed", find: "\n     or new.target is distinct from old.target", replace: "", killedBy: { queue: "identityTargetAndFinishedStatesCannotBeEdited" } },
  { name: "a finished job is not final", find: "if old.status in ('succeeded', 'failed')", replace: "if false and old.status in ('succeeded', 'failed')", killedBy: { queue: "identityTargetAndFinishedStatesCannotBeEdited" } },
  { name: "the table privileges are not revoked", find: "revoke all on table public.bsproof_research_jobs from public, anon, authenticated, service_role;", replace: "", killedBy: { db: "privileges" } },
  { name: "row level security is not enabled", find: "alter table public.bsproof_research_jobs enable row level security;", replace: "", killedBy: { db: "privileges" } },
  { name: "claim stays executable by anon and PUBLIC", find: "revoke all on function public.bsproof_research_claim(integer) from public, anon, authenticated;", replace: "", killedBy: { db: "privileges" } },
  {
    name: "enqueue runs with the caller's search_path",
    find: "returns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = pg_catalog, pg_temp\nas $fn$\ndeclare\n  j public.bsproof_research_jobs;\n  open_jobs integer;",
    replace: "returns jsonb\nlanguage plpgsql\nsecurity definer\nas $fn$\ndeclare\n  j public.bsproof_research_jobs;\n  open_jobs integer;",
    killedBy: { db: "privileges" },
  },
  {
    name: "claim is not SECURITY DEFINER (the service role would need table access)",
    find: "create or replace function public.bsproof_research_claim(p_lease_seconds integer default 300)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\n",
    replace: "create or replace function public.bsproof_research_claim(p_lease_seconds integer default 300)\nreturns jsonb\nlanguage plpgsql\n",
    killedBy: { queue: "claimIsOldestFirstAndStoresOnlyTheLeaseHash" },
  },
  { name: "the foreign-function guard is disabled", find: "if foreign_fn is not null then", replace: "if false then", killedBy: { guard: 1 } },
  { name: "the foreign-table guard is disabled", find: "if to_regclass('public.bsproof_research_jobs') is not null\n     and coalesce(", replace: "if false\n     and coalesce(", killedBy: { guard: 0 } },
];

describe("mutation suite: every removed guarantee is caught by a scenario", { timeout: 120_000 }, () => {
  for (const m of MUTANTS) {
    it(`kills: ${m.name}`, async () => {
      expect(RESEARCH_SQL.split(m.find).length - 1, "the mutation target must occur exactly once in the committed SQL").toBe(1);
      const mutated = RESEARCH_SQL.replace(m.find, () => m.replace);
      expect(mutated).not.toBe(RESEARCH_SQL);
      if ("guard" in m.killedBy) {
        // The mutated file must still apply to a clean project (it is only the guard that is gone) ...
        const clean = await emptyProject();
        try {
          await clean.exec(mutated);
        } finally {
          await clean.close();
        }
        // ... and the refusal scenario must notice that it no longer refuses.
        await expect(guardRefuses(mutated, FOREIGN_OBJECTS[m.killedBy.guard])).rejects.toThrow();
        return;
      }
      if ("queue" in m.killedBy) {
        const scenario = QUEUE_SCENARIOS[m.killedBy.queue];
        expect(scenario, "unknown scenario").toBeTypeOf("function");
        await expect(withQueue(scenario, mutated)).rejects.toThrow();
      } else {
        await expect(withDb(privilegesAreClosedToEveryRoleButTheSixFunctions, mutated)).rejects.toThrow();
      }
    });
  }

  it("the same scenarios pass on the unmutated file (so a mutant failing is the mutation's doing)", async () => {
    for (const scenario of new Set(MUTANTS.flatMap((m) => ("queue" in m.killedBy ? [QUEUE_SCENARIOS[m.killedBy.queue]] : [])))) await withQueue(scenario);
    await withDb(privilegesAreClosedToEveryRoleButTheSixFunctions);
  });
});

// ----------------------------------------------------------------------------------------------------------------
// migration 001: the baseline (the 2026-10-04 file as APPLIED to production, 3 attempts) + the one-attempt step

const fnBlock = (sql: string, name: string): string => {
  const hits = [...sql.matchAll(new RegExp(`create or replace function public\\.${name}\\(.*?\\n\\$fn\\$;\\n`, "gs"))].map((m) => m[0]);
  expect(hits, `${name} must be defined exactly once`).toHaveLength(1);
  return hits[0];
};

/** Run `scenario` on the PRODUCTION shape (baseline + `migration`), the way the operator would. */
async function withMigrated(scenario: Scenario, migration: string = MIGRATION_SQL): Promise<void> {
  const db = migration === MIGRATION_SQL ? await migratedProject() : await baselineProject();
  try {
    if (migration !== MIGRATION_SQL) await db.exec(migration);
    await scenario(new Queue(db));
  } finally {
    await db.close();
  }
}

/** The job states the OLD policy can leave behind (reached through the real baseline functions, not by editing rows). */
async function legacyProduction(db: PGlite) {
  const q = new Queue(db);
  const claim = async (id: string) => {
    const c = (await q.claim()).job;
    expect(c.id).toBe(id);
    return c.lease_token as string;
  };
  // finished jobs (another owner, so they do not count against O1's open-job cap)
  const done = (await q.enqueue(O2, S(1))).job.id;
  const doneToken = await claim(done);
  expect(await q.complete(done, doneToken, resultFor("finished"))).toEqual({ status: "completed" });
  const failed = (await q.enqueue(O2, S(2))).job.id;
  const failedToken = await claim(failed);
  expect(await q.fail(failed, failedToken, "model_refused", "no", false)).toEqual({ status: "failed" });
  const exhausted = (await q.enqueue(O2, S(3))).job.id; // the old policy's third expired lease
  for (let n = 1; n <= 3; n++) {
    await claim(exhausted);
    await q.expireLease(exhausted);
  }
  expect(await q.claim()).toEqual({ job: null });
  expect(await q.row(exhausted)).toMatchObject({ status: "failed", failure_code: "lease_expired", attempts: 3 });
  // active jobs, O1: running on attempt 2 (requeued once), running on attempt 1, and a queued one that was never claimed
  const running2 = (await q.enqueue(O1, S(4))).job.id;
  const first = await claim(running2);
  expect(await q.fail(running2, first, "worker_internal_error", "x", true)).toEqual({ status: "requeued" }); // the old retry
  const running2Token = await claim(running2);
  expect(await q.row(running2)).toMatchObject({ status: "running", attempts: 2 });
  const running1 = (await q.enqueue(O1, S(5))).job.id;
  const running1Token = await claim(running1);
  const fresh = (await q.enqueue(O1, S(6))).job.id;
  return { q, done, doneToken, failed, failedToken, exhausted, running2, running2Token, running1, running1Token, fresh };
}

const allRows = async (q: Queue) => (await q.db.query("select * from public.bsproof_research_jobs order by id")).rows;

describe("migration 001 (one attempt per job) applied on top of the 2026-10-04 baseline", { timeout: 120_000 }, () => {
  it("the baseline fixture is byte-for-byte the file that was applied to production, and it is the 3-attempt policy", async () => {
    expect(sha256hex(BASELINE_SQL)).toBe(BASELINE_SHA256);
    const db = await baselineProject();
    try {
      const q = new Queue(db);
      const id = (await q.enqueue(O1, S(1))).job.id;
      const c = (await q.claim()).job;
      expect(await q.fail(id, c.lease_token, "claude_cli_error", "boom", true)).toEqual({ status: "requeued" }); // the behaviour the user stopped
      expect((await q.claim()).job.id).toBe(id);
    } finally {
      await db.close();
    }
  });

  it("the migration's two functions are the current docs/research-jobs.sql's two functions, byte for byte", () => {
    for (const name of ["bsproof_research_claim", "bsproof_research_fail"]) {
      expect(fnBlock(MIGRATION_SQL, name)).toBe(fnBlock(RESEARCH_SQL, name));
      expect(fnBlock(MIGRATION_SQL, name)).not.toBe(fnBlock(BASELINE_SQL, name)); // and they really changed
    }
    // the other six functions are not in the migration at all
    expect([...MIGRATION_SQL.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(["bsproof_research_claim", "bsproof_research_fail"]);
  });

  it("is non-destructive and narrow: no DDL/DML but the two create-or-replace functions and a read-only guard", () => {
    const code = MIGRATION_SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    const noBodies = code.replace(/\$(fn|guard)\$[\s\S]*?\$\1\$/g, "$$$1$$ $$$1$$");
    for (const forbidden of [/\bdrop\b/i, /\balter\b/i, /\btruncate\b/i, /\bdelete\b/i, /\binsert\b/i, /\bgrant\b/i, /\brevoke\b/i, /\bcreate\s+(table|index|trigger|policy|role|extension|schema)\b/i, /\bcomment\s+on\b/i, /\bset\s+role\b/i]) {
      expect(noBodies, String(forbidden)).not.toMatch(forbidden);
    }
    // the guard is read-only: it selects and raises, nothing else
    const guard = /\$guard\$([\s\S]*?)\$guard\$/.exec(MIGRATION_SQL)?.[1] ?? "";
    expect(guard).toContain("raise exception");
    expect(guard.replace(/'(?:[^']|'')*'/g, "''")).not.toMatch(/\b(update|insert|delete|drop|alter|truncate|create|grant|revoke|comment|perform|execute)\b/i);
    // the bodies: only the two functions touch the jobs table, and only the claim function writes to it (as it did before)
    const claim = fnBlock(MIGRATION_SQL, "bsproof_research_claim");
    const fail = fnBlock(MIGRATION_SQL, "bsproof_research_fail");
    expect(MIGRATION_SQL.replace(claim, "").replace(fail, "")).not.toMatch(/\b(update|insert|delete)\b\s+(public\.)?bsproof_research_jobs/i);
    for (const body of [claim, fail]) {
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = pg_catalog, pg_temp");
    }
    expect(claim).toContain("for update skip locked");
    expect(fail).toContain("select * into j from public.bsproof_research_jobs where id = p_id for update;");
  });

  it("the VERIFY query printed in the migration header reads false on the baseline and true after the migration", async () => {
    const header = /-- VERIFY AFTER \(read-only\):\n([\s\S]*?);\n--\n/.exec(MIGRATION_SQL)?.[1] ?? "";
    const verify = header.split("\n").map((l) => l.replace(/^--\s?/, "")).join("\n");
    expect(verify).toContain("pg_get_functiondef");
    const before = await baselineProject();
    const after = await migratedProject();
    try {
      expect((await before.query(verify)).rows[0]).toEqual({ claim_one_attempt: false, fail_one_attempt: false });
      expect((await after.query(verify)).rows[0]).toEqual({ claim_one_attempt: true, fail_one_attempt: true });
    } finally {
      await before.close();
      await after.close();
    }
  });

  it("changes exactly two function definitions: owner, ACL, comment, search_path, security definer and volatility are untouched; table, RLS, policies, indexes and trigger are identical", async () => {
    const before = await baselineProject();
    const after = await migratedProject();
    try {
      const b = await catalogSnapshot(before);
      const a = await catalogSnapshot(after);
      expect(a.functions.map((f) => f.sig)).toEqual(b.functions.map((f) => f.sig)); // no function added or removed
      const changed = a.functions.filter((f, i) => f.def !== b.functions[i].def).map((f) => String(f.sig).split("(")[0]);
      expect(changed.sort()).toEqual(["bsproof_research_claim", "bsproof_research_fail"]);
      const strip = (fs: Array<Record<string, unknown>>) => fs.map(({ def, ...rest }) => (void def, rest));
      expect(strip(a.functions)).toEqual(strip(b.functions));
      expect({ ...a, functions: null }).toEqual({ ...b, functions: null });
      expect(await neighbourSnapshot(after)).toEqual(await neighbourSnapshot(before));
    } finally {
      await before.close();
      await after.close();
    }
  });

  it("leaves a project that is indistinguishable from a fresh provisioning with the current docs/research-jobs.sql", async () => {
    const migrated = await migratedProject();
    const fresh = await appliedProject();
    try {
      expect(await catalogSnapshot(migrated)).toEqual(await catalogSnapshot(fresh));
      expect(await neighbourSnapshot(migrated)).toEqual(await neighbourSnapshot(fresh));
    } finally {
      await migrated.close();
      await fresh.close();
    }
  });

  for (const [name, scenario] of Object.entries(QUEUE_SCENARIOS)) {
    it(`${name} (on the migrated production shape)`, async () => {
      await withMigrated(scenario);
    });
  }

  it("keeps every table/function privilege closed on the migrated production shape", async () => {
    const db = await migratedProject();
    try {
      await privilegesAreClosedToEveryRoleButTheSixFunctions(db);
    } finally {
      await db.close();
    }
  });

  it("changes no row, and preserves every active, finished and exhausted job it finds", async () => {
    const db = await baselineProject();
    try {
      const s = await legacyProduction(db);
      const before = await allRows(s.q);
      const catalogBefore = await catalogSnapshot(db);
      await db.exec(MIGRATION_SQL);
      expect(await allRows(s.q)).toEqual(before); // not one column of one row moved: nothing cancelled, requeued, deleted or finished
      expect(await catalogSnapshot(db)).not.toEqual(catalogBefore); // (the two function bodies did change)
      const finishedRows = [s.done, s.failed, s.exhausted].map((id) => before.find((r) => r.id === id));

      // legacy ACTIVE jobs keep their lease: attempt 2 heartbeats and finishes with its current token
      expect((await s.q.heartbeat(s.running2, s.running2Token)).status).toBe("ok");
      expect(await s.q.complete(s.running2, s.running2Token, resultFor("legacy attempt 2"))).toEqual({ status: "completed" });
      expect(await s.q.row(s.running2)).toMatchObject({ status: "succeeded", attempts: 2 });
      // ... a legacy attempt-1 job that now fails is final, whatever `retryable` says
      expect(await s.q.fail(s.running1, s.running1Token, "worker_internal_error", "x", true)).toEqual({ status: "failed" });
      expect(await s.q.row(s.running1)).toMatchObject({ status: "failed", failure_code: "worker_internal_error", attempts: 1 });
      // ... a never-claimed job is claimed ONCE; its expired lease is final
      const c = (await s.q.claim()).job;
      expect(c.id).toBe(s.fresh);
      expect(await s.q.row(s.fresh)).toMatchObject({ status: "running", attempts: 1 });
      await s.q.expireLease(s.fresh);
      expect(await s.q.claim()).toEqual({ job: null });
      expect(await s.q.row(s.fresh)).toMatchObject({ status: "failed", failure_code: "lease_expired", attempts: 1 });

      // finished jobs stay final and are not offered again
      expect(await s.q.complete(s.done, s.doneToken, resultFor("finished"))).toEqual({ status: "already_completed" });
      expect(await s.q.complete(s.done, s.doneToken, resultFor("different"))).toEqual({ status: "conflict" });
      expect(await s.q.fail(s.failed, s.failedToken, "x", null, true)).toEqual({ status: "already_failed" });
      expect(await s.q.claim()).toEqual({ job: null });
      expect([s.done, s.failed, s.exhausted].map((id) => before.find((r) => r.id === id))).toEqual(finishedRows);
      for (const id of [s.done, s.failed, s.exhausted]) expect(await s.q.row(id)).toEqual(before.find((r) => r.id === id));
    } finally {
      await db.close();
    }
  });

  it("a legacy running job whose lease has ALREADY expired is final from the next claim on (it is not re-offered); the migration itself does not touch it", async () => {
    const db = await baselineProject();
    try {
      const s = await legacyProduction(db);
      await s.q.expireLease(s.running2);
      const before = await allRows(s.q);
      await db.exec(MIGRATION_SQL);
      expect(await allRows(s.q)).toEqual(before);
      expect(await s.q.heartbeat(s.running2, s.running2Token)).toEqual({ status: "lease_invalid" });
      const c = (await s.q.claim()).job; // the oldest remaining claimable job is the never-claimed one, not the expired legacy job
      expect(c.id).toBe(s.fresh);
      expect(await s.q.row(s.running2)).toMatchObject({ status: "failed", failure_code: "lease_expired", attempts: 2 });
    } finally {
      await db.close();
    }
  });

  it("is idempotent: a second application changes nothing (catalog, rows, live leases)", async () => {
    const db = await baselineProject();
    try {
      const s = await legacyProduction(db);
      await db.exec(MIGRATION_SQL);
      const before = { catalog: await catalogSnapshot(db), rows: await allRows(s.q), neighbours: await neighbourSnapshot(db) };
      await db.exec(MIGRATION_SQL);
      expect(await catalogSnapshot(db)).toEqual(before.catalog);
      expect(await allRows(s.q)).toEqual(before.rows);
      expect(await neighbourSnapshot(db)).toEqual(before.neighbours);
      expect((await s.q.heartbeat(s.running2, s.running2Token)).status).toBe("ok");
    } finally {
      await db.close();
    }
  });
});

/** The state the guard exists for: a job the OLD retry policy requeued (queued, attempts 1). */
async function strandedBaseline() {
  const db = await baselineProject();
  const q = new Queue(db);
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c = (await q.claim()).job;
  expect(await q.fail(id, c.lease_token, "worker_internal_error", "x", true)).toEqual({ status: "requeued" });
  expect(await q.row(id)).toMatchObject({ status: "queued", attempts: 1 });
  return { db, q, id };
}

describe("migration 001 guard: it refuses, changing nothing, when applying it would strand a job or when the project is not ours", { timeout: 120_000 }, () => {
  it("a job queued with attempts >= 1 (requeued by the old policy) blocks it until the job has finished under the old policy", async () => {
    const { db, q, id } = await strandedBaseline();
    try {
      const before = { catalog: await catalogSnapshot(db), rows: await allRows(q) };
      await expect(db.exec(MIGRATION_SQL)).rejects.toThrow(/is queued with attempts >= 1.*nothing was changed/s);
      expect(await catalogSnapshot(db)).toEqual(before.catalog); // still the 3-attempt functions
      expect(await allRows(q)).toEqual(before.rows);
      expect(String((await db.query<{ d: string }>("select pg_get_functiondef('public.bsproof_research_claim(integer)'::regprocedure) as d")).rows[0].d)).toContain("attempts < 3");

      // drain under the OLD policy (worker running, old SQL), then the migration applies
      const c = (await q.claim()).job;
      expect(c.id).toBe(id);
      expect(await q.complete(id, c.lease_token, resultFor("drained"))).toEqual({ status: "completed" });
      await db.exec(MIGRATION_SQL);
      expect(String((await db.query<{ d: string }>("select pg_get_functiondef('public.bsproof_research_claim(integer)'::regprocedure) as d")).rows[0].d)).toContain("attempts < 1");
    } finally {
      await db.close();
    }
  });

  it("refuses on a project where docs/research-jobs.sql was never applied, and creates nothing", async () => {
    const db = await emptyProject();
    try {
      const before = await neighbourSnapshot(db);
      await expect(db.exec(MIGRATION_SQL)).rejects.toThrow(/bsproof_research_jobs is missing or BS-PROOF did not create it/);
      expect(await neighbourSnapshot(db)).toEqual(before);
      expect((await db.query<{ n: number }>("select count(*)::int as n from pg_proc where proname like 'bsproof\\_research\\_%'")).rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  });

  for (const [name, seed, message] of [
    ["a claim function BS-PROOF did not create", "comment on function public.bsproof_research_claim(integer) is 'someone else''s function'", /function public\.bsproof_research_claim\(integer\) is missing or BS-PROOF did not create it/],
    ["a fail function BS-PROOF did not create", "comment on function public.bsproof_research_fail(uuid, text, text, text, boolean) is null", /function public\.bsproof_research_fail\(uuid, text, text, text, boolean\) is missing or BS-PROOF did not create it/],
    ["a jobs table BS-PROOF did not create", "comment on table public.bsproof_research_jobs is 'someone else''s table'", /bsproof_research_jobs is missing or BS-PROOF did not create it/],
  ] as const) {
    it(`refuses next to ${name}, and leaves it as it was`, async () => {
      const db = await baselineProject();
      try {
        await db.exec(seed);
        const before = await catalogSnapshot(db);
        await expect(db.exec(MIGRATION_SQL)).rejects.toThrow(message);
        expect(await catalogSnapshot(db)).toEqual(before);
      } finally {
        await db.close();
      }
    });
  }
});

describe("migration 001 mutation suite: every removed guarantee in the migration file is caught", { timeout: 120_000 }, () => {
  const strandedGuardRefuses = async (sql: string) => {
    const { db } = await strandedBaseline();
    try {
      await expect(db.exec(sql)).rejects.toThrow(/is queued with attempts >= 1/);
    } finally {
      await db.close();
    }
  };
  const privileges = async (sql: string) => {
    const db = await baselineProject();
    try {
      await db.exec(sql);
      await privilegesAreClosedToEveryRoleButTheSixFunctions(db);
    } finally {
      await db.close();
    }
  };
  const claimDef = "create or replace function public.bsproof_research_claim(p_lease_seconds integer default 300)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = pg_catalog, pg_temp\n";
  const failDef = "create or replace function public.bsproof_research_fail(p_id uuid, p_lease_token text, p_code text, p_message text, p_retryable boolean)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = pg_catalog, pg_temp\n";
  const MIGRATION_MUTANTS: Array<{ name: string; find: string; replace: string; kill: (mutated: string) => Promise<void> }> = [
    { name: "claim keeps the 3-attempt filter", find: "  where attempts < 1\n    and (status = 'queued'", replace: "  where attempts < 3\n    and (status = 'queued'", kill: (m) => withMigrated(aQueuedJobWhoseAttemptIsAlreadySpentIsNeverClaimed, m) },
    { name: "the expiry sweep keeps the 3-attempt threshold", find: "lease_expires_at <= now() and attempts >= 1;", replace: "lease_expires_at <= now() and attempts >= 3;", kill: (m) => withMigrated(anExpiredLeaseIsFinalAndTheOldTokenIsDead, m) },
    { name: "fail keeps the 3-attempt requeue", find: "and j.attempts < 1 then", replace: "and j.attempts < 3 then", kill: (m) => withMigrated(aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain, m) },
    { name: "fail requeues every retryable job", find: "if coalesce(p_retryable, false) and j.attempts < 1 then", replace: "if coalesce(p_retryable, false) then", kill: (m) => withMigrated(aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain, m) },
    { name: "the sweep fails running jobs whose lease is still live", find: "where status = 'running' and lease_expires_at <= now() and attempts >= 1;", replace: "where status = 'running' and attempts >= 1;", kill: (m) => withMigrated(aLegacyRunningJobWithSeveralAttemptsCanFinishItsCurrentLease, m) },
    { name: "claim loses SECURITY DEFINER", find: claimDef, replace: claimDef.replace("security definer\n", ""), kill: (m) => withMigrated(claimIsOldestFirstAndStoresOnlyTheLeaseHash, m) },
    { name: "fail loses SECURITY DEFINER", find: failDef, replace: failDef.replace("security definer\n", ""), kill: (m) => withMigrated(aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain, m) },
    { name: "claim loses its pinned search_path", find: claimDef, replace: claimDef.replace("set search_path = pg_catalog, pg_temp\n", ""), kill: privileges },
    { name: "fail loses its pinned search_path", find: failDef, replace: failDef.replace("set search_path = pg_catalog, pg_temp\n", ""), kill: privileges },
    { name: "the stranded-job guard is disabled", find: "if stranded is not null then", replace: "if false then", kill: strandedGuardRefuses },
    { name: "the foreign-function guard is disabled", find: "if to_regprocedure(fn) is null\n       or coalesce(obj_description(to_regprocedure(fn), 'pg_proc'), '') !~ '^BS-PROOF research jobs:' then", replace: "if false then", kill: async (m) => {
      const db = await baselineProject();
      try {
        await db.exec("comment on function public.bsproof_research_claim(integer) is 'someone else''s function'");
        await expect(db.exec(m)).rejects.toThrow(/did not create it/);
      } finally {
        await db.close();
      }
    } },
  ];
  for (const m of MIGRATION_MUTANTS) {
    it(`kills: ${m.name}`, async () => {
      expect(MIGRATION_SQL.split(m.find).length - 1, "the mutation target must occur exactly once in the migration").toBe(1);
      const mutated = MIGRATION_SQL.replace(m.find, () => m.replace);
      expect(mutated).not.toBe(MIGRATION_SQL);
      await expect(m.kill(mutated)).rejects.toThrow();
    });
  }

  it("the same scenarios pass on the unmutated migration (so a mutant failing is the mutation's doing)", async () => {
    for (const scenario of [aQueuedJobWhoseAttemptIsAlreadySpentIsNeverClaimed, anExpiredLeaseIsFinalAndTheOldTokenIsDead, aRetryableFailureIsFinalAndTheJobIsNeverClaimedAgain, aLegacyRunningJobWithSeveralAttemptsCanFinishItsCurrentLease, claimIsOldestFirstAndStoresOnlyTheLeaseHash]) await withMigrated(scenario);
    await strandedGuardRefuses(MIGRATION_SQL);
    await privileges(MIGRATION_SQL);
  });
});
