-- Tag each push subscription with the device that created it, so
-- device-targeted pushes (driving-timer notifications) can be sent to a
-- single device instead of broadcasting to everyone.
alter table public.push_subscriptions
  add column if not exists device_id text;

create unique index if not exists push_subscriptions_device_id_key
  on public.push_subscriptions (device_id)
  where device_id is not null;

-- Server-side mirror of each device's in-progress 運行状況 (driving status)
-- trip, so a scheduled job can detect threshold crossings and push a
-- notification even while that device's app is fully closed. Anchored on
-- timestamps (not a running counter) so live elapsed time can be derived
-- at any moment, matching the client's lib/trip-log.ts semantics.
create table if not exists public.driving_sessions (
  device_id text primary key,
  trip_started_at timestamptz not null,
  segment_started_at timestamptz not null,
  active_category text not null,
  continuous_driving_ms bigint not null default 0,
  continuous_driving_running boolean not null default true,
  break_timer_ms bigint not null default 0,
  break_timer_running boolean not null default false,
  break_satisfied boolean not null default false,
  fired_rule_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.driving_sessions enable row level security;

-- No auth in this app - every device's data is shared/open, same
-- convention as push_subscriptions and push_notification_rules.
drop policy if exists "Allow all access to driving_sessions" on public.driving_sessions;
create policy "Allow all access to driving_sessions"
  on public.driving_sessions
  for all
  using (true)
  with check (true);;
