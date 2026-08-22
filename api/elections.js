/**
 * Elections: EOI → nomination (from EOI list) → voting (nominated candidates).
 * GET  /api/elections           public cycle + positions
 * GET  /api/elections?mine=1    signed-in member: own EOIs, nominees, votes
 * POST /api/elections           { action: eoi|nominate|vote, ... }
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
      'Elections are not set up yet. Committee: run docs/supabase/APPLY-ELECTIONS.sql.'
    );
    err.status = 503;
    throw err;
  }
  if (!cycle.phase) cycle.phase = cycle.is_open ? 'eoi' : 'closed';
  return cycle;
}

function publicCycle(cycle) {
  const phase = cycle.phase || 'eoi';
  return {
    title: cycle.title,
    summary: cycle.summary,
    opens_at: cycle.opens_at,
    closes_at: cycle.closes_at,
    is_open: cycle.is_open !== false,
    phase,
    accepting: cycle.is_open !== false && phase === 'eoi',
    acceptingNomination: cycle.is_open !== false && phase === 'nomination',
    acceptingVote: cycle.is_open !== false && phase === 'voting',
  };
}

function eligibleFor(position, profile) {
  const association = Boolean(profile?.association_member);
  const welfare = Boolean(profile?.welfare_member);
  if (position.eligibility === 'welfare') return welfare;
  if (position.eligibility === 'association') return association;
  return association || welfare;
}

async function loadProfile(user) {
  const { data: profiles } = await sb(
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,full_name,email,phone,association_member,welfare_member&limit=1`
  );
  return Array.isArray(profiles) ? profiles[0] : profiles;
}

async function countBy(table, cycleId) {
  const { data } = await sb(
    `${table}?cycle_id=eq.${encodeURIComponent(cycleId)}&select=position_id,expression_id`
  );
  const map = {};
  (data || []).forEach((row) => {
    const key = `${row.position_id}:${row.expression_id}`;
    map[key] = (map[key] || 0) + 1;
  });
  return map;
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
      let myNominations = [];
      let myVotes = [];
      let expressions = [];
      const phase = cycle.phase || 'eoi';

      if (url.searchParams.get('mine') === '1') {
        const user = await requireUser(req);
        const email = String(user.email || '').toLowerCase();
        try {
          const { data } = await sb(
            `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&email=eq.${encodeURIComponent(email)}&select=id,position_id,status,nominated,statement,created_at&order=created_at.desc`
          );
          mine = data || [];
        } catch (_) {
          const { data } = await sb(
            `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&email=eq.${encodeURIComponent(email)}&select=id,position_id,status,statement,created_at&order=created_at.desc`
          );
          mine = data || [];
        }
        try {
          const { data: noms } = await sb(
            `election_nominations?cycle_id=eq.${encodeURIComponent(cycle.id)}&nominator_email=eq.${encodeURIComponent(email)}&select=position_id,expression_id`
          );
          myNominations = noms || [];
        } catch (_) {
          myNominations = [];
        }
        try {
          const { data: votes } = await sb(
            `election_votes?cycle_id=eq.${encodeURIComponent(cycle.id)}&voter_email=eq.${encodeURIComponent(email)}&select=position_id,expression_id`
          );
          myVotes = votes || [];
        } catch (_) {
          myVotes = [];
        }

        if (phase === 'nomination' || phase === 'voting' || phase === 'closed') {
          try {
            const { data: pool } = await sb(
              `election_expressions?cycle_id=eq.${encodeURIComponent(cycle.id)}&status=neq.withdrawn&select=id,position_id,full_name,statement,nominated,status&order=full_name.asc`
            );
            expressions = (pool || []).map((row) => ({
              id: row.id,
              position_id: row.position_id,
              full_name: row.full_name,
              statement: row.statement || '',
              nominated: Boolean(row.nominated),
            }));
            if (phase === 'voting' || phase === 'closed') {
              expressions = expressions.filter((row) => row.nominated);
            }
          } catch (_) {
            expressions = [];
          }
        }
      }

      let results = null;
      if (phase === 'closed') {
        try {
          results = await countBy('election_votes', cycle.id);
        } catch (_) {
          results = {};
        }
      }

      return json(res, 200, {
        cycle: publicCycle(cycle),
        positions: positions || [],
        mine,
        expressions,
        myNominations,
        myVotes,
        results,
      });
    }

    if (req.method === 'POST') {
      rateLimit(`elections-post:${clientIp(req)}`, 20, 60_000);
      const user = await requireUser(req);
      const body = await readBody(req);
      const action = String(body.action || 'eoi').trim();
      const cycle = await loadCycle();
      const profile = await loadProfile(user);
      if (!profile) {
        return json(res, 403, {
          error: 'No member profile found. Sign in with the email on the membership list.',
        });
      }
      const email = String(profile.email || user.email || '').toLowerCase();

      if (action === 'nominate') {
        if (cycle.is_open === false || cycle.phase !== 'nomination') {
          return json(res, 409, { error: 'Nomination is not open.' });
        }
        const expressionId = String(body.expression_id || '').trim();
        if (!expressionId) return json(res, 400, { error: 'Choose someone who expressed interest.' });
        const { data: expRows } = await sb(
          `election_expressions?id=eq.${encodeURIComponent(expressionId)}&cycle_id=eq.${encodeURIComponent(cycle.id)}&select=id,position_id,status,full_name&limit=1`
        );
        const expression = Array.isArray(expRows) ? expRows[0] : expRows;
        if (!expression || expression.status === 'withdrawn') {
          return json(res, 400, { error: 'That expression of interest is not available.' });
        }
        const { data: posRows } = await sb(
          `election_positions?id=eq.${encodeURIComponent(expression.position_id)}&select=id,title,eligibility&limit=1`
        );
        const position = Array.isArray(posRows) ? posRows[0] : posRows;
        if (!eligibleFor(position, profile)) {
          return json(res, 403, { error: `Only eligible members can nominate for ${position.title}.` });
        }
        const { data: existing } = await sb(
          `election_nominations?cycle_id=eq.${encodeURIComponent(cycle.id)}&position_id=eq.${encodeURIComponent(expression.position_id)}&nominator_email=eq.${encodeURIComponent(email)}&select=id&limit=1`
        );
        const row = Array.isArray(existing) ? existing[0] : existing;
        if (row?.id) {
          await sb(`election_nominations?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ expression_id: expression.id }),
          });
        } else {
          await sb('election_nominations', {
            method: 'POST',
            body: JSON.stringify({
              cycle_id: cycle.id,
              position_id: expression.position_id,
              expression_id: expression.id,
              nominator_email: email,
            }),
          });
        }
        return json(res, 200, {
          ok: true,
          message: `You nominated ${expression.full_name} for ${position.title}.`,
        });
      }

      if (action === 'vote') {
        if (cycle.is_open === false || cycle.phase !== 'voting') {
          return json(res, 409, { error: 'Voting is not open.' });
        }
        const positionId = String(body.position_id || '').trim();
        const choiceIds = Array.isArray(body.expression_ids)
          ? body.expression_ids.map((id) => String(id || '').trim()).filter(Boolean)
          : [String(body.expression_id || '').trim()].filter(Boolean);
        if (!positionId || !choiceIds.length) {
          return json(res, 400, { error: 'Choose a candidate.' });
        }
        const { data: posRows } = await sb(
          `election_positions?id=eq.${encodeURIComponent(positionId)}&select=id,title,seats,eligibility&limit=1`
        );
        const position = Array.isArray(posRows) ? posRows[0] : posRows;
        if (!position) return json(res, 400, { error: 'Unknown position.' });
        if (!eligibleFor(position, profile)) {
          return json(res, 403, { error: `Only eligible members can vote for ${position.title}.` });
        }
        const seats = Math.max(1, Number(position.seats) || 1);
        if (choiceIds.length > seats) {
          return json(res, 400, { error: `You may choose up to ${seats} candidate(s) for ${position.title}.` });
        }
        const uniqueIds = [...new Set(choiceIds)];
        for (const id of uniqueIds) {
          const { data: expRows } = await sb(
            `election_expressions?id=eq.${encodeURIComponent(id)}&cycle_id=eq.${encodeURIComponent(cycle.id)}&position_id=eq.${encodeURIComponent(positionId)}&nominated=eq.true&select=id,status&limit=1`
          );
          const expression = Array.isArray(expRows) ? expRows[0] : expRows;
          if (!expression || expression.status === 'withdrawn') {
            return json(res, 400, { error: 'You can only vote for nominated candidates.' });
          }
        }
        const { data: previous } = await sb(
          `election_votes?cycle_id=eq.${encodeURIComponent(cycle.id)}&position_id=eq.${encodeURIComponent(positionId)}&voter_email=eq.${encodeURIComponent(email)}&select=id`
        );
        for (const vote of previous || []) {
          await sb(`election_votes?id=eq.${encodeURIComponent(vote.id)}`, { method: 'DELETE' });
        }
        for (const id of uniqueIds) {
          await sb('election_votes', {
            method: 'POST',
            body: JSON.stringify({
              cycle_id: cycle.id,
              position_id: positionId,
              expression_id: id,
              voter_email: email,
            }),
          });
        }
        return json(res, 200, {
          ok: true,
          message: `Your vote for ${position.title} has been recorded.`,
        });
      }

      if (cycle.is_open === false || cycle.phase !== 'eoi') {
        return json(res, 409, { error: 'Expressions of interest are closed.' });
      }
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
      const { data: posRows } = await sb(
        `election_positions?id=eq.${encodeURIComponent(positionId)}&cycle_id=eq.${encodeURIComponent(cycle.id)}&select=id,title,board,eligibility,is_open&limit=1`
      );
      const position = Array.isArray(posRows) ? posRows[0] : posRows;
      if (!position || position.is_open === false) {
        return json(res, 400, { error: 'That position is not open.' });
      }
      if (!eligibleFor(position, profile)) {
        const need =
          position.eligibility === 'welfare' ? 'a Social Welfare member' : 'an Association member';
        return json(res, 403, {
          error: `Only ${need} can express interest for ${position.title}.`,
        });
      }
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
        message: `Your interest in ${position.title} has been recorded. Next comes nomination, then voting.`,
      });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || 'Could not save your interest.' });
  }
};

