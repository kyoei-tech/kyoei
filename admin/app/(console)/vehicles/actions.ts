'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { isTrailerClass, optional, VEHICLE_CLASSES } from '@/lib/profile'
import { createClient } from '@/lib/supabase/server'

export type VehicleResult = { ok: true } | { ok: false; error: string }

/** Add or edit a vehicle: ナンバー and 車格 (and ヘッド／台車 for trailers). RLS: MFA-verified admins. */
export async function saveVehicle(_prev: VehicleResult | null, form: FormData): Promise<VehicleResult> {
  const admin = await requireAdmin()
  const id = optional(form, 'id')
  const plate = String(form.get('plate') ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  const vehicleClass = String(form.get('vehicle_class') ?? '')
  if (!plate) return { ok: false, error: 'ナンバーを入力してください。' }
  if (!VEHICLE_CLASSES.some(([v]) => v === vehicleClass)) return { ok: false, error: '車格を選んでください。' }
  const part = String(form.get('part') ?? '')
  const kind = isTrailerClass(vehicleClass) ? (part === 'chassis' ? 'chassis' : part === 'head' ? 'head' : '') : 'truck'
  if (!kind) return { ok: false, error: 'トレーラーは「ヘッド」か「台車」かを選んでください。' }
  const row = { plate, vehicle_class: vehicleClass, kind, note: String(form.get('note') ?? '').trim(), updated_at: new Date().toISOString() }
  const supabase = await createClient()
  const { error } = id ? await supabase.from('vehicles').update(row).eq('id', id) : await supabase.from('vehicles').insert(row)
  if (error) return { ok: false, error: error.code === '23505' ? 'そのナンバーはすでに登録されています。' : '保存できませんでした。' }
  await audit(admin, 'vehicles', plate, id ? 'update_vehicle' : 'create_vehicle', { vehicle_class: vehicleClass, kind })
  revalidatePath('/vehicles')
  revalidatePath('/accounts')
  revalidatePath('/vehicle-schedules')
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
