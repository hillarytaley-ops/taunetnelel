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
