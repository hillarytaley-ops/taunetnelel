/**
 * Elections expressions of interest.
 * GET  /api/elections           public cycle + positions
 * GET  /api/elections?mine=1    signed-in member's expressions
 * POST /api/elections           submit interest { position_id, statement, phone? }
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const rateBuckets = new Map();

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
    const err = new Error('Too many requests. Try again later.');
    err.status = 429;
    throw err;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20_000) {
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

async function sb(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
    },
    body: options.body,
  });
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!resp.ok) {
    const err = new Error(
      (data && data.message) || (data && data.error) || `Supabase ${resp.status}`
    );
    err.status = resp.status;
    throw err;
  }
  return { data };
}

async function requireUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const err = new Error('Sign in with your member email to continue.');
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

async function loadCycle() {
  const { data } = await sb(
    'election_cycles?slug=eq.2026-agm&select=id,slug,title,summary,opens_at,closes_at,is_open&limit=1'
  );
  const cycle = Array.isArray(data) ? data[0] : data;
  if (!cycle) {
    const err = new Error(
      'Elections are not set up yet. Committee: run docs/supabase/APPLY-ELECTIONS.sql.'
    );
    err.status = 503;
    throw err;
  }
  return cycle;
}

function cycleAccepting(cycle) {
  if (!cycle?.is_open) return false;
  const now = Date.now();
  if (cycle.opens_at && now < Date.parse(cycle.opens_at)) return false;
  if (cycle.closes_at && now > Date.parse(cycle.closes_at)) return false;
  return true;
}

function eligibleFor(position, profile) {
  const association = Boolean(profile?.association_member);
  const welfare = Boolean(profile?.welfare_member);
  if (position.eligibility === 'welfare') return welfare;
  if (position.eligibility === 'association') return association;
  return association || welfare;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, { error: 'Server missing Supabase configuration.' });
    }

    if (req.method === 'GET') {
      rateLimit(`elections-get:${clientIp(req)}`, 60, 60_000);
      const cycle = await loadCycle();
      const { data: positions } = await sb(
        `election_positions?cycle_id=eq.${encodeURIComponent(cycle.id)}&is_open=eq.true&select=id,board,title,seats,eligibility,sort_order&order=sort_order.asc`
      );
      const url = new URL(req.url, 'http://localhost');
      let mine = [];
      if (url.searchParams.get('mine') === '1') {
        const user = await requireUser(req);
        const email = String(user.email || '').toLowerCase();
        const { data } = await sb(
          `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&email=eq.${encodeURIComponent(email)}&select=id,position_id,status,statement,created_at&order=created_at.desc`
        );
        mine = data || [];
      }
      return json(res, 200, {
        cycle: {
          title: cycle.title,
          summary: cycle.summary,
          opens_at: cycle.opens_at,
          closes_at: cycle.closes_at,
          accepting: cycleAccepting(cycle),
        },
        positions: positions || [],
        mine,
      });
    }

    if (req.method === 'POST') {
      rateLimit(`elections-post:${clientIp(req)}`, 12, 60_000);
      const user = await requireUser(req);
      const body = await readBody(req);
      const positionId = String(body.position_id || '').trim();
      const statement = String(body.statement || '').trim();
      const phone = String(body.phone || '').trim().slice(0, 40);
      if (!positionId) return json(res, 400, { error: 'Choose a position.' });
      if (statement.length < 40) {
        return json(res, 400, {
          error: 'Write a short statement (at least 40 characters) about why you wish to vie for this position.',
        });
      }
      if (statement.length > 2000) {
        return json(res, 400, { error: 'Keep your statement under 2,000 characters.' });
      }

      const cycle = await loadCycle();
      if (!cycleAccepting(cycle)) {
        return json(res, 409, { error: 'Expressions of interest are closed.' });
      }

      const { data: posRows } = await sb(
        `election_positions?id=eq.${encodeURIComponent(positionId)}&cycle_id=eq.${encodeURIComponent(cycle.id)}&select=id,title,board,eligibility,is_open&limit=1`
      );
      const position = Array.isArray(posRows) ? posRows[0] : posRows;
      if (!position || position.is_open === false) {
        return json(res, 400, { error: 'That position is not open.' });
      }

      const { data: profiles } = await sb(
        `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,full_name,email,phone,association_member,welfare_member&limit=1`
      );
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      if (!profile) {
        return json(res, 403, {
          error: 'No member profile found. Sign in with the email on the membership list.',
        });
      }
      if (!eligibleFor(position, profile)) {
        const need =
          position.eligibility === 'welfare'
            ? 'a Social Welfare member'
            : 'an Association member';
        return json(res, 403, {
          error: `Only ${need} can express interest for ${position.title}.`,
        });
      }

      const email = String(profile.email || user.email || '').toLowerCase();
      const payload = {
        cycle_id: cycle.id,
        position_id: position.id,
        profile_id: profile.id,
        email,
        full_name: profile.full_name || email,
        phone: phone || profile.phone || null,
        statement,
        status: 'submitted',
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await sb(
        `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&position_id=eq.${encodeURIComponent(position.id)}&email=eq.${encodeURIComponent(email)}&select=id&limit=1`
      );
      const row = Array.isArray(existing) ? existing[0] : existing;
      if (row?.id) {
        await sb(`election_expressions?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            statement,
            phone: payload.phone,
            full_name: payload.full_name,
            status: 'submitted',
            updated_at: payload.updated_at,
          }),
        });
      } else {
        await sb('election_expressions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      return json(res, 200, {
        ok: true,
        message: `Your interest in ${position.title} has been recorded. The returning officer / committee will contact you.`,
      });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || 'Could not save your interest.' });
  }
};
