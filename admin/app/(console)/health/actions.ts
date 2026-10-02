'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { healthFromForm } from '@/lib/schedule'
import { createServiceClient } from '@/lib/supabase/service'

export type HealthResult = { ok: true } | { ok: false; error: string }

function done(): HealthResult {
  revalidatePath('/health')
  revalidatePath('/employees', 'layout')
  return { ok: true }
}

// Service role after requireAdmin: account_profiles rows may not exist yet.

export async function saveHealth(_prev: HealthResult | null, form: FormData): Promise<HealthResult> {
  const admin = await requireAdmin()
  const id = String(form.get('id') ?? '') || null
  const user = String(form.get('user') ?? '')
  const name = String(form.get('name') ?? '')
  const parsed = healthFromForm((key) => (form.get(key) === null ? null : String(form.get(key))))
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const service = createServiceClient()
  const row = { ...parsed.row, updated_at: new Date().toISOString() }
  const { error } = id ? await service.from('health_checks').update(row).eq('id', id) : await service.from('health_checks').insert({ ...row, user_id: user })
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'health', name, id ? 'update_health_check' : 'create_health_check', { on: parsed.row.scheduled_on })
  return done()
}

export async function completeHealth(id: string, name: string, completedOn: string | null): Promise<HealthResult> {
  const admin = await requireAdmin()
  if (completedOn && !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) return { ok: false, error: '受診日を確認してください。' }
  const { error } = await createServiceClient().from('health_checks').update({ completed_on: completedOn, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'health', name, completedOn ? 'complete_health_check' : 'reopen_health_check', { on: completedOn })
  return done()
}

export async function deleteHealth(id: string, name: string): Promise<HealthResult> {
  const admin = await requireAdmin()
  const { error } = await createServiceClient().from('health_checks').delete().eq('id', id)
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'health', name, 'delete_health_check')
  return done()
}

export async function setPerYear(user: string, name: string, perYear: 1 | 2): Promise<HealthResult> {
  const admin = await requireAdmin()
  const service = createServiceClient()
  const { data: existing } = await service.from('account_profiles').select('user_id').eq('user_id', user).maybeSingle()
  const { error } = existing
    ? await service.from('account_profiles').update({ health_checks_per_year: perYear }).eq('user_id', user)
    : await service.from('account_profiles').insert({ user_id: user, health_checks_per_year: perYear })
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'health', name, 'set_health_per_year', { perYear })
  return done()
}
