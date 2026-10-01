create table if not exists public.timecard_todo_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

alter table public.timecard_todo_items enable row level security;

create policy "timecard_todo_items_select_all" on public.timecard_todo_items
  for select using (true);
create policy "timecard_todo_items_insert_all" on public.timecard_todo_items
  for insert with check (true);
create policy "timecard_todo_items_update_all" on public.timecard_todo_items
  for update using (true);
create policy "timecard_todo_items_delete_all" on public.timecard_todo_items
  for delete using (true);

insert into public.timecard_todo_items (title, body)
values ('編集中', '【添付した画像を表示】');
;
