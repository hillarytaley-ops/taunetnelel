-- Run in Supabase SQL Editor after APPLY-COMMITTEE-INBOX.sql (safe to re-run).
-- Allows 1:1 committee admin chats from the Team inbox dropdown.

alter table public.welfare_inbox_threads
  drop constraint if exists welfare_inbox_threads_thread_kind_check;

alter table public.welfare_inbox_threads
  add constraint welfare_inbox_threads_thread_kind_check
  check (thread_kind in ('member', 'committee', 'admin_dm'));

create unique index if not exists welfare_inbox_admin_dm_pair
  on public.welfare_inbox_threads (member_email)
  where thread_kind = 'admin_dm';
