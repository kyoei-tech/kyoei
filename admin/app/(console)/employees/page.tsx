import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { packingPlates, vehicleClassLabel } from '@/lib/profile'
import { HEALTH_LABEL, healthStatus } from '@/lib/schedule'
import { createServiceClient } from '@/lib/supabase/service'

function tenure(hire: string | null, today: string): string {
  if (!hire) return ''
  const [y1, m1] = hire.split('-').map(Number)
  const [y2, m2] = today.split('-').map(Number)
  const months = (y2 - y1) * 12 + (m2 - m1)
  return months < 0 ? '' : `${Math.floor(months / 12)}年${months % 12}か月`
}

/** 社員管理: everyone at a glance; open a person for their calendar. */
export default async function EmployeesPage() {
  await requireAdmin()
  const service = createServiceClient()
  const [{ data: accounts }, { data: profiles }, { data: positions }, { data: vehicles }, { data: checks }, { data: staff }] = await Promise.all([
    service.from('app_accounts').select('user_id, login_id, disabled_at').is('disabled_at', null).order('login_id'),
    service.from('account_profiles').select('user_id, full_name, position_id, hire_date, vehicle_class, vehicle_id, chassis_id, supervisor_id, health_checks_per_year'),
    service.from('positions').select('id, name, sort_order'),
    service.from('vehicles').select('id, plate'),
    service.from('health_checks').select('user_id, completed_on'),
    service.from('staff_members').select('name, auth_user_id').not('auth_user_id', 'is', null),
  ])
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const plate = new Map((vehicles ?? []).map((v) => [v.id as string, v.plate as string]))
  const nameOf = (id: string | null) => {
    if (!id) return ''
    return profiles?.find((p) => p.user_id === id)?.full_name || staff?.find((s) => s.auth_user_id === id)?.name || accounts?.find((a) => a.user_id === id)?.login_id || ''
  }
  const rows = (accounts ?? []).map((a) => {
    const p = profiles?.find((x) => x.user_id === a.user_id)
    const position = positions?.find((x) => x.id === p?.position_id)
    const mine = (checks ?? []).filter((c) => c.user_id === a.user_id)
    const last = mine.map((c) => c.completed_on).filter(Boolean).sort().at(-1) ?? null
    const open = mine.some((c) => !c.completed_on)
    return { a, p, position, health: healthStatus(p?.health_checks_per_year ?? 1, last, open, today) }
  }).sort((x, y) => (x.position?.sort_order ?? 999) - (y.position?.sort_order ?? 999) || nameOf(x.a.user_id).localeCompare(nameOf(y.a.user_id), 'ja'))
  return (
    <>
      <div className="page-header">
        <div>
          <h1>社員管理</h1>
          <p>社員の情報をまとめて見られます。名前を開くと、出勤・日常点検・休暇・修理・点検／車検・健康診断の予定をカレンダーで確認できます。情報の変更は「アカウント」「車両管理」「健康診断」で行います。</p>
        </div>
      </div>
      <table className="table">
        <thead><tr><th>名前</th><th>役職</th><th>車格・担当車両</th><th>上長</th><th>入社年月日</th><th>健康診断</th></tr></thead>
        <tbody>
          {rows.map(({ a, p, position, health }) => (
            <tr key={a.user_id}>
              <td><Link href={`/employees/${a.user_id}`} style={{ fontWeight: 800 }}>{nameOf(a.user_id)}</Link><div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.login_id}</div></td>
              <td>{position?.name ?? <span style={{ color: 'var(--muted)' }}>未設定</span>}</td>
              <td style={{ fontSize: 13 }}>{vehicleClassLabel(p?.vehicle_class)}<div className="mono" style={{ color: 'var(--muted)' }}>{packingPlates(p?.vehicle_class, p?.vehicle_id ? plate.get(p.vehicle_id) : null, p?.chassis_id ? plate.get(p.chassis_id) : null).join(' ／ ') || '車両未定'}</div></td>
              <td style={{ fontSize: 13 }}>{nameOf(p?.supervisor_id ?? null) || <span style={{ color: 'var(--muted)' }}>未設定</span>}</td>
              <td className="mono" style={{ fontSize: 13 }}>{p?.hire_date ?? '－'}<div style={{ color: 'var(--muted)' }}>{tenure(p?.hire_date ?? null, today)}</div></td>
              <td><span className={`chip ${health === 'scheduled' ? 'chip-ink' : health === 'done' ? 'chip-gray' : health === 'due' ? 'chip-red' : 'chip-orange'}`}>{HEALTH_LABEL[health]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
