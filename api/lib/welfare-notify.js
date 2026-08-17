/**
 * Email a welfare member, and SMS them when Twilio is connected and they opted in.
 */
const { sendMemberMail, brandedShell, PUBLIC_SITE_URL } = require('./member-mail');
const { twilioConfigured, sendSms } = require('./sms');

function portalUrl(path) {
  const suffix = String(path || '/members/welfare.html');
  return `${PUBLIC_SITE_URL}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

async function notifyWelfareMember({
  toEmail,
  toPhone,
  smsOptIn,
  greeting,
  subject,
  title,
  lead,
  ctaLabel,
  actionPath,
  extraText
}) {
  const actionLink = portalUrl(actionPath || '/members/welfare.html');
  const name = String(greeting || 'Member').trim() || 'Member';
  const result = { email: false, sms: false, sms_skipped: null };
  if (toEmail) {
    const parts = brandedShell({
      eyebrow: 'Social Welfare',
      title: title || subject,
      greeting: name,
      lead,
      ctaLabel: ctaLabel || 'Open Welfare tab',
      actionLink,
      extraText: extraText || ''
    });
    await sendMemberMail({
      to: toEmail,
      subject: subject || title,
      text: parts.text,
      html: parts.html
    });
    result.email = true;
  }
  if (!twilioConfigured()) {
    result.sms_skipped = 'Twilio is not connected yet.';
    return result;
  }
  if (!smsOptIn) {
    result.sms_skipped = 'Member has not opted in to SMS.';
    return result;
  }
  if (!toPhone) {
    result.sms_skipped = 'No mobile number on the profile.';
    return result;
  }
  const smsBody = `${lead} ${actionLink}`.slice(0, 450);
  await sendSms({ to: toPhone, body: smsBody });
  result.sms = true;
  return result;
}

module.exports = {
  notifyWelfareMember,
  portalUrl
};
