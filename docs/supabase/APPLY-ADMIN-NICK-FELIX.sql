-- Run in Supabase SQL Editor (safe to re-run).
-- Finds Nick Boit and Felix Kogei on the membership list / signed-in profiles
-- and adds their emails to committee admin (public.site_admins).
-- After this, open Admin → Onboard admins and click Resend invite so they
-- get an email to create their own password.

alter table public.site_admins
  add column if not exists invited_at timestamptz;

with wanted (first_key, last_key, display_name) as (
  values
    ('nick', 'boit', 'Nick Boit'),
    ('felix', 'kogei', 'Felix Kogei')
),
found as (
  select
    w.display_name,
    lower(trim(src.email)) as email,
    coalesce(nullif(trim(src.full_name), ''), w.display_name) as full_name,
    src.origin
  from wanted w
  join (
    select full_name, first_name, last_name, email, 'member_imports'::text as origin
    from public.member_imports
    union all
    select full_name, null::text, null::text, email, 'profiles'::text as origin
    from public.profiles
  ) src
    on coalesce(trim(src.email), '') <> ''
   and (
     (
       lower(coalesce(src.full_name, '')) like '%' || w.first_key || '%'
       and lower(coalesce(src.full_name, '')) like '%' || w.last_key || '%'
     )
     or (
       lower(coalesce(src.first_name, '')) like w.first_key || '%'
       and lower(coalesce(src.last_name, '')) like w.last_key || '%'
     )
   )
)
insert into public.site_admins (email, full_name)
select distinct f.email, f.full_name
from found f
on conflict (email) do update
set full_name = coalesce(nullif(excluded.full_name, ''), public.site_admins.full_name);

-- Who was added / already present
select
  a.email,
  a.full_name,
  a.created_at
from public.site_admins a
where
  lower(a.full_name) like '%boit%'
  or lower(a.full_name) like '%kogei%'
  or lower(a.email) in (
    select lower(trim(email))
    from public.member_imports
    where
      (lower(full_name) like '%nick%' and lower(full_name) like '%boit%')
      or (lower(full_name) like '%felix%' and lower(full_name) like '%kogei%')
      or (lower(coalesce(first_name, '')) like 'nick%' and lower(coalesce(last_name, '')) like 'boit%')
      or (lower(coalesce(first_name, '')) like 'felix%' and lower(coalesce(last_name, '')) like 'kogei%')
  )
order by a.full_name, a.email;

-- If the table above is empty, this shows nearby names to check spelling
select full_name, email, 'member_imports' as source
from public.member_imports
where
  lower(full_name) like '%boit%'
  or lower(full_name) like '%kogei%'
  or lower(coalesce(last_name, '')) like '%boit%'
  or lower(coalesce(last_name, '')) like '%kogei%'
union all
select full_name, email, 'profiles'
from public.profiles
where
  lower(coalesce(full_name, '')) like '%boit%'
  or lower(coalesce(full_name, '')) like '%kogei%'
order by 1, 2;
