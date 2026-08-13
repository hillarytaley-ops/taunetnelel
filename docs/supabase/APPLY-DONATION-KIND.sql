-- Allow donation invoices (PayID gifts — does not unlock membership)
-- Run in Supabase SQL Editor after APPLY-INVOICES.sql if invoices already exist.

alter table public.invoices
  drop constraint if exists invoices_kind_check;

alter table public.invoices
  add constraint invoices_kind_check
  check (kind in ('association', 'welfare', 'event', 'donation'));
