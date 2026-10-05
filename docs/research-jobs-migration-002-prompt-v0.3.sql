-- BS-PROOF research jobs -- MIGRATION 002: ACCEPT PROMPT VERSION live-research-v0.3 (written 2026-10-06).
-- NOT RUN YET. Nothing applies this file automatically: not the app, not CI, not a deploy. Apply it once,
-- deliberately, after review, through the same path that applied docs/research-jobs.sql. Independent of migration
-- 001 (one attempt per job): either order is safe, and each is idempotent.
--
-- WHY. The live research prompt gained a citation-check rule and became `live-research-v0.3` (see
-- docs/research/pc-research-worker.md "Why the Vitamin D job failed three times"). New jobs are stamped v0.3 by the
-- website, and `bsproof_research_complete` refused every job whose prompt_version was not exactly 'live-research-v0.2'
-- (`unsupported_prompt_version`). With one attempt per job a refused completion is a lost job, so before the website
-- or the new worker go live the function must accept v0.3, and it keeps accepting v0.2 so a job queued before the
-- upgrade, or finished by a worker that has not been upgraded yet, is not lost either.
--
-- WHAT IT CHANGES. Exactly ONE function body, by `create or replace`, same signature:
--   public.bsproof_research_complete(uuid, text, jsonb)
--     `prompt_version <> 'live-research-v0.2'`  ->  `prompt_version not in ('live-research-v0.2', 'live-research-v0.3')`
-- The rest of the function (summary-shape check, lease compare-and-set, replay/conflict, expiry) is byte-identical to
-- docs/research-jobs.sql, and the body repeats `security definer` and `set search_path = pg_catalog, pg_temp`.
-- `create or replace function` keeps the existing owner, ACL (service_role only), comment and attributes.
--
-- WHAT IT DOES NOT DO. No table, column, index, trigger, policy, role, extension, grant, revoke or comment; no
-- UPDATE, DELETE or INSERT; no job is cancelled, requeued, deleted or edited. A running job keeps its lease and
-- completes exactly as before. The guard below is read-only and aborts (nothing changed) if the jobs table or the
-- function is missing or not BS-PROOF's.
--
-- VERIFY AFTER (read-only):
--     select pg_get_functiondef('public.bsproof_research_complete(uuid, text, jsonb)'::regprocedure)
--            like '%live-research-v0.3%' as complete_accepts_v03;
--
-- IDEMPOTENT. ROLLBACK (only if the owner decides): re-apply the `complete` body of the 2026-10-04 file
-- (`git show f7664b2:docs/research-jobs.sql`); a v0.3 job queued meanwhile could then not be completed.

do $guard$
declare
  fn text := 'public.bsproof_research_complete(uuid, text, jsonb)';
begin
  if to_regclass('public.bsproof_research_jobs') is null
     or coalesce(obj_description(to_regclass('public.bsproof_research_jobs'), 'pg_class'), '') !~ '^BS-PROOF research jobs:' then
    raise exception 'public.bsproof_research_jobs is missing or BS-PROOF did not create it. Apply docs/research-jobs.sql first (see its PREFLIGHT); do not adopt a foreign table.';
  end if;
  if to_regprocedure(fn) is null
     or coalesce(obj_description(to_regprocedure(fn), 'pg_proc'), '') !~ '^BS-PROOF research jobs:' then
    raise exception 'function % is missing or BS-PROOF did not create it. Do not replace it. Apply docs/research-jobs.sql first.', fn;
  end if;
end
$guard$;

-- Complete: compare-and-set on the current lease; idempotent for an identical retry. Accepts prompt versions v0.2 and v0.3.
create or replace function public.bsproof_research_complete(p_id uuid, p_lease_token text, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  j public.bsproof_research_jobs;
  h text := encode(sha256(convert_to(coalesce(p_lease_token, ''), 'UTF8')), 'hex');
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or not (p_result ? 'audit' and p_result ? 'source_access' and p_result ? 'provenance')
     or (select count(*) from jsonb_object_keys(p_result)) <> 3
     or (p_result->'source_access'->>'version') is distinct from 'SourceAccessSummaryV2' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into j from public.bsproof_research_jobs where id = p_id for update;
  if not found or j.lease_token_hash is distinct from h then
    return jsonb_build_object('status', 'lease_invalid');
  end if;

  -- v0.3 is stamped on new jobs; v0.2 stays completable so a job queued before the upgrade is not lost.
  if j.prompt_version not in ('live-research-v0.2', 'live-research-v0.3') then
    return jsonb_build_object('status', 'unsupported_prompt_version');
  end if;

  if j.status = 'succeeded' then
    if j.result = p_result then
      return jsonb_build_object('status', 'already_completed');
    end if;
    return jsonb_build_object('status', 'conflict');
  end if;
  if j.status <> 'running' or j.lease_expires_at <= now() then
    return jsonb_build_object('status', 'lease_invalid');
  end if;

  update public.bsproof_research_jobs
  set status = 'succeeded', result = p_result,
      failure_code = null, failure_message = null,
      lease_expires_at = null, completed_at = now(), updated_at = now()
  where id = p_id;
  return jsonb_build_object('status', 'completed');
end
$fn$;

-- The grants, revokes, owner, comment and search_path of the function are those of the existing function (create or
-- replace keeps them); this file deliberately issues no grant, revoke or comment.
