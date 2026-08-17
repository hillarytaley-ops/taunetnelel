/**
 * Public Welfare Plus PayID portal.
 *
 * POST { full_name, email, phone?, plan: 'full' | 'installments' }
 *  - full: one $300 invoice
 *  - installments: three $100 invoices over ~3 months (reminders via cron)
 */
const {
  createWelfarePayCheckout,
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

function serializeInvoice(invoice) {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    amount_cents: invoice.amount_cents,
    amount_label: formatAud(invoice.amount_cents),
    description: invoice.description,
    status: invoice.status,
    pay_reference: invoice.pay_reference,
    due_at: invoice.due_at,
    issued_at: invoice.issued_at,
    installment: invoice.meta?.installment || 1,
    of: invoice.meta?.of || 1,
  };
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
      plan: 'welfare',
      options: [
        {
          id: 'full',
          label: 'Pay $300 in full',
          amount_cents: 30000,
          amount_label: formatAud(30000),
          installments: 1,
          description: 'One payment of AUD $300 for the full Association + Welfare year',
        },
        {
          id: 'installments',
          label: '3 × $100 over 3 months',
          amount_cents: 10000,
          amount_label: formatAud(10000),
          installments: 3,
          description:
            'Three installments of AUD $100. Invoice 1 now; invoices 2 and 3 with email reminders.',
        },
      ],
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
    const plan =
      String(body.plan || 'full').toLowerCase() === 'installments'
        ? 'installments'
        : 'full';

    if (!fullName || fullName.length < 2) {
      return json(res, 400, { error: 'Please enter your full name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Please enter a valid email address.' });
    }

    rateLimit(`email:${email}`, 5, 60 * 60 * 1000);

    const userId = await findProfileIdByEmail(email);
    const result = await createWelfarePayCheckout({
      email,
      fullName,
      userId,
      phone,
      plan,
    });

    const pay = getPublicPaymentDetails();
    const primary = result.primary;

    const message =
      plan === 'installments'
        ? `Installment 1 of 3 (${primary.invoice_number}) is ready on screen. Pay $100 by bank transfer now. Installments 2 and 3 will be emailed as payment requests when due. A paid receipt is sent only after the Treasurer confirms each payment.`
        : `Payment request ${primary.invoice_number} is ready on screen. Pay $300 by bank transfer using your reference. You will receive a paid receipt by email only after the Treasurer confirms your payment.`;

    return json(res, 200, {
      ok: true,
      plan,
      series_id: result.series_id || null,
      message,
      invoice: serializeInvoice(primary),
      schedule: result.invoices.map(serializeInvoice),
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
    console.error('pay/welfare', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not start Association + Welfare PayID payment.',
    });
  }
};
