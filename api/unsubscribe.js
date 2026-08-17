/**
 * Public unsubscribe for committee email/SMS campaigns.
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
  return String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim() || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) bucket = { count: 0, resetAt: now + 60_000 };
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > 20) {
    const err = new Error('Too many requests. Try again shortly.');
    err.status = 429;
    throw err;
  }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 8000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  try {
    rateLimit(req);
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, { error: 'Server is not configured.' });
    }
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const channel = body.channel === 'sms' ? 'sms' : body.channel === 'all' ? 'all' : 'email';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'A valid email is required.' });
    }
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/crm_unsubscribes`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ email, channel })
    });
    if (!resp.ok && resp.status !== 409) {
      const payload = await resp.json().catch(() => ({}));
      return json(res, 500, { error: payload.message || 'Could not unsubscribe.' });
    }
    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || 'Could not unsubscribe.' });
  }
};
