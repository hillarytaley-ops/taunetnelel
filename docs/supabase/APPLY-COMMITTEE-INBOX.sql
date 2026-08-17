-- Run in Supabase SQL Editor after APPLY-WELFARE-INBOX.sql, then refresh Admin → Team inbox.
-- Adds: private Committee room (admins chat with each other) and sender names on messages.
-- Safe to re-run.

alter table public.welfare_inbox_threads
  alter column profile_id drop not null;

alter table public.welfare_inbox_threads
  drop constraint if exists welfare_inbox_threads_profile_id_key;

drop index if exists welfare_inbox_threads_profile_id_key;

create unique index if not exists welfare_inbox_threads_profile_unique
  on public.welfare_inbox_threads (profile_id)
  where profile_id is not null;

alter table public.welfare_inbox_threads
  add column if not exists thread_kind text not null default 'member';

alter table public.welfare_inbox_threads
  drop constraint if exists welfare_inbox_threads_thread_kind_check;

alter table public.welfare_inbox_threads
  add constraint welfare_inbox_threads_thread_kind_check
  check (thread_kind in ('member', 'committee'));

create unique index if not exists welfare_inbox_committee_one
  on public.welfare_inbox_threads (thread_kind)
  where thread_kind = 'committee';

alter table public.welfare_inbox_messages
  add column if not exists sender_name text;

alter table public.welfare_inbox_messages
  add column if not exists sender_email text;

insert into public.welfare_inbox_threads (
  thread_kind,
  member_name,
  member_email,
  status,
  unread_for_admin,
  unread_for_member
)
values (
  'committee',
  'Committee room',
  '',
  'open',
  false,
  false
)
on conflict (thread_kind) where thread_kind = 'committee' do nothing;
