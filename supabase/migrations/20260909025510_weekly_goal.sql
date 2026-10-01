create table if not exists public.weekly_goal (
  id text primary key default 'current',
  content text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.weekly_goal (id, content)
values ('current', '')
on conflict (id) do nothing;

alter table public.weekly_goal enable row level security;

create policy weekly_goal_public_all on public.weekly_goal
  for all to public using (true) with check (true);

alter publication supabase_realtime add table public.weekly_goal;;
