import { verifyP256 } from '../_shared/deviceKeys.ts'

export { verifyP256 }

// POST { requestId, choice, approve, signature } from the KYOEI app (the
// admin's own session). The signature — made with the iPhone's Secure
// Enclave key after Face ID — must verify against the key registered for the
// account during setup; a password alone can't produce it.

export type LoginRequest = {
  id: string
  user_id: string
  number: number
  expires_at: string
  approved_at: string | null
  denied_at: string | null
}

export type Deps = {
  userId: string | null
  loadRequest(id: string): Promise<LoginRequest | null>
  loadDeviceKey(userId: string): Promise<string | null>
  verify(publicKeyBase64: string, message: string, signatureBase64: string): Promise<boolean>
  approve(id: string): Promise<void>
  deny(id: string): Promise<void>
  now(): Date
}

export type Outcome = { status: number; body: { result: 'approved' | 'denied' | 'wrong_number' } | { error: string } }

/** What the app signs: binds the request, the chosen number and the answer. */
export function approvalMessage(requestId: string, choice: number, approve: boolean): string {
  return `kyoei-admin-login|${requestId}|${choice}|${approve ? 'approve' : 'deny'}`
}

export async function handle(input: { requestId?: unknown; choice?: unknown; approve?: unknown; signature?: unknown }, deps: Deps): Promise<Outcome> {
  if (!deps.userId) return { status: 401, body: { error: 'ログインしてください' } }
  const { requestId, choice, approve, signature } = input
  if (typeof requestId !== 'string' || typeof choice !== 'number' || typeof approve !== 'boolean' || typeof signature !== 'string') {
    return { status: 400, body: { error: 'Bad request' } }
  }
  const request = await deps.loadRequest(requestId)
  if (!request || request.user_id !== deps.userId) return { status: 404, body: { error: 'ログインの依頼が見つかりません' } }
  if (request.approved_at || request.denied_at || new Date(request.expires_at) <= deps.now()) {
    return { status: 410, body: { error: 'このログインの依頼は期限切れか、すでに処理されています' } }
  }
  const key = await deps.loadDeviceKey(deps.userId)
  if (!key) return { status: 403, body: { error: 'この iPhone は承認用に登録されていません。管理者に再設定コードを発行してもらい、設定し直してください。' } }
  if (!(await deps.verify(key, approvalMessage(requestId, choice, approve), signature))) {
    return { status: 403, body: { error: 'この iPhone からは承認できません' } }
  }
  if (!approve) {
    await deps.deny(requestId)
    return { status: 200, body: { result: 'denied' } }
  }
  if (choice !== request.number) {
    // A wrong number ends the request: guessing gets one try.
    await deps.deny(requestId)
    return { status: 200, body: { result: 'wrong_number' } }
  }
  await deps.approve(requestId)
  return { status: 200, body: { result: 'approved' } }
}
