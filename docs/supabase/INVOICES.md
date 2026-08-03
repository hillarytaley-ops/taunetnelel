# PayID / bank invoices

Members request an invoice from the portal; Vercel creates a row, emails a PDF with PayID / EFT details, and the Treasurer marks it **Paid** in Admin when the deposit lands.

## Membership gate (Basic Plan)

New public signups get `association_member = false` until an **association** invoice is marked **Paid** in Admin (or they already have a paid association invoice when they register).

- Migration: `supabase/migrations/021_require_paid_basic_membership.sql`
- Unpaid signed-in users are redirected to `/pay/basic.html`
- Imported members (`member_imports`) keep their existing membership flags

## Public Basic Plan PayID portal

- Page: `/pay/basic.html` (linked from Membership → **Pay $50 via PayID**)
- API: `POST /api/pay/basic` with `{ full_name, email, phone? }`
- Creates a pending **association** invoice ($50, 1 installment), emails the PDF, and returns PayID / bank details on screen
- Treasurer marks paid in Admin → **Invoices** after the deposit lands

## Public Welfare Plus PayID portal

- Page: `/pay/welfare.html` (Membership → **Pay via PayID**)
- API: `POST /api/pay/welfare` with `{ full_name, email, phone?, plan: "full" | "installments" }`
- **Full:** one **welfare** invoice for $300
- **Installments:** three **welfare** invoices of $100 (due ~ now / +1 month / +2 months), linked by `meta.series_id`
  - Installment 1 emailed immediately
  - Installments 2–3 emailed by daily cron near due date, with overdue reminders
- Cron: `GET/POST /api/cron/invoice-reminders` (Vercel cron `0 22 * * *` UTC) — set `CRON_SECRET` and call with `Authorization: Bearer …`
- Mark paid in Admin: full $300 (or all three installments) unlocks `welfare_member` + `association_member`

Requires the same Vercel env as invoices (`PAYID`, `BANK_*`, `RESEND_*`, Supabase).

## Apply the schema

1. Open Supabase → **SQL Editor**
2. Run `supabase/migrations/020_invoices.sql`
3. Confirm table `public.invoices` and column `events.fee_cents` exist

## Vercel environment (Production + Preview)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Already set |
| `SUPABASE_SERVICE_ROLE_KEY` | Already set |
| `RESEND_API_KEY` | Already set (member mail) |
| `RESEND_FROM` | e.g. `Taunet Nelel <members@taunetnelel.org>` |
| `PAYID` | Organisation PayID (email or phone) |
| `BANK_NAME` | Bank name on the invoice |
| `BANK_BSB` | BSB |
| `BANK_ACCOUNT_NUMBER` | Account number |
| `BANK_ACCOUNT_NAME` | Account name |
| `CRON_SECRET` | Bearer token for `/api/cron/invoice-reminders` (installment emails) |
| `ORG_LEGAL_NAME` | Optional; default `Taunet Nelel Incorporated` |
| `ORG_ABN` | Optional ABN on PDF |
| `INVOICE_DUE_DAYS` | Optional; default `14` |

At least **PayID** or full bank fields (`BANK_BSB` + `BANK_ACCOUNT_NUMBER`) should be set so members know where to pay.

## Member flow

1. Sign in → **Membership** → **Email me $50 invoice** or **Email me $300 invoice**
2. Or **My Events** → **Email $X invoice** (only when the event has `fee_cents` &gt; 0)
3. Email arrives with PDF + payment reference (use that reference on the transfer)
4. History appears under **Payment history / invoices** on Membership

## Admin flow

1. Admin → **Invoices**
2. Filter **Pending** → match bank deposit to invoice number / pay reference
3. **Mark paid** (or **Void** if cancelled)
   - **Mark paid** emails the member the **paid invoice PDF** automatically (same branded PDF as Download PDF).
   - For invoices already paid, use **Email paid PDF** to resend.

Event fees: Admin → **Events** → set **Fee (AUD)** when creating, or edit the fee field on an existing row.

## Amounts (fixed)

| Kind | Amount |
|---|---|
| Association (Basic) | AUD $50 |
| Welfare | AUD $300 |
| Event | From `events.fee_cents` |

## API

- `POST /api/invoices/create` — member Bearer token; body `{ kind, event_id?, amount_cents? }`
- Admin `GET ?resource=invoices&status=pending|paid|void|all`
- Admin `PATCH ?resource=invoice-status` — body `{ id, status }` (when `status=paid`, emails paid PDF)
- Admin `POST ?resource=invoice-receipt` — body `{ id }` (resend paid PDF email)
