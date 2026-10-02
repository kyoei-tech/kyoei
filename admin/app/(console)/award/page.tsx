import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { monthRange, shiftMonth } from '@/lib/inspection'
import { createClient } from '@/lib/supabase/server'
import { DecideButtons, DisclosureForm } from './AwardClient'

type Result = { nominee_id: string; nominee_name: string; position_name: string | null; votes: number }
type Reason = { ballot_id: string; reason: string; disclosure: string | null }
type Disclosure = {
  request_id: string; period: string; nominee_name: string; ballot_reason: string; requested_by_name: string; request_reason: string
  requested_at: string; requested_by_me: boolean; status: string; decided_by_name: string | null; decided_at: string | null; voter_name: string | null
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) : '')
const monthTitle = (period: string) => `${Number(period.slice(0, 4))}年${Number(period.slice(5, 7))}月`
const STATUS: Record<string, string> = { pending: '承認待ち', approved: '開示済み', rejected: '却下' }

/**
 * 社長賞: votes per person and the reasons — never who voted. A voter is
 * shown only for a ballot whose disclosure one admin requested and another
 * approved (both logged in 変更履歴).
 */
export default async function AwardPage({ searchParams }: { searchParams: Promise<{ month?: string; nominee?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  // Default: the month being voted on now (先月).
  const current = shiftMonth(monthRange(undefined).month, -1)
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : current
  const period = `${month}-01`
  const supabase = await createClient()
  const [{ data: results }, { data: reasons }, { data: disclosures }] = await Promise.all([
    supabase.rpc('award_results', { p_period: period }),
    params.nominee ? supabase.rpc('award_reasons', { p_period: period, p_nominee: params.nominee }) : Promise.resolve({ data: [] }),
    supabase.rpc('award_disclosures'),
  ])
  const rows = (results ?? []) as Result[]
  const selected = rows.find((r) => r.nominee_id === params.nominee)
  const total = rows.reduce((n, r) => n + Number(r.votes), 0)
  const requests = (disclosures ?? []) as Disclosure[]
  const link = (m: string) => `/award?month=${m}`

  return (
    <>
      <div className="page-header">
        <div>
          <h1>社長賞</h1>
          <p>
            毎月1日〜15日に、ドライバーが先月頑張った3人へ投票します。ここでは得票数と「頑張ったこと」だけを表示し、誰が投票したかは管理者にも表示しません。
            誹謗中傷など問題のある投票に限り、理由を書いて「開示申請」し、<b>別の管理者が承認したときだけ</b>その1票の投票者が表示されます（申請・承認・閲覧は変更履歴に残ります）。投票者の記録は1年後に削除されます。
          </p>
        </div>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Link className="btn btn-small" href={link(shiftMonth(month, -1))}>‹ 前月</Link>
        <b style={{ fontSize: 18 }}>{monthTitle(period)}の社長賞</b>
        <Link className="btn btn-small" href={link(shiftMonth(month, 1))}>翌月 ›</Link>
        <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
          {month === current ? '投票受付中（今月15日まで）・' : ''}総票数 {total}票
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <table className="table">
          <thead><tr><th style={{ width: 40 }}>順位</th><th>名前</th><th style={{ width: 70, textAlign: 'right' }}>得票</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const rank = rows.findIndex((x) => Number(x.votes) === Number(r.votes)) + 1
              return (
                <tr key={r.nominee_id} style={{ background: r.nominee_id === params.nominee ? 'var(--lime-soft, #eaffea)' : undefined }}>
                  <td style={{ fontWeight: 800 }}>{rank}</td>
                  <td>
                    <Link href={`${link(month)}&nominee=${r.nominee_id}`} style={{ fontWeight: 700 }}>{r.nominee_name}</Link>
                    {r.position_name && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.position_name}</div>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 18 }}>{r.votes}</td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>この月の投票はまだありません</td></tr>}
            {rows.length > 0 && <TieNote />}
          </tbody>
        </table>
        <div style={{ display: 'grid', gap: 10 }}>
          {!selected && <div className="card" style={{ color: 'var(--muted)' }}>左の名前をクリックすると、「頑張ったこと」の一覧を表示します。</div>}
          {selected && (
            <>
              <h2 style={{ margin: 0 }}>{selected.nominee_name}さんの頑張ったこと（{selected.votes}票）</h2>
              {((reasons ?? []) as Reason[]).map((r) => (
                <div key={r.ballot_id} className="card">
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 15 }}>{r.reason}</div>
                  <div style={{ marginTop: 8 }}>
                    {r.disclosure ? <span className="chip chip-orange">開示申請：{STATUS[r.disclosure]}</span> : <DisclosureForm ballotId={r.ballot_id} />}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <h2 style={{ margin: '30px 0 10px' }}>投票者の開示申請</h2>
      <table className="table">
        <thead><tr><th>申請</th><th>対象の投票</th><th>理由</th><th>状態</th><th>投票者</th></tr></thead>
        <tbody>
          {requests.map((d) => (
            <tr key={d.request_id}>
              <td style={{ fontSize: 13 }}>{d.requested_by_name}<div style={{ color: 'var(--muted)' }}>{when(d.requested_at)}</div></td>
              <td style={{ fontSize: 13 }}>{monthTitle(d.period)}・{d.nominee_name}さんへ<div style={{ color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>「{d.ballot_reason}」</div></td>
              <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{d.request_reason}</td>
              <td>
                <span className={`chip ${d.status === 'approved' ? 'chip-red' : d.status === 'rejected' ? 'chip-gray' : 'chip-orange'}`}>{STATUS[d.status]}</span>
                {d.decided_by_name && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{d.decided_by_name}・{when(d.decided_at)}</div>}
                {d.status === 'pending' && (d.requested_by_me ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>別の管理者の承認待ち</div> : <DecideButtons requestId={d.request_id} />)}
              </td>
              <td style={{ fontWeight: 800 }}>{d.voter_name ?? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>非表示</span>}</td>
            </tr>
          ))}
          {requests.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>開示申請はありません</td></tr>}
        </tbody>
      </table>
    </>
  )
}

function TieNote() {
  return (
    <tr>
      <td colSpan={3} style={{ fontSize: 12, color: 'var(--muted)' }}>同じ得票数は同じ順位です。</td>
    </tr>
  )
}
