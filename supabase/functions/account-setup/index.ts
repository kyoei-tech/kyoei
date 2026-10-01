// Edge Function: redeems a one-time account setup / password reset token
// (issued by an administrator) and sets the password. Called by the iOS app
// before the user has a session, with the public anon key.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handle, type Redeemed } from './service.ts'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  let body: { token?: unknown; password?: unknown; devicePublicKey?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  const outcome = await handle(body, {
    redeem: async (tokenHash) => {
      const { data, error } = await admin.rpc('redeem_account_setup_token', { p_token_hash: tokenHash })
      if (error) throw error
      return ((data as Redeemed[] | null) ?? [])[0] ?? null
    },
    release: async (tokenHash) => {
      await admin.rpc('release_account_setup_token', { p_token_hash: tokenHash })
    },
    setPassword: async (userID, password) => {
      const { error } = await admin.auth.admin.updateUserById(userID, { password })
      if (error) throw error
    },
    registerDevice: async (userID, publicKey) => {
      const { error } = await admin.from('account_devices').upsert({ user_id: userID, public_key: publicKey, registered_at: new Date().toISOString() })
      if (error) throw error
    },
  })

  // Never log tokens or passwords.
  console.log(JSON.stringify({ status: outcome.status }))
  return Response.json(outcome.body, { status: outcome.status })
})
