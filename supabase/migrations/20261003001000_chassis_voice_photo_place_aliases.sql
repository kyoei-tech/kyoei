-- 配車表 (2026-10-03 追加分)
--
-- 1. 車台番号の照合: when the shutter photo can't be read (汚れ・サビ) the
--    driver enters the number by voice and the photo is kept with the 照合.
--    Until now only a 記録 (blank 車体番号) could hold a photo.
alter table public.dispatch_chassis_checks drop constraint if exists dispatch_chassis_checks_photo_only_records;
alter table public.dispatch_chassis_checks add constraint dispatch_chassis_checks_photo_only_records
  check (photo_path is null or vehicle_index is not null or input = 'voice');

-- 2. 似た名前の場所:「○○と○○は同じ場所ですか？」 answered once per pair and
--    applied to every sheet (回戦まとめ groups the two spellings as one).
--    Personal, like the chassis checks: only the driver who answered sees it.
--    The app stores each pair in one fixed order (PlacePair), so either
--    spelling finds it. (No check here: the database's collation may order
--    the two names differently from the app.)
create table if not exists public.dispatch_place_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_a text not null check (length(name_a) > 0),
  name_b text not null check (length(name_b) > 0),
  same boolean not null,
  answered_at timestamptz not null default now(),
  unique (user_id, name_a, name_b)
);

alter table public.dispatch_place_aliases enable row level security;

grant select, insert, update, delete on public.dispatch_place_aliases to authenticated;

create policy "kyoei place aliases: read own"
  on public.dispatch_place_aliases for select to authenticated
  using (user_id = (select auth.uid()));

create policy "kyoei place aliases: insert own"
  on public.dispatch_place_aliases for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "kyoei place aliases: update own"
  on public.dispatch_place_aliases for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "kyoei place aliases: delete own"
  on public.dispatch_place_aliases for delete to authenticated
  using (user_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dispatch_place_aliases;
  end if;
end $$;
