-- cursor: per-contract last indexed block
create table public.indexer_cursor (
  contract text primary key,
  last_block bigint not null default 0
);

-- raw idempotency ledger
create table public.events (
  tx_hash text not null,
  log_index int not null,
  block_number bigint not null,
  contract text not null,
  name text not null,
  args jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);

create table public.cards (
  token_id numeric(78,0) primary key,
  player_id text not null,
  tier smallint not null,
  serial_number bigint not null,
  mint_batch bigint not null,
  owner text not null,
  user_addr text,
  user_expires bigint not null default 0,
  original_buyer text not null,
  updated_block bigint not null
);
create index on public.cards (owner);
create index on public.cards (player_id);
create index on public.cards (tier);

create table public.marketplace_listings (
  token_id numeric(78,0) primary key,
  seller text not null,
  price numeric(78,0) not null,
  active boolean not null default true,
  updated_block bigint not null
);

create table public.rental_listings (
  token_id numeric(78,0) primary key,
  owner text not null,
  mode smallint not null,
  price_value numeric(78,0) not null,
  active boolean not null default true,
  updated_block bigint not null
);

create table public.rentals (
  matchday bigint not null,
  token_id numeric(78,0) not null,
  renter text not null,
  owner text not null,
  paid numeric(78,0) not null,
  settled boolean not null default false,
  updated_block bigint not null,
  primary key (matchday, token_id)
);

create table public.packs (
  commit_id numeric(78,0) primary key,
  buyer text not null,
  pack_type smallint not null,
  opened boolean not null default false,
  revealed_token_ids numeric(78,0)[] ,
  updated_block bigint not null
);

create table public.lineups (
  matchday bigint not null,
  wallet text not null,
  token_ids numeric(78,0)[] not null,
  formation smallint not null,
  captain_idx smallint not null,
  vice_idx smallint not null,
  chip_id smallint not null,
  committed_block bigint not null,
  primary key (matchday, wallet)
);

create table public.contests (
  contest_id numeric(78,0) primary key,
  matchday bigint not null,
  entry_fee numeric(78,0) not null,
  rake_bps int not null,
  min_tier smallint not null,
  pool numeric(78,0) not null default 0,
  rake_taken boolean not null default false,
  updated_block bigint not null
);

create table public.contest_entries (
  contest_id numeric(78,0) not null,
  wallet text not null,
  entered_block bigint not null,
  primary key (contest_id, wallet)
);

create table public.match_events (
  matchday bigint not null,
  fixture_id bigint not null,
  player_key text not null,
  raw jsonb not null,
  events jsonb not null,
  primary key (matchday, fixture_id, player_key)
);

create table public.score_roots (
  matchday bigint primary key,
  score_root text not null,
  dnp_root text not null,
  finalized_block bigint not null
);

create table public.payout_roots (
  contest_id numeric(78,0) primary key,
  root text not null,
  finalized_block bigint not null
);

create table public.scores (
  matchday bigint not null,
  wallet text not null,
  contest_id numeric(78,0),
  score numeric not null,
  rank int,
  payout numeric(78,0) not null default 0,
  proof text[] not null default '{}',
  primary key (matchday, wallet, contest_id)
);

create table public.onboarded (
  wallet text primary key,
  tx_hash text not null,
  created_at timestamptz not null default now()
);

-- dispute / disagreement reports (FR-T4): anyone may FILE; only service-role reads/triages
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  wallet text,
  matchday bigint,
  contest_id numeric(78,0),
  kind text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- identical-lineup-across-wallets flags for manual review (FR-CT10)
create table public.lineup_flags (
  matchday bigint not null,
  lineup_hash text not null,
  wallets text[] not null,
  created_at timestamptz not null default now(),
  primary key (matchday, lineup_hash)
);

-- unclaimed-prize rollover ledger (FR-CT8)
create table public.contest_rollover (
  contest_id numeric(78,0) primary key,
  unclaimed numeric(78,0) not null,
  claim_deadline timestamptz not null,
  rolled_into_contest_id numeric(78,0),
  status text not null default 'pending',
  computed_block bigint not null
);

-- RLS: enable on EVERY table in public
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- public read policies (browse / leaderboard / transparency)
create policy "read cards" on public.cards for select to anon using (true);
create policy "read mkt" on public.marketplace_listings for select to anon using (true);
create policy "read rentlist" on public.rental_listings for select to anon using (true);
create policy "read rentals" on public.rentals for select to anon using (true);
create policy "read packs" on public.packs for select to anon using (true);
create policy "read lineups" on public.lineups for select to anon using (true);
create policy "read contests" on public.contests for select to anon using (true);
create policy "read entries" on public.contest_entries for select to anon using (true);
create policy "read scores" on public.scores for select to anon using (true);
create policy "read score_roots" on public.score_roots for select to anon using (true);
create policy "read payout_roots" on public.payout_roots for select to anon using (true);
create policy "read match_events" on public.match_events for select to anon using (true);
create policy "read lineup_flags" on public.lineup_flags for select to anon using (true);
create policy "read rollover" on public.contest_rollover for select to anon using (true);
-- disputes: anyone may FILE (insert), only service-role reads/triages
create policy "file disputes" on public.disputes for insert to anon with check (char_length(message) between 1 and 4000);
-- NOTE: indexer_cursor, events, onboarded, and disputes-SELECT have RLS enabled with NO anon read policy -> service-role only.
