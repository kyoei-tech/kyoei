import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AccountsClient, type AccountView, type StaffOption } from './AccountsClient'

export default async function AccountsPage() {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const [{ data: rows }, { data: staffRows }, { data: pending }] = await Promise.all([
    supabase.from('app_accounts').select('user_id, login_id, is_driver, can_search_customers, is_admin, disabled_at').order('login_id'),
    supabase.from('staff_members').select('id, name, auth_user_id').order('sort_order', { ascending: true }),
    supabase.rpc('admin_pending_setup_codes'),
  ])
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
      isAdmin: r.is_admin,
      disabled: !!r.disabled_at,
      status: r.disabled_at ? 'stop' : last ? 'use' : 'wait',
      lastSignIn: last,
      pendingUntil: pendingBy.get(r.user_id) ?? null,
    }
  })
  const staff: StaffOption[] = (staffRows ?? []).map((s) => ({ id: s.id, name: s.name, linkedTo: s.auth_user_id }))
  return <AccountsClient accounts={accounts} staff={staff} selfId={admin.userId} />
}
