import { readFileSync, writeFileSync } from 'fs'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseExtractedPages } from './compiled/dispatch-sheet-parser.js'

GlobalWorkerOptions.workerSrc =
  '/vercel/share/v0-project/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'

const buffer = readFileSync('/vercel/share/v0-project/.scratch/sample.pdf')
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
writeFileSync('/vercel/share/v0-project/.scratch/result.json', JSON.stringify(result, null, 2))
console.log('vehicleCount:', result.vehicleCount)
console.log('unknown vehicleName count:', result.rounds.flatMap(r => r.vehicles).filter(v => !v.vehicleName).length)
