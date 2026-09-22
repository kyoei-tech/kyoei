import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseExtractedPages } from './compiled/dispatch-sheet-parser.js'

async function test(filename) {
  const data = new Uint8Array(fs.readFileSync(filename))
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
  console.log(filename, '-> vehicleCount:', result.vehicleCount, 'unknown:', result.rounds.flatMap(r => r.vehicles).filter(v => !v.vehicleName).length)
  for (const r of result.rounds) {
    for (const v of r.vehicles) {
      console.log(`  round=${v.round} name=${JSON.stringify(v.vehicleName)} auction=${JSON.stringify(v.auctionInfo)} chassis=${JSON.stringify(v.chassisNumber)}`)
    }
  }
}

await test('.scratch/sample1.pdf')
await test('.scratch/sample3.pdf')
