/**
 * Committee admin data API (PIN-gated).
 * Vercel env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_PIN  (optional; default TaunetAdmin2026)
 *
 * Client sends header: x-admin-pin
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.ADMIN_PIN || 'TaunetAdmin2026';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error(
      'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them in Vercel → Project → Settings → Environment Variables.'
    );
    err.status = 500;
    throw err;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
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
    const err = new Error((data && (data.message || data.error)) || response.statusText || 'Supabase error');
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return { data, headers: response.headers };
}

async function countRows(table, query = '') {
  const q = query ? `&${query}` : '';
  const { headers } = await sb(`${table}?select=id${q}`, {
    prefer: 'count=exact',
    headers: { Range: '0-0' }
  });
  const range = headers.get('content-range') || '';
  const total = range.split('/')[1];
  const n = Number(total);
  return Number.isFinite(n) ? n : 0;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const pin = String(req.headers['x-admin-pin'] || '');
  if (pin !== ADMIN_PIN) {
    return json(res, 401, { error: 'Invalid admin PIN' });
  }

  const url = new URL(req.url, 'http://localhost');
  const resource = url.searchParams.get('resource') || '';

  try {
    if (req.method === 'GET') {
      if (resource === 'overview') {
        const [enquiries, newEnquiries, profiles, imports, newsletter] = await Promise.all([
          countRows('form_submissions'),
          countRows('form_submissions', 'status=eq.new'),
          countRows('profiles'),
          countRows('member_imports'),
          countRows('newsletter_subscribers')
        ]);
        return json(res, 200, { enquiries, newEnquiries, profiles, imports, newsletter });
      }

      if (resource === 'enquiries') {
        const { data } = await sb(
          'form_submissions?select=id,form_type,name,email,phone,message,metadata,status,admin_notes,created_at&order=created_at.desc&limit=200'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'members') {
        const { data } = await sb(
          'profiles?select=id,full_name,email,phone,plan,association_member,welfare_member,member_number,created_at&order=created_at.desc&limit=200'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'imports') {
        const [{ data: rows }, statsRes] = await Promise.all([
          sb(
            'member_imports?select=member_number,full_name,email,plan,membership_label,status,association_member,welfare_member&order=member_number.asc&limit=100'
          ),
          sb('member_import_stats?select=*').catch(() => ({ data: null }))
        ]);
        const stats = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
        return json(res, 200, { rows: rows || [], stats: stats || null });
      }

      if (resource === 'events') {
        const { data } = await sb(
          'events?select=id,title,location,start_at,is_published,registration_open,featured&limit=100'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'sponsors') {
        const { data } = await sb(
          'sponsors?select=id,name,tier,website,is_published,sort_order&limit=100'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'gallery') {
        const { data } = await sb(
          'gallery_albums?select=id,title,event_date,is_published,preview_limit,group_id&order=event_date.desc.nullslast&limit=100'
        );
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'newsletter') {
        const { data } = await sb(
          'newsletter_subscribers?select=email,list_key,subscribed_at&order=subscribed_at.desc&limit=200'
        );
        return json(res, 200, { rows: data || [] });
      }

      return json(res, 400, { error: 'Unknown resource' });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);

      if (resource === 'enquiry-status') {
        const { data } = await sb(`form_submissions?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: body.status })
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'approve-welfare') {
        const id = body.id;
        const { data: rows } = await sb(
          `profiles?id=eq.${encodeURIComponent(id)}&select=id,association_member,plan`
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return json(res, 404, { error: 'Profile not found' });
        const nextPlan = row.association_member !== false ? 'both' : 'welfare';
        const { data } = await sb(`profiles?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            welfare_member: true,
            association_member: row.association_member !== false,
            plan: nextPlan
          })
        });
        return json(res, 200, { rows: data || [] });
      }

      if (resource === 'gallery-publish') {
        const { data } = await sb(`gallery_albums?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_published: Boolean(body.is_published) })
        });
        return json(res, 200, { rows: data || [] });
      }

      return json(res, 400, { error: 'Unknown PATCH resource' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, err.status || 500, {
      error: err.message || 'Server error',
      details: err.details || null
    });
  }
};
