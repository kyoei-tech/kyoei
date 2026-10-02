import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { monthRange, shiftMonth } from '@/lib/inspection'
import { loadingFloors, packingPlates, vehicleClassLabel } from '@/lib/profile'
import { createClient } from '@/lib/supabase/server'

type Placement = { vehicle_index: number; vehicle_name: string; model: string; chassis_number: string; floor: string | null }
type Row = { id: string; user_id: string; sheet_title: string; round: string; loaded_on: string; vehicle_class: string | null; vehicle_plate: string; chassis_plate: string | null; placements: Placement[]; photo_paths: string[]; note: string }

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00+09:00`).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' })
const roundTitle = (round: string) => (round === '不明' ? '回戦不明' : `${round}回戦`)

/**
 * 荷姿履歴 (read-only): driver cards → that driver's days in a month → the
 * day's 回戦 with photos and 何番に何を積んだか. Records are edited only in the app.
 */
export default async function PackingPage({ searchParams }: { searchParams: Promise<{ user?: string; month?: string; day?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()
  const [{ data: accounts }, { data: profiles }, { data: vehicles }] = await Promise.all([
    supabase.from('app_accounts').select('user_id, login_id, is_driver, disabled_at').order('login_id'),
    supabase.from('account_profiles').select('user_id, full_name, vehicle_class, vehicle_id, chassis_id'),
    supabase.from('vehicles').select('id, plate'),
  ])
  const plate = new Map((vehicles ?? []).map((v) => [v.id as string, v.plate as string]))
  const profile = new Map((profiles ?? []).map((p) => [p.user_id as string, p]))
  const nameOf = (id: string) => {
    const login = accounts?.find((a) => a.user_id === id)?.login_id ?? '不明'
    const name = profile.get(id)?.full_name
    return name ? `${name}（${login}）` : login
  }

  if (!params.user) {
    const { data: recent } = await supabase.from('packing_records').select('user_id, loaded_on').order('loaded_on', { ascending: false }).limit(5000)
    const last = new Map<string, string>()
    const count = new Map<string, number>()
    for (const r of recent ?? []) {
      if (!last.has(r.user_id)) last.set(r.user_id, r.loaded_on)
      count.set(r.user_id, (count.get(r.user_id) ?? 0) + 1)
    }
    const drivers = (accounts ?? []).filter((a) => !a.disabled_at && (a.is_driver || count.has(a.user_id)))
    return (
      <>
        <div className="page-header">
          <div>
            <h1>荷姿履歴</h1>
            <p>ドライバーがアプリで記録した荷姿（何番に何を積んだか・写真）です。管理画面からは閲覧のみで、編集はできません。ドライバーを選んでください。</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {drivers.map((a) => {
            const p = profile.get(a.user_id)
            const plates = packingPlates(p?.vehicle_class, p?.vehicle_id ? plate.get(p.vehicle_id) : null, p?.chassis_id ? plate.get(p.chassis_id) : null)
            return (
              <Link key={a.user_id} href={`/packing?user=${a.user_id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{p?.full_name || a.login_id}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.login_id} ・ {vehicleClassLabel(p?.vehicle_class)}</div>
                <div className="mono" style={{ fontWeight: 700, marginTop: 8 }}>{plates.length ? plates.join(' ／ ') : <span style={{ color: 'var(--muted)' }}>車両未定</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                  {count.get(a.user_id) ? `記録 ${count.get(a.user_id)}件 ・ 最終 ${dayLabel(last.get(a.user_id)!)}` : 'まだ記録はありません'}
                </div>
              </Link>
            )
          })}
        </div>
      </>
    )
  }

  const { month, from, to } = monthRange(params.day?.slice(0, 7) ?? params.month)
  const { data } = await supabase
    .from('packing_records')
    .select('id, user_id, sheet_title, round, loaded_on, vehicle_class, vehicle_plate, chassis_plate, placements, photo_paths, note')
    .eq('user_id', params.user)
    .gte('loaded_on', from)
    .lt('loaded_on', to)
    .order('loaded_on', { ascending: false })
  const rows = (data ?? []) as Row[]
  const days = [...new Set(rows.map((r) => r.loaded_on))]
  const base = `/packing?user=${params.user}`
  const dayRows = params.day ? rows.filter((r) => r.loaded_on === params.day).sort((a, b) => a.round.localeCompare(b.round, 'ja', { numeric: true })) : []

  const signed = new Map<string, string>()
  const paths = dayRows.flatMap((r) => r.photo_paths)
  if (paths.length) {
    const { data: urls } = await supabase.storage.from('packing-photos').createSignedUrls(paths, 600)
    for (const s of urls ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>荷姿履歴：{nameOf(params.user)}</h1>
          <p>日付を選ぶと、その日の回戦ごとの写真と、何番に何を積んだかを表示します。</p>
        </div>
        <Link href="/packing" className="btn">ドライバー一覧へ</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="card" style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Link className="btn btn-small" href={`${base}&month=${shiftMonth(month, -1)}`}>‹</Link>
            <b>{month.replace('-', '年')}月</b>
            <Link className="btn btn-small" href={`${base}&month=${shiftMonth(month, 1)}`}>›</Link>
          </div>
          {days.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>この月の記録はありません</div>}
          {days.map((d) => {
            const ofDay = rows.filter((r) => r.loaded_on === d)
            const cars = ofDay.reduce((n, r) => n + r.placements.length, 0)
            return (
              <Link key={d} href={`${base}&day=${d}`} className="nav-link" aria-current={params.day === d ? 'page' : undefined} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{dayLabel(d)}</span>
                <span style={{ fontSize: 12 }}>{ofDay.length}回戦・{cars}台</span>
              </Link>
            )
          })}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {!params.day && <div className="card" style={{ color: 'var(--muted)' }}>左の一覧から日付を選んでください。</div>}
          {dayRows.map((r) => {
            const floors = loadingFloors(r.vehicle_class)
            const order = (p: Placement) => (p.floor && floors.includes(p.floor) ? floors.indexOf(p.floor) : 99)
            const placements = [...r.placements].sort((a, b) => order(a) - order(b) || a.vehicle_index - b.vehicle_index)
            return (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{roundTitle(r.round)}・{r.placements.length}台</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {vehicleClassLabel(r.vehicle_class)} ・ <span className="mono">{packingPlates(r.vehicle_class, r.vehicle_plate, r.chassis_plate).join(' ／ ') || '車両未定'}</span>
                    {r.sheet_title && ` ・ ${r.sheet_title}`}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: r.photo_paths.length ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap: 16, marginTop: 12 }}>
                  <table className="table" style={{ margin: 0 }}>
                    <thead><tr><th style={{ width: 70 }}>場所</th><th>車種・型式</th><th>車体番号</th></tr></thead>
                    <tbody>
                      {placements.map((p, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 800 }}>{p.floor ?? <span style={{ color: 'var(--muted)' }}>－</span>}</td>
                          <td>{p.vehicle_name}{p.model && <span className="mono" style={{ color: 'var(--muted)', marginLeft: 6 }}>{p.model}</span>}</td>
                          <td className="mono">{p.chassis_number || <span style={{ color: 'var(--muted)' }}>空欄</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {r.photo_paths.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                      {r.photo_paths.map((path) =>
                        signed.get(path) ? (
                          <a key={path} href={signed.get(path)} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={signed.get(path)} alt="荷姿の写真" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 10 }} />
                          </a>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
                {r.note && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>メモ：{r.note}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
