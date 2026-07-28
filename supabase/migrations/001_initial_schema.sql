-- Taunet Nelel initial Supabase schema
-- Run this in Supabase Dashboard: SQL Editor > New query > Run

-- Form submissions (contact, membership, sponsorship, welfare, events)
create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_type text not null check (form_type in (
    'contact', 'membership', 'sponsorship', 'welfare', 'events', 'support'
  )),
  name text,
  email text,
  phone text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists form_submissions_form_type_idx
  on public.form_submissions (form_type);

create index if not exists form_submissions_created_at_idx
  on public.form_submissions (created_at desc);

-- Sponsors displayed on sponsorship page
create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null check (tier in ('platinum', 'gold', 'silver', 'bronze')),
  logo_url text,
  contact_email text,
  contact_phone text,
  website text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- Member profiles (linked to Supabase Auth later)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  plan text not null default 'basic' check (plan in ('basic', 'welfare')),
  member_number text unique,
  member_since int,
  renews_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Events (future: replace hardcoded events-phases.js)
create table if not exists public.events (
  id text primary key,
  title text not null,
  summary text,
  location text,
  meta text,
  badge text,
  image_path text,
  booking_url text,
  gallery_url text,
  start_at timestamptz not null,
  end_at timestamptz,
  featured boolean not null default false,
  registration_open boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- Newsletter signups
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  list_key text not null default 'default',
  subscribed_at timestamptz not null default now()
);

-- Gallery albums
create table if not exists public.gallery_albums (
  id text primary key,
  title text not null,
  description text,
  event_date date,
  group_id text,
  sort_date date,
  preview_limit int not null default 12,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- Gallery photos
create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  album_id text not null references public.gallery_albums (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  download_name text,
  sort_order int not null default 0,
  is_member_only boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists gallery_photos_album_id_idx
  on public.gallery_photos (album_id);

-- Business directory
create table if not exists public.businesses (
  id text primary key,
  name text not null,
  category text,
  description text,
  contact_name text,
  phone text,
  email text,
  website text,
  location text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- Business hub news
create table if not exists public.business_news (
  id text primary key,
  title text not null,
  published_date date,
  summary text,
  body text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.form_submissions enable row level security;
alter table public.sponsors enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.gallery_albums enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.businesses enable row level security;
alter table public.business_news enable row level security;

-- Policies (drop first so this script can be re-run safely)
drop policy if exists "Public can submit forms" on public.form_submissions;
drop policy if exists "Public can read published sponsors" on public.sponsors;
drop policy if exists "Public can read published events" on public.events;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscribers;
drop policy if exists "Public can read published gallery albums" on public.gallery_albums;
drop policy if exists "Public can read published gallery photos" on public.gallery_photos;
drop policy if exists "Public can read published businesses" on public.businesses;
drop policy if exists "Public can read published business news" on public.business_news;

-- Public can submit forms (validated insert — not unrestricted)
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
  );

-- Public can read published sponsors
create policy "Public can read published sponsors"
  on public.sponsors
  for select
  to anon, authenticated
  using (is_published = true);

-- Public can read published events
create policy "Public can read published events"
  on public.events
  for select
  to anon, authenticated
  using (is_published = true);

-- Users manage own profile
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Newsletter signups from website (validated email)
create policy "Public can subscribe to newsletter"
  on public.newsletter_subscribers
  for insert
  to anon, authenticated
  with check (
    email is not null
    and length(trim(email)) between 5 and 320
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and list_key is not null
    and length(list_key) <= 50
  );

-- Public can read published gallery
create policy "Public can read published gallery albums"
  on public.gallery_albums
  for select
  to anon, authenticated
  using (is_published = true);

create policy "Public can read published gallery photos"
  on public.gallery_photos
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.gallery_albums
      where gallery_albums.id = gallery_photos.album_id
        and gallery_albums.is_published = true
    )
    and is_member_only = false
  );

-- Public can read published businesses
create policy "Public can read published businesses"
  on public.businesses
  for select
  to anon, authenticated
  using (is_published = true);

create policy "Public can read published business news"
  on public.business_news
  for select
  to anon, authenticated
  using (is_published = true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger-only: block direct RPC calls to handle_new_user
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

-- Optional seed sponsors (only if table is empty — safe to re-run)
insert into public.sponsors (name, tier, logo_url, contact_email, contact_phone, sort_order)
select *
from (
  values
    ('Grace International', 'platinum', 'wp-content/uploads/2026/06/sponsorship-hero-grace.png', 'info@taunetnelel.org', '+61 475 273 985', 1),
    ('Victoria Police', 'platinum', null, 'info@taunetnelel.org', null, 2),
    ('SNB Education Agency', 'gold', 'wp-content/uploads/2026/06/sponsorship-hero-snb.png', 'info@taunetnelel.org', null, 3),
    ('Infiniti Property Corporation', 'gold', null, 'info@taunetnelel.org', null, 4),
    ('Melbourne Rotary Club', 'gold', null, 'info@taunetnelel.org', null, 5),
    ('Kalenjin Australian Business Network', 'silver', null, 'info@taunetnelel.org', null, 6),
    ('Unity Education Fund', 'silver', null, 'info@taunetnelel.org', null, 7),
    ('Carevault', 'silver', null, 'info@taunetnelel.org', null, 8),
    ('ABC Multicultural Services', 'bronze', null, 'info@taunetnelel.org', null, 9),
    ('Cultural Pride Initiative', 'bronze', null, 'info@taunetnelel.org', null, 10),
    ('Community Care Solutions', 'bronze', null, 'info@taunetnelel.org', null, 11),
    ('Rotary Club of Cranbourne', 'bronze', null, 'info@taunetnelel.org', null, 12)
) as seed(name, tier, logo_url, contact_email, contact_phone, sort_order)
where not exists (select 1 from public.sponsors limit 1);
