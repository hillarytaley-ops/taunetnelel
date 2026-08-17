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
const CRM_FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'date', 'select', 'phone', 'email', 'toggle', 'money'
]);
const CRM_FIELD_GROUPS = new Set([
  'contact', 'personal', 'welfare', 'beneficiary', 'employment',
  'financial', 'communications', 'committee'
]);
const rateBuckets = new Map();

let sendPaidInvoiceReceiptEmail;
try {
  ({ sendPaidInvoiceReceiptEmail } = require('../lib/invoice-service'));
} catch (_) {
  sendPaidInvoiceReceiptEmail = null;
}

let sendResendBatch;
let buildCampaignMail;
let RESEND_FROM;
let PUBLIC_SITE_URL;
let deliverabilityHeaders;
try {
  ({
    sendResendBatch,
    buildCampaignMail,
    RESEND_FROM,
    PUBLIC_SITE_URL,
    deliverabilityHeaders
  } = require('../lib/member-mail'));
} catch (_) {
  sendResendBatch = null;
  buildCampaignMail = null;
}

let twilioConfigured;
let sendSms;
try {
  ({ twilioConfigured, sendSms } = require('../lib/sms'));
} catch (_) {
  twilioConfigured = () => false;
  sendSms = null;
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
    .map((t) => `${encodeURIComponent(t.id)}:${Math.round(Number(t.amount_cents) || 0)}`)
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
    if (!id || !Number.isFinite(amount) || amount < 0) return;
    const label =
      id === 'member'
        ? 'Member (80%)'
        : id === 'non_member'
          ? 'Non-member (100%)'
          : id === 'child_7_17'
            ? 'Child 7–17 (45%)'
            : id === 'child_0_6'
              ? 'Child 0–6 (free)'
              : id === 'couple'
                ? 'Two people'
                : id === 'single'
                  ? 'Single'
                  : id;
    tickets.push({ id, label, amount_cents: amount });
  });
  return tickets.length ? tickets : null;
}

function slugifyFieldKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function parseCrmOptions(raw, fieldType) {
  if (fieldType !== 'select') return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean).slice(0, 40);
  }
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeCrmFieldInput(body, existing) {
  const label = String(body.label || existing?.label || '').trim().slice(0, 120);
  if (!label) {
    const err = new Error('Field label is required');
    err.status = 400;
    throw err;
  }
  const fieldType = String(body.field_type || existing?.field_type || 'text').trim();
  if (!CRM_FIELD_TYPES.has(fieldType)) {
    const err = new Error('Invalid field type');
    err.status = 400;
    throw err;
  }
  const fieldGroup = String(body.field_group || existing?.field_group || 'contact').trim();
  if (!CRM_FIELD_GROUPS.has(fieldGroup)) {
    const err = new Error('Invalid field group');
    err.status = 400;
    throw err;
  }
  let visibility = String(body.visibility || existing?.visibility || 'member').trim();
  if (visibility !== 'admin') visibility = 'member';
  let isSensitive = body.is_sensitive != null ? Boolean(body.is_sensitive) : Boolean(existing?.is_sensitive);
  let memberEditable =
    body.member_editable != null ? Boolean(body.member_editable) : existing?.member_editable !== false;
  if (isSensitive) {
    visibility = 'admin';
    memberEditable = false;
  }
  if (visibility === 'admin') memberEditable = false;
  const fieldKey = existing?.field_key || slugifyFieldKey(body.field_key || label) || `field_${Date.now()}`;
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(fieldKey)) {
    const err = new Error('Invalid field key');
    err.status = 400;
    throw err;
  }
  const sortOrder = Number(body.sort_order);
  return {
    field_key: fieldKey,
    label,
    help_text: String(body.help_text != null ? body.help_text : existing?.help_text || '').trim().slice(0, 300) || null,
    field_type: fieldType,
    field_group: fieldGroup,
    options: parseCrmOptions(body.options != null ? body.options : existing?.options, fieldType),
    visibility,
    member_editable: memberEditable,
    is_sensitive: isSensitive,
    is_active: body.is_active != null ? Boolean(body.is_active) : existing?.is_active !== false,
    sort_order: Number.isFinite(sortOrder) ? Math.round(sortOrder) : Number(existing?.sort_order) || 0,
    updated_at: new Date().toISOString()
  };
}

function emailOk(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function loadUnsubscribedSet(channel) {
  const { data } = await sb(
    `crm_unsubscribes?select=email,phone,channel&or=(channel.eq.${channel},channel.eq.all)`
  );
  const emails = new Set();
  const phones = new Set();
  (data || []).forEach((row) => {
    if (row.email) emails.add(String(row.email).trim().toLowerCase());
    if (row.phone) phones.add(String(row.phone).replace(/\s/g, ''));
  });
  return { emails, phones };
}

function chunkList(items, size) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function collectCampaignRecipients(audience, channel, extraEmail) {
  const unsub = await loadUnsubscribedSet(channel);
  const people = [];
  if (audience === 'individual') {
    const email = String(extraEmail || '').trim().toLowerCase();
    if (!emailOk(email)) return [];
    if (unsub.emails.has(email)) {
      const err = new Error('That address has unsubscribed from committee emails.');
      err.status = 400;
      throw err;
    }
    const { data } = await sb(
      `profiles?email=eq.${encodeURIComponent(email)}&select=id,full_name,email,phone&limit=1`
    );
    const row = Array.isArray(data) ? data[0] : null;
    return [{
      email,
      phone: row?.phone || '',
      profile_id: row?.id || null,
      name: row?.full_name || 'there'
    }];
  }
  if (audience === 'newsletter') {
    const { data } = await sb(
      'newsletter_subscribers?select=email,subscribed_at&order=subscribed_at.desc&limit=2000'
    );
    (data || []).forEach((row) => {
      const email = String(row.email || '').trim().toLowerCase();
      if (emailOk(email) && !unsub.emails.has(email)) {
        people.push({ email, phone: '', profile_id: null, name: 'Subscriber' });
      }
    });
    return people;
  }
  let query =
    'profiles?select=id,full_name,email,phone,association_member,welfare_member&order=created_at.desc&limit=2000';
  if (audience === 'association') query += '&association_member=eq.true';
  if (audience === 'welfare') query += '&welfare_member=eq.true';
  const { data } = await sb(query);
  (data || []).forEach((row) => {
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.phone || '').trim();
    if (channel === 'email') {
      if (!emailOk(email) || unsub.emails.has(email)) return;
      people.push({
        email,
        phone,
        profile_id: row.id,
        name: row.full_name || 'Member'
      });
      return;
    }
    if (!phone || unsub.phones.has(phone.replace(/\s/g, ''))) return;
    people.push({
      email,
      phone,
      profile_id: row.id,
      name: row.full_name || 'Member'
    });
  });
  return people;
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
  if (req.body != null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return Promise.resolve(req.body);
    }
    if (typeof req.body === 'string') {
      try {
        return Promise.resolve(req.body ? JSON.parse(req.body) : {});
      } catch (_) {
        return Promise.resolve({});
      }
    }
  }
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
 * Build ticket_prices from a full (non-member 100%) base price.
 * Members 80% · Non-members 100% · Child 7-17 45% · Child 0-6 free.
 */
function buildTieredEventTickets(baseCents) {
  const base = Math.round(Number(baseCents));
  if (!Number.isFinite(base) || base < 0) return null;
  const tiers = [
    { id: 'member', label: 'Member (80%)', pct: 80 },
    { id: 'non_member', label: 'Non-member (100%)', pct: 100 },
    { id: 'child_7_17', label: 'Child 7–17 (45%)', pct: 45 },
    { id: 'child_0_6', label: 'Child 0–6 (free)', pct: 0 },
  ];
  return tiers.map((tier) => ({
    id: tier.id,
    label: tier.label,
    amount_cents: Math.round((base * tier.pct) / 100),
    pct: tier.pct,
  }));
}

function baseCentsFromTickets(tickets) {
  if (!Array.isArray(tickets) || !tickets.length) return null;
  const nonMember = tickets.find((t) => t.id === 'non_member');
  if (nonMember && Number.isFinite(Number(nonMember.amount_cents))) {
    return Math.round(Number(nonMember.amount_cents));
  }
  const single = tickets.find((t) => t.id === 'single');
  if (single && Number.isFinite(Number(single.amount_cents))) {
    return Math.round(Number(single.amount_cents));
  }
  const max = Math.max(...tickets.map((t) => Math.round(Number(t.amount_cents) || 0)));
  return Number.isFinite(max) && max >= 0 ? max : null;
}

/**
 * Build ticket_prices JSON for Book & PayID.
 * Accepts ticket_prices array, fee_base_aud / fee_full_aud (100% non-member),
 * or legacy fee_single_aud / fee_couple_aud.
 */
function parseTicketPrices(body) {
  if (body?.ticket_prices === null) return null;
  if (Array.isArray(body?.ticket_prices)) {
    const tickets = body.ticket_prices
      .map((item, index) => {
        const amount = Math.round(Number(item?.amount_cents));
        if (!Number.isFinite(amount) || amount < 0) return null;
        const id = String(item?.id || `ticket-${index + 1}`)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '') || `ticket-${index + 1}`;
        const label = String(item?.label || id).trim() || id;
        const row = { id, label, amount_cents: amount };
        if (item?.pct != null && Number.isFinite(Number(item.pct))) {
          row.pct = Math.round(Number(item.pct));
        }
        return row;
      })
      .filter(Boolean);
    return tickets.length ? tickets : null;
  }

  const baseFromAud =
    body?.fee_base_aud !== undefined && body?.fee_base_aud !== null && body?.fee_base_aud !== ''
      ? audToCents(body.fee_base_aud)
      : body?.fee_full_aud !== undefined && body?.fee_full_aud !== null && body?.fee_full_aud !== ''
        ? audToCents(body.fee_full_aud)
        : null;
  if (Number.isFinite(baseFromAud) && baseFromAud >= 0) {
    return buildTieredEventTickets(baseFromAud);
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
  if (Number.isFinite(single) && single >= 0) {
    // Treat legacy "single" as full non-member price and expand to tiers.
    return buildTieredEventTickets(single);
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
  try {
    const today = new Date().toISOString().slice(0, 10);
    let admitted = today;
    try {
      const { data: existingAdmit } = await sb(
        `crm_field_values?profile_id=eq.${encodeURIComponent(profile.id)}&field_key=eq.date_admitted&select=value_text&limit=1`
      );
      const current = Array.isArray(existingAdmit) ? existingAdmit[0]?.value_text : '';
      if (current) admitted = String(current).slice(0, 10);
    } catch (_) { /* field table may not exist yet */ }
    const waitingEnds = await ensureWaitingPeriodEnds(profile.id, admitted);
    await upsertCrmValues(profile.id, {
      date_admitted: admitted,
      waiting_period_ends: waitingEnds,
      payment_status: 'Paid',
      welfare_membership_status: 'Active',
      last_payment_date: today
    });
  } catch (crmErr) {
    console.error('activate welfare CRM fields', crmErr);
  }
  return Array.isArray(data) ? data[0] : data;
}

async function ensureWaitingPeriodEnds(profileId, admittedIso) {
  const { addDaysIso } = require('../lib/waiting-period');
  let waitingEnds = '';
  try {
    const { data: existingWait } = await sb(
      `crm_field_values?profile_id=eq.${encodeURIComponent(profileId)}&field_key=eq.waiting_period_ends&select=value_text&limit=1`
    );
    waitingEnds = Array.isArray(existingWait) ? String(existingWait[0]?.value_text || '').slice(0, 10) : '';
  } catch (_) { /* ignore */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(waitingEnds)) {
    waitingEnds = addDaysIso(admittedIso, 90);
  }
  return waitingEnds;
}

async function smsOptInForProfile(profileId) {
  try {
    const { data: optRows } = await sb(
      `crm_field_values?profile_id=eq.${encodeURIComponent(profileId)}&field_key=eq.sms_opt_in&select=value_text&limit=1`
    );
    const optValue = Array.isArray(optRows) ? String(optRows[0]?.value_text || '').toLowerCase() : '';
    return optValue === 'true' || optValue === 'yes' || optValue === '1';
  } catch (_) {
    return false;
  }
}

async function notifyWelfareInboxMember(profile, thread) {
  if (!profile?.email || thread?.thread_kind === 'committee' || !thread?.profile_id) return null;
  const { notifyWelfareMember } = require('../lib/welfare-notify');
  return notifyWelfareMember({
    toEmail: profile.email,
    toPhone: profile.phone,
    smsOptIn: await smsOptInForProfile(profile.id),
    greeting: profile.full_name || thread?.member_name || 'Member',
    subject: 'The Welfare Committee sent you a message',
    title: 'New welfare message',
    lead: 'The Welfare Committee sent you a message. Open the Welfare tab to read it and reply in Team inbox.',
    ctaLabel: 'Open team inbox',
    actionPath: '/members/welfare.html#welfare-inbox-card'
  });
}

function committeeSenderFields(adminSession) {
  return {
    sender: 'committee',
    sender_name: String(adminSession?.admin?.full_name || adminSession?.email || 'Committee').trim(),
    sender_email: String(adminSession?.email || '')
      .toLowerCase()
      .trim()
  };
}

async function insertInboxMessage(payload) {
  try {
    await sb('welfare_inbox_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify(payload)
    });
  } catch (_) {
    const { sender_name, sender_email, ...basic } = payload;
    await sb('welfare_inbox_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify(basic)
    });
  }
}

function isCommitteeThread(thread) {
  return String(thread?.thread_kind || '') === 'committee';
}

async function ensureCommitteeInboxThread() {
  try {
    const { data } = await sb(
      'welfare_inbox_threads?thread_kind=eq.committee&select=*&limit=1'
    );
    if (Array.isArray(data) && data[0]) return data[0];
    const { data: created } = await sb('welfare_inbox_threads', {
      method: 'POST',
      body: JSON.stringify({
        thread_kind: 'committee',
        profile_id: null,
        member_name: 'Committee room',
        member_email: '',
        status: 'open',
        unread_for_admin: false,
        unread_for_member: false
      })
    });
    return Array.isArray(created) ? created[0] : created;
  } catch (_) {
    return null;
  }
}

async function closeWelfareInboxForProfile(profileId) {
  try {
    await sb(`welfare_inbox_threads?profile_id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: 'closed' })
    });
  } catch (_) { /* table may not exist yet */ }
}

async function revokeProfileMembership(profile, flags) {
  const dropWelfare = flags.welfare !== false;
  const dropAssociation = flags.association !== false;
  const nextWelfare = dropWelfare ? false : Boolean(profile.welfare_member);
  const nextAssociation = dropAssociation ? false : Boolean(profile.association_member);
  let nextPlan = 'basic';
  if (nextAssociation && nextWelfare) nextPlan = 'both';
  else if (nextWelfare) nextPlan = 'welfare';
  else if (nextAssociation) nextPlan = 'basic';
  await sb(`profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      welfare_member: nextWelfare,
      association_member: nextAssociation,
      plan: nextPlan,
      updated_at: new Date().toISOString()
    })
  });
  if (dropWelfare) {
    await closeWelfareInboxForProfile(profile.id);
    try {
      await upsertCrmValues(profile.id, { welfare_membership_status: 'Removed' });
    } catch (_) { /* ignore */ }
  }
}

async function revokeProfilesMatchingImport(row) {
  const email = String(row?.email || '').trim().toLowerCase();
  if (!email) return 0;
  const { data } = await sb(
    `profiles?email=eq.${encodeURIComponent(email)}&select=id,association_member,welfare_member,plan`
  );
  const profiles = Array.isArray(data) ? data : [];
  for (const profile of profiles) {
    await revokeProfileMembership(profile, {
      welfare: Boolean(row.welfare_member),
      association: Boolean(row.association_member)
    });
  }
  return profiles.length;
}

async function upsertCrmValues(profileId, values) {
  const now = new Date().toISOString();
  const rows = Object.entries(values || {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => ({
      profile_id: profileId,
      field_key: key,
      value_text: String(value).trim().slice(0, 8000),
      updated_at: now
    }));
  if (!rows.length) return;
  await sb('crm_field_values?on_conflict=profile_id,field_key', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify(rows)
  });
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
      { id: 'member', label: 'Member (80%)', amount_cents: 8000, pct: 80 },
      { id: 'non_member', label: 'Non-member (100%)', amount_cents: 10000, pct: 100 },
      { id: 'child_7_17', label: 'Child 7–17 (45%)', amount_cents: 4500, pct: 45 },
      { id: 'child_0_6', label: 'Child 0–6 (free)', amount_cents: 0, pct: 0 }
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
        let welfareInboxUnread = 0;
        try {
          welfareInboxUnread = await countRows(
            'welfare_inbox_threads',
            'status=eq.open&unread_for_admin=eq.true'
          );
        } catch (_) {
          welfareInboxUnread = 0;
        }
        return json(res, 200, {
          enquiries,
          newEnquiries,
          profiles,
          imports,
          newsletter,
          itHelpOpen,
          welfareInboxUnread
        });
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

      if (resource === 'crm-fields') {
        const { data } = await sb(
          'crm_custom_fields?select=id,field_key,label,help_text,field_type,field_group,options,visibility,member_editable,is_sensitive,is_active,is_system,sort_order,updated_at&order=sort_order.asc&order=label.asc'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'crm-record') {
        const profileId = String(url.searchParams.get('profile_id') || '').trim();
        if (!profileId) return json(res, 400, { error: 'profile_id is required' });
        const [{ data: profileRows }, { data: fields }, { data: values }] = await Promise.all([
          sb(
            `profiles?id=eq.${encodeURIComponent(profileId)}&select=id,full_name,email,phone,plan,association_member,welfare_member,member_number,member_since,renews_at,created_at&limit=1`
          ),
          sb(
            'crm_custom_fields?select=id,field_key,label,help_text,field_type,field_group,options,visibility,member_editable,is_sensitive,is_active,is_system,sort_order&is_active=eq.true&order=sort_order.asc'
          ),
          sb(
            `crm_field_values?profile_id=eq.${encodeURIComponent(profileId)}&select=field_key,value_text,updated_at`
          )
        ]);
        const profile = Array.isArray(profileRows) ? profileRows[0] : null;
        if (!profile) return json(res, 404, { error: 'Member profile not found' });
        const valueMap = {};
        (values || []).forEach((row) => {
          valueMap[row.field_key] = row.value_text || '';
        });
        return json(res, 200, { profile, fields: fields || [], values: valueMap });
      }

      if (resource === 'crm-campaigns') {
        const { data } = await sb(
          'crm_campaigns?select=id,channel,name,subject,audience,status,recipient_count,sent_count,failed_count,error_text,created_at,sent_at&order=created_at.desc&limit=50'
        );
        return json(res, 200, {
          rows: data || [],
          sms_ready: Boolean(twilioConfigured && twilioConfigured())
        });
      }

      if (resource === 'crm-pipelines') {
        const [{ data: pipelines }, { data: stages }, { data: cards }] = await Promise.all([
          sb('crm_pipelines?select=id,pipeline_key,name,is_active&is_active=eq.true&order=name.asc'),
          sb('crm_pipeline_stages?select=id,pipeline_id,name,sort_order&order=sort_order.asc'),
          sb(
            'crm_pipeline_cards?select=id,pipeline_id,stage_id,profile_id,title,notes,created_at,updated_at&order=updated_at.desc&limit=300'
          )
        ]);
        return json(res, 200, {
          pipelines: pipelines || [],
          stages: stages || [],
          cards: cards || []
        });
      }

      if (resource === 'crm-calendar') {
        const { data } = await sb(
          'crm_calendar_events?select=id,title,details,starts_at,ends_at,location,event_type,status,profile_id,member_name,member_email,created_at&order=starts_at.desc&limit=120'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'welfare-claims') {
        const status = url.searchParams.get('status') || 'open';
        let query =
          'welfare_claims?select=id,profile_id,member_name,member_email,member_number,public_ref,claim_type,amount_cents,details,status,admin_notes,decided_at,created_at,updated_at&order=created_at.desc&limit=200';
        if (status === 'open') {
          query += '&status=in.(submitted,in_review)';
        } else if (['submitted', 'in_review', 'approved', 'declined', 'paid'].includes(status)) {
          query += `&status=eq.${encodeURIComponent(status)}`;
        }
        try {
          const { data } = await sb(query);
          const rows = data || [];
          const ids = rows.map((row) => row.id).filter(Boolean);
          let files = [];
          if (ids.length) {
            try {
              const { data: listed } = await sb(
                `welfare_claim_files?claim_id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})&select=id,claim_id,file_name,content_type,size_bytes,created_at`
              );
              files = Array.isArray(listed) ? listed : [];
            } catch (_) {
              files = [];
            }
          }
          const byClaim = {};
          files.forEach((file) => {
            if (!byClaim[file.claim_id]) byClaim[file.claim_id] = [];
            byClaim[file.claim_id].push(file);
          });
          return json(res, 200, {
            rows: rows.map((row) => ({ ...row, files: byClaim[row.id] || [] })),
            filter: status
          });
        } catch (err) {
          return json(res, 200, {
            rows: [],
            warning:
              err.message ||
              'Claims table missing. Run docs/supabase/APPLY-WELFARE-CLAIMS.sql in Supabase.'
          });
        }
      }

      if (resource === 'crm-funnel') {
        const [
          welfareEnquiries,
          welfareMembers,
          associationMembers,
          pendingWelfareInvoices,
          paidWelfareInvoices,
          appointments,
          pendingClaims
        ] = await Promise.all([
          countRows('form_submissions', 'form_type=eq.welfare').catch(() => 0),
          countRows('profiles', 'welfare_member=eq.true').catch(() => 0),
          countRows('profiles', 'association_member=eq.true').catch(() => 0),
          countRows('invoices', 'kind=eq.welfare&status=eq.pending').catch(() => 0),
          countRows('invoices', 'kind=eq.welfare&status=eq.paid').catch(() => 0),
          countRows('crm_calendar_events', 'status=eq.requested').catch(() => 0),
          countRows('welfare_claims', 'status=in.(submitted,in_review)').catch(() => 0)
        ]);
        return json(res, 200, {
          steps: [
            { key: 'enquiry', label: 'Welfare enquiries / registrations', count: welfareEnquiries },
            { key: 'invoice', label: 'Welfare invoices awaiting payment', count: pendingWelfareInvoices },
            { key: 'paid', label: 'Welfare invoices paid', count: paidWelfareInvoices },
            { key: 'active', label: 'Active welfare members', count: welfareMembers },
            { key: 'association', label: 'Association members (for upgrade)', count: associationMembers },
            { key: 'appointments', label: 'Appointment requests waiting', count: appointments },
            { key: 'claims', label: 'Welfare claims awaiting review', count: pendingClaims }
          ]
        });
      }

      if (resource === 'imports') {
        const filter = url.searchParams.get('filter') || 'all';
        let query =
          'member_imports?select=id,member_number,full_name,email,plan,membership_label,status,association_member,welfare_member&order=member_number.asc&limit=600';
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

      if (resource === 'welfare-inbox-threads') {
        const status = url.searchParams.get('status') || 'open';
        const select =
          'id,profile_id,member_name,member_email,status,unread_for_admin,last_message_at,created_at,thread_kind';
        let query =
          `welfare_inbox_threads?select=${select}&order=last_message_at.desc&limit=120`;
        if (status === 'open' || status === 'closed') {
          query += `&status=eq.${encodeURIComponent(status)}`;
        } else if (status === 'unread') {
          query += '&unread_for_admin=eq.true';
        }
        try {
          let rows;
          try {
            const result = await sb(query);
            rows = result.data || [];
          } catch (_) {
            const fallback =
              'welfare_inbox_threads?select=id,profile_id,member_name,member_email,status,unread_for_admin,last_message_at,created_at&order=last_message_at.desc&limit=120';
            let q = fallback;
            if (status === 'open' || status === 'closed') {
              q += `&status=eq.${encodeURIComponent(status)}`;
            } else if (status === 'unread') {
              q += '&unread_for_admin=eq.true';
            }
            const result = await sb(q);
            rows = result.data || [];
          }
          const committee = status === 'closed' ? null : await ensureCommitteeInboxThread();
          if (committee && !rows.some((row) => row.id === committee.id)) {
            const include =
              status === 'all' ||
              status === 'open' ||
              (status === 'unread' && committee.unread_for_admin);
            if (include) rows = [committee, ...rows];
          }
          rows.sort((a, b) => {
            const aC = isCommitteeThread(a) ? 0 : 1;
            const bC = isCommitteeThread(b) ? 0 : 1;
            if (aC !== bC) return aC - bC;
            return String(b.last_message_at || '').localeCompare(String(a.last_message_at || ''));
          });
          return json(res, 200, { rows });
        } catch (err) {
          return json(res, 200, {
            rows: [],
            warning:
              err.message ||
              'Inbox tables missing. Run docs/supabase/APPLY-WELFARE-INBOX.sql in Supabase.'
          });
        }
      }

      if (resource === 'welfare-inbox-messages') {
        const threadId = String(url.searchParams.get('thread_id') || '').trim();
        if (!threadId) return json(res, 400, { error: 'thread_id required' });
        const { data: threads } = await sb(
          `welfare_inbox_threads?id=eq.${encodeURIComponent(threadId)}&select=*&limit=1`
        );
        const thread = Array.isArray(threads) ? threads[0] : null;
        if (!thread) return json(res, 404, { error: 'Conversation not found' });
        if (thread.unread_for_admin) {
          await sb(`welfare_inbox_threads?id=eq.${encodeURIComponent(threadId)}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify({ unread_for_admin: false })
          });
          thread.unread_for_admin = false;
        }
        const { data: messages } = await sb(
          `welfare_inbox_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=id,sender,sender_name,sender_email,body,created_at&order=created_at.asc&limit=200`
        ).catch(async () =>
          sb(
            `welfare_inbox_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=id,sender,body,created_at&order=created_at.asc&limit=200`
          )
        );
        return json(res, 200, { thread, messages: messages || [] });
      }

      if (resource === 'welfare-claim-file') {
        const fileId = String(url.searchParams.get('id') || '').trim();
        if (!fileId) return json(res, 400, { error: 'File id is required' });
        const { data: files } = await sb(
          `welfare_claim_files?id=eq.${encodeURIComponent(fileId)}&select=id,storage_path,file_name,content_type&limit=1`
        );
        const file = Array.isArray(files) ? files[0] : null;
        if (!file?.storage_path) return json(res, 404, { error: 'File not found' });
        const signRes = await fetch(
          `${SUPABASE_URL}/storage/v1/object/sign/welfare-claims/${file.storage_path}`,
          {
            method: 'POST',
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ expiresIn: 180 })
          }
        );
        const signed = await signRes.json().catch(() => ({}));
        const path = signed.signedURL || signed.signedUrl || '';
        if (!signRes.ok || !path) {
          return json(res, 502, { error: 'Could not prepare a download link.' });
        }
        const urlSigned = path.startsWith('http')
          ? path
          : `${SUPABASE_URL}/storage/v1${path.startsWith('/') ? path : `/${path}`}`;
        return json(res, 200, { url: urlSigned, file_name: file.file_name });
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

      if (resource === 'welfare-inbox-reply') {
        const threadId = String(body.thread_id || '').trim();
        const text = String(body.body || '').trim();
        if (!threadId) return json(res, 400, { error: 'thread_id required' });
        if (text.length < 1 || text.length > 2000) {
          return json(res, 400, { error: 'Enter a reply.' });
        }
        const { data: threads } = await sb(
          `welfare_inbox_threads?id=eq.${encodeURIComponent(threadId)}&select=*&limit=1`
        );
        const thread = Array.isArray(threads) ? threads[0] : null;
        if (!thread) return json(res, 404, { error: 'Conversation not found' });
        const now = new Date().toISOString();
        const committeeRoom = isCommitteeThread(thread);
        await insertInboxMessage({
          thread_id: threadId,
          body: text,
          ...committeeSenderFields(adminSession)
        });
        await sb(`welfare_inbox_threads?id=eq.${encodeURIComponent(threadId)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({
            status: 'open',
            unread_for_member: committeeRoom ? false : true,
            unread_for_admin: committeeRoom,
            last_message_at: now
          })
        });
        let notified = null;
        if (!committeeRoom && thread.profile_id) {
          try {
            const { data: profiles } = await sb(
              `profiles?id=eq.${encodeURIComponent(thread.profile_id)}&select=id,full_name,email,phone&limit=1`
            );
            const profile = Array.isArray(profiles) ? profiles[0] : null;
            notified = await notifyWelfareInboxMember(profile, thread);
          } catch (notifyErr) {
            console.error('welfare-inbox-reply notify', notifyErr);
          }
        }
        return json(res, 200, { ok: true, notified });
      }

      if (resource === 'welfare-inbox-start') {
        const profileId = String(body.profile_id || '').trim();
        const text = String(body.body || '').trim();
        if (!profileId) return json(res, 400, { error: 'Choose a welfare member.' });
        if (text.length < 1 || text.length > 2000) {
          return json(res, 400, { error: 'Enter a message.' });
        }
        const { data: profiles } = await sb(
          `profiles?id=eq.${encodeURIComponent(profileId)}&select=id,full_name,email,phone,welfare_member&limit=1`
        );
        const profile = Array.isArray(profiles) ? profiles[0] : null;
        if (!profile) return json(res, 404, { error: 'Member not found' });
        if (!profile.welfare_member) {
          return json(res, 400, { error: 'That login is not a Social Welfare member.' });
        }
        const now = new Date().toISOString();
        const { data: existingThreads } = await sb(
          `welfare_inbox_threads?profile_id=eq.${encodeURIComponent(profileId)}&select=*&limit=1`
        );
        let thread = Array.isArray(existingThreads) ? existingThreads[0] : null;
        if (!thread) {
          const { data: created } = await sb('welfare_inbox_threads', {
            method: 'POST',
            body: JSON.stringify({
              profile_id: profile.id,
              member_name: profile.full_name || null,
              member_email: profile.email || null,
              status: 'open',
              unread_for_admin: false,
              unread_for_member: true,
              last_message_at: now
            })
          });
          thread = Array.isArray(created) ? created[0] : created;
        } else {
          await sb(`welfare_inbox_threads?id=eq.${encodeURIComponent(thread.id)}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify({
              status: 'open',
              unread_for_admin: false,
              unread_for_member: true,
              last_message_at: now,
              member_name: profile.full_name || thread.member_name,
              member_email: profile.email || thread.member_email
            })
          });
          thread.status = 'open';
        }
        await insertInboxMessage({
          thread_id: thread.id,
          body: text,
          ...committeeSenderFields(adminSession)
        });
        let notified = null;
        try {
          notified = await notifyWelfareInboxMember(profile, thread);
        } catch (notifyErr) {
          console.error('welfare-inbox-start notify', notifyErr);
        }
        return json(res, 200, { ok: true, thread_id: thread.id, notified });
      }

      if (resource === 'welfare-inbox-close') {
        const threadId = String(body.thread_id || '').trim();
        const nextStatus = body.status === 'closed' ? 'closed' : 'open';
        if (!threadId) return json(res, 400, { error: 'thread_id required' });
        let thread = null;
        try {
          const { data: threads } = await sb(
            `welfare_inbox_threads?id=eq.${encodeURIComponent(threadId)}&select=id,thread_kind&limit=1`
          );
          thread = Array.isArray(threads) ? threads[0] : null;
        } catch (_) {
          const { data: threads } = await sb(
            `welfare_inbox_threads?id=eq.${encodeURIComponent(threadId)}&select=id&limit=1`
          );
          thread = Array.isArray(threads) ? threads[0] : null;
        }
        if (isCommitteeThread(thread)) {
          return json(res, 400, { error: 'The committee room stays open for committee chat.' });
        }
        await sb(`welfare_inbox_threads?id=eq.${encodeURIComponent(threadId)}`, {
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
            const feeNoFlyer =
              ticketsNoFlyer?.find((t) => t.id === 'non_member')?.amount_cents ??
              ticketsNoFlyer?.[0]?.amount_cents ??
              parseEventFeeCents(body);
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
        const feeCents =
          tickets?.find((t) => t.id === 'non_member')?.amount_cents ??
          tickets?.[0]?.amount_cents ??
          parseEventFeeCents(body);
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

      if (resource === 'invoice-delete') {
        const id = String(body.id || url.searchParams.get('id') || '').trim();
        if (!id) return json(res, 400, { error: 'Invoice id is required' });
        const { data: existing } = await sb(
          `invoices?id=eq.${encodeURIComponent(id)}&select=id,invoice_number`
        );
        const row = Array.isArray(existing) ? existing[0] : null;
        if (!row) return json(res, 404, { error: 'Invoice not found' });
        await sb(`invoices?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          prefer: 'return=minimal',
        });
        return json(res, 200, { ok: true, id, invoice_number: row.invoice_number || null });
      }

      if (resource === 'import-delete') {
        const id = String(body.id || url.searchParams.get('id') || '').trim();
        if (!id) return json(res, 400, { error: 'Member import id is required' });
        const { data: existing } = await sb(
          `member_imports?id=eq.${encodeURIComponent(id)}&select=id,full_name,email,association_member,welfare_member`
        );
        const row = Array.isArray(existing) ? existing[0] : null;
        if (!row) return json(res, 404, { error: 'Member not found in Association & Welfare list' });
        await sb(`member_imports?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          prefer: 'return=minimal',
        });
        let revokedLogins = 0;
        try {
          revokedLogins = await revokeProfilesMatchingImport(row);
        } catch (revokeErr) {
          console.error('import-delete revoke profile', revokeErr);
        }
        return json(res, 200, {
          ok: true,
          id,
          email: row.email || null,
          full_name: row.full_name || null,
          revoked_logins: revokedLogins
        });
      }

      if (resource === 'crm-field-create') {
        const payload = normalizeCrmFieldInput(body);
        const { data } = await sb('crm_custom_fields', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'crm-record-save') {
        const profileId = String(body.profile_id || '').trim();
        const values = body.values && typeof body.values === 'object' ? body.values : {};
        if (!profileId) return json(res, 400, { error: 'profile_id is required' });
        const { data: profileRows } = await sb(
          `profiles?id=eq.${encodeURIComponent(profileId)}&select=id&limit=1`
        );
        if (!Array.isArray(profileRows) || !profileRows[0]) {
          return json(res, 404, { error: 'Member profile not found' });
        }
        const { data: fields } = await sb(
          'crm_custom_fields?select=field_key,field_type&is_active=eq.true'
        );
        const allowed = new Set((fields || []).map((field) => field.field_key));
        const now = new Date().toISOString();
        const rows = Object.keys(values)
          .filter((key) => allowed.has(key))
          .map((key) => ({
            profile_id: profileId,
            field_key: key,
            value_text: String(values[key] ?? '').trim().slice(0, 8000),
            updated_at: now
          }));
        if (!rows.length) return json(res, 200, { ok: true, saved: 0 });
        const { data } = await sb('crm_field_values?on_conflict=profile_id,field_key', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: JSON.stringify(rows)
        });
        return json(res, 200, { ok: true, saved: (data || rows).length });
      }

      if (resource === 'crm-campaign-send') {
        const channel = body.channel === 'sms' ? 'sms' : 'email';
        const audience = String(body.audience || 'welfare').trim();
        const allowedAudience = new Set([
          'all_members', 'association', 'welfare', 'newsletter', 'individual'
        ]);
        if (!allowedAudience.has(audience)) {
          return json(res, 400, { error: 'Invalid audience' });
        }
        if (channel === 'sms' && (audience === 'newsletter' || audience === 'individual')) {
          return json(res, 400, { error: 'SMS cannot use that audience. Use a member list.' });
        }
        const name = String(body.name || body.subject || 'Campaign').trim().slice(0, 120) || 'Campaign';
        const subject = String(body.subject || name).trim().slice(0, 160);
        const bodyText = String(body.body_text || '').trim().slice(0, 4000);
        if (!bodyText) return json(res, 400, { error: 'Message text is required' });
        if (channel === 'email' && !subject) {
          return json(res, 400, { error: 'Email subject is required' });
        }

        const recipients = await collectCampaignRecipients(
          audience,
          channel,
          body.to_email || body.email
        );
        if (!recipients.length) {
          return json(res, 400, {
            error: audience === 'individual'
              ? 'Enter a valid email address.'
              : 'No recipients in that audience (or they unsubscribed).'
          });
        }

        const { data: campaignRows } = await sb('crm_campaigns', {
          method: 'POST',
          body: JSON.stringify({
            channel,
            name,
            subject: channel === 'email' ? subject : null,
            body_text: bodyText,
            audience,
            status: 'sending',
            recipient_count: recipients.length
          })
        });
        const campaign = Array.isArray(campaignRows) ? campaignRows[0] : null;
        if (!campaign) return json(res, 500, { error: 'Could not create campaign' });

        for (const group of chunkList(recipients, 100)) {
          await sb('crm_campaign_recipients', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify(group.map((person) => ({
              campaign_id: campaign.id,
              profile_id: person.profile_id,
              email: person.email || null,
              phone: person.phone || null,
              status: 'queued'
            })))
          });
        }

        let sentCount = 0;
        let failedCount = 0;
        let lastError = '';

        if (channel === 'email') {
          if (!sendResendBatch || !buildCampaignMail) {
            return json(res, 500, { error: 'Email sender is not available on the server.' });
          }
          const site = (PUBLIC_SITE_URL || 'https://www.taunetnelel.org').replace(/\/$/, '');
          const toBatchPayload = (person) => {
            const unsub = `${site}/unsubscribe.html?email=${encodeURIComponent(person.email)}`;
            const mail = buildCampaignMail({
              greeting: person.name,
              subject,
              bodyText,
              unsubUrl: unsub
            });
            return {
              from: RESEND_FROM,
              to: [person.email],
              subject: mail.subject,
              html: mail.html,
              text: mail.text,
              reply_to: 'info@taunetnelel.org',
              headers: {
                ...(deliverabilityHeaders ? deliverabilityHeaders(`campaign-${campaign.id}`) : {}),
                'List-Unsubscribe': `<${unsub}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
              },
              tags: [{ name: 'category', value: 'crm_campaign' }]
            };
          };
          for (const group of chunkList(recipients, 100)) {
            try {
              await sendResendBatch(group.map(toBatchPayload));
              sentCount += group.length;
            } catch (err) {
              failedCount += group.length;
              lastError = err.message || 'Resend failed';
            }
          }
          if (sentCount) {
            await sb(`crm_campaign_recipients?campaign_id=eq.${encodeURIComponent(campaign.id)}`, {
              method: 'PATCH',
              prefer: 'return=minimal',
              body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() })
            });
          }
        } else {
          if (!sendSms || !twilioConfigured()) {
            await sb(`crm_campaigns?id=eq.${encodeURIComponent(campaign.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'failed',
                failed_count: recipients.length,
                error_text: 'SMS is not connected. Add Twilio keys on Vercel.'
              })
            });
            return json(res, 400, {
              error: 'SMS is not connected yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM in Vercel.'
            });
          }
          for (const person of recipients) {
            try {
              await sendSms({
                to: person.phone,
                body: `${bodyText}\n\nTaunet Nelel — reply STOP to opt out via the committee.`
              });
              sentCount += 1;
            } catch (err) {
              failedCount += 1;
              lastError = err.message || 'SMS failed';
            }
          }
        }

        const status = sentCount > 0 ? 'sent' : 'failed';
        await sb(`crm_campaigns?id=eq.${encodeURIComponent(campaign.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            sent_count: sentCount,
            failed_count: failedCount,
            error_text: lastError || null,
            sent_at: new Date().toISOString()
          })
        });
        return json(res, 200, {
          ok: status !== 'failed',
          id: campaign.id,
          sent: sentCount,
          failed: failedCount,
          total: recipients.length
        });
      }

      if (resource === 'crm-pipeline-card') {
        const pipelineId = String(body.pipeline_id || '').trim();
        const stageId = String(body.stage_id || '').trim();
        const title = String(body.title || '').trim().slice(0, 160);
        if (!pipelineId || !stageId || !title) {
          return json(res, 400, { error: 'Pipeline, stage, and title are required' });
        }
        const { data } = await sb('crm_pipeline_cards', {
          method: 'POST',
          body: JSON.stringify({
            pipeline_id: pipelineId,
            stage_id: stageId,
            profile_id: body.profile_id || null,
            title,
            notes: String(body.notes || '').trim().slice(0, 2000) || null
          })
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'crm-calendar-create') {
        const title = String(body.title || '').trim().slice(0, 160);
        const startsAt = String(body.starts_at || '').trim();
        if (!title || !startsAt) {
          return json(res, 400, { error: 'Title and start time are required' });
        }
        const { data } = await sb('crm_calendar_events', {
          method: 'POST',
          body: JSON.stringify({
            title,
            details: String(body.details || '').trim().slice(0, 2000) || null,
            starts_at: startsAt,
            ends_at: body.ends_at || null,
            location: String(body.location || '').trim().slice(0, 160) || null,
            event_type: ['appointment', 'committee', 'reminder'].includes(body.event_type)
              ? body.event_type
              : 'appointment',
            status: body.status === 'confirmed' ? 'confirmed' : 'confirmed',
            profile_id: body.profile_id || null,
            member_name: String(body.member_name || '').trim().slice(0, 120) || null,
            member_email: String(body.member_email || '').trim().slice(0, 160) || null
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
        try {
          const today = new Date().toISOString().slice(0, 10);
          let admitted = today;
          const { data: existingAdmit } = await sb(
            `crm_field_values?profile_id=eq.${encodeURIComponent(id)}&field_key=eq.date_admitted&select=value_text&limit=1`
          );
          const current = Array.isArray(existingAdmit) ? existingAdmit[0]?.value_text : '';
          if (current) admitted = String(current).slice(0, 10);
          const waitingEnds = await ensureWaitingPeriodEnds(id, admitted);
          await upsertCrmValues(id, {
            date_admitted: admitted,
            waiting_period_ends: waitingEnds,
            welfare_membership_status: 'Active'
          });
        } catch (crmErr) {
          console.error('approve-welfare waiting period', crmErr);
        }
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'revoke-welfare') {
        const id = body.id;
        const { data: rows } = await sb(
          `profiles?id=eq.${encodeURIComponent(id)}&select=id,association_member,welfare_member,plan`
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return json(res, 404, { error: 'Profile not found' });
        await revokeProfileMembership(row, { welfare: true, association: false });
        return json(res, 200, { ok: true, id });
      }

      if (resource === 'welfare-claim-update') {
        const id = String(body.id || '').trim();
        const status = String(body.status || '').trim();
        const allowed = new Set(['submitted', 'in_review', 'approved', 'declined', 'paid']);
        if (!id) return json(res, 400, { error: 'Claim id is required' });
        if (!allowed.has(status)) return json(res, 400, { error: 'Invalid claim status' });
        const { data: existingRows } = await sb(
          `welfare_claims?id=eq.${encodeURIComponent(id)}&select=id,profile_id,claim_type,amount_cents,status,admin_notes&limit=1`
        );
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        if (!existing) return json(res, 404, { error: 'Claim not found' });

        let amountCents = existing.amount_cents;
        if (body.amount_cents != null && body.amount_cents !== '') {
          const n = Number(body.amount_cents);
          if (!Number.isFinite(n) || n < 0) {
            return json(res, 400, { error: 'Amount must be a number of cents' });
          }
          amountCents = Math.round(n);
        } else if (body.amount != null && body.amount !== '') {
          const n = Number(body.amount);
          if (!Number.isFinite(n) || n < 0) {
            return json(res, 400, { error: 'Amount must be a dollar value' });
          }
          amountCents = Math.round(n * 100);
        }
        if ((status === 'approved' || status === 'paid') && (amountCents == null || amountCents < 0)) {
          return json(res, 400, { error: 'Set an approved amount before approving or marking paid.' });
        }

        const now = new Date().toISOString();
        const patch = {
          status,
          amount_cents: amountCents,
          admin_notes:
            body.admin_notes != null
              ? String(body.admin_notes).trim().slice(0, 2000)
              : existing.admin_notes,
          updated_at: now
        };
        if (status === 'approved' || status === 'declined' || status === 'paid') {
          patch.decided_at = now;
        }
        const { data } = await sb(`welfare_claims?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch)
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (existing.profile_id) {
          try {
            const claimValues = {
              last_claim_date: now.slice(0, 10),
              last_claim_type: existing.claim_type,
              last_claim_amount: amountCents != null ? (amountCents / 100).toFixed(2) : '',
              claim_in_progress: status === 'submitted' || status === 'in_review' ? 'true' : 'false',
              previous_welfare_claim: status === 'approved' || status === 'paid' ? 'true' : undefined
            };
            await upsertCrmValues(existing.profile_id, claimValues);
          } catch (crmErr) {
            console.error('welfare-claim-update CRM fields', crmErr);
          }
        }
        return json(res, 200, { rows: data || [], row });
      }

      if (resource === 'crm-field-update') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Field id is required' });
        const { data: existingRows } = await sb(
          `crm_custom_fields?id=eq.${encodeURIComponent(id)}&select=id,field_key,label,help_text,field_type,field_group,options,visibility,member_editable,is_sensitive,is_active,is_system,sort_order`
        );
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        if (!existing) return json(res, 404, { error: 'Field not found' });
        const payload = normalizeCrmFieldInput(body, existing);
        delete payload.field_key;
        const { data } = await sb(`crm_custom_fields?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'crm-pipeline-card') {
        const id = String(body.id || '').trim();
        const stageId = String(body.stage_id || '').trim();
        if (!id || !stageId) return json(res, 400, { error: 'Card id and stage are required' });
        const { data } = await sb(`crm_pipeline_cards?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            stage_id: stageId,
            notes: body.notes != null ? String(body.notes).trim().slice(0, 2000) : undefined,
            updated_at: new Date().toISOString()
          })
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'crm-calendar-status') {
        const id = String(body.id || '').trim();
        const status = String(body.status || '').trim();
        if (!id || !['requested', 'confirmed', 'cancelled', 'completed'].includes(status)) {
          return json(res, 400, { error: 'Valid calendar status is required' });
        }
        const { data } = await sb(`crm_calendar_events?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status })
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
          body.fee_base_aud !== undefined ||
          body.fee_full_aud !== undefined ||
          body.ticket_prices !== undefined
        ) {
          const tickets = parseTicketPrices(body);
          const feeCents = parseEventFeeCents(body);
          if (tickets) {
            patch.ticket_prices = tickets;
            const base =
              tickets.find((t) => t.id === 'non_member')?.amount_cents ??
              tickets.find((t) => t.id === 'single')?.amount_cents ??
              tickets[0].amount_cents;
            patch.fee_cents = base;
          } else if (
            body.ticket_prices === null ||
            body.fee_single_aud === '' ||
            body.fee_base_aud === '' ||
            body.fee_cents === null
          ) {
            patch.ticket_prices = null;
            patch.fee_cents = feeCents;
          } else if (feeCents != null) {
            patch.fee_cents = feeCents;
            patch.ticket_prices = buildTieredEventTickets(feeCents);
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
          body.fee_base_aud === undefined &&
          body.fee_full_aud === undefined &&
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

      if (resource === 'invoice-delete') {
        const id = String(body.id || url.searchParams.get('id') || '').trim();
        if (!id) return json(res, 400, { error: 'Invoice id is required' });
        const { data: existing } = await sb(
          `invoices?id=eq.${encodeURIComponent(id)}&select=id,invoice_number`
        );
        const row = Array.isArray(existing) ? existing[0] : null;
        if (!row) return json(res, 404, { error: 'Invoice not found' });
        await sb(`invoices?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          prefer: 'return=minimal',
        });
        return json(res, 200, { ok: true, id, invoice_number: row.invoice_number || null });
      }

      if (resource === 'enquiry-delete') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Enquiry id is required' });
        await sb(`form_submissions?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        return json(res, 200, { ok: true, id });
      }

      if (resource === 'crm-field-delete') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Field id is required' });
        const { data: existingRows } = await sb(
          `crm_custom_fields?id=eq.${encodeURIComponent(id)}&select=id,is_system,label`
        );
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        if (!existing) return json(res, 404, { error: 'Field not found' });
        if (existing.is_system) {
          return json(res, 400, { error: 'System fields (beneficiary / next of kin) cannot be deleted' });
        }
        await sb(`crm_custom_fields?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          prefer: 'return=minimal'
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
