/**
 * Signed-in Social Welfare team inbox (member side).
 * Auth: Bearer <supabase access_token>
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req, max = 20_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > max) {
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

async function sb(path, options = {}) {
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

async function requireUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const err = new Error('Sign in required.');
    err.status = 401;
    throw err;
  }
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` }
  });
  const user = await resp.json().catch(() => ({}));
  if (!resp.ok || !user?.id) {
    const err = new Error('Session expired. Sign in again.');
    err.status = 401;
    throw err;
  }
  return user;
}

async function loadProfile(userId) {
  const rows = await sb(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,full_name,email,phone,welfare_member&limit=1`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function loadThread(profileId) {
  const rows = await sb(
    `welfare_inbox_threads?profile_id=eq.${encodeURIComponent(profileId)}&select=*&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function loadMessages(threadId) {
  const rows = await sb(
    `welfare_inbox_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=id,sender,body,created_at&order=created_at.asc&limit=200`
  );
  return Array.isArray(rows) ? rows : [];
}

function publicPayload(thread, messages) {
  return {
    thread: thread
      ? {
          id: thread.id,
          status: thread.status,
          unread: Boolean(thread.unread_for_member)
        }
      : null,
    messages: (messages || []).map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.created_at
    }))
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end();
    return;
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, { error: 'Server missing Supabase credentials.' });
    }
    const user = await requireUser(req);
    const profile = await loadProfile(user.id);
    if (!profile?.welfare_member) {
      return json(res, 403, { error: 'Welfare membership is required for this inbox.' });
    }

    if (req.method === 'GET') {
      const thread = await loadThread(profile.id);
      if (!thread) return json(res, 200, publicPayload(null, []));
      if (thread.unread_for_member) {
        await sb(`welfare_inbox_threads?id=eq.${encodeURIComponent(thread.id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ unread_for_member: false })
        });
        thread.unread_for_member = false;
      }
      const messages = await loadMessages(thread.id);
      return json(res, 200, publicPayload(thread, messages));
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    const body = await readBody(req);
    const text = String(body.body || body.message || '').trim();
    if (text.length < 2 || text.length > 2000) {
      return json(res, 400, { error: 'Enter a message (2–2000 characters).' });
    }

    let thread = await loadThread(profile.id);
    const now = new Date().toISOString();
    if (!thread) {
      const created = await sb('welfare_inbox_threads', {
        method: 'POST',
        body: JSON.stringify({
          profile_id: profile.id,
          member_name: profile.full_name || null,
          member_email: profile.email || user.email || null,
          status: 'open',
          unread_for_admin: true,
          unread_for_member: false,
          last_message_at: now
        })
      });
      thread = Array.isArray(created) ? created[0] : created;
    } else {
      await sb(`welfare_inbox_threads?id=eq.${encodeURIComponent(thread.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({
          status: 'open',
          unread_for_admin: true,
          last_message_at: now,
          member_name: profile.full_name || thread.member_name,
          member_email: profile.email || thread.member_email
        })
      });
      thread.status = 'open';
    }

    await sb('welfare_inbox_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        thread_id: thread.id,
        sender: 'member',
        body: text
      })
    });
    const messages = await loadMessages(thread.id);
    return json(res, 200, publicPayload(thread, messages));
  } catch (err) {
    console.error('welfare-inbox', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not send the welfare message.'
    });
  }
};
