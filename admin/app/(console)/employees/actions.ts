'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'

export type EmployeeResult = { ok: true } | { ok: false; error: string }

/** 運行履歴 can be deleted until the app goes into real use (test runs). */
export async function deleteTrip(user: string, id: string, label: string): Promise<EmployeeResult> {
  const admin = await requireAdmin()
  const { error } = await createServiceClient().from('trip_history').delete().eq('id', id).eq('user_id', user)
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'employees', label, 'delete_trip')
  revalidatePath(`/employees/${user}`)
  return { ok: true }
}

export async function deleteAllTrips(user: string, name: string): Promise<EmployeeResult> {
  const admin = await requireAdmin()
  const { data, error } = await createServiceClient().from('trip_history').delete().eq('user_id', user).select('id')
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'employees', name, 'delete_all_trips', { count: data?.length ?? 0 })
  revalidatePath(`/employees/${user}`)
  return { ok: true }
}
