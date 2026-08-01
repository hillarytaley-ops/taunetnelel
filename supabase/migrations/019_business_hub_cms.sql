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
