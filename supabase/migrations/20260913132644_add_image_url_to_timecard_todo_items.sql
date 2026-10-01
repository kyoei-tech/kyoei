alter table public.timecard_todo_items
  add column if not exists image_url text;

insert into public.timecard_todo_items (title, body, image_url)
values ('テスト', '', '/images/todo-vehicle-transport-form.png')
on conflict do nothing;
;
