'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import type { CustomerRow } from '@/lib/csv'
import { createClient } from '@/lib/supabase/server'

export type ImportSummary = {
  rows: number
  newCustomers: number
  newNumbers: number
  unchanged: number
  errors: { row: number; message: string }[]
  dryRun: boolean
}
export type ImportResult = { ok: true; summary: ImportSummary } | { ok: false; error: string }

const MAX_ROWS = 20000

/**
 * Runs import_customers() as the signed-in admin: the database itself checks
 * admin + two-factor and does everything in one transaction (dry run = no
 * writes, just the counts).
 */
export async function importCustomers(rows: CustomerRow[], dryRun: boolean): Promise<ImportResult> {
  await requireAdmin()
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '取り込む行がありません。' }
  if (rows.length > MAX_ROWS) return { ok: false, error: `一度に取り込めるのは ${MAX_ROWS} 行までです。` }
  const clean = rows.map((r) => ({ name: String(r.name ?? ''), kana: String(r.kana ?? ''), venue: String(r.venue ?? ''), number: String(r.number ?? '') }))
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('import_customers', { p_rows: clean, p_dry_run: dryRun })
  if (error) return { ok: false, error: '取り込めませんでした。もう一度ログインしてからお試しください。' }
  if (!dryRun) {
    revalidatePath('/customers')
    revalidatePath('/')
  }
  return { ok: true, summary: data as ImportSummary }
}

export async function addCustomer(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  const row = {
    name: String(form.get('name') ?? '').normalize('NFKC').trim(),
    kana: String(form.get('kana') ?? '').normalize('NFKC').trim(),
    venue: String(form.get('venue') ?? '').normalize('NFKC').trim(),
    number: String(form.get('number') ?? '').normalize('NFKC').trim(),
  }
  return importCustomers([row], false)
}

export async function deleteNumber(numberId: string, label: string): Promise<{ ok: boolean }> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('customer_numbers').delete().eq('id', numberId)
  if (!error) await supabase.rpc('log_admin_action', { p_category: 'customers', p_target: label, p_action: 'delete_number' })
  revalidatePath('/customers')
  return { ok: !error }
}

export async function deleteCustomer(customerId: string, label: string): Promise<{ ok: boolean }> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('customers').delete().eq('id', customerId)
  if (!error) await supabase.rpc('log_admin_action', { p_category: 'customers', p_target: label, p_action: 'delete_customer' })
  revalidatePath('/customers')
  revalidatePath('/')
  return { ok: !error }
}
