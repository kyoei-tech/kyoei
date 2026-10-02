-- Lets the server-side driving-timer-check job dedupe rule fires against
-- the same "occurrence" the client's own tickNotifyState logic uses:
-- continuous_streak_started_at pins the current 連続走行時間 streak (reset
-- to now() at trip start and at 走行再開 after a satisfying break),
-- break_satisfied_at pins the moment 累計休憩時間 last auto-reset to true
-- (null while false). Neither needs a default backfill value since rows
-- only ever exist for a currently-open trip.
alter table public.driving_sessions
  add column if not exists continuous_streak_started_at timestamptz not null default now(),
  add column if not exists break_satisfied_at timestamptz;;
