// Fans one push message out to every subscribed device and prunes tokens
// APNs reports as dead. Storage and transport are injected so the routing
// rules are testable without Supabase or APNs.

import type { DeviceTarget, SendResult } from './apns.ts'
import type { PushMessage, PushTopic } from './events.ts'

export type TokenRow = {
  device_id: string
  apns_token: string
  apns_environment: 'sandbox' | 'production'
  staff_member_id: string | null
  topics: string[]
}

export type DispatchDeps = {
  loadTokens: (topic: PushTopic) => Promise<TokenRow[]>
  deleteDevices: (deviceIds: string[]) => Promise<void>
  send: (target: DeviceTarget, message: PushMessage) => Promise<SendResult>
}

export type DispatchSummary = {
  targeted: number
  delivered: number
  failed: number
  pruned: number
}

const CONCURRENCY = 20

export function targetsFor(message: PushMessage, rows: TokenRow[]): DeviceTarget[] {
  return rows
    .filter((row) => row.topics.includes(message.topic))
    .filter((row) => !message.excludeStaffMemberId || row.staff_member_id !== message.excludeStaffMemberId)
    .map((row) => ({ deviceId: row.device_id, token: row.apns_token, environment: row.apns_environment }))
}

export async function dispatch(message: PushMessage, deps: DispatchDeps): Promise<DispatchSummary> {
  const targets = targetsFor(message, await deps.loadTokens(message.topic))
  const results: SendResult[] = []
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    results.push(...(await Promise.all(batch.map((target) => deps.send(target, message)))))
  }
  const dead = results.filter((r) => r.invalidToken).map((r) => r.deviceId)
  if (dead.length > 0) await deps.deleteDevices(dead)
  return {
    targeted: targets.length,
    delivered: results.filter((r) => r.status === 200).length,
    failed: results.filter((r) => r.status !== 200).length,
    pruned: dead.length,
  }
}

/** Constant-time comparison for the webhook shared secret. */
export function secretsMatch(given: string | null, expected: string): boolean {
  if (!given || !expected) return false
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}
