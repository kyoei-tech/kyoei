'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { scheduleFromForm, scheduleKindLabel } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

export type ScheduleResult = { ok: true } | { ok: false; error: string }

function done(): ScheduleResult {
  revalidatePath('/vehicle-schedules')
  revalidatePath('/employees', 'layout')
  return { ok: true }
}

/** Add or edit a 点検・車検 reservation (the driver is told in the app). */
export async function saveSchedule(_prev: ScheduleResult | null, form: FormData): Promise<ScheduleResult> {
  const admin = await requireAdmin()
  const id = String(form.get('id') ?? '') || null
  const vehicleId = String(form.get('vehicle_id') ?? '')
  const plate = String(form.get('plate') ?? '')
  const parsed = scheduleFromForm((key) => (form.get(key) === null ? null : String(form.get(key))))
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const supabase = await createClient()
  const row = { ...parsed.row, updated_at: new Date().toISOString() }
  const { error } = id
    ? await supabase.from('vehicle_schedules').update(row).eq('id', id)
    : await supabase.from('vehicle_schedules').insert({ ...row, vehicle_id: vehicleId })
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'vehicles', `${plate} ${scheduleKindLabel(parsed.row.kind)}`, id ? 'update_vehicle_schedule' : 'create_vehicle_schedule', { on: parsed.row.scheduled_on })
  return done()
}

export async function completeSchedule(id: string, label: string, completed: boolean): Promise<ScheduleResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('vehicle_schedules').update({ completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'vehicles', label, completed ? 'complete_vehicle_schedule' : 'reopen_vehicle_schedule')
  return done()
}

export async function deleteSchedule(id: string, label: string): Promise<ScheduleResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('vehicle_schedules').delete().eq('id', id)
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'vehicles', label, 'delete_vehicle_schedule')
  return done()
}
