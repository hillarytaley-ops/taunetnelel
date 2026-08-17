/**
 * Shared Resend sender for member transactional mail.
 * Keep From = members@ (never noreply@) and always include text + reply_to.
 */

const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = (
  process.env.RESEND_FROM ||
  'Taunet Nelel <members@taunetnelel.org>'
).trim();
const RESEND_REPLY_TO = (
  process.env.RESEND_REPLY_TO ||
  'info@taunetnelel.org'
).trim();
const PUBLIC_SITE_URL = (
  process.env.PUBLIC_SITE_URL ||
  'https://taunetnelel.vercel.app'
).replace(/\/$/, '');

const ORG_FOOTER_LINES = [
  'Taunet Nelel Welfare Association',
  'Victoria, Australia',
  'info@taunetnelel.org',
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function assertResendConfigured() {
  if (!RESEND_API_KEY) {
    const err = new Error(
      'Member email is not configured yet (missing RESEND_API_KEY on Vercel).'
    );
    err.status = 500;
    throw err;
  }
  if (/noreply@/i.test(RESEND_FROM)) {
    const err = new Error(
      'RESEND_FROM must not use noreply@ — use members@taunetnelel.org.'
    );
    err.status = 500;
    throw err;
  }
}

function deliverabilityHeaders(refId) {
  const id = String(refId || `taunet-${Date.now()}`).slice(0, 120);
  return {
    'X-Entity-Ref-ID': id,
    'List-Id': '<members.taunetnelel.org>',
    'X-Auto-Response-Suppress': 'OOF, AutoReply',
  };
}

function mailFooterText() {
  return (
    `${ORG_FOOTER_LINES.join('\n')}\n` +
    `${PUBLIC_SITE_URL}\n` +
    `Portal emails always come from members@taunetnelel.org — add that address to Contacts.\n`
  );
}

function mailFooterHtml() {
  return `
          <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#444;">
            Taunet Nelel Welfare Association · Victoria, Australia<br>
            <a href="mailto:info@taunetnelel.org" style="color:#8B4513;">info@taunetnelel.org</a><br>
            <a href="${escapeHtml(PUBLIC_SITE_URL)}" style="color:#8B4513;">${escapeHtml(PUBLIC_SITE_URL)}</a>
          </p>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.45;color:#777;">
            Portal emails come from <strong>members@taunetnelel.org</strong>.
            Add that address to Contacts so messages stay out of Spam.
          </p>`;
}

/**
 * Low-level Resend send used by member mail + invoices.
 * @param {{
 *   to: string|string[],
 *   subject: string,
 *   html: string,
 *   text: string,
 *   tags?: Array<{ name: string, value: string }>,
 *   attachments?: Array<{ filename: string, content: string }>,
 *   headers?: Record<string, string>,
 *   refId?: string,
 * }} opts
 */
async function sendResendEmail(opts) {
  assertResendConfigured();
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  if (!to.length || !to[0]) {
    const err = new Error('Missing email recipient.');
    err.status = 400;
    throw err;
  }
  if (!opts.text || !String(opts.text).trim()) {
    const err = new Error('Plain-text body is required for deliverability.');
    err.status = 500;
    throw err;
  }

  const payloadBody = {
    from: RESEND_FROM,
    to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    headers: {
      ...deliverabilityHeaders(opts.refId),
      ...(opts.headers || {}),
    },
  };
  if (RESEND_REPLY_TO) {
    payloadBody.reply_to = RESEND_REPLY_TO;
  }
  if (opts.tags && opts.tags.length) {
    payloadBody.tags = opts.tags;
  }
  if (opts.attachments && opts.attachments.length) {
    payloadBody.attachments = opts.attachments;
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'taunet-member-mail/2.0',
    },
    body: JSON.stringify(payloadBody),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(payload?.message || 'Resend failed to send email');
    err.status = 502;
    throw err;
  }
  return payload;
}

/**
 * @param {{
 *   to: string,
 *   subject: string,
 *   html: string,
 *   text: string,
 *   tags?: Array<{ name: string, value: string }>,
 *   refId?: string,
 * }} opts
 */
async function sendMemberMail(opts) {
  return sendResendEmail(opts);
}

function brandedShell({ eyebrow, title, greeting, lead, ctaLabel, actionLink, extraHtml = '', extraText = '' }) {
  const text =
    `Hello ${greeting},\n\n` +
    `${lead}\n\n` +
    `${actionLink}\n\n` +
    (extraText ? `${extraText}\n\n` : '') +
    `Questions? Reply to this email or write to info@taunetnelel.org\n\n` +
    mailFooterText();

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f4f1;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e0d8;">
        <tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.06em;color:#8B4513;">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1a1a1a;font-weight:700;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#222;">Hello ${escapeHtml(greeting)},</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.55;color:#222;">${escapeHtml(lead)}</p>
          <p style="margin:0 0 22px;">
            <a href="${escapeHtml(actionLink)}"
               style="background:#8B4513;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:4px;display:inline-block;font-weight:700;font-size:15px;">
              ${escapeHtml(ctaLabel)}
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#555;">Or paste this link into your browser:</p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#555;word-break:break-all;">${escapeHtml(actionLink)}</p>
          ${extraHtml}
          ${mailFooterHtml()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { text, html };
}

/**
 * Password set / reset (invite recovery + Forgot password).
 * @param {{ actionLink: string, fullName?: string, kind?: 'reset'|'set' }} opts
 */
function buildPasswordMail({ actionLink, fullName = '', kind = 'reset' }) {
  const name = String(fullName || '').trim() || 'there';
  const isSet = kind === 'set';
  const subject = isSet
    ? 'Set your Taunet Nelel member password'
    : 'Reset your Taunet Nelel member password';
  const lead = isSet
    ? 'Welcome to the Taunet Nelel member portal. Use the button below to set your password.'
    : 'We received a request to reset the password for your Taunet Nelel member account.';
  const cta = isSet ? 'Set your password' : 'Choose a new password';
  const shell = brandedShell({
    eyebrow: 'Taunet Nelel',
    title: cta,
    greeting: name,
    lead,
    ctaLabel: cta,
    actionLink,
    extraHtml:
      '<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666;">Open the link, then tap <strong>Continue</strong> on the website. The link stays usable until you set a password (or until it expires — usually up to 24 hours). If you did not request this, ignore this email.</p>',
    extraText:
      'Open the link, then tap Continue on the website to choose your password. ' +
      'The link stays usable until you set a password (or until it expires — usually up to 24 hours). ' +
      'If you did not request this, you can ignore this email — your password will stay the same.',
  });

  return {
    subject,
    html: shell.html,
    text: shell.text,
    tags: [{ name: 'category', value: isSet ? 'member_invite' : 'password_reset' }],
    refId: `taunet-${isSet ? 'invite' : 'reset'}-${Date.now()}`,
  };
}

/**
 * Committee admin invite — create password, then sign in to the dashboard.
 * @param {{ actionLink: string, fullName?: string }} opts
 */
function buildAdminInviteMail({ actionLink, fullName = '' }) {
  const name = String(fullName || '').trim() || 'there';
  const subject = 'Set your Taunet Nelel committee admin password';
  const lead =
    'You have been invited to the Taunet Nelel committee admin dashboard. Use the button below to create your own password, then sign in on the Admin tab.';
  const shell = brandedShell({
    eyebrow: 'Committee admin',
    title: 'Create your admin password',
    greeting: name,
    lead,
    ctaLabel: 'Set my password',
    actionLink,
    extraHtml:
      '<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666;">Open the link, then tap <strong>Continue</strong> on the website and choose a password (at least 8 characters). After that, sign in at Members → Admin. The link stays usable until you set a password (or until it expires — usually up to 24 hours). If you were not expecting this, ignore the email and tell IT.</p>',
    extraText:
      'Open the link, then tap Continue on the website and choose a password (at least 8 characters). ' +
      'After that, sign in at Members → Admin. ' +
      'The link stays usable until you set a password (or until it expires — usually up to 24 hours). ' +
      'If you were not expecting this, ignore the email and tell IT.',
  });

  return {
    subject,
    html: shell.html,
    text: shell.text,
    tags: [{ name: 'category', value: 'admin_invite' }],
    refId: `taunet-admin-invite-${Date.now()}`,
  };
}

/**
 * Join / email confirmation (branded — replaces spammy Supabase default template).
 * @param {{ actionLink: string, fullName?: string }} opts
 */
function buildConfirmMail({ actionLink, fullName = '' }) {
  const name = String(fullName || '').trim() || 'there';
  const subject = 'Confirm your Taunet Nelel member email';
  const lead =
    'Thanks for joining Taunet Nelel. Confirm your email to finish setting up your member account.';
  const shell = brandedShell({
    eyebrow: 'Taunet Nelel',
    title: 'Confirm your email',
    greeting: name,
    lead,
    ctaLabel: 'Confirm email',
    actionLink,
    extraHtml:
      '<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666;">Open the link, then tap <strong>Continue</strong> if the website asks. If you did not create this account, ignore this email.</p>',
    extraText:
      'Open the link, then tap Continue if the website asks. If you did not create this account, ignore this email.',
  });

  return {
    subject,
    html: shell.html,
    text: shell.text,
    tags: [{ name: 'category', value: 'email_confirm' }],
    refId: `taunet-confirm-${Date.now()}`,
  };
}

async function sendResendBatch(items) {
  assertResendConfigured();
  const list = Array.isArray(items) ? items.slice(0, 100) : [];
  if (!list.length) return { data: [] };
  const resp = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'taunet-member-mail/2.0',
    },
    body: JSON.stringify(list),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(payload?.message || 'Resend batch send failed');
    err.status = 502;
    throw err;
  }
  return payload;
}

function buildCampaignMail({ greeting, subject, bodyText, unsubUrl }) {
  const name = String(greeting || 'there').trim() || 'there';
  const body = String(bodyText || '').trim();
  const unsub = String(unsubUrl || `${PUBLIC_SITE_URL}/unsubscribe.html`);
  const text =
    `Hello ${name},\n\n` +
    `${body}\n\n` +
    `Questions? Reply to this email or write to info@taunetnelel.org\n\n` +
    `Unsubscribe: ${unsub}\n\n` +
    mailFooterText();
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f4f1;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e0d8;">
        <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.06em;color:#8B4513;">Taunet Nelel</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1a1a1a;">${escapeHtml(subject)}</h1>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#222;">Hello ${escapeHtml(name)},</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#222;white-space:pre-wrap;">${escapeHtml(body)}</p>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#666;">Questions? Reply to this email or write to info@taunetnelel.org</p>
          ${mailFooterHtml()}
          <p style="margin:16px 0 0;font-size:11px;line-height:1.45;color:#888;">
            <a href="${escapeHtml(unsub)}" style="color:#8B4513;">Unsubscribe from committee emails</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject: String(subject || 'Taunet Nelel'), html, text };
}

module.exports = {
  RESEND_FROM,
  RESEND_REPLY_TO,
  PUBLIC_SITE_URL,
  sendResendEmail,
  sendResendBatch,
  sendMemberMail,
  buildPasswordMail,
  buildAdminInviteMail,
  buildConfirmMail,
  buildCampaignMail,
  brandedShell,
  escapeHtml,
  assertResendConfigured,
  deliverabilityHeaders,
};
