# Custom SMTP setup (Supabase Auth email)

**Why:** Supabase’s built-in mailer is capped (~2 emails/hour) and is not for production.  
Custom SMTP is required before **bulk member invites** or **mass email confirmations**.

**Recommended provider:** [Resend](https://resend.com) (simple, built for Auth/transactional mail).  
**Alternative:** Brevo (if you want one vendor for Auth SMTP + later newsletters).

Project: `wgecdsdeeirzdvshdfwo`  
Suggested sender: `members@taunetnelel.org` (**not** `noreply@` — noreply often lands in spam)  
Sender name: `Taunet Nelel`  
Deliverability guide: **`EMAIL-DELIVERABILITY.md`**

---

## Checklist (about 30–60 minutes)

### 1) Create Resend account

1. Sign up at https://resend.com  
2. Open **Domains** → **Add Domain** → enter `taunetnelel.org`  
   - Prefer verifying the **root domain** (or a subdomain like `send.taunetnelel.org` if your DNS host advises it).  
3. Resend shows DNS records (DKIM, SPF, and sometimes MX for a `send` subdomain).  
4. Add those records at whoever manages DNS for `taunetnelel.org` (same place WordPress DNS lives today).  
5. Wait until Resend shows the domain as **Verified** (often 5–30 minutes; can take longer).

**DNS tip:** If the domain already receives mail at `info@taunetnelel.org`, do **not** replace the existing inbox MX records. Use Resend’s records as shown (often a `send` subdomain + SPF/DKIM TXT). Merge SPF into one TXT if you already have SPF — do not create two SPF TXT records.

### 2) Create a Resend API key

1. Resend → **API Keys** → **Create API Key**  
2. Permission: **Sending access**  
3. Copy the key (`re_...`) — treat it like a password.

### 3) Turn on custom SMTP in Supabase

Open:  
https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/smtp  

1. Enable **Custom SMTP**  
2. Enter:

| Field | Value |
|-------|--------|
| Sender email | `members@taunetnelel.org` (must be on the verified domain; avoid noreply@) |
| Sender name | `Taunet Nelel` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (`re_...`) |

3. Save.

### 4) Raise Auth rate limits

After custom SMTP is saved, Supabase often starts at **30 emails/hour**.

1. Open https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/rate-limits  
2. Raise **Email** hourly limit to something practical for invites, e.g. **200–500/hour** (start at 200).  
3. Save.

### 5) Confirm Auth URLs

Authentication → **URL Configuration**:

- Site URL: `https://taunetnelel.vercel.app`  
- Redirect URLs include:
  - `https://taunetnelel.vercel.app/members/auth.html`
  - `https://taunetnelel.vercel.app/members/auth.html?tab=signin`
  - `https://taunetnelel.vercel.app/members/auth.html?tab=join`

(After DNS cutover, also add `https://www.taunetnelel.org/...` equivalents.)

### 6) Send a test invite (1 person)

```powershell
cd C:\Users\hilla\Desktop\Taunet
$env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
python docs/invite_members.py --limit 1
```

Or: create a throwaway Auth user / password reset for a committee email and confirm delivery + From address.

**Pass when:** email arrives from `Taunet Nelel <members@taunetnelel.org>`, link opens the members auth page, password can be set.

### 7) Only then — bulk invites

```powershell
python docs/invite_members.py --limit 50
```

Repeat carefully. Watch Resend dashboard for bounces.

---

## Brevo alternative (short)

If using Brevo instead of Resend:

1. Verify `taunetnelel.org` in Brevo  
2. Brevo → SMTP & API → SMTP  
3. Supabase custom SMTP typically:
   - Host: `smtp-relay.brevo.com`
   - Port: `587`
   - Username: your Brevo SMTP login
   - Password: Brevo SMTP key  
4. Same rate-limit + test steps as above.

---

## What this unlocks

- Bulk `invite_members.py` runs  
- Reliable signup confirmations and password resets  
- Safe path to member access at scale before DNS cutover  

## What this does **not** do

- Does not replace a marketing newsletter tool (Admin → Newsletter → Export CSV still feeds Brevo/MailerLite/Resend Audiences)  
- Does not cut over `www.taunetnelel.org` DNS  

---

## Status

- [ ] Resend (or Brevo) account created  
- [ ] Domain verified in provider  
- [ ] Supabase custom SMTP enabled + saved  
- [ ] Rate limits raised  
- [ ] 1 test invite delivered  
- [ ] Ready for batch invites (`--limit 50`)  
