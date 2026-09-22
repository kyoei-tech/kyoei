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

// header row is at y ~ 394-395. Show everything from y=380 to y=400 sorted by x
const nearHeader = items.filter((i) => i.y >= 375 && i.y <= 405).sort((a, b) => a.x - b.x || b.y - a.y)
console.log('--- near header (y 375-405) ---')
for (const i of nearHeader) console.log(JSON.stringify(i))
