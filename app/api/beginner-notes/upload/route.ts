import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// Stores an image attached to a 初心者ノート entry (see beginner-notes-view.tsx).
// The filename travels in a header rather than a multipart/form-data body —
// see the identical note in app/api/dispatch-sheet/upload/route.ts for why.
//
// This project's Blob store is provisioned as private, so blob.url is not
// publicly reachable — we return `pathname` instead. Images are served back
// through /api/beginner-notes/file?pathname=..., never blob.url directly.
export async function POST(request: NextRequest) {
  try {
    const filename = request.headers.get('x-filename')
    if (!filename || !request.body) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const contentType = request.headers.get('content-type') ?? undefined
    if (!contentType || !contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    const blob = await put(decodeURIComponent(filename), request.body, {
      access: 'private',
      addRandomSuffix: true,
      contentType,
    })

    return NextResponse.json({ pathname: blob.pathname })
  } catch (error) {
    console.error('[v0] beginner-notes upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
