import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { destinationLabel, repairStatus, STATUS_LABEL, type RepairStatus } from '@/lib/repair'
import { createClient } from '@/lib/supabase/server'

const md = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '')
const CHIP: Record<RepairStatus, string> = { submitted: 'chip-orange', scheduled: 'chip-ink', done: 'chip-gray', withdrawn: 'chip-gray' }

/** 修理申請 (車両修理依頼書): every request, newest first; ?plate= for one vehicle's history. */
export default async function RepairsPage({ searchParams }: { searchParams: Promise<{ status?: string; plate?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()
  let query = supabase
    .from('repair_requests')
    .select('id, user_id, reported_on, head_plate, chassis_plate, part, symptom, urgency, withdrawn_at, method, vendor, entry_on, president_stamped_at, completed_on')
    .order('created_at', { ascending: false })
    .limit(500)
  if (params.plate) query = query.or(`head_plate.eq.${JSON.stringify(params.plate)},chassis_plate.eq.${JSON.stringify(params.plate)}`)
  const [{ data }, { data: accounts }, { data: profiles }] = await Promise.all([
    query,
    supabase.from('app_accounts').select('user_id, login_id'),
    supabase.from('account_profiles').select('user_id, full_name'),
  ])
  const name = (id: string) => profiles?.find((p) => p.user_id === id)?.full_name || accounts?.find((a) => a.user_id === id)?.login_id || '不明'
  const rows = (data ?? []).map((r) => ({ ...r, status: repairStatus(r) }))
  const filtered = params.status ? rows.filter((r) => r.status === params.status) : rows.filter((r) => r.status !== 'withdrawn')
  const count = (s: RepairStatus) => rows.filter((r) => r.status === s).length
  const tab = (status: string | undefined, label: string) => (
    <Link className={`btn btn-small ${params.status === status ? 'btn-primary' : ''}`} href={`/repairs?${new URLSearchParams({ ...(status ? { status } : {}), ...(params.plate ? { plate: params.plate } : {}) })}`}>{label}</Link>
  )
  return (
    <>
      <div className="page-header">
        <div>
          <h1>修理申請{params.plate ? `：${params.plate}` : ''}</h1>
          <p>ドライバーがアプリから出した車両修理依頼書です。社長が確認して「自社整備／外注」と予定を決め（社長印）、整備が作業内容と完了日・伝票を記録します（担当印）。予定が決まると、申請者のアプリに通知されます。</p>
        </div>
        {params.plate && <Link className="btn" href="/repairs">すべての車両</Link>}
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        {tab(undefined, '進行中・完了')}
        {tab('submitted', `社長の確認待ち ${count('submitted')}`)}
        {tab('scheduled', `修理待ち ${count('scheduled')}`)}
        {tab('done', `完了 ${count('done')}`)}
        {tab('withdrawn', `取り下げ ${count('withdrawn')}`)}
      </div>
      <table className="table">
        <thead><tr><th>申告日</th><th>運転者</th><th>車番</th><th>症状・状況</th><th>急ぎ</th><th>状態</th><th>修理先・入庫予定</th><th>完了日</th></tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td className="mono">{md(r.reported_on)}</td>
              <td>{name(r.user_id)}</td>
              <td className="mono" style={{ fontSize: 13 }}>
                <Link href={`/repairs?plate=${encodeURIComponent(r.part === 'chassis' && r.chassis_plate ? r.chassis_plate : r.head_plate)}`}>{r.part === 'chassis' ? `台車 ${r.chassis_plate ?? ''}` : r.head_plate || '－'}</Link>
              </td>
              <td style={{ maxWidth: 340 }}><Link href={`/repairs/${r.id}`} style={{ fontWeight: 600 }}>{r.symptom.length > 60 ? `${r.symptom.slice(0, 60)}…` : r.symptom}</Link></td>
              <td>{r.urgency === 'urgent' ? <span className="chip chip-red">早急に</span> : <span style={{ fontSize: 12 }}>出来るだけ早く</span>}</td>
              <td><span className={`chip ${CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
              <td style={{ fontSize: 13 }}>{destinationLabel(r)}{r.entry_on && <div className="mono">{md(r.entry_on)} 入庫</div>}</td>
              <td className="mono">{md(r.completed_on)}</td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>該当する修理申請はありません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
