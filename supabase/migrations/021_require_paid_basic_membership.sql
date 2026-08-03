-- Require Basic Plan PayID payment before association membership is active.
-- Public self-signup creates a profile with association_member = false until
-- Treasurer marks an association invoice paid (or a paid invoice already exists).
-- Imported members keep their member_imports flags.

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
    -- Public signup: unpaid until association invoice is paid via PayID
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

-- Keep trigger attached (function replace alone is not enough if trigger was dropped)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
