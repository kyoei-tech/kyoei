-- 配車表 rows become personal: only the driver who uploaded a sheet (the
-- auth account linked to its uploaded_by_staff_id) can see or change it.
-- Until now dispatch_sheets was readable and writable by anyone holding
-- the public anon key (dispatch_sheets_public_all), extracted data and all.
--
-- Ownership goes through staff_members.auth_user_id, which both the web
-- app and the iOS app already use to find "my" sheets. That link is only
-- trustworthy if it cannot be rewritten by others, so this migration also
-- protects it: from the app roles (anon / authenticated) a link can only be
-- claimed while empty, by the signed-in user for themselves, or released by
-- its own holder. staff_members otherwise stays shared, as before.
--
-- Not affected: the service role (web /api/test-accounts, Edge Functions,
-- scripts), SECURITY DEFINER functions (admin_delete_test_account), and the
-- ON DELETE SET NULL from auth.users — none of them run as anon or
-- authenticated.

-- ---------------------------------------------------------------------------
-- staff_members.auth_user_id: no hijacking another driver's link.
-- ---------------------------------------------------------------------------
create or replace function private.guard_staff_auth_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.auth_user_id is not null and new.auth_user_id is distinct from auth.uid() then
      raise exception 'staff_members.auth_user_id can only be set to your own account'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    -- coalesce: with no session auth.uid() is null, and a null condition
    -- must count as "not allowed", never fall through.
    if not coalesce(
      auth.uid() is not null and (
        (old.auth_user_id is null and new.auth_user_id = auth.uid())   -- claim an unlinked row
        or (old.auth_user_id = auth.uid() and new.auth_user_id is null) -- release your own link
      ),
      false
    ) then
      raise exception 'staff_members.auth_user_id can only be claimed while unlinked, by yourself'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_members_guard_auth_link on public.staff_members;
create trigger staff_members_guard_auth_link
  before insert or update of auth_user_id on public.staff_members
  for each row execute function private.guard_staff_auth_link();

-- ---------------------------------------------------------------------------
-- dispatch_sheets: owner only.
-- ---------------------------------------------------------------------------
drop policy if exists dispatch_sheets_public_all on public.dispatch_sheets;

create policy "kyoei dispatch sheets rows: read own"
  on public.dispatch_sheets for select to authenticated
  using (exists (
    select 1 from public.staff_members m
    where m.id = uploaded_by_staff_id and m.auth_user_id = (select auth.uid())
  ));

create policy "kyoei dispatch sheets rows: insert own"
  on public.dispatch_sheets for insert to authenticated
  with check (exists (
    select 1 from public.staff_members m
    where m.id = uploaded_by_staff_id and m.auth_user_id = (select auth.uid())
  ));

create policy "kyoei dispatch sheets rows: update own"
  on public.dispatch_sheets for update to authenticated
  using (exists (
    select 1 from public.staff_members m
    where m.id = uploaded_by_staff_id and m.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.staff_members m
    where m.id = uploaded_by_staff_id and m.auth_user_id = (select auth.uid())
  ));

create policy "kyoei dispatch sheets rows: delete own"
  on public.dispatch_sheets for delete to authenticated
  using (exists (
    select 1 from public.staff_members m
    where m.id = uploaded_by_staff_id and m.auth_user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Chassis checks / blank acknowledgments: the sheet must be one the caller
-- can see (i.e. their own, per the policies above). The previous check
-- looked at the Storage folder in blob_url, which sheets uploaded on the web
-- (still in Vercel Blob) don't have.
-- ---------------------------------------------------------------------------
drop policy if exists "kyoei chassis checks: insert own" on public.dispatch_chassis_checks;
create policy "kyoei chassis checks: insert own"
  on public.dispatch_chassis_checks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.dispatch_sheets s where s.id = sheet_id)
  );

drop policy if exists "kyoei blank acknowledgments: insert own" on public.dispatch_blank_acknowledgments;
create policy "kyoei blank acknowledgments: insert own"
  on public.dispatch_blank_acknowledgments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.dispatch_sheets s where s.id = sheet_id)
  );
