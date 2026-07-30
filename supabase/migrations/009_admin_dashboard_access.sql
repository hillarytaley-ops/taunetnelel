-- Committee admin access for the website admin dashboard
-- Run in Supabase SQL Editor after 008.

create table if not exists public.site_admins (
  email text primary key,
  full_name text,
  created_at timestamptz not null default now(),
  constraint site_admins_email_lower check (email = lower(email))
);

alter table public.site_admins enable row level security;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated, anon;

-- Seed committee admins (edit / add emails as needed)
insert into public.site_admins (email, full_name) values
  ('hillarytaley@gmail.com', 'Hillary Kaptingei'),
  ('hillarykaptingei@gmail.com', 'Hillary Kaptingei')
on conflict (email) do nothing;

alter table public.form_submissions
  add column if not exists status text not null default 'new';

alter table public.form_submissions
  drop constraint if exists form_submissions_status_check;

alter table public.form_submissions
  add constraint form_submissions_status_check
  check (status in ('new', 'reviewed', 'actioned', 'archived'));

alter table public.form_submissions
  add column if not exists admin_notes text;

-- Tighten form reads: admins only (replaces open authenticated read)
drop policy if exists "Authenticated can read form submissions" on public.form_submissions;
drop policy if exists "Admins can read form submissions" on public.form_submissions;
drop policy if exists "Admins can update form submissions" on public.form_submissions;

grant select, update on table public.form_submissions to authenticated;

create policy "Admins can read form submissions"
  on public.form_submissions
  for select
  to authenticated
  using (public.is_site_admin());

create policy "Admins can update form submissions"
  on public.form_submissions
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- site_admins: admins can see the list
drop policy if exists "Admins can read site_admins" on public.site_admins;
create policy "Admins can read site_admins"
  on public.site_admins
  for select
  to authenticated
  using (public.is_site_admin());

-- Profiles: committee can list / update membership flags
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

create policy "Admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_site_admin());

create policy "Admins can update all profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- Member imports (was service_role only)
alter table public.member_imports enable row level security;
grant select, update on table public.member_imports to authenticated;

drop policy if exists "Admins can read member imports" on public.member_imports;
drop policy if exists "Admins can update member imports" on public.member_imports;

create policy "Admins can read member imports"
  on public.member_imports
  for select
  to authenticated
  using (public.is_site_admin());

create policy "Admins can update member imports"
  on public.member_imports
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- Newsletter
grant select on table public.newsletter_subscribers to authenticated;
drop policy if exists "Admins can read newsletter" on public.newsletter_subscribers;
create policy "Admins can read newsletter"
  on public.newsletter_subscribers
  for select
  to authenticated
  using (public.is_site_admin());

-- Events (admin sees unpublished + can edit)
grant insert, update on table public.events to authenticated;
drop policy if exists "Admins can read all events" on public.events;
drop policy if exists "Admins can insert events" on public.events;
drop policy if exists "Admins can update events" on public.events;

create policy "Admins can read all events"
  on public.events for select to authenticated
  using (public.is_site_admin());

create policy "Admins can insert events"
  on public.events for insert to authenticated
  with check (public.is_site_admin());

create policy "Admins can update events"
  on public.events for update to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- Sponsors
grant insert, update on table public.sponsors to authenticated;
drop policy if exists "Admins can read all sponsors" on public.sponsors;
drop policy if exists "Admins can insert sponsors" on public.sponsors;
drop policy if exists "Admins can update sponsors" on public.sponsors;

create policy "Admins can read all sponsors"
  on public.sponsors for select to authenticated
  using (public.is_site_admin());

create policy "Admins can insert sponsors"
  on public.sponsors for insert to authenticated
  with check (public.is_site_admin());

create policy "Admins can update sponsors"
  on public.sponsors for update to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- Gallery
grant update on table public.gallery_albums to authenticated;
grant update on table public.gallery_photos to authenticated;
drop policy if exists "Admins can read all gallery albums" on public.gallery_albums;
drop policy if exists "Admins can update gallery albums" on public.gallery_albums;
drop policy if exists "Admins can read all gallery photos" on public.gallery_photos;
drop policy if exists "Admins can update gallery photos" on public.gallery_photos;

create policy "Admins can read all gallery albums"
  on public.gallery_albums for select to authenticated
  using (public.is_site_admin());

create policy "Admins can update gallery albums"
  on public.gallery_albums for update to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

create policy "Admins can read all gallery photos"
  on public.gallery_photos for select to authenticated
  using (public.is_site_admin());

create policy "Admins can update gallery photos"
  on public.gallery_photos for update to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());
