# Committee admin dashboard

## URL

**Admin portal:** https://taunetnelel.vercel.app/admin/

Sign in at `/members/auth.html?tab=admin`.

## Access

1. Sign in at `/members/auth.html?tab=admin` with email/password for an account in `site_admins`.
2. API verifies the Bearer token + `site_admins` before using the service role.
3. To add an admin: put their email in `public.site_admins`, then create/reset Auth with `docs/supabase/reset_admin_password.py` or bootstrap script.

## Vercel env

| Name | Value |
|------|--------|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret |
| `RESEND_API_KEY` | Resend API key (`re_...`) — required for member **Forgot password** emails |
| `RESEND_FROM` | optional, default `Taunet Nelel <noreply@taunetnelel.org>` |

**Never** put `service_role` in frontend JS. You can remove unused `ADMIN_BOOTSTRAP_PIN` / `ADMIN_PIN` from Vercel.

### Member Forgot password

Ordinary members use **Forgot password?** on `/members/auth.html`.  
That hits `/api/auth/request-password-reset`, which creates a Supabase recovery link and emails it through **Resend** (same domain as invites: `noreply@taunetnelel.org`).

Without `RESEND_API_KEY` on Vercel, the button cannot send mail.

## Supabase SQL

- `011_fix_site_admin_recognition.sql` — `site_admins` + `is_site_admin()`
- `018_security_hardening.sql` — membership / form / newsletter locks
