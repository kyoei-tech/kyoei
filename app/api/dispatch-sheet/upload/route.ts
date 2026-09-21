import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// Accepts either the original PDF or one rendered page-slice PNG per
// request (see dispatch-sheet-view.tsx, which renders/splits pages
// client-side with pdfjs-dist and uploads each slice separately).
//
// The filename travels in a header rather than a multipart/form-data
// body: multipart bodies sent from the browser were observed to
// intermittently arrive corrupted ("no boundary found") through this
// environment's preview network path, while raw-body requests do not
// hit that issue. Sending the file as the raw request body sidesteps
// multipart parsing entirely.
//
// This project's Blob store is provisioned as private, so blob.url is
// not publicly reachable — we return `pathname` instead, and the client
// must render images via /api/dispatch-sheet/file?pathname=... (see that
// route), never blob.url directly.
export async function POST(request: NextRequest) {
  try {
    const filename = request.headers.get('x-filename')
    if (!filename || !request.body) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const blob = await put(decodeURIComponent(filename), request.body, {
      access: 'private',
      addRandomSuffix: true,
    })

    return NextResponse.json({ pathname: blob.pathname })
  } catch (error) {
    console.error('[v0] dispatch-sheet upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
