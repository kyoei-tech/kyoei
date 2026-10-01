-- yard managers (today's yard manager roster, editable like staff_members)
create table if not exists public.yard_managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  employment_type text not null check (employment_type in ('regular', 'parttime')),
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.yard_managers enable row level security;

create policy "Public full access to yard_managers"
  on public.yard_managers
  for all
  to public
  using (true)
  with check (true);

alter publication supabase_realtime add table public.yard_managers;

-- timecard mode shared memo log (append-only entries, shown in one growing box)
create table if not exists public.timecard_shared_memos (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.timecard_shared_memos enable row level security;

create policy "Public full access to timecard_shared_memos"
  on public.timecard_shared_memos
  for all
  to public
  using (true)
  with check (true);

alter publication supabase_realtime add table public.timecard_shared_memos;

-- separate weekly goal row for timecard mode
insert into public.weekly_goal (id, title, content)
values ('timecard', '今週の目標', 'まだ目標が設定されていません。')
on conflict (id) do nothing;
;
