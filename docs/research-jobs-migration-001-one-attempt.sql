-- BS-PROOF research jobs -- MIGRATION 001: ONE ATTEMPT PER JOB (written 2026-10-06).
-- NOT RUN YET. Nothing applies this file automatically: not the app, not CI, not a deploy. Apply it
-- once, deliberately, after review, in the Supabase SQL Editor (or the same Management API query path
-- that applied docs/research-jobs.sql), as the role that owns the existing functions.
--
-- WHY. The user decided that a live research job gets exactly ONE model run (2026-10-06). The
-- 2026-10-04 revision of docs/research-jobs.sql (sha256 48783cd3a6d9535b0a8ca8a792c0f73b3d32a98d3b0550c730731b5d9cd9a4fb,
-- the file that was applied) allowed 3 attempts: a retryable `fail` requeued the job and an expired lease
-- was re-claimed, so a job whose audit the worker's grounding guard refused ran the model three times.
-- This migration moves an ALREADY PROVISIONED project to the one-attempt policy; a fresh project gets
-- the same two functions from the current docs/research-jobs.sql (the tests prove the two are identical).
--
-- WHAT IT CHANGES. Exactly two function bodies, by `create or replace`, with the same signatures:
--   public.bsproof_research_claim(integer)                          attempts 3 -> 1 (expiry sweep and claim filter)
--   public.bsproof_research_fail(uuid, text, text, text, boolean)   attempts < 3 -> attempts < 1
-- After it: claim hands a job out only while attempts < 1 (a job is claimed ONCE); a running job whose lease
-- expired becomes failed('lease_expired') at the next claim instead of being re-claimed; a posted `fail` is final
-- whatever its `retryable` flag says (a running job always has attempts >= 1, so the requeue branch can never
-- fire). Nothing else moves: heartbeat, complete (compare-and-set, replay, conflict), enqueue (idempotent per
-- (owner, scan), 3 open jobs per owner), get, the 300 s default lease and its 30-900 s clamp, the immutability
-- trigger, the view, the table, RLS, grants, revokes, owners, comments and every search_path are NOT touched.
-- `create or replace function` keeps the existing owner, ACL (service_role only), comment and security-definer
-- attribute of a function; the bodies below also repeat `security definer` and `set search_path = pg_catalog,
-- pg_temp`, exactly as in docs/research-jobs.sql.
--
-- WHAT IT DOES NOT DO. It creates, alters and drops no table, column, index, trigger, policy, role, extension
-- or grant; it runs no UPDATE, DELETE, TRUNCATE or INSERT; it cancels, requeues, deletes or edits NO job (finished
-- or active). A job that is `running` with a live lease keeps its lease and can still heartbeat and complete with
-- its current token, whatever its attempts value (even 2 or 3 from the old policy): a legacy running job is NOT
-- failed by this migration. Only an EXPIRED lease on an attempts >= 1 job is treated as final, from the next claim on.
--
-- PREFLIGHT / DRAIN (read docs/research/pc-research-worker.md "One attempt per job and medium effort"). The guard below
-- aborts (nothing changed) if the project does not look like a BS-PROOF research project, or if a job is
-- `queued` with attempts >= 1: such a job (requeued by the old retry policy) could never be claimed again and would
-- sit `queued` forever, so it must be finished under the old policy first (worker running, old SQL) or handled by the
-- operator by hand. Read-only checks you can run first, in a SEPARATE query:
--     select status, attempts, count(*) from public.bsproof_research_jobs group by 1, 2 order by 1, 2;
--     select id, status, attempts, lease_expires_at from public.bsproof_research_jobs
--       where status = 'queued' and attempts >= 1;         -- must be empty
--     select id, status, attempts, lease_expires_at from public.bsproof_research_jobs
--       where status = 'running';                          -- empty after a drain; otherwise wait or accept the rule above
--
-- VERIFY AFTER (read-only):
--     select pg_get_functiondef('public.bsproof_research_claim(integer)'::regprocedure) like '%attempts < 1%'
--        and pg_get_functiondef('public.bsproof_research_claim(integer)'::regprocedure) like '%attempts >= 1%' as claim_one_attempt,
--            pg_get_functiondef('public.bsproof_research_fail(uuid, text, text, text, boolean)'::regprocedure) like '%j.attempts < 1%' as fail_one_attempt;
--
-- IDEMPOTENT: re-running it replaces the two functions with the same text and changes nothing else.
-- ROLLBACK (only if the owner decides to restore the 3-attempt policy): re-apply the two function bodies of the
-- 2026-10-04 file (`git show f7664b2:docs/research-jobs.sql`, sha256 48783cd3...); it is idempotent and keeps jobs.
-- A job that ALREADY ended as failed('lease_expired') under this policy is final and is not undone by a rollback.

do $guard$
declare
  fn text;
  stranded text;
begin
  if to_regclass('public.bsproof_research_jobs') is null
     or coalesce(obj_description(to_regclass('public.bsproof_research_jobs'), 'pg_class'), '') !~ '^BS-PROOF research jobs:' then
    raise exception 'public.bsproof_research_jobs is missing or BS-PROOF did not create it. Apply docs/research-jobs.sql first (see its PREFLIGHT); do not adopt a foreign table.';
  end if;

  foreach fn in array array['public.bsproof_research_claim(integer)', 'public.bsproof_research_fail(uuid, text, text, text, boolean)'] loop
    if to_regprocedure(fn) is null
       or coalesce(obj_description(to_regprocedure(fn), 'pg_proc'), '') !~ '^BS-PROOF research jobs:' then
      raise exception 'function % is missing or BS-PROOF did not create it. Do not replace it. Apply docs/research-jobs.sql first.', fn;
    end if;
  end loop;

  select j.id::text into stranded
  from public.bsproof_research_jobs j
  where j.status = 'queued' and j.attempts >= 1
  limit 1;
  if stranded is not null then
    raise exception 'job % is queued with attempts >= 1 (requeued by the old retry policy) and would never be claimed under one attempt. Let it finish under the old policy first (see the PREFLIGHT / DRAIN notes); nothing was changed.', stranded;
  end if;
end
$guard$;

-- Claim: the oldest queued job, or the oldest running job whose lease has expired -- ONE attempt per job.
create or replace function public.bsproof_research_claim(p_lease_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  j public.bsproof_research_jobs;
  token text;
  lease integer := least(greatest(coalesce(p_lease_seconds, 300), 30), 900);
begin
  -- A job whose final attempt's lease ran out can never be claimed again: fail it.
  -- (One attempt per job: the first attempt is the final one.)
  update public.bsproof_research_jobs
  set status = 'failed', failure_code = 'lease_expired',
      failure_message = 'the lease expired on the final attempt',
      lease_token_hash = null, lease_expires_at = null,
      completed_at = now(), updated_at = now()
  where status = 'running' and lease_expires_at <= now() and attempts >= 1;

  select * into j
  from public.bsproof_research_jobs
  where attempts < 1
    and (status = 'queued' or (status = 'running' and lease_expires_at <= now()))
  order by created_at, id
  limit 1
  for update skip locked;
  if not found then
    return jsonb_build_object('job', null);
  end if;

  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.bsproof_research_jobs
  set status = 'running',
      attempts = attempts + 1,
      lease_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'),
      lease_expires_at = now() + make_interval(secs => lease),
      claimed_at = now(),
      updated_at = now()
  where id = j.id
  returning * into j;

  return jsonb_build_object('job', jsonb_build_object(
    'id', j.id, 'lease_token', token, 'target', j.target, 'prompt_version', j.prompt_version));
end
$fn$;

-- Fail: only the current valid lease can fail a running job; it is final -- ONE attempt per job. Never overwrites a completion.
create or replace function public.bsproof_research_fail(p_id uuid, p_lease_token text, p_code text, p_message text, p_retryable boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  j public.bsproof_research_jobs;
  h text := encode(sha256(convert_to(coalesce(p_lease_token, ''), 'UTF8')), 'hex');
  code text := case when p_code ~ '^[a-z0-9_]{1,64}$' then p_code else 'worker_failed' end;
  message text := left(p_message, 300);
begin
  select * into j from public.bsproof_research_jobs where id = p_id for update;
  if not found or j.lease_token_hash is distinct from h then
    return jsonb_build_object('status', 'lease_invalid');
  end if;

  if j.status = 'succeeded' then
    return jsonb_build_object('status', 'already_completed');
  end if;
  if j.status = 'failed' then
    return jsonb_build_object('status', 'already_failed');
  end if;
  if j.status <> 'running' or j.lease_expires_at <= now() then
    return jsonb_build_object('status', 'lease_invalid');
  end if;

  -- One attempt per job: a running job always has attempts >= 1, so this never requeues and the
  -- `retryable` flag cannot buy a second model run. Kept (as `< 1`) so the policy is one literal.
  if coalesce(p_retryable, false) and j.attempts < 1 then
    update public.bsproof_research_jobs
    set status = 'queued', lease_token_hash = null, lease_expires_at = null,
        failure_message = message, updated_at = now()
    where id = p_id;
    return jsonb_build_object('status', 'requeued');
  end if;

  -- The token hash is kept so an identical retry of this fail is 'already_failed'.
  update public.bsproof_research_jobs
  set status = 'failed', failure_code = code, failure_message = message,
      lease_expires_at = null, completed_at = now(), updated_at = now()
  where id = p_id;
  return jsonb_build_object('status', 'failed');
end
$fn$;

-- The grants, revokes, owner, comment and search_path of both functions are those of the existing
-- functions (create or replace keeps them); this file deliberately issues no grant, revoke or comment.
