/**
 * Committee admin data API (Supabase Auth + site_admins).
 * Vercel env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional bootstrap (server-only, never ship to frontend JS):
 *   ADMIN_BOOTSTRAP_PIN  (preferred) or ADMIN_PIN
 *
 * Client sends either:
 *   Authorization: Bearer <supabase access_token>
 *   or x-admin-bootstrap-pin: <env PIN>
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_BOOTSTRAP_PIN = String(
  process.env.ADMIN_BOOTSTRAP_PIN || process.env.ADMIN_PIN || ''
).trim();
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ENQUIRY_STATUSES = new Set(['new', 'reviewed', 'actioned', 'archived']);
const rateBuckets = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, limit = 120, windowMs = 60_000) {
  const ip = clientIp(req);
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const err = new Error('Too many requests. Try again shortly.');
    err.status = 429;
    throw err;
  }
}

function isAllowedImageType(contentType) {
  return ALLOWED_IMAGE_TYPES.has(String(contentType || '').toLowerCase().split(';')[0].trim());
}

function safeHttpUrl(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || s.startsWith('#')) return s;
  return null;
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return require('crypto').timingSafeEqual(left, right);
}

async function requireAdminAccess(req) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error('Server missing Supabase credentials');
    err.status = 500;
    throw err;
  }

  const bootstrapPin = String(req.headers['x-admin-bootstrap-pin'] || '').trim();
  if (bootstrapPin) {
    rateLimit(req, 20, 60_000);
    if (!ADMIN_BOOTSTRAP_PIN || !timingSafeEqualString(bootstrapPin, ADMIN_BOOTSTRAP_PIN)) {
      const err = new Error('Invalid bootstrap PIN');
      err.status = 401;
      throw err;
    }
    return {
      mode: 'bootstrap',
      email: 'bootstrap@local',
      admin: { email: 'bootstrap@local', full_name: 'Bootstrap PIN' },
      user: null
    };
  }

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const err = new Error('Sign in required (Auth account or bootstrap PIN)');
    err.status = 401;
    throw err;
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!userRes.ok) {
    const err = new Error('Invalid or expired session');
    err.status = 401;
    throw err;
  }
  const user = await userRes.json();
  const email = String(user.email || '')
    .toLowerCase()
    .trim();
  if (!email) {
    const err = new Error('Account has no email');
    err.status = 403;
    throw err;
  }

  const { data } = await sb(
    `site_admins?email=eq.${encodeURIComponent(email)}&select=email,full_name&limit=1`
  );
  if (!Array.isArray(data) || !data.length) {
    const err = new Error('Not authorized for committee admin');
    err.status = 403;
    throw err;
  }
  return { mode: 'auth', user, email, admin: data[0] };
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

let galleryBucketReady = false;

async function ensureGalleryBucket() {
  if (galleryBucketReady) return;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw Object.assign(new Error('Server missing Supabase storage credentials'), { status: 500 });
  }

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  const getRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/gallery`, { headers });
  if (getRes.ok) {
    galleryBucketReady = true;
    return;
  }

  const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: 'gallery',
      name: 'gallery',
      public: true,
      file_size_limit: 5242880,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    })
  });

  if (!createRes.ok && createRes.status !== 409) {
    const text = await createRes.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }
    const msg = String((data && (data.message || data.error)) || text || '');
    if (!/already exists|duplicate|exists/i.test(msg)) {
      const err = new Error(msg || 'Could not create gallery storage bucket');
      err.status = createRes.status;
      err.details = data;
      throw err;
    }
  }

  galleryBucketReady = true;
}

async function uploadGalleryObject(objectPath, bytes, contentType, retried = false) {
  await ensureGalleryBucket();

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
    const msg = String((data && (data.message || data.error)) || response.statusText || 'Storage upload failed');
    const missingBucket =
      response.status === 404 ||
      /bucket|not found|does not exist/i.test(msg);
    if (missingBucket && !retried) {
      galleryBucketReady = false;
      await ensureGalleryBucket();
      return uploadGalleryObject(objectPath, bytes, contentType, true);
    }
    const err = new Error(msg);
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

function isMissingPhaseOverrideError(err) {
  const text = `${err?.message || ''} ${JSON.stringify(err?.details || {})}`;
  return text.includes('phase_override');
}

function isMissingFeeCentsError(err) {
  const text = `${err?.message || ''} ${JSON.stringify(err?.details || {})}`;
  return text.includes('fee_cents');
}

function parseEventFeeCents(body) {
  if (body?.fee_cents === undefined || body?.fee_cents === null || body?.fee_cents === '') {
    return null;
  }
  const cents = Math.round(Number(body.fee_cents));
  if (!Number.isFinite(cents) || cents < 0) return null;
  return cents;
}

/** When phase_override column is missing, nudge dates so Auto placement still matches. */
function applyPhaseViaDates(row, phase) {
  if (!phase || phase === 'auto') return row;
  const now = Date.now();
  const startMs = new Date(row.start_at).getTime();
  const endMs = new Date(row.end_at || row.start_at).getTime();
  const durationMs =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? endMs - startMs
      : 4 * 60 * 60 * 1000;
  if (phase === 'upcoming') {
    const start = new Date(Math.max(now + 24 * 60 * 60 * 1000, Number.isFinite(startMs) ? startMs : 0));
    row.start_at = start.toISOString();
    row.end_at = new Date(start.getTime() + durationMs).toISOString();
  } else if (phase === 'present') {
    row.start_at = new Date(now - 60 * 60 * 1000).toISOString();
    row.end_at = new Date(now + Math.max(durationMs, 2 * 60 * 60 * 1000)).toISOString();
  } else if (phase === 'most-recent') {
    const end = new Date(now - 7 * 24 * 60 * 60 * 1000);
    row.end_at = end.toISOString();
    row.start_at = new Date(end.getTime() - durationMs).toISOString();
  } else if (phase === 'past') {
    const end = new Date(now - 100 * 24 * 60 * 60 * 1000);
    row.end_at = end.toISOString();
    row.start_at = new Date(end.getTime() - durationMs).toISOString();
  }
  return row;
}

async function uploadFlyerFromDataUrl(eventId, dataUrl, fileName) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) throw Object.assign(new Error('Invalid flyer image data'), { status: 400 });
  if (!isAllowedImageType(decoded.contentType)) {
    throw Object.assign(new Error('Flyer must be jpeg, png, webp, or gif'), { status: 400 });
  }
  if (decoded.bytes.length > 3.5e6) {
    throw Object.assign(new Error('Flyer must be under about 3.5 MB'), { status: 400 });
  }
  const ext = decoded.contentType.includes('png')
    ? 'png'
    : decoded.contentType.includes('webp')
      ? 'webp'
      : decoded.contentType.includes('gif')
        ? 'gif'
        : 'jpg';
  const safeName = slugifyId(fileName || 'flyer');
  const objectPath = `flyers/${eventId}/${Date.now()}-${safeName}.${ext}`;
  return uploadGalleryObject(objectPath, decoded.bytes, decoded.contentType);
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

  const url = new URL(req.url, 'http://localhost');
  const resource = url.searchParams.get('resource') || '';

  try {
    rateLimit(req);
    const adminSession = await requireAdminAccess(req);

    if (req.method === 'GET') {
      if (resource === 'session') {
        return json(res, 200, {
          ok: true,
          mode: adminSession.mode,
          email: adminSession.email,
          full_name: adminSession.admin.full_name || null,
          bootstrap_configured: Boolean(ADMIN_BOOTSTRAP_PIN)
        });
      }

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
            'events?select=id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published,phase_override,fee_cents&order=start_at.desc&limit=100'
          ));
        } catch (_) {
          try {
            ({ data } = await sb(
              'events?select=id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published,fee_cents&order=start_at.desc&limit=100'
            ));
          } catch (__) {
            ({ data } = await sb(
              'events?select=id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published&order=start_at.desc&limit=100'
            ));
          }
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
        let data;
        try {
          ({ data } = await sb(
            'gallery_albums?select=id,title,description,event_date,is_published,preview_limit,group_id,sort_date,gallery_photos(count)&order=sort_date.desc.nullslast&limit=100'
          ));
        } catch (_) {
          ({ data } = await sb(
            'gallery_albums?select=id,title,event_date,is_published,preview_limit,group_id&order=event_date.desc.nullslast&limit=100'
          ));
        }
        const rows = (data || []).map((row) => {
          const countWrap = Array.isArray(row.gallery_photos) ? row.gallery_photos[0] : row.gallery_photos;
          const photoCount =
            countWrap && typeof countWrap === 'object' && countWrap.count != null
              ? Number(countWrap.count)
              : null;
          const { gallery_photos, ...rest } = row;
          return { ...rest, photo_count: Number.isFinite(photoCount) ? photoCount : null };
        });
        return json(res, 200, { rows });
      }

      if (resource === 'newsletter') {
        const { data } = await sb(
          'newsletter_subscribers?select=email,list_key,subscribed_at&order=subscribed_at.desc&limit=200'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'invoices') {
        const status = url.searchParams.get('status') || 'all';
        let query =
          'invoices?select=id,invoice_number,email,full_name,kind,description,amount_cents,currency,status,pay_reference,event_id,issued_at,due_at,paid_at&order=issued_at.desc&limit=300';
        if (status === 'pending' || status === 'paid' || status === 'void') {
          query += `&status=eq.${status}`;
        }
        try {
          const { data } = await sb(query);
          return json(res, 200, { rows: data || [] });
        } catch (err) {
          return json(res, 200, {
            rows: [],
            warning:
              err.message ||
              'Invoices table missing. Run supabase/migrations/020_invoices.sql in Supabase.',
          });
        }
      }

      if (resource === 'announcements') {
        const { data } = await sb(
          'announcements?select=id,title,body,audience,is_published,published_at&order=published_at.desc&limit=50'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'business-content') {
        const [biz, news, blog] = await Promise.all([
          sb('businesses?select=*&order=name.asc'),
          sb('business_news?select=*&order=published_date.desc.nullslast'),
          sb('business_blog?select=*&order=published_date.desc.nullslast').catch(() => ({ data: [] }))
        ]);
        return json(res, 200, {
          updatedAt: new Date().toISOString(),
          businesses: (biz.data || []).map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category || '',
            description: row.description || '',
            contactName: row.contact_name || '',
            phone: row.phone || '',
            email: row.email || '',
            website: row.website || '',
            location: row.location || '',
            is_published: row.is_published !== false
          })),
          news: (news.data || []).map((row) => ({
            id: row.id,
            title: row.title,
            date: row.published_date || '',
            summary: row.summary || '',
            body: row.body || '',
            is_published: row.is_published !== false
          })),
          blog: (blog.data || []).map((row) => ({
            id: row.id,
            title: row.title,
            date: row.published_date || '',
            author: row.author || 'Taunet Nelel Team',
            summary: row.summary || '',
            body: row.body || '',
            is_published: row.is_published !== false
          }))
        });
      }

      return json(res, 400, { error: 'Unknown resource' });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (resource === 'business-content-save') {
        const businesses = Array.isArray(body.businesses) ? body.businesses : [];
        const news = Array.isArray(body.news) ? body.news : [];
        const blog = Array.isArray(body.blog) ? body.blog : [];

        const bizRows = businesses
          .map((item) => {
            const id = String(item.id || '').trim();
            const name = String(item.name || item.title || '').trim();
            if (!id || !name) return null;
            return {
              id,
              name,
              category: String(item.category || '').trim() || null,
              description: String(item.description || item.summary || '').trim() || null,
              contact_name: String(item.contactName || '').trim() || null,
              phone: String(item.phone || '').trim() || null,
              email: String(item.email || '').trim() || null,
              website: safeHttpUrl(item.website),
              location: String(item.location || '').trim() || null,
              is_published: item.is_published !== false
            };
          })
          .filter(Boolean);

        const newsRows = news
          .map((item) => {
            const id = String(item.id || '').trim();
            const title = String(item.title || '').trim();
            if (!id || !title) return null;
            return {
              id,
              title,
              published_date: String(item.date || '').trim() || null,
              summary: String(item.summary || '').trim() || null,
              body: String(item.body || '').trim() || null,
              is_published: item.is_published !== false
            };
          })
          .filter(Boolean);

        const blogRows = blog
          .map((item) => {
            const id = String(item.id || '').trim();
            const title = String(item.title || '').trim();
            if (!id || !title) return null;
            return {
              id,
              title,
              published_date: String(item.date || '').trim() || null,
              author: String(item.author || 'Taunet Nelel Team').trim() || null,
              summary: String(item.summary || '').trim() || null,
              body: String(item.body || '').trim() || null,
              is_published: item.is_published !== false
            };
          })
          .filter(Boolean);

        const existingBiz = await sb('businesses?select=id');
        const existingNews = await sb('business_news?select=id');
        let existingBlog = { data: [] };
        try {
          existingBlog = await sb('business_blog?select=id');
        } catch (_) {
          existingBlog = { data: [] };
        }

        const keepBiz = new Set(bizRows.map((r) => r.id));
        const keepNews = new Set(newsRows.map((r) => r.id));
        const keepBlog = new Set(blogRows.map((r) => r.id));

        for (const row of existingBiz.data || []) {
          if (!keepBiz.has(row.id)) {
            await sb(`businesses?id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
          }
        }
        for (const row of existingNews.data || []) {
          if (!keepNews.has(row.id)) {
            await sb(`business_news?id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
          }
        }
        for (const row of existingBlog.data || []) {
          if (!keepBlog.has(row.id)) {
            await sb(`business_blog?id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
          }
        }

        if (bizRows.length) {
          await sb('businesses?on_conflict=id', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=minimal',
            body: JSON.stringify(bizRows)
          });
        }
        if (newsRows.length) {
          await sb('business_news?on_conflict=id', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=minimal',
            body: JSON.stringify(newsRows)
          });
        }
        if (blogRows.length) {
          try {
            await sb('business_blog?on_conflict=id', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=minimal',
              body: JSON.stringify(blogRows)
            });
          } catch (err) {
            return json(res, 400, {
              error:
                err.message ||
                'business_blog table missing. Run migration 019_business_hub_cms.sql (or APPLY-REMAINING.sql).'
            });
          }
        }

        return json(res, 200, {
          ok: true,
          counts: { businesses: bizRows.length, news: newsRows.length, blog: blogRows.length }
        });
      }

      if (resource === 'seed-events') {
        const { data } = await sb('events?on_conflict=id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: JSON.stringify(SEED_EVENTS)
        });
        return json(res, 200, { ok: true, count: Array.isArray(data) ? data.length : SEED_EVENTS.length });
      }

      if (resource === 'seed-gallery') {
        const albums = Array.isArray(body.albums) ? body.albums : [];
        if (!albums.length) return json(res, 400, { error: 'No albums to seed' });

        let albumCount = 0;
        let photoCount = 0;
        for (const album of albums) {
          const id = String(album.id || '').trim();
          if (!id) continue;
          const eventDate = album.event_date || album.sort_date || null;
          await sb('gallery_albums?on_conflict=id', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: JSON.stringify([
              {
                id,
                title: String(album.title || id).trim(),
                description: String(album.description || '').trim() || null,
                event_date: eventDate,
                group_id: album.group_id === 'recent' ? 'recent' : 'past',
                sort_date: album.sort_date || eventDate,
                preview_limit: Number(album.preview_limit) || 12,
                is_published: album.is_published !== false
              }
            ])
          });
          albumCount += 1;

          const photos = Array.isArray(album.photos) ? album.photos : [];
          if (!photos.length) continue;

          await fetch(`${SUPABASE_URL}/rest/v1/gallery_photos?album_id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              Prefer: 'return=minimal'
            }
          });

          const photoRows = photos
            .map((photo, index) => {
              const path = String(photo.storage_path || photo.src || '').trim();
              if (!path) return null;
              return {
                album_id: id,
                storage_path: path,
                alt_text: String(photo.alt_text || photo.alt || '').trim() || null,
                download_name: String(photo.download_name || photo.downloadName || '').trim() || null,
                sort_order: Number.isFinite(Number(photo.sort_order)) ? Number(photo.sort_order) : index,
                is_member_only: false
              };
            })
            .filter(Boolean);

          if (photoRows.length) {
            await sb('gallery_photos', {
              method: 'POST',
              body: JSON.stringify(photoRows)
            });
            photoCount += photoRows.length;
          }
        }

        return json(res, 200, { ok: true, albums: albumCount, photos: photoCount });
      }

      if (resource === 'event-create') {
        const title = String(body.title || '').trim();
        if (!title) return json(res, 400, { error: 'Title is required' });
        const startAt = String(body.start_at || '').trim();
        if (!startAt) return json(res, 400, { error: 'Start date/time is required' });
        const endAt = String(body.end_at || startAt).trim();
        const id = slugifyId(body.id || `${title}-${startAt.slice(0, 10)}`);
        const requestedPhase = normalizePhaseOverride(body.phase_override);
        let imagePath =
          String(body.image_path || '').trim() ||
          'wp-content/uploads/2025/09/Celebration.jpg';

        if (body.flyer_data_url) {
          try {
            imagePath = await uploadFlyerFromDataUrl(id, body.flyer_data_url, body.flyer_name);
          } catch (err) {
            // Still save the event; surface flyer problem as a warning instead of blocking.
            const flyerWarning =
              err.message ||
              'Flyer upload failed. Event can still be saved without the flyer image.';
            const row = {
              id,
              title,
              summary: String(body.summary || '').trim() || null,
              location: String(body.location || '').trim() || null,
              meta: String(body.meta || '').trim() || null,
              badge: String(body.badge || '').trim() || null,
              image_path: imagePath,
              booking_url: safeHttpUrl(body.booking_url),
              gallery_url: safeHttpUrl(body.gallery_url),
              start_at: startAt,
              end_at: endAt,
              featured: Boolean(body.featured),
              registration_open: Boolean(body.registration_open),
              is_published: body.is_published !== false,
              phase_override: requestedPhase,
              fee_cents: parseEventFeeCents(body)
            };
            try {
              const { data } = await sb('events', {
                method: 'POST',
                body: JSON.stringify(row)
              });
              return json(res, 200, {
                rows: data || [row],
                warning: `Event saved without flyer. ${flyerWarning}`
              });
            } catch (createErr) {
              if (!isMissingPhaseOverrideError(createErr) && !isMissingFeeCentsError(createErr)) throw createErr;
              const { phase_override, fee_cents, ...withoutOptional } = row;
              if (isMissingPhaseOverrideError(createErr)) {
                applyPhaseViaDates(withoutOptional, requestedPhase || 'auto');
              }
              const { data } = await sb('events', {
                method: 'POST',
                body: JSON.stringify(withoutOptional)
              });
              return json(res, 200, {
                rows: data || [withoutOptional],
                warning: `Event saved without flyer. ${flyerWarning}`
              });
            }
          }
        }

        const row = {
          id,
          title,
          summary: String(body.summary || '').trim() || null,
          location: String(body.location || '').trim() || null,
          meta: String(body.meta || '').trim() || null,
          badge: String(body.badge || '').trim() || null,
          image_path: imagePath,
          booking_url: safeHttpUrl(body.booking_url),
          gallery_url: safeHttpUrl(body.gallery_url),
          start_at: startAt,
          end_at: endAt,
          featured: Boolean(body.featured),
          registration_open: Boolean(body.registration_open),
          is_published: body.is_published !== false,
          phase_override: requestedPhase,
          fee_cents: parseEventFeeCents(body)
        };

        try {
          const { data } = await sb('events', {
            method: 'POST',
            body: JSON.stringify(row)
          });
          return json(res, 200, { rows: data || [row] });
        } catch (err) {
          if (!isMissingPhaseOverrideError(err) && !isMissingFeeCentsError(err)) throw err;
          let fallback = { ...row };
          const warnings = [];
          if (isMissingPhaseOverrideError(err)) {
            const { phase_override, ...withoutPhase } = fallback;
            applyPhaseViaDates(withoutPhase, requestedPhase || 'auto');
            fallback = withoutPhase;
            warnings.push(
              'Saved without phase_override. Run migration 017 in Supabase to enable board overrides.'
            );
          }
          if (isMissingFeeCentsError(err)) {
            const { fee_cents, ...withoutFee } = fallback;
            fallback = withoutFee;
            warnings.push('Saved without fee_cents. Run migration 020 for event invoices.');
          }
          const { data } = await sb('events', {
            method: 'POST',
            body: JSON.stringify(fallback)
          });
          return json(res, 200, {
            rows: data || [fallback],
            warning: warnings.join(' ') || undefined
          });
        }
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
          if (!isAllowedImageType(decoded.contentType)) {
            return json(res, 400, { error: 'Only jpeg, png, webp, or gif uploads are allowed' });
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
        const status = String(body.status || '').trim();
        if (!ENQUIRY_STATUSES.has(status)) {
          return json(res, 400, { error: 'Invalid enquiry status' });
        }
        const { data } = await sb(`form_submissions?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status })
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

      if (resource === 'invoice-status') {
        const id = String(body.id || '').trim();
        const status = String(body.status || '').trim();
        if (!id) return json(res, 400, { error: 'Invoice id is required' });
        if (!['pending', 'paid', 'void'].includes(status)) {
          return json(res, 400, { error: 'Invalid invoice status' });
        }
        const patch = {
          status,
          updated_at: new Date().toISOString(),
        };
        if (status === 'paid') patch.paid_at = new Date().toISOString();
        if (status === 'pending') patch.paid_at = null;
        const { data } = await sb(`invoices?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
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
        if (body.booking_url != null) patch.booking_url = safeHttpUrl(body.booking_url);
        if (body.gallery_url != null) patch.gallery_url = safeHttpUrl(body.gallery_url);
        if (body.start_at != null) patch.start_at = String(body.start_at).trim();
        if (body.end_at != null) patch.end_at = String(body.end_at).trim() || null;
        if (body.featured != null) patch.featured = Boolean(body.featured);
        if (body.registration_open != null) patch.registration_open = Boolean(body.registration_open);
        if (body.is_published != null) patch.is_published = Boolean(body.is_published);
        if (body.fee_cents !== undefined) {
          if (body.fee_cents === null || body.fee_cents === '') {
            patch.fee_cents = null;
          } else {
            const cents = Math.round(Number(body.fee_cents));
            if (!Number.isFinite(cents) || cents < 0) {
              return json(res, 400, { error: 'fee_cents must be a non-negative number' });
            }
            patch.fee_cents = cents;
          }
        }
        if (body.flyer_data_url) {
          patch.image_path = await uploadFlyerFromDataUrl(id, body.flyer_data_url, body.flyer_name);
        }
        const requestedPhase =
          body.phase_override !== undefined ? normalizePhaseOverride(body.phase_override) : undefined;
        if (requestedPhase !== undefined) {
          patch.phase_override = requestedPhase;
        }
        if (!Object.keys(patch).length) {
          return json(res, 400, { error: 'No fields to update' });
        }
        try {
          const { data } = await sb(`events?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(patch)
          });
          return json(res, 200, { rows: data || [] });
        } catch (err) {
          if (!isMissingPhaseOverrideError(err) || requestedPhase === undefined) throw err;
          const { phase_override, ...withoutPhase } = patch;
          if (requestedPhase) {
            const { data: currentRows } = await sb(
              `events?id=eq.${encodeURIComponent(id)}&select=start_at,end_at`
            );
            const current = Array.isArray(currentRows) ? currentRows[0] : null;
            const dated = applyPhaseViaDates(
              {
                start_at: withoutPhase.start_at || current?.start_at,
                end_at: withoutPhase.end_at || current?.end_at
              },
              requestedPhase
            );
            withoutPhase.start_at = dated.start_at;
            withoutPhase.end_at = dated.end_at;
          }
          const { data } = await sb(`events?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(withoutPhase)
          });
          return json(res, 200, {
            rows: data || [],
            warning:
              'Updated without phase_override. Run migration 017 in Supabase to enable board overrides.'
          });
        }
      }

      return json(res, 400, { error: 'Unknown PATCH resource' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    return json(res, status, {
      error: err.message || 'Server error'
    });
  }
};
