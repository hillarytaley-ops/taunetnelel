# Migrate MemberPress portal members → Supabase

Source: [portal.taunetnelel.org MemberPress Members](https://portal.taunetnelel.org/wp-admin/admin.php?page=memberpress-members)

That WP portal only has **5** members (new BuddyBoss/MemberPress install). The **540** ClientClub people are already in `member_imports` from the CSV import — this step only covers the portal accounts.

## Members on that screen

| MemberPress | Email | Notes |
|-------------|-------|--------|
| Ruto | `psowey@gmail.com` | **Admin** — also on ClientClub import (Association + Welfare) |
| Hillary Taley | `hillarytaley@gmail.com` | **Admin** — committee |
| Alexis (Brian Ngetich) | `alexissams71@gmail.com` | **Admin** |
| Ruto Mangusho | `rutopsowey@gmail.com` | **Admin** — Active Standard on MemberPress (alt email) |
| webmaster | `briankip57@gmail.com` | **Admin** — WP webmaster |

All five are inserted into `site_admins` so they can use `/admin/` after they have a Supabase Auth account.

## Steps

Run these in Supabase **SQL Editor** in order:

1. **`007_member_import_staging.sql`** — creates `member_imports`
2. **`008_profiles_membership_auth.sql`** — profile columns + Auth signup trigger
3. **`009_admin_dashboard_access.sql`** — `site_admins` + admin RLS
4. **`010_portal_memberpress_members.sql`** — the 5 portal admins

(`010` now also adds missing `site_admins` / profile columns if an earlier step was skipped.)

Optional: reload the full 540 ClientClub list with `backups/migration-ready/import_members.sql` (only if that table is empty and you still need the big list).

5. Confirm the SELECT at the end of `010` lists all 5 emails.

3. **Auth accounts** (passwords are not copied from WordPress):
   - Each person registers or signs in at  
     `https://taunetnelel.vercel.app/members/register.html`  
     using the **same email** as MemberPress — membership flags apply from `member_imports`.
   - Or invite with `docs/invite_members.py` (service role) for those emails only.

4. **Committee admin** (`/admin/`):
   - All five emails above are in `site_admins`.
   - Each must have a members Auth password, then sign in at `/admin/`.

## Important

- Migrating these 5 does **not** replace the 540-person ClientClub list.
- WordPress passwords cannot be imported into Supabase Auth — users set a new password once.
- After the new portal is trusted, retire `portal.taunetnelel.org` (DNS later).
