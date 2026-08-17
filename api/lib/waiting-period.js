/**
 * Daily waiting-period reminders: 14 days, 7 days, and the day cover starts.
 * Email always. SMS only when Twilio is connected and the member opted in.
 */
const { notifyWelfareMember } = require('./welfare-notify');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Server missing Supabase credentials.');
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

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const base = String(iso || '').slice(0, 10);
  const d = new Date(`${base}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  const a = new Date(`${String(fromIso).slice(0, 10)}T00:00:00.000Z`);
  const b = new Date(`${String(toIso).slice(0, 10)}T00:00:00.000Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function reminderCopy(daysLeft, endDate) {
  if (daysLeft === 0) {
    return {
      subject: 'Your welfare waiting period ends today',
      title: 'Waiting period complete',
      lead: `Your Social Welfare waiting period ends today (${endDate}). You are now eligible to lodge a bereavement or hardship claim on the Welfare tab, subject to the constitution.`
    };
  }
  return {
    subject: `Welfare waiting period — ${daysLeft} days left`,
    title: 'Waiting period reminder',
    lead: `Your Social Welfare waiting period ends on ${endDate} (${daysLeft} days). Claims can be lodged after that date, subject to the constitution.`
  };
}

async function smsOptInFor(profileId) {
  const rows = await sb(
    `crm_field_values?profile_id=eq.${encodeURIComponent(profileId)}&field_key=eq.sms_opt_in&select=value_text&limit=1`
  );
  const value = Array.isArray(rows) ? String(rows[0]?.value_text || '').toLowerCase() : '';
  return value === 'true' || value === 'yes' || value === '1';
}

async function alreadySent(profileId, reminderKey) {
  const rows = await sb(
    `welfare_reminder_log?profile_id=eq.${encodeURIComponent(profileId)}&reminder_key=eq.${encodeURIComponent(reminderKey)}&select=id&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function markSent(profileId, reminderKey, channel) {
  await sb('welfare_reminder_log', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      profile_id: profileId,
      reminder_key: reminderKey,
      channel
    })
  });
}

async function processWaitingPeriodReminders() {
  const today = todayUtc();
  const values = await sb(
    'crm_field_values?field_key=eq.waiting_period_ends&select=profile_id,value_text&value_text=not.is.null&limit=800'
  );
  const list = Array.isArray(values) ? values : [];
  const sent = [];
  const skipped = [];

  for (const row of list) {
    const endDate = String(row.value_text || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) continue;
    const daysLeft = daysBetween(today, endDate);
    if (![14, 7, 0].includes(daysLeft)) continue;

    const reminderKey = `waiting:${endDate}:${daysLeft}`;
    if (await alreadySent(row.profile_id, reminderKey)) {
      skipped.push({ profile_id: row.profile_id, reason: 'already sent' });
      continue;
    }

    const profiles = await sb(
      `profiles?id=eq.${encodeURIComponent(row.profile_id)}&welfare_member=eq.true&select=id,full_name,email,phone&limit=1`
    );
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile?.email) {
      skipped.push({ profile_id: row.profile_id, reason: 'no welfare profile/email' });
      continue;
    }

    const copy = reminderCopy(daysLeft, endDate);
    const optIn = await smsOptInFor(profile.id);
    try {
      const notify = await notifyWelfareMember({
        toEmail: profile.email,
        toPhone: profile.phone,
        smsOptIn: optIn,
        greeting: profile.full_name || 'Member',
        subject: copy.subject,
        title: copy.title,
        lead: copy.lead,
        ctaLabel: 'Open Welfare tab',
        actionPath: '/members/welfare.html'
      });
      await markSent(profile.id, reminderKey, notify.sms ? 'email+sms' : 'email');
      sent.push({
        profile_id: profile.id,
        email: profile.email,
        days_left: daysLeft,
        sms: notify.sms
      });
    } catch (err) {
      skipped.push({ profile_id: profile.id, reason: err.message || 'send failed' });
    }
  }

  return { ok: true, today, sent_count: sent.length, skipped_count: skipped.length, sent, skipped };
}

module.exports = {
  addDaysIso,
  todayUtc,
  processWaitingPeriodReminders
};
