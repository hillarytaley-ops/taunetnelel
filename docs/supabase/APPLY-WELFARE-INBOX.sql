-- Run in Supabase SQL Editor after APPLY-WELFARE-CLAIMS.sql, then redeploy.
-- Adds: Welfare team inbox, claim file attachments, waiting-period reminder log.
-- Safe to re-run.

create table if not exists public.welfare_inbox_threads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  member_name text,
  member_email text,
  status text not null default 'open' check (status in ('open', 'closed')),
  unread_for_admin boolean not null default true,
  unread_for_member boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.welfare_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.welfare_inbox_threads (id) on delete cascade,
  sender text not null check (sender in ('member', 'committee')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists welfare_inbox_threads_last_idx
  on public.welfare_inbox_threads (status, last_message_at desc);

create index if not exists welfare_inbox_messages_thread_idx
  on public.welfare_inbox_messages (thread_id, created_at);

create table if not exists public.welfare_claim_files (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.welfare_claims (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists welfare_claim_files_claim_idx
  on public.welfare_claim_files (claim_id, created_at);

create table if not exists public.welfare_reminder_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reminder_key text not null,
  channel text not null default 'email',
  sent_at timestamptz not null default now(),
  unique (profile_id, reminder_key)
);

alter table public.welfare_inbox_threads enable row level security;
alter table public.welfare_inbox_messages enable row level security;
alter table public.welfare_claim_files enable row level security;
alter table public.welfare_reminder_log enable row level security;

revoke all on table public.welfare_inbox_threads from public, anon, authenticated;
revoke all on table public.welfare_inbox_messages from public, anon, authenticated;
revoke all on table public.welfare_claim_files from public, anon, authenticated;
revoke all on table public.welfare_reminder_log from public, anon, authenticated;

grant all on table public.welfare_inbox_threads to service_role;
grant all on table public.welfare_inbox_messages to service_role;
grant all on table public.welfare_claim_files to service_role;
grant all on table public.welfare_reminder_log to service_role;

grant select on table public.welfare_claim_files to authenticated;
drop policy if exists "members read own claim files" on public.welfare_claim_files;
create policy "members read own claim files"
  on public.welfare_claim_files
  for select
  to authenticated
  using (profile_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'welfare-claims',
  'welfare-claims',
  false,
  3670016,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_custom_fields'
  ) then
    update public.crm_custom_fields
    set visibility = 'member', member_editable = false, updated_at = now()
    where field_key = 'waiting_period_ends';
  end if;
end $$;
