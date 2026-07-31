/**
 * Committee admin data API (PIN-gated).
 * Vercel env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_PIN  (optional; default TaunetAdmin2026)
 *
 * Client sends header: x-admin-pin
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.ADMIN_PIN || 'TaunetAdmin2026';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes = 4.5e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxBytes) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function slugifyId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `event-${Date.now()}`;
}

function publicStorageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/gallery/${path}`;
}

async function uploadGalleryObject(objectPath, bytes, contentType) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/gallery/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: bytes
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!response.ok) {
    const err = new Error((data && (data.message || data.error)) || 'Storage upload failed');
    err.status = response.status;
    err.details = data;
    throw err;
  }
  return publicStorageUrl(objectPath);
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], 'base64')
  };
}

function normalizePhaseOverride(value) {
  const phase = String(value || 'auto').trim();
  if (!phase || phase === 'auto') return null;
  if (['upcoming', 'present', 'most-recent', 'past'].includes(phase)) return phase;
  return null;
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error(
      'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them in Vercel → Project → Settings → Environment Variables.'
    );
    err.status = 500;
    throw err;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    },
    body: options.body
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!response.ok) {
    const err = new Error((data && (data.message || data.error)) || response.statusText || 'Supabase error');
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return { data, headers: response.headers };
}

async function countRows(table, query = '') {
  const q = query ? `&${query}` : '';
  const { headers } = await sb(`${table}?select=id${q}`, {
    prefer: 'count=exact',
    headers: { Range: '0-0' }
  });
  const range = headers.get('content-range') || '';
  const total = range.split('/')[1];
  const n = Number(total);
  return Number.isFinite(n) ? n : 0;
}

/** Same rows as supabase/migrations/014_seed_events.sql */
const SEED_EVENTS = [
  {
    id: 'cultural-week-2026',
    title: 'Winter Cultural Week',
    summary: 'A week of language, culture, and community activities across Victoria.',
    location: 'Victoria · multiple venues',
    meta: '1–5 July 2026 · daily sessions',
    badge: 'Culture week',
    image_path: 'wp-content/uploads/2025/09/Celebration.jpg',
    booking_url: null,
    gallery_url: 'gallery.html#agm-2025',
    start_at: '2026-07-01T10:00:00+10:00',
    end_at: '2026-07-05T18:00:00+10:00',
    featured: true,
    registration_open: false,
    is_published: true
  },
  {
    id: 'community-picnic-2026',
    title: 'Taunet Community Picnic',
    summary: 'Family picnic with food, games, and music. Alcohol-free and open to all ages.',
    location: 'Victoria',
    meta: 'Saturday, 10 August 2025 · 11am–4pm',
    badge: 'Family day',
    image_path: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
    booking_url: null,
    gallery_url: 'gallery.html',
    start_at: '2025-08-10T11:00:00+10:00',
    end_at: '2025-08-10T16:00:00+10:00',
    featured: false,
    registration_open: false,
    is_published: true
  },
  {
    id: 'language-festival-2026',
    title: 'Kalenjin Language Festival',
    summary: 'Celebrate Kalenjin language through workshops, performances, and youth activities.',
    location: 'Melbourne',
    meta: 'Sunday, 21 September 2025 · 10am–3pm',
    badge: 'Culture',
    image_path: 'wp-content/uploads/2025/09/Celebration.jpg',
    booking_url: null,
    gallery_url: 'gallery.html',
    start_at: '2025-09-21T10:00:00+10:00',
    end_at: '2025-09-21T15:00:00+10:00',
    featured: false,
    registration_open: false,
    is_published: true
  },
  {
    id: 'midyear-social-2026',
    title: 'Mid-Year Community Social',
    summary: 'An evening social bringing members together for food, music, and community updates.',
    location: 'Almas Receptions',
    meta: 'Saturday, 28 June 2026 · 2pm–8pm',
    badge: 'Recently ended',
    image_path: 'wp-content/uploads/2025/09/Celebration.jpg',
    booking_url: null,
    gallery_url: 'gallery.html#gala-2026',
    start_at: '2026-06-28T14:00:00+10:00',
    end_at: '2026-06-28T20:00:00+10:00',
    featured: false,
    registration_open: false,
    is_published: true
  },
  {
    id: 'gala-2026',
    title: 'Taunet Nelel Gala 2026',
    summary: 'Celebrate five years of Taunet Nelel with music, dancing, and delicious food.',
    location: 'Almas Receptions, Victoria',
    meta: 'Saturday, 18 April 2026 · 2pm–11pm · Almas Receptions, Victoria',
    badge: 'Featured',
    image_path: 'wp-content/uploads/2026/01/Taunet-Nelel-Galla.jpg',
    booking_url: 'https://www.eventbrite.com.au/e/taunet-nelel-2026-gala-tickets-1980043622777',
    gallery_url: 'gallery.html#gala-2026',
    start_at: '2026-04-18T14:00:00+10:00',
    end_at: '2026-04-18T23:00:00+10:00',
    featured: true,
    registration_open: false,
    is_published: true
  },
  {
    id: 'sports-day-2026',
    title: 'Sports Day',
    summary: 'A fun-filled family sports day for all ages.',
    location: 'Victoria · family sports day',
    meta: 'Sunday, 19 April 2026 · Victoria',
    badge: 'Family day',
    image_path: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
    booking_url: null,
    gallery_url: 'gallery.html#sports-day',
    start_at: '2026-04-19T09:00:00+10:00',
    end_at: '2026-04-19T17:00:00+10:00',
    featured: false,
    registration_open: false,
    is_published: true
  },
  {
    id: 'agm-2025',
    title: 'Annual General Meeting',
    summary: 'Annual general meeting for Taunet Nelel members.',
    location: 'Zoom',
    meta: 'Zoom · 10am – 5pm',
    badge: null,
    image_path: 'wp-content/uploads/2025/09/Celebration.jpg',
    booking_url: null,
    gallery_url: 'gallery.html#agm-2025',
    start_at: '2025-11-29T10:00:00+11:00',
    end_at: '2025-11-29T17:00:00+11:00',
    featured: false,
    registration_open: false,
    is_published: true
  },
  {
    id: 'pageant-2025',
    title: 'Mr & Miss Taunet 2025',
    summary: 'Taunet beauty pageant celebrating culture and community.',
    location: 'Almas Reception',
    meta: 'Almas Reception · 2pm – 5pm',
    badge: null,
    image_path: 'wp-content/uploads/2025/11/TN-beauty-peagant.jpg',
    booking_url: null,
    gallery_url: 'gallery.html#pageant-2025',
    start_at: '2025-11-08T14:00:00+11:00',
    end_at: '2025-11-08T17:00:00+11:00',
    featured: false,
    registration_open: false,
    is_published: true
  },
  {
    id: 'volleyball-2025',
    title: 'Volleyball Tournament',
    summary: 'Community volleyball tournament.',
    location: 'Dandenong Stadium',
    meta: 'Dandenong Stadium · 2pm – 5pm',
    badge: null,
    image_path: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
    booking_url: null,
    gallery_url: 'gallery.html#volleyball-2025',
    start_at: '2025-10-19T14:00:00+11:00',
    end_at: '2025-10-19T17:00:00+11:00',
    featured: false,
    registration_open: false,
    is_published: true
  },
  {
    id: 'gala-2025',
    title: 'Taunet Nelel Gala',
    summary: 'Annual gala celebration.',
    location: 'Dandenong Stadium',
    meta: 'Dandenong Stadium · 2pm – 11pm',
    badge: null,
    image_path: 'wp-content/uploads/2025/10/TAUNET-NELE-GALA.jpg',
    booking_url: null,
    gallery_url: 'gallery.html#gala-2025',
    start_at: '2025-04-26T14:00:00+10:00',
    end_at: '2025-04-26T23:00:00+10:00',
    featured: false,
    registration_open: false,
    is_published: true
  }
];

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const pin = String(req.headers['x-admin-pin'] || '');
  if (pin !== ADMIN_PIN) {
    return json(res, 401, { error: 'Invalid admin PIN' });
  }

  const url = new URL(req.url, 'http://localhost');
  const resource = url.searchParams.get('resource') || '';

  try {
    if (req.method === 'GET') {
      if (resource === 'overview') {
        const [enquiries, profiles, imports, newsletter] = await Promise.all([
          countRows('form_submissions'),
          countRows('profiles'),
          countRows('member_imports'),
          countRows('newsletter_subscribers')
        ]);
        // status column comes from migration 009; tolerate older schemas
        let newEnquiries = 0;
        try {
          newEnquiries = await countRows('form_submissions', 'status=eq.new');
        } catch (_) {
          newEnquiries = enquiries;
        }
        return json(res, 200, { enquiries, newEnquiries, profiles, imports, newsletter });
      }

      if (resource === 'enquiries') {
        // Prefer full admin columns (009); fall back if status/admin_notes not migrated yet
        let data;
        try {
          ({ data } = await sb(
            'form_submissions?select=id,form_type,name,email,phone,message,metadata,status,admin_notes,created_at&order=created_at.desc&limit=200'
          ));
        } catch (_) {
          ({ data } = await sb(
            'form_submissions?select=id,form_type,name,email,phone,message,metadata,created_at&order=created_at.desc&limit=200'
          ));
        }
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'members') {
        const { data } = await sb(
          'profiles?select=id,full_name,email,phone,plan,association_member,welfare_member,member_number,created_at&order=created_at.desc&limit=200'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'imports') {
        const filter = url.searchParams.get('filter') || 'all';
        let query =
          'member_imports?select=member_number,full_name,email,plan,membership_label,status,association_member,welfare_member&order=member_number.asc&limit=600';
        if (filter === 'association') {
          query += '&association_member=eq.true&welfare_member=eq.false';
        } else if (filter === 'welfare') {
          query += '&welfare_member=eq.true&association_member=eq.false';
        } else if (filter === 'both') {
          query += '&association_member=eq.true&welfare_member=eq.true';
        } else if (filter === 'association_any') {
          query += '&association_member=eq.true';
        } else if (filter === 'welfare_any') {
          query += '&welfare_member=eq.true';
        } else if (filter === 'pending') {
          query += '&status=eq.pending_invite';
        }
        const [{ data: rows }, statsRes] = await Promise.all([
          sb(query),
          sb('member_import_stats?select=*').catch(() => ({ data: null }))
        ]);
        const stats = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
        return json(res, 200, { rows: rows || [], stats: stats || null, filter });
      }

      if (resource === 'events') {
        let data;
        try {
          ({ data } = await sb(
            'events?select=id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published,phase_override&order=start_at.desc&limit=100'
          ));
        } catch (_) {
          ({ data } = await sb(
            'events?select=id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published&order=start_at.desc&limit=100'
          ));
        }
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'sponsors') {
        const { data } = await sb(
          'sponsors?select=id,name,tier,website,is_published,sort_order&limit=100'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'gallery') {
        const { data } = await sb(
          'gallery_albums?select=id,title,event_date,is_published,preview_limit,group_id&order=event_date.desc.nullslast&limit=100'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'newsletter') {
        const { data } = await sb(
          'newsletter_subscribers?select=email,list_key,subscribed_at&order=subscribed_at.desc&limit=200'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'announcements') {
        const { data } = await sb(
          'announcements?select=id,title,body,audience,is_published,published_at&order=published_at.desc&limit=50'
        );
        return json(res, 200, { rows: data || [] });
      }

      return json(res, 400, { error: 'Unknown resource' });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (resource === 'seed-events') {
        const { data } = await sb('events?on_conflict=id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: JSON.stringify(SEED_EVENTS)
        });
        return json(res, 200, { ok: true, count: Array.isArray(data) ? data.length : SEED_EVENTS.length });
      }

      if (resource === 'event-create') {
        const title = String(body.title || '').trim();
        if (!title) return json(res, 400, { error: 'Title is required' });
        const startAt = String(body.start_at || '').trim();
        if (!startAt) return json(res, 400, { error: 'Start date/time is required' });
        const endAt = String(body.end_at || startAt).trim();
        const id = slugifyId(body.id || `${title}-${startAt.slice(0, 10)}`);
        const phaseOverride = normalizePhaseOverride(body.phase_override);
        const row = {
          id,
          title,
          summary: String(body.summary || '').trim() || null,
          location: String(body.location || '').trim() || null,
          meta: String(body.meta || '').trim() || null,
          badge: String(body.badge || '').trim() || null,
          image_path:
            String(body.image_path || '').trim() ||
            'wp-content/uploads/2025/09/Celebration.jpg',
          booking_url: String(body.booking_url || '').trim() || null,
          gallery_url: String(body.gallery_url || '').trim() || null,
          start_at: startAt,
          end_at: endAt,
          featured: Boolean(body.featured),
          registration_open: Boolean(body.registration_open),
          is_published: body.is_published !== false,
          phase_override: phaseOverride
        };
        const { data } = await sb('events', {
          method: 'POST',
          body: JSON.stringify(row)
        });
        return json(res, 200, { rows: data || [row] });
      }

      if (resource === 'event-photos') {
        const eventId = String(body.event_id || '').trim();
        const photos = Array.isArray(body.photos) ? body.photos : [];
        if (!eventId) return json(res, 400, { error: 'event_id is required' });
        if (!photos.length) return json(res, 400, { error: 'Add at least one photo' });
        if (photos.length > 6) return json(res, 400, { error: 'Upload up to 6 photos at a time' });

        const { data: eventRows } = await sb(
          `events?id=eq.${encodeURIComponent(eventId)}&select=id,title,gallery_url,end_at,start_at`
        );
        const event = Array.isArray(eventRows) ? eventRows[0] : null;
        if (!event) return json(res, 404, { error: 'Event not found' });

        const albumId = `event-${eventId}`.slice(0, 80);
        const eventDate = String(event.end_at || event.start_at || '').slice(0, 10) || null;
        await sb('gallery_albums?on_conflict=id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: JSON.stringify([
            {
              id: albumId,
              title: `${event.title} photos`,
              description: `Photos from ${event.title}`,
              event_date: eventDate,
              group_id: 'recent',
              sort_date: eventDate,
              preview_limit: 12,
              is_published: true
            }
          ])
        });

        const uploaded = [];
        for (let i = 0; i < photos.length; i += 1) {
          const photo = photos[i] || {};
          const decoded = decodeDataUrl(photo.dataUrl);
          if (!decoded) continue;
          if (!String(decoded.contentType || '').startsWith('image/')) {
            return json(res, 400, { error: 'Only image uploads are allowed' });
          }
          if (decoded.bytes.length > 3.5e6) {
            return json(res, 400, { error: 'Each photo must be under about 3.5 MB' });
          }
          const ext =
            decoded.contentType.includes('png')
              ? 'png'
              : decoded.contentType.includes('webp')
                ? 'webp'
                : decoded.contentType.includes('gif')
                  ? 'gif'
                  : 'jpg';
          const safeName = slugifyId(photo.name || `photo-${i + 1}`);
          const objectPath = `${albumId}/${Date.now()}-${i}-${safeName}.${ext}`;
          const publicUrl = await uploadGalleryObject(objectPath, decoded.bytes, decoded.contentType);
          await sb('gallery_photos', {
            method: 'POST',
            body: JSON.stringify({
              album_id: albumId,
              storage_path: publicUrl,
              alt_text: photo.alt || `${event.title} photo ${i + 1}`,
              download_name: `${safeName}.${ext}`,
              sort_order: i,
              is_member_only: false
            })
          });
          uploaded.push(publicUrl);
        }

        if (!uploaded.length) {
          return json(res, 400, { error: 'No valid image data received' });
        }

        const galleryUrl = `gallery.html#${albumId}`;
        const eventPatch = { gallery_url: galleryUrl };
        if (body.move_to_recent !== false) {
          eventPatch.phase_override = 'most-recent';
        }
        try {
          await sb(`events?id=eq.${encodeURIComponent(eventId)}`, {
            method: 'PATCH',
            body: JSON.stringify(eventPatch)
          });
        } catch (_) {
          await sb(`events?id=eq.${encodeURIComponent(eventId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ gallery_url: galleryUrl })
          });
        }

        return json(res, 200, {
          ok: true,
          album_id: albumId,
          gallery_url: galleryUrl,
          uploaded: uploaded.length
        });
      }

      if (resource === 'announcement-create') {
        const title = String(body.title || '').trim();
        const announcementBody = String(body.body || '').trim();
        const audience = ['all', 'association', 'welfare'].includes(body.audience) ? body.audience : 'all';
        if (!title || !announcementBody) {
          return json(res, 400, { error: 'Title and body are required' });
        }
        const { data } = await sb('announcements', {
          method: 'POST',
          body: JSON.stringify({
            title,
            body: announcementBody,
            audience,
            is_published: body.is_published !== false,
            published_at: new Date().toISOString()
          })
        });
        return json(res, 200, { rows: data || [] });
      }

      return json(res, 400, { error: 'Unknown POST resource' });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);

      if (resource === 'enquiry-status') {
        const { data } = await sb(`form_submissions?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: body.status })
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'approve-welfare') {
        const id = body.id;
        const { data: rows } = await sb(
          `profiles?id=eq.${encodeURIComponent(id)}&select=id,association_member,plan`
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return json(res, 404, { error: 'Profile not found' });
        const nextPlan = row.association_member !== false ? 'both' : 'welfare';
        const { data } = await sb(`profiles?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            welfare_member: true,
            association_member: row.association_member !== false,
            plan: nextPlan
          })
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'gallery-publish') {
        const { data } = await sb(`gallery_albums?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_published: Boolean(body.is_published) })
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'event-update') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Event id is required' });
        const patch = {};
        if (body.title != null) patch.title = String(body.title).trim();
        if (body.summary != null) patch.summary = String(body.summary).trim() || null;
        if (body.location != null) patch.location = String(body.location).trim() || null;
        if (body.meta != null) patch.meta = String(body.meta).trim() || null;
        if (body.badge != null) patch.badge = String(body.badge).trim() || null;
        if (body.image_path != null) patch.image_path = String(body.image_path).trim() || null;
        if (body.booking_url != null) patch.booking_url = String(body.booking_url).trim() || null;
        if (body.gallery_url != null) patch.gallery_url = String(body.gallery_url).trim() || null;
        if (body.start_at != null) patch.start_at = String(body.start_at).trim();
        if (body.end_at != null) patch.end_at = String(body.end_at).trim() || null;
        if (body.featured != null) patch.featured = Boolean(body.featured);
        if (body.registration_open != null) patch.registration_open = Boolean(body.registration_open);
        if (body.is_published != null) patch.is_published = Boolean(body.is_published);
        if (body.phase_override !== undefined) {
          patch.phase_override = normalizePhaseOverride(body.phase_override);
        }
        if (!Object.keys(patch).length) {
          return json(res, 400, { error: 'No fields to update' });
        }
        const { data } = await sb(`events?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch)
        });
        return json(res, 200, { rows: data || [] });
      }

      return json(res, 400, { error: 'Unknown PATCH resource' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, err.status || 500, {
      error: err.message || 'Server error',
      details: err.details || null
    });
  }
};
