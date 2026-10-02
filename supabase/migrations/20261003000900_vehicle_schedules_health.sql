-- 車両管理・健康診断・社員管理 (2026-10-03):
--   * 車両 is registered with ナンバー and 車格 only (head/台車 for trailers).
--   * 3ヶ月点検・12ヶ月点検・車検 are booked each time and entered as
--     reservations (date, time, place, 共栄持込 or ○○引取, 特記事項).
--   * 健康診断 reservations per employee (年1回, or 年2回 for some).
--   * 運行履歴 rows now record the account, for the 社員管理 calendar.

-- ---------------------------------------------------------------------------
-- 車両: 車格
-- ---------------------------------------------------------------------------
alter table public.vehicles add column if not exists vehicle_class text check (vehicle_class in (
  'loader', 'two_car', 'heavy', 'three_car', 'five_car',
  'trailer_hanging', 'trailer_lifter', 'cab_trailer_hanging', 'cab_trailer_lifter'
));
-- Fill in from whoever has the vehicle today.
update public.vehicles v set vehicle_class = p.vehicle_class
  from public.account_profiles p
 where v.vehicle_class is null and p.vehicle_class is not null and (p.vehicle_id = v.id or p.chassis_id = v.id);

-- ---------------------------------------------------------------------------
-- 点検・車検の予約
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_schedules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind text not null check (kind in ('inspection_3m', 'inspection_12m', 'shaken')),
  scheduled_on date not null,
  scheduled_time text not null default '' check (scheduled_time = '' or scheduled_time ~ '^\d{1,2}:\d{2}$'),
  place text not null default '',
  -- 共栄持込 (bring) or ○○引取 (pickup by vendor).
  handover text not null default 'bring' check (handover in ('bring', 'pickup')),
  vendor text not null default '',
  notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (handover = 'bring' or length(trim(vendor)) > 0)
);
create index if not exists vehicle_schedules_vehicle on public.vehicle_schedules (vehicle_id, scheduled_on);

alter table public.vehicle_schedules enable row level security;
revoke all on public.vehicle_schedules from anon, authenticated;
grant select, insert, update, delete on public.vehicle_schedules to authenticated;
create policy "kyoei vehicle schedules: admin" on public.vehicle_schedules for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

-- The old single due dates become reservations without details.
insert into public.vehicle_schedules (vehicle_id, kind, scheduled_on)
select id, 'inspection_3m', inspection_3m_due from public.vehicles where inspection_3m_due is not null
union all select id, 'inspection_12m', inspection_12m_due from public.vehicles where inspection_12m_due is not null
union all select id, 'shaken', shaken_due from public.vehicles where shaken_due is not null;
update public.vehicles set inspection_3m_due = null, inspection_12m_due = null, shaken_due = null;

-- ---------------------------------------------------------------------------
-- 健康診断
-- ---------------------------------------------------------------------------
alter table public.account_profiles add column if not exists health_checks_per_year int not null default 1
  check (health_checks_per_year in (1, 2));

create table if not exists public.health_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scheduled_on date not null,
  scheduled_time text not null default '' check (scheduled_time = '' or scheduled_time ~ '^\d{1,2}:\d{2}$'),
  place text not null default '',
  notes text not null default '',
  completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists health_checks_user on public.health_checks (user_id, scheduled_on desc);

alter table public.health_checks enable row level security;
revoke all on public.health_checks from anon, authenticated;
grant select, insert, update, delete on public.health_checks to authenticated;
create policy "kyoei health checks: admin" on public.health_checks for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

insert into public.health_checks (user_id, scheduled_on)
select user_id, health_check_due from public.account_profiles where health_check_due is not null;
update public.account_profiles set health_check_due = null;

-- ---------------------------------------------------------------------------
-- 運行履歴: whose trip (new rows; older ones stay per device only).
-- ---------------------------------------------------------------------------
alter table public.trip_history add column if not exists user_id uuid default auth.uid() references auth.users (id) on delete set null;
create index if not exists trip_history_user_departed on public.trip_history (user_id, departed_at desc);

-- ---------------------------------------------------------------------------
-- マイページ: the profile with each vehicle's upcoming reservations and the
-- next 健康診断.
-- ---------------------------------------------------------------------------
create or replace function public.kyoei_vehicle_json(p_vehicle uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when v.id is null then null else jsonb_build_object(
    'plate', v.plate, 'kind', v.kind, 'vehicle_class', v.vehicle_class,
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'scheduled_on', s.scheduled_on, 'scheduled_time', s.scheduled_time,
        'place', s.place, 'handover', s.handover, 'vendor', s.vendor, 'notes', s.notes) order by s.scheduled_on)
      from public.vehicle_schedules s
      where s.vehicle_id = v.id and s.completed_at is null
        and s.scheduled_on >= (now() at time zone 'Asia/Tokyo')::date - 7
    ), '[]'::jsonb)
  ) end
  from (select p_vehicle as id) x left join public.vehicles v on v.id = x.id;
$$;
revoke all on function public.kyoei_vehicle_json(uuid) from public, anon, authenticated;

create or replace function public.my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'login_id', a.login_id,
    'full_name', coalesce(p.full_name, ''),
    'position', pos.name,
    'hire_date', p.hire_date,
    'vehicle_class', p.vehicle_class,
    'vehicle', public.kyoei_vehicle_json(p.vehicle_id),
    'chassis', public.kyoei_vehicle_json(p.chassis_id),
    'health_check', (
      select jsonb_build_object('id', h.id, 'scheduled_on', h.scheduled_on, 'scheduled_time', h.scheduled_time, 'place', h.place, 'notes', h.notes)
        from public.health_checks h
       where h.user_id = a.user_id and h.completed_on is null
         and h.scheduled_on >= (now() at time zone 'Asia/Tokyo')::date - 7
       order by h.scheduled_on limit 1),
    'last_health_check', (select max(h.completed_on) from public.health_checks h where h.user_id = a.user_id)
  )
  from public.app_accounts a
  left join public.account_profiles p on p.user_id = a.user_id
  left join public.positions pos on pos.id = p.position_id
  where a.user_id = auth.uid() and a.disabled_at is null;
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
