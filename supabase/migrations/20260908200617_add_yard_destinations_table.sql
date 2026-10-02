create table if not exists public.yard_destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.yard_destinations enable row level security;

create policy "yard_destinations_select" on public.yard_destinations
  for select using (true);
create policy "yard_destinations_insert" on public.yard_destinations
  for insert with check (true);
create policy "yard_destinations_update" on public.yard_destinations
  for update using (true);
create policy "yard_destinations_delete" on public.yard_destinations
  for delete using (true);

-- Seed from any distinct destination values already typed into yard_rows,
-- so existing data isn't lost when the field becomes a managed dropdown.
insert into public.yard_destinations (name, sort_order)
select distinct trim(destination), 0
from public.yard_rows
where trim(destination) <> ''
on conflict (name) do nothing;;
