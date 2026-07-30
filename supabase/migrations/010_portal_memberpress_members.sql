-- Migrate MemberPress members from portal.taunetnelel.org
-- Source: WP Admin → MemberPress → Members (5 records as of 2026-07)
-- Run in Supabase SQL Editor AFTER or AFTER using /admin/
-- Requires: 007_member_imports, 008_profiles, 009_site_admins

-- Snapshot from MemberPress:
-- 16 Ruto              psowey@gmail.com          Status None
-- 17 Hillary Taley     hillarytaley@gmail.com    Status None  (WP/committee login)
-- 15 Alexis            alexissams71@gmail.com    Status None
-- 14 Ruto Mangusho     Rutopsowey@gmail.com      Active — Taunet Nelel Standard Membership
--  1 webmaster         briankip57@gmail.com      Status None  (WP webmaster)

create temporary table if not exists _portal_mp_members (
  email text primary key,
  full_name text not null,
  first_name text,
  last_name text,
  association_member boolean not null,
  welfare_member boolean not null,
  plan text not null,
  membership_label text not null,
  mp_status text,
  notes text
);

truncate _portal_mp_members;

insert into _portal_mp_members (
  email, full_name, first_name, last_name,
  association_member, welfare_member, plan, membership_label, mp_status, notes
) values
  (
    'psowey@gmail.com',
    'Ruto Mangusho',
    'Ruto',
    'Mangusho',
    true,
    true,
    'both',
    'Association + Welfare',
    'none',
    'MemberPress id 16; also on ClientClub import as president'
  ),
  (
    'hillarytaley@gmail.com',
    'Hillary Taley',
    'Hillary',
    'Taley',
    true,
    false,
    'basic',
    'Association (Standard)',
    'none',
    'MemberPress id 17; committee admin'
  ),
  (
    'alexissams71@gmail.com',
    'Brian Ngetich',
    'Brian',
    'Ngetich',
    true,
    false,
    'basic',
    'Association (Standard)',
    'none',
    'MemberPress id 15 (username Alexis)'
  ),
  (
    'rutopsowey@gmail.com',
    'Ruto Mangusho',
    'Ruto',
    'Mangusho',
    true,
    false,
    'basic',
    'Association (Standard)',
    'active',
    'MemberPress id 14 — Active Standard Membership (alt email vs psowey@)'
  ),
  (
    'briankip57@gmail.com',
    'Webmaster',
    'Webmaster',
    '',
    true,
    false,
    'basic',
    'Association (Standard)',
    'none',
    'MemberPress id 1 / WP webmaster'
  );

-- Upsert into member_imports by email (case-insensitive)
insert into public.member_imports (
  member_number,
  full_name,
  first_name,
  last_name,
  email,
  association_member,
  welfare_member,
  plan,
  membership_label,
  status,
  source_contact_ids,
  tags
)
select
  'MP-' || row_number() over (order by email),
  full_name,
  first_name,
  nullif(last_name, ''),
  email,
  association_member,
  welfare_member,
  plan,
  membership_label,
  case when mp_status = 'active' then 'active' else 'pending_invite' end,
  'memberpress-portal',
  coalesce(notes, 'memberpress_portal')
from _portal_mp_members p
where not exists (
  select 1 from public.member_imports mi
  where lower(mi.email) = lower(p.email)
);

-- Refresh flags for rows that already existed (e.g. psowey from ClientClub)
update public.member_imports mi
set
  association_member = p.association_member or mi.association_member,
  welfare_member = p.welfare_member or mi.welfare_member,
  plan = case
    when (p.association_member or mi.association_member)
     and (p.welfare_member or mi.welfare_member) then 'both'
    when (p.welfare_member or mi.welfare_member) then 'welfare'
    else 'basic'
  end,
  membership_label = case
    when (p.association_member or mi.association_member)
     and (p.welfare_member or mi.welfare_member) then 'Association + Welfare'
    when (p.welfare_member or mi.welfare_member) then 'Welfare only'
    else 'Association (Standard)'
  end,
  tags = trim(both ',' from concat_ws(',', mi.tags, 'memberpress_portal')),
  updated_at = now()
from _portal_mp_members p
where lower(mi.email) = lower(p.email);

-- Committee / WP admins → site_admins (for /admin/ dashboard)
insert into public.site_admins (email, full_name)
values
  ('hillarytaley@gmail.com', 'Hillary Taley'),
  ('briankip57@gmail.com', 'Webmaster')
on conflict (email) do update
set full_name = excluded.full_name;

-- If Auth profiles already exist, align membership from import for these emails
update public.profiles pr
set
  association_member = mi.association_member,
  welfare_member = mi.welfare_member,
  plan = mi.plan,
  full_name = coalesce(nullif(trim(pr.full_name), ''), mi.full_name),
  email = coalesce(pr.email, mi.email),
  updated_at = now()
from public.member_imports mi
where lower(pr.email) = lower(mi.email)
  and lower(mi.email) in (
    select lower(email) from _portal_mp_members
  );

select
  mi.email,
  mi.full_name,
  mi.plan,
  mi.status,
  mi.tags,
  exists (
    select 1 from public.site_admins sa where sa.email = lower(mi.email)
  ) as is_site_admin,
  exists (
    select 1 from public.profiles pr where lower(pr.email) = lower(mi.email)
  ) as has_auth_profile
from public.member_imports mi
where lower(mi.email) in (select lower(email) from _portal_mp_members)
order by mi.email;

drop table if exists _portal_mp_members;
