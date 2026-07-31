# Migration steps — current status (2026-07-30)

## 1. Vercel env + redeploy — DONE

Already set on Production/Preview: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PIN`.  
Redeployed with `.vercelignore` (excludes `backups/` ~620MB).

Live check: PIN `TaunetAdmin2026` → `/api/admin/data?resource=overview` returns counts.

Admin: https://taunetnelel.vercel.app/admin/

---

## 2. Confirm SQL — PARTIAL

| Check | Result |
|-------|--------|
| `member_imports` | **540** rows |
| Stats | assoc-only 205, welfare-only 22, both 313 |
| `profiles` | 1 registered so far |
| `form_submissions.status` | **Missing** → migration **009** not fully applied |
| `site_admins` / `011` | Confirm in SQL Editor (API can’t list without service_role) |

**You:** In Supabase → SQL Editor, run:

`supabase/migrations/013_ensure_009_status_and_admins.sql`

Then optionally `012_verify_migration_status.sql`.

If you prefer full re-runs instead of 013: `008` → `009` → `011` → `010`.

---

## 3. Re-load `import_members.sql` — SKIP

Imports are complete (**540**). Do **not** re-run `import_members.sql` (it deletes then re-inserts).

---

## 4. 540 member access — NOT STARTED (rate limits)

All **540** still `pending_invite`. Options:

### A — Self-register (safest without SMTP)
Members use https://taunetnelel.vercel.app/members/register.html with their **list email**.

### B — Test invites (5), then pause
Built-in Auth email ≈ **2/hour**. Add custom SMTP before bulk.

```powershell
cd C:\Users\hilla\Desktop\Taunet
$env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
python docs/invite_members.py --limit 5
```

Only remove `--limit` after SMTP is configured.

---

## After 013

1. Admin Overview + Enquiries should show `status` without fallbacks  
2. Reply with `site_admins` emails from the 013 result set  
3. Say whether you want a 5-invite test or self-serve only  

---

## 5. Seed public events — RUN ONCE

Public Events/Sponsors/Gallery now read from Supabase (static HTML/JS as fallback).

In Supabase → SQL Editor, run:

`supabase/migrations/014_seed_events.sql`

Sponsors were already seeded in `001`. Gallery enrich already uses `gallery_albums` / `gallery_photos`.
