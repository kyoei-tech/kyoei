import { readFile } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const data = new Uint8Array(await readFile('/tmp/sample-dispatch.pdf'))
const pdf = await getDocument({ data }).promise
console.log('numPages', pdf.numPages)

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const viewport = page.getViewport({ scale: 1 })
  console.log(`--- page ${p} viewport`, viewport.width, viewport.height)
  const content = await page.getTextContent()
  for (const item of content.items) {
    const [a, b, c, d, e, f] = item.transform
    console.log(
      JSON.stringify({
        str: item.str,
        x: Math.round(e),
        y: Math.round(f),
        w: Math.round(item.width),
        h: Math.round(item.height),
      }),
    )
  }
}
