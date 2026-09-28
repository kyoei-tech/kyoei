import { readFileSync } from 'fs'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc =
  '/vercel/share/v0-project/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'

const buffer = readFileSync('/vercel/share/v0-project/.scratch/sample.pdf')
const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum)
  const content = await page.getTextContent()
  const items = content.items
    .filter((i) => i.str.trim().length > 0)
    .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))

  // Column ranges around 積日(365)/詳細(395)/条件(420)/卸日(447)/詳細(477)/条件(503)
  const rows = items.filter((i) => i.x >= 355 && i.x <= 515 && i.y < 394)
  const byY = new Map()
  for (const r of rows) {
    const key = Math.round(r.y)
    if (!byY.has(key)) byY.set(key, [])
    byY.get(key).push(r)
  }
  console.log(`--- page ${pageNum} date-area rows ---`)
  for (const [y, arr] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
    console.log(y, arr.sort((a,b)=>a.x-b.x).map(a => `${a.str}@${a.x.toFixed(0)}`))
  }
}
