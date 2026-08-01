/**
 * Member password-reset email (reliable path).
 *
 * Creates a Supabase recovery link with the service role, then sends it
 * through Resend so ordinary members get a real email (not only Supabase SMTP).
 *
 * Vercel env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 * Optional:
 *   RESEND_FROM  (default: Taunet Nelel <members@taunetnelel.org>)
 *   RESEND_REPLY_TO (default: info@taunetnelel.org)
 *   PUBLIC_SITE_URL  (fallback origin for recovery redirect)
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
// Prefer a real mailbox name — "noreply@" often lands in spam (Resend guidance).
const RESEND_FROM =
  (process.env.RESEND_FROM || 'Taunet Nelel <members@taunetnelel.org>').trim();
const RESEND_REPLY_TO =
  (process.env.RESEND_REPLY_TO || 'info@taunetnelel.org').trim();
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');

const rateBuckets = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
    const err = new Error('Too many reset requests. Try again in about an hour.');
    err.status = 429;
    throw err;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 32_000) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (host) return `${proto}://${host}`;
  return PUBLIC_SITE_URL || 'https://taunetnelel.vercel.app';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function generateRecoveryLink(email, redirectTo) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'recovery',
      email,
      options: { redirect_to: redirectTo },
    }),
  });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!resp.ok) {
    const msg = data?.msg || data?.message || data?.error_description || text || 'generate_link failed';
    const err = new Error(msg);
    err.status = resp.status;
    err.code = data?.error_code || data?.code || '';
    throw err;
  }
  return data;
}

async function sendResendEmail({ to, subject, html, text }) {
  const payloadBody = {
    from: RESEND_FROM,
    to: [to],
    subject,
    html,
    text,
  };
  if (RESEND_REPLY_TO) {
    payloadBody.reply_to = RESEND_REPLY_TO;
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

function buildEmail(actionLink) {
  const subject = 'Your Taunet Nelel member password';
  const text =
    `Hello,\n\n` +
    `Please use this link to choose a password for your Taunet Nelel member account:\n\n` +
    `${actionLink}\n\n` +
    `This link expires soon. If you did not request this, you can ignore this email.\n\n` +
    `Questions: info@taunetnelel.org\n` +
    `Taunet Nelel — Victoria, Australia\n` +
    `https://taunetnelel.vercel.app\n`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#222;max-width:560px;margin:0 auto;padding:24px;background:#fff;">
  <p style="margin:0 0 12px;font-size:16px;">Hello,</p>
  <p style="margin:0 0 16px;">Please use the button below to choose a password for your <strong>Taunet Nelel</strong> member account.</p>
  <p style="margin:28px 0;">
    <a href="${escapeHtml(actionLink)}"
       style="background:#8B4513;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:600;">
      Choose your password
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#444;">Or copy this link into your browser:</p>
  <p style="word-break:break-all;font-size:13px;color:#555;margin:0 0 20px;">${escapeHtml(actionLink)}</p>
  <p style="color:#666;font-size:13px;margin:0 0 20px;">If you did not request this, you can ignore this email.</p>
  <p style="margin:0;font-size:13px;color:#444;">
    Taunet Nelel · Victoria, Australia<br>
    <a href="mailto:info@taunetnelel.org" style="color:#8B4513;">info@taunetnelel.org</a>
  </p>
</body></html>`;
  return { subject, html, text };
}

/** Always-safe client message (no account enumeration). */
const CLIENT_OK = {
  ok: true,
  message:
    'If that email has a member account, a reset link was sent. Check inbox and spam (from members@taunetnelel.org).',
};

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, {
        error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
      });
    }
    if (!RESEND_API_KEY) {
      return json(res, 500, {
        error:
          'Password reset email is not configured yet (missing RESEND_API_KEY on Vercel). Ask IT to add it.',
      });
    }

    rateLimit(`ip:${clientIp(req)}`, 8, 60 * 60 * 1000);

    const body = await readBody(req);
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) {
      return json(res, 400, { error: 'Enter a valid email address.' });
    }

    rateLimit(`email:${email}`, 4, 60 * 60 * 1000);

    const origin = requestOrigin(req);
    const redirectTo = `${origin}/members/auth.html?tab=signin&type=recovery`;

    let linkPayload;
    try {
      linkPayload = await generateRecoveryLink(email, redirectTo);
    } catch (err) {
      // Unknown user / not found → still pretend success (anti-enumeration)
      const msg = String(err.message || '').toLowerCase();
      if (
        err.status === 404 ||
        /not found|user not found|unable to find|no user/i.test(msg)
      ) {
        return json(res, 200, CLIENT_OK);
      }
      throw err;
    }

    const actionLink =
      linkPayload?.action_link ||
      linkPayload?.properties?.action_link ||
      linkPayload?.data?.properties?.action_link ||
      '';

    if (!actionLink) {
      console.error('generate_link missing action_link', linkPayload);
      return json(res, 502, {
        error: 'Could not create a reset link. Try again or contact IT.',
      });
    }

    const mail = buildEmail(actionLink);
    await sendResendEmail({ to: email, ...mail });
    return json(res, 200, CLIENT_OK);
  } catch (err) {
    const status = err.status || 500;
    console.error('request-password-reset', err);
    return json(res, status, {
      error: err.message || 'Could not send password reset email.',
    });
  }
};
