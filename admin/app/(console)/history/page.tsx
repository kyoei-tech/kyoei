import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { actionLabel, CATEGORY_LABELS, detailSummary } from '@/lib/labels'
import { createClient } from '@/lib/supabase/server'

type Entry = { id: number; at: string; actor_label: string; category: string; target: string; action: string; detail: Record<string, unknown> }

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireAdmin()
  const params = await searchParams
  const category = typeof params.category === 'string' && params.category in CATEGORY_LABELS ? params.category : null
  const supabase = await createClient()
  let query = supabase.from('admin_audit_log').select('id, at, actor_label, category, target, action, detail').order('at', { ascending: false }).limit(300)
  if (category) query = query.eq('category', category)
  const { data } = await query
  const entries = (data ?? []) as Entry[]

  return (
    <>
      <div className="page-header">
        <div>
          <h1>変更履歴</h1>
          <p>管理画面での変更と、アプリでの顧客検索の記録です（新しい順に300件）。記録は誰も削除・変更できません。</p>
        </div>
      </div>
      <div className="row">
        <Link href="/history" className={`chip ${category ? 'chip-gray' : 'chip-dark'}`} style={{ textDecoration: 'none' }}>すべて</Link>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <Link key={key} href={`/history?category=${key}`} className={`chip ${category === key ? 'chip-dark' : 'chip-gray'}`} style={{ textDecoration: 'none' }}>{label}</Link>
        ))}
      </div>
      <table className="table">
        <thead><tr><th>日時</th><th>操作した人</th><th>種類</th><th>対象</th><th>内容</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'medium' })}</td>
              <td style={{ fontWeight: 700 }}>{e.actor_label}</td>
              <td><span className={`chip ${e.category === 'customer_search' ? 'chip-lime' : 'chip-gray'}`}>{CATEGORY_LABELS[e.category] ?? e.category}</span></td>
              <td>{e.target}</td>
              <td><b>{actionLabel(e.action)}</b>{detailSummary(e.action, e.detail) && <span style={{ color: 'var(--muted)' }}>　{detailSummary(e.action, e.detail)}</span>}</td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>まだ記録がありません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
