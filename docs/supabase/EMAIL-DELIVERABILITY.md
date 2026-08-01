# Stop Auth emails landing in spam

Inbox placement is won by **authenticated sending + a real From address + clean volume**, not by website CSS.  
Forgot-password on the live site already goes through **Resend API**. Invites now do the same (no more Supabase default “Reset password” template).

---

## Do these today (order matters)

### 1) Cloudflare — strengthen DMARC (still weak live)

Live DNS today:

```text
_dmarc.taunetnelel.org  TXT  v=DMARC1; p=none;
```

**Edit** that TXT (DNS only / grey cloud) to:

```text
v=DMARC1; p=none; rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r
```

Keep `p=none` for at least one week while you watch Resend bounces/complaints.  
Do **not** jump to `p=quarantine` until mail looks clean.

### 2) Cloudflare — keep Resend DNS **DNS only** (not proxied)

| Record | Purpose | Must be |
|--------|---------|---------|
| `resend._domainkey` TXT | DKIM | DNS only |
| `send` MX → Amazon SES feedback | Bounce path | DNS only |
| `send` TXT `v=spf1 include:amazonses.com ~all` | Envelope SPF | DNS only |

Apex Outlook MX / SPF stays for `info@` inbox. Do **not** replace Outlook MX with Resend.

### 3) Supabase SMTP From = `members@` (not noreply)

https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/smtp  

| Field | Value |
|--------|--------|
| Sender email | `members@taunetnelel.org` |
| Sender name | `Taunet Nelel` |
| Host | `smtp.resend.com` |
| Port | `465` |
| User | `resend` |
| Password | Resend API key |

`noreply@` is a common spam trigger — remove it everywhere.

### 4) Supabase — replace default Auth templates

https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/templates  

Any leftover Supabase-sent mail (email confirm on Join) still uses these templates.  
Change subjects away from generic “Reset password” / “Confirm your signup” if you can, and include:

- Organisation name **Taunet Nelel**
- `info@taunetnelel.org`
- Victoria, Australia

(Primary Forgot-password + invites already use our branded Resend HTML.)

### 5) Vercel env (Production + Preview)

| Name | Value |
|------|--------|
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM` | `Taunet Nelel <members@taunetnelel.org>` |
| `RESEND_REPLY_TO` | `info@taunetnelel.org` |

Redeploy after changes. Confirm `RESEND_FROM` does **not** contain `noreply@`.

### 6) Resend dashboard

1. Domains → `taunetnelel.org` → **Verified**  
2. Emails → open a recent send → **Deliverability** (SPF/DKIM/DMARC pass?)  
3. If domain shows warnings, fix DNS before more bulk sends  

### 7) Retest (one address only)

1. https://taunetnelel.vercel.app/members/auth.html?tab=signin  
2. Your Gmail → **Forgot password?**  
3. Expect **From:** `Taunet Nelel <members@taunetnelel.org>`  
4. Subject like **Reset your Taunet Nelel member password** (brown button “Choose a new password”)  
5. If it still hits Spam once → **Not spam** + add `members@taunetnelel.org` to Contacts  

That one “Not spam” action trains Gmail for your domain.

### 8) WhatsApp / member notice (copy-paste)

> Portal emails come from **members@taunetnelel.org** (Taunet Nelel).  
> Please add that address to Contacts. If a message is in Spam, tap **Not spam**.  
> Old website passwords do not work — use the link in the email to set a new password.

---

## Why mail was hitting spam

| Cause | Fix |
|--------|-----|
| `noreply@` From | Use `members@` everywhere |
| Weak DMARC (`p=none` only) | Add `rua` + alignment flags (step 1) |
| Supabase default invite/reset HTML | Invites + Forgot password now go **only** via Resend branded mail |
| Bulk blast (~500) too fast | Slow sends (`--delay 1`+) and pause if spam rate rises |
| Gmail never saw the domain before | Contacts + Not spam + steady low volume |

---

## Sending rules (protect reputation)

- Prefer **Forgot password?** on the site over re-running bulk invite scripts.  
- Invites: `python docs/invite_members.py --limit 20` then wait; default delay is 1s.  
- Do **not** re-invite people who already got mail.  
- Watch Resend for bounces; remove hard bounces from `member_imports`.  
- After DNS cutover to `www.taunetnelel.org`, keep the same From address (domain reputation carries over).

---

## Optional next upgrades

1. **Google Postmaster Tools** — verify `taunetnelel.org` at https://postmaster.google.com (spam rate visibility).  
2. After a clean week, consider DMARC `p=quarantine` (only if SPF/DKIM stay aligned).  
3. Create a real Outlook mailbox or shared mailbox alias for `members@` if you want replies in the inbox (Reply-To already goes to `info@`).

---

## DNS snapshot (checked)

| Record | Status |
|--------|--------|
| Apex MX | Outlook — keep |
| Apex SPF | Outlook + signatures + mailbaby — OK |
| `send` SPF | `include:amazonses.com` — OK for Resend |
| `send` MX | SES feedback — OK |
| DMARC | Weak `p=none` only — **update step 1** |

---

## Honest limit

No app change can force every Gmail into Inbox on day one.  
What *does* move the needle: authenticated domain + `members@` + DMARC reporting + branded Resend content + members marking **Not spam** + not blasting volume.
