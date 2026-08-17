-- Run in Supabase SQL Editor (production), then refresh the Welfare tab and Admin → Claims.
-- After APPLY-CRM-CUSTOM-FIELDS.sql. Safe to re-run.
-- Members lodge claims on the Welfare tab. Committee approve in Admin → Claims.
-- Approved/paid claims appear as anonymised reimbursement alerts.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_custom_fields'
  ) then
    update public.crm_custom_fields
    set visibility = 'member',
        member_editable = false,
        updated_at = now()
    where field_key = 'date_admitted'
      and coalesce(is_sensitive, false) = false;
  end if;
end $$;

create table if not exists public.welfare_claims (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_name text,
  member_email text,
  member_number text,
  public_ref text not null default '',
  claim_type text not null check (claim_type in (
    'bereavement', 'hardship', 'family_emergency', 'other'
  )),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  details text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'approved', 'declined', 'paid')),
  admin_notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welfare_claims_status_idx
  on public.welfare_claims (status, created_at desc);

create index if not exists welfare_claims_profile_idx
  on public.welfare_claims (profile_id, created_at desc);

create or replace function public.welfare_claims_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and (new.public_ref is null or btrim(new.public_ref) = '') then
    new.public_ref := 'Member #' || lpad(
      ((abs(hashtext(new.profile_id::text)) % 9000) + 1000)::text,
      4,
      '0'
    );
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists welfare_claims_before_write on public.welfare_claims;
create trigger welfare_claims_before_write
  before insert or update on public.welfare_claims
  for each row execute function public.welfare_claims_before_write();

alter table public.welfare_claims enable row level security;

revoke all on table public.welfare_claims from public, anon;
grant select, insert on table public.welfare_claims to authenticated;
grant all on table public.welfare_claims to service_role;

drop policy if exists "members read own welfare claims" on public.welfare_claims;
create policy "members read own welfare claims"
  on public.welfare_claims
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "members lodge own welfare claims" on public.welfare_claims;
create policy "members lodge own welfare claims"
  on public.welfare_claims
  for insert
  to authenticated
  with check (profile_id = auth.uid() and status = 'submitted');

drop view if exists public.welfare_claim_alerts;
create view public.welfare_claim_alerts
with (security_invoker = false)
as
select
  id,
  public_ref,
  claim_type,
  amount_cents,
  status,
  coalesce(decided_at, updated_at) as published_at
from public.welfare_claims
where status in ('approved', 'paid');

grant select on public.welfare_claim_alerts to authenticated;
grant all on public.welfare_claim_alerts to service_role;
