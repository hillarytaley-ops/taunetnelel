/**
 * Daily cron: email scheduled Welfare Plus installments near due + payment reminders.
 *
 * Secure with CRON_SECRET (Authorization: Bearer …) or Vercel Cron header.
 * vercel.json: schedule ~ daily 22:00 UTC (~ morning Melbourne).
 */
const { processInvoiceReminders } = require('../lib/invoice-service');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const secret = (process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  if (secret && auth === `Bearer ${secret}`) return true;
  // Vercel Cron sends this header on Hobby+/Pro when configured
  if (req.headers['x-vercel-cron'] === '1') return true;
  // Allow when no secret set (dev) — still refuse on production without auth
  if (!secret && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (!authorized(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  try {
    const results = await processInvoiceReminders();
    return json(res, 200, { ok: true, ...results });
  } catch (err) {
    console.error('cron/invoice-reminders', err);
    return json(res, 500, { error: err.message || 'Reminder job failed' });
  }
};
