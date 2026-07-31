-- Portal parity: announcements + member resources
-- Also allow newsletter re-subscribe upserts and grant updates for profile self-edit.

-- Announcements (committee → members dashboard)
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all'
    check (audience in ('all', 'association', 'welfare')),
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Member library resources (links to site pages / files)
create table if not exists public.member_resources (
  id text primary key,
  title text not null,
  description text,
  category text not null default 'General',
  file_type text not null default 'LINK' check (file_type in ('PDF', 'VID', 'LINK', 'DOC')),
  file_url text not null,
  sort_order int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
alter table public.member_resources enable row level security;

grant select on table public.announcements to anon, authenticated;
grant select on table public.member_resources to anon, authenticated;

drop policy if exists "Members can read published announcements" on public.announcements;
create policy "Members can read published announcements"
  on public.announcements
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Members can read published resources" on public.member_resources;
create policy "Members can read published resources"
  on public.member_resources
  for select
  to anon, authenticated
  using (is_published = true);

-- Writes are done via service_role (admin API). Optional authenticated admin
-- policies can be added later once is_site_admin is confirmed everywhere.

-- Newsletter: allow upsert (update subscribed_at / list_key on same email)
grant update on table public.newsletter_subscribers to anon, authenticated;

drop policy if exists "Public can update newsletter subscription" on public.newsletter_subscribers;
create policy "Public can update newsletter subscription"
  on public.newsletter_subscribers
  for update
  to anon, authenticated
  using (true)
  with check (
    email is not null
    and length(trim(email)) between 5 and 320
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and list_key is not null
    and length(list_key) <= 50
  );

-- Seed welcome announcement (safe if empty)
insert into public.announcements (title, body, audience, is_published, published_at)
select
  'Welcome to the new members portal',
  'The Taunet Nelel members area is now live on the new website. Use Dashboard for events and renewals, Resources for member documents, and Welfare if you are enrolled in Social Welfare. Contact Support if anything looks wrong with your membership.',
  'all',
  true,
  now()
where not exists (select 1 from public.announcements limit 1);

-- Seed member resources (HTML pages under assets/member-resources/)
insert into public.member_resources (id, title, description, category, file_type, file_url, sort_order, is_published)
values
  (
    'member-handbook-2026',
    'Member Handbook 2026',
    'How membership, renewals, and the members portal work.',
    'Membership',
    'DOC',
    '../assets/member-resources/member-handbook.html',
    1,
    true
  ),
  (
    'welfare-overview',
    'Social Welfare overview',
    'Packages, support pathways, and how to register for welfare.',
    'Welfare',
    'LINK',
    '../welfare.html',
    2,
    true
  ),
  (
    'association-membership',
    'Association membership guide',
    'Standard association membership benefits and fees.',
    'Membership',
    'LINK',
    '../membership.html',
    3,
    true
  ),
  (
    'language-beginner',
    'Kalenjin language — beginner notes',
    'Starter phrases and learning tips for families.',
    'Language School',
    'DOC',
    '../assets/member-resources/kalenjin-language-beginner.html',
    4,
    true
  ),
  (
    'history-traditions',
    'Kalenjin history & traditions',
    'Short cultural briefing for youth and new members.',
    'Culture',
    'DOC',
    '../assets/member-resources/kalenjin-history-traditions.html',
    5,
    true
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  file_type = excluded.file_type,
  file_url = excluded.file_url,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  updated_at = now();
