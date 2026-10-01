// node --test supabase/functions/admin-login-approve/admin-login-approve.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDevicePublicKey, verifyP256 } from '../_shared/deviceKeys.ts'
import { approvalMessage, handle, type Deps, type LoginRequest } from './service.ts'

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))

async function device() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKey = b64(await crypto.subtle.exportKey('raw', pair.publicKey))
  const sign = async (message: string) =>
    b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(message)))
  return { publicKey, sign }
}

const NOW = new Date('2026-10-02T03:00:00Z')
const request = (over: Partial<LoginRequest> = {}): LoginRequest => ({
  id: 'r1', user_id: 'u1', number: 42, expires_at: '2026-10-02T03:02:00Z', approved_at: null, denied_at: null, ...over,
})

function deps(key: string | null, req: LoginRequest | null, over: Partial<Deps> = {}) {
  const calls: string[] = []
  const d: Deps = {
    userId: 'u1',
    loadRequest: async () => req,
    loadDeviceKey: async () => key,
    verify: verifyP256,
    approve: async (id) => void calls.push(`approve:${id}`),
    deny: async (id) => void calls.push(`deny:${id}`),
    now: () => NOW,
    ...over,
  }
  return { d, calls }
}

test('the right number signed by the registered iPhone approves', async () => {
  const dev = await device()
  const { d, calls } = deps(dev.publicKey, request())
  const out = await handle({ requestId: 'r1', choice: 42, approve: true, signature: await dev.sign(approvalMessage('r1', 42, true)) }, d)
  assert.deepEqual(out, { status: 200, body: { result: 'approved' } })
  assert.deepEqual(calls, ['approve:r1'])
})

test('a wrong number ends the request', async () => {
  const dev = await device()
  const { d, calls } = deps(dev.publicKey, request())
  const out = await handle({ requestId: 'r1', choice: 17, approve: true, signature: await dev.sign(approvalMessage('r1', 17, true)) }, d)
  assert.deepEqual(out.body, { result: 'wrong_number' })
  assert.deepEqual(calls, ['deny:r1'])
})

test('another key, a reused signature or a tampered answer is refused', async () => {
  const mine = await device()
  const attacker = await device()
  const { d, calls } = deps(mine.publicKey, request())
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: await attacker.sign(approvalMessage('r1', 42, true)) }, d)).status, 403)
  // A "deny" signature can't be replayed as an approval, nor for another request.
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: await mine.sign(approvalMessage('r1', 42, false)) }, d)).status, 403)
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: await mine.sign(approvalMessage('r0', 42, true)) }, d)).status, 403)
  assert.deepEqual(calls, [])
})

test('requests of other users, expired or answered ones, and unregistered phones', async () => {
  const dev = await device()
  const sig = await dev.sign(approvalMessage('r1', 42, true))
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: sig }, deps(dev.publicKey, request({ user_id: 'u2' })).d)).status, 404)
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: sig }, deps(dev.publicKey, request({ expires_at: '2026-10-02T02:59:00Z' })).d)).status, 410)
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: sig }, deps(dev.publicKey, request({ approved_at: 'x' })).d)).status, 410)
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: sig }, deps(null, request()).d)).status, 403)
  assert.equal((await handle({ requestId: 'r1', choice: 42, approve: true, signature: sig }, deps(dev.publicKey, request(), { userId: null }).d)).status, 401)
  assert.equal((await handle({ requestId: 'r1', choice: '42', approve: true, signature: sig }, deps(dev.publicKey, request()).d)).status, 400)
})

test('denying with a valid signature', async () => {
  const dev = await device()
  const { d, calls } = deps(dev.publicKey, request())
  const out = await handle({ requestId: 'r1', choice: 0, approve: false, signature: await dev.sign(approvalMessage('r1', 0, false)) }, d)
  assert.deepEqual(out.body, { result: 'denied' })
  assert.deepEqual(calls, ['deny:r1'])
})

test('device public key shape', async () => {
  assert.ok(isDevicePublicKey((await device()).publicKey))
  assert.ok(!isDevicePublicKey('AAAA'))
  assert.ok(!isDevicePublicKey(42))
})
