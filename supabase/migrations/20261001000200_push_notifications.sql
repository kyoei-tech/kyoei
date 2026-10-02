-- Real-time remote push for the iOS app.
--
--   news_posts INSERT / staff_members.status UPDATE
--     → AFTER trigger → pg_net HTTP POST (async, non-blocking)
--     → Edge Function `push-dispatch` (supabase/functions/push-dispatch)
--     → APNs (HTTP/2, token auth) → every subscribed device, instantly,
--       even while the app is closed.
--
-- Driving-timer alerts are not here: the app schedules those as local
-- notifications, which already fire on time with no network.
--
-- One-time setup after applying (values are not stored in this file):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push-dispatch', 'push_dispatch_url');
--   select vault.create_secret('<long random string>', 'push_webhook_secret');
-- and set the same PUSH_WEBHOOK_SECRET on the Edge Function (see its README).
-- Until both secrets exist the triggers are silent no-ops.

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Device tokens. No RLS policies: the anon key can neither read nor write the
-- table directly; devices go through the SECURITY DEFINER RPCs below, and the
-- Edge Function reads it with the service role.
-- ---------------------------------------------------------------------------
create table if not exists public.device_push_tokens (
  device_id text primary key,
  apns_token text not null unique,
  apns_environment text not null check (apns_environment in ('sandbox', 'production')),
  -- 設定 > 乗務員ID. Used to skip notifying a driver about their own status change.
  staff_member_id text,
  -- Which events this device wants: 'news', 'staff_status'.
  topics text[] not null default array['news', 'staff_status'],
  updated_at timestamptz not null default now()
);

alter table public.device_push_tokens enable row level security;

create index if not exists device_push_tokens_topics_idx on public.device_push_tokens using gin (topics);

create or replace function public.register_push_token(
  p_device_id text,
  p_apns_token text,
  p_apns_environment text,
  p_staff_member_id text,
  p_topics text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_device_id is null or length(p_device_id) < 8 then
    raise exception 'invalid device id';
  end if;
  if p_apns_token !~ '^[0-9a-f]{64,200}$' then
    raise exception 'invalid apns token';
  end if;

  -- A token belongs to one installation; if it moved (reinstall with a new
  -- device id), drop the stale row first so the unique constraint holds.
  delete from public.device_push_tokens
   where apns_token = p_apns_token and device_id <> p_device_id;

  insert into public.device_push_tokens as t
    (device_id, apns_token, apns_environment, staff_member_id, topics, updated_at)
  values
    (p_device_id, p_apns_token, p_apns_environment, nullif(p_staff_member_id, ''),
     coalesce(p_topics, array[]::text[]), now())
  on conflict (device_id) do update
    set apns_token = excluded.apns_token,
        apns_environment = excluded.apns_environment,
        staff_member_id = excluded.staff_member_id,
        topics = excluded.topics,
        updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_device_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.device_push_tokens where device_id = p_device_id;
$$;

revoke all on function public.register_push_token(text, text, text, text, text[]) from public;
revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.register_push_token(text, text, text, text, text[]) to anon, authenticated;
grant execute on function public.unregister_push_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Change hooks. Sends a Supabase-webhook-shaped payload
-- ({type, table, schema, record, old_record}) to the Edge Function.
-- pg_net queues the request and returns immediately, so the triggering
-- insert/update is never slowed down or failed by push delivery.
-- ---------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.dispatch_push_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-webhook-secret', v_secret
    )
  );
  return null;
end;
$$;

revoke all on function private.dispatch_push_event() from public;

drop trigger if exists news_posts_push on public.news_posts;
create trigger news_posts_push
  after insert on public.news_posts
  for each row execute function private.dispatch_push_event();

drop trigger if exists staff_members_status_push on public.staff_members;
create trigger staff_members_status_push
  after update of status on public.staff_members
  for each row
  when (old.status is distinct from new.status)
  execute function private.dispatch_push_event();
