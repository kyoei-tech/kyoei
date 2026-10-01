create table if not exists public.dispatch_sheets (
  id uuid primary key default gen_random_uuid(),
  blob_url text not null,
  original_filename text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by_staff_id uuid references public.staff_members(id) on delete set null,
  page_images jsonb
);

alter table public.dispatch_sheets enable row level security;

-- Matches the app-wide convention (see staff_members_public_all): this is
-- a shared-device app with no per-user authorization model, so access
-- control is intentionally left open at the RLS layer.
create policy dispatch_sheets_public_all
  on public.dispatch_sheets
  for all
  to public
  using (true)
  with check (true);;
