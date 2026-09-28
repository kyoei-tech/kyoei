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

const left = items.filter((i) => i.x < 60 && i.y < 394).sort((a,b)=>b.y-a.y)
for (const i of left) console.log(JSON.stringify(i))
