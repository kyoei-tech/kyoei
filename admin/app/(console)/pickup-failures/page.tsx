import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { PICKUP_REASONS, PICKUP_STATUS_LABEL, reasonLabel, type PickupStatus } from '@/lib/pickup'
import { createClient } from '@/lib/supabase/server'

type BoardRow = {
  id: string
  driver_name: string
  vehicle_name: string
  chassis_number: string
  pickup: string
  pickup_ref: string
  dropoff: string
  reason: string
  detail: string
  photo_paths: string[]
  approver_name: string | null
  approved_by_name: string | null
  driver_resolved_at: string | null
  approver_resolved_at: string | null
  status: PickupStatus
  created_at: string
}

const CHIP: Record<PickupStatus, string> = { pending: 'chip-orange', approved: 'chip-red', resolved: 'chip-ink' }
const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 引取不可: every request (open ones always), filtered by status, 理由 and month. */
export default async function PickupFailuresPage({ searchParams }: { searchParams: Promise<{ status?: string; reason?: string; month?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('kyoei_can_view_pickup')
  if (allowed !== true) {
    return (
      <>
        <div className="page-header"><div><h1>引取不可</h1></div></div>
        <div className="notice notice-orange">引取不可を見る権限がありません。「アカウント」で自分のアカウントに「引取不可の閲覧」か「引取不可の承認」を付けてください。</div>
      </>
    )
  }
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : null
  const range = month
    ? { p_from: `${month}-01`, p_to: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) }
    : { p_from: null, p_to: null }
  const { data } = await supabase.rpc('pickup_failure_board', range)
  const rows = (data ?? []) as BoardRow[]
  const byReason = params.reason ? rows.filter((r) => r.reason === params.reason) : rows
  const filtered = params.status ? byReason.filter((r) => r.status === params.status) : byReason
  const count = (s: PickupStatus) => byReason.filter((r) => r.status === s).length
  const href = (change: Record<string, string | undefined>) => {
    const next = { status: params.status, reason: params.reason, month: month ?? undefined, ...change }
    return `/pickup-failures?${new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]))}`
  }
  return (
    <>
      <div className="page-header">
        <div>
          <h1>引取不可</h1>
          <p>積地で引き取れなかった車の記録です。ドライバーが理由と写真を付けて申請し、出勤中の役職者が承認すると「引取不可」になります。電話などで解決したときは、ドライバーと役職者の両方が「解決」を押すと通常どおり輸送する扱いになります。</p>
        </div>
      </div>
      <form className="row" style={{ gap: 10, marginBottom: 12, alignItems: 'end' }}>
        {params.status && <input type="hidden" name="status" value={params.status} />}
        <label className="field">月<input className="input" type="month" name="month" defaultValue={month ?? ''} /></label>
        <label className="field">理由
          <select className="input" name="reason" defaultValue={params.reason ?? ''}>
            <option value="">すべて</option>
            {PICKUP_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="btn">絞り込む</button>
        {(month || params.reason) && <Link className="btn" href={href({ month: undefined, reason: undefined })}>解除</Link>}
      </form>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        <Link className={`btn btn-small ${!params.status ? 'btn-primary' : ''}`} href={href({ status: undefined })}>すべて {byReason.length}</Link>
        {(['pending', 'approved', 'resolved'] as const).map((s) => (
          <Link key={s} className={`btn btn-small ${params.status === s ? 'btn-primary' : ''}`} href={href({ status: s })}>{PICKUP_STATUS_LABEL[s]} {count(s)}</Link>
        ))}
      </div>
      <table className="table">
        <thead><tr><th>申請日時</th><th>ドライバー</th><th>車両・車台番号</th><th>積地</th><th>理由</th><th>写真</th><th>状態</th><th>承認・解決</th></tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td className="mono">{when(r.created_at)}</td>
              <td>{r.driver_name}</td>
              <td>
                <Link href={`/pickup-failures/${r.id}`} style={{ fontWeight: 700 }}>{r.vehicle_name || '（品名なし）'}</Link>
                <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{r.chassis_number || '車台番号なし'}</div>
              </td>
              <td style={{ fontSize: 13 }}>{r.pickup}{r.pickup_ref && <span style={{ color: 'var(--muted)' }}>（{r.pickup_ref}）</span>}</td>
              <td style={{ fontSize: 13, maxWidth: 260 }}>
                {reasonLabel(r.reason)}
                {r.detail && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.detail.length > 50 ? `${r.detail.slice(0, 50)}…` : r.detail}</div>}
              </td>
              <td className="mono">{r.photo_paths.length}枚</td>
              <td><span className={`chip ${CHIP[r.status]}`}>{PICKUP_STATUS_LABEL[r.status]}</span></td>
              <td style={{ fontSize: 12 }}>
                {r.status === 'approved' ? `${r.approved_by_name ?? ''} が承認` : r.status === 'resolved' ? '両者が解決' : `${r.approver_name ?? '－'} の承認待ち`}
                {r.status === 'pending' && (r.driver_resolved_at || r.approver_resolved_at) && (
                  <div style={{ color: 'var(--muted)' }}>{r.driver_resolved_at ? 'ドライバー' : '役職者'}が解決を押しました</div>
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>該当する引取不可はありません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
