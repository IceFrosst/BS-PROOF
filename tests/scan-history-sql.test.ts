// @vitest-environment node
/*
 * docs/scan-history.sql is applied BY HAND, ONCE, to a Supabase project that is
 * SHARED with other apps. No test here can run it (CI has no database); these
 * checks pin the properties that keep it safe to run next to other people's
 * data, so a later edit cannot quietly lose one. (At review time the file was
 * also executed for real against an in-memory Postgres with stand-ins for the
 * Supabase roles and storage schema -- see the release record.)
 *
 *   - it creates no extension (the unused pgcrypto line was removed: in a shared
 *     project an extension can land in `public` and be exposed by PostgREST);
 *   - it only creates / alters / revokes -- no drop, delete, truncate, no
 *     policy, no role, nothing in auth or storage.objects;
 *   - a preflight is the FIRST thing in the file and says what to inspect
 *     (tables, the bucket, storage.objects policies) and to stop if they are
 *     not BS-PROOF's, and a guard block aborts before anything is created;
 *   - private-by-default: RLS on, NO policies, anon/authenticated privileges
 *     revoked on both tables, the bucket created private;
 *   - the retention notice and the "scan_users is unpopulated, emails live in
 *     scan_runs" statement are present, and the stale "one row per signed-in
 *     visitor" wording is gone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAW = readFileSync(join(process.cwd(), "docs", "scan-history.sql"), "utf8");

/** The SQL with `--` comments removed (string literals kept: the guard names objects in them). */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}
/** ...and with the CONTENT of '...' literals removed too (table/column comment text may say "auth.users"). */
function codeOnly(sql: string): string {
  return withoutComments(sql).replace(/'(?:[^']|'')*'/g, "''");
}
/** A comment block read as prose: comment markers and line breaks collapsed to single spaces. */
function prose(sql: string): string {
  return sql.replace(/\n--\s?/g, " ").replace(/\s+/g, " ");
}

const NO_COMMENTS = withoutComments(RAW);
const SQL = NO_COMMENTS;
const STATEMENT_KEYWORDS = codeOnly(RAW).toLowerCase();

describe("docs/scan-history.sql on a shared Supabase project", () => {
  it("creates no extension and mentions none as executable SQL", () => {
    expect(STATEMENT_KEYWORDS).not.toMatch(/create\s+extension/);
    expect(STATEMENT_KEYWORDS).not.toMatch(/pgcrypto/);
  });

  it("is additive: no drop, delete, truncate, policy, role, grant or auth/storage.objects change", () => {
    for (const forbidden of [
      /\bdrop\s+/,
      /\bdelete\s+from\b/,
      /\btruncate\b/,
      /\bcreate\s+(?:or\s+replace\s+)?policy\b/,
      /\balter\s+policy\b/,
      /\bcreate\s+role\b/,
      /\balter\s+role\b/,
      /\bgrant\b/,
      /\bauth\./,
      /\balter\s+table\s+(?:if\s+exists\s+)?storage\./,
      /\bupdate\s+storage\./,
      /\bupdate\s+public\.scan_/,
    ]) {
      expect(STATEMENT_KEYWORDS, String(forbidden)).not.toMatch(forbidden);
    }
    // The only thing it may insert is its own private bucket, and it never overwrites one.
    const inserts = [...STATEMENT_KEYWORDS.matchAll(/insert\s+into\s+([\w.]+)/g)].map((m) => m[1]);
    expect(inserts).toEqual(["storage.buckets"]);
    expect(STATEMENT_KEYWORDS).toMatch(/on\s+conflict\s*\(id\)\s*do\s+nothing/);
  });

  it("puts a shared-project PREFLIGHT before any statement and names every check", () => {
    const firstStatement = RAW.search(/^(?:do\s+\$|create\s|alter\s|revoke\s|insert\s)/im);
    const preflight = RAW.search(/PREFLIGHT/);
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(firstStatement);
    const head = prose(RAW.slice(0, firstStatement));
    for (const needle of [
      "SHARED WITH OTHER APPS",
      "to_regclass('public.scan_runs')",
      "to_regclass('public.scan_users')",
      "from storage.buckets where id = 'scan-images'",
      "from pg_policies where schemaname = 'storage' and tablename = 'objects'",
      "bucket_id",
      "Do NOT adopt",
      "never creates, alters or drops a storage policy",
      "ORDER OF RELEASE",
    ]) {
      expect(head, needle).toContain(needle);
    }
  });

  it("runs a read-only guard that aborts before anything is created", () => {
    const guardStart = SQL.indexOf("do $guard$");
    const firstCreate = SQL.search(/create\s+table/i);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardStart).toBeLessThan(firstCreate);
    const guard = SQL.slice(guardStart, SQL.indexOf("$guard$;", guardStart + 10) + 8).toLowerCase();
    expect(guard).toContain("raise exception");
    for (const needle of ["scan_runs", "scan_users", "storage.buckets", "pg_policies", "bucket_id", "'scan-images'"]) {
      expect(guard, needle).toContain(needle);
    }
    // Read-only: no DML/DDL inside the guard.
    expect(guard).not.toMatch(/\b(?:insert|update|delete|create|alter|drop|truncate|revoke|grant)\b/);
  });

  it("is private by default: RLS on, no policies, anon/authenticated revoked on both tables, bucket private", () => {
    for (const table of ["scan_runs", "scan_users"]) {
      expect(STATEMENT_KEYWORDS).toContain(`alter table public.${table} enable row level security`);
      expect(STATEMENT_KEYWORDS).toContain(`revoke all on table public.${table} from anon, authenticated`);
    }
    const withLiterals = SQL.toLowerCase();
    expect(withLiterals).toMatch(/insert\s+into\s+storage\.buckets[\s\S]*?values\s*\(\s*'scan-images'\s*,\s*'scan-images'\s*,\s*false\s*\)/);
    expect(withLiterals).not.toMatch(/\bpublic\s*=\s*true\b|,\s*true\s*\)/);
  });

  it("claims its own tables with a recognisable comment (what the guard keys on)", () => {
    expect(SQL).toMatch(/comment on table\s+public\.scan_runs\s+is 'BS-PROOF scan history:/);
    expect(SQL).toMatch(/comment on table\s+public\.scan_users\s+is 'BS-PROOF scan history:/);
  });

  it("states retention plainly and promises no deletion", () => {
    expect(RAW).toMatch(/RETENTION/);
    expect(RAW).toMatch(/INDEFINITELY/);
    expect(RAW).toMatch(/NO expiry job, NO deletion endpoint/);
    expect(RAW).not.toMatch(/(?:automatically|will be|are) (?:deleted|purged|erased|removed) after/i);
  });

  it("says scan_users is unpopulated, that nothing in the UI claims, and where the emails live", () => {
    expect(RAW).toMatch(/NOTHING IN THE UI CALLS IT/);
    expect(RAW).toMatch(/scan_runs\.user_email/);
    expect(RAW).not.toMatch(/one row per signed-in person/i);
    expect(RAW).not.toMatch(/Called by the client/i);
  });
});
