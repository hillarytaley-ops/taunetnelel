# Finish go-live (SQL → env → UAT → SMTP → domain)

Do these in order. Tick each box before moving on.

Project: `wgecdsdeeirzdvshdfwo`  
Live preview: https://taunetnelel.vercel.app

---

## Step 1 — Finish SQL (Supabase)

Open: https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/sql/new

### 1A — Remaining core schema

1. If you previously saw `is_site_admin() does not exist`, run **`FIX-IS-SITE-ADMIN.sql`** first.
2. Paste and run **`APPLY-REMAINING.sql`**.
3. Expect **Success**.

### 1B — Invoices + payment gate

1. Paste and run **`APPLY-INVOICES.sql`** (this file = migrations 020 + 021 + 022).
2. Confirm in **Table Editor**:
   - `invoices` exists
   - `events` has `fee_cents` and `ticket_prices`
   - `site_admins` exists

### 1C — Auth redirect URLs (now, before domain)

Open Auth URL config and add all URLs from **`GO-LIVE-DNS.md` §1** (Vercel + localhost + future `.org`).

---

## Step 2 — Vercel env vars

Vercel → Project **taunetnelel** → **Settings → Environment Variables**  
Apply to **Production** and **Preview**, then **Redeploy**.

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | Yes | `https://wgecdsdeeirzdvshdfwo.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase → Settings → API → **service_role** (secret) |
| `RESEND_API_KEY` | Yes for mail | Resend dashboard |
| `RESEND_FROM` | Yes for mail | `Taunet Nelel <members@taunetnelel.org>` |
| `RESEND_REPLY_TO` | Yes for mail | `info@taunetnelel.org` |
| `PUBLIC_SITE_URL` | Recommended | `https://taunetnelel.vercel.app` until `.org` cutover |
| `PAYID` | Yes for PayID | Org PayID |
| `BANK_NAME` | Recommended | |
| `BANK_BSB` | Recommended | |
| `BANK_ACCOUNT_NUMBER` | Recommended | |
| `BANK_ACCOUNT_NAME` | Recommended | |
| `CRON_SECRET` | For reminders | Random long string |
| `ADMIN_BOOTSTRAP_PIN` | Optional | Emergency only; remove later |
| `ORG_LEGAL_NAME` | Optional | Default Taunet Nelel Incorporated |
| `ORG_ABN` | Optional | |
| `INVOICE_DUE_DAYS` | Optional | Default 14 |

Template: `docs/supabase/env.example`

---

## Step 3 — Admin + payments UAT

### 3A — Bootstrap committee (PowerShell)

```powershell
cd C:\Users\hilla\Desktop\Taunet
$env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
python docs/supabase/bootstrap_production.py --reset-passwords
```

Sign in: https://taunetnelel.vercel.app/members/auth.html?tab=admin

### 3B — Seed content

1. Open https://taunetnelel.vercel.app/admin/
2. Events → **Seed events from site list** (if empty)
3. Gallery → **Sync site albums to DB** (if empty)

### 3C — Smoke tests (committee)

Use `docs/TAUNET-NELEL-COMMITTEE-UAT-CHECKLIST.pdf` or:

| # | Check |
|---|--------|
| 1 | Admin login works |
| 2 | Member join / sign-in works |
| 3 | Contact form appears in Supabase `form_submissions` |
| 4 | `/pay/basic.html` shows PayID / bank details |
| 5 | Admin → Invoices → Mark paid unlocks Basic membership |
| 6 | Events + Gallery load from Supabase |
| 7 | Password reset email arrives (after SMTP) |

---

## Step 4 — SMTP + members (stop Spam folder)

Follow **`EMAIL-DELIVERABILITY.md`** (DMARC first), then **`CUSTOM-SMTP-SETUP.md`**, then **`MEMBER-ACCESS-NEXT.md`**.

1. Edit live `_dmarc` TXT → include `rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r`
2. Run `python docs/supabase/check_email_dns.py` until DMARC shows `[OK]`
3. Verify `taunetnelel.org` in Resend (DKIM/SPF)
4. Enable Custom SMTP in Supabase Auth (`members@`, never `noreply@`)
5. Stub Supabase **Confirm signup** template (Join confirm is branded Resend)
6. Raise Auth email rate limit
7. Share `docs/TAUNET-NELEL-EMAIL-INBOX-NOTICE.pdf` / WhatsApp copy with members
8. Test Forgot password + 5 invites: `python docs/invite_members.py --limit 5`
9. Only then bulk invite in batches of ~20–50 with delay ≥ 1s

---

## Step 5 — Point the domain

Follow **`GO-LIVE-DNS.md`** exactly:

1. Add `www.taunetnelel.org` + `taunetnelel.org` in Vercel Domains
2. Update Cloudflare DNS to Vercel (do **not** touch mail/Resend records)
3. Wait until Vercel shows domains **Valid**
4. Change Supabase **Site URL** to `https://www.taunetnelel.org`
5. Smoke-test home, login, form, one payment
6. Keep WordPress DNS notes for rollback ~30 days

---

## Done when

- [ ] SQL 1A + 1B succeeded
- [ ] Vercel env set + redeployed
- [ ] Committee can admin + mark invoices paid
- [ ] Custom SMTP verified; test invites work
- [ ] `taunetnelel.org` serves the Vercel site
- [ ] Committee UAT signed off
