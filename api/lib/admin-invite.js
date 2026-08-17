/**
 * Invite a committee admin: Auth invite/recovery link + Resend email.
 */
const { sendMemberMail, buildAdminInviteMail } = require('./member-mail');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  if (host) return `${proto}://${host}`;
  return PUBLIC_SITE_URL || 'https://taunetnelel.vercel.app';
}

function portalAuthLink(linkPayload, origin, type) {
  const props = linkPayload?.properties || {};
  const hashed = linkPayload?.hashed_token || props.hashed_token || '';
  const linkType = type === 'invite' ? 'invite' : 'recovery';
  if (hashed) {
    const u = new URL(`${origin}/members/auth.html`);
    u.searchParams.set('tab', 'signin');
    u.searchParams.set('type', linkType);
    u.searchParams.set('token_hash', String(hashed));
    u.searchParams.set('next', '../admin/');
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
      `${origin}/members/auth.html?tab=signin&type=${linkType}&next=${encodeURIComponent('../admin/')}`
    );
    return u.toString();
  } catch {
    return raw;
  }
}

async function generateAuthLink(email, type, redirectTo) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
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
    const msg =
      data?.msg || data?.message || data?.error_description || text || 'generate_link failed';
    const err = new Error(msg);
    err.status = resp.status;
    err.code = data?.error_code || data?.code || '';
    throw err;
  }
  return data;
}

function alreadyRegistered(err) {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return (
    err?.status === 422 ||
    /already|registered|exists|duplicate/i.test(msg) ||
    /user_already|email_exists/i.test(code)
  );
}

async function sendCommitteeAdminInvite({ email, fullName, origin }) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error('Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    err.status = 500;
    throw err;
  }

  const site = String(origin || '').replace(/\/$/, '') || requestOrigin({ headers: {} });
  const inviteRedirect = `${site}/members/auth.html?tab=signin&type=invite&next=${encodeURIComponent('../admin/')}`;
  const recoveryRedirect = `${site}/members/auth.html?tab=signin&type=recovery&next=${encodeURIComponent('../admin/')}`;

  let linkType = 'invite';
  let payload;
  try {
    payload = await generateAuthLink(email, 'invite', inviteRedirect);
  } catch (err) {
    if (!alreadyRegistered(err)) throw err;
    linkType = 'recovery';
    payload = await generateAuthLink(email, 'recovery', recoveryRedirect);
  }

  const actionLink = portalAuthLink(payload, site, linkType);
  if (!actionLink) {
    const err = new Error('Could not create a password link. Try again or contact IT.');
    err.status = 502;
    throw err;
  }

  const mail = buildAdminInviteMail({ actionLink, fullName });
  await sendMemberMail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: mail.tags,
    refId: mail.refId,
  });

  return { ok: true, linkType };
}

module.exports = {
  requestOrigin,
  sendCommitteeAdminInvite,
};
