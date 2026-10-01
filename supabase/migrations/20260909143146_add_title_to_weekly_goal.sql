alter table public.weekly_goal
  add column if not exists title text not null default '今週の目標';;
