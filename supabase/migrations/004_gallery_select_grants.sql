-- Allow public website to read published gallery data
-- Run in Supabase SQL Editor after import_gallery.sql

grant select on table public.gallery_albums to anon, authenticated;
grant select on table public.gallery_photos to anon, authenticated;
