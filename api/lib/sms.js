/**
 * Optional Twilio SMS for committee campaigns.
 * Vercel env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (+61… or messaging service)
 */

function twilioConfigured() {
  return Boolean(
    String(process.env.TWILIO_ACCOUNT_SID || '').trim() &&
    String(process.env.TWILIO_AUTH_TOKEN || '').trim() &&
    String(process.env.TWILIO_FROM || '').trim()
  );
}

function normaliseAuPhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('61') && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 9) return `+61${digits.slice(1)}`;
  if (digits.length === 9) return `+61${digits}`;
  return digits;
}

async function sendSms({ to, body }) {
  if (!twilioConfigured()) {
    const err = new Error(
      'SMS is not connected yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM in Vercel.'
    );
    err.status = 400;
    throw err;
  }
  const dest = normaliseAuPhone(to);
  if (!dest) {
    const err = new Error('Missing mobile number.');
    err.status = 400;
    throw err;
  }
  const sid = String(process.env.TWILIO_ACCOUNT_SID).trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN).trim();
  const from = String(process.env.TWILIO_FROM).trim();
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({
    To: dest,
    From: from,
    Body: String(body || '').slice(0, 1600)
  });
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    }
  );
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(payload.message || payload.error_message || 'Twilio SMS failed');
    err.status = 502;
    throw err;
  }
  return payload;
}

module.exports = {
  twilioConfigured,
  normaliseAuPhone,
  sendSms
};
