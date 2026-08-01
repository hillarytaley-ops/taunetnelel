-- Run this FIRST if APPLY-REMAINING failed with:
--   function public.is_site_admin() does not exist
-- Then re-run docs/supabase/APPLY-REMAINING.sql

create table if not exists public.site_admins (
  email text primary key,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;

insert into public.site_admins (email, full_name)
values
  ('psowey@gmail.com', 'Ruto Mangusho'),
  ('hillarytaley@gmail.com', 'Hillary Taley'),
  ('hillarykaptingei@gmail.com', 'Hillary Kaptingei'),
  ('alexissams71@gmail.com', 'Brian Ngetich'),
  ('rutopsowey@gmail.com', 'Ruto Mangusho'),
  ('briankip57@gmail.com', 'Webmaster')
on conflict (email) do update
set full_name = excluded.full_name;

create or replace function public.is_site_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(
    auth.jwt() ->> 'email',
    auth.email()::text,
    ''
  )));
  if v_email = '' then
    return false;
  end if;
  return exists (
    select 1 from public.site_admins a where a.email = v_email
  );
end;
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated, anon;

grant select on table public.site_admins to authenticated;

drop policy if exists "Admins can read site_admins" on public.site_admins;
drop policy if exists "Users can read own site_admin row" on public.site_admins;

create policy "Users can read own site_admin row"
  on public.site_admins
  for select
  to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "Admins can read site_admins"
  on public.site_admins
  for select
  to authenticated
  using (public.is_site_admin());

select email, full_name from public.site_admins order by email;
select public.is_site_admin() as am_i_admin_in_this_sql_session;
