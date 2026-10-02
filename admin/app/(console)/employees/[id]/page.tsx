import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { monthRange, shiftMonth } from '@/lib/inspection'
import { daysBetween } from '@/lib/leave'
import { vehicleClassLabel, vehicleKindLabel } from '@/lib/profile'
import { handoverLabel, jstDay, scheduleKindLabel, whenLabel, type CalendarEvent } from '@/lib/schedule'
import { createServiceClient } from '@/lib/supabase/service'
import { EmployeeCalendar } from './EmployeeCalendar'

const hm = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
const LEAVE: Record<string, string> = { personal: '私用', condolence: '慶弔休暇', hospital: '通院', other: 'その他' }

/** One employee: profile, vehicles and a month calendar of everything about them. */
export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  await requireAdmin()
  const { id } = await params
  const { month, from, to } = monthRange((await searchParams).month)
  const service = createServiceClient()
  const { data: account } = await service.from('app_accounts').select('user_id, login_id').eq('user_id', id).maybeSingle()
  if (!account) notFound()
  const [{ data: profile }, { data: staff }] = await Promise.all([
    service.from('account_profiles').select('full_name, position_id, hire_date, vehicle_class, vehicle_id, chassis_id, supervisor_id, health_checks_per_year').eq('user_id', id).maybeSingle(),
    service.from('staff_members').select('name').eq('auth_user_id', id).maybeSingle(),
  ])
  const vehicleIds = [profile?.vehicle_id, profile?.chassis_id].filter(Boolean) as string[]
  const fromJst = `${from}T00:00:00+09:00`, toJst = `${to}T00:00:00+09:00`
  const [{ data: position }, { data: vehicles }, { data: trips }, { data: inspections }, { data: leaves }, { data: repairs }, { data: schedules }, { data: health }] = await Promise.all([
    profile?.position_id ? service.from('positions').select('name').eq('id', profile.position_id).maybeSingle() : Promise.resolve({ data: null }),
    vehicleIds.length ? service.from('vehicles').select('id, plate, kind, vehicle_class').in('id', vehicleIds) : Promise.resolve({ data: [] }),
    service.from('trip_history').select('id, departed_at, returned_at').eq('user_id', id).gte('departed_at', fromJst).lt('departed_at', toJst).order('departed_at'),
    service.from('vehicle_inspections').select('id, inspected_on, has_issue, completed_at').eq('user_id', id).gte('inspected_on', from).lt('inspected_on', to),
    service.from('leave_requests').select('id, start_on, end_on, category, paid').eq('user_id', id).is('withdrawn_at', null).not('confirmed_at', 'is', null).lte('start_on', to).gte('end_on', from),
    service.from('repair_requests').select('id, entry_on, completed_on, method, vendor, symptom').eq('user_id', id).is('withdrawn_at', null),
    vehicleIds.length ? service.from('vehicle_schedules').select('id, vehicle_id, kind, scheduled_on, scheduled_time, place, handover, vendor, completed_at').in('vehicle_id', vehicleIds).gte('scheduled_on', from).lt('scheduled_on', to) : Promise.resolve({ data: [] }),
    service.from('health_checks').select('id, scheduled_on, scheduled_time, place, completed_on').eq('user_id', id).gte('scheduled_on', from).lt('scheduled_on', to),
  ])
  const plateOf = new Map((vehicles ?? []).map((v) => [v.id as string, v.plate as string]))
  const events: CalendarEvent[] = []
  for (const t of trips ?? []) events.push({ day: jstDay(t.departed_at), kind: 'trip', label: `出庫 ${hm(t.departed_at)} 〜 帰庫 ${hm(t.returned_at)}`, id: t.id })
  for (const i of inspections ?? []) events.push({ day: i.inspected_on, kind: 'inspection', label: `日常点検 ${hm(i.completed_at)}（${i.has_issue ? '異常あり' : '異常なし'}）` })
  for (const l of leaves ?? []) for (const d of daysBetween(l.start_on, l.end_on)) if (d >= from && d < to) events.push({ day: d, kind: 'leave', label: `休暇：${LEAVE[l.category] ?? l.category}${l.paid ? '（有給）' : ''}` })
  for (const r of repairs ?? []) {
    if (r.entry_on && r.entry_on >= from && r.entry_on < to) events.push({ day: r.entry_on, kind: 'repair', label: `修理の入庫（${r.method === 'in_house' ? '自社整備' : r.vendor ?? '外注'}）：${r.symptom.slice(0, 30)}` })
    if (r.completed_on && r.completed_on >= from && r.completed_on < to) events.push({ day: r.completed_on, kind: 'repair', label: `修理完了：${r.symptom.slice(0, 30)}` })
  }
  for (const s of schedules ?? []) events.push({ day: s.scheduled_on, kind: 'vehicle', label: `${scheduleKindLabel(s.kind)} ${plateOf.get(s.vehicle_id) ?? ''} ${s.scheduled_time}（${[s.place, handoverLabel(s)].filter(Boolean).join('・')}）${s.completed_at ? '完了' : ''}` })
  for (const h of health ?? []) events.push({ day: h.scheduled_on, kind: 'health', label: `健康診断 ${h.scheduled_time} ${h.place}${h.completed_on ? '（受診済み）' : ''}` })

  const name = profile?.full_name || staff?.name || account.login_id
  const { count: tripCount } = await service.from('trip_history').select('id', { count: 'exact', head: true }).eq('user_id', id)
  const { data: upcoming } = vehicleIds.length
    ? await service.from('vehicle_schedules').select('vehicle_id, kind, scheduled_on, scheduled_time').in('vehicle_id', vehicleIds).is('completed_at', null).order('scheduled_on')
    : { data: [] }
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{name}</h1>
          <p>{account.login_id} ・ {position?.name ?? '役職未設定'} ・ 入社 {profile?.hire_date ?? '未登録'} ・ 健康診断 年{profile?.health_checks_per_year ?? 1}回</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn" href="/employees">社員一覧へ</Link>
          <Link className="btn" href="/accounts">アカウントで編集</Link>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <b>担当車両（{vehicleClassLabel(profile?.vehicle_class)}）</b>
        {(vehicles ?? []).length === 0 && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>未定</span>}
        {(vehicles ?? []).map((v) => (
          <div key={v.id} style={{ marginTop: 6, fontSize: 14 }}>
            <span className="mono" style={{ fontWeight: 800 }}>{v.plate}</span>（{vehicleKindLabel(v.kind)}）
            {(upcoming ?? []).filter((s) => s.vehicle_id === v.id).map((s, i) => (
              <span key={i} className="chip chip-gray" style={{ marginLeft: 6 }}>{scheduleKindLabel(s.kind)} {whenLabel(s.scheduled_on, s.scheduled_time)}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <Link className="btn btn-small" href={`/employees/${id}?month=${shiftMonth(month, -1)}`}>‹ 前月</Link>
        <b style={{ fontSize: 18 }}>{month.replace('-', '年')}月</b>
        <Link className="btn btn-small" href={`/employees/${id}?month=${shiftMonth(month, 1)}`}>翌月 ›</Link>
      </div>
      <EmployeeCalendar userId={id} name={name} month={month} events={events} tripCount={tripCount ?? 0} />
    </>
  )
}
