-- 自己評価・目標設定シート (プロドライバー手当). Each month's sheet is for the
-- previous month and is filled from the 1st to the deadline (15th by
-- default) of the next month:
--   項目0  free answer (「何のために」日々の仕事をしていますか)
--   項目1〜10  scored ◎3 ○2 △1 ×0 by the driver (自己), the driver's own
--              上長 (set per account) and the 社長 → max 90 points
--   目標 4問 (next month) and 反省・良かった事 4問 (the month)
-- The total maps to the プロドライバー手当 via the month's allowance table.
-- 「日常点検表の提出が無い人は、得点を計算しません」: if the month had 出勤日
-- without a 日常点検 record (snapshotted by the app at submission), the
-- total isn't counted unless the office excuses it.
-- Questions, items and the allowance table are edited monthly in the console.
-- Drivers see their own answers and, once everyone has scored, only the
-- total and the allowance (not the 上長・社長 scores).

-- ---------------------------------------------------------------------------
-- Monthly template. A month without its own row uses the latest earlier one.
-- ---------------------------------------------------------------------------
create table if not exists public.self_review_templates (
  period date primary key check (extract(day from period) = 1),
  purpose_question text not null,
  items text[] not null check (array_length(items, 1) = 10),
  goal_questions text[] not null check (array_length(goal_questions, 1) = 4),
  reflection_questions text[] not null check (array_length(reflection_questions, 1) = 4),
  -- [{ "min": 90, "max": 90, "amount": 50000 }, ...]
  allowance jsonb not null check (jsonb_typeof(allowance) = 'array'),
  deadline_day int not null default 15 check (deadline_day between 1 and 28),
  updated_at timestamptz not null default now()
);

alter table public.self_review_templates enable row level security;
revoke all on public.self_review_templates from anon;
grant select, insert, update, delete on public.self_review_templates to authenticated;
create policy "kyoei review templates: read" on public.self_review_templates for select to authenticated
  using ((select public.kyoei_account_enabled()));
create policy "kyoei review templates: admin write" on public.self_review_templates for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

insert into public.self_review_templates (period, purpose_question, items, goal_questions, reflection_questions, allowance)
values (
  '2026-09-01',
  '「;;何のために;;」日々の仕事をしていますか',
  array[
    ';;経営理念;;を「;;自分自身の課題;;」として理解していますか',
    '先月よりも「;;良い方向への変化;;」をする事が出来ましたか',
    'ワイヤー固縛は**4緊**、タイヤ固縛は**2緊**を;;完全に徹底;;しましたか',
    '自損事故を含め、**どんな事故も起こさなかった**と言えますか',
    ';;430休憩;;、;;13時間拘束;;を可能な限り守ったと言えますか',
    '退勤から次の出勤まで、**9時間の休息**を必ず取りましたか',
    '配車・**業務指示を遂行し**、**社内ルールを守っていましたか**',
    'どんな**クレームも無く**、**仲間たちに迷惑を掛けませんでしたか**',
    ';;自分の身だしなみ;;、**トラックの身だしなみ**、どちらも整えましたか',
    '**後輩の事を認め、先輩をリスペクト**する事を「;;当たり前;;」にしましたか'
  ],
  array[
    '運行管理（430休憩、13時間拘束、9時間休息、33時間休日）について',
    '自分の車両管理について',
    'マナーアップと身だしなみについて',
    '来月、どんな変化（成長）を目指しますか'
  ],
  array[
    '運行管理（430休憩、13時間拘束、9時間休息、33時間休日）について',
    '自分の車両管理について',
    'マナーアップと身だしなみについて',
    '今月、一番自信のあった点は何ですか'
  ],
  '[{"min":90,"max":90,"amount":50000},{"min":89,"max":89,"amount":45000},{"min":88,"max":88,"amount":40000},
    {"min":87,"max":87,"amount":37500},{"min":86,"max":86,"amount":35000},{"min":85,"max":85,"amount":32500},
    {"min":84,"max":84,"amount":30000},{"min":83,"max":83,"amount":27500},{"min":78,"max":82,"amount":25000},
    {"min":73,"max":77,"amount":22500},{"min":68,"max":72,"amount":20000},{"min":63,"max":67,"amount":17500},
    {"min":58,"max":62,"amount":15000},{"min":0,"max":57,"amount":12500}]'::jsonb
)
on conflict (period) do nothing;

-- Each account's 上長 (scores that person's sheet).
alter table public.account_profiles add column if not exists supervisor_id uuid references auth.users (id) on delete set null;
alter table public.account_profiles drop constraint if exists account_profiles_supervisor_not_self;
alter table public.account_profiles add constraint account_profiles_supervisor_not_self check (supervisor_id is null or supervisor_id <> user_id);

-- ---------------------------------------------------------------------------
-- Sheets. No direct access except MFA-verified admins reading; everything
-- else goes through the functions below.
-- ---------------------------------------------------------------------------
create or replace function public.kyoei_valid_scores(p smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (array_length(p, 1) = 10 and not exists (select 1 from unnest(p) s where s is null or s < 0 or s > 3));
$$;

create table if not exists public.self_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  vehicle_class text,
  purpose text not null default '',
  self_scores smallint[] check (public.kyoei_valid_scores(self_scores)),
  goals text[] not null default array['', '', '', ''] check (array_length(goals, 1) = 4),
  reflections text[] not null default array['', '', '', ''] check (array_length(reflections, 1) = 4),
  missing_inspection_days date[] not null default '{}',
  submitted_at timestamptz,
  supervisor_scores smallint[] check (public.kyoei_valid_scores(supervisor_scores)),
  supervisor_scored_by uuid references auth.users (id) on delete set null,
  supervisor_scored_at timestamptz,
  president_scores smallint[] check (public.kyoei_valid_scores(president_scores)),
  president_scored_by uuid references auth.users (id) on delete set null,
  president_scored_at timestamptz,
  inspection_excused boolean not null default false,
  excused_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);
create index if not exists self_reviews_period on public.self_reviews (period);

alter table public.self_reviews enable row level security;
revoke all on public.self_reviews from anon, authenticated;
grant select on public.self_reviews to authenticated;
create policy "kyoei self reviews: admin read" on public.self_reviews for select to authenticated
  using ((select public.is_kyoei_admin_mfa()));

-- The template in force for a month.
create or replace function public.kyoei_review_template(p_period date)
returns public.self_review_templates
language sql
stable
security definer
set search_path = ''
as $$
  select t.* from public.self_review_templates t
   order by (t.period <= p_period) desc, case when t.period <= p_period then t.period end desc nulls last, t.period
   limit 1;
$$;
revoke all on function public.kyoei_review_template(date) from public, anon, authenticated;

-- The month being filled now (先月) and whether it's still open (JST).
create or replace function public.self_review_window()
returns table (period date, deadline date, is_open boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_period date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_deadline date := (date_trunc('month', v_today))::date + ((public.kyoei_review_template(v_period)).deadline_day - 1);
begin
  return query select v_period, v_deadline, v_today <= v_deadline;
end;
$$;
revoke all on function public.self_review_window() from public, anon;
grant execute on function public.self_review_window() to authenticated;

-- Total and 手当: status 'pending' (not everyone has scored), 'excluded'
-- (未点検の出勤日があり、事務所の確認待ち) or 'final'.
create or replace function public.kyoei_review_result(r public.self_reviews)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_amount int;
begin
  if r.self_scores is null or r.supervisor_scores is null or r.president_scores is null then
    return jsonb_build_object('status', 'pending');
  end if;
  if cardinality(r.missing_inspection_days) > 0 and not r.inspection_excused then
    return jsonb_build_object('status', 'excluded');
  end if;
  select sum(s) into v_total from unnest(r.self_scores || r.supervisor_scores || r.president_scores) s;
  select (a ->> 'amount')::int into v_amount
    from jsonb_array_elements((public.kyoei_review_template(r.period)).allowance) a
   where v_total between (a ->> 'min')::int and (a ->> 'max')::int
   limit 1;
  return jsonb_build_object('status', 'final', 'total', v_total, 'allowance', v_amount);
end;
$$;
revoke all on function public.kyoei_review_result(public.self_reviews) from public, anon, authenticated;

create or replace function public.kyoei_template_json(t public.self_review_templates)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('purpose_question', t.purpose_question, 'items', to_jsonb(t.items),
    'goal_questions', to_jsonb(t.goal_questions), 'reflection_questions', to_jsonb(t.reflection_questions), 'deadline_day', t.deadline_day);
$$;
revoke all on function public.kyoei_template_json(public.self_review_templates) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Driver
-- ---------------------------------------------------------------------------
-- The signed-in user's sheet (current period by default) with the template.
-- Only the total and allowance are returned — never the 上長・社長 scores.
create or replace function public.my_self_review(p_period date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w record;
  v_period date;
  r public.self_reviews;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  select * into w from public.self_review_window();
  v_period := coalesce(p_period, w.period);
  select * into r from public.self_reviews s where s.user_id = auth.uid() and s.period = v_period;
  return jsonb_build_object(
    'period', v_period,
    'deadline', case when v_period = w.period then w.deadline end,
    'is_open', v_period = w.period and w.is_open,
    'template', public.kyoei_template_json(public.kyoei_review_template(v_period)),
    'review', case when r.id is null or r.submitted_at is null then null else jsonb_build_object(
      'vehicle_class', r.vehicle_class, 'purpose', r.purpose, 'self_scores', to_jsonb(r.self_scores),
      'goals', to_jsonb(r.goals), 'reflections', to_jsonb(r.reflections),
      'missing_inspection_days', to_jsonb(r.missing_inspection_days), 'submitted_at', r.submitted_at) end,
    'result', case when r.id is null then jsonb_build_object('status', 'pending') else public.kyoei_review_result(r) end
  );
end;
$$;
revoke all on function public.my_self_review(date) from public, anon;
grant execute on function public.my_self_review(date) to authenticated;

-- Submit (or update) this period's sheet while it's open.
create or replace function public.submit_self_review(
  p_purpose text, p_self_scores smallint[], p_goals text[], p_reflections text[],
  p_missing_days date[], p_vehicle_class text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  select * into w from public.self_review_window();
  if not w.is_open then
    raise exception 'closed' using errcode = '22023';
  end if;
  if p_self_scores is null or not public.kyoei_valid_scores(p_self_scores) then
    raise exception 'score all ten items' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_purpose, ''))) = 0 then
    raise exception 'purpose required' using errcode = '22023';
  end if;
  if coalesce(array_length(p_goals, 1), 0) <> 4 or coalesce(array_length(p_reflections, 1), 0) <> 4 then
    raise exception 'four goals and reflections' using errcode = '22023';
  end if;
  insert into public.self_reviews as s (user_id, period, vehicle_class, purpose, self_scores, goals, reflections, missing_inspection_days, submitted_at, updated_at)
  values (auth.uid(), w.period, nullif(p_vehicle_class, ''), left(trim(p_purpose), 2000), p_self_scores,
          array(select left(trim(coalesce(g, '')), 2000) from unnest(p_goals) g),
          array(select left(trim(coalesce(x, '')), 2000) from unnest(p_reflections) x),
          coalesce(p_missing_days, '{}'), now(), now())
  on conflict (user_id, period) do update
    set vehicle_class = excluded.vehicle_class, purpose = excluded.purpose, self_scores = excluded.self_scores,
        goals = excluded.goals, reflections = excluded.reflections,
        missing_inspection_days = excluded.missing_inspection_days, submitted_at = now(), updated_at = now();
end;
$$;
revoke all on function public.submit_self_review(text, smallint[], text[], text[], date[], text) from public, anon;
grant execute on function public.submit_self_review(text, smallint[], text[], text[], date[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 上長 (in the app or the console): the people whose 上長 I am, with their answers.
-- ---------------------------------------------------------------------------
create or replace function public.my_subordinate_reviews()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w record;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  select * into w from public.self_review_window();
  return jsonb_build_object(
    'period', w.period, 'deadline', w.deadline, 'is_open', w.is_open,
    'template', public.kyoei_template_json(public.kyoei_review_template(w.period)),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'name', public.kyoei_person_name(p.user_id),
        'vehicle_class', coalesce(r.vehicle_class, p.vehicle_class),
        'submitted_at', r.submitted_at,
        'purpose', r.purpose,
        'self_scores', to_jsonb(r.self_scores),
        'goals', to_jsonb(r.goals),
        'reflections', to_jsonb(r.reflections),
        'my_scores', to_jsonb(r.supervisor_scores),
        'scored_at', r.supervisor_scored_at
      ) order by public.kyoei_person_name(p.user_id))
      from public.account_profiles p
      join public.app_accounts a on a.user_id = p.user_id and a.disabled_at is null
      left join public.self_reviews r on r.user_id = p.user_id and r.period = w.period
      where p.supervisor_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.my_subordinate_reviews() from public, anon;
grant execute on function public.my_subordinate_reviews() to authenticated;

create or replace function public.score_subordinate_review(p_user uuid, p_scores smallint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.account_profiles p where p.user_id = p_user and p.supervisor_id = auth.uid()) then
    raise exception 'not your report' using errcode = '42501';
  end if;
  select * into w from public.self_review_window();
  if not w.is_open then
    raise exception 'closed' using errcode = '22023';
  end if;
  if p_scores is null or not public.kyoei_valid_scores(p_scores) then
    raise exception 'score all ten items' using errcode = '22023';
  end if;
  insert into public.self_reviews as s (user_id, period, supervisor_scores, supervisor_scored_by, supervisor_scored_at)
  values (p_user, w.period, p_scores, auth.uid(), now())
  on conflict (user_id, period) do update
    set supervisor_scores = excluded.supervisor_scores, supervisor_scored_by = auth.uid(),
        supervisor_scored_at = now(), updated_at = now();
end;
$$;
revoke all on function public.score_subordinate_review(uuid, smallint[]) from public, anon;
grant execute on function public.score_subordinate_review(uuid, smallint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Console
-- ---------------------------------------------------------------------------
-- Everyone's sheet for a month, with names and the computed result.
create or replace function public.admin_self_reviews(p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id,
      'login_id', a.login_id,
      'name', public.kyoei_person_name(a.user_id),
      'vehicle_class', coalesce(r.vehicle_class, p.vehicle_class),
      'supervisor_id', p.supervisor_id,
      'supervisor_name', case when p.supervisor_id is null then null else public.kyoei_person_name(p.supervisor_id) end,
      'review_id', r.id,
      'submitted_at', r.submitted_at,
      'purpose', r.purpose,
      'self_scores', to_jsonb(r.self_scores),
      'supervisor_scores', to_jsonb(r.supervisor_scores),
      'supervisor_scored_by', case when r.supervisor_scored_by is null then null else public.kyoei_person_name(r.supervisor_scored_by) end,
      'president_scores', to_jsonb(r.president_scores),
      'president_scored_by', case when r.president_scored_by is null then null else public.kyoei_person_name(r.president_scored_by) end,
      'goals', to_jsonb(r.goals),
      'reflections', to_jsonb(r.reflections),
      'missing_inspection_days', to_jsonb(coalesce(r.missing_inspection_days, '{}')),
      'inspection_excused', coalesce(r.inspection_excused, false),
      'result', case when r.id is null then jsonb_build_object('status', 'pending') else public.kyoei_review_result(r) end
    ) order by public.kyoei_person_name(a.user_id))
    from public.app_accounts a
    left join public.account_profiles p on p.user_id = a.user_id
    left join public.self_reviews r on r.user_id = a.user_id and r.period = p_period
    where a.disabled_at is null and (a.is_driver or r.id is not null)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_self_reviews(date) from public, anon;
grant execute on function public.admin_self_reviews(date) to authenticated;

-- 社長採点: an MFA-verified admin whose 役職 is 社長.
create or replace function public.president_score_review(p_user uuid, p_period date, p_scores smallint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.account_profiles p where p.user_id = auth.uid() and p.position_id = 'president') then
    raise exception 'president only' using errcode = '42501';
  end if;
  if p_scores is null or not public.kyoei_valid_scores(p_scores) then
    raise exception 'score all ten items' using errcode = '22023';
  end if;
  insert into public.self_reviews as s (user_id, period, president_scores, president_scored_by, president_scored_at)
  values (p_user, p_period, p_scores, auth.uid(), now())
  on conflict (user_id, period) do update
    set president_scores = excluded.president_scores, president_scored_by = auth.uid(),
        president_scored_at = now(), updated_at = now();
  perform public.log_admin_action('self_review', public.kyoei_person_name(p_user) || '（' || to_char(p_period, 'YYYY年FMMM月') || '分）', 'president_score',
    jsonb_build_object('total', (select sum(x) from unnest(p_scores) x)));
end;
$$;
revoke all on function public.president_score_review(uuid, date, smallint[]) from public, anon;
grant execute on function public.president_score_review(uuid, date, smallint[]) to authenticated;

-- 未点検の出勤日があっても計算する／しない (事務所の判断).
create or replace function public.excuse_review_inspection(p_user uuid, p_period date, p_excused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  update public.self_reviews s
     set inspection_excused = p_excused, excused_by = auth.uid(), updated_at = now()
   where s.user_id = p_user and s.period = p_period;
  if not found then
    raise exception 'no sheet' using errcode = '22023';
  end if;
  perform public.log_admin_action('self_review', public.kyoei_person_name(p_user) || '（' || to_char(p_period, 'YYYY年FMMM月') || '分）',
    case when p_excused then 'excuse_inspection' else 'unexcuse_inspection' end);
end;
$$;
revoke all on function public.excuse_review_inspection(uuid, date, boolean) from public, anon;
grant execute on function public.excuse_review_inspection(uuid, date, boolean) to authenticated;
