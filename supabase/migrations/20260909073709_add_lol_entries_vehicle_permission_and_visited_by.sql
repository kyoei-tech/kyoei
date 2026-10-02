alter table public.lol_entries
  add column if not exists vehicle_permission jsonb not null default '{}'::jsonb,
  add column if not exists visited_by jsonb not null default '[]'::jsonb;;
