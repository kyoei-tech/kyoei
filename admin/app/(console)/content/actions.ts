'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { findTable, HAS_UPDATED_AT, rowFromForm } from '@/lib/content'
import { createServiceClient } from '@/lib/supabase/service'

export type ContentResult = { ok: true } | { ok: false; error: string }

function jstMonth(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7)
}

/** Add or edit one row of a table named in lib/content (nothing else is writable). */
export async function saveContentRow(_prev: ContentResult | null, form: FormData): Promise<ContentResult> {
  const admin = await requireAdmin()
  const found = findTable(String(form.get('_section') ?? ''), String(form.get('_table') ?? ''))
  if (!found) return { ok: false, error: '編集できない項目です。' }
  const { section, def } = found
  const id = String(form.get('_id') ?? '') || null
  if (!id && !def.canCreate) return { ok: false, error: 'この項目は追加できません。' }
  if (id && def.ids && !def.ids.includes(id)) return { ok: false, error: '編集できない項目です。' }
  const parsed = rowFromForm(def, (key) => (form.get(key) === null ? null : String(form.get(key))))
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const row: Record<string, unknown> = { ...parsed.row }
  if (HAS_UPDATED_AT.has(def.table)) row.updated_at = new Date().toISOString()
  const service = createServiceClient()

  if (def.table === 'weekly_goal' && id) {
    // Same as the app: the content is this month's; history keeps each month.
    const month = jstMonth()
    row.content_month = month
    row.next_content_set_at = row.next_content ? new Date().toISOString() : null
    await service.from('weekly_goal_history').upsert({ goal_id: id, month, content: row.content, updated_at: new Date().toISOString() }, { onConflict: 'goal_id,month' })
  }

  // Images taken off the row are deleted from storage after it saves.
  const imageFields = def.fields.filter((f) => f.type === 'images' && f.bucket)
  let removed: { bucket: string; paths: string[] }[] = []
  if (id && imageFields.length) {
    const { data: before } = await service.from(def.table).select(imageFields.map((f) => f.key).join(',')).eq('id', id).maybeSingle()
    const old = (before ?? {}) as unknown as Record<string, string[] | null>
    removed = imageFields.map((f) => ({ bucket: f.bucket!, paths: (old[f.key] ?? []).filter((p) => !(row[f.key] as string[]).includes(p)) }))
  }

  let error
  if (id) {
    ;({ error } = await service.from(def.table).update(row).eq('id', id))
  } else {
    Object.assign(row, def.insertDefaults ?? {})
    if (def.sortable) {
      const { data: last } = await service.from(def.table).select('sort_order').order('sort_order', { ascending: false }).limit(1)
      row.sort_order = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1
    }
    ;({ error } = await service.from(def.table).insert(row))
  }
  if (error) return { ok: false, error: '保存できませんでした。' }
  for (const r of removed) if (r.paths.length) await service.storage.from(r.bucket).remove(r.paths)
  const name = String(row[def.title] ?? id ?? '').slice(0, 40)
  await audit(admin, 'content', `${section.title}：${name}`, id ? 'update_content' : 'create_content', { table: def.table })
  revalidatePath(`/content/${section.slug}`)
  return { ok: true }
}

export async function deleteContentRow(slug: string, table: string, id: string, name: string): Promise<ContentResult> {
  const admin = await requireAdmin()
  const found = findTable(slug, table)
  if (!found?.def.canDelete) return { ok: false, error: 'この項目は削除できません。' }
  const service = createServiceClient()
  const imageFields = found.def.fields.filter((f) => f.type === 'images' && f.bucket)
  const { data: before } = imageFields.length
    ? await service.from(table).select(imageFields.map((f) => f.key).join(',')).eq('id', id).maybeSingle()
    : { data: null }
  const { error } = await service.from(table).delete().eq('id', id)
  if (error) return { ok: false, error: '削除できませんでした。' }
  for (const f of imageFields) {
    const paths = ((before ?? {}) as unknown as Record<string, string[] | null>)[f.key] ?? []
    if (paths.length) await service.storage.from(f.bucket!).remove(paths)
  }
  await audit(admin, 'content', `${found.section.title}：${name.slice(0, 40)}`, 'delete_content', { table })
  revalidatePath(`/content/${slug}`)
  return { ok: true }
}

/** ↑↓: renumber the table's sort_order with this row moved one place. */
export async function moveContentRow(slug: string, table: string, id: string, direction: -1 | 1): Promise<ContentResult> {
  await requireAdmin()
  const found = findTable(slug, table)
  if (!found?.def.sortable) return { ok: false, error: '並べ替えできません。' }
  const service = createServiceClient()
  let query = service.from(table).select('id')
  for (const [column, ascending] of found.def.order) query = query.order(column, { ascending })
  const { data } = await query
  const ids = (data ?? []).map((r) => r.id as string)
  const index = ids.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ids.length) return { ok: true }
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  await Promise.all(ids.map((rowId, i) => service.from(table).update({ sort_order: i + 1 }).eq('id', rowId)))
  revalidatePath(`/content/${slug}`)
  return { ok: true }
}
