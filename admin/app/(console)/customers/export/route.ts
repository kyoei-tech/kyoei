import { requireAdmin } from '@/lib/auth'
import { toCSV, CSV_HEADER } from '@/lib/csv'
import { createClient } from '@/lib/supabase/server'

/** POS番号一覧 as CSV in the import format (会員名, よみ, 会場名, 会員番号). */
export async function GET() {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.from('customers').select('name, kana, customer_numbers(venue, member_number)').order('kana').order('name')
  const rows: string[][] = [[...CSV_HEADER]]
  for (const c of (data ?? []) as { name: string; kana: string; customer_numbers: { venue: string; member_number: string }[] }[]) {
    for (const n of c.customer_numbers) rows.push([c.name, c.kana, n.venue, n.member_number])
  }
  await supabase.rpc('log_admin_action', { p_category: 'customers', p_target: 'CSV 書き出し', p_action: 'export', p_detail: { rows: rows.length - 1 } })
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(toCSV(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kyoei-pos-numbers-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
