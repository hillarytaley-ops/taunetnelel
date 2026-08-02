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
      'Password reset email is not configured yet (missing RESEND_API_KEY on Vercel).'
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

/**
 * @param {{
 *   to: string,
 *   subject: string,
 *   html: string,
 *   text: string,
 *   tags?: Array<{ name: string, value: string }>,
 * }} opts
 */
async function sendMemberMail(opts) {
  assertResendConfigured();
  const payloadBody = {
    from: RESEND_FROM,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    headers: {
      'X-Entity-Ref-ID': `taunet-${Date.now()}`,
    },
  };
  if (RESEND_REPLY_TO) {
    payloadBody.reply_to = RESEND_REPLY_TO;
  }
  if (opts.tags && opts.tags.length) {
    payloadBody.tags = opts.tags;
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
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

  const text =
    `Hello ${name},\n\n` +
    `${lead}\n\n` +
    `${actionLink}\n\n` +
    `Open the link, then tap Continue on the website to choose your password. ` +
    `The link stays usable until you set a password (or until it expires — usually up to 24 hours). ` +
    `If you did not request this, you can ignore this email — your password will stay the same.\n\n` +
    `Questions? Reply to this email or write to info@taunetnelel.org\n\n` +
    `Taunet Nelel Welfare Association\n` +
    `Victoria, Australia\n` +
    `https://taunetnelel.org\n`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f4f1;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e0d8;">
        <tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#8B4513;">Taunet Nelel</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1a1a1a;font-weight:700;">${escapeHtml(cta)}</h1>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#222;">Hello ${escapeHtml(name)},</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.55;color:#222;">${escapeHtml(lead)}</p>
          <p style="margin:0 0 22px;">
            <a href="${escapeHtml(actionLink)}"
               style="background:#8B4513;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:4px;display:inline-block;font-weight:700;font-size:15px;">
              ${escapeHtml(cta)}
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#555;">Or paste this link into your browser:</p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#555;word-break:break-all;">${escapeHtml(actionLink)}</p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#666;">Open the link, then tap <strong>Continue</strong> on the website. The link stays usable until you set a password (or until it expires — usually up to 24 hours). If you did not request this, ignore this email.</p>
          <p style="margin:0;font-size:13px;line-height:1.55;color:#444;">
            Taunet Nelel Welfare Association · Victoria, Australia<br>
            <a href="mailto:info@taunetnelel.org" style="color:#8B4513;">info@taunetnelel.org</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
    text,
    tags: [{ name: 'category', value: isSet ? 'member_invite' : 'password_reset' }],
  };
}

module.exports = {
  RESEND_FROM,
  RESEND_REPLY_TO,
  sendMemberMail,
  buildPasswordMail,
  escapeHtml,
  assertResendConfigured,
};
