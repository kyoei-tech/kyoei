import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Exchanges the ?code= from a Supabase email confirmation link for a
// session, then sends the user back into the app. The app itself has no
// separate routes/pages for マイページ (it's a tab inside the single-page
// client — see components/mypage-view.tsx), so there's nowhere more
// specific to send them than the root.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
