-- テストアカウント管理 (設定 > 試験運転モード) without a server.
--
-- The web app did this in /api/test-accounts with the service-role key, which
-- must never ship inside a mobile app. Instead, two SECURITY DEFINER
-- functions run with the owner's rights inside Postgres and are callable via
-- RPC with the anon key. The PIN is verified here, server-side, against a
-- bcrypt hash in a non-exposed schema, with a lockout after repeated
-- failures. (The old route itself performed no check at all.)
--
-- To change the PIN:
--   update private.admin_pins
--      set pin_hash = extensions.crypt('<new pin>', extensions.gen_salt('bf'))
--    where purpose = 'test-accounts';

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_pins (
  purpose text primary key,
  pin_hash text not null
);

create table if not exists private.admin_pin_failures (
  id bigserial primary key,
  purpose text not null,
  failed_at timestamptz not null default now()
);

-- Seeded with the PIN the web app already used for this screen. Change it
-- after applying (see above).
insert into private.admin_pins (purpose, pin_hash)
values ('test-accounts', extensions.crypt('0525', extensions.gen_salt('bf')))
on conflict (purpose) do nothing;

-- Returns 'ok', 'invalid_pin' or 'locked'. Deliberately returns a status
-- rather than raising: an exception would roll back the failure record and
-- defeat the lockout.
create or replace function private.verify_admin_pin(p_purpose text, p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_recent int;
begin
  select count(*) into v_recent
    from private.admin_pin_failures
   where purpose = p_purpose
     and failed_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    return 'locked';
  end if;

  select pin_hash into v_hash from private.admin_pins where purpose = p_purpose;
  if v_hash is null or p_pin is null or extensions.crypt(p_pin, v_hash) <> v_hash then
    insert into private.admin_pin_failures (purpose) values (p_purpose);
    return 'invalid_pin';
  end if;

  delete from private.admin_pin_failures where purpose = p_purpose;
  return 'ok';
end;
$$;

revoke all on function private.verify_admin_pin(text, text) from public;

-- {"status":"ok","accounts":[{staff_id, staff_name, auth_user_id, email, created_at}]}
-- or {"status":"invalid_pin"|"locked"}
create or replace function public.admin_list_test_accounts(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.verify_admin_pin('test-accounts', p_pin);
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'accounts', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'staff_id', s.id,
                 'staff_name', s.name,
                 'auth_user_id', s.auth_user_id,
                 'email', u.email,
                 'created_at', u.created_at
               )
               order by u.created_at desc nulls last
             )
        from public.staff_members s
        left join auth.users u on u.id::text = s.auth_user_id::text
       where s.auth_user_id is not null
    ), '[]'::jsonb)
  );
end;
$$;

-- Unlinks the staff row first so nothing points at a deleted auth user,
-- then deletes the auth user (sessions/identities cascade).
create or replace function public.admin_delete_test_account(p_pin text, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.verify_admin_pin('test-accounts', p_pin);
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;

  update public.staff_members
     set auth_user_id = null
   where auth_user_id::text = p_auth_user_id::text;

  delete from auth.users where id = p_auth_user_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.admin_list_test_accounts(text) from public;
revoke all on function public.admin_delete_test_account(text, uuid) from public;
grant execute on function public.admin_list_test_accounts(text) to anon, authenticated;
grant execute on function public.admin_delete_test_account(text, uuid) to anon, authenticated;
