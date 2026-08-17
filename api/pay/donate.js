/**
 * Public donation PayID portal — create a donation invoice (custom amount).
 *
 * POST { full_name, email, phone?, amount_cents | amount }
 * Returns invoice + PayID / bank details for on-screen payment.
 *
 * Does not unlock membership when marked paid.
 */
const {
  createAndEmailInvoice,
  getPublicPaymentDetails,
  paymentConfigured,
  formatAud,
  DONATION_MIN_CENTS,
  DONATION_MAX_CENTS,
  sb,
} = require('../lib/invoice-service');

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
    const err = new Error('Too many payment requests. Try again later.');
    err.status = 429;
    throw err;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16_000) {
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

function parseAmountCents(body) {
  if (body.amount_cents != null && body.amount_cents !== '') {
    return Math.round(Number(body.amount_cents));
  }
  if (body.amount != null && body.amount !== '') {
    const dollars = Number(String(body.amount).replace(/[^0-9.]/g, ''));
    return Math.round(dollars * 100);
  }
  return NaN;
}

async function findProfileIdByEmail(email) {
  try {
    const rows = await sb(
      `profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.id || null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const pay = getPublicPaymentDetails();
    return json(res, 200, {
      plan: 'donation',
      min_cents: DONATION_MIN_CENTS,
      max_cents: DONATION_MAX_CENTS,
      presets: [
        { amount_cents: 2000, label: '$20' },
        { amount_cents: 5000, label: '$50' },
        { amount_cents: 10000, label: '$100' },
        { amount_cents: 20000, label: '$200' },
      ],
      description: 'Community donation to Taunet Nelel (PayID / bank transfer)',
      payment: {
        configured: pay.configured,
        payid: pay.payid,
        bank_name: pay.bank_name,
      },
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, { error: 'Server missing Supabase credentials.' });
    }
    if (!paymentConfigured()) {
      return json(res, 503, {
        error:
          'PayID / bank details are not configured yet. Please contact info@taunetnelel.org.',
      });
    }

    rateLimit(`ip:${clientIp(req)}`, 12, 60 * 60 * 1000);
    const body = await readBody(req);
    const fullName = String(body.full_name || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const phone = String(body.phone || '').trim();
    const amountCents = parseAmountCents(body);

    if (!fullName || fullName.length < 2) {
      return json(res, 400, { error: 'Please enter your full name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Please enter a valid email address.' });
    }
    if (!Number.isFinite(amountCents)) {
      return json(res, 400, { error: 'Please choose or enter a donation amount.' });
    }

    rateLimit(`email:${email}`, 5, 60 * 60 * 1000);

    const userId = await findProfileIdByEmail(email);
    const invoice = await createAndEmailInvoice({
      kind: 'donation',
      email,
      fullName,
      userId,
      amountCents,
      skipEmail: true,
      meta: {
        source: 'pay_portal_donate',
        phone: phone || null,
      },
    });

    const pay = getPublicPaymentDetails();

    return json(res, 200, {
      ok: true,
      plan: 'donation',
      message: `Donation request ${invoice.invoice_number} is ready. Pay ${formatAud(invoice.amount_cents)} by bank transfer using your reference. A thank-you receipt is emailed only after the Treasurer confirms your payment.`,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount_cents: invoice.amount_cents,
        amount_label: formatAud(invoice.amount_cents),
        description: invoice.description,
        status: invoice.status,
        pay_reference: invoice.pay_reference,
        due_at: invoice.due_at,
        issued_at: invoice.issued_at,
      },
      payment: {
        method: 'payid',
        payid: pay.payid,
        bank_name: pay.bank_name,
        bank_bsb: pay.bank_bsb,
        bank_account_number: pay.bank_account_number,
        bank_account_name: pay.bank_account_name,
        org_legal_name: pay.org_legal_name,
      },
    });
  } catch (err) {
    console.error('pay/donate', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not start donation payment.',
    });
  }
};
