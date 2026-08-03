/**
 * Public Basic Plan PayID portal — create $50 association invoice (single installment).
 *
 * POST { full_name, email, phone? }
 * Returns invoice + PayID / bank details for on-screen payment.
 *
 * Env: same as invoices (PAYID, BANK_*, RESEND_*, SUPABASE_*)
 */
const {
  createAndEmailInvoice,
  getPublicPaymentDetails,
  paymentConfigured,
  formatAud,
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
      plan: 'basic',
      amount_cents: 5000,
      amount_label: formatAud(5000),
      installments: 1,
      description: 'Association membership — Basic plan (AUD $50 / year)',
      payment: {
        configured: pay.configured,
        payid: pay.payid,
        bank_name: pay.bank_name,
        // BSB/account only after checkout POST (reduces scraping)
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

    if (!fullName || fullName.length < 2) {
      return json(res, 400, { error: 'Please enter your full name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Please enter a valid email address.' });
    }

    rateLimit(`email:${email}`, 5, 60 * 60 * 1000);

    const userId = await findProfileIdByEmail(email);
    const invoice = await createAndEmailInvoice({
      kind: 'association',
      email,
      fullName,
      userId,
      // PayID shown on screen — paid receipt emailed only after Admin Mark paid
      skipEmail: true,
      meta: {
        source: 'pay_portal_basic',
        installments: 1,
        phone: phone || null,
      },
    });

    const pay = getPublicPaymentDetails();

    return json(res, 200, {
      ok: true,
      plan: 'basic',
      installments: 1,
      message: `Payment request ${invoice.invoice_number} is ready. Pay $50 via PayID using your reference. You will receive a paid receipt by email only after the Treasurer confirms your payment.`,
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
    console.error('pay/basic', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not start PayID payment.',
    });
  }
};
