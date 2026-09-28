import { readFileSync } from 'fs'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc =
  '/vercel/share/v0-project/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'

const buffer = readFileSync('/vercel/share/v0-project/.scratch/sample.pdf')
const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
const page = await pdf.getPage(1)
const content = await page.getTextContent()

const items = content.items
  .filter((i) => i.str.trim().length > 0)
  .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))

const HEADER_LABELS = ['回戦','請求先','積地','降地','ｵｰｸｼｮﾝ','品名','車体番号','積日','摘要１','出荷地','納入地','降日']
const headerCandidates = items.filter((i) => HEADER_LABELS.includes(i.str))
console.log('--- header candidates ---')
for (const h of headerCandidates.sort((a,b) => b.y - a.y || a.x - b.x)) {
  console.log(JSON.stringify(h))
}

// Find the header row y (highest cluster with most matches)
const byY = new Map()
for (const h of headerCandidates) {
  const key = Math.round(h.y)
  if (!byY.has(key)) byY.set(key, [])
  byY.get(key).push(h)
}
console.log('--- y clusters ---')
for (const [y, arr] of byY) console.log(y, arr.map(a => a.str))
