# Fix Auth emails landing in spam

Auth mail (invites / password reset) is sent via **Resend** for `taunetnelel.org`.  
Landing in spam is usually **From-address + DMARC + recipient filters**, not the website code.

## Do these now (Cloudflare + Supabase + Vercel)

### 1) Stop using `noreply@` (important)

Resend flags **noreply@** as a common spam trigger.

| Where | Change to |
|--------|-----------|
| Supabase → Auth → SMTP → Sender email | `members@taunetnelel.org` |
| Supabase → Sender name | `Taunet Nelel` |
| Vercel env `RESEND_FROM` | `Taunet Nelel <members@taunetnelel.org>` |
| Vercel env `RESEND_REPLY_TO` | `info@taunetnelel.org` |

Redeploy Vercel after changing env vars.

`members@` does not need a real mailbox to *send*; replies go to `info@` via Reply-To.

### 2) Strengthen DMARC (Cloudflare DNS)

Current record is only:

```text
v=DMARC1; p=none;
```

Edit `_dmarc` TXT (DNS only / grey cloud) to:

```text
v=DMARC1; p=none; rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r
```

Keep `p=none` for now (monitor). Do **not** jump to `p=quarantine` until Resend looks clean for a week.

### 3) Confirm Resend domain = Verified

Resend → Domains → `taunetnelel.org`:

- DKIM: Verified (`resend._domainkey`)
- SPF on `send` subdomain: present (`include:amazonses.com`)
- All Resend DNS rows: **DNS only** (not proxied)

Your apex SPF for Outlook can stay as-is. Resend sends via the `send` subdomain SPF — do not break Outlook MX.

### 4) Retest with Forgot password (not invite script)

1. https://taunetnelel.vercel.app/members/auth.html?tab=signin  
2. Email → **Forgot password?**  
3. Resend → Emails → open the message → check Deliverability Insights  
4. Gmail: if still in spam once → **Not spam** + move to Inbox (helps future mail)

### 5) Tell members (WhatsApp / notice)

> Portal emails come from **members@taunetnelel.org** (and may appear under Promotions/Spam the first time). Mark **Not spam** and add the address to contacts.

## What we already checked (DNS)

| Record | Status |
|--------|--------|
| Apex MX | Outlook (inbox) — keep |
| `resend._domainkey` | Present |
| `send` MX/SPF | Present (SES / Resend) |
| Apex SPF | Outlook + others — OK to leave |
| DMARC | Weak `p=none` only — **update step 2** |

## Honest limit

No code change can force Gmail into Inbox for every recipient. Authentication + real From + Reply-To + members marking Not spam is what improves placement over the next days.
