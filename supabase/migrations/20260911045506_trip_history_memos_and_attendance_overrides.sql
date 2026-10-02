-- Per-trip memo fields (工程 / 渋滞区間 / 自由欄) editable via double-tap on a trip card.
alter table public.trip_history
  add column if not exists process_memo text,
  add column if not exists traffic_memo text,
  add column if not exists free_memo text;

-- Manual overrides for the attendance calendar (出勤日を1日前後にシフト / 休日の文言編集・削除).
-- day (date) is the calendar cell being overridden, scoped per device like trip_history.
create table if not exists public.attendance_day_overrides (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  day date not null,
  kind text not null check (kind in ('workday_shift', 'holiday_label', 'holiday_removed')),
  shift_days integer,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, day)
);

alter table public.attendance_day_overrides enable row level security;

create policy "Allow all access to attendance_day_overrides"
  on public.attendance_day_overrides
  for all
  using (true)
  with check (true);

alter publication supabase_realtime add table public.attendance_day_overrides;;
