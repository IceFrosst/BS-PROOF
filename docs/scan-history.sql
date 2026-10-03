-- BS-PROOF scan-run history. Run once in Supabase: SQL Editor -> New query.
-- Idempotent for ITS OWN objects: re-running against a project this file has
-- already provisioned is safe (create ... if not exists, add column if not
-- exists, insert ... on conflict do nothing, revoke). It REFUSES to run
-- against objects it did not create -- see PREFLIGHT below.
--
-- What this is for: POST /api/scan writes one row per ACCEPTED manual or
-- photo run (lib/scan-history/store.ts) so a signed-in person can reopen what
-- the product actually answered for THEIR runs, and so the owner can inspect
-- a specific run. It is written AND read with the SERVICE ROLE key from the
-- server only -- never from a browser. There is deliberately no read policy
-- and no public read path: the only application read is the owner-filtered,
-- Google-authenticated GET /api/scan/history[/id] (lib/scan-history/reader.ts),
-- which puts `user_id = <Supabase-verified user>` in every query. The service
-- role bypasses RLS, so that application filter IS the access control; the
-- anon and authenticated roles see nothing at all.
--
-- OWNERSHIP (2026-10-03): `user_id` / `user_email` are bound ONCE, at INSERT,
-- by POST /api/scan from the Supabase-verified caller. No application code
-- UPDATEs them afterwards (POST /api/scan/claim only verifies an already-owned
-- run), and a row inserted without an owner (a legacy or anonymous local/test
-- run) keeps a null `user_id` and is never readable through the history API.
--
-- This file is NEVER run by the app or CI. Apply it once, deliberately, in the
-- Supabase SQL Editor after reviewing it. It creates, alters and revokes only;
-- it drops, deletes and truncates nothing, creates no extension, no policy and
-- no role, and touches nothing in the auth schema or the Google provider.
--
-- ===========================================================================
-- PREFLIGHT -- THE SUPABASE PROJECT IS SHARED WITH OTHER APPS. Do this first.
-- ===========================================================================
-- The project this app signs people in with also holds other applications'
-- tables, buckets and storage policies. Everything below is scoped to the
-- names `public.scan_runs`, `public.scan_users` and the bucket `scan-images`,
-- and `create table if not exists` / `on conflict do nothing` would otherwise
-- quietly ADOPT a same-named object that belongs to someone else (and then
-- enable RLS on it, or leave a public bucket public). So:
--
--   A. In a SEPARATE SQL Editor query, run the three read-only checks below and
--      keep their output with the release record. They change nothing.
--
--        select to_regclass('public.scan_runs')  as scan_runs,
--               to_regclass('public.scan_users') as scan_users;
--        select id, name, public, owner_id, created_at
--          from storage.buckets where id = 'scan-images';
--        select policyname, permissive, roles, cmd, qual, with_check
--          from pg_policies where schemaname = 'storage' and tablename = 'objects'
--          order by policyname;
--
--   B. Read the results.
--        * First provisioning: BOTH `to_regclass` values must be NULL and the
--          bucket query must return NO rows. If any `scan_*` table or the
--          `scan-images` bucket already exists and BS-PROOF did not create it,
--          it belongs to another app: STOP. Do NOT adopt it, do NOT rename or
--          drop it. Pick a different, prefixed name (a code change in
--          lib/scan-history/*, then a fresh review) instead.
--        * Re-running after BS-PROOF's own earlier run: the tables exist and
--          carry the `BS-PROOF scan history:` comment below (or the older
--          comment an earlier revision of this file wrote), and `scan-images`
--          exists with public = false. That is fine.
--        * Every `storage.objects` policy must name its bucket in `qual` /
--          `with_check` (`bucket_id = '<some other bucket>'`). A policy for
--          `anon` / `authenticated` / `public` with NO bucket_id predicate
--          applies to EVERY bucket, including `scan-images`, and would expose
--          its photos to any signed-in user of the project. Do not apply this
--          file until the owner of that policy has scoped it. This file never
--          creates, alters or drops a storage policy, so another app's
--          policies are never clobbered; it only refuses to run next to an
--          unscoped one.
--
--   C. The guard block just below re-checks A and B inside the same run and
--      RAISES (aborting the whole script before anything is created) when it
--      finds a foreign `scan_*` table, a pre-existing `scan-images` bucket
--      that is public or that this file did not create, or an unscoped
--      storage.objects policy. The guard is a safety net, not a substitute for
--      reading A: its policy test is a text match on `bucket_id`, which cannot
--      judge a predicate that names the bucket but still lets everyone in.
--
-- ORDER OF RELEASE: run this file FIRST, then set the Vercel environment
-- variables (SCAN_REQUIRE_AUTH, SCAN_HISTORY_REQUIRED, SUPABASE_URL, ...). With
-- the variables set and these tables missing, every scan spends its model call
-- and then fails to record. See docs/SYSTEM_DESIGN.md section 7a.
--
-- RETENTION (plain statement; nothing here is a promise): every accepted scan
-- is kept INDEFINITELY -- the full result, the signed-in person's Google email
-- (`scan_runs.user_email`) and, for a photo scan, the original photo in the
-- private bucket. There is NO expiry job, NO deletion endpoint and NO "delete
-- my data" control. Removing a person's data today means the project owner
-- deleting rows and storage objects by hand in the Supabase dashboard. No
-- notice of this is shown in the app yet; deciding the notice and building a
-- deletion path are owner decisions that are still open.
--
-- Five decisions worth keeping, none of them cosmetic:
--
-- 1. A PRIVATE storage bucket for photos, never the database. `scan_runs`
--    stores the bucket name, the object path, the MIME type, the byte count
--    and a SHA-256 -- never base64, never the bytes. Storage is for bytes;
--    Postgres is for facts about them.
--
-- 2. RLS ON everywhere, no anon policies -- identical discipline to
--    docs/waitlist.sql. The API writes with the SERVICE ROLE key, which
--    bypasses RLS; nothing else (the anon key, a browser, PostgREST's default
--    role) can read, write or list a single row or a single object.
--
-- 3. The run id is generated by the app BEFORE analysis (crypto.randomUUID)
--    and reused as both the primary key and the storage path prefix, so a row
--    and its image can never point at different runs.
--
-- 4. `analysis` holds the COMPLETE ScanAnalysis JSON the caller received --
--    not a summary -- because the point of this table is to let the owner see
--    exactly what a specific run answered, including every basis, arc and
--    caveat. `request` holds only what was asked (the typed body, or the
--    photo's content-type/size) -- never image bytes.
--
-- 5. `app_version` is the exact release identity: the deployed package
--    version plus, on Vercel, the git commit SHA, ref, deployment id,
--    environment and URL. A behaviour change in the app is traceable to the
--    exact commit that produced a given row.

-- No `create extension` here, on purpose: the app generates every id itself
-- (crypto.randomUUID), so nothing in this file needs an extension, and
-- creating one in a shared project can install its functions into `public`,
-- where PostgREST would expose them.

-- GUARD (see PREFLIGHT C). Aborts the whole script, before anything below
-- runs, when this file would otherwise adopt another app's objects or sit next
-- to a policy that exposes every bucket. Read-only: it only selects.
do $guard$
declare
  bucket_public boolean;
  unscoped      text;
begin
  -- BS-PROOF's own tables carry its table comment. The two older wordings are
  -- what earlier revisions of this very file wrote, so a project provisioned
  -- before this guard existed is still recognised as ours.
  if to_regclass('public.scan_runs') is not null
     and coalesce(obj_description(to_regclass('public.scan_runs'), 'pg_class'), '') !~ '^(BS-PROOF scan history:|One row per accepted POST /api/scan run)' then
    raise exception 'public.scan_runs already exists and is not BS-PROOF''s (no BS-PROOF table comment). It belongs to another app: do not adopt it. See PREFLIGHT.';
  end if;
  if to_regclass('public.scan_users') is not null
     and coalesce(obj_description(to_regclass('public.scan_users'), 'pg_class'), '') !~ '^(BS-PROOF scan history:|One row per Google-signed-in visitor to /scan)' then
    raise exception 'public.scan_users already exists and is not BS-PROOF''s (no BS-PROOF table comment). It belongs to another app: do not adopt it. See PREFLIGHT.';
  end if;

  select b.public into bucket_public from storage.buckets b where b.id = 'scan-images';
  if found then
    if bucket_public then
      raise exception 'storage bucket scan-images already exists and is PUBLIC. This file never leaves a public bucket public and never changes another app''s bucket. See PREFLIGHT.';
    end if;
    if to_regclass('public.scan_runs') is null then
      raise exception 'storage bucket scan-images already exists but BS-PROOF''s public.scan_runs does not, so the bucket is not ours. Do not adopt it. See PREFLIGHT.';
    end if;
  end if;

  select string_agg(p.policyname, ', ' order by p.policyname) into unscoped
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.permissive = 'PERMISSIVE'
    and p.roles && array['public', 'anon', 'authenticated']::name[]
    and coalesce(p.qual, '') !~* 'bucket_id'
    and coalesce(p.with_check, '') !~* 'bucket_id';
  if unscoped is not null then
    raise exception 'storage.objects has policies for anon/authenticated/public that name no bucket_id (%). They apply to every bucket, including scan-images. Have their owner scope them, then re-run. See PREFLIGHT.', unscoped;
  end if;
end
$guard$;

create table if not exists public.scan_runs (
  id               uuid primary key,                 -- generated by the app before analysis (crypto.randomUUID)
  created_at       timestamptz not null default now(),
  source           text        not null check (source in ('photo', 'manual')),
  status           text        not null,              -- terminal ScanAnalysis.status, or a route-level failure code
  error            text,                              -- ScanAnalysis.error, when the run ended in one
  request          jsonb       not null,               -- request facts/metadata; NEVER image bytes or base64
  analysis         jsonb,                              -- the COMPLETE ScanAnalysis JSON returned to the caller
  app_version      jsonb       not null,               -- { package_version, git_sha, git_ref, deployment_id, vercel_env, url }
  image_bucket     text,                               -- set only for a photo run whose image was stored
  image_path       text,                               -- "<run_id>/original.<ext>" inside image_bucket
  image_mime_type  text,
  image_bytes      bigint,
  image_sha256     text,
  image_status     text        check (image_status in ('stored', 'unavailable', 'failed', 'not_applicable'))
);

comment on table  public.scan_runs               is 'BS-PROOF scan history: one row per accepted POST /api/scan run (photo or manual). Server-write only; no anon policy, no public read path. Kept indefinitely; no deletion job.';
comment on column public.scan_runs.request       is 'Request facts/metadata only -- for a photo, content_type + size_bytes; for manual, the typed body. Never image bytes or base64.';
comment on column public.scan_runs.analysis      is 'The complete ScanAnalysis JSON as built by analyzeScan/analyzeManual -- not a summary. run_id, app_version and persistence live in their own columns (id, app_version, image_*), and are attached to the HTTP response only.';
comment on column public.scan_runs.app_version   is 'Exact app release identity at the time of the run: package.json version plus Vercel git SHA/ref/deployment/environment/URL where available.';
comment on column public.scan_runs.image_status  is 'stored | unavailable (not configured) | failed | not_applicable (manual run, no image). Never "stored" unless the upload actually succeeded.';

-- The only two ways this table is ever read: newest-first, and filtered by
-- outcome. Both need an index or a growing table makes the SQL editor slow.
create index if not exists scan_runs_created_at_idx on public.scan_runs (created_at desc);
create index if not exists scan_runs_status_idx      on public.scan_runs (status);
create index if not exists scan_runs_source_idx      on public.scan_runs (source);

-- 2026-09-16: EMAIL CAPTURE. Google sign-in (founder: "people log in once so
-- we capture their email"). Idempotent ALTER, so re-running this file against
-- an already-provisioned project is safe. 2026-10-03: these columns are now
-- written at INSERT by POST /api/scan from the Supabase-verified caller (see
-- the OWNERSHIP note above), not attached afterwards by /api/scan/claim.
alter table public.scan_runs add column if not exists user_id    uuid;
alter table public.scan_runs add column if not exists user_email text;

comment on column public.scan_runs.user_id    is 'auth.users id of the Supabase-verified caller who made this run, bound at INSERT by POST /api/scan. Null for a legacy or anonymous run; such a row is never readable through the history API and is never assigned an owner afterwards.';
comment on column public.scan_runs.user_email is 'Denormalised copy of the owner''s email at the time of the run (as reported by Supabase Auth, never by the client), so a row is inspectable without joining auth.users. This column, not scan_users, is where signed-in emails are kept. Retained indefinitely.';

create index if not exists scan_runs_user_email_idx on public.scan_runs (user_email);

-- The history API's only query shape: one owner's newest runs, and one owner's
-- run by id. Partial, so unowned legacy/anonymous rows are not indexed at all.
create index if not exists scan_runs_user_created_idx on public.scan_runs (user_id, created_at desc, id desc) where user_id is not null;

alter table public.scan_runs enable row level security;

-- Deliberately NO policies. With RLS enabled and no policy, the anon and
-- authenticated roles can do nothing at all; the service role key used by
-- lib/scan-history/store.ts bypasses RLS and is the only way in. Do not add a
-- select policy here -- that is what would turn every scan a stranger ran
-- into public data.
--
-- And a second, independent wall: Supabase's default privileges grant new
-- `public` tables to `anon` and `authenticated`, which leaves RLS-with-no-
-- policies as the ONLY barrier (one careless `enable row level security` or
-- `create policy` later and it is gone). Taking the table privileges away makes
-- the roles unable to touch the table at all. Additive and private: it removes
-- only what this file's own tables were handed, grants nothing to anyone, and
-- never touches the service role (which bypasses both).
revoke all on table public.scan_runs from anon, authenticated;

-- The private bucket for original photos. `public = false` is the whole
-- point: no object in this bucket is ever reachable by an unsigned URL, and
-- this app never mints a signed one -- there is no read/download feature.
insert into storage.buckets (id, name, public)
values ('scan-images', 'scan-images', false)
on conflict (id) do nothing;

-- Deliberately NO storage.objects policies for this bucket either. The
-- service role bypasses storage RLS the same way it bypasses table RLS, so an
-- upload/delete from lib/scan-history/store.ts works with no policy at all;
-- adding an anon policy here would be the one line that makes a private
-- bucket readable from a browser. Other apps' storage policies are neither
-- created, changed nor dropped by this file (see PREFLIGHT B); the guard above
-- only refuses to run beside one that names no bucket.

-- Read one run (including its image's location, not its bytes) -- this is the
-- OWNER's view in the SQL Editor; the app's history API never returns the
-- image location, the request or the email:
--   select id, created_at, source, status, image_bucket, image_path, image_sha256
--   from public.scan_runs order by created_at desc limit 20;
-- Find every failed run:
--   select id, created_at, source, status, error from public.scan_runs
--   where status not in ('scored', 'not_scored', 'form_not_scored', 'ingredient_not_supported')
--   order by created_at desc;
-- Fetch a stored photo's bytes (service role key required, e.g. from the
-- Supabase dashboard's Storage browser, never from this app):
--   Storage -> scan-images -> <image_path>.


-- ---------------------------------------------------------------------------
-- scan_users (2026-09-16): OPTIONAL and, today, EMPTY. The only writer is
-- `POST /api/scan/claim` (service role, lib/auth/claim.ts), which verifies a
-- Supabase session AND that the run is already owned by that user, then upserts
-- one row per person. NOTHING IN THE UI CALLS IT any more (2026-10-03: sign-in
-- gates the scan and the owner is bound at INSERT, so there is no "claim" step),
-- so this table is not populated by the app and nothing reads it. A signed-in
-- person's email is kept in `scan_runs.user_email` -- that is the one place to
-- look. The table is kept only because the route and its tests still exist; if
-- they are ever deleted, drop this table with them. If the route is ever called,
-- `scans` is recomputed as the exact number of `scan_runs` the user owns (a
-- count query, not read-then-increment), so repeating a claim cannot double
-- count.
create table if not exists public.scan_users (
  user_id        uuid primary key,                 -- auth.users.id (Supabase-managed; not a foreign key here so this table survives independently of the auth schema's own migrations)
  email          text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  scans          integer     not null default 0     -- number of scan_runs owned by this user, recomputed on claim; see note above
);

comment on table  public.scan_users            is 'BS-PROOF scan history: optional, currently unpopulated (no UI calls POST /api/scan/claim; emails live in scan_runs.user_email). Server-write only; no anon policy, no public read path.';
comment on column public.scan_users.scans      is 'Number of scan_runs owned by this user, recomputed from a count query on each claim (idempotent -- never incremented).';

create index if not exists scan_users_email_idx on public.scan_users (email);

alter table public.scan_users enable row level security;

-- Deliberately NO policies here either -- identical discipline to scan_runs
-- above. A signed-in user reading their OWN row would need an explicit
-- policy this project does not grant; there is no user-facing "my account"
-- page, so nothing needs it.
revoke all on table public.scan_users from anon, authenticated;

-- Who has scanned, most recent first, WITH THEIR EMAIL (scan_users is empty
-- today; this is the real list -- ownerless anonymous runs are excluded):
--   select user_id, max(user_email) as email, min(created_at) as first_scan,
--          max(created_at) as last_scan, count(*) as scans
--   from public.scan_runs where user_id is not null
--   group by user_id order by last_scan desc limit 50;
