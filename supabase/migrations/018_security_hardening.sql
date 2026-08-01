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
