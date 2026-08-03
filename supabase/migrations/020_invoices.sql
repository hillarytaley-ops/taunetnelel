-- PayID / EFT invoices for association, welfare, and event fees
-- Apply in Supabase SQL Editor (production).

create sequence if not exists public.invoice_number_seq start 1001;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  full_name text not null default '',
  kind text not null check (kind in ('association', 'welfare', 'event')),
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'AUD',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'void')),
  event_id text references public.events (id) on delete set null,
  pay_reference text not null,
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_email_lower check (email = lower(email))
);

create index if not exists invoices_email_idx on public.invoices (email);
create index if not exists invoices_user_id_idx on public.invoices (user_id);
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_issued_at_idx on public.invoices (issued_at desc);

-- Optional event fee (cents). Null = no invoiceable fee on site yet.
alter table public.events
  add column if not exists fee_cents integer
  check (fee_cents is null or fee_cents >= 0);

create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  y text;
begin
  n := nextval('public.invoice_number_seq');
  y := to_char(timezone('UTC', now()), 'YYYY');
  return 'TN-' || y || '-' || lpad(n::text, 5, '0');
end;
$$;

revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to service_role;

alter table public.invoices enable row level security;

drop policy if exists "Members can read own invoices" on public.invoices;
create policy "Members can read own invoices"
  on public.invoices
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Admins can read all invoices" on public.invoices;
create policy "Admins can read all invoices"
  on public.invoices
  for select
  to authenticated
  using (public.is_site_admin());

-- Inserts/updates go through service role API (Vercel), not direct client writes.
grant select on table public.invoices to authenticated;
grant all on table public.invoices to service_role;
grant usage, select on sequence public.invoice_number_seq to service_role;
