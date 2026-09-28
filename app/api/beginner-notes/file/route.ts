import { del, get } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

// Streams a private 初心者ノート image to the client. This app has no
// per-user authorization model (see the shared-device convention used
// throughout), so — unlike a typical private-blob route — this
// intentionally does not check a session; it exists only because the
// connected Blob store itself is provisioned as private.
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
    console.error('[v0] beginner-notes file error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}

// Removes an image from the private Blob store when a note is deleted or
// an image is removed from a note. The corresponding `beginner_notes` row
// update/delete is done separately by the client directly via Supabase.
export async function DELETE(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    await del(pathname)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] beginner-notes delete error:', error)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
