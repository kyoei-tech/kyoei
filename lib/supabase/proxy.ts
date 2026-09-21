import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session cookie on every request. Called from the
// root proxy.ts. The app itself is a single-page client (see
// attendance-app.tsx) with no per-route auth gating — login state for
// マイページ is checked client-side in mypage-view.tsx — so this only keeps
// the session cookie alive; it never redirects.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Touching auth.getUser() (rather than just getSession()) is what
  // actually triggers the token refresh here.
  await supabase.auth.getUser()

  return supabaseResponse
}
