'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { decisionFromForm } from '@/lib/repair'
import { createClient } from '@/lib/supabase/server'

export type RepairResult = { ok: true } | { ok: false; error: string }

/** 社長印: 自社整備／外注, 依頼先, 修理依頼日, 入庫予定日 (logged by the database). */
export async function decideRepair(_prev: RepairResult | null, form: FormData): Promise<RepairResult> {
  await requireAdmin()
  const id = String(form.get('id') ?? '')
  const parsed = decisionFromForm((key) => (form.get(key) === null ? null : String(form.get(key))))
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('president_decide_repair', {
    p_id: id, p_method: parsed.method, p_vendor: parsed.vendor, p_requested_on: parsed.requestedOn, p_entry_on: parsed.entryOn, p_note: parsed.note,
  })
  if (error) return { ok: false, error: error.message.includes('president') ? '社長印は、役職が「社長」のアカウントだけが押せます。' : '保存できませんでした。' }
  revalidatePath('/repairs')
  revalidatePath(`/repairs/${id}`)
  return { ok: true }
}

/** 担当印 (整備): 作業内容, 修理完了日, 伝票 (already uploaded from the browser). */
export async function completeRepair(id: string, workDone: string, completedOn: string | null, slipPaths: string[]): Promise<RepairResult> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('maintenance_complete_repair', {
    p_id: id, p_work_done: workDone, p_completed_on: completedOn, p_slip_paths: slipPaths.filter((p) => p.startsWith('slips/')),
  })
  if (error) {
    if (error.message.includes('maintenance')) return { ok: false, error: '担当印は、役職が「整備」（または社長）のアカウントだけが押せます。' }
    if (error.message.includes('decide first')) return { ok: false, error: '先に社長が予定を決めてください。' }
    return { ok: false, error: '保存できませんでした。' }
  }
  revalidatePath('/repairs')
  revalidatePath(`/repairs/${id}`)
  return { ok: true }
}
