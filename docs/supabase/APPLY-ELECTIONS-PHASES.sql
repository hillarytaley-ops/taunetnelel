-- Three election stages: EOI, nomination (from EOI list), then voting.
-- Run this if APPLY-ELECTIONS.sql was already applied before phases existed.
-- Safe to re-run. New installs can run APPLY-ELECTIONS.sql only.

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

update public.election_cycles
set
  summary = 'Elections have three stages: Expression of Interest, Nomination of those who expressed interest, then Voting.',
  phase = coalesce(nullif(phase, ''), 'eoi')
where slug = '2026-agm';

select slug, phase, is_open from public.election_cycles where slug = '2026-agm';
