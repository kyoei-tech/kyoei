'use server'
import QRCode from 'qrcode'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin, type AdminContext } from '@/lib/auth'
import { optional, vehicleProblem } from '@/lib/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { appSetupURL, CODE_VALID_FOR, formatToken, generateToken, hashToken, normalizeLoginID, syntheticEmail, webSetupURL } from '@/lib/tokens'

export type IssuedCode = {
  loginId: string
  staffName: string | null
  purpose: 'setup' | 'reset'
  code: string
  webURL: string
  qrSVG: string
  expiresAt: string
}

export type ActionResult = { ok: true; issued?: IssuedCode } | { ok: false; error: string }

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'
}

async function issueCode(admin: AdminContext, userId: string, loginId: string, staffName: string | null, purpose: 'setup' | 'reset'): Promise<IssuedCode> {
  const token = generateToken()
  const { data: expiresAt, error } = await createServiceClient().rpc('issue_account_setup_token', {
    p_user: userId,
    p_purpose: purpose,
    p_token_hash: await hashToken(token),
    p_valid_for: CODE_VALID_FOR,
    p_created_by: admin.userId,
  })
  if (error) throw error
  await audit(admin, 'accounts', loginId, purpose === 'setup' ? 'invite' : 'reset_code', { expiresAt })
  return {
    loginId,
    staffName,
    purpose,
    code: formatToken(token),
    webURL: webSetupURL(siteOrigin(), token),
    // The QR opens the app directly (kyoei://setup?t=…).
    qrSVG: await QRCode.toString(appSetupURL(token), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }),
    expiresAt: String(expiresAt),
  }
}

/** Links an account to one 出勤簿 row (or none), releasing its previous one. */
async function linkStaff(userId: string, staffId: string | null) {
  const service = createServiceClient()
  if (staffId) {
    const { data: staff } = await service.from('staff_members').select('id, auth_user_id').eq('id', staffId).maybeSingle()
    if (!staff) throw new Error('出勤簿の名前が見つかりません')
    if (staff.auth_user_id && staff.auth_user_id !== userId) throw new Error('その名前は別のアカウントに紐付いています')
  }
  await service.from('staff_members').update({ auth_user_id: null }).eq('auth_user_id', userId)
  if (staffId) await service.from('staff_members').update({ auth_user_id: userId }).eq('id', staffId)
}

/** マイページのプロフィール from the form (full name, 役職, dates, 車格, vehicles). */
async function saveProfile(userId: string, form: FormData): Promise<string | null> {
  const service = createServiceClient()
  const vehicleClass = optional(form, 'vehicle_class')
  const vehicleId = optional(form, 'vehicle_id')
  const chassisId = optional(form, 'chassis_id')
  const kinds = new Map<string, string>()
  const ids = [vehicleId, chassisId].filter((x): x is string => !!x)
  if (ids.length) {
    const { data } = await service.from('vehicles').select('id, kind').in('id', ids)
    for (const v of data ?? []) kinds.set(v.id, v.kind)
  }
  const problem = vehicleProblem(vehicleClass, vehicleId ? (kinds.get(vehicleId) ?? null) : null, chassisId ? (kinds.get(chassisId) ?? null) : null)
  if (problem) return problem
  const { error } = await service.from('account_profiles').upsert({
    user_id: userId,
    full_name: String(form.get('full_name') ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim(),
    position_id: optional(form, 'position_id'),
    hire_date: optional(form, 'hire_date'),
    vehicle_class: vehicleClass,
    vehicle_id: vehicleId,
    chassis_id: chassisId,
    health_check_due: optional(form, 'health_check_due'),
    supervisor_id: optional(form, 'supervisor_id') === userId ? null : optional(form, 'supervisor_id'),
    updated_at: new Date().toISOString(),
  })
  if (error) return error.code === '23505' ? 'その車両は別の人に割り当てられています。' : 'プロフィールを保存できませんでした。'
  return null
}

function roles(form: FormData) {
  return {
    is_driver: form.get('is_driver') === 'on',
    can_search_customers: form.get('can_search_customers') === 'on',
    is_admin: form.get('is_admin') === 'on',
  }
}

export async function createAccount(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const loginId = normalizeLoginID(String(form.get('login_id') ?? ''))
  if (!loginId) return { ok: false, error: 'ログインIDは半角英数字（3〜32文字、. _ - 可）で入力してください。' }
  const staffId = String(form.get('staff_id') ?? '') || null
  const service = createServiceClient()

  const { data: existing } = await service.from('app_accounts').select('user_id').eq('login_id', loginId).maybeSingle()
  if (existing) return { ok: false, error: `ログインID ${loginId} はすでに使われています。` }

  const { data: created, error } = await service.auth.admin.createUser({
    email: syntheticEmail(loginId),
    password: generateToken() + generateToken(), // never shown; replaced at setup
    email_confirm: true,
    user_metadata: { login_id: loginId },
  })
  if (error || !created.user) return { ok: false, error: 'アカウントを作成できませんでした。' }
  const userId = created.user.id
  try {
    const { error: insertError } = await service.from('app_accounts').insert({ user_id: userId, login_id: loginId, ...roles(form) })
    if (insertError) throw insertError
    await linkStaff(userId, staffId)
    const profileProblem = await saveProfile(userId, form)
    if (profileProblem) throw new Error(profileProblem)
  } catch (e) {
    await service.auth.admin.deleteUser(userId)
    return { ok: false, error: e instanceof Error ? e.message : 'アカウントを作成できませんでした。' }
  }
  const staffName = staffId ? ((await service.from('staff_members').select('name').eq('id', staffId).maybeSingle()).data?.name ?? null) : null
  await audit(admin, 'accounts', loginId, 'create', { ...roles(form), staffName })
  const issued = await issueCode(admin, userId, loginId, staffName, 'setup')
  revalidatePath('/accounts')
  revalidatePath('/')
  return { ok: true, issued }
}

export async function issueResetCode(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const service = createServiceClient()
  const { data: account } = await service.from('app_accounts').select('login_id, disabled_at').eq('user_id', userId).maybeSingle()
  if (!account) return { ok: false, error: 'アカウントが見つかりません。' }
  if (account.disabled_at) return { ok: false, error: '停止中のアカウントにはコードを発行できません。先に再開してください。' }
  const staffName = (await service.from('staff_members').select('name').eq('auth_user_id', userId).maybeSingle()).data?.name ?? null
  // A never-used account gets a fresh setup code; otherwise it's a reset.
  const { data: user } = await service.auth.admin.getUserById(userId)
  const purpose = user.user?.last_sign_in_at ? 'reset' : 'setup'
  const issued = await issueCode(admin, userId, account.login_id, staffName, purpose)
  revalidatePath('/accounts')
  return { ok: true, issued }
}

export async function updateAccount(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const userId = String(form.get('user_id') ?? '')
  const service = createServiceClient()
  const { data: before } = await service.from('app_accounts').select('*').eq('user_id', userId).maybeSingle()
  if (!before) return { ok: false, error: 'アカウントが見つかりません。' }
  const next = roles(form)
  if (userId === admin.userId && !next.is_admin) return { ok: false, error: '自分自身の管理者権限は外せません。' }
  const staffId = String(form.get('staff_id') ?? '') || null
  try {
    const profileProblem = await saveProfile(userId, form)
    if (profileProblem) throw new Error(profileProblem)
    await service.from('app_accounts').update({ ...next, updated_at: new Date().toISOString() }).eq('user_id', userId)
    await linkStaff(userId, staffId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '保存できませんでした。' }
  }
  const staffName = staffId ? ((await service.from('staff_members').select('name').eq('id', staffId).maybeSingle()).data?.name ?? null) : null
  await audit(admin, 'accounts', before.login_id, 'update', {
    before: { is_driver: before.is_driver, can_search_customers: before.can_search_customers, is_admin: before.is_admin },
    after: { ...next, staffName },
  })
  revalidatePath('/accounts')
  return { ok: true }
}

export async function setDisabled(userId: string, disabled: boolean): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (userId === admin.userId) return { ok: false, error: '自分自身は停止できません。' }
  const service = createServiceClient()
  const { data: account } = await service.from('app_accounts').select('login_id').eq('user_id', userId).maybeSingle()
  if (!account) return { ok: false, error: 'アカウントが見つかりません。' }
  // Banned users can't sign in or refresh their session; the app also checks
  // disabled_at and wipes local customer data on its next sync.
  const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: disabled ? '876000h' : 'none' })
  if (error) return { ok: false, error: '変更できませんでした。' }
  await service.from('app_accounts').update({ disabled_at: disabled ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('user_id', userId)
  await audit(admin, 'accounts', account.login_id, disabled ? 'disable' : 'enable')
  revalidatePath('/accounts')
  revalidatePath('/')
  return { ok: true }
}
