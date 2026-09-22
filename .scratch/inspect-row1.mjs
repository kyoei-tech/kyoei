import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const data = new Uint8Array(fs.readFileSync('.scratch/sample4.pdf'))
const pdf = await getDocument({ data }).promise
const page = await pdf.getPage(1)
const content = await page.getTextContent()
const items = content.items
  .map((raw) => ({
    str: raw.str,
    x: raw.transform[4],
    y: raw.transform[5],
    w: raw.width,
    h: raw.height,
  }))
  .filter((i) => i.str.trim().length > 0)

// Find items near y of "ﾉｰﾄ" or "練馬"
const target = items.filter((i) => i.str.includes('練馬') || i.str.includes('ﾉｰﾄ') || i.str.includes('品川') || i.str.includes('ﾌｨｯﾄ'))
for (const t of target) {
  console.log(JSON.stringify(t))
}
console.log('---all items near that y range---')
if (target.length) {
  const y = target[0].y
  const nearby = items.filter((i) => Math.abs(i.y - y) < 5).sort((a,b) => a.x - b.x)
  for (const n of nearby) console.log(JSON.stringify(n))
}
