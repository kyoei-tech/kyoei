import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AccountsClient, type AccountView, type PositionOption, type StaffOption, type VehicleOption } from './AccountsClient'

export default async function AccountsPage() {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const [{ data: rows }, { data: staffRows }, { data: pending }, { data: profileRows }, { data: positionRows }, { data: vehicleRows }] = await Promise.all([
    supabase.from('app_accounts').select('user_id, login_id, is_driver, can_search_customers, is_admin, can_check_leave, disabled_at').order('login_id'),
    supabase.from('staff_members').select('id, name, auth_user_id').order('sort_order', { ascending: true }),
    supabase.rpc('admin_pending_setup_codes'),
    supabase.from('account_profiles').select('user_id, full_name, position_id, hire_date, vehicle_class, vehicle_id, chassis_id, health_check_due, supervisor_id'),
    supabase.from('positions').select('id, name').order('sort_order'),
    supabase.from('vehicles').select('id, plate, kind').order('plate'),
  ])
  const profiles = new Map((profileRows ?? []).map((p) => [p.user_id as string, p]))
  const positionName = new Map((positionRows ?? []).map((p) => [p.id as string, p.name as string]))
  const plate = new Map((vehicleRows ?? []).map((v) => [v.id as string, v.plate as string]))
  const holder = new Map<string, string>()
  for (const p of profileRows ?? []) {
    if (p.vehicle_id) holder.set(p.vehicle_id, p.full_name || '名前未登録')
    if (p.chassis_id) holder.set(p.chassis_id, p.full_name || '名前未登録')
  }
  const holderUser = new Map<string, string>()
  for (const p of profileRows ?? []) {
    if (p.vehicle_id) holderUser.set(p.vehicle_id, p.user_id)
    if (p.chassis_id) holderUser.set(p.chassis_id, p.user_id)
  }
  // Last sign-in comes from Supabase Auth (service role, read-only here).
  const { data: users } = await createServiceClient().auth.admin.listUsers({ perPage: 1000 })
  const lastSignIn = new Map((users?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]))
  const pendingBy = new Map<string, string>(((pending ?? []) as { user_id: string; expires_at: string }[]).map((p) => [p.user_id, p.expires_at]))
  const staffBy = new Map((staffRows ?? []).filter((s) => s.auth_user_id).map((s) => [s.auth_user_id as string, s]))

  const accounts: AccountView[] = (rows ?? []).map((r) => {
    const staff = staffBy.get(r.user_id)
    const last = lastSignIn.get(r.user_id) ?? null
    return {
      userId: r.user_id,
      loginId: r.login_id,
      staffId: staff?.id ?? null,
      staffName: staff?.name ?? null,
      isDriver: r.is_driver,
      canSearch: r.can_search_customers,
      canCheckLeave: r.can_check_leave,
      isAdmin: r.is_admin,
      disabled: !!r.disabled_at,
      status: r.disabled_at ? 'stop' : last ? 'use' : 'wait',
      lastSignIn: last,
      pendingUntil: pendingBy.get(r.user_id) ?? null,
      fullName: profiles.get(r.user_id)?.full_name ?? '',
      positionId: profiles.get(r.user_id)?.position_id ?? null,
      positionName: positionName.get(profiles.get(r.user_id)?.position_id ?? '') ?? null,
      hireDate: profiles.get(r.user_id)?.hire_date ?? null,
      vehicleClass: profiles.get(r.user_id)?.vehicle_class ?? null,
      vehicleId: profiles.get(r.user_id)?.vehicle_id ?? null,
      chassisId: profiles.get(r.user_id)?.chassis_id ?? null,
      vehiclePlates: [profiles.get(r.user_id)?.vehicle_id, profiles.get(r.user_id)?.chassis_id].flatMap((id) => (id && plate.get(id) ? [plate.get(id)!] : [])),
      healthCheckDue: profiles.get(r.user_id)?.health_check_due ?? null,
      supervisorId: profiles.get(r.user_id)?.supervisor_id ?? null,
    }
  })
  const positions: PositionOption[] = (positionRows ?? []).map((p) => ({ id: p.id, name: p.name }))
  const vehicles: VehicleOption[] = (vehicleRows ?? []).map((v) => ({ id: v.id, plate: v.plate, kind: v.kind, holderId: holderUser.get(v.id) ?? null, holderName: holder.get(v.id) ?? null }))
  const staff: StaffOption[] = (staffRows ?? []).map((s) => ({ id: s.id, name: s.name, linkedTo: s.auth_user_id }))
  return <AccountsClient accounts={accounts} staff={staff} selfId={admin.userId} positions={positions} vehicles={vehicles} />
}
