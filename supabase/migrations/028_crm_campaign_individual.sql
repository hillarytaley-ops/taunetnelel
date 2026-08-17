-- Allow one-person email campaigns. Safe to re-run.
-- Run after APPLY-CRM-FOLLOWUP.sql if that already ran.

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'crm_campaigns'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%audience%'
  loop
    execute format('alter table public.crm_campaigns drop constraint %I', rec.conname);
  end loop;
end $$;

alter table public.crm_campaigns
  add constraint crm_campaigns_audience_check
  check (audience in (
    'all_members', 'association', 'welfare', 'newsletter', 'individual'
  ));
