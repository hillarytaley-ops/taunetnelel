# Committee admin dashboard

## URL

Production: `https://taunetnelel.vercel.app/admin/`

Local: open `admin/index.html`

Business Hub tab: `https://taunetnelel.vercel.app/admin/#business`  
(`admin/business.html` redirects here.)

## One-time setup

1. In Supabase SQL Editor, run:

   `supabase/migrations/009_admin_dashboard_access.sql`

2. Confirm your email is in `site_admins` (the migration seeds `hillarytaley@gmail.com` and `hillarykaptingei@gmail.com`). To add another:

```sql
insert into public.site_admins (email, full_name)
values ('someone@email.com', 'Name')
on conflict (email) do nothing;
```

3. That person must have a members Auth account (register/sign in on `/members/` first).

4. Open `/admin/` and sign in with that email + password.

## What it covers

| Section | Source |
|---------|--------|
| Overview | Counts from Supabase |
| Enquiries | `form_submissions` (status updates) |
| Member profiles | `profiles` + Approve welfare |
| Import list | `member_imports` + stats view |
| **Business Hub** | Cards, news, blog — edit / export `business-content.json` |
| Events / Sponsors / Gallery | DB tables (public pages may still use static JS/HTML) |
| Newsletter | `newsletter_subscribers` |
| Pages & tools | Links to public pages |

No separate Business PIN page — everything uses committee admin sign-in.
