'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type AwardResult = { ok: true } | { ok: false; error: string }

/** 開示申請 for one problematic ballot (logged by the database function). */
export async function requestDisclosure(_prev: AwardResult | null, form: FormData): Promise<AwardResult> {
  await requireAdmin()
  const ballot = String(form.get('ballot') ?? '')
  const reason = String(form.get('reason') ?? '').trim()
  if (!reason) return { ok: false, error: '開示が必要な理由を入力してください。' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_award_disclosure', { p_ballot: ballot, p_reason: reason })
  if (error) return { ok: false, error: error.code === '23505' ? 'この投票はすでに開示申請されています。' : '申請できませんでした。' }
  revalidatePath('/award')
  return { ok: true }
}

/** Approve or reject — only an admin other than the requester. */
export async function decideDisclosure(requestId: string, approve: boolean): Promise<AwardResult> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_award_disclosure', { p_request: requestId, p_approve: approve })
  if (error) return { ok: false, error: '申請した本人は承認できません。別の管理者が承認してください。' }
  revalidatePath('/award')
  return { ok: true }
}
