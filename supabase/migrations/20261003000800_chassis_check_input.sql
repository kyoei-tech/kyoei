-- 車台番号の照合: shutter photo or voice input (2026-10-03).
--   input: 'camera' (read from a photo) or 'voice' (spoken — a rusted
--   stamping with no caution plate). Older rows are camera.
--   photo_path: the photo kept for a 記録 (blank 車体番号 on the sheet).
--   Photos of a 照合 are read and discarded on the phone, never uploaded.
--   How long the 記録 photos are kept is decided later.

alter table public.dispatch_chassis_checks add column if not exists input text not null default 'camera'
  check (input in ('camera', 'voice'));
alter table public.dispatch_chassis_checks add column if not exists photo_path text;
alter table public.dispatch_chassis_checks drop constraint if exists dispatch_chassis_checks_photo_only_records;
alter table public.dispatch_chassis_checks add constraint dispatch_chassis_checks_photo_only_records
  check (photo_path is null or vehicle_index is not null);

-- Private to each driver: "<auth uid>/<file>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chassis-photos', 'chassis-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "kyoei chassis photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'chassis-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "kyoei chassis photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'chassis-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "kyoei chassis photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'chassis-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
