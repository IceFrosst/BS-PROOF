-- BS-PROOF website -> PC research queue. Run once in Supabase: SQL Editor -> New query.
-- NOT RUN YET (written 2026-10-03). Nothing applies this file automatically: not the
-- app, not CI, not a deploy. Apply it once, deliberately, after review.
--
-- Idempotent for ITS OWN objects: re-running against a project this file has already
-- provisioned is safe (create ... if not exists, create or replace function, revoke,
-- grant). It REFUSES to run next to objects it did not create -- see the guard.
--
-- What this is for: a signed-in person asks for a live-source research audit of one
-- of their saved scans (POST /api/scan/research/). The website records that request
-- here; a worker on the founder's main PC (no public port) polls
-- POST /api/scan/research/worker/, runs the audit through the founder's Claude
-- SUBSCRIPTION (no API key, no metered spend, no per-job auth budget) and posts the
-- result back. Nothing in the web app calls a model for this. Contract and
-- semantics: lib/scan-research/contract.ts.
--
-- WHAT IT TOUCHES. One new table, public.bsproof_research_jobs, and eight new
-- functions named public.bsproof_research_*. It does not alter, drop, delete,
-- truncate or grant on any other table (scan_runs, scan_users, the portfolio schemas),
-- creates no extension and no role, creates no policy, and touches nothing in the
-- auth schema, the storage schema or any storage policy.
--
-- PRIVACY MODEL. RLS is enabled with NO policy, and every privilege on the table is
-- revoked from public, anon, authenticated AND service_role: the table cannot be read
-- or written over PostgREST by anyone. The only door is the six service-role-only
-- functions below (SECURITY DEFINER, search_path pinned, EXECUTE revoked from public /
-- anon / authenticated and granted to service_role alone). They are called only from
-- server code that holds SUPABASE_SERVICE_ROLE_KEY. The service role bypasses RLS, so
-- the owner filter (`owner_id = <Supabase-verified user>`) is inside bsproof_research_get
-- / _enqueue themselves, never left to the caller.
--
-- PREFLIGHT. This Supabase project is SHARED with other apps. In a separate query,
-- first run (read-only):
--     select to_regclass('public.bsproof_research_jobs');
--     select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname ~ '^bsproof_research_';
-- First provisioning: the table is NULL and no function is listed. Anything already
-- there that BS-PROOF did not create belongs to someone else: STOP, do not adopt it.
-- The guard below re-checks this and aborts the whole script before creating anything.
--
-- ORDER OF RELEASE: (1) apply this file; (2) set BS_PROOF_RESEARCH_WORKER_TOKEN (>= 32
-- random characters) in Vercel and on the PC; (3) start the PC worker; (4) only then
-- set SCAN_LIVE_RESEARCH_ENABLED=1. With the flag off nobody can enqueue.
--
-- JOB LIFECYCLE. queued -> running (claim, lease 300 s, attempts+1) -> succeeded | failed.
--   * ONE ATTEMPT PER JOB (user decision 2026-10-06; the 2026-10-04 revision allowed 3). A job is
--     claimed once and its model run is never repeated automatically: an expired lease is NOT
--     re-claimed (the next claim turns it into failed('lease_expired')) and a posted fail is final
--     whatever its `retryable` flag says. A project provisioned from the 2026-10-04 revision
--     (sha256 48783cd3...) is moved to this policy by docs/research-jobs-migration-001-one-attempt.sql, and
--     to the v0.4 prompt version (bsproof_research_complete accepts v0.4, v0.3 and v0.2) by
--     docs/research-jobs-migration-002-prompt-v0.4.sql.
--   * Lease: a random 64-hex token returned ONCE by claim; only its SHA-256 is stored.
--     heartbeat extends it for as long as the (single) run is alive; an expired lease is
--     never given a second run, and its token is dead.
--   * complete / fail / heartbeat are single atomic compare-and-set statements on
--     (id, token hash, status = 'running', lease not expired). First valid completion
--     wins; an identical retry is 'already_completed'; a different result is 'conflict';
--     a stale 'fail' can never overwrite a completion; succeeded and failed are final
--     (a trigger refuses any later change to identity, target, result or terminal status).
--   * Idempotent enqueue: one job per (owner_id, scan_id). A repeat returns the existing
--     job, even if failed or its prompt version is obsolete: there is deliberately no
--     reset/research-again path. A product migration must explicitly choose if that ever
--     changes. At most 3 open (queued/running) jobs per owner, the only queue cap; the
--     subscription worker has no per-job runtime/token budget.
--   * Retention: jobs are kept indefinitely, like scan_runs. There is no expiry job and
--     no deletion endpoint; removing one is a manual operator action.

do $guard$
declare
  foreign_fn text;
  foreign_object text;
begin
  if to_regclass('public.bsproof_research_jobs') is not null
     and coalesce(obj_description(to_regclass('public.bsproof_research_jobs'), 'pg_class'), '') !~ '^BS-PROOF research jobs:' then
    raise exception 'public.bsproof_research_jobs already exists and BS-PROOF did not create it. Do not adopt it. See PREFLIGHT.';
  end if;

  select p.oid::regprocedure::text into foreign_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname ~ '^bsproof_research_'
    and coalesce(obj_description(p.oid, 'pg_proc'), '') !~ '^BS-PROOF research jobs:'
  limit 1;
  if foreign_fn is not null then
    raise exception 'function % already exists and BS-PROOF did not create it. Do not replace it. See PREFLIGHT.', foreign_fn;
  end if;

  select c.oid::regclass::text into foreign_object
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'bsproof_research_jobs_open_idx' and c.relkind = 'i'
    and not exists (select 1 from pg_index i where i.indexrelid = c.oid and i.indrelid = to_regclass('public.bsproof_research_jobs'))
  limit 1;
  if foreign_object is not null then
    raise exception 'index % already exists outside BS-PROOF research jobs. Do not replace it.', foreign_object;
  end if;

  select t.tgname into foreign_object from pg_trigger t
  where t.tgname = 'bsproof_research_jobs_guard' and not t.tgisinternal
    and t.tgrelid <> coalesce(to_regclass('public.bsproof_research_jobs')::oid, 0)
  limit 1;
  if foreign_object is not null then
    raise exception 'trigger % already exists on another relation. Do not replace it.', foreign_object;
  end if;
end
$guard$;

create table if not exists public.bsproof_research_jobs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null,
  scan_id          uuid not null,
  status           text not null default 'queued'
                   check (status in ('queued', 'running', 'succeeded', 'failed')),
  prompt_version   text not null check (char_length(prompt_version) between 1 and 120),
  -- ResearchJobV1, derived on the server from the owner's saved scan. Immutable (trigger).
  target           jsonb not null
                   check (jsonb_typeof(target) = 'object' and octet_length(target::text) <= 65536),
  attempts         integer not null default 0 check (attempts >= 0),
  -- SHA-256 hex of the current lease token; the token itself is never stored.
  lease_token_hash text check (lease_token_hash ~ '^[0-9a-f]{64}$'),
  lease_expires_at timestamptz,
  claimed_at       timestamptz,
  -- { audit, source_access summary, provenance }: validated by the app before it gets here.
  result           jsonb
                   check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 1048576)),
  failure_code     text check (failure_code ~ '^[a-z0-9_]{1,64}$'),
  -- Operator-only. Never returned to the job's owner.
  failure_message  text check (char_length(failure_message) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  constraint bsproof_research_jobs_owner_scan_key unique (owner_id, scan_id),
  constraint bsproof_research_jobs_result_matches_status check ((status = 'succeeded') = (result is not null)),
  constraint bsproof_research_jobs_running_has_lease
    check (status <> 'running' or (lease_token_hash is not null and lease_expires_at is not null))
);

comment on table public.bsproof_research_jobs is
  'BS-PROOF research jobs: private website->PC research queue. RLS on, no policies, no direct privileges; reachable only through the bsproof_research_* service-role functions. See docs/research-jobs.sql.';

create index if not exists bsproof_research_jobs_open_idx
  on public.bsproof_research_jobs (created_at, id)
  where status in ('queued', 'running');

alter table public.bsproof_research_jobs enable row level security;

revoke all on table public.bsproof_research_jobs from public, anon, authenticated, service_role;

-- Identity, target and terminal states are final.
create or replace function public.bsproof_research_jobs_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.id is distinct from old.id
     or new.owner_id is distinct from old.owner_id
     or new.scan_id is distinct from old.scan_id
     or new.target is distinct from old.target
     or new.prompt_version is distinct from old.prompt_version
     or new.created_at is distinct from old.created_at then
    raise exception 'bsproof_research_jobs: identity and target are immutable';
  end if;
  if old.status in ('succeeded', 'failed')
     and (new.status is distinct from old.status
          or new.result is distinct from old.result
          or new.failure_code is distinct from old.failure_code) then
    raise exception 'bsproof_research_jobs: a finished job is final';
  end if;
  return new;
end
$fn$;
comment on function public.bsproof_research_jobs_guard() is 'BS-PROOF research jobs: immutability trigger.';

do $trg$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'bsproof_research_jobs_guard'
      and tgrelid = 'public.bsproof_research_jobs'::regclass
  ) then
    create trigger bsproof_research_jobs_guard
      before update on public.bsproof_research_jobs
      for each row execute function public.bsproof_research_jobs_guard();
  end if;
end
$trg$;

-- The owner-facing projection. An explicit field list, so a column added later is not exposed.
create or replace function public.bsproof_research_view(j public.bsproof_research_jobs)
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'id', j.id,
    'scan_id', j.scan_id,
    'status', j.status,
    'prompt_version', j.prompt_version,
    'target', j.target,
    'created_at', j.created_at,
    'updated_at', j.updated_at,
    'completed_at', j.completed_at,
    'failure_code', case when j.status = 'failed' then j.failure_code end,
    'result', case when j.status = 'succeeded' then j.result end
  )
$fn$;
comment on function public.bsproof_research_view(public.bsproof_research_jobs) is 'BS-PROOF research jobs: owner-facing projection.';

-- Enqueue: idempotent per (owner, scan); capped open jobs per owner.
create or replace function public.bsproof_research_enqueue(p_owner uuid, p_scan uuid, p_target jsonb, p_prompt_version text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  j public.bsproof_research_jobs;
  open_jobs integer;
begin
  if p_owner is null or p_scan is null or p_prompt_version is null
     or p_target is null or jsonb_typeof(p_target) <> 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into j from public.bsproof_research_jobs where owner_id = p_owner and scan_id = p_scan;
  if found then
    return jsonb_build_object('status', 'existing', 'job', public.bsproof_research_view(j));
  end if;

  -- Serialise this owner's inserts so two simultaneous requests cannot both pass the cap.
  perform pg_advisory_xact_lock(hashtextextended('bsproof_research_enqueue:' || p_owner::text, 0));
  select * into j from public.bsproof_research_jobs where owner_id = p_owner and scan_id = p_scan;
  if found then
    return jsonb_build_object('status', 'existing', 'job', public.bsproof_research_view(j));
  end if;

  select count(*) into open_jobs
  from public.bsproof_research_jobs
  where owner_id = p_owner and status in ('queued', 'running');
  if open_jobs >= 3 then
    return jsonb_build_object('status', 'busy');
  end if;

  insert into public.bsproof_research_jobs (owner_id, scan_id, prompt_version, target)
  values (p_owner, p_scan, p_prompt_version, p_target)
  on conflict (owner_id, scan_id) do nothing
  returning * into j;
  if not found then
    select * into j from public.bsproof_research_jobs where owner_id = p_owner and scan_id = p_scan;
    return jsonb_build_object('status', 'existing', 'job', public.bsproof_research_view(j));
  end if;
  return jsonb_build_object('status', 'created', 'job', public.bsproof_research_view(j));
end
$fn$;
comment on function public.bsproof_research_enqueue(uuid, uuid, jsonb, text) is 'BS-PROOF research jobs: idempotent enqueue.';

-- Owner-filtered read. Someone else's job and a missing job are indistinguishable: {"job": null}.
create or replace function public.bsproof_research_get(p_owner uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  j public.bsproof_research_jobs;
begin
  select * into j from public.bsproof_research_jobs where id = p_id and owner_id = p_owner;
  if not found then
    return jsonb_build_object('job', null);
  end if;
  return jsonb_build_object('job', public.bsproof_research_view(j));
end
$fn$;
comment on function public.bsproof_research_get(uuid, uuid) is 'BS-PROOF research jobs: owner-filtered read.';

-- Claim: the oldest queued job, or the oldest running job whose lease has expired.
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
comment on function public.bsproof_research_claim(integer) is 'BS-PROOF research jobs: atomic claim with lease.';

-- Heartbeat: extends a lease that is still valid. Atomic; an expired lease cannot be revived.
create or replace function public.bsproof_research_heartbeat(p_id uuid, p_lease_token text, p_lease_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  expires timestamptz;
  lease integer := least(greatest(coalesce(p_lease_seconds, 300), 30), 900);
begin
  update public.bsproof_research_jobs
  set lease_expires_at = now() + make_interval(secs => lease), updated_at = now()
  where id = p_id
    and status = 'running'
    and lease_token_hash = encode(sha256(convert_to(coalesce(p_lease_token, ''), 'UTF8')), 'hex')
    and lease_expires_at > now()
  returning lease_expires_at into expires;
  if not found then
    return jsonb_build_object('status', 'lease_invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'lease_expires_at', expires);
end
$fn$;
comment on function public.bsproof_research_heartbeat(uuid, text, integer) is 'BS-PROOF research jobs: lease renewal.';

-- Complete: compare-and-set on the current lease; idempotent for an identical retry.
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

  -- v0.4 is stamped on new jobs; v0.3 and v0.2 stay completable so a job queued before the upgrade is not lost.
  if j.prompt_version not in ('live-research-v0.4', 'live-research-v0.3', 'live-research-v0.2') then
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
comment on function public.bsproof_research_complete(uuid, text, jsonb) is 'BS-PROOF research jobs: compare-and-set completion.';

-- Fail: only the current valid lease can fail a running job. Never overwrites a completion.
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
comment on function public.bsproof_research_fail(uuid, text, text, text, boolean) is 'BS-PROOF research jobs: lease-checked failure.';

-- Narrow grants: the six API functions to service_role alone; the two helpers to nobody.
revoke all on function public.bsproof_research_jobs_guard() from public, anon, authenticated, service_role;
revoke all on function public.bsproof_research_view(public.bsproof_research_jobs) from public, anon, authenticated, service_role;

revoke all on function public.bsproof_research_enqueue(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.bsproof_research_get(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bsproof_research_claim(integer) from public, anon, authenticated;
revoke all on function public.bsproof_research_heartbeat(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.bsproof_research_complete(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.bsproof_research_fail(uuid, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.bsproof_research_enqueue(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.bsproof_research_get(uuid, uuid) to service_role;
grant execute on function public.bsproof_research_claim(integer) to service_role;
grant execute on function public.bsproof_research_heartbeat(uuid, text, integer) to service_role;
grant execute on function public.bsproof_research_complete(uuid, text, jsonb) to service_role;
grant execute on function public.bsproof_research_fail(uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
