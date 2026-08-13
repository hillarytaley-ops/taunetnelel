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

let sendPaidInvoiceReceiptEmail;
try {
  ({ sendPaidInvoiceReceiptEmail } = require('../lib/invoice-service'));
} catch (_) {
  sendPaidInvoiceReceiptEmail = null;
}

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
  // Allow same-site relative paths used by Events / Gallery / Pay portals.
  if (/^[a-z0-9][\w./?&=%#+-]*$/i.test(s)) return s;
  return null;
}

function encodeTicketsQuery(tickets) {
  if (!Array.isArray(tickets) || !tickets.length) return '';
  return tickets
    .map((t) => `${encodeURIComponent(t.id)}:${Math.round(Number(t.amount_cents))}`)
    .join(',');
}

function parseTicketsQuery(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const tickets = [];
  text.split(',').forEach((part) => {
    const [idRaw, centsRaw] = part.split(':');
    const id = String(idRaw || '')
      .trim()
      .toLowerCase();
    const amount = Math.round(Number(centsRaw));
    if (!id || !Number.isFinite(amount) || amount <= 0) return;
    const label = id === 'couple' ? 'Two people' : id === 'single' ? 'Single' : id;
    tickets.push({ id, label, amount_cents: amount });
  });
  return tickets.length ? tickets : null;
}

function ticketsFromEventRow(row) {
  if (Array.isArray(row?.ticket_prices) && row.ticket_prices.length) {
    return row.ticket_prices;
  }
  if (typeof row?.ticket_prices === 'string') {
    try {
      const parsed = JSON.parse(row.ticket_prices);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) {
      /* ignore */
    }
  }
  try {
    const url = new URL(String(row?.booking_url || ''), 'https://taunetnelel.local/');
    const fromQuery = parseTicketsQuery(url.searchParams.get('t'));
    if (fromQuery) return fromQuery;
  } catch (_) {
    /* ignore */
  }
  if (Number(row?.fee_cents) > 0) {
    return [{ id: 'single', label: 'Single', amount_cents: Math.round(Number(row.fee_cents)) }];
  }
  return [];
}

function bookingUrlForEvent(eventId, enableBooking, existing, tickets) {
  if (enableBooking === false) return null;
  const enabled =
    enableBooking === true ||
    enableBooking === '1' ||
    enableBooking === 1 ||
    enableBooking == null;
  if (!enabled && !existing) return null;
  if (!enabled) return existing || null;

  const params = new URLSearchParams();
  params.set('event', String(eventId || '').trim());
  const encoded = encodeTicketsQuery(tickets);
  if (encoded) params.set('t', encoded);
  return `pay/event.html?${params.toString()}`;
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

async function nextGallerySortOrder(albumId) {
  const { data } = await sb(
    `gallery_photos?album_id=eq.${encodeURIComponent(albumId)}&select=sort_order&order=sort_order.desc&limit=1`
  );
  const last = Array.isArray(data) && data[0] ? Number(data[0].sort_order) : -1;
  return Number.isFinite(last) ? last + 1 : 0;
}

async function ensureGalleryAlbumRow(album) {
  await sb('gallery_albums?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify([
      {
        id: album.id,
        title: album.title,
        description: album.description || null,
        event_date: album.event_date || null,
        group_id: album.group_id || 'recent',
        sort_date: album.event_date || album.sort_date || null,
        preview_limit: album.preview_limit || 12,
        is_published: album.is_published !== false
      }
    ])
  });
}

async function saveGalleryPhoto({ albumId, photo, sortOrder, altFallback }) {
  const decoded = decodeDataUrl(photo && photo.dataUrl);
  if (!decoded) {
    throw Object.assign(new Error('Invalid image data'), { status: 400 });
  }
  if (!isAllowedImageType(decoded.contentType)) {
    throw Object.assign(new Error('Only jpeg, png, webp, or gif uploads are allowed'), { status: 400 });
  }
  if (decoded.bytes.length > 3.5e6) {
    throw Object.assign(new Error('Each photo must be under about 3.5 MB'), { status: 400 });
  }
  const ext = decoded.contentType.includes('png')
    ? 'png'
    : decoded.contentType.includes('webp')
      ? 'webp'
      : decoded.contentType.includes('gif')
        ? 'gif'
        : 'jpg';
  const safeName = slugifyId(photo.name || `photo-${sortOrder + 1}`);
  const objectPath = `${albumId}/${Date.now()}-${sortOrder}-${safeName}.${ext}`;
  const publicUrl = await uploadGalleryObject(objectPath, decoded.bytes, decoded.contentType);
  await sb('gallery_photos', {
    method: 'POST',
    body: JSON.stringify({
      album_id: albumId,
      storage_path: publicUrl,
      alt_text: photo.alt || altFallback || safeName,
      download_name: `${safeName}.${ext}`,
      sort_order: sortOrder,
      is_member_only: false
    })
  });
  return publicUrl;
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

function isMissingTicketPricesError(err) {
  const text = `${err?.message || ''} ${JSON.stringify(err?.details || {})}`;
  return text.includes('ticket_prices');
}

function audToCents(value) {
  if (value === undefined || value === null || value === '') return null;
  // Admin sends AUD dollars (e.g. 100 or 100.00).
  const asCents = Math.round(Number(value) * 100);
  if (!Number.isFinite(asCents) || asCents < 0) return null;
  return asCents;
}

function parseEventFeeCents(body) {
  if (body?.fee_cents !== undefined && body?.fee_cents !== null && body?.fee_cents !== '') {
    const cents = Math.round(Number(body.fee_cents));
    if (!Number.isFinite(cents) || cents < 0) return null;
    return cents;
  }
  if (body?.fee_aud !== undefined && body?.fee_aud !== null && body?.fee_aud !== '') {
    return audToCents(body.fee_aud);
  }
  if (body?.fee_single_aud !== undefined && body?.fee_single_aud !== null && body?.fee_single_aud !== '') {
    return audToCents(body.fee_single_aud);
  }
  return null;
}

/**
 * Build ticket_prices JSON for Book & PayID.
 * Accepts ticket_prices array, or fee_single_aud / fee_couple_aud (AUD dollars).
 */
function parseTicketPrices(body) {
  if (body?.ticket_prices === null) return null;
  if (Array.isArray(body?.ticket_prices)) {
    const tickets = body.ticket_prices
      .map((item, index) => {
        const amount = Math.round(Number(item?.amount_cents));
        if (!Number.isFinite(amount) || amount <= 0) return null;
        const id = String(item?.id || `ticket-${index + 1}`)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '') || `ticket-${index + 1}`;
        const label = String(item?.label || id).trim() || id;
        return { id, label, amount_cents: amount };
      })
      .filter(Boolean);
    return tickets.length ? tickets : null;
  }

  const tickets = [];
  const single =
    body?.fee_single_aud !== undefined
      ? audToCents(body.fee_single_aud)
      : body?.fee_aud !== undefined
        ? audToCents(body.fee_aud)
        : body?.fee_cents !== undefined && body?.fee_cents !== null && body?.fee_cents !== ''
          ? Math.round(Number(body.fee_cents))
          : null;
  const couple = audToCents(body?.fee_couple_aud);
  if (Number.isFinite(single) && single > 0) {
    tickets.push({ id: 'single', label: 'Single', amount_cents: single });
  }
  if (Number.isFinite(couple) && couple > 0) {
    tickets.push({ id: 'couple', label: 'Two people', amount_cents: couple });
  }
  return tickets.length ? tickets : null;
}

/**
 * When an association (Basic $50) invoice is marked paid, unlock the member portal.
 */
async function activateAssociationMembership(invoice) {
  const email = String(invoice.email || '')
    .trim()
    .toLowerCase();
  const userId = invoice.user_id || null;
  let profile = null;

  if (userId) {
    const { data } = await sb(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,association_member,welfare_member,member_since,renews_at`
    );
    profile = Array.isArray(data) ? data[0] : null;
  }
  if (!profile && email) {
    const { data } = await sb(
      `profiles?email=eq.${encodeURIComponent(email)}&select=id,plan,association_member,welfare_member,member_since,renews_at&limit=1`
    );
    profile = Array.isArray(data) ? data[0] : null;
  }
  if (!profile) return null;

  const welfare = Boolean(profile.welfare_member);
  const nextPlan = welfare ? 'both' : 'basic';
  const year = new Date().getFullYear();
  const patch = {
    association_member: true,
    plan: nextPlan,
    updated_at: new Date().toISOString(),
  };
  if (!profile.member_since) patch.member_since = year;
  if (!profile.renews_at) patch.renews_at = `${year + 1}-12-31`;

  const { data } = await sb(`profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return Array.isArray(data) ? data[0] : data;
}

/**
 * When a welfare invoice is marked paid, unlock welfare (and association) when due.
 * Full $300: unlock immediately. Installments: unlock when all 3 in the series are paid.
 */
async function activateWelfareMembership(invoice) {
  const {
    welfareSeriesFullyPaid,
  } = require('../lib/invoice-service');

  const ready = await welfareSeriesFullyPaid({ ...invoice, status: 'paid' });
  if (!ready) return null;

  const email = String(invoice.email || '')
    .trim()
    .toLowerCase();
  const userId = invoice.user_id || null;
  let profile = null;

  if (userId) {
    const { data } = await sb(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,association_member,welfare_member,member_since,renews_at`
    );
    profile = Array.isArray(data) ? data[0] : null;
  }
  if (!profile && email) {
    const { data } = await sb(
      `profiles?email=eq.${encodeURIComponent(email)}&select=id,plan,association_member,welfare_member,member_since,renews_at&limit=1`
    );
    profile = Array.isArray(data) ? data[0] : null;
  }
  if (!profile) return null;

  const year = new Date().getFullYear();
  const patch = {
    association_member: true,
    welfare_member: true,
    plan: 'both',
    updated_at: new Date().toISOString(),
  };
  if (!profile.member_since) patch.member_since = year;
  if (!profile.renews_at) patch.renews_at = `${year + 1}-12-31`;

  const { data } = await sb(`profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return Array.isArray(data) ? data[0] : data;
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
    id: 'men-s-camp-2026-08-01',
    title: "Men's Camp",
    summary:
      'All States Men’s Camp — book and pay by PayID or bank transfer ($100 single / $150 two people).',
    location: 'Springbrook',
    meta: '1–2 August 2026 · Springbrook',
    badge: 'Recently ended',
    image_path: 'wp-content/uploads/2025/09/Celebration.jpg',
    booking_url: 'pay/event.html?event=men-s-camp-2026-08-01',
    gallery_url: 'gallery.html#men-s-camp-2026-08-01',
    start_at: '2026-08-01T21:00:00+00:00',
    end_at: '2026-08-02T21:00:00+00:00',
    featured: true,
    registration_open: true,
    is_published: true,
    fee_cents: 10000,
    ticket_prices: [
      { id: 'single', label: 'Single', amount_cents: 10000 },
      { id: 'couple', label: 'Two people', amount_cents: 15000 }
    ]
  },
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
        let itHelpOpen = 0;
        try {
          itHelpOpen = await countRows('it_help_threads', 'status=eq.open');
        } catch (_) {
          itHelpOpen = 0;
        }
        return json(res, 200, { enquiries, newEnquiries, profiles, imports, newsletter, itHelpOpen });
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
        const selects = [
          'id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published,phase_override,fee_cents,ticket_prices',
          'id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published,phase_override,fee_cents',
          'id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published,fee_cents',
          'id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published'
        ];
        let data = null;
        let lastErr = null;
        for (const select of selects) {
          try {
            ({ data } = await sb(`events?select=${select}&order=start_at.desc&limit=100`));
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (lastErr && !data) throw lastErr;
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
        // Quote status column — PostgREST can mis-parse unquoted "status" in some setups
        let query =
          'invoices?select=id,invoice_number,email,full_name,kind,description,amount_cents,currency,status,pay_reference,event_id,issued_at,due_at,paid_at&order=issued_at.desc&limit=300';
        if (status === 'pending' || status === 'paid' || status === 'void') {
          query += `&status=eq.${encodeURIComponent(status)}`;
        }
        try {
          const { data } = await sb(query);
          const rows = Array.isArray(data) ? data : [];
          return json(res, 200, { rows, filter: status, count: rows.length });
        } catch (err) {
          // Fallback: load all, filter in memory if column filter fails
          try {
            const { data } = await sb(
              'invoices?select=id,invoice_number,email,full_name,kind,description,amount_cents,currency,status,pay_reference,event_id,issued_at,due_at,paid_at&order=issued_at.desc&limit=300'
            );
            let rows = Array.isArray(data) ? data : [];
            if (status === 'pending' || status === 'paid' || status === 'void') {
              rows = rows.filter((r) => String(r.status || '') === status);
            }
            return json(res, 200, {
              rows,
              filter: status,
              count: rows.length,
              warning: err.message || undefined,
            });
          } catch (err2) {
            return json(res, 200, {
              rows: [],
              warning:
                err2.message ||
                err.message ||
                'Invoices table missing. Run supabase/migrations/020_invoices.sql in Supabase.',
            });
          }
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

      if (resource === 'it-help-threads') {
        const status = url.searchParams.get('status') || 'open';
        let query =
          'it_help_threads?select=id,email,full_name,status,last_message_at,created_at&order=last_message_at.desc&limit=100';
        if (status === 'open' || status === 'closed') {
          query += `&status=eq.${encodeURIComponent(status)}`;
        }
        const { data } = await sb(query);
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'it-help-messages') {
        const threadId = String(url.searchParams.get('thread_id') || '').trim();
        if (!threadId) return json(res, 400, { error: 'thread_id required' });
        const { data: threads } = await sb(
          `it_help_threads?id=eq.${encodeURIComponent(threadId)}&select=id,email,full_name,status,last_message_at&limit=1`
        );
        const thread = Array.isArray(threads) ? threads[0] : null;
        if (!thread) return json(res, 404, { error: 'Thread not found' });
        const { data: messages } = await sb(
          `it_help_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=id,sender,body,created_at&order=created_at.asc&limit=200`
        );
        return json(res, 200, { thread, messages: messages || [] });
      }

      return json(res, 400, { error: 'Unknown resource' });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (resource === 'it-help-reply') {
        const threadId = String(body.thread_id || '').trim();
        const text = String(body.body || '').trim();
        if (!threadId) return json(res, 400, { error: 'thread_id required' });
        if (text.length < 1 || text.length > 2000) {
          return json(res, 400, { error: 'Enter a reply.' });
        }
        await sb('it_help_messages', {
          method: 'POST',
          prefer: 'return=minimal',
          body: JSON.stringify({ thread_id: threadId, sender: 'it', body: text })
        });
        await sb(`it_help_threads?id=eq.${encodeURIComponent(threadId)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({
            status: 'open',
            last_message_at: new Date().toISOString()
          })
        });
        return json(res, 200, { ok: true });
      }

      if (resource === 'it-help-close') {
        const threadId = String(body.thread_id || '').trim();
        const nextStatus = body.status === 'closed' ? 'closed' : 'open';
        if (!threadId) return json(res, 400, { error: 'thread_id required' });
        await sb(`it_help_threads?id=eq.${encodeURIComponent(threadId)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ status: nextStatus })
        });
        return json(res, 200, { ok: true, status: nextStatus });
      }

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
        const postSeed = (rows) =>
          sb('events?on_conflict=id', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: JSON.stringify(rows)
          });
        try {
          const { data } = await postSeed(SEED_EVENTS);
          return json(res, 200, {
            ok: true,
            count: Array.isArray(data) ? data.length : SEED_EVENTS.length
          });
        } catch (err) {
          if (!isMissingTicketPricesError(err) && !isMissingFeeCentsError(err)) throw err;
          const stripped = SEED_EVENTS.map((row) => {
            const next = { ...row };
            if (isMissingTicketPricesError(err)) delete next.ticket_prices;
            if (isMissingFeeCentsError(err)) delete next.fee_cents;
            return next;
          });
          const { data } = await postSeed(stripped);
          return json(res, 200, {
            ok: true,
            count: Array.isArray(data) ? data.length : stripped.length,
            warning:
              'Seeded events. Run APPLY-INVOICES.sql (migration 022) so Single / Two people prices save on the event row.'
          });
        }
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
            const ticketsNoFlyer = parseTicketPrices(body);
            const feeNoFlyer = ticketsNoFlyer?.[0]?.amount_cents ?? parseEventFeeCents(body);
            const enablePayNoFlyer =
              body.enable_payid_booking != null
                ? Boolean(body.enable_payid_booking)
                : Boolean(ticketsNoFlyer?.length || feeNoFlyer);
            const row = {
              id,
              title,
              summary: String(body.summary || '').trim() || null,
              location: String(body.location || '').trim() || null,
              meta: String(body.meta || '').trim() || null,
              badge: String(body.badge || '').trim() || null,
              image_path: imagePath,
              booking_url:
                safeHttpUrl(body.booking_url) ||
                bookingUrlForEvent(id, enablePayNoFlyer, null, ticketsNoFlyer),
              gallery_url: safeHttpUrl(body.gallery_url),
              start_at: startAt,
              end_at: endAt,
              featured: Boolean(body.featured),
              registration_open: Boolean(body.registration_open) || enablePayNoFlyer,
              is_published: body.is_published !== false,
              phase_override: requestedPhase,
              fee_cents: feeNoFlyer,
              ticket_prices: ticketsNoFlyer
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
              if (
                !isMissingPhaseOverrideError(createErr) &&
                !isMissingFeeCentsError(createErr) &&
                !isMissingTicketPricesError(createErr)
              ) {
                throw createErr;
              }
              const { phase_override, fee_cents, ticket_prices, ...withoutOptional } = row;
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

        const tickets = parseTicketPrices(body);
        const feeCents = tickets?.[0]?.amount_cents ?? parseEventFeeCents(body);
        const enablePay =
          body.enable_payid_booking != null
            ? Boolean(body.enable_payid_booking)
            : Boolean(tickets?.length || feeCents);
        const row = {
          id,
          title,
          summary: String(body.summary || '').trim() || null,
          location: String(body.location || '').trim() || null,
          meta: String(body.meta || '').trim() || null,
          badge: String(body.badge || '').trim() || null,
          image_path: imagePath,
          booking_url: safeHttpUrl(body.booking_url) || bookingUrlForEvent(id, enablePay, null, tickets),
          gallery_url: safeHttpUrl(body.gallery_url),
          start_at: startAt,
          end_at: endAt,
          featured: Boolean(body.featured),
          registration_open: Boolean(body.registration_open) || enablePay,
          is_published: body.is_published !== false,
          phase_override: requestedPhase,
          fee_cents: feeCents,
          ticket_prices: tickets
        };

        try {
          const { data } = await sb('events', {
            method: 'POST',
            body: JSON.stringify(row)
          });
          return json(res, 200, { rows: data || [row] });
        } catch (err) {
          if (
            !isMissingPhaseOverrideError(err) &&
            !isMissingFeeCentsError(err) &&
            !isMissingTicketPricesError(err)
          ) {
            throw err;
          }
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
          if (isMissingTicketPricesError(err)) {
            const { ticket_prices, ...withoutTickets } = fallback;
            fallback = withoutTickets;
            warnings.push(
              'Saved without ticket_prices. Run migration 022 for Single / Two people Admin pricing.'
            );
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

      if (resource === 'gallery-upload' || resource === 'event-photos') {
        const eventId = String(body.event_id || '').trim();
        let albumId = String(body.album_id || '').trim();
        const photos = Array.isArray(body.photos)
          ? body.photos
          : body.photo
            ? [body.photo]
            : [];
        if (!photos.length) return json(res, 400, { error: 'Add at least one photo' });
        if (photos.length > 8) {
          return json(res, 400, { error: 'Send up to 8 photos per request. The admin page uploads in small batches.' });
        }

        let event = null;
        if (eventId) {
          const { data: eventRows } = await sb(
            `events?id=eq.${encodeURIComponent(eventId)}&select=id,title,gallery_url,end_at,start_at`
          );
          event = Array.isArray(eventRows) ? eventRows[0] : null;
          if (!event) return json(res, 404, { error: 'Event not found' });
          albumId = albumId || `event-${eventId}`.slice(0, 80);
        }

        const title = String(body.title || event?.title || '').trim();
        if (!albumId) {
          if (title.length < 2) {
            return json(res, 400, { error: 'Enter an album title or choose an event.' });
          }
          albumId = slugifyId(title).slice(0, 80);
        }

        const eventDate =
          String(body.event_date || '').slice(0, 10) ||
          String(event?.end_at || event?.start_at || '').slice(0, 10) ||
          null;
        const groupId = ['recent', 'past'].includes(body.group_id) ? body.group_id : 'recent';

        const { data: existingAlbums } = await sb(
          `gallery_albums?id=eq.${encodeURIComponent(albumId)}&select=id,title&limit=1`
        );
        const existingAlbum = Array.isArray(existingAlbums) ? existingAlbums[0] : null;
        if (!existingAlbum) {
          await ensureGalleryAlbumRow({
            id: albumId,
            title: event ? `${event.title} photos` : title || albumId,
            description: body.description || (event ? `Photos from ${event.title}` : ''),
            event_date: eventDate,
            group_id: groupId,
            preview_limit: 12,
            is_published: body.is_published !== false
          });
        }

        let sortOrder =
          body.sort_order == null || body.sort_order === ''
            ? await nextGallerySortOrder(albumId)
            : Number(body.sort_order);
        if (!Number.isFinite(sortOrder) || sortOrder < 0) {
          sortOrder = await nextGallerySortOrder(albumId);
        }

        const uploaded = [];
        for (let i = 0; i < photos.length; i += 1) {
          const publicUrl = await saveGalleryPhoto({
            albumId,
            photo: photos[i] || {},
            sortOrder: sortOrder + i,
            altFallback: `${title || albumId} photo ${sortOrder + i + 1}`
          });
          uploaded.push(publicUrl);
        }

        const galleryUrl = `gallery.html#${albumId}`;
        if (eventId) {
          const eventPatch = { gallery_url: galleryUrl };
          if (body.move_to_recent !== false) eventPatch.phase_override = 'most-recent';
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

      if (resource === 'invoice-receipt') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Invoice id is required' });
        if (typeof sendPaidInvoiceReceiptEmail !== 'function') {
          return json(res, 500, { error: 'Invoice email service unavailable' });
        }
        const { data } = await sb(`invoices?id=eq.${encodeURIComponent(id)}&select=*`);
        const invoice = Array.isArray(data) ? data[0] : null;
        if (!invoice) return json(res, 404, { error: 'Invoice not found' });
        if (invoice.status !== 'paid') {
          return json(res, 400, { error: 'Only paid invoices can email a paid PDF receipt' });
        }
        if (!invoice.email) {
          return json(res, 400, { error: 'Invoice has no member email' });
        }
        try {
          await sendPaidInvoiceReceiptEmail(invoice);
          return json(res, 200, {
            ok: true,
            message: `Paid invoice PDF emailed to ${invoice.email}.`,
          });
        } catch (mailErr) {
          console.error('invoice-receipt email', mailErr);
          return json(res, 502, { error: mailErr.message || 'Could not email paid invoice' });
        }
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
        const invoice = Array.isArray(data) ? data[0] : null;

        // Activate Basic Plan membership when association invoice is paid
        if (status === 'paid' && invoice && invoice.kind === 'association') {
          try {
            await activateAssociationMembership(invoice);
          } catch (activateErr) {
            console.error('invoice-status activate membership', activateErr);
          }
        }

        // Activate Welfare Plus when full fee (or all installments) paid
        if (status === 'paid' && invoice && invoice.kind === 'welfare') {
          try {
            await activateWelfareMembership(invoice);
          } catch (activateErr) {
            console.error('invoice-status activate welfare', activateErr);
          }
        }

        // Email paid invoice PDF to the member automatically
        let receiptEmailed = false;
        let receiptError = null;
        if (status === 'paid' && invoice?.email && typeof sendPaidInvoiceReceiptEmail === 'function') {
          try {
            await sendPaidInvoiceReceiptEmail(invoice);
            receiptEmailed = true;
          } catch (mailErr) {
            console.error('invoice-status paid receipt email', mailErr);
            receiptError = mailErr.message || 'Could not email paid invoice.';
          }
        }

        return json(res, 200, {
          rows: data || [],
          receipt_emailed: receiptEmailed,
          receipt_error: receiptError,
        });
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
        if (
          body.fee_cents !== undefined ||
          body.fee_aud !== undefined ||
          body.fee_single_aud !== undefined ||
          body.fee_couple_aud !== undefined ||
          body.ticket_prices !== undefined
        ) {
          const tickets = parseTicketPrices(body);
          const feeCents = parseEventFeeCents(body);
          if (tickets) {
            patch.ticket_prices = tickets;
            patch.fee_cents = tickets[0].amount_cents;
          } else if (body.ticket_prices === null || body.fee_single_aud === '' || body.fee_cents === null) {
            patch.ticket_prices = null;
            patch.fee_cents = feeCents;
          } else if (feeCents != null) {
            patch.fee_cents = feeCents;
            patch.ticket_prices = [{ id: 'single', label: 'Single', amount_cents: feeCents }];
          }
          const resolvedTickets = patch.ticket_prices || tickets || null;
          if (body.enable_payid_booking != null) {
            patch.booking_url = bookingUrlForEvent(
              id,
              body.enable_payid_booking,
              null,
              resolvedTickets
            );
            if (body.enable_payid_booking) patch.registration_open = true;
          } else if (resolvedTickets && resolvedTickets.length) {
            patch.booking_url = bookingUrlForEvent(id, true, null, resolvedTickets);
            patch.registration_open = true;
          }
        }
        if (
          body.enable_payid_booking != null &&
          body.fee_cents === undefined &&
          body.fee_single_aud === undefined &&
          body.fee_couple_aud === undefined &&
          body.ticket_prices === undefined
        ) {
          patch.booking_url = bookingUrlForEvent(id, body.enable_payid_booking, null, null);
          if (body.enable_payid_booking) patch.registration_open = true;
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
          if (isMissingTicketPricesError(err) && patch.ticket_prices !== undefined) {
            const { ticket_prices, ...withoutTickets } = patch;
            // Keep prices in booking_url ?t= so Book & Pay still works before migration 022.
            if (Array.isArray(ticket_prices) && ticket_prices.length) {
              withoutTickets.booking_url = bookingUrlForEvent(
                id,
                body.enable_payid_booking !== false,
                withoutTickets.booking_url,
                ticket_prices
              );
              withoutTickets.fee_cents = ticket_prices[0].amount_cents;
            }
            const { data } = await sb(`events?id=eq.${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: JSON.stringify(withoutTickets)
            });
            return json(res, 200, {
              rows: data || [],
              warning:
                'Saved prices on the booking link. Run migration 022 in Supabase for full ticket_prices support.'
            });
          }
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

    if (req.method === 'DELETE') {
      const body = await readBody(req);

      if (resource === 'enquiry-delete') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Enquiry id is required' });
        await sb(`form_submissions?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        return json(res, 200, { ok: true, id });
      }

      if (resource === 'invoice-delete') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Invoice id is required' });
        await sb(`invoices?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        return json(res, 200, { ok: true, id });
      }

      return json(res, 400, { error: 'Unknown DELETE resource' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    return json(res, status, {
      error: err.message || 'Server error'
    });
  }
};
