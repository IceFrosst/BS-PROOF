/*
 * A real PostgreSQL (PGlite, in-memory, PostgreSQL 17 like the Supabase project) that EXECUTES the committed
 * docs/research-jobs.sql, so the queue's guarantees are proven by running the SQL, not by reading its text.
 *
 * What is faithful here: the file is applied verbatim; the three Supabase API roles exist (`anon`,
 * `authenticated`, `service_role`) and Supabase's default privileges are reproduced (every new table and
 * function in `public` is granted to them), so the file's own REVOKEs are what actually closes the door.
 * What is not: PGlite is a single connection, so concurrent `for update skip locked` claims cannot be raced
 * here; the SQL's atomicity is that of single statements/row locks, which this harness cannot contradict.
 *
 * Time is never waited for. A lease is "expired" by moving `lease_expires_at` into the past as the
 * superuser, and job age is fixed with explicit `created_at` values, so no test depends on a clock.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

export const RESEARCH_SQL_PATH = join(process.cwd(), "docs", "research-jobs.sql");
export const RESEARCH_SQL = readFileSync(RESEARCH_SQL_PATH, "utf8");

/**
 * The 2026-10-04 revision of docs/research-jobs.sql, byte for byte: the file that was APPLIED to the shared project
 * (3 attempts per job). Kept as a fixture so migration 001 is proven against exactly what production holds, not
 * against the current file. Its sha256 is pinned in the exec test.
 */
export const BASELINE_SQL_PATH = join(process.cwd(), "tests", "fixtures", "research-jobs-baseline-48783cd3.sql");
export const BASELINE_SQL = readFileSync(BASELINE_SQL_PATH, "utf8");
export const BASELINE_SHA256 = "48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb";
/** Migration 001 (one attempt per job): the narrow, incremental step from the baseline to the current file. */
export const MIGRATION_SQL_PATH = join(process.cwd(), "docs", "research-jobs-migration-001-one-attempt.sql");
export const MIGRATION_SQL = readFileSync(MIGRATION_SQL_PATH, "utf8");
/** Migration 002 (prompt version v0.3): `bsproof_research_complete` accepts v0.2 and v0.3. Independent of 001. */
export const MIGRATION2_SQL_PATH = join(process.cwd(), "docs", "research-jobs-migration-002-prompt-v0.3.sql");
export const MIGRATION2_SQL = readFileSync(MIGRATION2_SQL_PATH, "utf8");

export const PROMPT = "live-research-v0.2";
export const PROMPT_V3 = "live-research-v0.3";
export const API_FUNCTIONS = [
  "bsproof_research_enqueue(uuid, uuid, jsonb, text)",
  "bsproof_research_get(uuid, uuid)",
  "bsproof_research_claim(integer)",
  "bsproof_research_heartbeat(uuid, text, integer)",
  "bsproof_research_complete(uuid, text, jsonb)",
  "bsproof_research_fail(uuid, text, text, text, boolean)",
] as const;
export const HELPER_FUNCTIONS = [
  "bsproof_research_jobs_guard()",
  "bsproof_research_view(public.bsproof_research_jobs)",
] as const;

/** Roles, Supabase default privileges, and the neighbours the file must never touch. */
const PROJECT_STAND_INS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  -- Prerequisites the real project already has (docs/scan-history.sql), plus another app's table.
  create table public.scan_runs (id uuid primary key, user_id uuid, analysis jsonb);
  alter table public.scan_runs enable row level security;
  revoke all on public.scan_runs from anon, authenticated;
  create table public.scan_users (id uuid primary key, email text);
  alter table public.scan_users enable row level security;
  create table public.other_app_items (id int primary key, note text);
  alter table public.other_app_items enable row level security;
  create policy other_app_read on public.other_app_items for select to authenticated using (true);
  insert into public.scan_runs values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '{"keep":"me"}');
  insert into public.other_app_items values (1, 'untouched');
`;

let template: Promise<PGlite> | null = null;
let appliedTemplate: Promise<PGlite> | null = null;
let baselineTemplate: Promise<PGlite> | null = null;
let migratedTemplate: Promise<PGlite> | null = null;
let fullyMigratedTemplate: Promise<PGlite> | null = null;

/** A project with the stand-ins and NO research objects. Cloned per call: tests never share state. */
export async function emptyProject(): Promise<PGlite> {
  template ??= (async () => {
    const db = await PGlite.create();
    await db.exec(PROJECT_STAND_INS);
    return db;
  })();
  return (await template).clone();
}

/** A project where `sql` (default: the committed file) has been applied once. */
export async function appliedProject(sql: string = RESEARCH_SQL): Promise<PGlite> {
  if (sql === RESEARCH_SQL) {
    appliedTemplate ??= (async () => {
      const db = await emptyProject();
      await db.exec(RESEARCH_SQL);
      return db;
    })();
    return (await appliedTemplate).clone();
  }
  const db = await emptyProject();
  await db.exec(sql);
  return db;
}

/** A project as PRODUCTION is today: only the applied 2026-10-04 file (3 attempts), no migration. */
export async function baselineProject(): Promise<PGlite> {
  baselineTemplate ??= (async () => {
    const db = await emptyProject();
    await db.exec(BASELINE_SQL);
    return db;
  })();
  return (await baselineTemplate).clone();
}

/** The baseline project with migration 001 applied on top (no jobs in it). */
export async function migratedProject(): Promise<PGlite> {
  migratedTemplate ??= (async () => {
    const db = await baselineProject();
    await db.exec(MIGRATION_SQL);
    return db;
  })();
  return (await migratedTemplate).clone();
}

/** PRODUCTION after the whole release: the baseline with migration 001 and then migration 002 applied. */
export async function fullyMigratedProject(): Promise<PGlite> {
  fullyMigratedTemplate ??= (async () => {
    const db = await migratedProject();
    await db.exec(MIGRATION2_SQL);
    return db;
  })();
  return (await fullyMigratedTemplate).clone();
}

/** Close the shared template databases (clones are closed by their tests). */
export async function closeProjects(): Promise<void> {
  for (const t of [template, appliedTemplate, baselineTemplate, migratedTemplate, fullyMigratedTemplate]) if (t) await (await t).close();
  template = null;
  appliedTemplate = null;
  baselineTemplate = null;
  migratedTemplate = null;
  fullyMigratedTemplate = null;
}

export const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const TARGET = { version: "ResearchJobV1", ingredient: { vocab_id: "magnesium", label: "Magnesium" } };

export function resultFor(tag: string) {
  return {
    audit: { meta: { note: tag } },
    source_access: { version: "SourceAccessSummaryV2", summary: {}, inventory: [], limitations: [] },
    provenance: { evidence_status: "experimental_unvalidated" },
  };
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- jsonb payloads are inspected, not typed

/** The queue as the website sees it (service_role only) plus superuser-only inspection and clock moves. */
export class Queue {
  constructor(readonly db: PGlite) {}

  private async api(sql: string, params: unknown[]): Promise<Json> {
    await this.db.exec("set role service_role");
    try {
      return (await this.db.query<{ r: Json }>(sql, params)).rows[0].r;
    } finally {
      await this.db.exec("reset role");
    }
  }

  enqueue(owner: string | null, scan: string | null, target: unknown = TARGET, promptVersion: string | null = PROMPT) {
    return this.api("select public.bsproof_research_enqueue($1::uuid, $2::uuid, $3::jsonb, $4::text) as r", [
      owner,
      scan,
      target === null ? null : JSON.stringify(target),
      promptVersion,
    ]);
  }
  get(owner: string, id: string) {
    return this.api("select public.bsproof_research_get($1::uuid, $2::uuid) as r", [owner, id]);
  }
  claim(leaseSeconds = 300) {
    return this.api("select public.bsproof_research_claim($1::integer) as r", [leaseSeconds]);
  }
  heartbeat(id: string, token: string, leaseSeconds = 300) {
    return this.api("select public.bsproof_research_heartbeat($1::uuid, $2::text, $3::integer) as r", [id, token, leaseSeconds]);
  }
  complete(id: string, token: string, result: unknown) {
    return this.api("select public.bsproof_research_complete($1::uuid, $2::text, $3::jsonb) as r", [id, token, JSON.stringify(result)]);
  }
  fail(id: string, token: string, code: string, message: string | null, retryable: boolean) {
    return this.api("select public.bsproof_research_fail($1::uuid, $2::text, $3::text, $4::text, $5::boolean) as r", [id, token, code, message, retryable]);
  }

  // ---- superuser: inspection and time ----
  async row(id: string): Promise<Json> {
    return (await this.db.query("select * from public.bsproof_research_jobs where id = $1::uuid", [id])).rows[0];
  }
  async count(): Promise<number> {
    return (await this.db.query<{ n: number }>("select count(*)::int as n from public.bsproof_research_jobs")).rows[0].n;
  }
  /** Make the current lease already expired, without waiting. */
  async expireLease(id: string) {
    await this.db.query("update public.bsproof_research_jobs set lease_expires_at = now() - interval '1 second' where id = $1::uuid", [id]);
  }
  /** Fix a job's age (the immutability trigger is disabled for exactly this one statement). */
  async setCreatedAt(id: string, iso: string) {
    await this.db.exec("alter table public.bsproof_research_jobs disable trigger bsproof_research_jobs_guard");
    try {
      await this.db.query("update public.bsproof_research_jobs set created_at = $2::timestamptz where id = $1::uuid", [id, iso]);
    } finally {
      await this.db.exec("alter table public.bsproof_research_jobs enable trigger bsproof_research_jobs_guard");
    }
  }
}

/** Everything the file creates or changes in the catalog, in a stable, comparable form. */
export async function catalogSnapshot(db: PGlite) {
  const q = async (sql: string) => (await db.query(sql)).rows;
  return {
    functions: await q(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def, p.proacl::text as acl, p.proconfig::text as cfg,
                               p.prosecdef as definer, p.proowner::regrole::text as owner, p.provolatile as volatility, obj_description(p.oid, 'pg_proc') as comment
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname like 'bsproof\\_research\\_%' order by 1`),
    table: await q(`select c.relname, c.relrowsecurity, c.relacl::text as acl, obj_description(c.oid, 'pg_class') as comment
                    from pg_class c where c.oid = to_regclass('public.bsproof_research_jobs')`),
    columns: await q(`select attname, format_type(atttypid, atttypmod) as type, attnotnull, pg_get_expr(d.adbin, d.adrelid) as dflt
                      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                      where a.attrelid = to_regclass('public.bsproof_research_jobs') and a.attnum > 0 and not a.attisdropped order by a.attnum`),
    constraints: await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass('public.bsproof_research_jobs') order by 1`),
    indexes: await q(`select indexname, indexdef from pg_indexes where tablename = 'bsproof_research_jobs' order by 1`),
    triggers: await q(`select tgname, pg_get_triggerdef(oid) as def, tgenabled from pg_trigger where tgrelid = to_regclass('public.bsproof_research_jobs') and not tgisinternal order by 1`),
    policies: await q(`select policyname from pg_policies where tablename = 'bsproof_research_jobs'`),
  };
}

/** Other objects in the shared project: the file must leave every one byte-for-byte as it found it. */
export async function neighbourSnapshot(db: PGlite) {
  const q = async (sql: string) => (await db.query(sql)).rows;
  return {
    tables: await q(`select c.relname, c.relrowsecurity, c.relacl::text as acl from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'bsproof\\_research\\_%' order by 1`),
    policies: await q("select tablename, policyname, cmd, roles::text as roles, qual from pg_policies order by 1, 2"),
    rows: await q("select * from (select 'scan_runs' as t, to_jsonb(s) as r from public.scan_runs s union all select 'other', to_jsonb(o) from public.other_app_items o) x order by t, r::text"),
    roles: await q("select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('anon', 'authenticated', 'service_role') order by 1"),
    extensions: await q("select extname from pg_extension order by 1"),
    schemas: await q("select nspname from pg_namespace where nspname not like 'pg\\_%' order by 1"),
  };
}
