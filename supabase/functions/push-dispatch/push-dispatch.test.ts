// Runs under Node (`node --test supabase/functions/push-dispatch/`) and
// Deno (`deno test`), both of which provide node:test and Web Crypto.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apnsPayload, cachedProviderToken, createProviderToken, sendToDevice, type ApnsConfig } from './apns.ts'
import { dispatch, secretsMatch, targetsFor, type TokenRow } from './dispatch.ts'
import { messageFor, plainText, type PushMessage, type WebhookPayload } from './events.ts'

function payload(partial: Partial<WebhookPayload>): WebhookPayload {
  return { type: 'INSERT', table: 'news_posts', schema: 'public', record: {}, old_record: null, ...partial }
}

function row(id: string, partial: Partial<TokenRow> = {}): TokenRow {
  return {
    device_id: id,
    apns_token: `${id}token`,
    apns_environment: 'production',
    staff_member_id: null,
    topics: ['news', 'staff_status'],
    ...partial,
  }
}

async function testConfig(): Promise<{ config: ApnsConfig; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const b64 = btoa(String.fromCharCode(...pkcs8))
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`
  return {
    config: { keyId: 'ABC123DEFG', teamId: 'TEAM123456', privateKeyPem: pem, bundleId: 'jp.kyoei.app' },
    publicKey: pair.publicKey,
  }
}

function decodeSegment(segment: string): any {
  const b64 = segment.replaceAll('-', '+').replaceAll('_', '/')
  return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
}

// --- events -----------------------------------------------------------------

test('news insert becomes a news push titled おしらせ', () => {
  const message = messageFor(payload({ record: { id: 'n1', title: '**明日**は;;休業;;です', content: '...' } }))
  assert.deepEqual(message, {
    topic: 'news',
    title: 'おしらせ',
    body: '明日は休業です',
    threadId: 'news',
    data: { kind: 'news', id: 'n1' },
  })
})

test('news without a title falls back to the web copy, long titles are truncated', () => {
  assert.equal(messageFor(payload({ record: { id: 'n2', title: '  ' } }))?.body, '新しいおしらせがあります💡')
  const long = messageFor(payload({ record: { id: 'n3', title: 'あ'.repeat(300) } }))!
  assert.equal([...long.body].length, 180)
  assert.ok(long.body.endsWith('…'))
})

test('staff status change becomes a staff_status push that skips the person themselves', () => {
  const message = messageFor(
    payload({
      type: 'UPDATE',
      table: 'staff_members',
      record: { id: 's1', name: '山田', status: 'working' },
      old_record: { id: 's1', name: '山田', status: 'off' },
    }),
  )
  assert.equal(message?.topic, 'staff_status')
  assert.equal(message?.body, '山田さんが出勤中になりました')
  assert.equal(message?.excludeStaffMemberId, 's1')
  assert.equal(message?.collapseId, 'staff-s1')

  const off = messageFor(
    payload({ type: 'UPDATE', table: 'staff_members', record: { id: 's1', name: '山田', status: 'off' }, old_record: { status: 'working' } }),
  )
  assert.equal(off?.body, '山田さんが退勤済みになりました')
})

test('irrelevant changes produce no push', () => {
  const unchanged = payload({ type: 'UPDATE', table: 'staff_members', record: { id: 's', status: 'off' }, old_record: { status: 'off' } })
  assert.equal(messageFor(unchanged), null)
  assert.equal(messageFor(payload({ type: 'UPDATE', table: 'news_posts', record: { id: 'n' } })), null)
  assert.equal(messageFor(payload({ table: 'yards', record: { id: 'y' } })), null)
  assert.equal(messageFor(payload({ type: 'DELETE', record: null })), null)
  assert.equal(messageFor(payload({ schema: 'auth' })), null)
  assert.equal(plainText('::a::##b##'), 'ab')
})

// --- routing ----------------------------------------------------------------

test('targets respect topics and self-exclusion', () => {
  const message: PushMessage = { topic: 'staff_status', title: 't', body: 'b', threadId: 'x', data: {}, excludeStaffMemberId: 's1' }
  const targets = targetsFor(message, [
    row('a'),
    row('b', { staff_member_id: 's1' }),
    row('c', { topics: ['news'] }),
    row('d', { apns_environment: 'sandbox', staff_member_id: 's2' }),
  ])
  assert.deepEqual(
    targets.map((t) => [t.deviceId, t.environment]),
    [['a', 'production'], ['d', 'sandbox']],
  )
})

test('dispatch sends to every target and prunes dead tokens', async () => {
  const message = messageFor(payload({ record: { id: 'n', title: 'x' } }))!
  const rows = Array.from({ length: 45 }, (_, i) => row(`dev${i}`))
  const deleted: string[][] = []
  const summary = await dispatch(message, {
    loadTokens: async () => rows,
    deleteDevices: async (ids) => void deleted.push(ids),
    send: async (target) =>
      target.deviceId === 'dev3'
        ? { deviceId: target.deviceId, status: 410, reason: 'Unregistered', invalidToken: true }
        : target.deviceId === 'dev7'
          ? { deviceId: target.deviceId, status: 503, reason: 'ServiceUnavailable', invalidToken: false }
          : { deviceId: target.deviceId, status: 200, invalidToken: false },
  })
  assert.deepEqual(summary, { targeted: 45, delivered: 43, failed: 2, pruned: 1 })
  assert.deepEqual(deleted, [['dev3']])
})

test('webhook secret comparison', () => {
  assert.ok(secretsMatch('s3cret', 's3cret'))
  assert.ok(!secretsMatch('s3cret!', 's3cret'))
  assert.ok(!secretsMatch(null, 's3cret'))
  assert.ok(!secretsMatch('', ''))
})

// --- APNs -------------------------------------------------------------------

test('provider token is a verifiable ES256 JWT', async () => {
  const { config, publicKey } = await testConfig()
  const jwt = await createProviderToken(config, 1_790_000_000_000)
  const [header, claims, signature] = jwt.split('.')
  assert.deepEqual(decodeSegment(header), { alg: 'ES256', kid: 'ABC123DEFG' })
  assert.deepEqual(decodeSegment(claims), { iss: 'TEAM123456', iat: 1_790_000_000 })
  const sig = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (signature.length % 4)) % 4)), (c) => c.charCodeAt(0))
  assert.equal(sig.length, 64)
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sig,
    new TextEncoder().encode(`${header}.${claims}`),
  )
  assert.ok(ok)
})

test('provider token accepts a PEM pasted with literal \\n and is cached for 50 minutes', async () => {
  const { config } = await testConfig()
  const escaped = { ...config, privateKeyPem: config.privateKeyPem.replaceAll('\n', '\\n') }
  const cache = { current: null as null | { token: string; createdAt: number } }
  const first = await cachedProviderToken(escaped, cache, 0)
  assert.equal(await cachedProviderToken(escaped, cache, 49 * 60_000), first)
  // A new iat second makes a different token after the TTL.
  assert.notEqual(await cachedProviderToken(escaped, cache, 51 * 60_000), first)
})

test('sendToDevice builds the APNs request and classifies responses', async () => {
  const { config } = await testConfig()
  const message = messageFor(
    payload({ type: 'UPDATE', table: 'staff_members', record: { id: 's9', name: '佐藤', status: 'working' }, old_record: { status: 'off' } }),
  )!
  const calls: { url: string; init: RequestInit }[] = []
  const respond = (status: number, body?: unknown) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! })
      return new Response(body === undefined ? null : JSON.stringify(body), { status })
    }) as typeof fetch

  const ok = await sendToDevice({ deviceId: 'd', token: 'abc', environment: 'sandbox' }, message, 'JWT', config, respond(200))
  assert.deepEqual(ok, { deviceId: 'd', status: 200, reason: undefined, invalidToken: false })
  assert.equal(calls[0].url, 'https://api.sandbox.push.apple.com/3/device/abc')
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers.authorization, 'bearer JWT')
  assert.equal(headers['apns-topic'], 'jp.kyoei.app')
  assert.equal(headers['apns-push-type'], 'alert')
  assert.equal(headers['apns-collapse-id'], 'staff-s9')
  assert.deepEqual(JSON.parse(calls[0].init.body as string), apnsPayload(message))
  assert.deepEqual(apnsPayload(message), {
    aps: { alert: { title: '出勤簿', body: '佐藤さんが出勤中になりました' }, sound: 'default', 'thread-id': 'staff_status' },
    kind: 'staff_status',
    id: 's9',
  })

  const gone = await sendToDevice({ deviceId: 'd', token: 'abc', environment: 'production' }, message, 'JWT', config, respond(410, { reason: 'Unregistered' }))
  assert.equal(gone.invalidToken, true)
  assert.equal(calls[1].url, 'https://api.push.apple.com/3/device/abc')
  const bad = await sendToDevice({ deviceId: 'd', token: 'abc', environment: 'production' }, message, 'JWT', config, respond(400, { reason: 'BadDeviceToken' }))
  assert.equal(bad.invalidToken, true)
  const throttled = await sendToDevice({ deviceId: 'd', token: 'abc', environment: 'production' }, message, 'JWT', config, respond(429, { reason: 'TooManyRequests' }))
  assert.deepEqual([throttled.status, throttled.invalidToken], [429, false])
  const offline = await sendToDevice({ deviceId: 'd', token: 'abc', environment: 'production' }, message, 'JWT', config, (async () => {
    throw new Error('network down')
  }) as typeof fetch)
  assert.deepEqual([offline.status, offline.invalidToken], [0, false])
})
