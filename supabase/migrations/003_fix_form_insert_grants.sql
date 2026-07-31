-- PASTE THIS INTO SUPABASE SQL EDITOR AND CLICK RUN
-- Project: wgecdsdeeirzdvshdfwo
-- This fixes empty form_submissions (RLS blocking website inserts)

alter table public.form_submissions enable row level security;

grant usage on schema public to anon, authenticated;
grant insert, select on table public.form_submissions to anon, authenticated;

drop policy if exists "Public can submit forms" on public.form_submissions;
drop policy if exists "Allow public form inserts" on public.form_submissions;

create policy "Allow public form inserts"
  on public.form_submissions
  for insert
  to anon, authenticated
  with check (true);

-- Optional: committee can read submissions when logged in later
drop policy if exists "Authenticated can read form submissions" on public.form_submissions;
create policy "Authenticated can read form submissions"
  on public.form_submissions
  for select
  to authenticated
  using (true);
