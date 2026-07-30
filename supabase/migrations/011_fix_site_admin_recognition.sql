-- Fix: site admin emails not recognized at /admin/ login
-- Paste into Supabase SQL Editor and Run.

-- 1) Table + lowercase emails
create table if not exists public.site_admins (
  email text primary key,
  full_name text,
  created_at timestamptz not null default now()
);

-- Drop strict check if it blocks anything odd; re-add softer version
alter table public.site_admins drop constraint if exists site_admins_email_lower;

alter table public.site_admins enable row level security;

-- Normalize any existing rows to lowercase
update public.site_admins set email = lower(trim(email)) where email <> lower(trim(email));

-- 2) Seed / refresh the five portal admins (+ Hillary Kaptingei Auth email if used)
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

-- 3) Recreate checker — bypass RLS inside function (critical)
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

-- 4) Grants + policies so a signed-in user can confirm their own admin row
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

-- 5) Verify (should return 6 rows)
select email, full_name from public.site_admins order by email;

-- 6) Optional: while signed in via SQL as a role this may be null;
--    test from the website after login. Expected: true for admin emails.
select public.is_site_admin() as am_i_admin_in_this_sql_session;
