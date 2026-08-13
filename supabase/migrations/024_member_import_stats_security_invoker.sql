-- Fix linter 0010_security_definer_view on public.member_import_stats.
-- Recreate as SECURITY INVOKER so RLS on member_imports applies to the caller.
-- Admin API reads this via service_role only.

drop view if exists public.member_import_stats;

create view public.member_import_stats
with (security_invoker = true) as
select
  count(*) as total,
  count(*) filter (where association_member and not welfare_member) as association_only,
  count(*) filter (where welfare_member and not association_member) as welfare_only,
  count(*) filter (where association_member and welfare_member) as association_and_welfare,
  count(*) filter (where association_member) as association_member_total,
  count(*) filter (where welfare_member) as welfare_member_total,
  count(*) filter (where status = 'pending_invite') as pending_invite,
  count(*) filter (where phone is not null and phone <> '') as with_phone
from public.member_imports;

revoke all on public.member_import_stats from public, anon, authenticated;
grant select on public.member_import_stats to service_role;
