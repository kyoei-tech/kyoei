-- Admin console (admin/): customers for the app's offline customer search,
-- an append-only audit log, and helpers. Everything here requires an admin
-- whose session passed two-factor authentication (aal2): a stolen password
-- alone opens nothing.

-- True for an enabled admin whose current session is MFA-verified.
create or replace function public.is_kyoei_admin_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (
       select 1 from public.app_accounts a
       where a.user_id = auth.uid() and a.is_admin and a.disabled_at is null
     );
$$;

-- True for an enabled account allowed to search customers (the app syncs them).
create or replace function public.can_search_kyoei_customers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_accounts a
    where a.user_id = auth.uid() and a.can_search_customers and a.disabled_at is null
  );
$$;

revoke all on function public.is_kyoei_admin_mfa() from public, anon;
revoke all on function public.can_search_kyoei_customers() from public, anon;
grant execute on function public.is_kyoei_admin_mfa() to authenticated;
grant execute on function public.can_search_kyoei_customers() to authenticated;

-- The admin console lists every account only from an MFA-verified session.
drop policy if exists "kyoei accounts: admins read all" on public.app_accounts;
create policy "kyoei accounts: admins read all"
  on public.app_accounts for select to authenticated
  using ((select public.is_kyoei_admin_mfa()));

-- ---------------------------------------------------------------------------
-- Customers: one member (会員名 + よみ) holds member numbers at venues (会場).
-- A venue's member number belongs to exactly one member.
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kana text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, kana)
);

create table if not exists public.customer_numbers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  venue text not null check (length(trim(venue)) > 0),
  member_number text not null check (length(trim(member_number)) > 0),
  created_at timestamptz not null default now(),
  unique (venue, member_number)
);

create index if not exists customer_numbers_customer on public.customer_numbers (customer_id);

alter table public.customers enable row level security;
alter table public.customer_numbers enable row level security;
revoke all on public.customers, public.customer_numbers from anon;
grant select, insert, update, delete on public.customers, public.customer_numbers to authenticated;

create policy "kyoei customers: read" on public.customers for select to authenticated
  using ((select public.is_kyoei_admin_mfa()) or (select public.can_search_kyoei_customers()));
create policy "kyoei customers: admin write" on public.customers for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));
create policy "kyoei customer numbers: read" on public.customer_numbers for select to authenticated
  using ((select public.is_kyoei_admin_mfa()) or (select public.can_search_kyoei_customers()));
create policy "kyoei customer numbers: admin write" on public.customer_numbers for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

-- ---------------------------------------------------------------------------
-- Audit log: append-only. Readable by MFA-verified admins; rows are written
-- by log_admin_action() (from an admin session) or by the admin console's
-- server with the service role. Nobody can update or delete them.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  actor_label text not null,
  category text not null,
  target text not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_log_at on public.admin_audit_log (at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
create policy "kyoei audit: admins read" on public.admin_audit_log for select to authenticated
  using ((select public.is_kyoei_admin_mfa()));

-- "小西（kyoei0026）" for the signed-in admin.
create or replace function public.kyoei_actor_label(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.name || '（' || a.login_id || '）'
       from public.app_accounts a left join public.staff_members s on s.auth_user_id = a.user_id
      where a.user_id = p_user limit 1),
    (select a.login_id from public.app_accounts a where a.user_id = p_user),
    '不明'
  );
$$;
revoke all on function public.kyoei_actor_label(uuid) from public, anon, authenticated;

create or replace function public.log_admin_action(p_category text, p_target text, p_action text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  insert into public.admin_audit_log (actor, actor_label, category, target, action, detail)
  values (auth.uid(), public.kyoei_actor_label(auth.uid()), p_category, p_target, p_action, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- CSV import: rows of {name, kana, venue, number}. Adds members and member
-- numbers; never deletes. A venue's number already held by a different
-- member (or claimed twice in the file) is reported per row and skipped.
-- With p_dry_run nothing is written: the counts are a preview.
-- ---------------------------------------------------------------------------
create or replace function public.import_customers(p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_index int := 0;
  v_name text; v_kana text; v_venue text; v_number text;
  v_customer uuid;
  v_owner uuid;
  v_new_customers int := 0;
  v_new_numbers int := 0;
  v_unchanged int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if not public.is_kyoei_admin_mfa() then
    raise exception 'admin with two-factor authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be an array';
  end if;

  begin
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_index := v_index + 1;
      v_name := trim(coalesce(v_row ->> 'name', ''));
      v_kana := trim(coalesce(v_row ->> 'kana', ''));
      v_venue := trim(coalesce(v_row ->> 'venue', ''));
      v_number := trim(coalesce(v_row ->> 'number', ''));
      if v_name = '' then
        v_errors := v_errors || jsonb_build_object('row', v_index, 'message', '会員名が空です'); continue;
      end if;
      if v_venue = '' then
        v_errors := v_errors || jsonb_build_object('row', v_index, 'message', '会場名が空です'); continue;
      end if;
      if v_number = '' then
        v_errors := v_errors || jsonb_build_object('row', v_index, 'message', '会員番号が空です'); continue;
      end if;

      select id into v_customer from public.customers where name = v_name and kana = v_kana;
      if v_customer is null then
        insert into public.customers (name, kana) values (v_name, v_kana) returning id into v_customer;
        v_new_customers := v_new_customers + 1;
      end if;

      select customer_id into v_owner from public.customer_numbers where venue = v_venue and member_number = v_number;
      if v_owner is null then
        insert into public.customer_numbers (customer_id, venue, member_number) values (v_customer, v_venue, v_number);
        v_new_numbers := v_new_numbers + 1;
      elsif v_owner = v_customer then
        v_unchanged := v_unchanged + 1;
      else
        v_errors := v_errors || jsonb_build_object('row', v_index, 'message',
          '「' || v_venue || '」の会員番号 ' || v_number || ' は、別の会員名で登録されています');
      end if;
    end loop;

    v_result := jsonb_build_object(
      'rows', v_index, 'newCustomers', v_new_customers, 'newNumbers', v_new_numbers,
      'unchanged', v_unchanged, 'errors', v_errors, 'dryRun', p_dry_run);

    if p_dry_run then
      -- Roll back everything above; the counts stay in v_result.
      raise exception using errcode = 'P0001', message = 'kyoei_dry_run';
    end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'kyoei_dry_run' then raise; end if;
  end;

  if not p_dry_run then
    perform public.log_admin_action('customers', 'CSV 取り込み', 'import',
      jsonb_build_object('rows', v_index, 'newCustomers', v_new_customers, 'newNumbers', v_new_numbers, 'errors', jsonb_array_length(v_errors)));
  end if;
  return v_result;
end;
$$;
revoke all on function public.import_customers(jsonb, boolean) from public, anon;
grant execute on function public.import_customers(jsonb, boolean) to authenticated;

-- Unused setup codes (for the console's "期限間近" list).
create or replace function public.admin_pending_setup_codes()
returns table (user_id uuid, login_id text, purpose text, expires_at timestamptz)
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
    select t.user_id, a.login_id, t.purpose, t.expires_at
      from private.account_setup_tokens t join public.app_accounts a on a.user_id = t.user_id
     where t.used_at is null and t.expires_at > now()
     order by t.expires_at;
end;
$$;
revoke all on function public.admin_pending_setup_codes() from public, anon;
grant execute on function public.admin_pending_setup_codes() to authenticated;
