# Stop Auth emails landing in spam — do this now

Inbox placement needs **authenticated DNS + branded Resend + member training**.  
Code alone cannot force every Gmail into Inbox on day one.

---

## Do this today (order matters)

### 1) Cloudflare — strengthen DMARC (still the #1 gap)

Live DNS often shows only:

```text
_dmarc.taunetnelel.org  TXT  v=DMARC1; p=none;
```

**Edit** that TXT (DNS only / grey cloud) on the **live** zone (the one that already has Outlook MX + Resend DKIM) to:

```text
v=DMARC1; p=none; rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r
```

Keep `p=none` for at least one week while you watch Resend bounces/complaints.  
Do **not** jump to `p=quarantine` until mail looks clean.

Verify:

```powershell
cd C:\Users\hilla\Desktop\Taunet
python docs/supabase/check_email_dns.py
```

Expect `[OK]: rua reporting present` under DMARC.

### 2) Cloudflare — keep Resend DNS **DNS only** (not proxied)

| Record | Purpose | Must be |
|--------|---------|---------|
| `resend._domainkey` TXT | DKIM | DNS only |
| `send` MX → Amazon SES feedback | Bounce path | DNS only |
| `send` TXT `v=spf1 include:amazonses.com ~all` | Envelope SPF | DNS only |

Apex Outlook MX / SPF stays for `info@` inbox. Do **not** replace Outlook MX with Resend.

### 3) Resend dashboard

1. Domains → `taunetnelel.org` → **Verified**  
2. Emails → open a recent send → **Deliverability** (SPF/DKIM/DMARC pass?)  
3. Fix any domain warnings before more bulk sends  

### 4) Supabase SMTP From = `members@` (not noreply)

https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/smtp  

| Field | Value |
|--------|--------|
| Sender email | `members@taunetnelel.org` |
| Sender name | `Taunet Nelel` |
| Host | `smtp.resend.com` |
| Port | `465` |
| User | `resend` |
| Password | Resend API key |

### 5) Supabase — stub Confirm signup template

Join now also sends a **branded** confirm from Resend (`/api/auth/send-confirm-email`).  
To avoid a second spammy Supabase email:

https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/templates  

**Confirm signup** subject/body → short stub only, e.g.:

- Subject: `Taunet Nelel — check your inbox`
- Body: `Please open the confirmation email from members@taunetnelel.org (check Spam and mark Not spam).`

Forgot-password + invites already bypass Supabase mailer (Resend only).

### 6) Vercel env (Production + Preview)

| Name | Value |
|------|--------|
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM` | `Taunet Nelel <members@taunetnelel.org>` |
| `RESEND_REPLY_TO` | `info@taunetnelel.org` |
| `PUBLIC_SITE_URL` | `https://taunetnelel.vercel.app` (until `.org` cutover) |

Redeploy after changes. Confirm `RESEND_FROM` does **not** contain `noreply@`.

### 7) Retest (one address only)

1. https://taunetnelel.vercel.app/members/auth.html?tab=signin  
2. Your Gmail → **Forgot password?**  
3. Expect **From:** `Taunet Nelel <members@taunetnelel.org>`  
4. If it still hits Spam once → **Not spam** + add `members@taunetnelel.org` to Contacts  

That one “Not spam” action trains Gmail for your domain.

### 8) WhatsApp / member notice

Share `docs/TAUNET-NELEL-EMAIL-INBOX-NOTICE.pdf` (or copy-paste):

> Portal emails come from **members@taunetnelel.org** (Taunet Nelel).  
> Please add that address to Contacts. If a message is in Spam, tap **Not spam**.  
> Old website passwords do not work — use the link in the email to set a new password.

---

## Why mail was hitting spam

| Cause | Fix |
|--------|-----|
| Weak DMARC (`p=none` only) | Add `rua` + alignment flags (step 1) |
| Supabase default Join confirm HTML | Branded Resend confirm + stub Auth template |
| `noreply@` From | Use `members@` everywhere |
| Bulk blast too fast | Slow invites (`--limit 20`, delay ≥ 1s) |
| Gmail never trusted the domain | Contacts + Not spam + steady volume |

---

## Sending rules (protect reputation)

- Prefer **Forgot password?** on the site over re-running bulk invite scripts.  
- Invites: `python docs/invite_members.py --limit 20` then wait; default delay is 1s.  
- Do **not** re-invite people who already got mail.  
- Watch Resend for bounces; remove hard bounces from `member_imports`.  
- Do **not** re-run `bootstrap_production.py --reset-passwords` unless you intend to wipe passwords.

---

## Optional next upgrades

1. **Google Postmaster Tools** — verify `taunetnelel.org` at https://postmaster.google.com  
2. After a clean week, consider DMARC `p=quarantine` (only if SPF/DKIM stay aligned).  
3. Create a real Outlook mailbox/alias for `members@` if you want replies in the inbox (Reply-To already goes to `info@`).

---

## Honest limit

No app change can force every mailbox into Inbox.  
What *does* move the needle: DMARC reporting + `members@` + branded Resend + members marking **Not spam** + not blasting volume.
