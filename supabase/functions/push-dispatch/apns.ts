// Minimal APNs provider (token-based auth, HTTP/2 via fetch). Uses only Web
// Crypto + fetch, so it runs unchanged in Supabase Edge Functions (Deno)
// and in Node for tests. No third-party push service in between.

import type { PushMessage } from './events.ts'

export type ApnsConfig = {
  /** 10-character Key ID of the .p8 key (Apple Developer > Keys). */
  keyId: string
  teamId: string
  /** Contents of AuthKey_XXXX.p8 (PKCS#8 PEM). */
  privateKeyPem: string
  /** The app's bundle identifier (apns-topic). */
  bundleId: string
}

export type ApnsEnvironment = 'sandbox' | 'production'

export type DeviceTarget = {
  deviceId: string
  token: string
  environment: ApnsEnvironment
}

export type SendResult = {
  deviceId: string
  status: number
  reason?: string
  /** APNs says this token will never work again; it should be deleted. */
  invalidToken: boolean
}

const HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
}

// APNs rejects provider tokens older than 60 minutes and throttles ones
// refreshed more often than every 20, so reuse each for 50.
const TOKEN_TTL_MS = 50 * 60 * 1000

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64urlJSON(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)))
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** ES256-signed provider JWT. Web Crypto's ECDSA output is already the raw r||s form JWS expects. */
export async function createProviderToken(config: ApnsConfig, nowMs: number = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(config.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const signingInput = `${base64urlJSON({ alg: 'ES256', kid: config.keyId })}.${base64urlJSON({
    iss: config.teamId,
    iat: Math.floor(nowMs / 1000),
  })}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${base64url(new Uint8Array(signature))}`
}

export type ProviderTokenCache = { token: string; createdAt: number } | null

export async function cachedProviderToken(
  config: ApnsConfig,
  cache: { current: ProviderTokenCache },
  nowMs: number = Date.now(),
): Promise<string> {
  const current = cache.current
  if (current && nowMs - current.createdAt < TOKEN_TTL_MS) return current.token
  const token = await createProviderToken(config, nowMs)
  cache.current = { token, createdAt: nowMs }
  return token
}

export function apnsPayload(message: PushMessage): Record<string, unknown> {
  return {
    aps: {
      alert: { title: message.title, body: message.body },
      sound: 'default',
      'thread-id': message.threadId,
    },
    ...message.data,
  }
}

export function isInvalidTokenResponse(status: number, reason?: string): boolean {
  return status === 410 || (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic'))
}

export async function sendToDevice(
  target: DeviceTarget,
  message: PushMessage,
  providerToken: string,
  config: ApnsConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const headers: Record<string, string> = {
    authorization: `bearer ${providerToken}`,
    'apns-topic': config.bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  }
  if (message.collapseId) headers['apns-collapse-id'] = message.collapseId

  try {
    const response = await fetchImpl(`${HOSTS[target.environment]}/3/device/${target.token}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(apnsPayload(message)),
    })
    let reason: string | undefined
    if (response.status !== 200) {
      try {
        reason = ((await response.json()) as { reason?: string }).reason
      } catch {
        reason = undefined
      }
    } else {
      await response.body?.cancel()
    }
    return {
      deviceId: target.deviceId,
      status: response.status,
      reason,
      invalidToken: isInvalidTokenResponse(response.status, reason),
    }
  } catch (error) {
    return { deviceId: target.deviceId, status: 0, reason: String(error), invalidToken: false }
  }
}
