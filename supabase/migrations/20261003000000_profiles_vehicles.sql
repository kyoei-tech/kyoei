-- マイページのプロフィール: 役職 (positions), 車両 (vehicles) and each
-- account's profile (account_profiles), all entered from the admin console.
-- The app reads the signed-in user's own profile through my_profile().

-- ---------------------------------------------------------------------------
-- 役職. What each position may do is decided later (permissions).
-- ---------------------------------------------------------------------------
create table if not exists public.positions (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name text not null unique,
  sort_order int not null default 0,
  permissions jsonb not null default '{}'::jsonb
);

insert into public.positions (id, name, sort_order) values
  ('system_admin', 'システム管理者', 10),
  ('president', '社長', 20),
  ('transport_director', '運輸部長', 30),
  ('safety_manager', '安全指導教育課長', 40),
  ('transport_manager', '運輸課長', 50),
  ('business_manager', '業務推進課長', 60),
  ('assistant_manager', '課長補佐', 70),
  ('yard', 'ヤード管理', 80),
  ('part_time', 'アルバイト', 90),
  ('llc', '合同会社', 100)
on conflict (id) do nothing;

alter table public.positions enable row level security;
revoke all on public.positions from anon;
grant select, insert, update, delete on public.positions to authenticated;
create policy "kyoei positions: read" on public.positions for select to authenticated using (true);
create policy "kyoei positions: admin write" on public.positions for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

-- ---------------------------------------------------------------------------
-- 車両: a truck (単車), a tractor head (ヘッド) or a trailer chassis (台車),
-- each with its 車検期限 and the next 3ヶ月点検 / 12ヶ月点検, which the office
-- enters each time.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique check (length(trim(plate)) > 0),
  kind text not null check (kind in ('truck', 'head', 'chassis')),
  shaken_due date,
  inspection_3m_due date,
  inspection_12m_due date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;
revoke all on public.vehicles from anon;
grant select, insert, update, delete on public.vehicles to authenticated;
create policy "kyoei vehicles: admin" on public.vehicles for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

-- ---------------------------------------------------------------------------
-- プロフィール. vehicle_id is the truck or the head; chassis_id the trailer's
-- 台車. Both may be empty (新人: 未定).
-- ---------------------------------------------------------------------------
create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  position_id text references public.positions (id) on delete set null,
  hire_date date,
  vehicle_class text check (vehicle_class in (
    'loader', 'two_car', 'heavy', 'three_car', 'five_car',
    'trailer_hanging', 'trailer_lifter', 'cab_trailer_hanging', 'cab_trailer_lifter'
  )),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  chassis_id uuid references public.vehicles (id) on delete set null,
  health_check_due date,
  updated_at timestamptz not null default now()
);

-- A vehicle is assigned to at most one person (no sharing for now).
create unique index if not exists account_profiles_vehicle on public.account_profiles (vehicle_id) where vehicle_id is not null;
create unique index if not exists account_profiles_chassis on public.account_profiles (chassis_id) where chassis_id is not null;

alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from anon;
grant select, insert, update, delete on public.account_profiles to authenticated;
create policy "kyoei profiles: read own" on public.account_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "kyoei profiles: admin" on public.account_profiles for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

-- The signed-in user's profile with position and vehicles, for マイページ.
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
    'health_check_due', p.health_check_due,
    'vehicle', case when v.id is null then null else jsonb_build_object('plate', v.plate, 'kind', v.kind, 'shaken_due', v.shaken_due, 'inspection_3m_due', v.inspection_3m_due, 'inspection_12m_due', v.inspection_12m_due) end,
    'chassis', case when c.id is null then null else jsonb_build_object('plate', c.plate, 'kind', c.kind, 'shaken_due', c.shaken_due, 'inspection_3m_due', c.inspection_3m_due, 'inspection_12m_due', c.inspection_12m_due) end
  )
  from public.app_accounts a
  left join public.account_profiles p on p.user_id = a.user_id
  left join public.positions pos on pos.id = p.position_id
  left join public.vehicles v on v.id = p.vehicle_id
  left join public.vehicles c on c.id = p.chassis_id
  where a.user_id = auth.uid() and a.disabled_at is null;
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
