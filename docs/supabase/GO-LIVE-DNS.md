# Go-live: Auth URLs, DMARC, DNS cutover

Do these in order. Keep WordPress reachable until UAT passes.

---

## 1) Supabase Auth URL configuration (do now — before DNS)

Open:  
https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/url-configuration

### Site URL
During transition you can keep:
```text
https://taunetnelel.vercel.app
```
On cutover day, change Site URL to:
```text
https://www.taunetnelel.org
```
(or `https://taunetnelel.org` if that is your canonical host)

### Redirect URLs — add **all** of these (keep Vercel during transition)

```text
https://taunetnelel.vercel.app/members/auth.html
https://taunetnelel.vercel.app/members/auth.html?tab=signin
https://taunetnelel.vercel.app/members/auth.html?tab=join
https://taunetnelel.vercel.app/members/dashboard.html
https://www.taunetnelel.org/members/auth.html
https://www.taunetnelel.org/members/auth.html?tab=signin
https://www.taunetnelel.org/members/auth.html?tab=join
https://www.taunetnelel.org/members/dashboard.html
https://taunetnelel.org/members/auth.html
https://taunetnelel.org/members/auth.html?tab=signin
https://taunetnelel.org/members/auth.html?tab=join
https://taunetnelel.org/members/dashboard.html
http://localhost:8080/members/**
```

Wildcards (if your Supabase project allows):
```text
https://taunetnelel.vercel.app/**
https://www.taunetnelel.org/**
https://taunetnelel.org/**
```

Save.

**Why:** Invite / reset / confirm links must land on a listed URL. Same Auth users work on Vercel and `.org`.

---

## 2) Committee UAT (before DNS)

Use the checklist PDF:  
`docs/TAUNET-NELEL-COMMITTEE-UAT-CHECKLIST.pdf`

Or walk through:

| # | Check | Pass? |
|---|--------|-------|
| 1 | Committee login at `/members/auth.html?tab=admin` | |
| 2 | Member sign-in + dashboard loads | |
| 3 | Events page phases look correct | |
| 4 | Gallery albums open; photos load | |
| 5 | Business Hub public page shows published cards | |
| 6 | Admin → Publish Business Hub works | |
| 7 | Welfare / membership pages + forms submit | |
| 8 | Contact / newsletter submit | |
| 9 | Password reset email arrives (check spam) | |
| 10 | Mobile phone layout OK on home + members | |

Do not cut DNS until committee signs off.

---

## 3) DMARC (deliverability)

You already have a basic DMARC record:
```text
v=DMARC1; p=none;
```

That is safe (monitoring only) but too thin for good inbox placement. In **Cloudflare → DNS → Records** edit `_dmarc` TXT to:

```text
v=DMARC1; p=none; rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r
```

Also set Supabase SMTP + Vercel `RESEND_FROM` to `members@taunetnelel.org` (see `EMAIL-DELIVERABILITY.md`).

| Field | Value |
|--------|--------|
| Type | TXT |
| Name | `_dmarc` |
| Content | (line above) |
| Proxy | DNS only |

Keep `p=none` until you are happy with Resend delivery for a few weeks. Later you may tighten to `p=quarantine`.

Also confirm in **Resend → Domains → taunetnelel.org** that DKIM stays **Verified**.

---

## 4) Add domain on Vercel (before changing Cloudflare)

1. Vercel → Project **taunetnelel** → **Settings → Domains**
2. Add:
   - `www.taunetnelel.org`
   - `taunetnelel.org` (apex)
3. Vercel will show the exact DNS records it wants (usually):
   - `www` → CNAME to `cname.vercel-dns.com` (or project-specific target)
   - apex → A `76.76.21.21` **or** CNAME flattening per Vercel’s screen  
4. Do **not** remove WordPress DNS until Vercel shows the domains as **Valid**.

---

## 5) DNS cutover (Cloudflare) — cutover day

Current state (as of last check):

- `www.taunetnelel.org` → WordPress (`*.wpdns.site`)
- Apex on Cloudflare proxy IPs

### Recommended cutover

1. Snapshot / note current Cloudflare DNS records (screenshot).
2. In Vercel Domains, confirm both hosts are added.
3. In Cloudflare DNS for `taunetnelel.org`:

**www**
- Change CNAME from WordPress target → Vercel CNAME (from Vercel Domains UI)
- Proxy: can be **DNS only** (grey) first for easier debugging, or Proxied (orange) if you prefer Cloudflare CDN in front

**apex (`@` / taunetnelel.org)**
- Set A/AAAA or CNAME exactly as Vercel instructs for the apex
- Keep existing **mail-related** records untouched:
  - Outlook / SPF TXT on root
  - MX for inbox
  - `resend._domainkey`
  - `send` MX/TXT for Resend
  - `_dmarc`

4. Wait for Vercel domain status = **Valid** (often minutes; can be up to 24–48h).
5. Change Supabase **Site URL** to `https://www.taunetnelel.org`.
6. Smoke-test: home, members sign-in, one admin action, one form.

### Rollback (if needed)

Restore the previous `www` CNAME to WordPress (`*.wpdns.site`) from your screenshot. Keep Vercel project running.

### Keep WordPress 2–4 weeks

Do not cancel hosting until:

- Members are signing in on the new site
- Committee is comfortable
- No critical content still only on WordPress

---

## 6) After cutover

- [ ] Update any printed/QR links to `.org`
- [ ] WhatsApp / social: “Members portal is live at www.taunetnelel.org”
- [ ] Monitor Resend + Supabase Auth logs for a few days
- [ ] Schedule BuddyBoss / ClientClub retirement when adoption is solid
