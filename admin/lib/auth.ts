import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AdminContext = {
  userId: string
  loginId: string
  /** "小西（kyoei0026）" — shown in the sidebar and written to the audit log. */
  label: string
}

/**
 * Every page and every Server Action of the console starts here. It checks,
 * against Supabase itself (not just the cookie): a signed-in user, and that
 * the database recognizes this session as an enabled admin whose sign-in was
 * approved in the KYOEI app (is_kyoei_admin_mfa — the same check RLS uses).
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) redirect('/login')

  const { data: approved } = await supabase.rpc('is_kyoei_admin_mfa')
  if (approved !== true) redirect('/login?step=approve')

  const { data: account } = await supabase
    .from('app_accounts')
    .select('login_id, is_admin, disabled_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!account?.is_admin || account.disabled_at) redirect('/login?denied=1')

  const { data: staff } = await supabase.from('staff_members').select('name').eq('auth_user_id', user.id).maybeSingle()
  return {
    userId: user.id,
    loginId: account.login_id,
    label: staff?.name ? `${staff.name}（${account.login_id}）` : account.login_id,
  }
}
