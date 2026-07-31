-- Admin event phase control + gallery photo support for concluded events.

alter table public.events
  add column if not exists phase_override text;

alter table public.events
  drop constraint if exists events_phase_override_check;

alter table public.events
  add constraint events_phase_override_check
  check (
    phase_override is null
    or phase_override in ('auto', 'upcoming', 'present', 'most-recent', 'past')
  );

comment on column public.events.phase_override is
  'Optional committee override: auto/null uses start/end dates; otherwise forces Upcoming / Present / Most Recent / Past.';

-- Public gallery storage bucket for admin photo uploads (service role writes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read gallery bucket" on storage.objects;
create policy "Public read gallery bucket"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'gallery');
