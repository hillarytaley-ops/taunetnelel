-- Live IT Help chat: members raise portal issues; IT replies in Admin.
-- Safe to re-run.

create table if not exists public.it_help_threads (
  id uuid primary key default gen_random_uuid(),
  guest_token text not null unique,
  email text not null,
  full_name text,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.it_help_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.it_help_threads (id) on delete cascade,
  sender text not null check (sender in ('member', 'it')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists it_help_threads_last_message_idx
  on public.it_help_threads (last_message_at desc);

create index if not exists it_help_threads_status_idx
  on public.it_help_threads (status);

create index if not exists it_help_messages_thread_idx
  on public.it_help_messages (thread_id, created_at);

alter table public.it_help_threads enable row level security;
alter table public.it_help_messages enable row level security;

revoke all on table public.it_help_threads from public, anon, authenticated;
revoke all on table public.it_help_messages from public, anon, authenticated;
grant all on table public.it_help_threads to service_role;
grant all on table public.it_help_messages to service_role;
