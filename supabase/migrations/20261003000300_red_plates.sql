-- 赤枠管理: the company's 回送運行許可番号標 (赤枠, all 「相模」 for now) and
-- who has taken each one out. Required record items: 持ち出し日時・使用者・
-- 使用予定地・返却日時. Everyone signed in sees which plate is out and with
-- whom; taking out and returning go through the functions below (later the
-- NFC card on each plate and the office's NFC tag will call the same ones).

create table if not exists public.red_plates (
  id uuid primary key default gen_random_uuid(),
  region text not null default '相模' check (length(trim(region)) > 0),
  number text not null check (length(trim(number)) > 0),
  note text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (region, number)
);

alter table public.red_plates enable row level security;
revoke all on public.red_plates from anon;
grant select, insert, update, delete on public.red_plates to authenticated;
create policy "kyoei red plates: read" on public.red_plates for select to authenticated using (true);
create policy "kyoei red plates: admin write" on public.red_plates for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

insert into public.red_plates (region, number, sort_order)
select '相模', n, ord * 10
from unnest(array['4218', '3987', '4219', '3494', '3515', '3516', '3517', '3518', '3714', '3495',
                  '3988', '4690', '4050', '3719', '3720', '3844', '3953', '3954']) with ordinality as t (n, ord)
on conflict (region, number) do nothing;

-- One row per 持ち出し. returned_at null = still out.
create table if not exists public.red_plate_uses (
  id uuid primary key default gen_random_uuid(),
  plate_id uuid not null references public.red_plates (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  taken_at timestamptz not null default now(),
  destination text not null check (length(trim(destination)) > 0),
  returned_at timestamptz,
  returned_by uuid references auth.users (id) on delete set null,
  -- 'app' for now; 'nfc' once the office tag is installed. 'admin' = 管理画面で返却処理.
  return_method text check (return_method in ('app', 'nfc', 'admin')),
  check (returned_at is null or returned_at >= taken_at)
);

-- A plate can be out with only one person at a time.
create unique index if not exists red_plate_uses_open on public.red_plate_uses (plate_id) where returned_at is null;
create index if not exists red_plate_uses_plate on public.red_plate_uses (plate_id, taken_at desc);
create index if not exists red_plate_uses_taken on public.red_plate_uses (taken_at desc);

alter table public.red_plate_uses enable row level security;
revoke all on public.red_plate_uses from anon, authenticated;
grant select on public.red_plate_uses to authenticated;
create policy "kyoei red plate uses: read" on public.red_plate_uses for select to authenticated
  using (exists (select 1 from public.app_accounts a where a.user_id = (select auth.uid()) and a.disabled_at is null));
-- Writes only through take_red_plate() / return_red_plate().

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'red_plate_uses') then
    alter publication supabase_realtime add table public.red_plate_uses;
  end if;
end $$;

-- "共栄 太郎" (profile), else the 出勤簿 name, else the login ID.
create or replace function public.kyoei_person_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif((select p.full_name from public.account_profiles p where p.user_id = p_user), ''),
    (select s.name from public.staff_members s where s.auth_user_id = p_user limit 1),
    (select a.login_id from public.app_accounts a where a.user_id = p_user),
    '不明'
  );
$$;
revoke all on function public.kyoei_person_name(uuid) from public, anon, authenticated;

create or replace function public.kyoei_account_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_accounts a where a.user_id = auth.uid() and a.disabled_at is null);
$$;
revoke all on function public.kyoei_account_enabled() from public, anon;
grant execute on function public.kyoei_account_enabled() to authenticated;

-- Every active plate with its current 持ち出し (if any).
create or replace function public.red_plate_board()
returns table (
  plate_id uuid, region text, number text, note text, sort_order int,
  use_id uuid, user_id uuid, holder_name text, taken_at timestamptz, destination text
)
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
    select p.id, p.region, p.number, p.note, p.sort_order,
           u.id, u.user_id, case when u.id is null then null else public.kyoei_person_name(u.user_id) end, u.taken_at, u.destination
      from public.red_plates p
      left join public.red_plate_uses u on u.plate_id = p.id and u.returned_at is null
     where p.active
     order by p.sort_order, p.number;
end;
$$;
revoke all on function public.red_plate_board() from public, anon;
grant execute on function public.red_plate_board() to authenticated;

-- A plate's 持ち出し記録, newest first.
create or replace function public.red_plate_history(p_plate uuid, p_limit int default 30)
returns table (
  use_id uuid, user_id uuid, user_name text, taken_at timestamptz, destination text,
  returned_at timestamptz, returned_by_name text, return_method text
)
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
    select u.id, u.user_id, public.kyoei_person_name(u.user_id), u.taken_at, u.destination,
           u.returned_at, case when u.returned_by is null then null else public.kyoei_person_name(u.returned_by) end, u.return_method
      from public.red_plate_uses u
     where u.plate_id = p_plate
     order by u.taken_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 200);
end;
$$;
revoke all on function public.red_plate_history(uuid, int) from public, anon;
grant execute on function public.red_plate_history(uuid, int) to authenticated;

-- 持ち出し: the signed-in user takes the plate out to p_destination.
create or replace function public.take_red_plate(p_plate uuid, p_destination text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_destination, ''))) = 0 then
    raise exception 'destination required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.red_plates p where p.id = p_plate and p.active) then
    raise exception 'unknown plate' using errcode = '22023';
  end if;
  insert into public.red_plate_uses (plate_id, user_id, destination)
  values (p_plate, auth.uid(), left(trim(p_destination), 200))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'already taken' using errcode = '23505';
end;
$$;
revoke all on function public.take_red_plate(uuid, text) from public, anon;
grant execute on function public.take_red_plate(uuid, text) to authenticated;

-- 返却: by the person who took it out, or by an admin from the console.
create or replace function public.return_red_plate(p_use uuid, p_method text default 'app')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_kyoei_admin_mfa();
begin
  if not public.kyoei_account_enabled() then
    raise exception 'account required' using errcode = '42501';
  end if;
  if p_method not in ('app', 'nfc', 'admin') or (p_method = 'admin' and not v_admin) then
    raise exception 'invalid method' using errcode = '22023';
  end if;
  update public.red_plate_uses u
     set returned_at = now(), returned_by = auth.uid(), return_method = p_method
   where u.id = p_use and u.returned_at is null
     and (u.user_id = auth.uid() or v_admin);
  if not found then
    raise exception 'not returnable' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.return_red_plate(uuid, text) from public, anon;
grant execute on function public.return_red_plate(uuid, text) to authenticated;
