import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// Stores the original PDF for reference (see dispatch-sheet-view.tsx,
// which parses it client-side with pdfjs-dist's text layer — no AI, no
// page images — and uploads the original file here purely as a backup).
//
// The filename travels in a header rather than a multipart/form-data
// body: multipart bodies sent from the browser were observed to
// intermittently arrive corrupted ("no boundary found") through this
// environment's preview network path, while raw-body requests do not
// hit that issue. Sending the file as the raw request body sidesteps
// multipart parsing entirely.
//
// This project's Blob store is provisioned as private, so blob.url is
// not publicly reachable — we return `pathname` instead. If the original
// PDF ever needs to be served back, that must go through
// /api/dispatch-sheet/file?pathname=... (see that route), never blob.url
// directly.
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
