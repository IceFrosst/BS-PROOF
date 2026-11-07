-- BS-PROOF research jobs -- MIGRATION 003: READ THE JOB OF A SCAN (owner-filtered, read-only; written 2026-10-06).
-- NOT RUN YET. Nothing applies this file automatically: not the app, not CI, not a deploy. Apply it once,
-- deliberately, after review, through the same path that applied docs/research-jobs.sql. Independent of migrations
-- 001 (one attempt per job) and 002 (prompt v0.5): any order is safe, and each is idempotent.
--
-- WHY. After a page reload the browser knows only the id of the scan it was showing (the job id lived in memory and is
-- gone). `bsproof_research_get(owner, job id)` needs the job id, so there was no way to ask "does this scan already have
-- research, and how is it going?" without asking for research again (`bsproof_research_enqueue`, which creates a job).
-- This adds the missing READ: the one job of (owner, scan), or {"job": null}. /scan uses it to put the research of a
-- reloaded or re-opened scan back on the screen and to keep following it until it finishes, with no new job and no
-- new model run.
--
-- WHAT IT CREATES. Exactly ONE function and nothing else:
--   public.bsproof_research_get_by_scan(p_owner uuid, p_scan uuid) returns jsonb
-- It is a copy of public.bsproof_research_get with the filter `scan_id = p_scan and owner_id = p_owner` instead of
-- `id = p_id and owner_id = p_owner`: SECURITY DEFINER, STABLE, search_path pinned to pg_catalog, pg_temp, EXECUTE
-- revoked from public / anon / authenticated and granted to service_role alone, the same comment prefix the guards of
-- docs/research-jobs.sql and its migrations look for. The owner filter is INSIDE the function, never left to the
-- caller: someone else's job, a scan with no job and a scan that does not exist are all {"job": null}.
-- The reply is the same owner-facing projection (bsproof_research_view) the other reads use.
--
-- WHAT IT DOES NOT DO. It reads; it never inserts, updates, deletes, claims, requeues or cancels a job. It creates or
-- alters no table, column, index, trigger, policy, role, extension or other function, grants no table privilege to
-- anyone, and changes no existing grant. RLS stays enabled with no policy and no role gets a direct SELECT on the jobs
-- table. A running job keeps its lease and completes exactly as before. The guard below is read-only: it aborts
-- (nothing changed) if the jobs table or the view helper is missing or not BS-PROOF's, or if a function of this name
-- already exists that BS-PROOF did not create.
--
-- ORDER OF RELEASE. Apply this BEFORE the website build that calls it. A website build that calls it first is safe too:
-- PostgREST answers "no such function" with 404, which the app reports as "research unavailable" (never as "no
-- research", never a new job) until this is applied.
--
-- PREFLIGHT (read-only, in a SEPARATE query; must return no row):
--     select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname = 'bsproof_research_get_by_scan'
--         and coalesce(obj_description(p.oid, 'pg_proc'), '') !~ '^BS-PROOF research jobs:';
--
-- VERIFY AFTER (read-only):
--     select to_regprocedure('public.bsproof_research_get_by_scan(uuid, uuid)') is not null as get_by_scan_exists,
--            coalesce(has_function_privilege('service_role', to_regprocedure('public.bsproof_research_get_by_scan(uuid, uuid)'), 'execute'), false) as service_role_can_read,
--            not coalesce(has_function_privilege('anon', to_regprocedure('public.bsproof_research_get_by_scan(uuid, uuid)'), 'execute'), true)
--              and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.bsproof_research_get_by_scan(uuid, uuid)'), 'execute'), true) as api_roles_cannot;
--
-- IDEMPOTENT: re-running it replaces the function with the same text and re-issues the same revokes and grant.
-- ROLLBACK (only if the owner decides): `drop function public.bsproof_research_get_by_scan(uuid, uuid);` -- nothing else
-- depends on it except a website build that calls it, which then shows "research unavailable" on a reload.

do $guard$
declare
  foreign_fn text;
begin
  if to_regclass('public.bsproof_research_jobs') is null
     or coalesce(obj_description(to_regclass('public.bsproof_research_jobs'), 'pg_class'), '') !~ '^BS-PROOF research jobs:' then
    raise exception 'public.bsproof_research_jobs is missing or BS-PROOF did not create it. Apply docs/research-jobs.sql first (see its PREFLIGHT); do not adopt a foreign table.';
  end if;
  if to_regprocedure('public.bsproof_research_view(public.bsproof_research_jobs)') is null
     or coalesce(obj_description(to_regprocedure('public.bsproof_research_view(public.bsproof_research_jobs)'), 'pg_proc'), '') !~ '^BS-PROOF research jobs:' then
    raise exception 'function public.bsproof_research_view(public.bsproof_research_jobs) is missing or BS-PROOF did not create it. Apply docs/research-jobs.sql first; do not adopt a foreign function.';
  end if;
  select p.oid::regprocedure::text into foreign_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'bsproof_research_get_by_scan'
    and coalesce(obj_description(p.oid, 'pg_proc'), '') !~ '^BS-PROOF research jobs:'
  limit 1;
  if foreign_fn is not null then
    raise exception 'function % already exists and BS-PROOF did not create it. Do not replace it.', foreign_fn;
  end if;
end
$guard$;

-- Owner-filtered read BY SCAN. READ-ONLY: it never creates, queues, claims or changes a job, so a page that reloads can find the job its scan already has without asking for research again. Someone else's job, a scan with no job and a scan that does not exist are indistinguishable: {"job": null}. At most one row can match: (owner_id, scan_id) is unique.
create or replace function public.bsproof_research_get_by_scan(p_owner uuid, p_scan uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  j public.bsproof_research_jobs;
begin
  select * into j from public.bsproof_research_jobs where scan_id = p_scan and owner_id = p_owner;
  if not found then
    return jsonb_build_object('job', null);
  end if;
  return jsonb_build_object('job', public.bsproof_research_view(j));
end
$fn$;
comment on function public.bsproof_research_get_by_scan(uuid, uuid) is 'BS-PROOF research jobs: owner-filtered read by scan.';

revoke all on function public.bsproof_research_get_by_scan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bsproof_research_get_by_scan(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
