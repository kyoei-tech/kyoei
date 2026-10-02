import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { monthRange, shiftMonth } from '@/lib/inspection'
import { categoryLabel, daysBetween, period, type LeaveRow } from '@/lib/leave'
import { createClient } from '@/lib/supabase/server'
import { ConfirmButton, DayLimitForm, DeleteDayLimit, DeletePaidEntry, ExceptionForm, PaidEntryForm, SettingsForm } from './LeaveClient'

type Board = { requests: LeaveRow[]; exceptions: { id: string; name: string; start_on: string; end_on: string; note: string; granted_by_name: string | null }[]; people: { user_id: string; name: string }[] }
type Balance = { available: number; pending: number; over: number; next_expiry: { on: string; days: number } | null }
type PaidRow = { user_id: string; login_id: string; name: string; hire_date: string | null; part_time: boolean; balance: Balance }

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const wd = (iso: string) => '日月火水木金土'[new Date(`${iso}T00:00:00Z`).getUTCDay()]

/** 休暇申請: requests (確認 by 担当者, never rejected), day limits, 有給. */
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string; user?: string }> }) {
  const admin = await requireAdmin()
  const params = await searchParams
  const tab = params.tab === 'limits' || params.tab === 'paid' ? params.tab : 'requests'
  const { month, from, to } = monthRange(params.month)
  const supabase = await createClient()
  const { data: me } = await supabase.from('app_accounts').select('can_check_leave').eq('user_id', admin.userId).maybeSingle()
  const isChecker = !!me?.can_check_leave
  const tabLink = (t: string, label: string) => <Link className={`btn btn-small ${tab === t ? 'btn-primary' : ''}`} href={`/leave?tab=${t}`}>{label}</Link>

  const header = (
    <>
      <div className="page-header">
        <div>
          <h1>休暇申請</h1>
          <p>ドライバーがアプリから出した休暇届です。「休暇の担当者」が確認すると確定します（却下はありません）。直近の日や上限に達した日は、相談のうえ担当者が「申請を許可」すると、本人が申請できるようになります。確認済みの休暇は出勤簿とカレンダーに表示されます。</p>
        </div>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        {tabLink('requests', '申請一覧')}
        {tabLink('limits', '締切・上限人数')}
        {tabLink('paid', '有給の残り日数')}
      </div>
    </>
  )

  if (tab === 'limits') {
    const [{ data: settings }, { data: limits }, { data: status }] = await Promise.all([
      supabase.from('leave_settings').select('notice_days, default_daily_limit').maybeSingle(),
      supabase.from('leave_day_limits').select('day, max_people, note').gte('day', new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)).order('day'),
      supabase.rpc('leave_day_status', { p_from: from, p_to: daysBetween(from, to).at(-2) ?? from }),
    ])
    const days = (status ?? []) as { day: string; taken: number; max_people: number | null }[]
    return (
      <>
        {header}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 420px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <SettingsForm noticeDays={settings?.notice_days ?? 7} defaultLimit={settings?.default_daily_limit ?? null} />
            <div className="card">
              <b>日付ごとの上限（普段の上限より優先）</b>
              <DayLimitForm />
              <table className="table" style={{ marginTop: 10 }}>
                <tbody>
                  {(limits ?? []).map((l) => (
                    <tr key={l.day}><td className="mono">{md(l.day)}（{wd(l.day)}）</td><td>{l.max_people}人まで</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{l.note}</td><td><DeleteDayLimit day={l.day} /></td></tr>
                  ))}
                  {(limits ?? []).length === 0 && <tr><td style={{ color: 'var(--muted)' }}>設定なし</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <Link className="btn btn-small" href={`/leave?tab=limits&month=${shiftMonth(month, -1)}`}>‹</Link>
              <b>{month.replace('-', '年')}月の休暇人数</b>
              <Link className="btn btn-small" href={`/leave?tab=limits&month=${shiftMonth(month, 1)}`}>›</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {days.map((d) => {
                const full = d.max_people != null && d.taken >= d.max_people
                return (
                  <div key={d.day} style={{ border: '1px solid var(--line, #e5e7e3)', borderRadius: 8, padding: 6, background: full ? '#fde7e8' : undefined }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{md(d.day)}（{wd(d.day)}）</div>
                    <div style={{ fontWeight: 800 }}>{d.taken}{d.max_people != null ? ` / ${d.max_people}` : ''}人</div>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>申請中と確認済みの人数／上限。赤は上限に達した日です。</p>
          </div>
        </div>
      </>
    )
  }

  if (tab === 'paid') {
    const { data } = await supabase.rpc('admin_paid_leave')
    const rows = (data ?? []) as PaidRow[]
    const selected = rows.find((r) => r.user_id === params.user)
    const [{ data: grants }, { data: uses }, { data: requests }] = selected
      ? await Promise.all([
          supabase.from('paid_leave_grants').select('id, granted_on, days, expires_on, source, note').eq('user_id', selected.user_id).order('granted_on', { ascending: false }),
          supabase.from('paid_leave_uses').select('id, used_on, days, note').eq('user_id', selected.user_id).order('used_on', { ascending: false }),
          supabase.from('leave_requests').select('start_on, end_on, days, confirmed_at').eq('user_id', selected.user_id).eq('paid', true).is('withdrawn_at', null).order('start_on', { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }]
    return (
      <>
        {header}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <table className="table">
            <thead><tr><th>名前</th><th>入社年月日</th><th style={{ textAlign: 'right' }}>残り</th><th style={{ textAlign: 'right' }}>申請中</th><th>次の期限切れ</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} style={{ background: r.user_id === params.user ? '#eaffea' : undefined }}>
                  <td><Link href={`/leave?tab=paid&user=${r.user_id}`} style={{ fontWeight: 700 }}>{r.name}</Link>{r.part_time && <span className="chip chip-gray" style={{ marginLeft: 6 }}>手入力</span>}</td>
                  <td className="mono" style={{ fontSize: 13 }}>{r.hire_date ?? <span className="chip chip-orange">未登録</span>}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>{Math.max(0, r.balance.available - r.balance.over)}日{r.balance.over > 0 && <div className="chip chip-red">不足 {r.balance.over}日</div>}</td>
                  <td style={{ textAlign: 'right' }}>{r.balance.pending || ''}</td>
                  <td style={{ fontSize: 12 }}>{r.balance.next_expiry ? `${r.balance.next_expiry.on}に${r.balance.next_expiry.days}日` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'grid', gap: 14 }}>
            {!selected && <div className="card" style={{ color: 'var(--muted)' }}>
              名前を選ぶと、付与と取得の記録を表示します。入社年月日から法定日数（6か月で10日〜6年6か月以上20日）を自動で付与し、2年で期限切れになります。アルバイトは自動付与しないので、ここから付与日数を入力してください。アプリ導入前に取った有給は「取得（アプリ外）」として入力すると、残り日数が合います。
            </div>}
            {selected && (
              <>
                <h2 style={{ margin: 0 }}>{selected.name}：残り {Math.max(0, selected.balance.available - selected.balance.over)}日</h2>
                <PaidEntryForm user={selected.user_id} name={selected.name} />
                <div className="card">
                  <b>付与</b>
                  <table className="table" style={{ marginTop: 6 }}><tbody>
                    {(grants ?? []).map((g) => (
                      <tr key={g.id}><td className="mono">{g.granted_on}</td><td>{g.days}日</td><td style={{ fontSize: 12 }}>期限 {g.expires_on}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{g.source === 'auto' ? '自動（法定）' : `手入力 ${g.note}`}</td><td>{g.source === 'manual' && <DeletePaidEntry kind="grant" id={g.id} />}</td></tr>
                    ))}
                    {(grants ?? []).length === 0 && <tr><td style={{ color: 'var(--muted)' }}>付与なし（入社年月日を登録すると自動で付与されます）</td></tr>}
                  </tbody></table>
                </div>
                <div className="card">
                  <b>取得</b>
                  <table className="table" style={{ marginTop: 6 }}><tbody>
                    {(requests ?? []).map((r, i) => (
                      <tr key={`r${i}`}><td className="mono">{period(r)}</td><td>{r.days}日</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>アプリの休暇届（{r.confirmed_at ? '確認済み' : '申請中'}）</td><td /></tr>
                    ))}
                    {(uses ?? []).map((u) => (
                      <tr key={u.id}><td className="mono">{u.used_on}</td><td>{u.days}日</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>アプリ外 {u.note}</td><td><DeletePaidEntry kind="use" id={u.id} /></td></tr>
                    ))}
                  </tbody></table>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  const { data } = await supabase.rpc('leave_checker_board', { p_from: from, p_to: daysBetween(from, to).at(-2) ?? from })
  const board = (data ?? { requests: [], exceptions: [], people: [] }) as Board
  const pending = board.requests.filter((r) => !r.confirmed_at)
  return (
    <>
      {header}
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <Link className="btn btn-small" href={`/leave?month=${shiftMonth(month, -1)}`}>‹ 前月</Link>
        <b style={{ fontSize: 18 }}>{month.replace('-', '年')}月</b>
        <Link className="btn btn-small" href={`/leave?month=${shiftMonth(month, 1)}`}>翌月 ›</Link>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>確認待ち {pending.length}件 ・ 全{board.requests.length}件</span>
      </div>
      {!isChecker && <div className="notice notice-orange" style={{ marginBottom: 12 }}>確認と申請の許可は「休暇の担当者」に設定されたアカウントで行えます（アプリからもできます）。</div>}
      <table className="table">
        <thead><tr><th>期間</th><th>名前</th><th>日数</th><th>区分</th><th>有給</th><th>届日</th><th>状態</th></tr></thead>
        <tbody>
          {board.requests.map((r) => (
            <tr key={r.id}>
              <td className="mono" style={{ fontWeight: 700 }}>{period(r)}</td>
              <td>{r.name}</td>
              <td>{r.days}日</td>
              <td style={{ fontSize: 13 }}>{categoryLabel(r)}</td>
              <td>{r.paid ? <span className="chip chip-lime">有給</span> : ''}</td>
              <td className="mono" style={{ fontSize: 12 }}>{md(r.filed_on)}</td>
              <td>{r.confirmed_at ? <span className="chip chip-ink">確認済み（{r.confirmed_by_name}）</span> : isChecker ? <ConfirmButton id={r.id} name={r.name} /> : <span className="chip chip-orange">確認待ち</span>}</td>
            </tr>
          ))}
          {board.requests.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>この月の休暇申請はありません</td></tr>}
        </tbody>
      </table>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, marginTop: 20 }}>
        <div className="card">
          <b>申請の許可（相談済み）</b>
          {isChecker ? <ExceptionForm people={board.people} /> : <p style={{ color: 'var(--muted)' }}>「休暇の担当者」のアカウントで許可できます。</p>}
        </div>
        <div className="card">
          <b>許可した日</b>
          <table className="table" style={{ marginTop: 6 }}><tbody>
            {board.exceptions.map((e) => (
              <tr key={e.id}><td>{e.name}</td><td className="mono">{period(e)}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.note}（{e.granted_by_name}）</td></tr>
            ))}
            {board.exceptions.length === 0 && <tr><td style={{ color: 'var(--muted)' }}>なし</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  )
}
