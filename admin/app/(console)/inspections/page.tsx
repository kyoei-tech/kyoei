import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { ANSWERS, INSTRUCTIONS, monthRange, shiftMonth } from '@/lib/inspection'
import { vehicleClassLabel } from '@/lib/profile'
import { createClient } from '@/lib/supabase/server'

type Result = { item_id: string; unit: string; plate: string; section: string; label: string; result: string; note: string; photo_path: string | null; follow_up: boolean }

const time = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })

/** 点検簿: every driver's daily inspections for a month (read-only; records can't be edited). */
export default async function InspectionsPage({ searchParams }: { searchParams: Promise<{ month?: string; user?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const { month, from, to } = monthRange(params.month)
  const supabase = await createClient()
  let query = supabase
    .from('vehicle_inspections')
    .select('id, user_id, inspected_on, completed_at, vehicle_class, vehicle_plate, chassis_plate, results, has_issue, reported_to, reported_at, instruction, instruction_note')
    .gte('inspected_on', from)
    .lt('inspected_on', to)
    .order('completed_at', { ascending: false })
    .limit(2000)
  if (params.user) query = query.eq('user_id', params.user)
  const [{ data: records }, { data: accounts }, { data: profiles }] = await Promise.all([
    query,
    supabase.from('app_accounts').select('user_id, login_id').order('login_id'),
    supabase.from('account_profiles').select('user_id, full_name'),
  ])
  const fullName = new Map((profiles ?? []).map((p) => [p.user_id as string, p.full_name as string]))
  const who = (id: string) => {
    const login = accounts?.find((a) => a.user_id === id)?.login_id ?? '不明'
    return fullName.get(id) ? `${fullName.get(id)}（${login}）` : login
  }

  // Photos of 否 items: short-lived signed URLs (bucket is private; RLS lets MFA admins read).
  const photoPaths = (records ?? []).flatMap((r) => (r.results as Result[]).map((x) => x.photo_path).filter((p): p is string => !!p))
  const signed = new Map<string, string>()
  if (photoPaths.length) {
    const { data } = await supabase.storage.from('inspection-photos').createSignedUrls(photoPaths, 600)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }

  const link = (m: string) => `/inspections?month=${m}${params.user ? `&user=${params.user}` : ''}`
  const issues = (records ?? []).filter((r) => r.has_issue).length
  return (
    <>
      <div className="page-header">
        <div>
          <h1>点検簿</h1>
          <p>ドライバーがアプリで記録した日常点検です。記録は変更・削除できません（法定の点検記録として保存）。「否」があった点検は、運行管理者への報告内容も表示します。</p>
        </div>
        <Link href="/inspections/items" className="btn">点検項目を編集</Link>
      </div>
      <form className="row" style={{ gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <Link className="btn btn-small" href={link(shiftMonth(month, -1))}>‹ 前月</Link>
        <b style={{ fontSize: 18 }}>{month.replace('-', '年')}月</b>
        <Link className="btn btn-small" href={link(shiftMonth(month, 1))}>翌月 ›</Link>
        <input type="hidden" name="month" value={month} />
        <select className="input" name="user" defaultValue={params.user ?? ''} style={{ width: 260, marginLeft: 16 }}>
          <option value="">全員</option>
          {(accounts ?? []).map((a) => <option key={a.user_id} value={a.user_id}>{who(a.user_id)}</option>)}
        </select>
        <button className="btn btn-small" type="submit">絞り込む</button>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{records?.length ?? 0} 件（異常あり {issues} 件）</span>
      </form>
      <table className="table">
        <thead><tr><th>日付</th><th>完了</th><th>ドライバー</th><th>車両</th><th>結果</th><th>運行管理者の指示</th></tr></thead>
        <tbody>
          {(records ?? []).map((r) => {
            const results = r.results as Result[]
            const ng = results.filter((x) => x.result === 'ng')
            return (
              <tr key={r.id}>
                <td className="mono">{r.inspected_on}</td>
                <td className="mono">{time(r.completed_at)}</td>
                <td>{who(r.user_id)}</td>
                <td>
                  <div className="mono" style={{ fontWeight: 700 }}>{[r.vehicle_plate, r.chassis_plate].filter(Boolean).join(' ／ ')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{vehicleClassLabel(r.vehicle_class)}</div>
                </td>
                <td>
                  {r.has_issue ? <span className="chip chip-red">異常あり（{ng.length}）</span> : <span className="chip chip-ink">異常なし</span>}
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>全{results.length}項目</summary>
                    <table style={{ fontSize: 12, marginTop: 6 }}>
                      <tbody>
                        {results.map((x, i) => (
                          <tr key={i}>
                            <td style={{ padding: '2px 8px 2px 0', color: 'var(--muted)' }}>{x.unit === 'chassis' ? '台車' : ''}{x.section}</td>
                            <td style={{ padding: '2px 8px' }}>{x.label}{x.follow_up && <span className="chip chip-orange" style={{ marginLeft: 4 }}>前回否</span>}</td>
                            <td style={{ padding: '2px 0', fontWeight: 700, color: x.result === 'ng' ? '#b0161e' : undefined }}>{ANSWERS[x.result] ?? x.result}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </td>
                <td style={{ fontSize: 13 }}>
                  {ng.map((x, i) => (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{x.section}：{x.label}</div>
                      <div style={{ fontWeight: 700, color: '#b0161e' }}>{x.note}</div>
                      {x.photo_path && signed.get(x.photo_path) && (
                        <a href={signed.get(x.photo_path)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={signed.get(x.photo_path)} alt="異常箇所の写真" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, marginTop: 4 }} />
                        </a>
                      )}
                    </div>
                  ))}
                  {r.has_issue && (
                    <div>
                      報告先：{r.reported_to}（{r.reported_at ? time(r.reported_at) : ''}）<br />
                      指示：<b style={{ color: r.instruction === 'ok' ? undefined : '#b0161e' }}>{INSTRUCTIONS[r.instruction ?? ''] ?? ''}</b>
                      {r.instruction_note && <div style={{ color: 'var(--muted)' }}>{r.instruction_note}</div>}
                    </div>
                  )}
                  {!r.has_issue && <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
              </tr>
            )
          })}
          {(records ?? []).length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>この月の点検記録はありません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
