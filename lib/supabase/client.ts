import { createBrowserClient } from '@supabase/ssr'

// Singleton browser client. This app has no authentication - all data is
// shared across every browser via open (anon-accessible) RLS policies.
let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (client) return client
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return client
}
