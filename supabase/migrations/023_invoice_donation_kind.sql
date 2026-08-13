-- Allow donation invoice kind (community gifts via PayID)
alter table public.invoices
  drop constraint if exists invoices_kind_check;

alter table public.invoices
  add constraint invoices_kind_check
  check (kind in ('association', 'welfare', 'event', 'donation'));
