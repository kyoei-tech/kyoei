import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { VehiclesClient, type VehicleView } from './VehiclesClient'

export default async function VehiclesPage() {
  await requireAdmin()
  const supabase = await createClient()
  const [{ data: vehicles }, { data: profiles }] = await Promise.all([
    supabase.from('vehicles').select('id, plate, kind, shaken_due, inspection_3m_due, inspection_12m_due, note').order('kind').order('plate'),
    supabase.from('account_profiles').select('full_name, vehicle_id, chassis_id'),
  ])
  const assignee = new Map<string, string>()
  for (const p of profiles ?? []) {
    if (p.vehicle_id) assignee.set(p.vehicle_id, p.full_name || '（名前未登録）')
    if (p.chassis_id) assignee.set(p.chassis_id, p.full_name || '（名前未登録）')
  }
  const rows: VehicleView[] = (vehicles ?? []).map((v) => ({
    id: v.id, plate: v.plate, kind: v.kind, shakenDue: v.shaken_due, inspection3mDue: v.inspection_3m_due, inspection12mDue: v.inspection_12m_due, note: v.note, assignee: assignee.get(v.id) ?? null,
  }))
  return <VehiclesClient vehicles={rows} />
}
