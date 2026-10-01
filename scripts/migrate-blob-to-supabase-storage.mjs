#!/usr/bin/env node
// One-time data migration: copies every attachment still in the private
// Vercel Blob store into the Supabase Storage buckets created by
// supabase/migrations/20261001000000_storage_buckets.sql, so the iOS app can
// read them without the Next.js /api routes. Not part of the app at runtime;
// delete it together with the web app once the migration is done.
//
// Idempotent: objects already present are skipped, and dispatch_sheets rows
// already rewritten to "<auth uid>/..." are left alone, so it is safe to
// re-run (e.g. right before retiring the web app, to pick up late uploads).
//
//   BLOB_READ_WRITE_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/migrate-blob-to-supabase-storage.mjs [--dry-run]
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { get } from '@vercel/blob'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')
const UUID_FOLDER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i

for (const key of ['BLOB_READ_WRITE_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing env var ${key}`)
    process.exit(1)
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const stats = { copied: 0, skipped: 0, rewritten: 0, failed: 0 }

async function readBlob(pathname) {
  const result = await get(pathname, { access: 'private' })
  if (!result) throw new Error(`blob not found: ${pathname}`)
  const body = Buffer.from(await new Response(result.stream).arrayBuffer())
  return { body, contentType: result.blob.contentType }
}

// Uploads unless the object already exists. Returns true if copied/present.
async function put(bucket, objectPath, load) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${bucket}/${objectPath}`)
    return true
  }
  try {
    const { body, contentType } = await load()
    const { error } = await supabase.storage.from(bucket).upload(objectPath, body, { contentType, upsert: false })
    if (error) {
      if (String(error.statusCode) === '409' || /exists/i.test(error.message)) {
        stats.skipped++
        return true
      }
      throw error
    }
    stats.copied++
    return true
  } catch (error) {
    stats.failed++
    console.error(`FAILED ${bucket}/${objectPath}:`, error.message ?? error)
    return false
  }
}

async function migrateBeginnerNotes() {
  const { data, error } = await supabase.from('beginner_notes').select('id, image_paths')
  if (error) throw error
  for (const row of data ?? []) {
    for (const pathname of row.image_paths ?? []) {
      await put('beginner-notes', pathname, () => readBlob(pathname))
    }
  }
}

async function migrateTimecardTodo() {
  const { data, error } = await supabase.from('timecard_todo_items').select('id, image_url')
  if (error) throw error
  for (const row of data ?? []) {
    const value = row.image_url
    if (!value || /^https?:\/\//.test(value)) continue
    if (value.startsWith('/')) {
      // A file from the Next.js public/ folder, which won't exist without
      // the web server: upload it and point the row at the copy.
      const objectPath = `legacy/${path.basename(value)}`
      const ext = path.extname(value).slice(1).toLowerCase()
      const ok = await put('timecard-todo', objectPath, async () => ({
        body: await readFile(path.join(process.cwd(), 'public', value)),
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      }))
      if (ok && !DRY_RUN) {
        const { error: updateError } = await supabase
          .from('timecard_todo_items')
          .update({ image_url: objectPath })
          .eq('id', row.id)
        if (updateError) throw updateError
        stats.rewritten++
      }
      continue
    }
    await put('timecard-todo', value, () => readBlob(value))
  }
}

async function migrateDispatchSheets() {
  const { data: staff, error: staffError } = await supabase.from('staff_members').select('id, auth_user_id')
  if (staffError) throw staffError
  const authByStaff = new Map((staff ?? []).map((s) => [String(s.id), s.auth_user_id]))

  const { data, error } = await supabase.from('dispatch_sheets').select('id, blob_url, uploaded_by_staff_id')
  if (error) throw error
  for (const row of data ?? []) {
    if (UUID_FOLDER.test(row.blob_url)) {
      stats.skipped++
      continue
    }
    const authUserId = authByStaff.get(String(row.uploaded_by_staff_id))
    if (!authUserId) {
      // Storage policies key on the uploader's auth user; without one the
      // file would be unreachable. Re-run after the driver links an account.
      console.warn(`SKIP dispatch_sheets ${row.id}: uploader has no linked auth account`)
      stats.failed++
      continue
    }
    const objectPath = `${authUserId}/${row.blob_url}`
    const ok = await put('dispatch-sheets', objectPath, () => readBlob(row.blob_url))
    if (ok && !DRY_RUN) {
      const { error: updateError } = await supabase
        .from('dispatch_sheets')
        .update({ blob_url: objectPath })
        .eq('id', row.id)
      if (updateError) throw updateError
      stats.rewritten++
    }
  }
}

await migrateBeginnerNotes()
await migrateTimecardTodo()
await migrateDispatchSheets()
console.log(stats)
process.exit(stats.failed > 0 ? 1 : 0)
