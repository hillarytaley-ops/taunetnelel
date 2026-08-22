-- Election board: returning officers who run EOI, nomination, and voting.
-- Committee admin onboards them from Admin → Election board.
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.election_board (
  email text primary key,
  full_name text,
  created_at timestamptz not null default now(),
  invited_at timestamptz
);

update public.election_board
set email = lower(trim(email))
where email <> lower(trim(email));

alter table public.election_board enable row level security;
revoke all on table public.election_board from anon, authenticated;
grant all on table public.election_board to service_role;
grant select on table public.election_board to authenticated;

drop policy if exists "Users can read own election_board row" on public.election_board;
create policy "Users can read own election_board row"
  on public.election_board
  for select
  to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.is_election_board()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(
    auth.jwt() ->> 'email',
    auth.email()::text,
    ''
  )));
  if v_email = '' then
    return false;
  end if;
  return exists (
    select 1 from public.election_board b where b.email = v_email
  );
end;
$$;

revoke all on function public.is_election_board() from public;
grant execute on function public.is_election_board() to authenticated, anon;

select email, full_name, invited_at from public.election_board order by full_name, email;
