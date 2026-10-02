import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { vehicleClassLabel, vehicleKindLabel } from '@/lib/profile'
import type { ScheduleRow } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { ScheduleBoard, type VehicleRow } from './ScheduleBoard'

/** 車両管理: each vehicle's 3ヶ月点検・12ヶ月点検・車検 reservations. */
export default async function VehicleSchedulesPage() {
  await requireAdmin()
  const supabase = await createClient()
  const [{ data: vehicles }, { data: schedules }, { data: profiles }] = await Promise.all([
    supabase.from('vehicles').select('id, plate, kind, vehicle_class').order('vehicle_class').order('kind').order('plate'),
    supabase.from('vehicle_schedules').select('id, vehicle_id, kind, scheduled_on, scheduled_time, place, handover, vendor, notes, completed_at').order('scheduled_on', { ascending: false }),
    supabase.from('account_profiles').select('full_name, vehicle_id, chassis_id'),
  ])
  const assignee = new Map<string, string>()
  for (const p of profiles ?? []) {
    if (p.vehicle_id) assignee.set(p.vehicle_id, p.full_name || '（名前未登録）')
    if (p.chassis_id) assignee.set(p.chassis_id, p.full_name || '（名前未登録）')
  }
  const rows: VehicleRow[] = (vehicles ?? []).map((v) => ({
    id: v.id, plate: v.plate, label: `${v.vehicle_class ? vehicleClassLabel(v.vehicle_class) : '車格未設定'}・${vehicleKindLabel(v.kind)}`,
    assignee: assignee.get(v.id) ?? null,
    schedules: ((schedules ?? []) as ScheduleRow[]).filter((s) => s.vehicle_id === v.id),
  }))
  return (
    <>
      <div className="page-header">
        <div>
          <h1>車両管理</h1>
          <p>3ヶ月点検・12ヶ月点検・車検を予約したら、ここに予定を入力します（日付・時間・場所・共栄持込か業者の引取か・特記事項）。予定は担当ドライバーのマイページに表示され、アプリに通知されます。終わったら「完了」にしてください。</p>
        </div>
        <Link className="btn" href="/vehicles">車両の登録へ</Link>
      </div>
      <ScheduleBoard vehicles={rows} />
    </>
  )
}
