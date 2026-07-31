# Member access — do this next

**SMTP first for scale:** follow [CUSTOM-SMTP-SETUP.md](./CUSTOM-SMTP-SETUP.md) before bulk invites.  
Two paths below. Prefer **A** until custom SMTP is set.

---

## A — Self-register (no invite emails)

1. In Supabase → **Authentication → URL Configuration**, ensure these are allowed:
   - `https://taunetnelel.vercel.app/members/auth.html`
   - `https://taunetnelel.vercel.app/members/auth.html?tab=signin`
   - Site URL: `https://taunetnelel.vercel.app`
2. Tell members to open:  
   https://taunetnelel.vercel.app/members/auth.html?tab=join  
   and register with the **same email** as on the import list.
3. Optional: temporarily turn off **Confirm email** (Auth → Providers → Email) while testing, then turn it back on.

Built-in Auth email ≈ **2 confirmations/hour** project-wide — so mass self-register still needs custom SMTP for confirm emails.

---

## B — Test invites (5 only)

1. Supabase → **Project Settings → API** → copy **service_role** (secret).
2. PowerShell from the repo:

```powershell
cd C:\Users\hilla\Desktop\Taunet
$env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
python docs/invite_members.py --limit 5
```

3. Check those 5 inboxes for the invite → set password → sign in at `/members/auth.html?tab=signin`.
4. In Admin → **Members (A / Welfare)**, confirm those rows leave `pending_invite` (or status becomes active after signup).

**Do not** remove `--limit` until custom SMTP is configured (Authentication → SMTP).

---

## After SMTP works (see CUSTOM-SMTP-SETUP.md)

1. Confirm 1 test invite arrives from `noreply@taunetnelel.org` (or your chosen sender).
2. Run bulk invites in batches:  
   `python docs/invite_members.py --limit 50` (repeat carefully).
3. Or keep self-register at `/members/auth.html?tab=join` with list emails.
