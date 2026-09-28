import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only client with the service role key — bypasses RLS entirely and
// can call the Admin API (auth.admin.*). NEVER import this from a 'use
// client' file or expose SUPABASE_SERVICE_ROLE_KEY to the browser. Used to
// list and delete auth accounts that testers created while 試験運転モード
// exposed マイページ / 配車表 sign-up (see settings-view.tsx's 試験運転モード
// section and app/api/test-accounts/route.ts).
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin client is missing required env vars')
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
