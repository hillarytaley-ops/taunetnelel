-- Remove disorganized WordPress dump albums from gallery
-- Run in Supabase SQL Editor

delete from public.gallery_photos
where album_id like 'wp-archive-%'
   or album_id like 'wp-202%';

delete from public.gallery_albums
where id like 'wp-archive-%'
   or id like 'wp-202%';
