# Committee admin dashboard

## URL

**Admin portal (PIN only):** https://taunetnelel.vercel.app/admin/

Separate from members login (`/members/login.html`).

Default PIN: `TaunetAdmin2026`  
Change in `assets/js/supabase-config.js` → `adminPin` **and** match Vercel `ADMIN_PIN`.

## How it works

1. Enter the **admin PIN** → portal opens.
2. Live enquiries / members / imports load through `/api/admin/data` using that PIN (no members email/password).

## Vercel env (required for live data)

In Vercel → Project → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://wgecdsdeeirzdvshdfwo.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (secret) |
| `ADMIN_PIN` | same as site PIN, e.g. `TaunetAdmin2026` |

Redeploy after saving env vars.

**Never** put `service_role` in frontend JS.

## Sections

| Tab | Notes |
|-----|--------|
| Business Hub | PIN; JSON export workflow |
| Enquiries / Members / Imports / Newsletter | PIN + API + Supabase data |
| Events / Sponsors / Gallery (DB) | May be empty if those tables were never filled (public site still uses static files) |
