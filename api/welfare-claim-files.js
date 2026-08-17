/**
 * Upload supporting files for a welfare claim (PDF / photo).
 * Auth: Bearer <supabase access_token>
 * Body: { claim_id, files: [{ name, content_type, data_url }] }
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 3_500_000;
const MAX_FILES = 3;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 6_000_000) {
        reject(Object.assign(new Error('Upload too large'), { status: 413 }));
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

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], 'base64')
  };
}

function safeName(name) {
  return String(name || 'attachment')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'attachment';
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

async function ensureBucket() {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
  const getRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/welfare-claims`, { headers });
  if (getRes.ok) return;
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: 'welfare-claims',
      name: 'welfare-claims',
      public: false,
      file_size_limit: MAX_BYTES,
      allowed_mime_types: [...ALLOWED]
    })
  });
}

async function uploadObject(objectPath, bytes, contentType) {
  await ensureBucket();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/welfare-claims/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: bytes
  });
  if (!response.ok) {
    const text = await response.text();
    const err = new Error(text || 'Could not store the file.');
    err.status = 502;
    throw err;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, { error: 'Server missing Supabase credentials.' });
    }
    const user = await requireUser(req);
    const body = await readBody(req);
    const claimId = String(body.claim_id || '').trim();
    const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
    if (!claimId) return json(res, 400, { error: 'claim_id is required' });
    if (!files.length) return json(res, 200, { ok: true, saved: 0 });

    const claims = await sb(
      `welfare_claims?id=eq.${encodeURIComponent(claimId)}&profile_id=eq.${encodeURIComponent(user.id)}&select=id,profile_id&limit=1`
    );
    const claim = Array.isArray(claims) ? claims[0] : null;
    if (!claim) return json(res, 404, { error: 'Claim not found.' });

    const existing = await sb(
      `welfare_claim_files?claim_id=eq.${encodeURIComponent(claimId)}&select=id`
    );
    const already = Array.isArray(existing) ? existing.length : 0;
    if (already + files.length > MAX_FILES) {
      return json(res, 400, { error: `You can attach up to ${MAX_FILES} files.` });
    }

    const saved = [];
    for (const file of files) {
      const decoded = decodeDataUrl(file.data_url || file.dataUrl);
      if (!decoded) {
        const err = new Error('Each file must be a JPEG, PNG, WebP, or PDF.');
        err.status = 400;
        throw err;
      }
      const contentType = String(file.content_type || decoded.contentType || '').toLowerCase();
      if (!ALLOWED.has(contentType)) {
        const err = new Error('Only JPEG, PNG, WebP, or PDF files are accepted.');
        err.status = 400;
        throw err;
      }
      if (decoded.bytes.length > MAX_BYTES) {
        const err = new Error('Each file must be under 3.5 MB.');
        err.status = 400;
        throw err;
      }
      const fileName = safeName(file.name);
      const objectPath = `${claim.profile_id}/${claimId}/${Date.now()}-${fileName}`;
      await uploadObject(objectPath, decoded.bytes, contentType);
      const rows = await sb('welfare_claim_files', {
        method: 'POST',
        body: JSON.stringify({
          claim_id: claimId,
          profile_id: claim.profile_id,
          storage_path: objectPath,
          file_name: fileName,
          content_type: contentType,
          size_bytes: decoded.bytes.length
        })
      });
      saved.push(Array.isArray(rows) ? rows[0] : rows);
    }
    return json(res, 200, { ok: true, saved: saved.length, files: saved });
  } catch (err) {
    console.error('welfare-claim-files', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not attach the file.'
    });
  }
};
