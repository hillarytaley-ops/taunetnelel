/**
 * Shared invoice create + Resend email helpers.
 */

const { buildInvoicePdf } = require('./invoice-pdf');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = (
  process.env.RESEND_FROM ||
  'Taunet Nelel <members@taunetnelel.org>'
).trim();
const RESEND_REPLY_TO = (
  process.env.RESEND_REPLY_TO ||
  'info@taunetnelel.org'
).trim();

const ORG_LEGAL_NAME = (process.env.ORG_LEGAL_NAME || 'Taunet Nelel Incorporated').trim();
const ORG_ABN = (process.env.ORG_ABN || '').trim();
const PAYID = (process.env.PAYID || '').trim();
const BANK_NAME = (process.env.BANK_NAME || '').trim();
const BANK_BSB = (process.env.BANK_BSB || '').trim();
const BANK_ACCOUNT = (process.env.BANK_ACCOUNT_NUMBER || process.env.BANK_ACCOUNT || '').trim();
const BANK_ACCOUNT_NAME = (process.env.BANK_ACCOUNT_NAME || ORG_LEGAL_NAME).trim();
const INVOICE_DUE_DAYS = Math.max(1, Number(process.env.INVOICE_DUE_DAYS || 14) || 14);

const KIND_DEFAULTS = {
  association: {
    amount_cents: 5000,
    description: 'Association membership — Basic plan (AUD $50 / year)',
  },
  welfare: {
    amount_cents: 30000,
    description: 'Welfare Association membership fee (AUD $300)',
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAud(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function formatDate(d) {
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

async function sb(path, { method = 'GET', body } = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!resp.ok) {
    const err = new Error(data?.message || data?.error || text || 'Supabase error');
    err.status = resp.status;
    throw err;
  }
  return data;
}

async function rpcNextInvoiceNumber() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/next_invoice_number`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(text || 'Could not allocate invoice number');
  }
  // RPC returns JSON string
  try {
    return JSON.parse(text);
  } catch {
    return String(text).replace(/^"|"$/g, '');
  }
}

function paymentConfigured() {
  return Boolean(PAYID || (BANK_BSB && BANK_ACCOUNT));
}

function buildEmailHtml(invoice) {
  const amount = formatAud(invoice.amount_cents);
  const payBits = [];
  if (PAYID) payBits.push(`<li><strong>PayID:</strong> ${escapeHtml(PAYID)}</li>`);
  if (BANK_NAME) payBits.push(`<li><strong>Bank:</strong> ${escapeHtml(BANK_NAME)}</li>`);
  if (BANK_BSB) payBits.push(`<li><strong>BSB:</strong> ${escapeHtml(BANK_BSB)}</li>`);
  if (BANK_ACCOUNT) payBits.push(`<li><strong>Account:</strong> ${escapeHtml(BANK_ACCOUNT)}</li>`);
  if (BANK_ACCOUNT_NAME) {
    payBits.push(`<li><strong>Account name:</strong> ${escapeHtml(BANK_ACCOUNT_NAME)}</li>`);
  }
  payBits.push(
    `<li><strong>Payment reference:</strong> ${escapeHtml(invoice.pay_reference)}</li>`
  );

  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;color:#8B4513;font-size:13px;">Taunet Nelel</p>
  <h1 style="font-size:22px;margin:0 0 12px;">Invoice ${escapeHtml(invoice.invoice_number)}</h1>
  <p>Hello ${escapeHtml(invoice.full_name || 'there')},</p>
  <p>Your invoice is ready. Please pay by PayID or bank transfer using the reference below so we can match your payment.</p>
  <p><strong>${escapeHtml(invoice.description)}</strong><br>
  Amount due: <strong>${amount} AUD</strong><br>
  Due: ${escapeHtml(formatDate(invoice.due_at))}</p>
  <p style="margin:0 0 8px;"><strong>How to pay</strong></p>
  <ul>${payBits.join('')}</ul>
  <p style="font-size:13px;color:#555;">A PDF copy is attached. Questions: <a href="mailto:info@taunetnelel.org">info@taunetnelel.org</a></p>
  <p style="font-size:13px;color:#666;">Taunet Nelel · Victoria, Australia</p>
</body></html>`;
}

async function sendInvoiceEmail(invoice) {
  if (!RESEND_API_KEY) {
    const err = new Error('RESEND_API_KEY is not configured on the server.');
    err.status = 500;
    throw err;
  }
  if (!paymentConfigured()) {
    const err = new Error(
      'Payment details are not configured (set PAYID and/or BANK_BSB + BANK_ACCOUNT_NUMBER on Vercel).'
    );
    err.status = 500;
    throw err;
  }

  const pdf = buildInvoicePdf({
    orgName: ORG_LEGAL_NAME,
    abn: ORG_ABN,
    invoiceNumber: invoice.invoice_number,
    issuedAt: formatDate(invoice.issued_at),
    dueAt: formatDate(invoice.due_at),
    paidAt: invoice.paid_at ? formatDate(invoice.paid_at) : '',
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

  const payload = {
    from: RESEND_FROM,
    to: [invoice.email],
    subject: `Invoice ${invoice.invoice_number} — Taunet Nelel`,
    html: buildEmailHtml(invoice),
    text:
      `Invoice ${invoice.invoice_number}\n\n` +
      `${invoice.description}\n` +
      `Amount: ${formatAud(invoice.amount_cents)} AUD\n` +
      `Due: ${formatDate(invoice.due_at)}\n` +
      `Reference: ${invoice.pay_reference}\n` +
      (PAYID ? `PayID: ${PAYID}\n` : '') +
      `Questions: info@taunetnelel.org\n`,
    reply_to: RESEND_REPLY_TO,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        content: pdf.toString('base64'),
      },
    ],
    tags: [{ name: 'category', value: 'invoice' }],
    headers: { 'User-Agent': 'taunet-invoices/1.0' },
  };

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'taunet-invoices/1.0',
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.message || 'Resend failed to send invoice email');
    err.status = 502;
    throw err;
  }
  return data;
}

function formatDateTime(d) {
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

function buildPaidEmailHtml(invoice) {
  const amount = formatAud(invoice.amount_cents);
  const paidWhen = invoice.paid_at ? formatDateTime(invoice.paid_at) : formatDateTime(new Date());
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;color:#8B4513;font-size:13px;">Taunet Nelel</p>
  <h1 style="font-size:22px;margin:0 0 12px;">Payment confirmed</h1>
  <p>Hello ${escapeHtml(invoice.full_name || 'there')},</p>
  <p>Thank you. We have confirmed your payment and attached your paid invoice as a PDF.</p>
  <p><strong>${escapeHtml(invoice.description)}</strong><br>
  Amount paid: <strong>${amount} AUD</strong><br>
  Invoice: <strong>${escapeHtml(invoice.invoice_number)}</strong><br>
  Paid: ${escapeHtml(paidWhen)}<br>
  Reference: ${escapeHtml(invoice.pay_reference || '—')}</p>
  <p style="font-size:13px;color:#555;">You can also download this invoice anytime from the Members → Membership page.</p>
  <p style="font-size:13px;color:#555;">Questions: <a href="mailto:info@taunetnelel.org">info@taunetnelel.org</a></p>
  <p style="font-size:13px;color:#666;">Taunet Nelel · Victoria, Australia</p>
</body></html>`;
}

async function sendPaidInvoiceReceiptEmail(invoice) {
  if (!RESEND_API_KEY) {
    const err = new Error('RESEND_API_KEY is not configured on the server.');
    err.status = 500;
    throw err;
  }

  const paidInvoice = {
    ...invoice,
    status: 'paid',
    paid_at: invoice.paid_at || new Date().toISOString(),
  };

  const pdf = buildInvoicePdf({
    orgName: ORG_LEGAL_NAME,
    abn: ORG_ABN,
    invoiceNumber: paidInvoice.invoice_number,
    issuedAt: formatDate(paidInvoice.issued_at),
    dueAt: formatDate(paidInvoice.due_at),
    paidAt: formatDateTime(paidInvoice.paid_at),
    status: 'paid',
    billToName: paidInvoice.full_name || paidInvoice.email,
    billToEmail: paidInvoice.email,
    description: paidInvoice.description,
    amountLabel: formatAud(paidInvoice.amount_cents),
    payReference: paidInvoice.pay_reference,
    payid: PAYID,
    bankName: BANK_NAME,
    bankBsb: BANK_BSB,
    bankAccount: BANK_ACCOUNT,
    bankAccountName: BANK_ACCOUNT_NAME,
  });

  const payload = {
    from: RESEND_FROM,
    to: [paidInvoice.email],
    subject: `Payment confirmed — ${paidInvoice.invoice_number} — Taunet Nelel`,
    html: buildPaidEmailHtml(paidInvoice),
    text:
      `Payment confirmed\n\n` +
      `Invoice ${paidInvoice.invoice_number}\n` +
      `${paidInvoice.description}\n` +
      `Amount paid: ${formatAud(paidInvoice.amount_cents)} AUD\n` +
      `Paid: ${formatDateTime(paidInvoice.paid_at)}\n` +
      `Reference: ${paidInvoice.pay_reference || ''}\n` +
      `Questions: info@taunetnelel.org\n`,
    reply_to: RESEND_REPLY_TO,
    attachments: [
      {
        filename: `${paidInvoice.invoice_number}-paid.pdf`,
        content: pdf.toString('base64'),
      },
    ],
    tags: [{ name: 'category', value: 'invoice-paid' }],
    headers: { 'User-Agent': 'taunet-invoices/1.0' },
  };

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'taunet-invoices/1.0',
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.message || 'Resend failed to send paid invoice email');
    err.status = 502;
    throw err;
  }
  return data;
}

async function createAndEmailInvoice({
  kind,
  email,
  fullName,
  userId,
  eventId,
  amountCents,
  description,
  meta,
}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error('Server missing Supabase credentials');
    err.status = 500;
    throw err;
  }

  const normalizedKind = String(kind || '').toLowerCase();
  if (!['association', 'welfare', 'event'].includes(normalizedKind)) {
    const err = new Error('Invalid invoice kind.');
    err.status = 400;
    throw err;
  }

  const mail = String(email || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    const err = new Error('A valid email is required.');
    err.status = 400;
    throw err;
  }

  let finalAmount = Number(amountCents);
  let finalDescription = String(description || '').trim();
  let resolvedEventId = eventId || null;

  if (normalizedKind === 'association' || normalizedKind === 'welfare') {
    const defaults = KIND_DEFAULTS[normalizedKind];
    finalAmount = defaults.amount_cents;
    if (!finalDescription) finalDescription = defaults.description;
  } else {
    if (resolvedEventId) {
      const rows = await sb(
        `events?id=eq.${encodeURIComponent(resolvedEventId)}&select=id,title,fee_cents&limit=1`
      );
      const event = Array.isArray(rows) ? rows[0] : null;
      if (!event) {
        const err = new Error('Event not found.');
        err.status = 404;
        throw err;
      }
      if (!finalAmount && event.fee_cents) finalAmount = event.fee_cents;
      if (!finalDescription) {
        finalDescription = `Event fee — ${event.title}`;
      }
    }
    if (!finalAmount || finalAmount <= 0) {
      const err = new Error('Event fee is not set. Ask the committee to set a fee for this event.');
      err.status = 400;
      throw err;
    }
    if (!finalDescription) finalDescription = 'Event registration fee';
  }

  const invoiceNumber = await rpcNextInvoiceNumber();
  const issued = new Date();
  const due = new Date(issued.getTime() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
  const payReference = invoiceNumber.replace(/-/g, '');

  const row = {
    invoice_number: invoiceNumber,
    user_id: userId || null,
    email: mail,
    full_name: String(fullName || '').trim() || mail.split('@')[0],
    kind: normalizedKind,
    description: finalDescription,
    amount_cents: Math.round(finalAmount),
    currency: 'AUD',
    status: 'pending',
    event_id: resolvedEventId,
    pay_reference: payReference,
    issued_at: issued.toISOString(),
    due_at: due.toISOString(),
    meta: meta && typeof meta === 'object' ? meta : {},
  };

  const created = await sb('invoices', { method: 'POST', body: row });
  const invoice = Array.isArray(created) ? created[0] : created;
  await sendInvoiceEmail(invoice);
  return invoice;
}

function getPublicPaymentDetails() {
  return {
    configured: paymentConfigured(),
    payid: PAYID || null,
    bank_name: BANK_NAME || null,
    bank_bsb: BANK_BSB || null,
    bank_account_number: BANK_ACCOUNT || null,
    bank_account_name: BANK_ACCOUNT_NAME || null,
    org_legal_name: ORG_LEGAL_NAME,
  };
}

module.exports = {
  createAndEmailInvoice,
  sendInvoiceEmail,
  sendPaidInvoiceReceiptEmail,
  paymentConfigured,
  getPublicPaymentDetails,
  formatAud,
  KIND_DEFAULTS,
  sb,
};
