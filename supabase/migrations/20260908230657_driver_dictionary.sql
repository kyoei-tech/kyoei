create table if not exists public.dictionary_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.dictionary_terms (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  term text not null,
  reading text not null default '',
  meaning text not null default '',
  antonym text not null default '',
  example text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dictionary_terms_reading_idx on public.dictionary_terms (reading);
create index if not exists dictionary_terms_category_idx on public.dictionary_terms (category);

alter table public.dictionary_categories enable row level security;
alter table public.dictionary_terms enable row level security;

create policy dictionary_categories_public_all on public.dictionary_categories
  for all to public using (true) with check (true);

create policy dictionary_terms_public_all on public.dictionary_terms
  for all to public using (true) with check (true);

alter publication supabase_realtime add table public.dictionary_categories;
alter publication supabase_realtime add table public.dictionary_terms;;
