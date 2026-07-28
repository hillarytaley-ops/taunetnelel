-- Leadership portraits belong on About / Meet Our Team — not Event Photos
-- Run in Supabase SQL Editor

delete from public.gallery_photos
where album_id = 'leadership-team';

delete from public.gallery_albums
where id = 'leadership-team';
