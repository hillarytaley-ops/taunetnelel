/**
 * Election board administration.
 * GET  /api/elections-board     cycle, positions, expressions, counts
 * POST /api/elections-board     { action: phase|pause|ballot|status, ... }
 * Only emails on public.election_board may use this API.
 */
const { buildElectionAnalytics, buildElectionAnalyticsCsv } = require('./lib/election-analytics');
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

async function requireBoard(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const err = new Error('Sign in with your election board email to continue.');
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
  const email = String(user.email || '')
    .toLowerCase()
    .trim();
  if (!email) {
    const err = new Error('Account has no email.');
    err.status = 403;
    throw err;
  }
  let rows;
  try {
    ({ data: rows } = await sb(
      `election_board?email=eq.${encodeURIComponent(email)}&select=email,full_name&limit=1`
    ));
  } catch (err) {
    const missing = new Error(
      'Election board is not set up yet. Committee: run docs/supabase/APPLY-ELECTION-BOARD.sql.'
    );
    missing.status = 503;
    throw missing;
  }
  const board = Array.isArray(rows) ? rows[0] : rows;
  if (!board) {
    const err = new Error(
      'Signed in, but this email is not on the election board. Ask committee admin to onboard you.'
    );
    err.status = 403;
    throw err;
  }
  return { user, email, board };
}

async function loadCycle() {
  let data;
  try {
    ({ data } = await sb(
      'election_cycles?slug=eq.2026-agm&select=id,slug,title,summary,opens_at,closes_at,is_open,phase&limit=1'
    ));
  } catch (_) {
    ({ data } = await sb(
      'election_cycles?slug=eq.2026-agm&select=id,slug,title,summary,opens_at,closes_at,is_open&limit=1'
    ));
  }
  const cycle = Array.isArray(data) ? data[0] : data;
  if (!cycle) {
    const err = new Error(
      'Elections are not set up yet. Run docs/supabase/APPLY-ELECTIONS.sql.'
    );
    err.status = 503;
    throw err;
  }
  if (!cycle.phase) cycle.phase = cycle.is_open ? 'eoi' : 'closed';
  return cycle;
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

    const session = await requireBoard(req);

    if (req.method === 'GET') {
      rateLimit(`elections-board-get:${clientIp(req)}`, 60, 60_000);
      const cycle = await loadCycle();
      const { data: positions } = await sb(
        `election_positions?cycle_id=eq.${encodeURIComponent(cycle.id)}&select=id,board,title,seats,eligibility,sort_order,is_open&order=sort_order.asc`
      );
      let expressions = [];
      try {
        const { data } = await sb(
          `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&select=id,position_id,email,full_name,phone,statement,status,nominated,created_at&order=created_at.desc&limit=500`
        );
        expressions = data || [];
      } catch (_) {
        const { data } = await sb(
          `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&select=id,position_id,email,full_name,phone,statement,status,created_at&order=created_at.desc&limit=500`
        );
        expressions = data || [];
      }
      let nominations = [];
      let votes = [];
      try {
        const { data: noms } = await sb(
          `election_nominations?cycle_id=eq.${encodeURIComponent(cycle.id)}&select=position_id,expression_id,nominator_email`
        );
        nominations = noms || [];
      } catch (_) {
        nominations = [];
      }
      try {
        const { data: voteRows } = await sb(
          `election_votes?cycle_id=eq.${encodeURIComponent(cycle.id)}&select=position_id,expression_id,voter_email`
        );
        votes = voteRows || [];
      } catch (_) {
        votes = [];
      }
      const analytics = buildElectionAnalytics({
        cycle,
        positions: positions || [],
        expressions,
        nominations,
        votes,
      });
      const url = new URL(req.url, 'http://localhost');
      if (url.searchParams.get('export') === 'csv') {
        const csv = buildElectionAnalyticsCsv({
          ...analytics,
          positions: positions || [],
        });
        const stamp = new Date().toISOString().slice(0, 10);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="taunet-elections-analytics-${stamp}.csv"`
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.end(csv);
      }
      return json(res, 200, {
        officer: { email: session.email, full_name: session.board.full_name || session.email },
        cycle,
        positions: positions || [],
        rows: analytics.rows,
        analytics,
      });
    }

    if (req.method === 'POST') {
      rateLimit(`elections-board-post:${clientIp(req)}`, 40, 60_000);
      const body = await readBody(req);
      const action = String(body.action || '').trim();
      const cycle = await loadCycle();

      if (action === 'phase') {
        const phase = String(body.phase || '').trim();
        if (!['eoi', 'nomination', 'voting', 'closed'].includes(phase)) {
          return json(res, 400, { error: 'Phase must be eoi, nomination, voting, or closed.' });
        }
        const patch = { phase, is_open: phase !== 'closed' };
        await sb(`election_cycles?id=eq.${encodeURIComponent(cycle.id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify(patch),
        });
        if (phase === 'voting') {
          const { data: already } = await sb(
            `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&nominated=eq.true&status=neq.withdrawn&select=id&limit=1`
          );
          if (!already?.length) {
            await sb(
              `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&status=neq.withdrawn`,
              {
                method: 'PATCH',
                prefer: 'return=minimal',
                body: JSON.stringify({ nominated: true, updated_at: new Date().toISOString() }),
              }
            );
          }
        }
        return json(res, 200, { ok: true, ...patch });
      }

      if (action === 'pause') {
        const isOpen = body.is_open !== false;
        await sb(`election_cycles?id=eq.${encodeURIComponent(cycle.id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ is_open: isOpen }),
        });
        return json(res, 200, { ok: true, is_open: isOpen });
      }

      if (action === 'ballot') {
        const id = String(body.id || '').trim();
        if (!id) return json(res, 400, { error: 'Expression id required.' });
        const nominated = body.nominated !== false;
        await sb(`election_expressions?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ nominated, updated_at: new Date().toISOString() }),
        });
        return json(res, 200, { ok: true, nominated });
      }

      if (action === 'status') {
        const id = String(body.id || '').trim();
        const status = String(body.status || '').trim();
        if (!id) return json(res, 400, { error: 'Expression id required.' });
        if (!['submitted', 'withdrawn', 'noted'].includes(status)) {
          return json(res, 400, { error: 'Invalid status.' });
        }
        await sb(`election_expressions?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
        });
        return json(res, 200, { ok: true, status });
      }

      return json(res, 400, { error: 'Unknown action.' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || 'Could not reach the election board.' });
  }
};
