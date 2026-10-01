-- Add "概要" (summary) column to emergency_contacts
alter table public.emergency_contacts
  add column if not exists summary text;

-- Singleton memo table shown above the emergency contacts list
create table if not exists public.emergency_contacts_memo (
  id text primary key default 'current',
  content text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.emergency_contacts_memo (id, content)
values ('current', '')
on conflict (id) do nothing;

alter table public.emergency_contacts_memo enable row level security;

create policy emergency_contacts_memo_public_all
  on public.emergency_contacts_memo
  for all
  using (true)
  with check (true);

alter publication supabase_realtime add table public.emergency_contacts_memo;;
