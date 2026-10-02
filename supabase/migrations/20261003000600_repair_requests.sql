-- 修理申請 (車両修理依頼書). Flow agreed 2026-10-03:
--   1. The driver reports it in the app (症状・状況, 原因, 修理希望日, 早急に／
--      出来るだけ早く, photos) and may edit or withdraw it until the 社長 stamps.
--   2. The 社長 checks it and decides 自社整備 or 外注 (依頼先), enters 修理依頼日
--      and 入庫予定日 and stamps (社長印). The driver is told in the app.
--   3. 整備 (new 役職) records 作業内容, 修理完了日 and the 伝票 photos and
--      stamps (担当印).
-- Requests are visible to the driver who made them and to MFA-verified admins.

insert into public.positions (id, name, sort_order) values ('maintenance', '整備', 85)
on conflict (id) do nothing;

create table if not exists public.repair_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported_on date not null default ((now() at time zone 'Asia/Tokyo')::date),
  vehicle_class text,
  head_plate text not null default '',
  chassis_plate text,
  part text not null check (part in ('head', 'chassis')),
  symptom text not null check (length(trim(symptom)) > 0),
  cause text not null default '',
  desired_on date,
  urgency text not null check (urgency in ('urgent', 'asap')),
  photo_paths text[] not null default '{}',
  inspection_id uuid references public.vehicle_inspections (id) on delete set null,
  withdrawn_at timestamptz,
  -- 社長
  method text check (method in ('in_house', 'outsource')),
  vendor text,
  requested_on date,
  entry_on date,
  president_note text not null default '',
  president_stamped_by uuid references auth.users (id) on delete set null,
  president_stamped_at timestamptz,
  -- 整備（担当）
  work_done text not null default '',
  completed_on date,
  slip_paths text[] not null default '{}',
  maintenance_stamped_by uuid references auth.users (id) on delete set null,
  maintenance_stamped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (president_stamped_at is null or (method is not null and entry_on is not null and (method = 'in_house' or length(trim(coalesce(vendor, ''))) > 0)))
);
create index if not exists repair_requests_user on public.repair_requests (user_id, created_at desc);
create index if not exists repair_requests_created on public.repair_requests (created_at desc);

alter table public.repair_requests enable row level security;
revoke all on public.repair_requests from anon, authenticated;
grant select, insert on public.repair_requests to authenticated;
create policy "kyoei repairs: read own or admin" on public.repair_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_kyoei_admin_mfa()));
-- A new request carries only the driver's part.
create policy "kyoei repairs: add own" on public.repair_requests for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.kyoei_account_enabled())
    and method is null and vendor is null and requested_on is null and entry_on is null
    and president_stamped_at is null and president_stamped_by is null
    and work_done = '' and completed_on is null and slip_paths = '{}'
    and maintenance_stamped_at is null and maintenance_stamped_by is null and withdrawn_at is null
  );

-- Driver: edit (or withdraw) until the 社長 stamps.
create or replace function public.update_repair_request(
  p_id uuid, p_part text, p_symptom text, p_cause text, p_desired_on date, p_urgency text, p_photo_paths text[], p_withdraw boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  update public.repair_requests r
     set part = p_part, symptom = left(trim(p_symptom), 4000), cause = left(trim(coalesce(p_cause, '')), 4000),
         desired_on = p_desired_on, urgency = p_urgency, photo_paths = coalesce(p_photo_paths, '{}'),
         withdrawn_at = case when p_withdraw then now() end, updated_at = now()
   where r.id = p_id and r.user_id = auth.uid() and r.president_stamped_at is null and r.withdrawn_at is null;
  if not found then
    raise exception 'locked' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.update_repair_request(uuid, text, text, text, date, text, text[], boolean) from public, anon;
grant execute on function public.update_repair_request(uuid, text, text, text, date, text, text[], boolean) to authenticated;

create or replace function public.kyoei_has_position(p_position text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_profiles p where p.user_id = auth.uid() and p.position_id = p_position);
$$;
revoke all on function public.kyoei_has_position(text) from public, anon;
grant execute on function public.kyoei_has_position(text) to authenticated;

-- 社長: decide 自社整備／外注, the dates, and stamp. Can be corrected later.
create or replace function public.president_decide_repair(
  p_id uuid, p_method text, p_vendor text, p_requested_on date, p_entry_on date, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() or not public.kyoei_has_position('president') then
    raise exception 'president only' using errcode = '42501';
  end if;
  if p_method not in ('in_house', 'outsource') or p_entry_on is null
     or (p_method = 'outsource' and length(trim(coalesce(p_vendor, ''))) = 0) then
    raise exception 'method, vendor and entry date required' using errcode = '22023';
  end if;
  update public.repair_requests r
     set method = p_method, vendor = case when p_method = 'outsource' then trim(p_vendor) end,
         requested_on = p_requested_on, entry_on = p_entry_on, president_note = left(trim(coalesce(p_note, '')), 2000),
         president_stamped_by = auth.uid(), president_stamped_at = coalesce(r.president_stamped_at, now()), updated_at = now()
   where r.id = p_id and r.withdrawn_at is null;
  if not found then
    raise exception 'not found' using errcode = '22023';
  end if;
  perform public.log_admin_action('repairs', (select r.head_plate || coalesce(' ／ ' || r.chassis_plate, '') from public.repair_requests r where r.id = p_id),
    'president_decide_repair', jsonb_build_object('method', p_method, 'vendor', p_vendor, 'entry_on', p_entry_on));
end;
$$;
revoke all on function public.president_decide_repair(uuid, text, text, date, date, text) from public, anon;
grant execute on function public.president_decide_repair(uuid, text, text, date, date, text) to authenticated;

-- 整備（担当）: 作業内容・修理完了日・伝票, and stamp. The 社長 may record it too.
create or replace function public.maintenance_complete_repair(
  p_id uuid, p_work_done text, p_completed_on date, p_slip_paths text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() or not (public.kyoei_has_position('maintenance') or public.kyoei_has_position('president')) then
    raise exception 'maintenance only' using errcode = '42501';
  end if;
  update public.repair_requests r
     set work_done = left(trim(coalesce(p_work_done, '')), 4000), completed_on = p_completed_on,
         slip_paths = coalesce(p_slip_paths, '{}'),
         maintenance_stamped_by = case when p_completed_on is null then null else auth.uid() end,
         maintenance_stamped_at = case when p_completed_on is null then null else coalesce(r.maintenance_stamped_at, now()) end,
         updated_at = now()
   where r.id = p_id and r.president_stamped_at is not null and r.withdrawn_at is null;
  if not found then
    raise exception 'decide first' using errcode = '22023';
  end if;
  perform public.log_admin_action('repairs', (select r.head_plate || coalesce(' ／ ' || r.chassis_plate, '') from public.repair_requests r where r.id = p_id),
    'maintenance_complete_repair', jsonb_build_object('completed_on', p_completed_on));
end;
$$;
revoke all on function public.maintenance_complete_repair(uuid, text, date, text[]) from public, anon;
grant execute on function public.maintenance_complete_repair(uuid, text, date, text[]) to authenticated;

-- Photos: bucket repair-photos. Drivers under "<auth uid>/", 伝票 under
-- "slips/" by admins; drivers read their own folder, admins read all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repair-photos', 'repair-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "kyoei repair photos: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'repair-photos' and (
    (storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_kyoei_admin_mfa())
  ));
create policy "kyoei repair photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'repair-photos' and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or ((storage.foldername(name))[1] = 'slips' and (select public.is_kyoei_admin_mfa()))
  ));
create policy "kyoei repair photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'repair-photos' and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or ((storage.foldername(name))[1] = 'slips' and (select public.is_kyoei_admin_mfa()))
  ));
