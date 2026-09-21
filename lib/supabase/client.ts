import { createBrowserClient } from '@supabase/ssr'

// Singleton browser client. Most data is still shared across every browser
// via open (anon-accessible) RLS policies — see the Supabase-on-Vercel
// skill note in mypage-view.tsx / staff_members.auth_user_id for the one
// feature (マイページ) that layers real authentication on top.
let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (client) return client
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return client
}
