-- APPLY ALL REMAINING SQL



-- ===== supabase/migrations/013_ensure_009_status_and_admins.sql =====

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

-- ===== supabase/migrations/018_security_hardening.sql =====

-- Security hardening: membership locks, form/newsletter RLS, member-only content
-- Paste into Supabase SQL Editor and Run after deploying the site auth changes.

-- 1) Self-signup must not choose welfare / privileged plans via user metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mi public.member_imports%rowtype;
  v_plan text;
  v_assoc boolean;
  v_welfare boolean;
  v_name text;
  v_phone text;
  v_number text;
begin
  select * into mi
  from public.member_imports
  where lower(email) = lower(new.email)
  limit 1;

  if found then
    v_plan := mi.plan;
    v_assoc := mi.association_member;
    v_welfare := mi.welfare_member;
    v_name := coalesce(nullif(mi.full_name, ''), new.raw_user_meta_data->>'full_name', '');
    v_phone := mi.phone;
    v_number := mi.member_number;

    update public.member_imports
    set
      status = 'active',
      auth_user_id = new.id,
      updated_at = now()
    where id = mi.id;
  else
    -- Public signup: association basic only; welfare requires committee approval
    v_plan := 'basic';
    v_assoc := true;
    v_welfare := false;
    v_name := coalesce(new.raw_user_meta_data->>'full_name', '');
    v_phone := nullif(new.raw_user_meta_data->>'phone', '');
    v_number := null;
  end if;

  insert into public.profiles (
    id, full_name, email, phone, plan,
    association_member, welfare_member, member_number
  ) values (
    new.id,
    v_name,
    new.email,
    v_phone,
    v_plan,
    v_assoc,
    v_welfare,
    v_number
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    email = excluded.email,
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

-- 2) Freeze membership columns on self-service profile UPDATE
create or replace function public.protect_profile_membership_fields()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if public.is_site_admin() then
    return new;
  end if;

  new.plan := old.plan;
  new.association_member := old.association_member;
  new.welfare_member := old.welfare_member;
  new.member_number := old.member_number;
  new.email := old.email;
  new.member_since := old.member_since;
  new.renews_at := old.renews_at;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_membership on public.profiles;
create trigger trg_protect_profile_membership
  before update on public.profiles
  for each row
  execute function public.protect_profile_membership_fields();

revoke all on function public.protect_profile_membership_fields() from public;
revoke all on function public.protect_profile_membership_fields() from anon, authenticated;

-- 3) Tighten public form inserts (replace unrestricted WITH CHECK true)
drop policy if exists "Allow public form inserts" on public.form_submissions;
drop policy if exists "Public can submit forms" on public.form_submissions;
drop policy if exists "Authenticated can read form submissions" on public.form_submissions;

revoke select on table public.form_submissions from anon;

create policy "Public can submit forms"
  on public.form_submissions
  for insert
  to anon, authenticated
  with check (
    form_type in ('contact', 'membership', 'sponsorship', 'welfare', 'events', 'support')
    and coalesce(nullif(trim(name), ''), nullif(trim(email), '')) is not null
    and length(coalesce(name, '')) <= 200
    and length(coalesce(email, '')) <= 320
    and length(coalesce(phone, '')) <= 50
    and length(coalesce(message, '')) <= 10000
    and pg_column_size(coalesce(metadata, '{}'::jsonb)) <= 8192
  );

-- Keep admin read via is_site_admin (009/011); do not reopen broad authenticated SELECT

-- 4) Newsletter: replace open UPDATE with security-definer RPC
drop policy if exists "Public can update newsletter subscription" on public.newsletter_subscribers;
revoke update on table public.newsletter_subscribers from anon, authenticated;

create or replace function public.subscribe_newsletter(
  p_email text,
  p_list_key text default 'default'
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
  v_list text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_list := trim(coalesce(nullif(p_list_key, ''), 'default'));

  if v_email = ''
     or length(v_email) < 5
     or length(v_email) > 320
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email';
  end if;

  if length(v_list) > 50 then
    raise exception 'invalid list';
  end if;

  insert into public.newsletter_subscribers (email, list_key, subscribed_at)
  values (v_email, v_list, now())
  on conflict (email) do update
  set
    list_key = excluded.list_key,
    subscribed_at = now();
end;
$$;

revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

-- 5) Member announcements / resources: authenticated only (not public anon)
revoke select on table public.announcements from anon;
revoke select on table public.member_resources from anon;

drop policy if exists "Members can read published announcements" on public.announcements;
create policy "Members can read published announcements"
  on public.announcements
  for select
  to authenticated
  using (is_published = true);

drop policy if exists "Members can read published resources" on public.member_resources;
create policy "Members can read published resources"
  on public.member_resources
  for select
  to authenticated
  using (is_published = true);

-- 6) Import stats: admins only (if view/table exists)
do $$
begin
  if to_regclass('public.member_import_stats') is not null then
    execute 'revoke select on table public.member_import_stats from anon, authenticated';
    execute 'grant select on table public.member_import_stats to authenticated';
    execute 'drop policy if exists "Authenticated can read member_import_stats" on public.member_import_stats';
    execute 'drop policy if exists "Admins can read member_import_stats" on public.member_import_stats';
    execute $p$
      create policy "Admins can read member_import_stats"
        on public.member_import_stats
        for select
        to authenticated
        using (public.is_site_admin())
    $p$;
  end if;
exception when others then
  null;
end $$;

-- ===== supabase/migrations/019_business_hub_cms.sql =====

-- Business Hub CMS: blog table + committee write policies (via is_site_admin)
-- Safe to re-run. Requires is_site_admin() from migration 011.

create table if not exists public.business_blog (
  id text primary key,
  title text not null,
  published_date date,
  author text,
  summary text,
  body text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.business_blog enable row level security;

grant select on table public.business_blog to anon, authenticated;
grant select, insert, update, delete on table public.businesses to authenticated;
grant select, insert, update, delete on table public.business_news to authenticated;
grant select, insert, update, delete on table public.business_blog to authenticated;

drop policy if exists "Public can read published business blog" on public.business_blog;
create policy "Public can read published business blog"
  on public.business_blog
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Admins manage businesses" on public.businesses;
create policy "Admins manage businesses"
  on public.businesses
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "Admins manage business news" on public.business_news;
create policy "Admins manage business news"
  on public.business_news
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists "Admins manage business blog" on public.business_blog;
create policy "Admins manage business blog"
  on public.business_blog
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());
