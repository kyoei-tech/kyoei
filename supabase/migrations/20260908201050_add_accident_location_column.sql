alter table public.accident_records
  add column if not exists location text not null default '';;
