# What to run next (production finish)

## A. Supabase SQL Editor (required)

Open: Supabase → SQL Editor → New query

1. If you already saw `function public.is_site_admin() does not exist`, run **`docs/supabase/FIX-IS-SITE-ADMIN.sql`** first.  
2. Then paste and run **`docs/supabase/APPLY-REMAINING.sql`**.

That applies:

- `011`/`013` — `site_admins` + `is_site_admin()` + enquiry `status`
- `018` — security hardening (membership locks, newsletter RPC, form RLS)
- `019` — Business Hub blog table + admin write policies

## B. Bootstrap committee Auth + seed Business Hub

In PowerShell (use your **service_role** key — never commit it):

```powershell
cd C:\Users\hilla\Desktop\Taunet
$env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
python docs/supabase/bootstrap_production.py --reset-passwords
```

It will print one-time passwords for committee emails.  
Sign in at `/members/auth.html?tab=admin` with email + that password (preferred over bootstrap PIN).

## C. Seed Events + Gallery (Admin UI)

1. Open `/admin/` as committee  
2. Events → **Seed events from site list** (if empty)  
3. Gallery → **Sync site albums to DB** (if empty)

Public pages already prefer Supabase when data exists; static JS remains fallback.

## D. Custom SMTP before inviting ~540 members

Follow **`docs/supabase/CUSTOM-SMTP-SETUP.md`** (Resend + DNS).  
Then:

```powershell
python docs/invite_members.py --limit 5
```

Members can also self-join at `/members/auth.html?tab=join` with their list email.

## E. Vercel env

| Name | Notes |
|------|--------|
| `SUPABASE_URL` | required |
| `SUPABASE_SERVICE_ROLE_KEY` | required |
| `ADMIN_BOOTSTRAP_PIN` | optional emergency PIN (server only) |

Remove reliance on the bootstrap PIN once committee Auth logins work.
