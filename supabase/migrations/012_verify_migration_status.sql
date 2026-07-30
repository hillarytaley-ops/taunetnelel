-- Migration status check — run in Supabase SQL Editor
-- Safe: read-only (no deletes)

select 'member_imports' as item,
  to_regclass('public.member_imports') is not null as exists,
  (select count(*) from public.member_imports) as row_count
where to_regclass('public.member_imports') is not null
union all
select 'site_admins',
  to_regclass('public.site_admins') is not null,
  (select count(*) from public.site_admins)
where to_regclass('public.site_admins') is not null
union all
select 'profiles',
  to_regclass('public.profiles') is not null,
  (select count(*) from public.profiles)
where to_regclass('public.profiles') is not null;

-- Columns on profiles (008)
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('plan', 'association_member', 'welfare_member', 'email')
order by column_name;

-- is_site_admin function (011)
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = 'is_site_admin';

-- Import breakdown
select * from public.member_import_stats;

-- Committee admins
select email, full_name from public.site_admins order by email;
