'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type PlateResult = { ok: true } | { ok: false; error: string }

/** 返却処理 for a plate someone forgot to return in the app. */
export async function forceReturn(useId: string, label: string): Promise<PlateResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('return_red_plate', { p_use: useId, p_method: 'admin' })
  if (error) return { ok: false, error: '返却処理できませんでした（すでに返却済みの可能性があります）。' }
  await audit(admin, 'red_plates', label, 'return_red_plate')
  revalidatePath('/red-plates')
  return { ok: true }
}

export async function savePlate(_prev: PlateResult | null, form: FormData): Promise<PlateResult> {
  const admin = await requireAdmin()
  const id = String(form.get('id') ?? '') || null
  const region = String(form.get('region') ?? '').normalize('NFKC').trim()
  const number = String(form.get('number') ?? '').normalize('NFKC').replace(/\s+/g, '').trim()
  const note = String(form.get('note') ?? '').trim()
  const sortOrder = Number(form.get('sort_order') ?? 0)
  const active = form.get('active') === 'on'
  if (!region || !number) return { ok: false, error: '地名と番号を入力してください。' }
  if (!Number.isInteger(sortOrder)) return { ok: false, error: '並び順は整数で入力してください。' }
  const supabase = await createClient()
  const row = { region, number, note, sort_order: sortOrder, active }
  const { error } = id ? await supabase.from('red_plates').update(row).eq('id', id) : await supabase.from('red_plates').insert(row)
  if (error) return { ok: false, error: error.code === '23505' ? 'その赤枠はすでに登録されています。' : '保存できませんでした。' }
  await audit(admin, 'red_plates', `${region} ${number}`, id ? 'update_red_plate' : 'create_red_plate', { active, note })
  revalidatePath('/red-plates')
  return { ok: true }
}
