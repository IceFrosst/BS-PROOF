-- BS-PROOF waitlist table. Run once in Supabase: SQL Editor -> New query.
--
-- Four decisions worth keeping, none of them cosmetic:
--
-- 1. citext, not text. Postgres text is case-sensitive, so 'Aykhan@x.com' and
--    'aykhan@x.com' would be two rows and two emails to one person. The API
--    lowercases before inserting, but the column should not depend on the
--    application getting that right forever.
--
-- 2. UNIQUE on email. This is what makes a second signup a friendly "you're
--    already on the list" instead of a duplicate row. Without it the API
--    cannot tell the difference, because it detects the unique violation the
--    database raises.
--
-- 3. RLS ON with no policy for anon. The API writes with the SERVICE ROLE key,
--    which bypasses RLS; nothing else should reach this table. Leaving RLS off
--    would let anyone holding the (public, browser-visible) anon key read
--    every address collected at the stand.
--
-- 4. Only what we will actually use. Email, where they came from, when. No IP,
--    no user agent. This is a conference stand in the EU and every extra
--    column is personal data someone has to justify later.

create extension if not exists citext;

create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       citext      not null unique,
  source      text,
  created_at  timestamptz not null default now()
);

comment on table  public.waitlist        is 'Email signups from the QR roll-up and the site.';
comment on column public.waitlist.source is 'qr | web | stand, or null when unrecognised.';

-- Newest-first is the only way this is ever read.
create index if not exists waitlist_created_at_idx
  on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;

-- Deliberately NO policies. With RLS enabled and no policy, the anon and
-- authenticated roles can do nothing at all; the service role key used by
-- /api/waitlist bypasses RLS and is the only way in. If you later want signups
-- straight from the browser, add a narrow insert-only policy -- never a select
-- one, or the list becomes public.

-- Read the list:
--   select email, source, created_at from public.waitlist order by created_at desc;
-- Count it:
--   select count(*) from public.waitlist;
-- Export for a mailout:
--   copy (select email from public.waitlist order by created_at) to stdout with csv header;
