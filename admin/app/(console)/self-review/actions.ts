'use server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { templateFromForm } from '@/lib/review'
import { createClient } from '@/lib/supabase/server'

export type ReviewResult = { ok: true } | { ok: false; error: string }

/** 社長採点 (the database checks that the signed-in admin's 役職 is 社長). */
export async function presidentScore(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  await requireAdmin()
  const user = String(form.get('user') ?? '')
  const period = String(form.get('period') ?? '')
  const scores = Array.from({ length: 10 }, (_, i) => Number(form.get(`score_${i}`)))
  if (scores.some((s) => !Number.isInteger(s) || s < 0 || s > 3)) return { ok: false, error: '項目1〜10をすべて採点してください。' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('president_score_review', { p_user: user, p_period: period, p_scores: scores })
  if (error) return { ok: false, error: error.message.includes('president') ? '社長採点は、役職が「社長」のアカウントだけが入力できます。' : '保存できませんでした。' }
  revalidatePath('/self-review')
  return { ok: true }
}

/** 上長採点 from the console: only the driver's own 上長, before the deadline (checked by the database). */
export async function supervisorScore(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  await requireAdmin()
  const user = String(form.get('user') ?? '')
  const scores = Array.from({ length: 10 }, (_, i) => Number(form.get(`score_${i}`)))
  if (scores.some((s) => !Number.isInteger(s) || s < 0 || s > 3)) return { ok: false, error: '項目1〜10をすべて採点してください。' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('score_subordinate_review', { p_user: user, p_scores: scores })
  if (error) {
    if (error.message.includes('closed')) return { ok: false, error: '採点期限を過ぎています。' }
    if (error.message.includes('not your report')) return { ok: false, error: '上長採点は、この人の上長に設定されたアカウントだけが入力できます。' }
    return { ok: false, error: '保存できませんでした。' }
  }
  revalidatePath('/self-review')
  return { ok: true }
}

export async function excuseInspection(user: string, period: string, excused: boolean): Promise<ReviewResult> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('excuse_review_inspection', { p_user: user, p_period: period, p_excused: excused })
  if (error) return { ok: false, error: '変更できませんでした。' }
  revalidatePath('/self-review')
  return { ok: true }
}

/** Saves the month's questions, items, deadline and 手当表. */
export async function saveTemplate(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const admin = await requireAdmin()
  const period = String(form.get('period') ?? '')
  if (!/^\d{4}-\d{2}-01$/.test(period)) return { ok: false, error: '対象月が正しくありません。' }
  const parsed = templateFromForm((key) => (form.get(key) === null ? null : String(form.get(key))))
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.from('self_review_templates').upsert({ period, ...parsed, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: '保存できませんでした。' }
  await audit(admin, 'self_review', `${period.slice(0, 7)}分のシート`, 'update_review_template', { deadline_day: parsed.deadline_day })
  revalidatePath('/self-review')
  revalidatePath('/self-review/template')
  return { ok: true }
}
