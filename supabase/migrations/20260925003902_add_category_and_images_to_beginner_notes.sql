alter table public.beginner_notes
  add column if not exists category text not null default '未分類',
  add column if not exists image_paths text[] not null default '{}'::text[];;
