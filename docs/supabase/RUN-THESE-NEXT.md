# Complete these 4 migration steps

Do them in order. Steps 1–2 need the Supabase/Vercel dashboards (secrets). Steps 3–4 can use files already in this repo.

---

## 1. Vercel env vars + redeploy

I can’t set these from Cursor without your Vercel login + service_role key.

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → project **taunetnelel** (or your site name)  
2. **Settings → Environment Variables** → add for **Production** (and Preview if you want):

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://wgecdsdeeirzdvshdfwo.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API** → `service_role` (secret) |
| `ADMIN_PIN` | `TaunetAdmin2026` |

3. **Deployments → … on latest → Redeploy** (or push an empty commit)

4. Test: https://taunetnelel.vercel.app/admin/ → PIN `TaunetAdmin2026` → **Members (A / Welfare)** should show counts/list

---

## 2. Confirm SQL applied

In Supabase → **SQL Editor**, run:

`supabase/migrations/012_verify_migration_status.sql`

You want roughly:

| Check | Expected |
|-------|----------|
| `member_imports` | exists, ~540 rows (or more with portal admins) |
| `site_admins` | 5–6 committee emails |
| `profiles` columns | `plan`, `association_member`, `welfare_member`, `email` |
| `is_site_admin` | function exists |
| stats | association_only ~205, welfare_only ~22, both ~313 |

If something is missing, run in order:

1. `007_member_import_staging.sql`  
2. `008_profiles_membership_auth.sql`  
3. `009_admin_dashboard_access.sql`  
4. `011_fix_site_admin_recognition.sql`  
5. `010_portal_memberpress_members.sql` (the 5 portal admins)

---

## 3. Re-load 540 members (only if count ≠ ~540)

**Warning:** `import_members.sql` starts with `DELETE FROM member_imports` — it wipes the table, then inserts 540.

1. In SQL Editor, open/run `backups/migration-ready/import_members.sql`  
   (Do **not** paste the CSV.)  
2. Re-run `010_portal_memberpress_members.sql` so the 5 portal admins are restored  
3. Re-run `012_verify_migration_status.sql` and confirm totals  

If Table Editor already shows **540** and the Association/Welfare cards look right, **skip this step**.

---

## 4. Member access (invite vs self-register)

### Option A — Self-register (simplest)
Members open https://taunetnelel.vercel.app/members/register.html with their **list email** and set a password.  
Confirm email is on (or temporarily off for testing).  
Built-in Supabase email ≈ **2/hour** — use custom SMTP before bulk.

### Option B — Invites (script)

In PowerShell (from the repo folder):

```powershell
$env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
python docs/invite_members.py --limit 5
```

If that works, run without `--limit` later (still watch rate limits / SMTP).

---

## After you’re done

Reply with:

1. Admin Members list loads? (yes/no)  
2. `012` verify: `member_imports` count = ?  
3. Invites: test of 5 done, or self-serve only?
