'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { optional } from '@/lib/profile'
import { createClient } from '@/lib/supabase/server'

export type VehicleResult = { ok: true } | { ok: false; error: string }

/** Add or edit a vehicle (ナンバー・種類・車検期限・3ヶ月点検・12ヶ月点検). RLS: MFA-verified admins. */
export async function saveVehicle(_prev: VehicleResult | null, form: FormData): Promise<VehicleResult> {
  const admin = await requireAdmin()
  const id = optional(form, 'id')
  const plate = String(form.get('plate') ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  const kind = String(form.get('kind') ?? '')
  if (!plate) return { ok: false, error: 'ナンバーを入力してください。' }
  if (!['truck', 'head', 'chassis'].includes(kind)) return { ok: false, error: '種類を選んでください。' }
  const row = {
    plate,
    kind,
    shaken_due: optional(form, 'shaken_due'),
    inspection_3m_due: optional(form, 'inspection_3m_due'),
    inspection_12m_due: optional(form, 'inspection_12m_due'),
    note: String(form.get('note') ?? '').trim(),
    updated_at: new Date().toISOString(),
  }
  const supabase = await createClient()
  const { error } = id ? await supabase.from('vehicles').update(row).eq('id', id) : await supabase.from('vehicles').insert(row)
  if (error) return { ok: false, error: error.code === '23505' ? 'そのナンバーはすでに登録されています。' : '保存できませんでした。' }
  await audit(admin, 'vehicles', plate, id ? 'update_vehicle' : 'create_vehicle', { shaken_due: row.shaken_due, inspection_3m_due: row.inspection_3m_due, inspection_12m_due: row.inspection_12m_due })
  revalidatePath('/vehicles')
  revalidatePath('/accounts')
  return { ok: true }
}

export async function deleteVehicle(id: string, plate: string): Promise<VehicleResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'vehicles', plate, 'delete_vehicle')
  revalidatePath('/vehicles')
  return { ok: true }
}
