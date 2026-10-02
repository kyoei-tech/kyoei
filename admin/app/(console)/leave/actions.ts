'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { limitFrom } from '@/lib/leave'
import { createClient } from '@/lib/supabase/server'

export type LeaveResult = { ok: true } | { ok: false; error: string }

function done(): LeaveResult {
  revalidatePath('/leave')
  return { ok: true }
}

export async function saveSettings(_prev: LeaveResult | null, form: FormData): Promise<LeaveResult> {
  const admin = await requireAdmin()
  const notice = Number(form.get('notice_days'))
  const limit = limitFrom(form.get('default_daily_limit') as string | null)
  if (!Number.isInteger(notice) || notice < 0 || notice > 60) return { ok: false, error: '申請の締切は0〜60日で入力してください。' }
  if (typeof limit === 'object' && limit !== null) return { ok: false, error: limit.error }
  const supabase = await createClient()
  const { error } = await supabase.from('leave_settings').update({ notice_days: notice, default_daily_limit: limit, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'leave', '休暇の設定', 'update_leave_settings', { notice_days: notice, default_daily_limit: limit })
  return done()
}

export async function saveDayLimit(_prev: LeaveResult | null, form: FormData): Promise<LeaveResult> {
  const admin = await requireAdmin()
  const day = String(form.get('day') ?? '')
  const limit = limitFrom(form.get('max_people') as string | null)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: '日付を入力してください。' }
  if (limit === null || typeof limit === 'object') return { ok: false, error: '人数を0以上の整数で入力してください。' }
  const supabase = await createClient()
  const { error } = await supabase.from('leave_day_limits').upsert({ day, max_people: limit, note: String(form.get('note') ?? '').trim() })
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'leave', `${day}の上限`, 'set_leave_day_limit', { max_people: limit })
  return done()
}

export async function deleteDayLimit(day: string): Promise<LeaveResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('leave_day_limits').delete().eq('day', day)
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'leave', `${day}の上限`, 'delete_leave_day_limit')
  return done()
}

/** 担当者 (also an admin) confirming from the console. */
export async function confirmLeave(id: string): Promise<LeaveResult> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_leave_request', { p_id: id })
  if (error) return { ok: false, error: error.message.includes('checker') ? '確認できるのは「休暇の担当者」のアカウントだけです。' : '確認できませんでした（取り下げられた可能性があります）。' }
  return done()
}

export async function grantException(_prev: LeaveResult | null, form: FormData): Promise<LeaveResult> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('grant_leave_exception', {
    p_user: String(form.get('user') ?? ''), p_start: String(form.get('start') ?? ''), p_end: String(form.get('end') ?? ''), p_note: String(form.get('note') ?? ''),
  })
  if (error) return { ok: false, error: error.message.includes('checker') ? '許可できるのは「休暇の担当者」のアカウントだけです。' : '許可できませんでした。日付を確認してください（一度に31日まで）。' }
  return done()
}

/** 有給: hand-entered grant (part-timers, corrections) or use (taken outside the app). */
export async function addPaidEntry(_prev: LeaveResult | null, form: FormData): Promise<LeaveResult> {
  const admin = await requireAdmin()
  const user = String(form.get('user') ?? '')
  const kind = String(form.get('kind') ?? '')
  const on = String(form.get('on') ?? '')
  const days = Number(form.get('days'))
  const note = String(form.get('note') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { ok: false, error: '日付を入力してください。' }
  if (!Number.isInteger(days) || days < 1 || days > 40) return { ok: false, error: '日数は1〜40の整数で入力してください。' }
  const supabase = await createClient()
  const expires = new Date(Date.parse(`${on}T00:00:00Z`) + 0)
  expires.setUTCFullYear(expires.getUTCFullYear() + 2)
  const { error } = kind === 'grant'
    ? await supabase.from('paid_leave_grants').insert({ user_id: user, granted_on: on, days, expires_on: expires.toISOString().slice(0, 10), source: 'manual', note })
    : await supabase.from('paid_leave_uses').insert({ user_id: user, used_on: on, days, note })
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'leave', `有給：${String(form.get('name') ?? '')}`, kind === 'grant' ? 'add_paid_grant' : 'add_paid_use', { on, days, note })
  return done()
}

export async function deletePaidEntry(kind: 'grant' | 'use', id: string): Promise<LeaveResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const { error } = kind === 'grant'
    ? await supabase.from('paid_leave_grants').delete().eq('id', id).eq('source', 'manual')
    : await supabase.from('paid_leave_uses').delete().eq('id', id)
  if (error) return { ok: false, error: '削除できませんでした。' }
  await audit(admin, 'leave', '有給の記録', kind === 'grant' ? 'delete_paid_grant' : 'delete_paid_use')
  return done()
}
