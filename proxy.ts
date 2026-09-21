import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // /api is excluded: rebuilding the request via NextResponse.next({
  // request }) here corrupts streamed multipart bodies (e.g. the
  // dispatch-sheet upload's FormData), and no API route in this app
  // relies on the refreshed session cookie anyway (auth state for
  // マイページ is only ever read client-side).
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
