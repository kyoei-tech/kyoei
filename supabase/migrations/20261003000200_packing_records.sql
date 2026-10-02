-- 荷姿履歴: after loading a 回戦, the driver records which car went on which
-- floor (何番に何を積んだか) plus photos. Drivers add and correct their own
-- records in the app; MFA-verified admins can read everyone's from the
-- console but never edit them.
--
-- placements: [{ vehicle_index, vehicle_name, model, chassis_number, floor }]
--   floor is one of the 車格's floors (上段・下段前・1番…・宙吊り) or null
--   when not entered (ローダー is photo only).

create table if not exists public.packing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sheet_id uuid references public.dispatch_sheets (id) on delete set null,
  sheet_title text not null default '',
  round text not null,
  loaded_on date not null,
  vehicle_class text,
  vehicle_plate text not null default '',
  chassis_plate text,
  placements jsonb not null default '[]'::jsonb check (jsonb_typeof(placements) = 'array'),
  photo_paths text[] not null default '{}',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sheet_id, round)
);

create index if not exists packing_records_user_day on public.packing_records (user_id, loaded_on desc);

alter table public.packing_records enable row level security;
revoke all on public.packing_records from anon, authenticated;
grant select, insert, update, delete on public.packing_records to authenticated;
create policy "kyoei packing: read own or admin" on public.packing_records for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_kyoei_admin_mfa()));
create policy "kyoei packing: add own" on public.packing_records for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "kyoei packing: edit own" on public.packing_records for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "kyoei packing: delete own" on public.packing_records for delete to authenticated
  using (user_id = (select auth.uid()));

-- Photos: bucket packing-photos, "<auth uid>/<file>". Own folder for the
-- driver (add/read/delete); admins read all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('packing-photos', 'packing-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do nothing;

create policy "kyoei packing photos: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'packing-photos' and (
    (storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_kyoei_admin_mfa())
  ));
create policy "kyoei packing photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'packing-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "kyoei packing photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'packing-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
