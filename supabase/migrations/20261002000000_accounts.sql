-- Accounts for the iOS app: every user is invited by an administrator, signs
-- in with a login ID (e.g. 社員番号) and a password, and carries roles.
--
-- No mail is ever sent. Supabase Auth still needs an email address, so each
-- account uses a synthetic one, "<login_id>@id.kyoei.invalid" (the reserved
-- .invalid TLD can never receive mail); users only ever see the login ID.
--
-- Invitations and password resets are one-time URLs issued by an admin
-- (account_setup_tokens): the admin hands the URL / QR code to the person,
-- who opens it on their iPhone and chooses a password in the app. The
-- Edge Function `account-setup` redeems them with the service role.
--
-- Additive only: existing tables keep their current (open) policies until
-- the web app is retired.

create table if not exists public.app_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique check (login_id ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  is_driver boolean not null default true,
  can_search_customers boolean not null default false,
  is_admin boolean not null default false,
  -- Set when an admin stops the account: sign-in is refused (the auth user
  -- is also banned) and the app wipes its local data on its next sync.
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_accounts enable row level security;

grant select on public.app_accounts to authenticated;

-- True when the caller is an enabled admin. SECURITY DEFINER so policies can
-- use it without recursing through app_accounts' own RLS; in `public`
-- because policies run as the caller, who has no access to `private`.
create or replace function public.is_kyoei_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_accounts a
    where a.user_id = auth.uid() and a.is_admin and a.disabled_at is null
  );
$$;

revoke all on function public.is_kyoei_admin() from public, anon;
grant execute on function public.is_kyoei_admin() to authenticated;

create policy "kyoei accounts: read own"
  on public.app_accounts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "kyoei accounts: admins read all"
  on public.app_accounts for select to authenticated
  using ((select public.is_kyoei_admin()));

-- Writes go through the service role only (admin console / Edge Functions).

-- One-time setup / reset links. Only a SHA-256 of the token is stored, so a
-- database dump can't be turned back into working links.
create table if not exists private.account_setup_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('setup', 'reset')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists account_setup_tokens_user on private.account_setup_tokens (user_id);

revoke all on private.account_setup_tokens from public, anon, authenticated;

-- The functions below are the only way to touch account_setup_tokens. They
-- live in `public` so the Edge Functions can call them over PostgREST, but
-- only the service role may execute them.

-- Issues a token (its hash is computed by the caller) and voids that user's
-- earlier unused tokens of the same purpose, so only the newest link works.
create or replace function public.issue_account_setup_token(
  p_user uuid, p_purpose text, p_token_hash text, p_valid_for interval, p_created_by uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + p_valid_for;
begin
  update private.account_setup_tokens
     set expires_at = now()
   where user_id = p_user and purpose = p_purpose and used_at is null and expires_at > now();
  insert into private.account_setup_tokens (token_hash, user_id, purpose, expires_at, created_by)
  values (p_token_hash, p_user, p_purpose, v_expires, p_created_by);
  return v_expires;
end;
$$;

-- Redeeming is a single statement so a token can't be used twice by two
-- requests racing each other. Returns the account, or no row.
create or replace function public.redeem_account_setup_token(p_token_hash text)
returns table (user_id uuid, login_id text, purpose text)
language sql
security definer
set search_path = ''
as $$
  update private.account_setup_tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.used_at is null
     and t.expires_at > now()
     and exists (select 1 from public.app_accounts a where a.user_id = t.user_id and a.disabled_at is null)
  returning t.user_id,
            (select a.login_id from public.app_accounts a where a.user_id = t.user_id),
            t.purpose;
$$;

-- Undoes a redemption when setting the password then fails, so the person
-- can simply try again with the same link.
create or replace function public.release_account_setup_token(p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.account_setup_tokens set used_at = null where token_hash = p_token_hash;
$$;

revoke all on function public.issue_account_setup_token(uuid, text, text, interval, uuid) from public, anon, authenticated;
revoke all on function public.redeem_account_setup_token(text) from public, anon, authenticated;
revoke all on function public.release_account_setup_token(text) from public, anon, authenticated;
grant execute on function public.issue_account_setup_token(uuid, text, text, interval, uuid) to service_role;
grant execute on function public.redeem_account_setup_token(text) to service_role;
grant execute on function public.release_account_setup_token(text) to service_role;
