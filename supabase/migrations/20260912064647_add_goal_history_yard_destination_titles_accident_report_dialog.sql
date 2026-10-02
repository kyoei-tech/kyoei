
-- 1. weekly_goal: add next-month draft + content month tracking
alter table public.weekly_goal
  add column if not exists next_content text not null default '',
  add column if not exists next_content_set_at timestamptz,
  add column if not exists content_month text;

update public.weekly_goal
  set content_month = to_char(now(), 'YYYY-MM')
  where content_month is null;

alter table public.weekly_goal
  alter column content_month set not null,
  alter column content_month set default to_char(now(), 'YYYY-MM');

-- 2. weekly_goal_history: per-month goal history
create table if not exists public.weekly_goal_history (
  goal_id text not null,
  month text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (goal_id, month)
);

alter table public.weekly_goal_history enable row level security;

drop policy if exists "weekly_goal_history_public_all" on public.weekly_goal_history;
create policy "weekly_goal_history_public_all" on public.weekly_goal_history
  for all using (true) with check (true);

-- 3. yard_destination_titles / yard_destination_stores
create table if not exists public.yard_destination_titles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.yard_destination_stores (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.yard_destination_titles(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.yard_destination_titles enable row level security;
alter table public.yard_destination_stores enable row level security;

drop policy if exists "yard_destination_titles_public_all" on public.yard_destination_titles;
create policy "yard_destination_titles_public_all" on public.yard_destination_titles
  for all using (true) with check (true);

drop policy if exists "yard_destination_stores_public_all" on public.yard_destination_stores;
create policy "yard_destination_stores_public_all" on public.yard_destination_stores
  for all using (true) with check (true);

insert into public.yard_destination_titles (title, sort_order)
select title, sort_order
from (values
  ('一般', 0),
  ('国内船港', 1),
  ('輸出', 2),
  ('ネクステージ', 3),
  ('各AA', 4),
  ('名古屋方面', 5),
  ('USS東京・野田方面', 6),
  ('木更津', 7)
) as seed(title, sort_order)
where not exists (select 1 from public.yard_destination_titles);

-- 4. confirm_action_messages: accident report reset dialog
insert into public.confirm_action_messages (id, label, message, confirm_label, cancel_label)
values (
  'accident-report-reset',
  '事故報告：入力内容のリセット',
  '入力内容をリセットしますか？
この操作は取り消せません。',
  'リセットする',
  'キャンセル'
)
on conflict (id) do nothing;
;
