-- 社長賞投票: from the 1st to the 15th of each month (JST) everyone votes for
-- three colleagues who did well last month, with what they did.
--
-- Anonymity rules (agreed 2026-10-03):
--   1. Nobody, admins included, normally sees who voted for whom. The console
--      shows vote counts and the reasons only.
--   2. The ballot (public.award_ballots) has no voter column; the voter link
--      lives in private.award_ballot_voters, which no API role can read.
--   3. A voter is revealed only for a problematic ballot, when one admin
--      requests it with a reason and a different admin approves.
--   4. Requests, approvals and views are written to admin_audit_log.
--   5. A year after the voting month the voter links are deleted for good.
--   6. No voting for oneself; three different people; editable until the 15th.

create table if not exists public.award_ballots (
  id uuid primary key default gen_random_uuid(),
  -- The month being voted on (first day): votes in October are for September.
  period date not null check (extract(day from period) = 1),
  nominee_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0 and length(reason) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists award_ballots_period on public.award_ballots (period, nominee_id);

alter table public.award_ballots enable row level security;
revoke all on public.award_ballots from anon, authenticated;
-- No direct access: everything goes through the functions below.

create table if not exists private.award_ballot_voters (
  ballot_id uuid primary key references public.award_ballots (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  period date not null
);
create index if not exists award_ballot_voters_voter on private.award_ballot_voters (voter_id, period);
revoke all on private.award_ballot_voters from public, anon, authenticated;

create table if not exists public.award_disclosure_requests (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.award_ballots (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users (id) on delete set null,
  rejected_at timestamptz,
  check (approved_by is null or approved_by <> requested_by)
);
alter table public.award_disclosure_requests enable row level security;
revoke all on public.award_disclosure_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Voting window and period, in Japan time.
-- ---------------------------------------------------------------------------
create or replace function public.award_vote_window()
returns table (period date, is_open boolean, closes_on date)
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', (now() at time zone 'Asia/Tokyo')) - interval '1 month')::date,
         extract(day from (now() at time zone 'Asia/Tokyo')) <= 15,
         (date_trunc('month', (now() at time zone 'Asia/Tokyo')) + interval '14 days')::date;
$$;
revoke all on function public.award_vote_window() from public, anon;
grant execute on function public.award_vote_window() to authenticated;

-- Rule 5: forget who voted once the voting month is a year old.
create or replace function public.award_forget_old_voters()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.award_ballot_voters v where v.period < (date_trunc('month', (now() at time zone 'Asia/Tokyo')) - interval '12 months')::date;
$$;
revoke all on function public.award_forget_old_voters() from public, anon, authenticated;

-- Everyone who can be voted for: enabled accounts except oneself.
create or replace function public.award_candidates()
returns table (user_id uuid, name text, position_name text)
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
    select a.user_id, public.kyoei_person_name(a.user_id), pos.name
      from public.app_accounts a
      left join public.account_profiles p on p.user_id = a.user_id
      left join public.positions pos on pos.id = p.position_id
     where a.disabled_at is null and a.user_id <> auth.uid()
     order by coalesce(pos.sort_order, 999), public.kyoei_person_name(a.user_id);
end;
$$;
revoke all on function public.award_candidates() from public, anon;
grant execute on function public.award_candidates() to authenticated;

-- The signed-in user's own votes for the current period.
create or replace function public.my_award_votes()
returns table (period date, is_open boolean, closes_on date, nominee_id uuid, nominee_name text, reason text)
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
  select * into w from public.award_vote_window();
  return query
    select w.period, w.is_open, w.closes_on, b.nominee_id, public.kyoei_person_name(b.nominee_id), b.reason
      from private.award_ballot_voters v
      join public.award_ballots b on b.id = v.ballot_id
     where v.voter_id = auth.uid() and v.period = w.period
     order by b.created_at;
  if not found then
    return query select w.period, w.is_open, w.closes_on, null::uuid, null::text, null::text;
  end if;
end;
$$;
revoke all on function public.my_award_votes() from public, anon;
grant execute on function public.my_award_votes() to authenticated;

-- Submit (or replace) this period's three votes: [{nominee, reason}, ...].
create or replace function public.submit_award_votes(p_votes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  v jsonb;
  v_nominee uuid;
  v_reason text;
  v_ballot uuid;
  v_seen uuid[] := '{}';
  v_candidates int;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  select * into w from public.award_vote_window();
  if not w.is_open then
    raise exception 'voting is closed' using errcode = '22023';
  end if;
  if jsonb_typeof(p_votes) <> 'array' then
    raise exception 'votes must be an array' using errcode = '22023';
  end if;
  select count(*) into v_candidates from public.app_accounts a where a.disabled_at is null and a.user_id <> auth.uid();
  if jsonb_array_length(p_votes) <> least(3, v_candidates) then
    raise exception 'choose three people' using errcode = '22023';
  end if;

  perform public.award_forget_old_voters();

  -- Replace this period's ballots by this voter.
  delete from public.award_ballots b
   using private.award_ballot_voters x
   where x.ballot_id = b.id and x.voter_id = auth.uid() and x.period = w.period;

  for v in select * from jsonb_array_elements(p_votes) loop
    v_nominee := nullif(v ->> 'nominee', '')::uuid;
    v_reason := trim(coalesce(v ->> 'reason', ''));
    if v_nominee is null or v_nominee = auth.uid() then
      raise exception 'cannot vote for yourself' using errcode = '22023';
    end if;
    if v_nominee = any (v_seen) then
      raise exception 'three different people' using errcode = '22023';
    end if;
    if not exists (select 1 from public.app_accounts a where a.user_id = v_nominee and a.disabled_at is null) then
      raise exception 'unknown person' using errcode = '22023';
    end if;
    if length(v_reason) = 0 then
      raise exception 'reason required' using errcode = '22023';
    end if;
    v_seen := v_seen || v_nominee;
    insert into public.award_ballots (period, nominee_id, reason) values (w.period, v_nominee, left(v_reason, 1000))
      returning id into v_ballot;
    insert into private.award_ballot_voters (ballot_id, voter_id, period) values (v_ballot, auth.uid(), w.period);
  end loop;
end;
$$;
revoke all on function public.submit_award_votes(jsonb) from public, anon;
grant execute on function public.submit_award_votes(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Console (MFA-verified admins): counts and reasons, never voters.
-- ---------------------------------------------------------------------------
create or replace function public.award_results(p_period date)
returns table (nominee_id uuid, nominee_name text, position_name text, votes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  return query
    select b.nominee_id, public.kyoei_person_name(b.nominee_id), pos.name, count(*)
      from public.award_ballots b
      left join public.account_profiles p on p.user_id = b.nominee_id
      left join public.positions pos on pos.id = p.position_id
     where b.period = p_period
     group by b.nominee_id, pos.name
     order by count(*) desc, public.kyoei_person_name(b.nominee_id);
end;
$$;
revoke all on function public.award_results(date) from public, anon;
grant execute on function public.award_results(date) to authenticated;

-- Reasons for one person, shuffled by id so their order says nothing about who wrote them.
create or replace function public.award_reasons(p_period date, p_nominee uuid)
returns table (ballot_id uuid, reason text, disclosure text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  return query
    select b.id, b.reason,
           (select case when r.approved_at is not null then 'approved' when r.rejected_at is not null then 'rejected' else 'pending' end
              from public.award_disclosure_requests r where r.ballot_id = b.id order by r.requested_at desc limit 1)
      from public.award_ballots b
     where b.period = p_period and b.nominee_id = p_nominee
     order by b.id;
end;
$$;
revoke all on function public.award_reasons(date, uuid) from public, anon;
grant execute on function public.award_reasons(date, uuid) to authenticated;

-- Rule 3: request disclosure of one ballot's voter, with a reason.
create or replace function public.request_award_disclosure(p_ballot uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  if exists (select 1 from public.award_disclosure_requests r where r.ballot_id = p_ballot and r.rejected_at is null) then
    raise exception 'already requested' using errcode = '23505';
  end if;
  insert into public.award_disclosure_requests (ballot_id, requested_by, reason)
  select b.id, auth.uid(), left(trim(p_reason), 1000) from public.award_ballots b where b.id = p_ballot
  returning id into v_id;
  if v_id is null then
    raise exception 'unknown ballot' using errcode = '22023';
  end if;
  perform public.log_admin_action('award', '社長賞の投票者開示', 'request_disclosure', jsonb_build_object('request', v_id, 'reason', left(trim(p_reason), 1000)));
  return v_id;
end;
$$;
revoke all on function public.request_award_disclosure(uuid, text) from public, anon;
grant execute on function public.request_award_disclosure(uuid, text) to authenticated;

-- A different admin approves or rejects.
create or replace function public.decide_award_disclosure(p_request uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  update public.award_disclosure_requests r
     set approved_by = case when p_approve then auth.uid() end,
         approved_at = case when p_approve then now() end,
         rejected_by = case when p_approve then null else auth.uid() end,
         rejected_at = case when p_approve then null else now() end
   where r.id = p_request and r.requested_by <> auth.uid()
     and r.approved_at is null and r.rejected_at is null;
  if not found then
    raise exception 'needs another admin' using errcode = '42501';
  end if;
  perform public.log_admin_action('award', '社長賞の投票者開示', case when p_approve then 'approve_disclosure' else 'reject_disclosure' end,
    jsonb_build_object('request', p_request));
end;
$$;
revoke all on function public.decide_award_disclosure(uuid, boolean) from public, anon;
grant execute on function public.decide_award_disclosure(uuid, boolean) to authenticated;

-- All requests (newest first); the voter is filled in only once approved,
-- and only while the voter link still exists (rule 5). Each call that
-- returns a voter is logged.
create or replace function public.award_disclosures()
returns table (
  request_id uuid, period date, nominee_name text, ballot_reason text,
  requested_by_name text, request_reason text, requested_at timestamptz, requested_by_me boolean,
  status text, decided_by_name text, decided_at timestamptz, voter_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  perform public.award_forget_old_voters();
  if exists (select 1 from public.award_disclosure_requests r where r.approved_at is not null) then
    perform public.log_admin_action('award', '社長賞の投票者開示', 'view_disclosure', '{}'::jsonb);
  end if;
  return query
    select r.id, b.period, public.kyoei_person_name(b.nominee_id), b.reason,
           public.kyoei_person_name(r.requested_by), r.reason, r.requested_at, r.requested_by = auth.uid(),
           case when r.approved_at is not null then 'approved' when r.rejected_at is not null then 'rejected' else 'pending' end,
           case when coalesce(r.approved_by, r.rejected_by) is null then null else public.kyoei_person_name(coalesce(r.approved_by, r.rejected_by)) end,
           coalesce(r.approved_at, r.rejected_at),
           case when r.approved_at is null then null
                else coalesce((select public.kyoei_person_name(v.voter_id) from private.award_ballot_voters v where v.ballot_id = b.id), '（1年経過のため記録なし）') end
      from public.award_disclosure_requests r
      join public.award_ballots b on b.id = r.ballot_id
     order by r.requested_at desc;
end;
$$;
revoke all on function public.award_disclosures() from public, anon;
grant execute on function public.award_disclosures() to authenticated;
