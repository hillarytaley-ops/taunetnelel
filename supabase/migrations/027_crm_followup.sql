-- CRM follow-up: email/SMS campaigns, pipelines, booking calendar, unsubscribes.
-- Run in Supabase SQL Editor after APPLY-CRM-CUSTOM-FIELDS.sql.
-- Safe to re-run.

create table if not exists public.crm_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  channel text not null check (channel in ('email', 'sms', 'all')),
  created_at timestamptz not null default now()
);

create unique index if not exists crm_unsubscribes_email_channel_idx
  on public.crm_unsubscribes (lower(email), channel)
  where email is not null;

create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'sms')),
  name text not null,
  subject text,
  body_text text not null,
  audience text not null check (audience in (
    'all_members', 'association', 'welfare', 'newsletter'
  )),
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'failed')),
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  error_text text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.crm_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.crm_campaigns (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  email text,
  phone text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  error_text text,
  sent_at timestamptz
);

create index if not exists crm_campaign_recipients_campaign_idx
  on public.crm_campaign_recipients (campaign_id);

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  pipeline_key text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.crm_pipelines (id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);

create table if not exists public.crm_pipeline_cards (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.crm_pipelines (id) on delete cascade,
  stage_id uuid not null references public.crm_pipeline_stages (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  title text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_pipeline_cards_stage_idx
  on public.crm_pipeline_cards (stage_id, created_at desc);

create table if not exists public.crm_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  event_type text not null default 'appointment'
    check (event_type in ('appointment', 'committee', 'reminder')),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'cancelled', 'completed')),
  profile_id uuid references public.profiles (id) on delete set null,
  member_name text,
  member_email text,
  created_at timestamptz not null default now()
);

create index if not exists crm_calendar_events_starts_idx
  on public.crm_calendar_events (starts_at desc);

alter table public.crm_unsubscribes enable row level security;
alter table public.crm_campaigns enable row level security;
alter table public.crm_campaign_recipients enable row level security;
alter table public.crm_pipelines enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_pipeline_cards enable row level security;
alter table public.crm_calendar_events enable row level security;

revoke all on table public.crm_unsubscribes from public, anon, authenticated;
revoke all on table public.crm_campaigns from public, anon, authenticated;
revoke all on table public.crm_campaign_recipients from public, anon, authenticated;
revoke all on table public.crm_pipelines from public, anon, authenticated;
revoke all on table public.crm_pipeline_stages from public, anon, authenticated;
revoke all on table public.crm_pipeline_cards from public, anon, authenticated;
revoke all on table public.crm_calendar_events from public, anon;

grant insert on table public.crm_unsubscribes to anon, authenticated;
grant select, insert on table public.crm_calendar_events to authenticated;
grant all on table public.crm_unsubscribes to service_role;
grant all on table public.crm_campaigns to service_role;
grant all on table public.crm_campaign_recipients to service_role;
grant all on table public.crm_pipelines to service_role;
grant all on table public.crm_pipeline_stages to service_role;
grant all on table public.crm_pipeline_cards to service_role;
grant all on table public.crm_calendar_events to service_role;

drop policy if exists "anyone can unsubscribe" on public.crm_unsubscribes;
create policy "anyone can unsubscribe"
  on public.crm_unsubscribes
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "members read own appointments" on public.crm_calendar_events;
create policy "members read own appointments"
  on public.crm_calendar_events
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "members request own appointments" on public.crm_calendar_events;
create policy "members request own appointments"
  on public.crm_calendar_events
  for insert
  to authenticated
  with check (profile_id = auth.uid() and status = 'requested');

insert into public.crm_pipelines (pipeline_key, name)
values
  ('welfare', 'Social Welfare'),
  ('membership', 'Association membership')
on conflict (pipeline_key) do nothing;

insert into public.crm_pipeline_stages (pipeline_id, name, sort_order)
select p.id, s.name, s.sort_order
from public.crm_pipelines p
join (
  values
    ('welfare', 'New enquiry', 10),
    ('welfare', 'Registration received', 20),
    ('welfare', 'Waiting period', 30),
    ('welfare', 'Active member', 40),
    ('welfare', 'Claim in review', 50),
    ('welfare', 'Closed', 60),
    ('membership', 'Enquiry', 10),
    ('membership', 'Invoice sent', 20),
    ('membership', 'Paid / active', 30),
    ('membership', 'Lapsed', 40)
) as s(pipeline_key, name, sort_order)
  on s.pipeline_key = p.pipeline_key
where not exists (
  select 1 from public.crm_pipeline_stages x
  where x.pipeline_id = p.id and x.name = s.name
);
