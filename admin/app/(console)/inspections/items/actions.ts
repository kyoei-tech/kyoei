'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { itemFromForm } from '@/lib/inspection'
import { createClient } from '@/lib/supabase/server'

export type ItemResult = { ok: true } | { ok: false; error: string }

/** Add or edit an inspection item. RLS: MFA-verified admins. */
export async function saveItem(_prev: ItemResult | null, form: FormData): Promise<ItemResult> {
  const admin = await requireAdmin()
  const id = String(form.get('id') ?? '') || null
  const parsed = itemFromForm((key) => (form.get(key) === null ? null : String(form.get(key))), form.getAll('classes').map(String))
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const supabase = await createClient()
  const row = { ...parsed, updated_at: new Date().toISOString() }
  const { error } = id ? await supabase.from('inspection_items').update(row).eq('id', id) : await supabase.from('inspection_items').insert(row)
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'inspection', `${parsed.section}：${parsed.label}`, id ? 'update_inspection_item' : 'create_inspection_item', {
    frequency: parsed.frequency, scope: parsed.scope, classes: parsed.classes, active: parsed.active,
  })
  revalidatePath('/inspections/items')
  return { ok: true }
}

/** Past records keep their own copy of the item's text, so deleting is safe. */
export async function deleteItem(id: string, name: string): Promise<ItemResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('inspection_items').delete().eq('id', id)
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'inspection', name, 'delete_inspection_item')
  revalidatePath('/inspections/items')
  return { ok: true }
}
