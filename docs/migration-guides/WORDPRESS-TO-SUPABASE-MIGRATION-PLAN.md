# Taunet Nelel — WordPress to Supabase Migration Plan

**Prepared:** 23 July 2026  
**Source (real site):** https://www.taunetnelel.org/  
**Target UI (clone):** https://taunetnelel.vercel.app/ (this repository)  
**Target backend:** One Supabase project (PostgreSQL + Auth + Storage)  
**Related docs:** `docs/supabase/SETUP.md`, `supabase/migrations/001_initial_schema.sql`

---

## 1. Purpose

Migrate the live Taunet Nelel website off WordPress onto:

1. **Frontend:** the existing static clone (Vercel / this repo) as the new public UI  
2. **Backend:** one Supabase project for database, auth, forms, and media metadata  

WordPress stays live until cutover. The Vercel clone and the real domain will share the **same** Supabase project when you go live.

---

## 2. Important clarification: WordPress vs PostgreSQL

| System | Database in practice |
|--------|----------------------|
| **WordPress** (`taunetnelel.org`) | Almost always **MySQL or MariaDB** (not PostgreSQL) |
| **Supabase** | **PostgreSQL** (managed) |

This plan treats migration as:

**WordPress + MySQL/MariaDB → Supabase (PostgreSQL) + static UI on Vercel.**

If your host also exposes a separate PostgreSQL instance, treat it as optional; do not assume WordPress data lives there unless you have confirmed it. Export and inventory the WordPress MySQL database first.

You do **not** “move PostgreSQL to Supabase” as a full dump of WordPress tables. You extract the content you need and load it into the Supabase schema already defined in this repo.

---

## 3. Target architecture

```
┌─────────────────────────────────────┐
│  WordPress (taunetnelel.org)        │  ← keep live until cutover
│  MySQL + wp-content/uploads         │
└─────────────────┬───────────────────┘
                  │ one-way export / import
                  ▼
┌─────────────────────────────────────┐
│  Supabase (one project)             │
│  Postgres tables + Auth + Storage   │
└─────────────────┬───────────────────┘
                  │ same Project URL + anon key
         ┌────────┴────────┐
         ▼                 ▼
  Vercel clone        Real domain
  (staging / new UI)  (after DNS cutover)
  taunetnelel.vercel.app   www.taunetnelel.org
```

**Rules during migration**

- One Supabase project for both the unreal (Vercel) UI and the real site after cutover.  
- Do not point WordPress at Supabase.  
- Do not couple the clone to WordPress APIs.  
- Migration tooling talks **WordPress/MySQL → Supabase only**.

---

## 4. What already exists in the clone

### 4.1 Supabase schema (ready to run)

From `supabase/migrations/001_initial_schema.sql`:

| Table | Purpose |
|-------|---------|
| `form_submissions` | Contact, membership, sponsorship, welfare, events, support enquiries |
| `sponsors` | Sponsorship directory (tiers, logos, contacts) |
| `profiles` | Member profile (linked to Supabase Auth) |
| `events` | Upcoming / past events |
| `newsletter_subscribers` | Newsletter emails |
| `gallery_albums` | Gallery album metadata |
| `gallery_photos` | Photo rows + storage paths |
| `businesses` | Business directory |
| `business_news` | Business hub news |

RLS policies for public read/insert and member profile access are included. Run `002_fix_security_warnings.sql` after `001` if not already applied.

### 4.2 Clone UI status

| Capability | Status today |
|------------|--------------|
| Static pages (home, about, events, membership, etc.) | Done in HTML |
| Forms → Supabase | Wired via `assets/js/supabase-init.js` when config is set; else FormSubmit email |
| Events content | Still largely in `assets/js/events-phases.js` |
| Gallery | Still largely in `assets/js/gallery-data.js` |
| Business directory | Still largely in `assets/js/business-content.js` |
| Member area | Demo / `localStorage` in `assets/js/members.js` — replace with Supabase Auth |
| Sponsors | Seeded in SQL; page may still be partly static |

### 4.3 Live WordPress surface (inventory starting point)

Confirm and expand this list from the live site and WP admin:

- Home, About, Events (upcoming + past), Membership, Sponsorship, Gallery / photo finds  
- Contact / enquiries, Join / Donate CTAs, Login  
- Media under `wp-content/uploads/`  
- Users / members (if WP users or a membership plugin)  
- Any forms (Contact Form 7, Gravity, etc.) and their stored entries  
- Business / community listings if present as posts or custom post types  

---

## 5. Migration principles

1. **Content, not WordPress schema** — map meaning into Supabase tables; do not recreate `wp_posts` / `wp_users` as-is.  
2. **WordPress stays authoritative until cutover** — final sync before DNS change.  
3. **Passwords do not transfer** — members reset via Supabase Auth (invite or magic link).  
4. **Media is a separate workstream** — files to Supabase Storage (or CDN) + paths in DB.  
5. **Phased go-live** — forms and read-only content first; Auth next; DNS last.  
6. **One Supabase project** — Vercel and production share it; mark or clean test rows.

---

## 6. Phased plan

### Phase 0 — Access, inventory, backups (Week 0–1)

**Goals:** Safe rollback and a complete list of what to move.

**Actions**

1. Collect access: WordPress admin, hosting panel, DNS (domain registrar), GitHub, Vercel, Supabase.  
2. Full backup:
   - MySQL dump (phpMyAdmin / host backup / `mysqldump`)  
   - Full `wp-content/uploads` download  
   - WordPress **Tools → Export** (WXR/XML) for pages/posts  
   - Screenshot or export of forms/plugins/membership settings  
3. Store backups offline (Drive / external drive) and label with date.  
4. Inventory spreadsheet columns:  
   `Content type | WP location | Approx count | Target Supabase table | Owner | Priority | Notes`  
5. Confirm DB engine (MySQL/MariaDB version) and hosting expiry dates.  
6. Decide cutover window (low-traffic weekend preferred).

**Exit criteria**

- [ ] SQL + uploads + WXR backups verified readable  
- [ ] Inventory signed off by committee lead  

---

### Phase 1 — Supabase foundation (Week 1)

**Goals:** Empty but production-ready backend shared by clone and future real site.

**Actions**

1. Confirm Supabase project region (prefer Australia-adjacent).  
2. Save DB password and project ref securely (password manager).  
3. Run in SQL Editor:
   - `supabase/migrations/001_initial_schema.sql`  
   - `supabase/migrations/002_fix_security_warnings.sql`  
4. Create Storage buckets (suggested):

   | Bucket | Public? | Use |
   |--------|---------|-----|
   | `media` | Public read | Logos, event images, public gallery |
   | `gallery-member` | Private / signed | Member-only downloads (if needed) |
   | `private-docs` | Private | Welfare / admin docs (later) |

5. Auth settings (prepare, enable when ready for members):
   - Email provider on  
   - Site URL: `https://taunetnelel.vercel.app` initially  
   - Redirect URLs: Vercel + later `https://www.taunetnelel.org/**`  
6. Fill `assets/js/supabase-config.js` with **Project URL** + **anon** key only (never `service_role` in the browser).  
7. Deploy to Vercel; submit a test contact form; confirm row in `form_submissions`.

**Exit criteria**

- [ ] All tables + RLS present  
- [ ] Test form visible in Table Editor  
- [ ] Storage buckets created  

---

### Phase 2 — Extract and transform WordPress data (Week 1–2)

**Goals:** Clean CSV/JSON (or SQL inserts) ready for Supabase — no live writes to WordPress.

**Do not** import raw `wp_*` tables into Supabase.

#### 2.1 Suggested extraction methods

| Method | When to use |
|--------|-------------|
| WordPress XML export | Pages, posts, basic media URLs |
| MySQL queries / CSV export | Custom post types, users, form entries |
| Manual spreadsheet | Small sponsor / business lists |
| One-off import script (Node/Python) | Larger galleries or repeated imports |

#### 2.2 Field mapping (WordPress → Supabase)

**Events** → `public.events`

| Source idea | Target column |
|-------------|----------------|
| Slug / post ID | `id` (stable text id) |
| Title | `title` |
| Excerpt / short text | `summary` |
| Venue ACF/meta | `location` |
| Date/time | `start_at`, `end_at` |
| Featured image URL | `image_path` (after upload → Storage path) |
| Booking / ticket link | `booking_url` |
| Gallery link | `gallery_url` |
| Status | `is_published`, `featured`, `registration_open` |

**Sponsors** → `public.sponsors`  
(Many may already match seed data in `001_initial_schema.sql` — reconcile, do not duplicate.)

| Source | Target |
|--------|--------|
| Org name | `name` |
| Tier | `tier` (`platinum` \| `gold` \| `silver` \| `bronze`) |
| Logo | `logo_url` |
| Email / phone / site | `contact_email`, `contact_phone`, `website` |
| Display order | `sort_order` |

**Gallery** → `gallery_albums` + `gallery_photos`

| Source | Target |
|--------|--------|
| Album / event title | `gallery_albums.title` |
| Event date | `event_date`, `sort_date` |
| Image file | Upload to Storage → `gallery_photos.storage_path` |
| Caption | `alt_text` |
| Member-only flag | `is_member_only` |

**Business directory** → `businesses` / `business_news`

**Members / WP users** → Supabase Auth + `profiles`

| Source | Target |
|--------|--------|
| Email | Auth user email |
| Display name | `profiles.full_name` |
| Phone / meta | `profiles.phone` |
| Plan (basic / welfare) | `profiles.plan` |
| Member number | `profiles.member_number` |
| Join / renew dates | `profiles.member_since`, `profiles.renews_at` |

**Form history (optional)** → `form_submissions`  
Only if you need historical enquiries; otherwise start fresh at go-live.

**Static page copy** (About, Membership benefits, etc.)  
Most already lives in clone HTML. Prefer **keeping HTML** unless you introduce a `pages` / CMS table later. Do not block migration on a full CMS.

#### 2.3 Media migration steps

1. Download `wp-content/uploads`.  
2. Deduplicate; drop unused/orphan files if time allows.  
3. Upload to Supabase Storage (`media` / gallery buckets) with a clear path scheme, e.g.  
   `events/2026/sports-day/hero.jpg`, `sponsors/grace.png`, `gallery/gala/001.jpg`.  
4. Rewrite DB fields from old `https://www.taunetnelel.org/wp-content/...` URLs to Storage public URLs or relative paths the clone understands.  
5. Keep a URL redirect map for SEO (old media URLs → new) if search links matter.

**Exit criteria**

- [ ] Transformed datasets reviewed (sample rows)  
- [ ] Media uploaded for priority albums/events/sponsors  
- [ ] Duplicate sponsor seed reconciled  

---

### Phase 3 — Load data into Supabase (Week 2)

**Goals:** Supabase becomes the content source of truth for migrated entities.

**Actions**

1. Import in this order (respect FKs):  
   1. `sponsors`  
   2. `events`  
   3. `gallery_albums` then `gallery_photos`  
   4. `businesses` / `business_news`  
   5. Auth users + `profiles` (see Phase 4)  
   6. Optional historical `form_submissions` / newsletter  
2. Prefer Table Editor CSV import for small sets; use scripts + **service_role** only on a secure machine for bulk loads.  
3. Validate counts: WP inventory vs Supabase `count(*)`.  
4. Spot-check 10 random records (text, dates, image URLs).  
5. Freeze WordPress content edits during final import window, or plan a delta re-import.

**Exit criteria**

- [ ] Row counts match agreed inventory  
- [ ] Published flags correct  
- [ ] Broken image paths list = empty for P0 content  

---

### Phase 4 — Member authentication migration (Week 2–3)

**Goals:** Replace WordPress login / clone `localStorage` demo with Supabase Auth.

**Actions**

1. Export member emails + profile fields from WP (Users or membership plugin).  
2. Create Auth users via Admin API / invite emails (do **not** copy password hashes).  
3. Ensure `handle_new_user` trigger creates `profiles` rows; then backfill plan, member number, renewals.  
4. Update clone member pages (`members/login.html`, `register.html`, `dashboard.html`, etc.) to use Supabase Auth session instead of `localStorage` in `members.js`.  
5. Send members a short email: new site URL, how to set password / magic link, support contact.  
6. Test: register, login, logout, password reset, profile view/update, welfare-gated pages if any.

**Exit criteria**

- [ ] Committee test accounts work end-to-end  
- [ ] At least one real member completes invite flow in UAT  

---

### Phase 5 — Wire the clone UI to Supabase reads (Week 3)

**Goals:** Vercel UI reads live data (not only static JS).

**Priority order**

1. **Forms** — already supported; confirm all `data-supabase-form` pages write successfully.  
2. **Events page** — load from `events` instead of (or falling back from) `events-phases.js`.  
3. **Sponsorship** — load from `sponsors`.  
4. **Gallery** — load albums/photos from Supabase + Storage.  
5. **Business hub** — load from `businesses` / `business_news`.  
6. **Newsletter** — `newsletter_subscribers`.  
7. Remove or narrow FormSubmit fallback once Supabase is reliable (optional dual-write period: DB + email notification via Edge Function or Zapier later).

**Exit criteria**

- [ ] Vercel staging matches agreed content checklist  
- [ ] Mobile + desktop smoke test passed  
- [ ] Console free of Supabase auth/RLS errors for public pages  

---

### Phase 6 — Parallel run / UAT (Week 3–4)

**Goals:** Prove the new stack before DNS cutover.

**Actions**

1. Keep WordPress live for the public.  
2. Committee uses **only** `https://taunetnelel.vercel.app` for UAT.  
3. Test checklist:
   - [ ] Home / About / Community copy  
   - [ ] Events list + enquiry form  
   - [ ] Membership + sponsorship forms  
   - [ ] Gallery view + download rules  
   - [ ] Member login + profile  
   - [ ] Business listings  
   - [ ] Contact form → `form_submissions`  
   - [ ] Mailto / phone / social links  
   - [ ] 404 and legal pages (privacy, terms)  
4. Fix gaps; re-import deltas from WordPress if editors changed content.  
5. Performance: image sizes, Storage cache headers.  
6. Security: confirm anon key only in client; RLS blocks unauthorized reads/writes.

**Exit criteria**

- [ ] UAT sign-off from committee  
- [ ] Open P0 bugs = 0  

---

### Phase 7 — Cutover to real domain (Week 4)

**Goals:** `www.taunetnelel.org` serves the clone UI backed by Supabase.

**Actions**

1. Final data delta sync (events, gallery, members) from WordPress → Supabase.  
2. Put WordPress in maintenance mode (or freeze publishing).  
3. In Vercel: add domain `www.taunetnelel.org` (+ apex `taunetnelel.org` if required).  
4. Update DNS (A/CNAME/ALIAS per Vercel docs). TTL: lower to 300s a day before cutover.  
5. In Supabase Auth: add production Site URL + redirect allow list for the real domain.  
6. Update any hardcoded Vercel URLs in forms (`_next` redirects, emails) to the real domain.  
7. Verify HTTPS, forms, login, and key pages on the real domain.  
8. Optional: 301 redirects from old WP permalinks to new HTML routes (Vercel redirects config).  
9. Monitor 48–72 hours: form volume, auth errors, 404s.  
10. Keep WordPress hosting paid and backups intact for at least **2–4 weeks**.

**Exit criteria**

- [ ] Real domain serves clone UI  
- [ ] Supabase receives production form traffic  
- [ ] Rollback plan still possible (DNS back to WordPress)  

---

### Phase 8 — Decommission WordPress (Week 6+)

**Goals:** Cost reduction without losing history.

**Actions**

1. Final WP backup (SQL + uploads + XML) archived permanently.  
2. Export any remaining form mailboxes / plugin data.  
3. Cancel WP host only after committee confirmation.  
4. Remove unused WP plugins/themes from backups if storing long-term (optional cleanup).  
5. Document Supabase billing, owners, and recovery contacts.

**Exit criteria**

- [ ] WordPress offline or archived  
- [ ] Backup location documented  

---

## 7. One Supabase project for real + Vercel

| Environment | URL | Supabase project |
|-------------|-----|------------------|
| Unreal / staging UI | `https://taunetnelel.vercel.app` | **Same project** |
| Real site (after cutover) | `https://www.taunetnelel.org` | **Same project** |

**Implications**

- Test form submissions on Vercel appear in the same `form_submissions` table as production.  
- Mitigations: use obvious test emails (`test+...@`), periodic cleanup, or a `metadata.source` / `metadata.env` field later.  
- Optional future upgrade: separate staging Supabase project; not required for first go-live.

You do **not** delink Vercel from Supabase to go live. You add the real domain to Vercel and Auth redirect settings. Vercel remains the UI host unless you later move hosting.

---

## 8. Roles and responsibilities (suggested)

| Role | Responsibilities |
|------|------------------|
| Project lead | Timeline, UAT sign-off, cutover decision |
| Content owner | Inventory accuracy, copy QA |
| Technical | Exports, imports, schema, UI wiring, DNS |
| Committee tester | Forms, login, events, gallery checks |

---

## 9. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Missing media after cutover | Full uploads backup; Storage upload before DNS; URL map |
| Member password friction | Clear invite email + help contact; magic link |
| SEO / broken old links | Vercel redirects; keep key WP URLs mapped |
| RLS blocking public content | Test anon reads on Vercel before cutover |
| Editors still updating WordPress | Freeze window + final delta import |
| Accidental `service_role` in frontend | Code review; only anon in `supabase-config.js` |
| Mixed test + real form data | Naming convention for tests; cleanup query |

---

## 10. Rollback plan

**Before DNS cutover:** keep using WordPress; fix Supabase/clone offline.  

**After DNS cutover (within TTL window):**

1. Point DNS back to WordPress host.  
2. Re-enable WordPress if in maintenance mode.  
3. Investigate Supabase/UI issues on Vercel URL.  
4. Re-attempt cutover only after sign-off.

Supabase data remains; rollback is primarily **DNS / hosting**, not deleting the database.

---

## 11. Suggested timeline (4 weeks core)

| Week | Focus |
|------|--------|
| 1 | Backups, inventory, Supabase schema, Storage, form smoke test |
| 2 | Extract/transform/load events, sponsors, gallery, businesses |
| 3 | Auth + profiles; wire UI reads; committee UAT |
| 4 | Final sync, DNS cutover, monitor |
| 6+ | Archive and decommission WordPress |

Adjust if gallery volume or membership plugin complexity is high.

---

## 12. Definition of done

Migration is complete when:

1. `https://www.taunetnelel.org` serves the clone UI.  
2. Public content (events, sponsors, gallery, business) is served from Supabase (or explicitly accepted as static HTML).  
3. Forms persist in `form_submissions`.  
4. Members authenticate via Supabase Auth with profiles populated.  
5. WordPress is backed up and scheduled for decommission.  
6. This plan’s Phase 7 exit criteria are checked off.

---

## 13. Working checklist (copy into an issue tracker)

### Prep
- [ ] WP admin + hosting + DNS access confirmed  
- [ ] MySQL dump saved and verified  
- [ ] `wp-content/uploads` downloaded  
- [ ] WXR export saved  
- [ ] Content inventory spreadsheet complete  

### Supabase
- [ ] Project created (AU-near region)  
- [ ] `001` + `002` migrations applied  
- [ ] Storage buckets created  
- [ ] Auth URLs configured (Vercel + later production)  
- [ ] `supabase-config.js` set; test form OK on Vercel  

### Data
- [ ] Events imported  
- [ ] Sponsors reconciled  
- [ ] Gallery albums/photos + media uploaded  
- [ ] Businesses / news imported  
- [ ] Members invited + profiles backfilled  

### UI
- [ ] Forms writing to Supabase  
- [ ] Events page reads Supabase  
- [ ] Sponsorship reads Supabase  
- [ ] Gallery reads Supabase  
- [ ] Member login uses Supabase Auth  

### Cutover
- [ ] UAT signed off  
- [ ] Final delta sync done  
- [ ] Domain on Vercel  
- [ ] DNS updated  
- [ ] Production Auth redirects updated  
- [ ] 72h monitoring complete  
- [ ] WP archived / hosting cancelled (later)  

---

## 14. Reference links

- Live WordPress: https://www.taunetnelel.org/  
- Clone UI: https://taunetnelel.vercel.app/  
- Supabase docs: https://supabase.com/docs  
- Local setup: `docs/supabase/SETUP.md`  
- Schema: `supabase/migrations/001_initial_schema.sql`  
- Shorter PDF overview generator: `docs/migration-guides/generate_migration_guide.py`  

---

## 15. Next actions (immediate)

1. Complete Phase 0 backups and inventory against the live site.  
2. Confirm MySQL access (phpMyAdmin or host DB tools).  
3. Ensure migrations `001` / `002` are applied on your Supabase project.  
4. Connect Vercel clone forms (`SETUP.md`) and verify one submission.  
5. Start Phase 2 with **events + sponsors** (highest public value, lower risk than full member Auth).

---

*Document location (clone local folder):*  
`docs/migration-guides/WORDPRESS-TO-SUPABASE-MIGRATION-PLAN.md`
