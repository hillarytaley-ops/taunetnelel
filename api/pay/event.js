/**
 * Public event PayID portal — create event fee invoice + return PayID / bank details.
 * Ticket prices come from Admin (events.ticket_prices / fee_cents), with catalog fallback.
 *
 * GET  ?event=men-s-camp-2026-08-01
 * POST { event_id, ticket: 'single'|'couple'|…, full_name, email, phone? }
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

/** Fallback only when Admin has not set prices in Supabase yet. */
const EVENT_FALLBACK = {
  'men-s-camp-2026-08-01': {
    id: 'men-s-camp-2026-08-01',
    title: "Men's Camp",
    subtitle: "All States Men's Camp",
    location: 'Springbrook',
    tickets: [
      { id: 'member', label: 'Member (80%)', amount_cents: 8000 },
      { id: 'non_member', label: 'Non-member (100%)', amount_cents: 10000 },
      { id: 'child_7_17', label: 'Child 7–17 (45%)', amount_cents: 4500 },
      { id: 'child_0_6', label: 'Child 0–6 (free)', amount_cents: 0 },
    ],
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

function normalizeTickets(raw, feeCents, title) {
  const list = [];
  if (Array.isArray(raw)) {
    raw.forEach((item, index) => {
      const amount = Math.round(Number(item?.amount_cents));
      if (!Number.isFinite(amount) || amount < 0) return;
      const id = String(item?.id || `ticket-${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || `ticket-${index + 1}`;
      const label = String(item?.label || id).trim() || id;
      list.push({
        id,
        label,
        amount_cents: amount,
        description:
          amount === 0
            ? `${title} — ${label} (free)`
            : `${title} — ${label} (${formatAud(amount)})`,
      });
    });
  }
  if (!list.length && Number(feeCents) > 0) {
    const amount = Math.round(Number(feeCents));
    // Expand full price into standard membership/age tiers.
    const tiers = [
      { id: 'member', label: 'Member (80%)', pct: 80 },
      { id: 'non_member', label: 'Non-member (100%)', pct: 100 },
      { id: 'child_7_17', label: 'Child 7–17 (45%)', pct: 45 },
      { id: 'child_0_6', label: 'Child 0–6 (free)', pct: 0 },
    ];
    tiers.forEach((tier) => {
      const cents = Math.round((amount * tier.pct) / 100);
      list.push({
        id: tier.id,
        label: tier.label,
        amount_cents: cents,
        description:
          cents === 0
            ? `${title} — ${tier.label}`
            : `${title} — ${tier.label} (${formatAud(cents)})`,
      });
    });
  }
  return list;
}

function ticketsFromBookingUrl(bookingUrl) {
  try {
    const url = new URL(String(bookingUrl || ''), 'https://taunetnelel.local/');
    const raw = String(url.searchParams.get('t') || '').trim();
    if (!raw) return null;
    const tickets = [];
    raw.split(',').forEach((part) => {
      const [idRaw, centsRaw] = part.split(':');
      const id = String(idRaw || '').trim().toLowerCase();
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
      tickets.push({
        id,
        label,
        amount_cents: amount,
      });
    });
    return tickets.length ? tickets : null;
  } catch {
    return null;
  }
}

function ticketsToMap(tickets) {
  const map = {};
  tickets.forEach((ticket) => {
    map[ticket.id] = ticket;
  });
  return map;
}

async function loadEventCatalog(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return null;

  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      let rows;
      try {
        rows = await sb(
          `events?id=eq.${encodeURIComponent(id)}&select=id,title,location,meta,fee_cents,ticket_prices,booking_url,registration_open,is_published&limit=1`
        );
      } catch (err) {
        const text = String(err?.message || '');
        if (!/ticket_prices/i.test(text)) throw err;
        rows = await sb(
          `events?id=eq.${encodeURIComponent(id)}&select=id,title,location,meta,fee_cents,booking_url,registration_open,is_published&limit=1`
        );
      }
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.is_published !== false) {
        const title = row.title || 'Event';
        let ticketSource = row.ticket_prices;
        if (typeof ticketSource === 'string') {
          try {
            ticketSource = JSON.parse(ticketSource);
          } catch {
            ticketSource = null;
          }
        }
        let tickets = normalizeTickets(ticketSource, row.fee_cents, title);
        if (!tickets.length) {
          tickets = normalizeTickets(ticketsFromBookingUrl(row.booking_url), row.fee_cents, title);
        }
        if (tickets.length) {
          return {
            id: row.id,
            title,
            subtitle: row.meta || null,
            location: row.location || null,
            tickets,
            source: 'database',
          };
        }
      }
    } catch (err) {
      console.warn('pay/event loadEventCatalog', err.message || err);
    }
  }

  const fallback = EVENT_FALLBACK[id];
  if (!fallback) return null;
  const title = fallback.title;
  return {
    ...fallback,
    tickets: normalizeTickets(fallback.tickets, null, title),
    source: 'fallback',
  };
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
  return {
    event: {
      id: catalog.id,
      title: catalog.title,
      subtitle: catalog.subtitle || null,
      location: catalog.location || null,
    },
    tickets: catalog.tickets.map((ticket) => ({
      id: ticket.id,
      label: ticket.label,
      amount_cents: ticket.amount_cents,
      amount_label: ticket.amount_cents === 0 ? 'Free' : formatAud(ticket.amount_cents),
      description: ticket.description,
      free: ticket.amount_cents === 0,
    })),
    source: catalog.source || null,
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
    const catalog = await loadEventCatalog(eventId);
    if (!catalog) {
      return json(res, 404, {
        error: 'This event is not open for online booking, or Admin has not set ticket prices yet.',
      });
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

    rateLimit(`ip:${clientIp(req)}`, 12, 60 * 60 * 1000);
    const body = await readBody(req);
    const eventId = String(body.event_id || 'men-s-camp-2026-08-01').trim();
    const ticketKey = String(body.ticket || 'member').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const phone = String(body.phone || '').trim();

    const catalog = await loadEventCatalog(eventId);
    if (!catalog) {
      return json(res, 404, {
        error: 'This event is not open for online booking, or Admin has not set ticket prices yet.',
      });
    }
    const ticketMap = ticketsToMap(catalog.tickets);
    const ticket = ticketMap[ticketKey] || catalog.tickets[0];
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

    // Free ticket (e.g. child 0-6): no invoice / PayID required.
    if (Number(ticket.amount_cents) === 0) {
      return json(res, 200, {
        ok: true,
        free: true,
        event: {
          id: catalog.id,
          title: catalog.title,
        },
        ticket: {
          id: ticket.id,
          label: ticket.label,
          amount_cents: 0,
          amount_label: 'Free',
        },
        message:
          'Your free place is recorded. No PayID payment is required for this ticket. Please bring ID/age confirmation if the event team asks for it.',
        invoice: null,
        payment: {
          method: 'free',
          payid: null,
          bank_name: null,
        },
      });
    }

    if (!paymentConfigured()) {
      return json(res, 503, {
        error:
          'PayID / bank details are not configured yet. Please contact info@taunetnelel.org.',
      });
    }

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
        ticket: ticket.id,
        ticket_label: ticket.label,
        phone: phone || null,
        price_source: catalog.source || null,
      },
    });

    const pay = getPublicPaymentDetails();

    return json(res, 200, {
      ok: true,
      free: false,
      event: {
        id: catalog.id,
        title: catalog.title,
      },
      ticket: {
        id: ticket.id,
        label: ticket.label,
        amount_cents: ticket.amount_cents,
        amount_label: formatAud(ticket.amount_cents),
      },
      message: `Booking payment ${invoice.invoice_number} is ready. Pay by bank transfer using your reference. A paid receipt is emailed only after the Treasurer confirms payment.`,
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
