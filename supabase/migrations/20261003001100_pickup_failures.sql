-- 引取不可 (2026-10-03): the driver went to the 積地 but could not take the car.
--
--   1. From a car of the 配車表 the driver enters the 理由 (選択肢＋詳細) and
--      photos, presses 引取不可 and picks one person who may approve it and is
--      出勤中 on the 出勤簿 (nobody on duty → the app can't send it).
--   2. That person's app shows 「引取不可の許可を求めています」; they open it,
--      see the details and photos, and press 承認 → 引取不可 is settled.
--   3. There is no 差し戻し. Talking it over on the phone may solve it: when
--      both the driver and that person press 解決 the car is carried as usual.
--
-- Permissions, given per account in the console (both may be chosen):
--   can_approve_pickup_failure — may be picked to approve, sees every record.
--   can_view_pickup_failure    — sees every record (app and console).
-- The phone number on the profile lets the driver call the approver.

alter table public.app_accounts add column if not exists can_approve_pickup_failure boolean not null default false;
alter table public.app_accounts add column if not exists can_view_pickup_failure boolean not null default false;

-- Digits only (the console strips hyphens and spaces).
alter table public.account_profiles add column if not exists phone text
  check (phone is null or phone ~ '^\+?[0-9]{3,20}$');

create or replace function public.kyoei_can_approve_pickup()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_accounts a where a.user_id = auth.uid() and a.can_approve_pickup_failure and a.disabled_at is null);
$$;
revoke all on function public.kyoei_can_approve_pickup() from public, anon;
grant execute on function public.kyoei_can_approve_pickup() to authenticated;

create or replace function public.kyoei_can_view_pickup()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_accounts a
     where a.user_id = auth.uid() and (a.can_view_pickup_failure or a.can_approve_pickup_failure) and a.disabled_at is null
  );
$$;
revoke all on function public.kyoei_can_view_pickup() from public, anon;
grant execute on function public.kyoei_can_view_pickup() to authenticated;

-- ---------------------------------------------------------------------------
-- Records. The car's lines are copied from the sheet, so a record stays
-- readable after the sheet is deleted and by people who can't see the sheet.
-- ---------------------------------------------------------------------------
create table if not exists public.pickup_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sheet_id uuid references public.dispatch_sheets (id) on delete set null,
  sheet_title text not null default '',
  vehicle_index int not null,
  round text not null default '',
  vehicle_name text not null default '',
  chassis_number text not null default '',
  pickup text not null default '',
  pickup_ref text not null default '',
  dropoff text not null default '',
  dropoff_ref text not null default '',
  pickup_date text not null default '',
  dropoff_date text not null default '',
  reason text not null check (reason in ('no_vehicle', 'no_key', 'documents', 'damaged', 'customer', 'other')),
  detail text not null default '',
  photo_paths text[] not null default '{}',
  approver_id uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  driver_resolved_at timestamptz,
  approver_resolved_at timestamptz,
  approver_resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_at is null or resolved_at is null),
  check (reason <> 'other' or length(trim(detail)) > 0),
  check (cardinality(photo_paths) between 1 and 10)
);
create index if not exists pickup_failures_user on public.pickup_failures (user_id, created_at desc);
create index if not exists pickup_failures_created on public.pickup_failures (created_at desc);
create index if not exists pickup_failures_approver on public.pickup_failures (approver_id) where approved_at is null and resolved_at is null;
-- One open request per car of a sheet.
create unique index if not exists pickup_failures_open on public.pickup_failures (user_id, sheet_id, vehicle_index)
  where approved_at is null and resolved_at is null;

alter table public.pickup_failures enable row level security;
revoke all on public.pickup_failures from anon, authenticated;
grant select on public.pickup_failures to authenticated;
create policy "kyoei pickup failures: read own or permitted" on public.pickup_failures for select to authenticated
  using (user_id = (select auth.uid()) or (select public.kyoei_can_view_pickup()));
-- Every write goes through the functions below.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_failures') then
    alter publication supabase_realtime add table public.pickup_failures;
  end if;
end $$;

-- 'pending' | 'approved' | 'resolved'.
create or replace function public.kyoei_pickup_status(f public.pickup_failures)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when f.approved_at is not null then 'approved' when f.resolved_at is not null then 'resolved' else 'pending' end;
$$;

create or replace function public.kyoei_pickup_json(f public.pickup_failures)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id, 'user_id', f.user_id, 'driver_name', public.kyoei_person_name(f.user_id),
    'driver_phone', (select p.phone from public.account_profiles p where p.user_id = f.user_id),
    'sheet_id', f.sheet_id, 'sheet_title', f.sheet_title, 'vehicle_index', f.vehicle_index, 'round', f.round,
    'vehicle_name', f.vehicle_name, 'chassis_number', f.chassis_number,
    'pickup', f.pickup, 'pickup_ref', f.pickup_ref, 'dropoff', f.dropoff, 'dropoff_ref', f.dropoff_ref,
    'pickup_date', f.pickup_date, 'dropoff_date', f.dropoff_date,
    'reason', f.reason, 'detail', f.detail, 'photo_paths', to_jsonb(f.photo_paths),
    'approver_id', f.approver_id,
    'approver_name', case when f.approver_id is null then null else public.kyoei_person_name(f.approver_id) end,
    'approver_phone', (select p.phone from public.account_profiles p where p.user_id = f.approver_id),
    'approved_at', f.approved_at,
    'approved_by_name', case when f.approved_by is null then null else public.kyoei_person_name(f.approved_by) end,
    'driver_resolved_at', f.driver_resolved_at, 'approver_resolved_at', f.approver_resolved_at,
    'approver_resolved_by_name', case when f.approver_resolved_by is null then null else public.kyoei_person_name(f.approver_resolved_by) end,
    'resolved_at', f.resolved_at, 'status', public.kyoei_pickup_status(f),
    'created_at', f.created_at, 'updated_at', f.updated_at
  );
$$;
revoke all on function public.kyoei_pickup_json(public.pickup_failures) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Photos: bucket pickup-photos, "<driver uid>/<file>". Drivers upload and
-- read their own; people with either permission read all.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pickup-photos', 'pickup-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "kyoei pickup photos: read own or permitted" on storage.objects for select to authenticated
  using (bucket_id = 'pickup-photos' and (
    (storage.foldername(name))[1] = (select auth.uid()::text) or (select public.kyoei_can_view_pickup())
  ));
create policy "kyoei pickup photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
-- Only photos not (yet) attached to a record, e.g. after a failed send.
create policy "kyoei pickup photos: delete own unused" on storage.objects for delete to authenticated
  using (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = (select auth.uid()::text)
    and not exists (select 1 from public.pickup_failures f where f.user_id = (select auth.uid()) and name = any (f.photo_paths)));

-- ---------------------------------------------------------------------------
-- Driver
-- ---------------------------------------------------------------------------
-- Who may be picked right now: approvers 出勤中 on the 出勤簿 (not oneself).
create or replace function public.pickup_approvers_on_duty()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'name', public.kyoei_person_name(a.user_id),
      'position', pos.name, 'phone', p.phone
    ) order by coalesce(pos.sort_order, 1000), public.kyoei_person_name(a.user_id))
    from public.app_accounts a
    join public.staff_members s on s.auth_user_id = a.user_id and s.status = 'working'
    left join public.account_profiles p on p.user_id = a.user_id
    left join public.positions pos on pos.id = p.position_id
    where a.can_approve_pickup_failure and a.disabled_at is null and a.user_id <> auth.uid()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.pickup_approvers_on_duty() from public, anon;
grant execute on function public.pickup_approvers_on_duty() to authenticated;

create or replace function private.require_pickup_approver_on_duty(p_approver uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_approver is null or p_approver = auth.uid() or not exists (
    select 1 from public.app_accounts a
      join public.staff_members s on s.auth_user_id = a.user_id and s.status = 'working'
     where a.user_id = p_approver and a.can_approve_pickup_failure and a.disabled_at is null
  ) then
    raise exception 'pickup:approver' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.require_pickup_approver_on_duty(uuid) from public, anon, authenticated;

-- p_vehicle: {vehicle_index, round, vehicle_name, chassis_number, pickup,
-- pickup_ref, dropoff, dropoff_ref, pickup_date, dropoff_date}.
create or replace function public.submit_pickup_failure(
  p_sheet_id uuid, p_sheet_title text, p_vehicle jsonb, p_reason text, p_detail text, p_photo_paths text[], p_approver uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_prefix text := auth.uid()::text || '/';
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.dispatch_sheets d join public.staff_members s on s.id = d.uploaded_by_staff_id
     where d.id = p_sheet_id and s.auth_user_id = auth.uid()
  ) then
    raise exception 'pickup:sheet' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_photo_paths, '{}')) path where left(path, length(v_prefix)) <> v_prefix) then
    raise exception 'pickup:photos' using errcode = '42501';
  end if;
  perform private.require_pickup_approver_on_duty(p_approver);
  insert into public.pickup_failures (
    user_id, sheet_id, sheet_title, vehicle_index, round, vehicle_name, chassis_number,
    pickup, pickup_ref, dropoff, dropoff_ref, pickup_date, dropoff_date,
    reason, detail, photo_paths, approver_id
  ) values (
    auth.uid(), p_sheet_id, left(coalesce(p_sheet_title, ''), 200), (p_vehicle ->> 'vehicle_index')::int,
    left(coalesce(p_vehicle ->> 'round', ''), 50), left(coalesce(p_vehicle ->> 'vehicle_name', ''), 200),
    left(coalesce(p_vehicle ->> 'chassis_number', ''), 50),
    left(coalesce(p_vehicle ->> 'pickup', ''), 300), left(coalesce(p_vehicle ->> 'pickup_ref', ''), 50),
    left(coalesce(p_vehicle ->> 'dropoff', ''), 300), left(coalesce(p_vehicle ->> 'dropoff_ref', ''), 50),
    left(coalesce(p_vehicle ->> 'pickup_date', ''), 20), left(coalesce(p_vehicle ->> 'dropoff_date', ''), 20),
    p_reason, left(trim(coalesce(p_detail, '')), 2000), coalesce(p_photo_paths, '{}'), p_approver
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'pickup:open' using errcode = '22023';
end;
$$;
revoke all on function public.submit_pickup_failure(uuid, text, jsonb, text, text, text[], uuid) from public, anon;
grant execute on function public.submit_pickup_failure(uuid, text, jsonb, text, text, text[], uuid) to authenticated;

-- The picked person went home or doesn't answer: ask someone else on duty.
create or replace function public.reassign_pickup_failure(p_id uuid, p_approver uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_pickup_approver_on_duty(p_approver);
  update public.pickup_failures f
     set approver_id = p_approver, approver_resolved_at = null, approver_resolved_by = null, updated_at = now()
   where f.id = p_id and f.user_id = auth.uid() and f.approved_at is null and f.resolved_at is null;
  if not found then
    raise exception 'pickup:closed' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.reassign_pickup_failure(uuid, uuid) from public, anon;
grant execute on function public.reassign_pickup_failure(uuid, uuid) to authenticated;

-- The driver's own records (all, or one sheet's), with the approver's name and phone.
create or replace function public.my_pickup_failures(p_sheet_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.kyoei_pickup_json(f) order by f.created_at desc)
      from public.pickup_failures f
     where f.user_id = auth.uid() and (p_sheet_id is null or f.sheet_id = p_sheet_id)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_pickup_failures(uuid) from public, anon;
grant execute on function public.my_pickup_failures(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Approver / viewer (app and console)
-- ---------------------------------------------------------------------------
-- Requests waiting for the caller's answer — polled while the app is open.
create or replace function public.pickup_requests_for_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_can_approve_pickup() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.kyoei_pickup_json(f) order by f.created_at)
      from public.pickup_failures f
     where f.approver_id = auth.uid() and f.approved_at is null and f.resolved_at is null
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.pickup_requests_for_me() from public, anon;
grant execute on function public.pickup_requests_for_me() to authenticated;

-- Everything, newest first (open ones are always included).
create or replace function public.pickup_failure_board(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_can_view_pickup() then
    raise exception 'pickup viewers only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.kyoei_pickup_json(f) order by f.created_at desc)
      from public.pickup_failures f
     where f.id in (
       select g.id from public.pickup_failures g
        where (g.approved_at is null and g.resolved_at is null)
           or ((p_from is null or (g.created_at at time zone 'Asia/Tokyo')::date >= p_from)
               and (p_to is null or (g.created_at at time zone 'Asia/Tokyo')::date <= p_to))
        order by g.created_at desc
        limit 1000
     )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.pickup_failure_board(date, date) from public, anon;
grant execute on function public.pickup_failure_board(date, date) to authenticated;

create or replace function public.approve_pickup_failure(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_can_approve_pickup() then
    raise exception 'pickup approvers only' using errcode = '42501';
  end if;
  update public.pickup_failures f
     set approved_by = auth.uid(), approved_at = now(), updated_at = now()
   where f.id = p_id and f.approver_id = auth.uid() and f.approved_at is null and f.resolved_at is null;
  if not found then
    raise exception 'pickup:closed' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.approve_pickup_failure(uuid) from public, anon;
grant execute on function public.approve_pickup_failure(uuid) to authenticated;

-- 解決: the driver and the picked approver each press it; once both have,
-- the car is carried as usual. Pressing again takes one's own press back.
create or replace function public.resolve_pickup_failure(p_id uuid, p_resolved boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.pickup_failures;
  v_at timestamptz := case when p_resolved then now() end;
begin
  select * into f from public.pickup_failures where id = p_id for update;
  if not found or f.approved_at is not null or f.resolved_at is not null then
    raise exception 'pickup:closed' using errcode = '22023';
  end if;
  if f.user_id = auth.uid() then
    f.driver_resolved_at := v_at;
  elsif f.approver_id = auth.uid() and public.kyoei_can_approve_pickup() then
    f.approver_resolved_at := v_at;
    f.approver_resolved_by := case when p_resolved then auth.uid() end;
  else
    raise exception 'pickup:not yours' using errcode = '42501';
  end if;
  update public.pickup_failures
     set driver_resolved_at = f.driver_resolved_at,
         approver_resolved_at = f.approver_resolved_at,
         approver_resolved_by = f.approver_resolved_by,
         resolved_at = case when f.driver_resolved_at is not null and f.approver_resolved_at is not null then now() end,
         updated_at = now()
   where id = p_id;
  return case when f.driver_resolved_at is not null and f.approver_resolved_at is not null then 'resolved' else 'pending' end;
end;
$$;
revoke all on function public.resolve_pickup_failure(uuid, boolean) from public, anon;
grant execute on function public.resolve_pickup_failure(uuid, boolean) to authenticated;
