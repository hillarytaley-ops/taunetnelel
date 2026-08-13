-- APPLY INVOICE + MEMBERSHIP GATE + TICKET PRICES
-- Prerequisites (run first if this errors with "events does not exist"):
--   1) supabase/migrations/001_initial_schema.sql
--   2) docs/supabase/APPLY-REMAINING.sql  (needs is_site_admin())
-- Supabase → SQL Editor → New query → Paste → Run

-- Safety: invoices alter events; create the table if 001 was never applied.
create table if not exists public.events (
  id text primary key,
  title text not null,
  summary text,
  location text,
  meta text,
  badge text,
  image_path text,
  booking_url text,
  gallery_url text,
  start_at timestamptz not null,
  end_at timestamptz,
  featured boolean not null default false,
  registration_open boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);


-- ===== supabase/migrations/020_invoices.sql =====

-- PayID / EFT invoices for association, welfare, and event fees
-- Apply in Supabase SQL Editor (production).

create sequence if not exists public.invoice_number_seq start 1001;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  full_name text not null default '',
  kind text not null check (kind in ('association', 'welfare', 'event', 'donation')),
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

-- ===== supabase/migrations/021_require_paid_basic_membership.sql =====

-- Require Basic Plan PayID payment before association membership is active.
-- Public self-signup creates a profile with association_member = false until
-- Treasurer marks an association invoice paid (or a paid invoice already exists).
-- Imported members keep their member_imports flags.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mi public.member_imports%rowtype;
  v_plan text;
  v_assoc boolean;
  v_welfare boolean;
  v_name text;
  v_phone text;
  v_number text;
  v_paid boolean := false;
begin
  select * into mi
  from public.member_imports
  where lower(email) = lower(new.email)
  limit 1;

  if found then
    v_plan := mi.plan;
    v_assoc := mi.association_member;
    v_welfare := mi.welfare_member;
    v_name := coalesce(nullif(mi.full_name, ''), new.raw_user_meta_data->>'full_name', '');
    v_phone := mi.phone;
    v_number := mi.member_number;

    update public.member_imports
    set
      status = 'active',
      auth_user_id = new.id,
      updated_at = now()
    where id = mi.id;
  else
    -- Public signup: unpaid until association invoice is paid via PayID
    v_plan := 'basic';
    v_welfare := false;
    v_name := coalesce(new.raw_user_meta_data->>'full_name', '');
    v_phone := nullif(new.raw_user_meta_data->>'phone', '');
    v_number := null;

    begin
      select exists (
        select 1
        from public.invoices
        where email = lower(new.email)
          and kind = 'association'
          and status = 'paid'
      ) into v_paid;
    exception
      when undefined_table then
        v_paid := false;
    end;

    v_assoc := coalesce(v_paid, false);
  end if;

  insert into public.profiles (
    id, full_name, email, phone, plan,
    association_member, welfare_member, member_number
  ) values (
    new.id,
    v_name,
    new.email,
    v_phone,
    v_plan,
    v_assoc,
    v_welfare,
    v_number
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    email = excluded.email,
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

-- Keep trigger attached (function replace alone is not enough if trigger was dropped)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== supabase/migrations/022_event_ticket_prices.sql =====

-- Ticket price options for public Book & PayID (e.g. Single $100 / Two people $150).
alter table public.events
  add column if not exists ticket_prices jsonb;

comment on column public.events.ticket_prices is
  'JSON array of {id,label,amount_cents} ticket options for the public PayID booking portal.';

-- Seed Men's Camp defaults when the row exists.
update public.events
set
  fee_cents = coalesce(fee_cents, 10000),
  ticket_prices = coalesce(
    ticket_prices,
    '[
      {"id":"single","label":"Single","amount_cents":10000},
      {"id":"couple","label":"Two people","amount_cents":15000}
    ]'::jsonb
  ),
  booking_url = coalesce(booking_url, 'pay/event.html?event=men-s-camp-2026-08-01'),
  registration_open = true
where id = 'men-s-camp-2026-08-01';

-- Verify (expect invoices=true, fee_cents=true, ticket_prices=true)
select
  to_regclass('public.invoices') is not null as invoices_table,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'fee_cents'
  ) as events_fee_cents,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'ticket_prices'
  ) as events_ticket_prices;

-- If invoices table already existed before donation support, also run:
--   docs/supabase/APPLY-DONATION-KIND.sql
-- (allows kind = 'donation' for PayID gifts)
