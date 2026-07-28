-- Profiles + Auth linking for imported association/welfare members
-- Run in Supabase SQL Editor AFTER 007 + import_members.sql

-- Allow plan = both (association + welfare held separately)
alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('basic', 'welfare', 'both'));

alter table public.profiles
  add column if not exists association_member boolean not null default false;

alter table public.profiles
  add column if not exists welfare_member boolean not null default false;

alter table public.profiles
  add column if not exists email text;

-- When a user signs up / is invited, copy membership from member_imports by email
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
    v_plan := coalesce(new.raw_user_meta_data->>'plan', 'basic');
    if v_plan not in ('basic', 'welfare', 'both') then
      v_plan := 'basic';
    end if;
    v_assoc := v_plan in ('basic', 'both');
    v_welfare := v_plan in ('welfare', 'both');
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
    full_name = excluded.full_name,
    email = excluded.email,
    phone = coalesce(excluded.phone, public.profiles.phone),
    plan = excluded.plan,
    association_member = excluded.association_member,
    welfare_member = excluded.welfare_member,
    member_number = coalesce(excluded.member_number, public.profiles.member_number),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

-- Authenticated members can read their own profile (already) and update safe fields
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
