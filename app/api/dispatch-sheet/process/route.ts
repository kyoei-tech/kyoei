import { put } from '@vercel/blob'
import { generateText, Output } from 'ai'
import { type NextRequest, NextResponse } from 'next/server'
import { dispatchSheetSchema } from '@/lib/dispatch-sheet-schema'

export const maxDuration = 60

// Replaces the old page-image viewer: instead of rasterizing every PDF
// page for display, this reads the PDF's actual content (via a
// PDF-capable Gateway model) and returns structured dispatch data that
// dispatch-sheet-view.tsx re-renders as a phone-friendly vertical layout
// (mirroring 縦型運行指示書, the paper format this replaces).
//
// A fixed text-column-order parser was considered and rejected: PDF text
// extraction does not reliably preserve the PDF's visual column order
// (see the raw text dump of a real 配車表, which interleaves fields from
// unrelated rows), so a rule-based reconstruction would silently
// misattribute vehicle data. Reading the PDF as a document instead lets
// the model use its rendered layout, the same way a human would.
//
// The filename travels in a header rather than a multipart/form-data
// body — see the sibling dispatch-sheet upload route (previously at this
// path) for why: multipart bodies were observed to intermittently arrive
// corrupted through this environment's preview network path.
export async function POST(request: NextRequest) {
  try {
    const filename = request.headers.get('x-filename')
    if (!filename || !request.body) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const pdfBuffer = Buffer.from(await request.arrayBuffer())

    const [blob, extraction] = await Promise.all([
      put(decodeURIComponent(filename), pdfBuffer, {
        access: 'private',
        addRandomSuffix: true,
      }),
      generateText({
        model: 'google/gemini-3.5-flash',
        output: Output.object({ schema: dispatchSheetSchema }),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '添付の配車表PDFから、運転者が担当する各車両の配送情報を抽出してください。表の視覚的な並び順（画面に表示されている通りの順番）に従い、各車両のデータを取りこぼしなく正確に対応づけてください。回戦（第1回戦・第2回戦など）が明記されていない場合はすべてround: 1としてください。',
              },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: pdfBuffer,
                filename: decodeURIComponent(filename),
              },
            ],
          },
        ],
      }),
    ])

    return NextResponse.json({
      pathname: blob.pathname,
      data: extraction.output,
    })
  } catch (error) {
    console.error('[v0] dispatch sheet processing error:', error)
    return NextResponse.json(
      { error: 'PDFの読み取りに失敗しました' },
      { status: 500 },
    )
  }
}
