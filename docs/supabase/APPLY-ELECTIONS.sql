-- Taunet Nelel elections: members express interest to vie for a position.
-- Run in Supabase SQL Editor. Safe to re-run.
-- Does not change Association / Welfare membership lists.

create table if not exists public.election_cycles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  opens_at timestamptz,
  closes_at timestamptz,
  is_open boolean not null default true,
  phase text not null default 'eoi'
    check (phase in ('eoi', 'nomination', 'voting', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.election_positions (
  id text primary key,
  cycle_id uuid not null references public.election_cycles (id) on delete cascade,
  board text not null check (board in ('association', 'welfare')),
  title text not null,
  seats int not null default 1,
  eligibility text not null default 'association'
    check (eligibility in ('association', 'welfare', 'either')),
  sort_order int not null default 100,
  is_open boolean not null default true
);

create table if not exists public.election_expressions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.election_cycles (id) on delete cascade,
  position_id text not null references public.election_positions (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  email text not null,
  full_name text not null,
  phone text,
  statement text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'withdrawn', 'noted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nominated boolean not null default false,
  constraint election_expressions_one_per_post
    unique (cycle_id, position_id, email)
);

create index if not exists election_expressions_cycle_idx
  on public.election_expressions (cycle_id, created_at desc);

alter table public.election_cycles enable row level security;
alter table public.election_positions enable row level security;
alter table public.election_expressions enable row level security;

revoke all on table public.election_cycles from anon, authenticated;
revoke all on table public.election_positions from anon, authenticated;
revoke all on table public.election_expressions from anon, authenticated;
grant all on table public.election_cycles to service_role;
grant all on table public.election_positions to service_role;
grant all on table public.election_expressions to service_role;

insert into public.election_cycles (slug, title, summary, opens_at, closes_at, is_open)
values (
  '2026-agm',
  'Taunet Nelel Elections 2026',
  'Elections have three stages: Expression of Interest, Nomination of those who expressed interest, then Voting.',
  now(),
  timestamptz '2026-12-31 23:59:59+11',
  true
)
on conflict (slug) do update
set
  title = excluded.title,
  summary = excluded.summary,
  is_open = election_cycles.is_open;

insert into public.election_positions (id, cycle_id, board, title, seats, eligibility, sort_order)
select v.id, c.id, v.board, v.title, v.seats, v.eligibility, v.sort_order
from public.election_cycles c
cross join (
  values
    ('assoc-president', 'association', 'President', 1, 'association', 10),
    ('assoc-vice-president', 'association', 'Vice President', 1, 'association', 20),
    ('assoc-secretary', 'association', 'Secretary', 1, 'association', 30),
    ('assoc-treasurer', 'association', 'Treasurer', 1, 'association', 40),
    ('assoc-committee', 'association', 'Ordinary committee member', 4, 'association', 50),
    ('welfare-director', 'welfare', 'Director', 1, 'welfare', 110),
    ('welfare-secretary', 'welfare', 'Secretary', 1, 'welfare', 120),
    ('welfare-treasurer', 'welfare', 'Treasurer', 1, 'welfare', 130),
    ('welfare-coordinator', 'welfare', 'Welfare Coordinator', 2, 'welfare', 140)
) as v(id, board, title, seats, eligibility, sort_order)
where c.slug = '2026-agm'
on conflict (id) do update
set
  title = excluded.title,
  seats = excluded.seats,
  eligibility = excluded.eligibility,
  sort_order = excluded.sort_order,
  is_open = true;

alter table public.election_cycles
  add column if not exists phase text not null default 'eoi';
alter table public.election_cycles
  drop constraint if exists election_cycles_phase_check;
alter table public.election_cycles
  add constraint election_cycles_phase_check
  check (phase in ('eoi', 'nomination', 'voting', 'closed'));
alter table public.election_expressions
  add column if not exists nominated boolean not null default false;

create table if not exists public.election_nominations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.election_cycles (id) on delete cascade,
  position_id text not null references public.election_positions (id) on delete cascade,
  expression_id uuid not null references public.election_expressions (id) on delete cascade,
  nominator_email text not null,
  created_at timestamptz not null default now(),
  constraint election_nominations_one_nominator
    unique (cycle_id, position_id, nominator_email)
);

create table if not exists public.election_votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.election_cycles (id) on delete cascade,
  position_id text not null references public.election_positions (id) on delete cascade,
  expression_id uuid not null references public.election_expressions (id) on delete cascade,
  voter_email text not null,
  created_at timestamptz not null default now(),
  constraint election_votes_one_choice
    unique (cycle_id, position_id, voter_email, expression_id)
);

create index if not exists election_nominations_cycle_idx
  on public.election_nominations (cycle_id, position_id);
create index if not exists election_votes_cycle_idx
  on public.election_votes (cycle_id, position_id);

alter table public.election_nominations enable row level security;
alter table public.election_votes enable row level security;
revoke all on table public.election_nominations from anon, authenticated;
revoke all on table public.election_votes from anon, authenticated;
grant all on table public.election_nominations to service_role;
grant all on table public.election_votes to service_role;

create table if not exists public.election_board (
  email text primary key,
  full_name text,
  created_at timestamptz not null default now(),
  invited_at timestamptz
);
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

select
  (select title from public.election_cycles where slug = '2026-agm') as cycle,
  (select phase from public.election_cycles where slug = '2026-agm') as phase,
  (select count(*) from public.election_positions) as positions,
  (select count(*) from public.election_expressions) as expressions,
  (select count(*) from public.election_board) as board_members;
