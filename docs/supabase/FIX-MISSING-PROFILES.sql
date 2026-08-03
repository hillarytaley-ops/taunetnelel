-- Fix: ensure new Auth signups create a profiles row + backfill any missing ones.
-- Paste into Supabase SQL Editor and Run.

-- 1) Recreate trigger function (unpaid public signup until invoice paid)
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
  v_paid boolean := false;
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
    v_plan := 'basic';
    v_welfare := false;
    v_name := coalesce(new.raw_user_meta_data->>'full_name', '');
    v_phone := nullif(new.raw_user_meta_data->>'phone', '');
    v_number := null;

    begin
      select exists (
        select 1
        from public.invoices
        where email = lower(new.email)
          and kind = 'association'
          and status = 'paid'
      ) into v_paid;
    exception
      when undefined_table then
        v_paid := false;
    end;

    v_assoc := coalesce(v_paid, false);
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

-- 2) Ensure the trigger exists on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Backfill profiles for Auth users who have no profile row yet
insert into public.profiles (
  id, full_name, email, phone, plan,
  association_member, welfare_member, member_number
)
select
  u.id,
  coalesce(
    nullif(mi.full_name, ''),
    u.raw_user_meta_data->>'full_name',
    ''
  ),
  u.email,
  coalesce(mi.phone, nullif(u.raw_user_meta_data->>'phone', '')),
  coalesce(mi.plan, 'basic'),
  coalesce(mi.association_member, false),
  coalesce(mi.welfare_member, false),
  mi.member_number
from auth.users u
left join public.profiles p on p.id = u.id
left join public.member_imports mi on lower(mi.email) = lower(u.email)
where p.id is null
on conflict (id) do nothing;

-- 4) Quick check (read the results)
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.member_imports) as imported_rows,
  (
    select count(*)
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  ) as auth_users_missing_profile;
