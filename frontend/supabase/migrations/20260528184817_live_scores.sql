-- live_scores: running leaderboard written by the replay worker (service-role)
-- and read by the live /live/[matchday] page (anon Realtime).
--
-- Primary key: (matchday, wallet) — one row per participant per matchday.
-- rank is nullable until enough lineups have been scored for a full ranking.

create table public.live_scores (
  matchday  bigint      not null,
  wallet    text        not null,
  score     numeric     not null default 0,
  rank      int,
  updated_at timestamptz not null default now(),
  primary key (matchday, wallet)
);

alter table public.live_scores enable row level security;

-- Anon read (Realtime subscribe + leaderboard UI).
-- Writes are service-role only (no anon write policy).
create policy "read live_scores"
  on public.live_scores
  for select
  to anon
  using (true);
