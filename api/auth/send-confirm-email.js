/**
 * Branded Join / email-confirmation mail via Resend.
 *
 * Creates a Supabase signup confirmation link with the service role, then
 * sends it through Resend (not the spammy default Supabase Auth template).
 *
 * Vercel env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 * Optional:
 *   RESEND_FROM, RESEND_REPLY_TO, PUBLIC_SITE_URL
 *
 * In Supabase Auth → Templates → Confirm signup: replace the body with a
 * short stub (or disable Confirm email if you only use this path) so members
 * do not get two emails.
 */
const { sendMemberMail, buildConfirmMail } = require('../lib/member-mail');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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
    const err = new Error('Too many confirmation requests. Try again in about an hour.');
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

/**
 * Prefer a portal link with token_hash so email scanners do not burn the OTP.
 */
function portalConfirmLink(linkPayload, origin) {
  const props = linkPayload?.properties || {};
  const hashed = linkPayload?.hashed_token || props.hashed_token || '';
  if (hashed) {
    const u = new URL(`${origin}/members/auth.html`);
    u.searchParams.set('tab', 'signin');
    u.searchParams.set('type', 'signup');
    u.searchParams.set('token_hash', String(hashed));
    return u.toString();
  }
  const raw =
    linkPayload?.action_link ||
    props.action_link ||
    linkPayload?.data?.properties?.action_link ||
    '';
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.searchParams.set(
      'redirect_to',
      `${origin}/members/auth.html?tab=signin&type=signup`
    );
    return u.toString();
  } catch {
    return raw;
  }
}

async function generateSignupLink(email, redirectTo) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'signup',
      email,
      redirect_to: redirectTo,
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

const CLIENT_OK = {
  ok: true,
  message:
    'If that email needs confirmation, a link was sent from members@taunetnelel.org. ' +
    'Add that address to Contacts, check Inbox first, then Spam — mark Not spam if needed.',
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

    rateLimit(`ip:${clientIp(req)}`, 8, 60 * 60 * 1000);

    const body = await readBody(req);
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const fullName = String(body.fullName || body.full_name || '').trim();
    if (!isValidEmail(email)) {
      return json(res, 400, { error: 'Enter a valid email address.' });
    }

    rateLimit(`email:${email}`, 4, 60 * 60 * 1000);

    const origin = requestOrigin(req);
    const redirectTo = `${origin}/members/auth.html?tab=signin&type=signup`;

    let linkPayload;
    try {
      linkPayload = await generateSignupLink(email, redirectTo);
    } catch (err) {
      const msg = String(err.message || '').toLowerCase();
      if (
        err.status === 404 ||
        /not found|user not found|unable to find|no user/i.test(msg)
      ) {
        return json(res, 200, CLIENT_OK);
      }
      throw err;
    }

    const actionLink = portalConfirmLink(linkPayload, origin);
    if (!actionLink) {
      console.error('generate_link missing hashed_token/action_link', linkPayload);
      return json(res, 502, {
        error: 'Could not create a confirmation link. Try again or contact IT.',
      });
    }

    const mail = buildConfirmMail({ actionLink, fullName });
    await sendMemberMail({ to: email, ...mail });
    return json(res, 200, CLIENT_OK);
  } catch (err) {
    const status = err.status || 500;
    console.error('send-confirm-email', err);
    return json(res, status, {
      error: err.message || 'Could not send confirmation email.',
    });
  }
};
