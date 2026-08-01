# Committee admin dashboard

## URL

**Admin portal:** https://taunetnelel.vercel.app/admin/

Sign in at `/members/auth.html?tab=admin`.

## First-time access (no Auth admin yet)

1. In Vercel → Environment Variables, set **`ADMIN_BOOTSTRAP_PIN`** (or keep existing **`ADMIN_PIN`**) to a long random secret. Redeploy.
2. Open Committee tab → enter that PIN under **Emergency bootstrap PIN**.
3. Then create lasting admin accounts:
   - Open **Join** and register with an email listed in `public.site_admins` (migration 011), **or**
   - In Supabase → Authentication → Users → Add user, then ensure the email is in `site_admins`.

The PIN is checked only on the server. It is **not** stored in frontend JS.

## Ongoing access (preferred)

1. Sign in with email/password for an account in `site_admins`.
2. API verifies the Bearer token + `site_admins` before using the service role.

## Vercel env

| Name | Value |
|------|--------|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret |
| `ADMIN_BOOTSTRAP_PIN` | optional emergency PIN (server only) |

**Never** put `service_role` or the bootstrap PIN in frontend JS.

## Supabase SQL

- `011_fix_site_admin_recognition.sql` — `site_admins` + `is_site_admin()`
- `018_security_hardening.sql` — membership / form / newsletter locks
