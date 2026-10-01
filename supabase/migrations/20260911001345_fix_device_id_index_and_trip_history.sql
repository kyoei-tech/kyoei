-- Replace the earlier partial unique index with a plain unique index so
-- supabase-js's `.upsert(..., { onConflict: 'device_id' })` (which cannot
-- express a partial WHERE clause) can target it directly. A plain unique
-- index still allows multiple NULLs (legacy rows with no device_id yet).
drop index if exists public.push_subscriptions_device_id_key;
create unique index if not exists push_subscriptions_device_id_key
  on public.push_subscriptions (device_id);

-- Completed-trip history (出庫→帰庫), scoped per device since this app has
-- no login. Powers the 運行履歴 review page; the 休息時間 between two trips
-- is simply the gap between one trip's returned_at and the next trip's
-- departed_at, so no separate rest-period table is needed.
create table if not exists public.trip_history (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  departed_at timestamptz not null,
  returned_at timestamptz not null,
  driving_ms bigint not null default 0,
  loading_ms bigint not null default 0,
  unloading_ms bigint not null default 0,
  waiting_ms bigint not null default 0,
  resting_ms bigint not null default 0,
  split_rest_remaining_ms bigint,
  created_at timestamptz not null default now()
);

create index if not exists trip_history_device_departed_idx
  on public.trip_history (device_id, departed_at desc);

alter table public.trip_history enable row level security;

drop policy if exists "Allow all access to trip_history" on public.trip_history;
create policy "Allow all access to trip_history"
  on public.trip_history
  for all
  using (true)
  with check (true);;
