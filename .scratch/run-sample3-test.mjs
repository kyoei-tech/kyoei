import fs from 'node:fs'
import { parseExtractedPages } from './compiled/dispatch-sheet-parser.js'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const data = new Uint8Array(fs.readFileSync('/vercel/share/v0-project/.scratch/sample3.pdf'))
const pdf = await pdfjs.getDocument({ data }).promise
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
console.log(JSON.stringify(result, null, 2))
console.log('vehicleCount:', result.vehicleCount)
console.log('unknown vehicleName count:', result.rounds.flatMap(r => r.vehicles).filter(v => !v.vehicleName).length)
