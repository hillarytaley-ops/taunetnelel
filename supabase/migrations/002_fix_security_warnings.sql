-- Fix Supabase security linter warnings (run after 001_initial_schema.sql)
-- Supabase Dashboard > SQL Editor > New query > Run

-- 1. Tighten form_submissions insert policy
drop policy if exists "Public can submit forms" on public.form_submissions;

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

-- 2. Tighten newsletter insert policy
drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscribers;

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

-- 3. Block direct RPC access to trigger function (signup trigger still works)
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;
