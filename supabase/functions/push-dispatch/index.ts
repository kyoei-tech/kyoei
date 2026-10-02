// Edge Function: receives change events from private.dispatch_push_event()
// (see supabase/migrations/*_push_notifications.sql) and delivers them as
// instant APNs pushes. Deploy with --no-verify-jwt: the caller is the
// database, authenticated by the shared x-push-webhook-secret header.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cachedProviderToken, sendToDevice, type ApnsConfig, type ProviderTokenCache } from './apns.ts'
import { dispatch, secretsMatch, type TokenRow } from './dispatch.ts'
import { messageFor, type WebhookPayload } from './events.ts'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

const config: ApnsConfig = {
  keyId: requireEnv('APNS_KEY_ID'),
  teamId: requireEnv('APNS_TEAM_ID'),
  privateKeyPem: requireEnv('APNS_PRIVATE_KEY'),
  bundleId: requireEnv('APNS_BUNDLE_ID'),
}
const webhookSecret = requireEnv('PUSH_WEBHOOK_SECRET')

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Survives across invocations while the isolate stays warm.
const tokenCache: { current: ProviderTokenCache } = { current: null }

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!secretsMatch(request.headers.get('x-push-webhook-secret'), webhookSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = await request.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const message = messageFor(payload)
  if (!message) return Response.json({ skipped: true })

  const providerToken = await cachedProviderToken(config, tokenCache)
  const summary = await dispatch(message, {
    loadTokens: async (topic) => {
      const { data, error } = await supabase
        .from('device_push_tokens')
        .select('device_id, apns_token, apns_environment, staff_member_id, topics')
        .contains('topics', [topic])
      if (error) throw error
      return (data ?? []) as TokenRow[]
    },
    deleteDevices: async (deviceIds) => {
      await supabase.from('device_push_tokens').delete().in('device_id', deviceIds)
    },
    send: (target, msg) => sendToDevice(target, msg, providerToken, config),
  })

  console.log(JSON.stringify({ table: payload.table, type: payload.type, ...summary }))
  return Response.json(summary)
})
