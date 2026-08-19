/**
 * Public: upload a bank-transfer screenshot for an event invoice,
 * then email the buyer that the transfer is on file.
 *
 * POST { invoice_id, email, file_name?, data_url }
 */
const {
  sb,
  sendTransferLodgedEmail,
} = require('../lib/invoice-service');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 3_500_000;
const rateBuckets = new Map();

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

function rateLimit(key) {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length >= 8) {
    const err = new Error('Too many uploads. Try again later.');
    err.status = 429;
    throw err;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1].toLowerCase().split(';')[0].trim(),
    bytes: Buffer.from(match[2], 'base64'),
  };
}

function safeName(name) {
  return (
    String(name || 'receipt')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'receipt'
  );
}

async function uploadGalleryObject(objectPath, bytes, contentType) {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  const getRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/gallery`, { headers });
  if (!getRes.ok) {
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: 'gallery',
        name: 'gallery',
        public: true,
        file_size_limit: MAX_BYTES,
      }),
    });
  }
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/gallery/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!response.ok) {
    const text = await response.text();
    const err = new Error(text || 'Could not store the screenshot.');
    err.status = 502;
    throw err;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/gallery/${objectPath}`;
}

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
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(res, 500, { error: 'Server missing Supabase credentials.' });
  }

  try {
    const body = await readBody(req);
    const invoiceId = String(body.invoice_id || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    if (!invoiceId || !email) {
      return json(res, 400, { error: 'Invoice and email are required.' });
    }
    rateLimit(`${invoiceId}:${email}`);

    const decoded = decodeDataUrl(body.data_url);
    if (!decoded || !ALLOWED.has(decoded.contentType)) {
      return json(res, 400, { error: 'Please upload a JPEG, PNG, or WebP screenshot.' });
    }
    if (decoded.bytes.length > MAX_BYTES) {
      return json(res, 400, { error: 'Screenshot must be under about 3.5 MB.' });
    }

    const rows = await sb(
      `invoices?id=eq.${encodeURIComponent(invoiceId)}&select=*&limit=1`
    );
    const invoice = Array.isArray(rows) ? rows[0] : rows;
    if (!invoice) return json(res, 404, { error: 'Booking not found.' });
    if (String(invoice.email || '').toLowerCase() !== email) {
      return json(res, 403, { error: 'Email does not match this booking.' });
    }
    if (invoice.kind !== 'event') {
      return json(res, 400, { error: 'This upload is only for event bookings.' });
    }
    if (invoice.status === 'void') {
      return json(res, 400, { error: 'This booking is no longer active.' });
    }

    const ext = decoded.contentType.includes('png')
      ? 'png'
      : decoded.contentType.includes('webp')
        ? 'webp'
        : decoded.contentType.includes('gif')
          ? 'gif'
          : 'jpg';
    const objectPath = `invoice-proofs/${invoice.id}/${Date.now()}-${safeName(body.file_name)}.${ext}`;
    const proofUrl = await uploadGalleryObject(objectPath, decoded.bytes, decoded.contentType);
    const uploadedAt = new Date().toISOString();
    const nextMeta = {
      ...(invoice.meta && typeof invoice.meta === 'object' ? invoice.meta : {}),
      proof_url: proofUrl,
      proof_path: objectPath,
      proof_file_name: safeName(body.file_name),
      proof_uploaded_at: uploadedAt,
    };

    const updated = await sb(`invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
      method: 'PATCH',
      body: { meta: nextMeta, updated_at: uploadedAt },
    });
    const saved = Array.isArray(updated) ? updated[0] : updated || { ...invoice, meta: nextMeta };

    let emailed = false;
    let emailError = null;
    try {
      await sendTransferLodgedEmail(saved);
      emailed = true;
      const stamped = {
        ...nextMeta,
        transfer_lodged_email_at: new Date().toISOString(),
      };
      await sb(`invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
        method: 'PATCH',
        body: { meta: stamped },
      });
    } catch (mailErr) {
      emailError = mailErr.message || 'Could not send confirmation email.';
    }

    return json(res, 200, {
      ok: true,
      emailed,
      email_error: emailError,
      message: emailed
        ? 'Screenshot received. Check your email — we have confirmed your transfer is on file.'
        : 'Screenshot saved, but the confirmation email could not be sent. Contact info@taunetnelel.org.',
    });
  } catch (err) {
    console.error('pay/event-proof', err);
    return json(res, err.status || 500, {
      error: err.message || 'Could not upload the screenshot.',
    });
  }
};
