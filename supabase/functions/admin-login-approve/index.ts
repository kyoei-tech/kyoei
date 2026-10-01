// Edge Function: the KYOEI app approves (or denies) an admin console sign-in.
// Deploy with JWT verification on (the default): the caller is the admin's
// own app session; the Secure Enclave signature is checked in service.ts.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verifyP256 } from '../_shared/deviceKeys.ts'
import { handle, type LoginRequest } from './service.ts'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

const url = requireEnv('SUPABASE_URL')
const anonKey = requireEnv('SUPABASE_ANON_KEY')
const admin = createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const authorization = request.headers.get('Authorization') ?? ''
  const caller = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
  const outcome = await handle(body, {
    userId: auth.user?.id ?? null,
    loadRequest: async (id) => {
      const { data } = await admin.from('admin_login_requests').select('id, user_id, number, expires_at, approved_at, denied_at').eq('id', id).maybeSingle()
      return data as LoginRequest | null
    },
    loadDeviceKey: async (userId) => {
      const { data } = await admin.from('account_devices').select('public_key').eq('user_id', userId).maybeSingle()
      return (data?.public_key as string | undefined) ?? null
    },
    verify: verifyP256,
    approve: async (id) => {
      await admin.from('admin_login_requests').update({ approved_at: new Date().toISOString() }).eq('id', id)
    },
    deny: async (id) => {
      await admin.from('admin_login_requests').update({ denied_at: new Date().toISOString() }).eq('id', id)
    },
    now: () => new Date(),
  })
  console.log(JSON.stringify({ status: outcome.status }))
  return Response.json(outcome.body, { status: outcome.status })
})
