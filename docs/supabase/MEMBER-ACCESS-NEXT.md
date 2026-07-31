# Member access — do this next

Two paths. Prefer **A** until custom SMTP is set.

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

## After the test works

1. Add custom SMTP in Supabase (SendGrid / Resend / etc.).
2. Either keep self-register, or run bulk invites in batches:  
   `python docs/invite_members.py --limit 50` (repeat carefully).
3. Reply with: 5 invites ok? / self-register only? / SMTP ready?
