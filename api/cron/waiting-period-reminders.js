/**
 * Daily cron: Social Welfare waiting-period reminders (14 days, 7 days, day 0).
 * Secure with CRON_SECRET or Vercel Cron header (same as invoice-reminders).
 */
const { processWaitingPeriodReminders } = require('../lib/waiting-period');

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
  if (req.headers['x-vercel-cron'] === '1') return true;
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
    const results = await processWaitingPeriodReminders();
    return json(res, 200, results);
  } catch (err) {
    console.error('cron/waiting-period-reminders', err);
    return json(res, 500, { error: err.message || 'Waiting-period reminder job failed' });
  }
};
