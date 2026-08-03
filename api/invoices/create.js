/**
 * Create membership / welfare / event invoice and email PDF instantly.
 *
 * Auth: Bearer <supabase access_token> (member signed in)
 * Body: { kind: 'association'|'welfare'|'event', event_id?, amount_cents?, description? }
 *
 * Env: SUPABASE_*, RESEND_*, PAYID and/or BANK_* (see docs/supabase/INVOICES.md)
 */
const { createAndEmailInvoice } = require('../lib/invoice-service');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const rateBuckets = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const err = new Error('Too many invoice requests. Try again later.');
    err.status = 429;
    throw err;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 32_000) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function requireUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const err = new Error('Sign in required to request an invoice.');
    err.status = 401;
    throw err;
  }
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const user = await resp.json().catch(() => ({}));
  if (!resp.ok || !user?.id) {
    const err = new Error('Session expired. Sign in again.');
    err.status = 401;
    throw err;
  }
  return user;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, { error: 'Server missing Supabase credentials.' });
    }

    rateLimit(`ip:${clientIp(req)}`, 20, 60 * 60 * 1000);
    const user = await requireUser(req);
    rateLimit(`user:${user.id}`, 10, 60 * 60 * 1000);

    const body = await readBody(req);
    const invoice = await createAndEmailInvoice({
      kind: body.kind,
      email: user.email,
      fullName: user.user_metadata?.full_name || body.full_name || '',
      userId: user.id,
      eventId: body.event_id || null,
      amountCents: body.amount_cents,
      description: body.description,
    });

    return json(res, 200, {
      ok: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        kind: invoice.kind,
        description: invoice.description,
        amount_cents: invoice.amount_cents,
        status: invoice.status,
        pay_reference: invoice.pay_reference,
        due_at: invoice.due_at,
        issued_at: invoice.issued_at,
      },
      message: `Payment request ${invoice.invoice_number} was emailed to ${invoice.email}. A paid receipt is sent only after Admin marks it paid.`,
    });
  } catch (err) {
    console.error('invoices/create', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not create invoice.',
    });
  }
};
