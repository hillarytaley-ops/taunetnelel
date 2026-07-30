# Committee admin dashboard

## URL

**Admin portal (PIN):** https://taunetnelel.vercel.app/admin/

This is **separate** from the members area (`/members/login.html`).

Default PIN: `TaunetAdmin2026`  
Change it in `assets/js/supabase-config.js` → `adminPin`.

## How access works

1. **Admin PIN** — unlocks the committee portal (Business Hub, page links, layout).
2. **Optional live database** — on Overview, connect a committee email from `site_admins` only if you need enquiries / members / imports from Supabase. That is not the public members login screen.

## One-time SQL (for live data)

1. `007` → `008` → `009` → `010` → **`011_fix_site_admin_recognition.sql`**
2. Confirm emails in `site_admins`.

## Sections

| Tab | Needs |
|-----|--------|
| Business Hub | PIN only |
| Pages & tools | PIN only |
| Enquiries / Members / Imports / Events / Sponsors / Gallery / Newsletter | PIN + live database connect |
