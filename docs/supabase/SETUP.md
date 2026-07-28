# Connect Taunet Nelel to Supabase

Follow these steps in order.

## Step 1 — Create Supabase project

1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Choose a region close to Australia
4. Save your database password

## Step 2 — Run the database setup

1. Open your Supabase project
2. Go to **SQL Editor**
3. Open `supabase/migrations/001_initial_schema.sql` from this repo
4. Copy all SQL and paste it into the editor
5. Click **Run**

This creates:

- `form_submissions`
- `sponsors`
- `profiles`
- `events`
- `newsletter_subscribers`

## Step 3 — Add your API keys to the site

1. In Supabase go to **Settings > API**
2. Copy:
   - **Project URL**
   - **anon public** key
3. Open `assets/js/supabase-config.js`
4. Paste your values:

```js
window.TAUNET_SUPABASE = {
  url: 'https://YOUR_PROJECT_ID.supabase.co',
  anonKey: 'YOUR_ANON_PUBLIC_KEY'
};
```

5. Save the file

Important:

- Use the **anon public** key only
- Never put the **service_role** key in website code

## Step 4 — Test locally

1. Start the local server:

```powershell
.\serve.ps1
```

2. Open [http://localhost:8080/contact.html](http://localhost:8080/contact.html)
3. Submit a test message
4. In Supabase go to **Table Editor > form_submissions**
5. Confirm the row appears

## Step 5 — Deploy

1. Commit and push your changes
2. Vercel will redeploy automatically
3. Test a live form on your deployed site

## What is already connected

These forms save to Supabase when `supabase-config.js` is filled in:

- Contact (`contact.html`)
- Membership (`membership.html`)
- Sponsorship (`sponsorship.html`)
- Welfare (`welfare.html`)
- Events (`events.html`)

If Supabase is not configured yet, forms still fall back to **FormSubmit email**.

## Check submissions in Supabase

**Table Editor > form_submissions**

Each row includes:

- `form_type` — contact, membership, sponsorship, welfare, events
- `name`, `email`, `phone`, `message`
- `metadata` — extra fields like sponsorship level or plan

## Next steps (optional)

1. Member login with Supabase Auth
2. Load sponsors from `sponsors` table on sponsorship page
3. Move events from `events-phases.js` into `events` table
4. Store newsletter signups in `newsletter_subscribers`

## Troubleshooting

**Form still sends email only**

- Check `supabase-config.js` has real URL and anon key
- Hard refresh the page (Ctrl+F5)

**Insert failed / permission error**

- Re-run `001_initial_schema.sql`
- Confirm RLS policies were created

**Nothing in Table Editor**

- Open browser DevTools > Console
- Look for `Supabase form error`

## Files added for this integration

- `supabase/migrations/001_initial_schema.sql`
- `assets/js/supabase-config.js`
- `assets/js/supabase-config.example.js`
- `assets/js/supabase-init.js`
