import { readFileSync } from 'fs'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseExtractedPages } from './compiled/dispatch-sheet-parser.js'

GlobalWorkerOptions.workerSrc =
  '/vercel/share/v0-project/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'

async function testFile(path) {
  const buffer = readFileSync(path)
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
  const pages = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const items = content.items
      .filter((i) => i.str.trim().length > 0)
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }))
    pages.push(items)
  }
  const result = parseExtractedPages(pages)
  const unknown = result.rounds.flatMap(r => r.vehicles).filter(v => !v.vehicleName).length
  console.log(path, '-> vehicleCount:', result.vehicleCount, 'unknown:', unknown)
  return result
}

await testFile('/vercel/share/v0-project/.scratch/sample1.pdf')
await testFile('/vercel/share/v0-project/.scratch/sample3.pdf')
