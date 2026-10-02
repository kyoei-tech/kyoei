-- 配車表: server-side parsing (Edge Function parse-dispatch-sheet) and the
-- driver's own 車台番号 camera checks / records, and confirmations that a
-- blank 車体番号 really is blank.

-- Parse bookkeeping. extracted_data / dispatch_date already exist (written by
-- the web app's in-browser parser, which recorded no version).
alter table public.dispatch_sheets
  add column if not exists parser_version integer,
  add column if not exists parse_error text,
  add column if not exists parsed_at timestamptz;

-- One row per vehicle whose 車台番号 the driver read with the camera:
--  - 照合: the sheet prints a 車体番号 and the plate matched it exactly
--    (vehicle_index is null; the row is found by chassis_number);
--  - 記録: the sheet's 車体番号 is blank, so the number read off the real
--    car is recorded for that vehicle (vehicle_index = its 0-based position
--    on the sheet, as in extracted_data).
-- Personal: tied to the signed-in account (so it follows the driver to any
-- device) and never visible to anyone else, the office included.
create table if not exists public.dispatch_chassis_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sheet_id uuid not null references public.dispatch_sheets (id) on delete cascade,
  -- Normalized form (uppercase ASCII, "-" hyphen, no spaces).
  chassis_number text not null check (chassis_number ~ '^[A-Z0-9-]{4,24}$'),
  vehicle_index integer check (vehicle_index >= 0),
  method text not null check (method in ('caution_plate', 'stamp')),
  checked_at timestamptz not null default now(),
  unique (user_id, sheet_id, chassis_number)
);

create index if not exists dispatch_chassis_checks_sheet on public.dispatch_chassis_checks (sheet_id);

-- A blank-numbered vehicle gets at most one recorded number.
create unique index if not exists dispatch_chassis_checks_recorded
  on public.dispatch_chassis_checks (user_id, sheet_id, vehicle_index)
  where vehicle_index is not null;

alter table public.dispatch_chassis_checks enable row level security;

grant select, insert, delete on public.dispatch_chassis_checks to authenticated;

create policy "kyoei chassis checks: read own"
  on public.dispatch_chassis_checks for select to authenticated
  using (user_id = (select auth.uid()));

-- Only for a sheet the driver uploaded themselves (its original sits in
-- their own "<auth uid>/" folder).
create policy "kyoei chassis checks: insert own"
  on public.dispatch_chassis_checks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dispatch_sheets s
      where s.id = sheet_id and split_part(s.blob_url, '/', 1) = (select auth.uid())::text
    )
  );

create policy "kyoei chassis checks: delete own"
  on public.dispatch_chassis_checks for delete to authenticated
  using (user_id = (select auth.uid()));

-- 車体番号が空欄の車: the driver confirmed against the original sheet and
-- the 伝票 that the number really is blank, before the record button is
-- shown. One row per vehicle (vehicle_index = its 0-based position on the
-- sheet). Personal, like the checks above, and kept per account so the
-- confirmation shows on every device.
create table if not exists public.dispatch_blank_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sheet_id uuid not null references public.dispatch_sheets (id) on delete cascade,
  vehicle_index integer not null check (vehicle_index >= 0),
  acknowledged_at timestamptz not null default now(),
  unique (user_id, sheet_id, vehicle_index)
);

alter table public.dispatch_blank_acknowledgments enable row level security;

grant select, insert, delete on public.dispatch_blank_acknowledgments to authenticated;

create policy "kyoei blank acknowledgments: read own"
  on public.dispatch_blank_acknowledgments for select to authenticated
  using (user_id = (select auth.uid()));

create policy "kyoei blank acknowledgments: insert own"
  on public.dispatch_blank_acknowledgments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dispatch_sheets s
      where s.id = sheet_id and split_part(s.blob_url, '/', 1) = (select auth.uid())::text
    )
  );

create policy "kyoei blank acknowledgments: delete own"
  on public.dispatch_blank_acknowledgments for delete to authenticated
  using (user_id = (select auth.uid()));

-- Live updates for the driver's other devices (RLS still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dispatch_chassis_checks, public.dispatch_blank_acknowledgments;
  end if;
end $$;
