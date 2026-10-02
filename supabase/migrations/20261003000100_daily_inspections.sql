-- 点検簿: the daily inspection (日常点検) each driver records in the app
-- before 出庫. Items follow 自動車点検基準 別表第1 (事業用自動車の日常点検基準)
-- plus company items for car carriers, and are edited from the admin console.
--
-- Records are the legal inspection log: drivers can add their own but never
-- change or delete them; MFA-verified admins can read everyone's.

-- ---------------------------------------------------------------------------
-- 点検項目
--   frequency: every (毎回) / weekly (週1) / monthly (月1)
--   scope:     each_unit — 単車・ヘッドと台車のそれぞれ
--              powered   — 単車・ヘッドのみ（エンジン・ブレーキ操作など）
--              deck      — 積載部（単車は車両、トレーラーは台車）
--              coupling  — 連結部（トレーラーのみ、1回）
--              once      — 1回の点検で1回（非常用具・書類など）
--   classes:   the 担当車格 it applies to; null = all
-- ---------------------------------------------------------------------------
create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (length(trim(section)) > 0),
  label text not null check (length(trim(label)) > 0),
  frequency text not null default 'every' check (frequency in ('every', 'weekly', 'monthly')),
  scope text not null default 'each_unit' check (scope in ('each_unit', 'powered', 'deck', 'coupling', 'once')),
  classes text[],
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.inspection_items enable row level security;
revoke all on public.inspection_items from anon;
grant select, insert, update, delete on public.inspection_items to authenticated;
create policy "kyoei inspection items: read" on public.inspection_items for select to authenticated using (true);
create policy "kyoei inspection items: admin write" on public.inspection_items for all to authenticated
  using ((select public.is_kyoei_admin_mfa())) with check ((select public.is_kyoei_admin_mfa()));

insert into public.inspection_items (section, label, frequency, scope, classes, sort_order)
select * from (values
  ('ブレーキ', 'ブレーキ・ペダルの踏みしろが適当で、ブレーキの効きが十分である', 'every', 'powered', null::text[], 10),
  ('ブレーキ', 'ブレーキ液の量が適当である', 'every', 'powered', null, 20),
  ('ブレーキ', '空気圧力の上がり具合が不良でない', 'every', 'powered', null, 30),
  ('ブレーキ', 'ブレーキ・ペダルを踏み込んで放したとき、ブレーキ・バルブからの排気音が正常である', 'every', 'powered', null, 40),
  ('ブレーキ', '駐車ブレーキ・レバーの引きしろが適当である', 'every', 'powered', null, 50),
  ('タイヤ', '空気圧が適当である', 'every', 'each_unit', null, 60),
  ('タイヤ', '亀裂・損傷がない', 'every', 'each_unit', null, 70),
  ('タイヤ', '異状な摩耗がない', 'weekly', 'each_unit', null, 80),
  ('タイヤ', '溝の深さが十分である', 'every', 'each_unit', null, 90),
  ('タイヤ', 'ディスク・ホイールの取付状態が不良でない（ナットの緩み・脱落がない）', 'every', 'each_unit', null, 100),
  ('バッテリ', '液量が適当である', 'weekly', 'powered', null, 110),
  ('原動機', '冷却水の量が適当である', 'every', 'powered', null, 120),
  ('原動機', 'ファン・ベルトの張り具合が適当で、損傷がない', 'weekly', 'powered', null, 130),
  ('原動機', 'エンジン・オイルの量が適当である', 'weekly', 'powered', null, 140),
  ('原動機', 'かかり具合が不良でなく、異音がない', 'weekly', 'powered', null, 150),
  ('原動機', '低速及び加速の状態が適当である', 'weekly', 'powered', null, 160),
  ('灯火装置・方向指示器', '点灯・点滅具合が不良でなく、汚れ・損傷がない', 'every', 'each_unit', null, 170),
  ('ウインド・ウォッシャ・ワイパー', 'ウォッシャ液の量が適当で、噴射状態が不良でない', 'weekly', 'powered', null, 180),
  ('ウインド・ウォッシャ・ワイパー', 'ワイパーの払拭状態が不良でない', 'weekly', 'powered', null, 190),
  ('エア・タンク', 'エア・タンクに凝水がない', 'every', 'each_unit', null, 200),
  ('積載装置', 'デッキ・荷台の昇降・スライドが正常で、油漏れがない', 'every', 'deck', null, 210),
  ('積載装置', '上段デッキのロック・ストッパーが確実にかかる', 'every', 'deck',
     array['two_car', 'heavy', 'three_car', 'five_car', 'trailer_hanging', 'trailer_lifter', 'cab_trailer_hanging', 'cab_trailer_lifter'], 220),
  ('ウインチ', '作動が正常で、ワイヤーにほつれ・キンクがない', 'every', 'deck', null, 230),
  ('固縛具', 'ラッシングベルト・チェーン・タイヤ止めに損傷がなく、数が揃っている', 'every', 'once', null, 240),
  ('歩み板', '変形・亀裂がなく、確実に固定されている', 'every', 'deck', null, 250),
  ('宙吊り装置', '吊り具・フックに損傷がない', 'every', 'deck', array['trailer_hanging', 'cab_trailer_hanging'], 260),
  ('連結装置', 'カプラーが確実に連結され、キングピンに損傷がない', 'every', 'coupling', null, 270),
  ('連結装置', 'エアホース・電気配線の接続が確実で、損傷がない', 'every', 'coupling', null, 280),
  ('非常用具', '発炎筒・停止表示板・消火器・輪止めがある', 'every', 'once', null, 290),
  ('書類', '車検証・保険証書が車内にある（トレーラーは台車の分も）', 'every', 'once', null, 300)
) as seed (section, label, frequency, scope, classes, sort_order)
where not exists (select 1 from public.inspection_items);

-- ---------------------------------------------------------------------------
-- 点検記録. One row per completed inspection (a trailer's head, coupling and
-- chassis are one row). results is the checked list as shown:
--   [{ item_id, unit: 'vehicle'|'chassis'|null, plate, section, label,
--      result: 'ok'|'ng'|'na', note, photo_path, follow_up }]
-- Any 'ng' needs the report to the 運行管理者 (reported_to, reported_at,
-- instruction). The driver may depart when there is no 'ng' or the
-- instruction is 'ok' (運行可).
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_inspections (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  inspected_on date not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  vehicle_class text,
  vehicle_plate text not null default '',
  chassis_plate text,
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  has_issue boolean not null,
  reported_to text,
  reported_at timestamptz,
  instruction text check (instruction in ('ok', 'after_repair', 'no_go')),
  instruction_note text not null default '',
  created_at timestamptz not null default now(),
  constraint vehicle_inspections_issue check (
    has_issue = jsonb_path_exists(results, '$[*] ? (@.result == "ng")')
  ),
  constraint vehicle_inspections_report check (
    not has_issue or (length(trim(coalesce(reported_to, ''))) > 0 and reported_at is not null and instruction is not null)
  )
);

create index if not exists vehicle_inspections_user_day on public.vehicle_inspections (user_id, inspected_on desc);
create index if not exists vehicle_inspections_day on public.vehicle_inspections (inspected_on desc);

alter table public.vehicle_inspections enable row level security;
revoke all on public.vehicle_inspections from anon, authenticated;
grant select, insert on public.vehicle_inspections to authenticated;
create policy "kyoei inspections: read own" on public.vehicle_inspections for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_kyoei_admin_mfa()));
create policy "kyoei inspections: add own" on public.vehicle_inspections for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Photos of a 否 item: bucket inspection-photos, "<auth uid>/<file>".
-- Drivers write and read their own folder; admins read all.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do nothing;

create policy "kyoei inspection photos: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos' and (
    (storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_kyoei_admin_mfa())
  ));
create policy "kyoei inspection photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
