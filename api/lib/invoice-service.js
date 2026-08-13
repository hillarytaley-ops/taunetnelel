/**
 * Shared invoice create + Resend email helpers.
 */

const { buildInvoicePdf } = require('./invoice-pdf');
const { sendResendEmail, assertResendConfigured } = require('./member-mail');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
    description: 'Association membership (AUD $50 / year)',
  },
  welfare: {
    amount_cents: 30000,
    description: 'Association + Welfare membership (AUD $300 / year)',
  },
  donation: {
    amount_cents: 5000,
    description: 'Community donation — Taunet Nelel',
  },
};

/** Min/max donation via public PayID portal (AUD cents). */
const DONATION_MIN_CENTS = 1000; // $10
const DONATION_MAX_CENTS = 500000; // $5,000

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
  <h1 style="font-size:22px;margin:0 0 12px;">Payment request ${escapeHtml(invoice.invoice_number)}</h1>
  <p>Hello ${escapeHtml(invoice.full_name || 'there')},</p>
  <p>This is a <strong>payment request</strong>, not a receipt. Please pay by PayID or bank transfer using the reference below. A paid receipt is emailed only after the Treasurer confirms your payment in Admin.</p>
  <p><strong>${escapeHtml(invoice.description)}</strong><br>
  Amount due: <strong>${amount} AUD</strong><br>
  Due: ${escapeHtml(formatDate(invoice.due_at))}</p>
  <p style="margin:0 0 8px;"><strong>How to pay</strong></p>
  <ul>${payBits.join('')}</ul>
  <p style="font-size:13px;color:#555;">A PDF payment request is attached (status: pending). Questions: <a href="mailto:info@taunetnelel.org">info@taunetnelel.org</a></p>
  <p style="font-size:13px;color:#666;">Taunet Nelel · Victoria, Australia</p>
</body></html>`;
}

async function sendInvoiceEmail(invoice) {
  assertResendConfigured();
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
    paidAt: '',
    // Never send a paid/receipt PDF until Admin marks paid
    status: 'pending',
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

  return sendResendEmail({
    to: invoice.email,
    subject: `Payment request ${invoice.invoice_number} — Taunet Nelel`,
    html: buildEmailHtml(invoice),
    text:
      `Payment request ${invoice.invoice_number}\n\n` +
      `${invoice.description}\n` +
      `Amount due: ${formatAud(invoice.amount_cents)} AUD\n` +
      `Due: ${formatDate(invoice.due_at)}\n` +
      `Reference: ${invoice.pay_reference}\n` +
      (PAYID ? `PayID: ${PAYID}\n` : '') +
      `This is not a receipt. You will receive a paid receipt after the Treasurer confirms your payment.\n` +
      `Questions: info@taunetnelel.org\n` +
      `Taunet Nelel Welfare Association · Victoria, Australia\n` +
      `Portal emails come from members@taunetnelel.org — add that address to Contacts.\n`,
    attachments: [
      {
        filename: `${invoice.invoice_number}-payment-request.pdf`,
        content: pdf.toString('base64'),
      },
    ],
    tags: [{ name: 'category', value: 'invoice-request' }],
    refId: `taunet-invoice-${invoice.invoice_number}`,
  });
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
  if (String(invoice?.status || '').toLowerCase() !== 'paid' || !invoice?.paid_at) {
    const err = new Error(
      'Paid receipt emails are only sent after Admin marks the invoice paid.'
    );
    err.status = 400;
    throw err;
  }
  assertResendConfigured();

  const paidInvoice = {
    ...invoice,
    status: 'paid',
    paid_at: invoice.paid_at,
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

  return sendResendEmail({
    to: paidInvoice.email,
    subject: `Payment confirmed — ${paidInvoice.invoice_number} — Taunet Nelel`,
    html: buildPaidEmailHtml(paidInvoice),
    text:
      `Payment confirmed\n\n` +
      `Invoice ${paidInvoice.invoice_number}\n` +
      `${paidInvoice.description}\n` +
      `Amount paid: ${formatAud(paidInvoice.amount_cents)} AUD\n` +
      `Paid: ${formatDateTime(paidInvoice.paid_at)}\n` +
      `Reference: ${paidInvoice.pay_reference || ''}\n` +
      `Questions: info@taunetnelel.org\n` +
      `Taunet Nelel Welfare Association · Victoria, Australia\n` +
      `Portal emails come from members@taunetnelel.org — add that address to Contacts.\n`,
    attachments: [
      {
        filename: `${paidInvoice.invoice_number}-paid.pdf`,
        content: pdf.toString('base64'),
      },
    ],
    tags: [{ name: 'category', value: 'invoice-paid' }],
    refId: `taunet-paid-${paidInvoice.invoice_number}`,
  });
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
  dueAt,
  skipEmail = false,
}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error('Server missing Supabase credentials');
    err.status = 500;
    throw err;
  }

  const normalizedKind = String(kind || '').toLowerCase();
  if (!['association', 'welfare', 'event', 'donation'].includes(normalizedKind)) {
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

  if (normalizedKind === 'association') {
    const defaults = KIND_DEFAULTS.association;
    finalAmount = defaults.amount_cents;
    if (!finalDescription) finalDescription = defaults.description;
  } else if (normalizedKind === 'welfare') {
    const defaults = KIND_DEFAULTS.welfare;
    // Allow full $300 or installment $100 only
    const allowed = new Set([defaults.amount_cents, 10000]);
    if (!Number.isFinite(finalAmount) || !allowed.has(Math.round(finalAmount))) {
      finalAmount = defaults.amount_cents;
    } else {
      finalAmount = Math.round(finalAmount);
    }
    if (!finalDescription) {
      finalDescription =
        finalAmount === 10000
          ? 'Association + Welfare — installment (AUD $100)'
          : defaults.description;
    }
  } else if (normalizedKind === 'donation') {
    const defaults = KIND_DEFAULTS.donation;
    finalAmount = Math.round(Number(amountCents));
    if (!Number.isFinite(finalAmount) || finalAmount < DONATION_MIN_CENTS) {
      const err = new Error(`Minimum donation is ${formatAud(DONATION_MIN_CENTS)} AUD.`);
      err.status = 400;
      throw err;
    }
    if (finalAmount > DONATION_MAX_CENTS) {
      const err = new Error(`Maximum donation via this form is ${formatAud(DONATION_MAX_CENTS)} AUD.`);
      err.status = 400;
      throw err;
    }
    if (!finalDescription) {
      finalDescription = `${defaults.description} (${formatAud(finalAmount)})`;
    }
  } else {
    if (resolvedEventId) {
      const rows = await sb(
        `events?id=eq.${encodeURIComponent(resolvedEventId)}&select=id,title,fee_cents&limit=1`
      );
      const event = Array.isArray(rows) ? rows[0] : null;
      if (event) {
        if (!finalAmount && event.fee_cents) finalAmount = event.fee_cents;
        if (!finalDescription) {
          finalDescription = `Event fee — ${event.title}`;
        }
      } else {
        // Public catalog bookings may invoice before the row exists in events.
        // Keep the catalog id in meta; leave the FK null to avoid a 404.
        if (!meta || typeof meta !== 'object') meta = {};
        meta.catalog_event_id = resolvedEventId;
        resolvedEventId = null;
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
  const due =
    dueAt instanceof Date && !Number.isNaN(dueAt.getTime())
      ? dueAt
      : typeof dueAt === 'string' && dueAt
        ? new Date(dueAt)
        : new Date(issued.getTime() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
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
  if (!skipEmail) {
    await sendInvoiceEmail(invoice);
    const stamped = {
      ...(invoice.meta && typeof invoice.meta === 'object' ? invoice.meta : {}),
      emailed_at: new Date().toISOString(),
    };
    try {
      await sb(`invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
        method: 'PATCH',
        body: { meta: stamped },
      });
      invoice.meta = stamped;
    } catch (_) {
      /* non-fatal */
    }
  }
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

function addMonthsMelbourne(baseDate, months) {
  const d = new Date(baseDate.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Welfare Plus checkout: full $300 or 3 × $100 installments.
 * Installments 2–3 are created now (with future due dates) and emailed by cron near due.
 */
async function createWelfarePayCheckout({
  email,
  fullName,
  userId,
  phone,
  plan,
}) {
  const mode = String(plan || 'full').toLowerCase() === 'installments' ? 'installments' : 'full';
  const mail = String(email || '')
    .trim()
    .toLowerCase();
  const name = String(fullName || '').trim();

  if (mode === 'full') {
    const invoice = await createAndEmailInvoice({
      kind: 'welfare',
      email: mail,
      fullName: name,
      userId,
      amountCents: 30000,
      description: 'Association + Welfare membership — full year (AUD $300)',
      skipEmail: true,
      meta: {
        source: 'pay_portal_welfare',
        plan: 'full',
        installments: 1,
        installment: 1,
        of: 1,
        phone: phone || null,
      },
    });
    return { plan: 'full', invoices: [invoice], primary: invoice };
  }

  const seriesId =
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `welf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const issued = new Date();
  const dueDates = [
    new Date(issued.getTime() + 14 * 24 * 60 * 60 * 1000),
    addMonthsMelbourne(issued, 1),
    addMonthsMelbourne(issued, 2),
  ];

  const invoices = [];
  for (let i = 0; i < 3; i += 1) {
    const n = i + 1;
    const invoice = await createAndEmailInvoice({
      kind: 'welfare',
      email: mail,
      fullName: name,
      userId,
      amountCents: 10000,
      description: `Association + Welfare — installment ${n} of 3 (AUD $100)`,
      dueAt: dueDates[i],
      // Installment 1: PayID on screen only. Later installments emailed as payment requests (not receipts).
      skipEmail: true,
      meta: {
        source: 'pay_portal_welfare',
        plan: 'installments',
        installments: 3,
        installment: n,
        of: 3,
        series_id: seriesId,
        phone: phone || null,
        email_scheduled: n > 1,
      },
    });
    invoices.push(invoice);
  }

  return { plan: 'installments', series_id: seriesId, invoices, primary: invoices[0] };
}

function buildReminderEmailHtml(invoice, kind) {
  const amount = formatAud(invoice.amount_cents);
  const heading =
    kind === 'due'
      ? 'Payment reminder — amount still due'
      : 'Payment request — installment ready';
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;color:#8B4513;font-size:13px;">Taunet Nelel</p>
  <h1 style="font-size:22px;margin:0 0 12px;">${escapeHtml(heading)}</h1>
  <p>Hello ${escapeHtml(invoice.full_name || 'there')},</p>
  <p>${
    kind === 'due'
      ? 'This is a friendly reminder that your Association + Welfare installment is still due. This is not a receipt — a paid receipt is emailed only after the Treasurer confirms your payment.'
      : 'Your next Association + Welfare installment payment request is ready. This is not a receipt — a paid receipt is emailed only after the Treasurer confirms your payment.'
  }</p>
  <p><strong>${escapeHtml(invoice.description)}</strong><br>
  Amount due: <strong>${amount} AUD</strong><br>
  Due: ${escapeHtml(formatDate(invoice.due_at))}<br>
  Payment reference: <strong>${escapeHtml(invoice.pay_reference)}</strong></p>
  ${PAYID ? `<p><strong>PayID:</strong> ${escapeHtml(PAYID)}</p>` : ''}
  <p style="font-size:13px;color:#555;">A PDF copy is attached. Questions: <a href="mailto:info@taunetnelel.org">info@taunetnelel.org</a></p>
</body></html>`;
}

async function sendInvoiceReminderEmail(invoice, reminderKind) {
  assertResendConfigured();

  const kind = reminderKind === 'due' ? 'due' : 'issue';
  const pdf = buildInvoicePdf({
    orgName: ORG_LEGAL_NAME,
    abn: ORG_ABN,
    invoiceNumber: invoice.invoice_number,
    issuedAt: formatDate(invoice.issued_at),
    dueAt: formatDate(invoice.due_at),
    paidAt: '',
    status: 'pending',
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

  const subject =
    kind === 'due'
      ? `Reminder: ${invoice.invoice_number} due — Taunet Nelel`
      : `Invoice ${invoice.invoice_number} — installment ready — Taunet Nelel`;

  return sendResendEmail({
    to: invoice.email,
    subject,
    html: buildReminderEmailHtml(invoice, kind),
    text:
      `${subject}\n\n` +
      `${invoice.description}\n` +
      `Amount: ${formatAud(invoice.amount_cents)} AUD\n` +
      `Due: ${formatDate(invoice.due_at)}\n` +
      `Reference: ${invoice.pay_reference}\n` +
      `Questions: info@taunetnelel.org\n` +
      `Portal emails come from members@taunetnelel.org — add that address to Contacts.\n`,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        content: pdf.toString('base64'),
      },
    ],
    tags: [{ name: 'category', value: 'invoice-reminder' }],
    refId: `taunet-reminder-${invoice.invoice_number}-${kind}`,
  });
}

/**
 * Daily job: email scheduled installment invoices near due, and nudge overdue pending ones.
 */
async function processInvoiceReminders() {
  const now = Date.now();
  const inThreeDays = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await sb(
    `invoices?status=eq.pending&kind=eq.welfare&due_at=lte.${encodeURIComponent(inThreeDays)}&select=*&order=due_at.asc&limit=100`
  );
  const list = Array.isArray(rows) ? rows : [];
  const results = { issued: 0, reminded: 0, skipped: 0, errors: [] };

  for (const invoice of list) {
    const meta = invoice.meta && typeof invoice.meta === 'object' ? { ...invoice.meta } : {};
    try {
      if (!meta.emailed_at) {
        await sendInvoiceReminderEmail(invoice, 'issue');
        meta.emailed_at = new Date().toISOString();
        meta.email_scheduled = false;
        await sb(`invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
          method: 'PATCH',
          body: { meta },
        });
        results.issued += 1;
        continue;
      }

      const dueMs = new Date(invoice.due_at).getTime();
      const overdueOrDue = Number.isFinite(dueMs) && dueMs <= now + 12 * 60 * 60 * 1000;
      const reminders = Number(meta.reminder_count || 0);
      if (overdueOrDue && reminders < 2) {
        const last = meta.reminder_sent_at ? new Date(meta.reminder_sent_at).getTime() : 0;
        if (now - last < 5 * 24 * 60 * 60 * 1000) {
          results.skipped += 1;
          continue;
        }
        await sendInvoiceReminderEmail(invoice, 'due');
        meta.reminder_sent_at = new Date().toISOString();
        meta.reminder_count = reminders + 1;
        await sb(`invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
          method: 'PATCH',
          body: { meta },
        });
        results.reminded += 1;
      } else {
        results.skipped += 1;
      }
    } catch (err) {
      results.errors.push({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        error: err.message || String(err),
      });
    }
  }

  return results;
}

/**
 * True when a welfare invoice payment should unlock welfare membership.
 * Full plan: any paid welfare invoice. Installments: all in the series paid.
 */
async function welfareSeriesFullyPaid(invoice) {
  if (!invoice || invoice.kind !== 'welfare') return false;
  const meta = invoice.meta && typeof invoice.meta === 'object' ? invoice.meta : {};
  if (meta.plan !== 'installments' || !meta.series_id) {
    return invoice.status === 'paid' && Number(invoice.amount_cents) >= 30000;
  }
  const rows = await sb(
    `invoices?kind=eq.welfare&select=id,status,meta&limit=50&email=eq.${encodeURIComponent(invoice.email)}`
  );
  const list = Array.isArray(rows) ? rows : [];
  const series = list.filter((row) => row.meta?.series_id === meta.series_id);
  if (series.length < 3) return false;
  return series.every((row) => row.status === 'paid' || row.id === invoice.id);
}

module.exports = {
  createAndEmailInvoice,
  createWelfarePayCheckout,
  sendInvoiceEmail,
  sendPaidInvoiceReceiptEmail,
  sendInvoiceReminderEmail,
  processInvoiceReminders,
  welfareSeriesFullyPaid,
  paymentConfigured,
  getPublicPaymentDetails,
  formatAud,
  KIND_DEFAULTS,
  DONATION_MIN_CENTS,
  DONATION_MAX_CENTS,
  sb,
};
