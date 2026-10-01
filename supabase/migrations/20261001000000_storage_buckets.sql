-- Attachment storage for the iOS app, replacing the private Vercel Blob
-- store that was only reachable through the Next.js /api routes. The app
-- reads and writes these buckets directly with the anon key / user session.
--
-- Object paths are stored in the same columns as before:
--   dispatch_sheets.blob_url        -> bucket dispatch-sheets  ("<auth uid>/<file>")
--   beginner_notes.image_paths[]    -> bucket beginner-notes
--   timecard_todo_items.image_url   -> bucket timecard-todo (or a legacy http(s) URL)
-- Existing Blob objects are copied over by scripts/migrate-blob-to-supabase-storage.mjs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('dispatch-sheets', 'dispatch-sheets', false, 20971520, array['application/pdf']),
  ('beginner-notes', 'beginner-notes', false, 10485760, array['image/*']),
  ('timecard-todo', 'timecard-todo', false, 10485760, array['image/*'])
on conflict (id) do nothing;

-- 初心者ノート / TODO images follow the app-wide "共有端末" convention used by
-- every shared table: anyone running the app can read, add and delete.
create policy "kyoei shared attachments: read"
  on storage.objects for select to anon, authenticated
  using (bucket_id in ('beginner-notes', 'timecard-todo'));

create policy "kyoei shared attachments: insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id in ('beginner-notes', 'timecard-todo'));

create policy "kyoei shared attachments: delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id in ('beginner-notes', 'timecard-todo'));

-- 配車表 PDFs are personal: only the signed-in driver can see or change the
-- objects under their own "<auth uid>/" folder. (On the web these were only
-- scoped client-side.)
create policy "kyoei dispatch sheets: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'dispatch-sheets' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "kyoei dispatch sheets: insert own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dispatch-sheets' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "kyoei dispatch sheets: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dispatch-sheets' and (storage.foldername(name))[1] = (select auth.uid()::text));
