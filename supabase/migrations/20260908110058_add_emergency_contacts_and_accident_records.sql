
-- 緊急連絡先 (emergency contacts)
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  hours text not null default '',
  phone text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.emergency_contacts enable row level security;
create policy "emergency_contacts_public_all" on public.emergency_contacts for all using (true) with check (true);
create index if not exists idx_emergency_contacts_sort on public.emergency_contacts(sort_order, created_at);

-- 無事故カレンダー (accident-free calendar records)
create table if not exists public.accident_records (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  vehicle_class text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.accident_records enable row level security;
create policy "accident_records_public_all" on public.accident_records for all using (true) with check (true);
create index if not exists idx_accident_records_date on public.accident_records(occurred_on);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emergency_contacts') then
    alter publication supabase_realtime add table public.emergency_contacts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accident_records') then
    alter publication supabase_realtime add table public.accident_records;
  end if;
end $$;
;
