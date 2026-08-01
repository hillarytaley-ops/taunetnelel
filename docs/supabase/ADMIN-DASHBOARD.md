# Committee admin dashboard

## URL

**Admin portal:** https://taunetnelel.vercel.app/admin/

Sign in at `/members/auth.html?tab=admin` with a Supabase Auth account whose email is listed in `public.site_admins` (migration 011).

The old shared PIN is removed. Do not put admin secrets in frontend JS.

## How it works

1. Committee member signs in with email/password (Supabase Auth).
2. Client checks `is_site_admin()`; server API verifies the Bearer access token and `site_admins` before using the service role.
3. Live data loads through `/api/admin/data`.

## Vercel env (required for live data)

In Vercel → Project → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (secret) |

You can remove any old `ADMIN_PIN` variable. Redeploy after changing env vars.

**Never** put `service_role` in frontend JS.

## Supabase SQL

Run `supabase/migrations/018_security_hardening.sql` after this deploy (membership locks, form/newsletter RLS, member-only announcements).

## Sections

| Tab | Notes |
|-----|--------|
| Business Hub | Local JSON export workflow |
| Enquiries / Members / Imports / Newsletter | Auth + API + Supabase data |
| Events / Sponsors / Gallery | DB-backed; public gallery may also use static files |
