/**
 * Download member invoice PDF.
 * GET /api/invoices/download?id=<invoice-uuid>
 * Auth: Bearer <supabase access_token>
 */
const { buildInvoicePdf } = require('../lib/invoice-pdf');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ORG_LEGAL_NAME = (process.env.ORG_LEGAL_NAME || 'Taunet Nelel Incorporated').trim();
const ORG_ABN = (process.env.ORG_ABN || '').trim();
const PAYID = (process.env.PAYID || '').trim();
const BANK_NAME = (process.env.BANK_NAME || '').trim();
const BANK_BSB = (process.env.BANK_BSB || '').trim();
const BANK_ACCOUNT = (process.env.BANK_ACCOUNT_NUMBER || process.env.BANK_ACCOUNT || '').trim();
const BANK_ACCOUNT_NAME = (process.env.BANK_ACCOUNT_NAME || ORG_LEGAL_NAME).trim();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function formatAud(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatDateTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Melbourne',
    });
  } catch {
    return String(d);
  }
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Australia/Melbourne',
    });
  } catch {
    return String(d);
  }
}

async function requireUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const err = new Error('Sign in required.');
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

async function fetchInvoice(id) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  const data = await resp.json().catch(() => []);
  if (!resp.ok) {
    const err = new Error(data?.message || 'Could not load invoice.');
    err.status = resp.status;
    throw err;
  }
  return Array.isArray(data) ? data[0] : null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, { error: 'Server missing Supabase credentials.' });
    }

    const user = await requireUser(req);
    const url = new URL(req.url, 'http://localhost');
    const id = String(url.searchParams.get('id') || '').trim();
    if (!id) return json(res, 400, { error: 'Invoice id is required.' });

    const invoice = await fetchInvoice(id);
    if (!invoice) return json(res, 404, { error: 'Invoice not found.' });

    const email = String(user.email || '')
      .trim()
      .toLowerCase();
    const owns =
      invoice.user_id === user.id ||
      String(invoice.email || '')
        .trim()
        .toLowerCase() === email;
    if (!owns) {
      return json(res, 403, { error: 'You can only download your own invoices.' });
    }

    const pdf = buildInvoicePdf({
      orgName: ORG_LEGAL_NAME,
      abn: ORG_ABN,
      invoiceNumber: invoice.invoice_number,
      issuedAt: formatDate(invoice.issued_at),
      dueAt: formatDate(invoice.due_at),
      paidAt: invoice.paid_at ? formatDateTime(invoice.paid_at) : '',
      status: invoice.status,
      billToName: invoice.full_name || invoice.email,
      billToEmail: invoice.email,
      description: invoice.description,
      amountLabel: formatAud(invoice.amount_cents),
      payReference: invoice.pay_reference,
      payid: PAYID,
      bankName: BANK_NAME,
      bankBsb: BANK_BSB,
      bankAccount: BANK_ACCOUNT,
      bankAccountName: BANK_ACCOUNT_NAME,
    });

    const filename = `${invoice.invoice_number || 'invoice'}.pdf`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  } catch (err) {
    console.error('invoices/download', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not download invoice.',
    });
  }
};
