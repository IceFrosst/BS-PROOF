// @vitest-environment node
/*
 * docs/research-jobs.sql, EXECUTED. Every assertion below runs the committed file in a real PostgreSQL 17
 * (PGlite) behind the three Supabase API roles and checks what the database does -- the opposite of the static
 * text checks in scan-research-target-sql.test.ts, which only prove what the file says.
 *
 * The file is already applied to the shared project (SHA-256 48783cd3...); this test never touches any
 * database but its own in-memory one. See tests/helpers/research-sql.ts for what the harness can and cannot
 * prove (no concurrent claims; no clock is waited for).
 *
 * The second half is a mutation suite: each mutant is the same file with ONE guarantee removed. Every mutant
 * must still apply cleanly and must then be caught by the scenario that owns that guarantee. A guarantee that
 * no scenario catches is not tested, however green the suite is.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

import {
  API_FUNCTIONS,
  HELPER_FUNCTIONS,
  PROMPT,
  Queue,
  RESEARCH_SQL,
  TARGET,
  appliedProject,
  catalogSnapshot,
  closeProjects,
  emptyProject,
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

const expiredLeaseIsReclaimedAndTheOldLeaseIsDead: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  const c1 = (await q.claim()).job;
  await q.expireLease(id);
  const R = resultFor("late");
  expect(await q.heartbeat(id, c1.lease_token)).toEqual({ status: "lease_invalid" });
  expect(await q.complete(id, c1.lease_token, R)).toEqual({ status: "lease_invalid" }); // a result that arrives after expiry is refused
  expect(await q.fail(id, c1.lease_token, "late", null, false)).toEqual({ status: "lease_invalid" });
  expect(await q.row(id)).toMatchObject({ status: "running", attempts: 1, failure_code: null });

  const c2 = (await q.claim()).job; // an expired lease is re-claimable
  expect(c2.id).toBe(id);
  expect(c2.lease_token).not.toBe(c1.lease_token);
  expect(await q.row(id)).toMatchObject({ status: "running", attempts: 2, lease_token_hash: sha256hex(c2.lease_token) });

  // The job is running with a live lease again: the OLD token still can do nothing at all.
  expect(await q.heartbeat(id, c1.lease_token)).toEqual({ status: "lease_invalid" });
  expect(await q.complete(id, c1.lease_token, R)).toEqual({ status: "lease_invalid" });
  expect(await q.fail(id, c1.lease_token, "late", null, false)).toEqual({ status: "lease_invalid" });
  expect((await q.row(id)).status).toBe("running");
  expect(await q.complete(id, c2.lease_token, resultFor("current"))).toEqual({ status: "completed" });
};

const aJobWhoseFinalLeaseExpiresFailsForGood: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const c = (await q.claim()).job;
    expect(c.id).toBe(id);
    expect((await q.row(id)).attempts).toBe(attempt);
    last = c.lease_token;
    await q.expireLease(id);
  }
  expect(await q.claim()).toEqual({ job: null }); // no fourth attempt
  expect(await q.row(id)).toMatchObject({ status: "failed", failure_code: "lease_expired", attempts: 3, lease_token_hash: null });
  expect((await q.get(O1, id)).job).toMatchObject({ status: "failed", failure_code: "lease_expired" });
  expect(await q.complete(id, last, resultFor("too late"))).toEqual({ status: "lease_invalid" });
  expect(await q.fail(id, last, "x", null, false)).toEqual({ status: "lease_invalid" });
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

const retryableFailuresRequeueUntilTheThirdAttempt: Scenario = async (q) => {
  const id = (await q.enqueue(O1, S(1))).job.id;
  for (const attempt of [1, 2]) {
    const c = (await q.claim()).job;
    expect((await q.row(id)).attempts).toBe(attempt);
    expect(await q.fail(id, c.lease_token, "claude_cli_error", "boom", true)).toEqual({ status: "requeued" });
    expect(await q.row(id)).toMatchObject({ status: "queued", lease_token_hash: null, lease_expires_at: null, failure_code: null });
    expect(await q.heartbeat(id, c.lease_token)).toEqual({ status: "lease_invalid" }); // the requeued lease is dead
    expect(await q.fail(id, c.lease_token, "claude_cli_error", "boom", true)).toEqual({ status: "lease_invalid" }); // so a replayed fail cannot burn another attempt
  }
  const c3 = (await q.claim()).job;
  expect((await q.row(id)).attempts).toBe(3);
  expect(await q.fail(id, c3.lease_token, "claude_cli_error", "boom", true)).toEqual({ status: "failed" }); // no attempts left
  expect(await q.row(id)).toMatchObject({ status: "failed", failure_code: "claude_cli_error", failure_message: "boom" });
  expect(await q.fail(id, c3.lease_token, "claude_cli_error", "boom", true)).toEqual({ status: "already_failed" });
  expect(await q.claim()).toEqual({ job: null });
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
  expiredLeaseIsReclaimedAndTheOldLeaseIsDead,
  aJobWhoseFinalLeaseExpiresFailsForGood,
  completionIsACompareAndSetAndReplaySafe,
  aJobOnAnotherPromptVersionCannotBeCompleted,
  completeRefusesAnythingButTheExactSummaryShape,
  failureIsSanitisedBoundedAndReplaySafe,
  retryableFailuresRequeueUntilTheThirdAttempt,
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
    killedBy: { queue: "expiredLeaseIsReclaimedAndTheOldLeaseIsDead" },
  },
  {
    name: "fail ignores lease expiry",
    find: "    return jsonb_build_object('status', 'already_failed');\n  end if;\n  if j.status <> 'running' or j.lease_expires_at <= now() then",
    replace: "    return jsonb_build_object('status', 'already_failed');\n  end if;\n  if j.status <> 'running' then",
    killedBy: { queue: "expiredLeaseIsReclaimedAndTheOldLeaseIsDead" },
  },
  { name: "get is not filtered by owner", find: "where id = p_id and owner_id = p_owner;", replace: "where id = p_id;", killedBy: { queue: "getIsOwnerFilteredAndProjectsOnlySafeFields" } },
  { name: "open-job cap is raised to 300", find: "if open_jobs >= 3 then", replace: "if open_jobs >= 300 then", killedBy: { queue: "enqueueIsIdempotentCappedAndOwnerScoped" } },
  { name: "a final-attempt expiry is never failed", find: "where status = 'running' and lease_expires_at <= now() and attempts >= 3;", replace: "where status = 'running' and lease_expires_at <= now() and attempts >= 30;", killedBy: { queue: "aJobWhoseFinalLeaseExpiresFailsForGood" } },
  { name: "a retryable fail requeues past the third attempt", find: "if coalesce(p_retryable, false) and j.attempts < 3 then", replace: "if coalesce(p_retryable, false) then", killedBy: { queue: "retryableFailuresRequeueUntilTheThirdAttempt" } },
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
