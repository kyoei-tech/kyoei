
-- Q&A: questions get a separate short title + full body, answers get a title.
alter table public.qa_questions add column if not exists body text not null default '';
alter table public.qa_answers add column if not exists title text not null default '';

-- Attendance board (出勤簿)
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  role text not null default '',
  vehicle_class text not null default '',
  status text not null default 'off' check (status in ('working', 'off')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_members enable row level security;
create policy "staff_members_public_all" on public.staff_members for all using (true) with check (true);
create index if not exists idx_staff_members_sort on public.staff_members(sort_order, created_at);

-- Yard layout (ヤード配置)
create table if not exists public.yards (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.yards enable row level security;
create policy "yards_public_all" on public.yards for all using (true) with check (true);

create table if not exists public.yard_rows (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete cascade,
  label text not null default '',
  destination text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.yard_rows enable row level security;
create policy "yard_rows_public_all" on public.yard_rows for all using (true) with check (true);
create index if not exists idx_yard_rows_yard on public.yard_rows(yard_id, sort_order);

-- 初心者ノート (beginner notes)
create table if not exists public.beginner_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.beginner_notes enable row level security;
create policy "beginner_notes_public_all" on public.beginner_notes for all using (true) with check (true);

-- Realtime for all new tables
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_members') then
    alter publication supabase_realtime add table public.staff_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'yards') then
    alter publication supabase_realtime add table public.yards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'yard_rows') then
    alter publication supabase_realtime add table public.yard_rows;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'beginner_notes') then
    alter publication supabase_realtime add table public.beginner_notes;
  end if;
end $$;

-- Seed the 本郷 yard with its known position labels (destinations left blank for editing).
insert into public.yards (name, sort_order)
select '本郷', 0
where not exists (select 1 from public.yards where name = '本郷');

insert into public.yards (name, sort_order)
select '2車庫', 1
where not exists (select 1 from public.yards where name = '2車庫');

insert into public.yard_rows (yard_id, label, destination, sort_order)
select y.id, label, '', row_number() over () - 1
from public.yards y,
  unnest(array['給油所横','⓪','⓪横','①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','タンク裏','トレポ左']) as label
where y.name = '本郷'
  and not exists (select 1 from public.yard_rows r where r.yard_id = y.id);
;
