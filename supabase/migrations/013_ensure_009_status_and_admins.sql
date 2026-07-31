-- Apply missing pieces if 009 was skipped / partially applied.
-- Safe to re-run. Does not wipe member_imports.

alter table public.form_submissions
  add column if not exists status text not null default 'new';

alter table public.form_submissions
  drop constraint if exists form_submissions_status_check;

alter table public.form_submissions
  add constraint form_submissions_status_check
  check (status in ('new', 'reviewed', 'actioned', 'archived'));

alter table public.form_submissions
  add column if not exists admin_notes text;

alter table public.profiles
  add column if not exists association_member boolean not null default false;

alter table public.profiles
  add column if not exists welfare_member boolean not null default false;

alter table public.profiles
  add column if not exists email text;

-- Confirm site_admins + is_site_admin from 010/011
create table if not exists public.site_admins (
  email text primary key,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;

insert into public.site_admins (email, full_name) values
  ('psowey@gmail.com', 'Peter Sowey'),
  ('hillarytaley@gmail.com', 'Hillary Kaptingei'),
  ('hillarykaptingei@gmail.com', 'Hillary Kaptingei'),
  ('alexissams71@gmail.com', 'Alexis Sams'),
  ('rutopsowey@gmail.com', 'Ruto Psowey'),
  ('briankip57@gmail.com', 'Brian Kip')
on conflict (email) do nothing;

-- Quick read-only confirmation
select 'member_imports' as item, count(*)::int as n from public.member_imports
union all
select 'site_admins', count(*)::int from public.site_admins
union all
select 'profiles', count(*)::int from public.profiles;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'form_submissions'
  and column_name in ('status', 'admin_notes')
order by 1;

select email from public.site_admins order by 1;
