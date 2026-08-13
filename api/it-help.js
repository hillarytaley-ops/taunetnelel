/**
 * Public IT Help chat (no login required).
 * Members start/continue a thread; IT replies from Admin.
 */
const crypto = require('crypto');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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
    const err = new Error('Too many messages. Try again in a few minutes.');
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
        reject(Object.assign(new Error('Message too long'), { status: 413 }));
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error('Server missing Supabase credentials.');
    err.status = 500;
    throw err;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation'
    },
    body: options.body
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!response.ok) {
    const err = new Error((data && (data.message || data.error)) || 'Supabase error');
    err.status = response.status;
    throw err;
  }
  return data;
}

function publicThread(thread, messages) {
  return {
    threadId: thread.id,
    guestToken: thread.guest_token,
    email: thread.email,
    fullName: thread.full_name || '',
    status: thread.status,
    messages: (messages || []).map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.created_at
    }))
  };
}

async function loadThread(threadId, guestToken) {
  const id = String(threadId || '').trim();
  const token = String(guestToken || '').trim();
  if (!id || !token) return null;
  const rows = await sb(
    `it_help_threads?id=eq.${encodeURIComponent(id)}&guest_token=eq.${encodeURIComponent(token)}&select=*&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function loadMessages(threadId) {
  const rows = await sb(
    `it_help_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=id,sender,body,created_at&order=created_at.asc&limit=200`
  );
  return Array.isArray(rows) ? rows : [];
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  try {
    if (req.method === 'GET') {
      rateLimit(`get:${clientIp(req)}`, 60, 60_000);
      const url = new URL(req.url, 'http://localhost');
      const thread = await loadThread(
        url.searchParams.get('threadId'),
        url.searchParams.get('guestToken')
      );
      if (!thread) return json(res, 404, { error: 'Chat not found. Start a new message.' });
      const messages = await loadMessages(thread.id);
      return json(res, 200, publicThread(thread, messages));
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    rateLimit(`post:${clientIp(req)}`, 20, 60 * 60 * 1000);
    const body = await readBody(req);
    const text = String(body.body || body.message || '').trim();
    if (text.length < 2 || text.length > 2000) {
      return json(res, 400, { error: 'Enter a message (2–2000 characters).' });
    }

    let thread = await loadThread(body.threadId, body.guestToken);
    if (!thread) {
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const fullName = String(body.fullName || body.name || '').trim().slice(0, 120);
      if (!isValidEmail(email)) {
        return json(res, 400, { error: 'Enter the email on your invite.' });
      }
      if (fullName.length < 2) {
        return json(res, 400, { error: 'Enter your name.' });
      }
      const created = await sb('it_help_threads', {
        method: 'POST',
        body: JSON.stringify({
          guest_token: crypto.randomUUID(),
          email,
          full_name: fullName,
          status: 'open',
          last_message_at: new Date().toISOString()
        })
      });
      thread = Array.isArray(created) ? created[0] : created;
    } else if (thread.status === 'closed') {
      await sb(`it_help_threads?id=eq.${encodeURIComponent(thread.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'open', last_message_at: new Date().toISOString() })
      });
      thread.status = 'open';
    }

    await sb('it_help_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        thread_id: thread.id,
        sender: 'member',
        body: text
      })
    });
    await sb(`it_help_threads?id=eq.${encodeURIComponent(thread.id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ last_message_at: new Date().toISOString(), status: 'open' })
    });

    const messages = await loadMessages(thread.id);
    return json(res, 200, publicThread(thread, messages));
  } catch (err) {
    const status = err.status || 500;
    console.error('it-help', err);
    return json(res, status, {
      error: err.message || 'Could not send IT Help message.'
    });
  }
};
