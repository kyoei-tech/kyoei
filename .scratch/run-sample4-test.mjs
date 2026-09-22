import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseExtractedPages } from './compiled/dispatch-sheet-parser.js'

const data = new Uint8Array(fs.readFileSync('.scratch/sample4.pdf'))
const pdf = await getDocument({ data }).promise
const pages = []
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const content = await page.getTextContent()
  const items = content.items
    .map((raw) => ({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width, h: raw.height }))
    .filter((i) => i.str.trim().length > 0)
  pages.push(items)
}
const result = parseExtractedPages(pages)
fs.writeFileSync('.scratch/sample4-result.json', JSON.stringify(result, null, 2))
console.log('vehicleCount:', result.vehicleCount)
console.log('unknown vehicleName count:', result.rounds.flatMap(r => r.vehicles).filter(v => !v.vehicleName).length)
