// POST { token, password } — redeems a one-time setup/reset token and sets
// the account's password. The caller isn't signed in yet; the token is the
// credential. Storage and Auth access are injected for testing.

import { isDevicePublicKey } from '../_shared/deviceKeys.ts'
import { hashToken, normalizeToken, passwordProblem } from './tokens.ts'

export type Redeemed = { user_id: string; login_id: string | null; purpose: 'setup' | 'reset' }

export type Deps = {
  redeem(tokenHash: string): Promise<Redeemed | null>
  release(tokenHash: string): Promise<void>
  setPassword(userID: string, password: string): Promise<void>
  /** Registers (replaces) the iPhone key that approves admin console sign-ins. */
  registerDevice(userID: string, publicKey: string): Promise<void>
}

export type Outcome =
  | { status: 200; body: { loginId: string; purpose: 'setup' | 'reset' } }
  | { status: 400 | 410 | 500; body: { error: string } }

export async function handle(input: { token?: unknown; password?: unknown; devicePublicKey?: unknown }, deps: Deps): Promise<Outcome> {
  const token = typeof input.token === 'string' ? normalizeToken(input.token) : null
  if (!token) return { status: 400, body: { error: 'コードの形式が正しくありません' } }
  if (typeof input.password !== 'string') return { status: 400, body: { error: 'パスワードを入力してください' } }
  const problem = passwordProblem(input.password)
  if (problem) return { status: 400, body: { error: problem } }
  if (input.devicePublicKey !== undefined && !isDevicePublicKey(input.devicePublicKey)) {
    return { status: 400, body: { error: '端末の登録情報が正しくありません' } }
  }

  const tokenHash = await hashToken(token)
  const redeemed = await deps.redeem(tokenHash)
  if (!redeemed || !redeemed.login_id) {
    return { status: 410, body: { error: 'このコードは使えません。期限切れか使用済みです。管理者に新しいコードを発行してもらってください。' } }
  }
  try {
    await deps.setPassword(redeemed.user_id, input.password)
    // Only here — with an admin's one-time code — can a device key be set.
    if (isDevicePublicKey(input.devicePublicKey)) await deps.registerDevice(redeemed.user_id, input.devicePublicKey)
  } catch {
    await deps.release(tokenHash)
    return { status: 500, body: { error: 'パスワードを設定できませんでした。もう一度お試しください。' } }
  }
  return { status: 200, body: { loginId: redeemed.login_id, purpose: redeemed.purpose } }
}
