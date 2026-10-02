-- 休暇申請 (休暇届). Agreed 2026-10-03:
--   * Drivers apply in the app at least notice_days (7) ahead; categories
--     私用・慶弔休暇・通院（内容）・その他（理由）; optionally 有給.
--   * A day can take at most the day's limit (default, overridable per date).
--   * Too close, or a full day → the app says 「事務所に問い合わせてください」;
--     after talking it over, a 担当者 grants an exception for those dates and
--     the driver can then apply.
--   * 担当者 (accounts flagged can_check_leave, apart from 役職) 確認 requests.
--     There is no rejection — not by 担当者 and not by the office.
--   * The driver may edit or withdraw until it's 確認済み.
--   * 有給: auto grants from 入社年月日 by the statutory table (6 months 10日 …
--     6.5 years 20日), valid 2 years, used oldest-first; part-timers and
--     corrections are entered by hand in the console.

alter table public.app_accounts add column if not exists can_check_leave boolean not null default false;

create or replace function public.kyoei_is_leave_checker()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_accounts a where a.user_id = auth.uid() and a.can_check_leave and a.disabled_at is null);
$$;
revoke all on function public.kyoei_is_leave_checker() from public, anon;
grant execute on function public.kyoei_is_leave_checker() to authenticated;

-- ---------------------------------------------------------------------------
-- Settings and per-day limits (console).
-- ---------------------------------------------------------------------------
create table if not exists public.leave_settings (
  id boolean primary key default true check (id),
  notice_days int not null default 7 check (notice_days between 0 and 60),
  default_daily_limit int check (default_daily_limit is null or default_daily_limit >= 0),
  updated_at timestamptz not null default now()
);
insert into public.leave_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.leave_day_limits (
  day date primary key,
  max_people int not null check (max_people >= 0),
  note text not null default ''
);

alter table public.leave_settings enable row level security;
alter table public.leave_day_limits enable row level security;
revoke all on public.leave_settings, public.leave_day_limits from anon;
grant select, insert, update, delete on public.leave_settings, public.leave_day_limits to authenticated;
create policy "kyoei leave settings: read" on public.leave_settings for select to authenticated using ((select public.kyoei_account_enabled()));
create policy "kyoei leave settings: admin" on public.leave_settings for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));
create policy "kyoei leave limits: read" on public.leave_day_limits for select to authenticated using ((select public.kyoei_account_enabled()));
create policy "kyoei leave limits: admin" on public.leave_day_limits for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

-- ---------------------------------------------------------------------------
-- Requests, exceptions, 有給.
-- ---------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  filed_on date not null default ((now() at time zone 'Asia/Tokyo')::date),
  start_on date not null,
  end_on date not null,
  days int generated always as (end_on - start_on + 1) stored,
  category text not null check (category in ('personal', 'condolence', 'hospital', 'other')),
  detail text not null default '',
  paid boolean not null default false,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_on >= start_on and end_on - start_on < 31)
);
create index if not exists leave_requests_user on public.leave_requests (user_id, start_on desc);
create index if not exists leave_requests_days on public.leave_requests (start_on, end_on) where withdrawn_at is null;

create table if not exists public.leave_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_on date not null,
  end_on date not null check (end_on >= start_on),
  note text not null default '',
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);
create index if not exists leave_exceptions_user on public.leave_exceptions (user_id, start_on);

create table if not exists public.paid_leave_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_on date not null,
  days int not null check (days > 0 and days <= 40),
  expires_on date not null,
  source text not null check (source in ('auto', 'manual')),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (expires_on > granted_on)
);
create unique index if not exists paid_leave_grants_auto on public.paid_leave_grants (user_id, granted_on) where source = 'auto';

-- Days taken outside the app (before it, or corrections): used like a 有給 request.
create table if not exists public.paid_leave_uses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  used_on date not null,
  days int not null check (days > 0 and days <= 40),
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.leave_requests enable row level security;
alter table public.leave_exceptions enable row level security;
alter table public.paid_leave_grants enable row level security;
alter table public.paid_leave_uses enable row level security;
revoke all on public.leave_requests, public.leave_exceptions, public.paid_leave_grants, public.paid_leave_uses from anon, authenticated;
grant select on public.leave_requests, public.leave_exceptions to authenticated;
grant select, insert, update, delete on public.paid_leave_grants, public.paid_leave_uses to authenticated;
create policy "kyoei leave: read own, checker, admin" on public.leave_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.kyoei_is_leave_checker()) or (select public.is_kyoei_admin_mfa()));
create policy "kyoei leave exceptions: read own, checker, admin" on public.leave_exceptions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.kyoei_is_leave_checker()) or (select public.is_kyoei_admin_mfa()));
create policy "kyoei paid grants: admin" on public.paid_leave_grants for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()) and source = 'manual');
create policy "kyoei paid uses: admin" on public.paid_leave_uses for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_requests') then
    alter publication supabase_realtime add table public.leave_requests;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 有給
-- ---------------------------------------------------------------------------
-- Statutory days by service (full-time): 0.5y 10, 1.5y 11, 2.5y 12, 3.5y 14,
-- 4.5y 16, 5.5y 18, 6.5y+ 20.
create or replace function public.kyoei_statutory_paid_days(p_years_after_first int)
returns int
language sql
immutable
set search_path = ''
as $$
  select (array[10, 11, 12, 14, 16, 18, 20])[least(greatest(p_years_after_first, 0), 6) + 1];
$$;

-- Adds the auto grants still valid today (part-timers excluded: hand-entered).
create or replace function public.kyoei_sync_paid_grants(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hire date;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_grant date;
  i int := 0;
begin
  select p.hire_date into v_hire from public.account_profiles p
   where p.user_id = p_user and coalesce(p.position_id, '') not in ('part_time');
  if v_hire is null then return; end if;
  loop
    v_grant := (v_hire + interval '6 months' + make_interval(years => i))::date;
    exit when v_grant > v_today;
    if v_grant + interval '2 years' > v_today then
      insert into public.paid_leave_grants (user_id, granted_on, days, expires_on, source, note)
      values (p_user, v_grant, public.kyoei_statutory_paid_days(i), (v_grant + interval '2 years')::date, 'auto', '入社日からの法定付与')
      on conflict (user_id, granted_on) where source = 'auto' do nothing;
    end if;
    i := i + 1;
  end loop;
end;
$$;
revoke all on function public.kyoei_sync_paid_grants(uuid) from public, anon, authenticated;

-- Balance: every use (app requests not withdrawn, by start date, plus
-- hand-entered uses) takes days from the grant that expires first among
-- those valid on that date. available = what's left of unexpired grants
-- after every use including pending ones; over = days no grant covered.
create or replace function public.kyoei_paid_leave_balance(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  g record;
  u record;
  v_left jsonb := '{}'::jsonb;
  v_need int;
  v_take int;
  v_unfunded int := 0;
  v_available int := 0;
  v_pending int := 0;
  v_next jsonb;
begin
  perform public.kyoei_sync_paid_grants(p_user);
  for g in select * from public.paid_leave_grants where user_id = p_user loop
    v_left := v_left || jsonb_build_object(g.id::text, g.days);
  end loop;
  for u in
    select start_on as on_day, days, confirmed_at is null as pending from public.leave_requests
     where user_id = p_user and paid and withdrawn_at is null
    union all
    select used_on, days, false from public.paid_leave_uses where user_id = p_user
    order by 1
  loop
    v_need := u.days;
    if u.pending then v_pending := v_pending + u.days; end if;
    for g in select * from public.paid_leave_grants
              where user_id = p_user and granted_on <= u.on_day and expires_on > u.on_day
              order by expires_on, granted_on loop
      exit when v_need = 0;
      v_take := least(v_need, (v_left ->> g.id::text)::int);
      if v_take > 0 then
        v_left := jsonb_set(v_left, array[g.id::text], to_jsonb((v_left ->> g.id::text)::int - v_take));
        v_need := v_need - v_take;
      end if;
    end loop;
    v_unfunded := v_unfunded + v_need;
  end loop;
  select coalesce(sum((v_left ->> g2.id::text)::int), 0) into v_available
    from public.paid_leave_grants g2 where g2.user_id = p_user and g2.expires_on > v_today and g2.granted_on <= v_today;
  select jsonb_build_object('on', g3.expires_on, 'days', (v_left ->> g3.id::text)::int) into v_next
    from public.paid_leave_grants g3
   where g3.user_id = p_user and g3.expires_on > v_today and g3.granted_on <= v_today and (v_left ->> g3.id::text)::int > 0
   order by g3.expires_on limit 1;
  return jsonb_build_object('available', v_available, 'pending', v_pending, 'over', v_unfunded, 'next_expiry', v_next);
end;
$$;
revoke all on function public.kyoei_paid_leave_balance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Validation shared by submit and edit.
-- ---------------------------------------------------------------------------
create or replace function public.kyoei_leave_problem(p_user uuid, p_start date, p_end date, p_category text, p_detail text, p_paid boolean, p_ignore uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.leave_settings;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_day date;
  v_limit int;
  v_taken int;
  v_covered boolean;
  v_balance jsonb;
begin
  select * into s from public.leave_settings limit 1;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start >= 31 then return 'dates'; end if;
  if p_start < v_today then return 'past'; end if;
  if p_category not in ('personal', 'condolence', 'hospital', 'other') then return 'category'; end if;
  if p_category in ('hospital', 'other') and length(trim(coalesce(p_detail, ''))) = 0 then return 'detail'; end if;
  if exists (select 1 from public.leave_requests r where r.user_id = p_user and r.withdrawn_at is null
              and r.id is distinct from p_ignore and r.start_on <= p_end and r.end_on >= p_start) then
    return 'overlap';
  end if;
  for v_day in select generate_series(p_start, p_end, interval '1 day')::date loop
    v_covered := exists (select 1 from public.leave_exceptions e where e.user_id = p_user and v_day between e.start_on and e.end_on);
    if not v_covered and v_day < v_today + coalesce(s.notice_days, 7) then return 'notice'; end if;
    v_limit := coalesce((select l.max_people from public.leave_day_limits l where l.day = v_day), s.default_daily_limit);
    if v_limit is not null and not v_covered then
      select count(*) into v_taken from public.leave_requests r
       where r.withdrawn_at is null and r.user_id <> p_user and v_day between r.start_on and r.end_on;
      if v_taken >= v_limit then return 'full'; end if;
    end if;
  end loop;
  if p_paid then
    v_balance := public.kyoei_paid_leave_balance(p_user);
    -- available is already net of pending requests; edits give back their own days.
    if (v_balance ->> 'available')::int - (v_balance ->> 'over')::int
       + coalesce((select r.days from public.leave_requests r where r.id = p_ignore and r.paid and r.confirmed_at is null), 0)
       < p_end - p_start + 1 then
      return 'paid';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.kyoei_leave_problem(uuid, date, date, text, text, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Driver
-- ---------------------------------------------------------------------------
create or replace function public.my_leave()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.leave_settings;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  select * into s from public.leave_settings limit 1;
  return jsonb_build_object(
    'notice_days', s.notice_days,
    'is_checker', public.kyoei_is_leave_checker(),
    'balance', public.kyoei_paid_leave_balance(auth.uid()),
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'filed_on', r.filed_on, 'start_on', r.start_on, 'end_on', r.end_on, 'days', r.days,
        'category', r.category, 'detail', r.detail, 'paid', r.paid,
        'confirmed_at', r.confirmed_at, 'confirmed_by_name', case when r.confirmed_by is null then null else public.kyoei_person_name(r.confirmed_by) end,
        'withdrawn_at', r.withdrawn_at) order by r.start_on desc)
      from public.leave_requests r where r.user_id = auth.uid()), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object('start_on', e.start_on, 'end_on', e.end_on, 'note', e.note) order by e.start_on)
      from public.leave_exceptions e where e.user_id = auth.uid() and e.end_on >= (now() at time zone 'Asia/Tokyo')::date), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.my_leave() from public, anon;
grant execute on function public.my_leave() to authenticated;

-- Each day's 空き (limit − taken) for the date picker; counts only, no names.
create or replace function public.leave_day_status(p_from date, p_to date)
returns table (day date, taken int, max_people int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.leave_settings;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  if p_to - p_from > 92 then
    raise exception 'range too long' using errcode = '22023';
  end if;
  select * into s from public.leave_settings limit 1;
  return query
    select d::date,
           (select count(*)::int from public.leave_requests r where r.withdrawn_at is null and d::date between r.start_on and r.end_on),
           coalesce((select l.max_people from public.leave_day_limits l where l.day = d::date), s.default_daily_limit)
      from generate_series(p_from, p_to, interval '1 day') d;
end;
$$;
revoke all on function public.leave_day_status(date, date) from public, anon;
grant execute on function public.leave_day_status(date, date) to authenticated;

create or replace function public.submit_leave_request(p_start date, p_end date, p_category text, p_detail text, p_paid boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_id uuid;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  v_problem := public.kyoei_leave_problem(auth.uid(), p_start, p_end, p_category, p_detail, p_paid, null);
  if v_problem is not null then
    raise exception '%', 'leave:' || v_problem using errcode = '22023';
  end if;
  insert into public.leave_requests (user_id, start_on, end_on, category, detail, paid)
  values (auth.uid(), p_start, p_end, p_category, left(trim(coalesce(p_detail, '')), 1000), coalesce(p_paid, false))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_leave_request(date, date, text, text, boolean) from public, anon;
grant execute on function public.submit_leave_request(date, date, text, text, boolean) to authenticated;

-- Edit or withdraw (p_withdraw) until 確認済み.
create or replace function public.update_leave_request(p_id uuid, p_start date, p_end date, p_category text, p_detail text, p_paid boolean, p_withdraw boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.leave_requests r where r.id = p_id and r.user_id = auth.uid() and r.confirmed_at is null and r.withdrawn_at is null) then
    raise exception 'locked' using errcode = '42501';
  end if;
  if p_withdraw then
    update public.leave_requests set withdrawn_at = now(), updated_at = now() where id = p_id;
    return;
  end if;
  v_problem := public.kyoei_leave_problem(auth.uid(), p_start, p_end, p_category, p_detail, p_paid, p_id);
  if v_problem is not null then
    raise exception '%', 'leave:' || v_problem using errcode = '22023';
  end if;
  update public.leave_requests
     set start_on = p_start, end_on = p_end, category = p_category, detail = left(trim(coalesce(p_detail, '')), 1000),
         paid = coalesce(p_paid, false), updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.update_leave_request(uuid, date, date, text, text, boolean, boolean) from public, anon;
grant execute on function public.update_leave_request(uuid, date, date, text, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 担当者 (app or console)
-- ---------------------------------------------------------------------------
create or replace function public.leave_checker_board(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.kyoei_is_leave_checker() or public.is_kyoei_admin_mfa()) then
    raise exception 'checker only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'user_id', r.user_id, 'name', public.kyoei_person_name(r.user_id),
        'filed_on', r.filed_on, 'start_on', r.start_on, 'end_on', r.end_on, 'days', r.days,
        'category', r.category, 'detail', r.detail, 'paid', r.paid,
        'confirmed_at', r.confirmed_at, 'confirmed_by_name', case when r.confirmed_by is null then null else public.kyoei_person_name(r.confirmed_by) end
      ) order by r.start_on, public.kyoei_person_name(r.user_id))
      from public.leave_requests r
      where r.withdrawn_at is null and r.end_on >= p_from and r.start_on <= p_to), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', public.kyoei_person_name(e.user_id), 'start_on', e.start_on, 'end_on', e.end_on, 'note', e.note,
        'granted_by_name', case when e.granted_by is null then null else public.kyoei_person_name(e.granted_by) end) order by e.start_on)
      from public.leave_exceptions e where e.end_on >= p_from), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', public.kyoei_person_name(a.user_id)) order by public.kyoei_person_name(a.user_id))
      from public.app_accounts a where a.disabled_at is null), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.leave_checker_board(date, date) from public, anon;
grant execute on function public.leave_checker_board(date, date) to authenticated;

create or replace function public.confirm_leave_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_is_leave_checker() then
    raise exception 'checker only' using errcode = '42501';
  end if;
  update public.leave_requests set confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
   where id = p_id and withdrawn_at is null and confirmed_at is null;
  if not found then
    raise exception 'not pending' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.confirm_leave_request(uuid) from public, anon;
grant execute on function public.confirm_leave_request(uuid) to authenticated;

-- After talking it over: let p_user apply for these dates despite the
-- notice period or the day's limit.
create or replace function public.grant_leave_exception(p_user uuid, p_start date, p_end date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.kyoei_is_leave_checker() then
    raise exception 'checker only' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start >= 31 then
    raise exception 'dates' using errcode = '22023';
  end if;
  insert into public.leave_exceptions (user_id, start_on, end_on, note, granted_by)
  values (p_user, p_start, p_end, left(trim(coalesce(p_note, '')), 500), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.grant_leave_exception(uuid, date, date, text) from public, anon;
grant execute on function public.grant_leave_exception(uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 出勤簿 and calendars: who is on 確認済み leave on a day.
-- ---------------------------------------------------------------------------
create or replace function public.leave_on(p_day date)
returns table (user_id uuid, staff_member_id uuid, paid boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  return query
    select r.user_id, s.id, r.paid
      from public.leave_requests r
      left join public.staff_members s on s.auth_user_id = r.user_id
     where r.withdrawn_at is null and r.confirmed_at is not null and p_day between r.start_on and r.end_on;
end;
$$;
revoke all on function public.leave_on(date) from public, anon;
grant execute on function public.leave_on(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Console: everyone's 有給 at a glance.
-- ---------------------------------------------------------------------------
create or replace function public.admin_paid_leave()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'login_id', a.login_id, 'name', public.kyoei_person_name(a.user_id),
      'hire_date', p.hire_date, 'part_time', coalesce(p.position_id, '') = 'part_time',
      'balance', public.kyoei_paid_leave_balance(a.user_id)
    ) order by public.kyoei_person_name(a.user_id))
    from public.app_accounts a left join public.account_profiles p on p.user_id = a.user_id
    where a.disabled_at is null
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_paid_leave() from public, anon;
grant execute on function public.admin_paid_leave() to authenticated;
