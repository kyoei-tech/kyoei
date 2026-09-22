import { del, get } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

// Streams a private dispatch-sheet blob (original PDF or a rendered page
// slice PNG) to the client. This app has no per-user authorization model
// (see the shared-device convention used throughout), so — unlike a
// typical private-blob route — this intentionally does not check a
// session; it exists only because the connected Blob store itself is
// provisioned as private.
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] dispatch-sheet file error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}

// Removes the original PDF from the private Blob store when a driver
// deletes an uploaded dispatch sheet (see dispatch-sheet-view.tsx). The
// corresponding `dispatch_sheets` row is deleted separately by the
// client directly via Supabase, consistent with the insert path above.
export async function DELETE(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    await del(pathname)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] dispatch-sheet delete error:', error)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
