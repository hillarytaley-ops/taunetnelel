# Member Auth setup (Supabase)

## 1. Run SQL

In Supabase SQL Editor, run:

`supabase/migrations/008_profiles_membership_auth.sql`

This updates `profiles` for association/welfare/`both` and links new Auth users to `member_imports` by email.

## 2. Auth settings (Supabase Dashboard)

**Authentication → URL configuration**

- Site URL (for now): `https://taunetnelel.vercel.app`
- Redirect URLs — add:
  - `https://taunetnelel.vercel.app/members/login.html`
  - `https://taunetnelel.vercel.app/members/dashboard.html`
  - `http://localhost:8080/members/**` (local testing)

After someone clicks **Confirm email address** in the mail:

1. Supabase verifies the email
2. Browser is sent to your site (`dashboard.html` or `login.html`)
3. That is expected — it is **not** the Supabase dashboard “Auth” settings page
4. If they land on **Sign in**, use the same email + password they registered with

If the link opens localhost or the wrong page, check Site URL + Redirect URLs above.

**Authentication → Providers → Email**

- Enable Email
- For testing you may turn **off** “Confirm email” temporarily so signup works immediately
- For production, turn confirm email **on**

## 3. How members get in

### Option A — Self-serve (ready now)

1. Member opens `/members/register.html`
2. Uses the **same email** as in the imported list
3. Sets a password
4. Trigger applies association / welfare / both from `member_imports`
5. They sign in at `/members/login.html`

### Option B — Bulk invite emails (optional)

Use the service-role script (never put service_role in the website):

```powershell
$env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-key-here"
python docs/invite_members.py --limit 5
```

Test with `--limit 5` first, then run without limit.

## 4. Test with your own email

1. Pick your email from `member_imports` (or register fresh)
2. Register or invite
3. Sign in → dashboard should show correct plan label

## 5. Deploy

Push to `main` so Vercel picks up `members-auth.js` and updated login/register pages.
