import { requireAdmin } from '@/lib/auth'
import { healthStatus } from '@/lib/schedule'
import { createServiceClient } from '@/lib/supabase/service'
import { HealthBoard, type HealthPerson } from './HealthBoard'

/** 健康診断: every employee's reservation status (年1回, or 年2回). */
export default async function HealthPage() {
  await requireAdmin()
  const service = createServiceClient()
  const [{ data: accounts }, { data: profiles }, { data: checks }, { data: staff }] = await Promise.all([
    service.from('app_accounts').select('user_id, login_id, disabled_at').is('disabled_at', null).order('login_id'),
    service.from('account_profiles').select('user_id, full_name, health_checks_per_year'),
    service.from('health_checks').select('id, user_id, scheduled_on, scheduled_time, place, notes, completed_on').order('scheduled_on', { ascending: false }),
    service.from('staff_members').select('name, auth_user_id').not('auth_user_id', 'is', null),
  ])
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const people: HealthPerson[] = (accounts ?? []).map((a) => {
    const p = profiles?.find((x) => x.user_id === a.user_id)
    const mine = (checks ?? []).filter((c) => c.user_id === a.user_id)
    const lastCompleted = mine.map((c) => c.completed_on).filter(Boolean).sort().at(-1) ?? null
    const open = mine.filter((c) => !c.completed_on).sort((x, y) => x.scheduled_on.localeCompare(y.scheduled_on))
    const perYear = p?.health_checks_per_year ?? 1
    return {
      userId: a.user_id, loginId: a.login_id,
      name: p?.full_name || staff?.find((s) => s.auth_user_id === a.user_id)?.name || a.login_id,
      perYear, lastCompleted, open, history: mine.filter((c) => c.completed_on),
      status: healthStatus(perYear, lastCompleted, open.length > 0, today),
    }
  })
  return (
    <>
      <div className="page-header">
        <div>
          <h1>健康診断</h1>
          <p>全社員の健康診断の予約と受診を管理します。年1回が基本で、深夜業などで年2回の人は「年2回」にしてください。予約を入れると本人のアプリに通知され、マイページに表示されます。受診したら「受診済み」にしてください。</p>
        </div>
      </div>
      <HealthBoard people={people} />
    </>
  )
}
