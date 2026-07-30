-- Member import staging (from ClientClub general + welfare CSVs)
-- Run in Supabase SQL Editor (after 001 schema is in place).
-- Then load members via backups/migration-ready/import_members.sql (do NOT paste the CSV here)
--
-- Association membership (general list) and welfare membership are SEPARATE.
-- plan values:
--   basic  = association / Standard only
--   welfare = welfare only
--   both   = on both lists (holds both memberships — not converted to welfare-only)
--
-- Safe to re-run: does NOT drop existing member_imports data.

create table if not exists public.member_imports (
  id uuid primary key default gen_random_uuid(),
  member_number text unique,
  full_name text not null,
  first_name text,
  last_name text,
  email text not null,
  phone text,
  association_member boolean not null default false,
  welfare_member boolean not null default false,
  plan text not null check (plan in ('basic', 'welfare', 'both')),
  membership_label text,
  status text not null default 'pending_invite'
    check (status in ('pending_invite', 'invited', 'active', 'skipped')),
  source_contact_ids text,
  source_created_at timestamptz,
  tags text,
  auth_user_id uuid references auth.users (id) on delete set null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_imports_has_membership
    check (association_member or welfare_member)
);

create unique index if not exists member_imports_email_idx
  on public.member_imports (lower(email));

alter table public.member_imports enable row level security;

revoke all on table public.member_imports from anon, authenticated;
grant all on table public.member_imports to service_role;

create or replace view public.member_import_stats as
select
  count(*) as total,
  count(*) filter (where association_member and not welfare_member) as association_only,
  count(*) filter (where welfare_member and not association_member) as welfare_only,
  count(*) filter (where association_member and welfare_member) as association_and_welfare,
  count(*) filter (where association_member) as association_member_total,
  count(*) filter (where welfare_member) as welfare_member_total,
  count(*) filter (where status = 'pending_invite') as pending_invite,
  count(*) filter (where phone is not null and phone <> '') as with_phone
from public.member_imports;

grant select on public.member_import_stats to authenticated;
