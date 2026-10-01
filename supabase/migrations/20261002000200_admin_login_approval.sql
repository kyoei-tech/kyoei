-- Two-factor sign-in for the admin console without an authenticator app or
-- SMS: the admin approves each console sign-in in the KYOEI iPhone app.
--
--   1. Console (password-only session) calls request_admin_login(): a
--      request bound to that session, with a 2-digit number shown on the PC.
--   2. The KYOEI app shows the request with three numbers; the admin picks
--      the one on the PC and confirms with Face ID, which signs the request
--      with a key that lives only in that iPhone's Secure Enclave.
--   3. Edge Function `admin-login-approve` verifies the signature against
--      the device key registered for the account (account_devices) and
--      marks the request approved.
--   4. is_kyoei_admin_mfa() now accepts that approved console session.
--
-- The device key is registered only while redeeming a one-time setup/reset
-- code from an admin (account-setup), so a stolen password alone can neither
-- register a key nor approve a sign-in.

create table if not exists public.account_devices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- P-256 public key, X9.63 uncompressed (65 bytes), base64.
  public_key text not null,
  registered_at timestamptz not null default now()
);
alter table public.account_devices enable row level security;
revoke all on public.account_devices from anon, authenticated;

create table if not exists public.admin_login_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The console's Supabase session (auth.jwt() ->> 'session_id').
  session_id uuid not null,
  number smallint not null check (number between 10 and 99),
  choices smallint[] not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 minutes',
  approved_at timestamptz,
  denied_at timestamptz
);
create index if not exists admin_login_requests_user on public.admin_login_requests (user_id, created_at desc);

alter table public.admin_login_requests enable row level security;
revoke all on public.admin_login_requests from anon, authenticated;
-- Writes: request_admin_login() and the Edge Function only.

-- How long an approved console session stays valid (the console's own
-- 15-minute idle sign-out usually ends it sooner).
create or replace function public.kyoei_admin_session_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_login_requests r
    where r.user_id = auth.uid()
      and r.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and r.approved_at is not null
      and r.approved_at > now() - interval '12 hours'
  );
$$;
revoke all on function public.kyoei_admin_session_approved() from public, anon;
grant execute on function public.kyoei_admin_session_approved() to authenticated;

-- Admin + second factor: an app-approved console session (or an aal2 session).
create or replace function public.is_kyoei_admin_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (coalesce((auth.jwt() ->> 'aal') = 'aal2', false) or public.kyoei_admin_session_approved())
     and exists (
       select 1 from public.app_accounts a
       where a.user_id = auth.uid() and a.is_admin and a.disabled_at is null
     );
$$;

-- Console: start a sign-in approval for the current (password-only) session.
create or replace function public.request_admin_login(p_user_agent text default '')
returns table (id uuid, number smallint, expires_at timestamptz, has_device boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_number smallint;
  v_choices smallint[];
  v_decoy smallint;
begin
  if v_session is null or not exists (
    select 1 from public.app_accounts a where a.user_id = auth.uid() and a.is_admin and a.disabled_at is null
  ) then
    raise exception 'admin account required' using errcode = '42501';
  end if;
  if (select count(*) from public.admin_login_requests r
       where r.user_id = auth.uid() and r.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'too many requests' using errcode = '54000';
  end if;
  -- Only the newest request can be approved.
  update public.admin_login_requests r set expires_at = now()
   where r.user_id = auth.uid() and r.approved_at is null and r.denied_at is null and r.expires_at > now();

  v_number := 10 + floor(random() * 90)::smallint;
  v_choices := array[v_number];
  while array_length(v_choices, 1) < 3 loop
    v_decoy := 10 + floor(random() * 90)::smallint;
    if not v_decoy = any (v_choices) then v_choices := v_choices || v_decoy; end if;
  end loop;
  -- Shuffle so the right answer isn't always first.
  select array_agg(c order by random()) into v_choices from unnest(v_choices) c;

  return query
    insert into public.admin_login_requests (user_id, session_id, number, choices, user_agent)
    values (auth.uid(), v_session, v_number, v_choices, left(coalesce(p_user_agent, ''), 300))
    returning admin_login_requests.id, admin_login_requests.number, admin_login_requests.expires_at,
              exists (select 1 from public.account_devices d where d.user_id = auth.uid());
end;
$$;
revoke all on function public.request_admin_login(text) from public, anon;
grant execute on function public.request_admin_login(text) to authenticated;

-- Console: has this session's request been answered?
create or replace function public.admin_login_status(p_request uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.approved_at is not null then 'approved'
    when r.denied_at is not null then 'denied'
    when r.expires_at <= now() then 'expired'
    else 'pending'
  end
  from public.admin_login_requests r
  where r.id = p_request
    and r.user_id = auth.uid()
    and r.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;
revoke all on function public.admin_login_status(uuid) from public, anon;
grant execute on function public.admin_login_status(uuid) to authenticated;

-- App: the pending request to show (never the answer).
create or replace function public.pending_admin_login()
returns table (id uuid, choices smallint[], user_agent text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.choices, r.user_agent, r.created_at, r.expires_at
  from public.admin_login_requests r
  where r.user_id = auth.uid() and r.approved_at is null and r.denied_at is null and r.expires_at > now()
  order by r.created_at desc
  limit 1;
$$;
revoke all on function public.pending_admin_login() from public, anon;
grant execute on function public.pending_admin_login() to authenticated;
