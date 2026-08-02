# Member Auth setup (Supabase)

## 1. SQL (already applied for production)

Ensure these were run in the SQL Editor:

- `008_profiles_membership_auth.sql` (and later membership migrations)
- `docs/supabase/APPLY-REMAINING.sql` (013 + 018 + 019 + `is_site_admin`)

## 2. Auth URL configuration (required for go-live)

**Authentication → URL Configuration**  
https://supabase.com/dashboard/project/wgecdsdeeirzdvshdfwo/auth/url-configuration

Full checklist (Vercel + `.org` + DMARC + DNS):  
**`docs/supabase/GO-LIVE-DNS.md`**

### Site URL
- Now: `https://taunetnelel.vercel.app`
- After DNS cutover: `https://www.taunetnelel.org`

### Redirect URLs (add all)

Prefer wildcards so password-reset links with `?tab=signin&type=recovery` are allowed:

```text
https://taunetnelel.vercel.app/members/**
https://www.taunetnelel.org/members/**
https://taunetnelel.org/members/**
http://localhost:8080/members/**
```

If the dashboard does not accept `**`, add these explicitly (including recovery):

```text
https://taunetnelel.vercel.app/members/auth.html
https://taunetnelel.vercel.app/members/auth.html?tab=signin
https://taunetnelel.vercel.app/members/auth.html?tab=signin&type=recovery
https://taunetnelel.vercel.app/members/auth.html?tab=join
https://taunetnelel.vercel.app/members/dashboard.html
https://www.taunetnelel.org/members/auth.html
https://www.taunetnelel.org/members/auth.html?tab=signin
https://www.taunetnelel.org/members/auth.html?tab=signin&type=recovery
https://www.taunetnelel.org/members/auth.html?tab=join
https://www.taunetnelel.org/members/dashboard.html
https://taunetnelel.org/members/auth.html
https://taunetnelel.org/members/auth.html?tab=signin
https://taunetnelel.org/members/auth.html?tab=signin&type=recovery
https://taunetnelel.org/members/auth.html?tab=join
https://taunetnelel.org/members/dashboard.html
http://localhost:8080/members/**
```

### Forgot password (ordinary members)

1. Member clicks **Forgot password?** on Sign in (email filled in).
2. Site API `/api/auth/request-password-reset` emails a real reset link via **Resend**.
3. Member opens the link → **Choose a new password** → dashboard.

**If the link opens the home page instead of the reset form:** Supabase rejected the
`redirect_to` and fell back to Site URL. Add these under Authentication → URL Configuration
→ Redirect URLs (exact match or wildcard):

```text
https://taunetnelel.vercel.app/members/**
https://taunetnelel.vercel.app/members/auth.html
https://taunetnelel.vercel.app/members/auth.html?tab=signin&type=recovery
```

The homepage also runs `assets/js/auth-callback-bounce.js` to forward recovery tokens
to `/members/auth.html` if that fallback still happens.

### Make reset links last longer (important)

Password / invite links cannot stay valid forever in Supabase Auth, but we can make them
last much longer and survive email scanners:

1. **Authentication → Sign In / Providers → Email → Email OTP expiration**  
   Set to **86400** seconds (24 hours) — the maximum recommended in the dashboard.  
   This also applies to recovery and invite links.
2. Our emails now use a **portal `token_hash` link** (not Supabase `/auth/v1/verify`).  
   Members open the page and tap **Continue** — that is when the token is used.  
   Prefetch/scanners that only GET the URL will not burn the link.

True “valid until they set a password with no time limit” is not supported by Supabase;
24 hours + Continue-click is the practical production setup.

Vercel must have `RESEND_API_KEY` (see `ADMIN-DASHBOARD.md`). Check Resend → Emails if a test reset does not arrive.

Primary members entry page is **`members/auth.html`** (not the older `login.html` / `register.html` paths).

### Email provider

- Enable Email
- Production: **Confirm email** ON (SMTP via Resend already configured)
- Custom SMTP: Authentication → Emails (Resend)

## 3. How members get in

### A — Invite (done for imported list)

`python docs/invite_members.py` created Auth users for `pending_invite` rows.

### B — Self-serve

1. `/members/auth.html?tab=join` with the **same email** as on the membership list  
2. Set a password  
3. Sign in at `/members/auth.html?tab=signin`

## 4. Committee admin

`/members/auth.html?tab=admin` — email/password for an address in `public.site_admins`.

## 5. Same login after DNS cutover

Yes. Auth accounts are in Supabase. Once `.org` redirect URLs are listed and Site URL is updated, the same email/password works on the live domain.
