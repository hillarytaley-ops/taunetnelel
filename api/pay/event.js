/**
 * Public event PayID portal — create event fee invoice + return PayID / bank details.
 *
 * GET  ?event=men-s-camp-2026-08-01
 * POST { event_id, ticket: 'single'|'couple', full_name, email, phone? }
 *
 * Env: PAYID, BANK_*, SUPABASE_*, RESEND_* (same as other pay portals)
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

/** Public bookable events (amounts in cents). */
const EVENT_CATALOG = {
  'men-s-camp-2026-08-01': {
    id: 'men-s-camp-2026-08-01',
    title: "Men's Camp",
    subtitle: 'All States Men\'s Camp',
    location: 'Springbrook',
    tickets: {
      single: {
        amount_cents: 10000,
        label: 'Single',
        description: "Men's Camp — single ticket (AUD $100)",
      },
      couple: {
        amount_cents: 15000,
        label: 'Two people',
        description: "Men's Camp — two people (AUD $150)",
      },
    },
  },
};

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

function resolveCatalog(eventId) {
  const id = String(eventId || '').trim();
  return EVENT_CATALOG[id] || null;
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

function catalogPayload(catalog) {
  const tickets = Object.entries(catalog.tickets).map(([key, ticket]) => ({
    id: key,
    label: ticket.label,
    amount_cents: ticket.amount_cents,
    amount_label: formatAud(ticket.amount_cents),
    description: ticket.description,
  }));
  return {
    event: {
      id: catalog.id,
      title: catalog.title,
      subtitle: catalog.subtitle || null,
      location: catalog.location || null,
    },
    tickets,
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
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const eventId = url.searchParams.get('event') || 'men-s-camp-2026-08-01';
    const catalog = resolveCatalog(eventId);
    if (!catalog) {
      return json(res, 404, { error: 'This event is not open for online booking.' });
    }
    const pay = getPublicPaymentDetails();
    return json(res, 200, {
      ...catalogPayload(catalog),
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
    const eventId = String(body.event_id || 'men-s-camp-2026-08-01').trim();
    const ticketKey = String(body.ticket || 'single').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const phone = String(body.phone || '').trim();

    const catalog = resolveCatalog(eventId);
    if (!catalog) {
      return json(res, 404, { error: 'This event is not open for online booking.' });
    }
    const ticket = catalog.tickets[ticketKey];
    if (!ticket) {
      return json(res, 400, { error: 'Please choose a valid ticket option.' });
    }
    if (!fullName || fullName.length < 2) {
      return json(res, 400, { error: 'Please enter your full name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Please enter a valid email address.' });
    }

    rateLimit(`email:${email}`, 5, 60 * 60 * 1000);

    const userId = await findProfileIdByEmail(email);
    const invoice = await createAndEmailInvoice({
      kind: 'event',
      email,
      fullName,
      userId,
      eventId: catalog.id,
      amountCents: ticket.amount_cents,
      description: ticket.description,
      skipEmail: true,
      meta: {
        source: 'pay_portal_event',
        event_id: catalog.id,
        event_title: catalog.title,
        ticket: ticketKey,
        ticket_label: ticket.label,
        phone: phone || null,
      },
    });

    const pay = getPublicPaymentDetails();

    return json(res, 200, {
      ok: true,
      event: {
        id: catalog.id,
        title: catalog.title,
      },
      ticket: {
        id: ticketKey,
        label: ticket.label,
        amount_cents: ticket.amount_cents,
        amount_label: formatAud(ticket.amount_cents),
      },
      message: `Booking payment ${invoice.invoice_number} is ready. Pay via PayID or bank transfer using your reference. A paid receipt is emailed only after the Treasurer confirms payment.`,
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
    console.error('pay/event', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not start event PayID payment.',
    });
  }
};
