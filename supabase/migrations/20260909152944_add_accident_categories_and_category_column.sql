create table if not exists public.accident_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.accident_categories (name, sort_order) values
  ('交通事故', 1),
  ('商品車事故', 2),
  ('物損事故', 3),
  ('誤輸送', 4),
  ('盗難事故', 5),
  ('事務所ミス', 6)
on conflict (name) do nothing;

alter table public.accident_categories enable row level security;

create policy accident_categories_public_all
  on public.accident_categories
  for all
  using (true)
  with check (true);

alter publication supabase_realtime add table public.accident_categories;

alter table public.accident_records
  add column if not exists category text not null default '';;
