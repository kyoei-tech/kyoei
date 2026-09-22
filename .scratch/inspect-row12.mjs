import fs from 'node:fs'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const data = new Uint8Array(fs.readFileSync('/vercel/share/v0-project/.scratch/sample3.pdf'))
const pdf = await pdfjs.getDocument({ data }).promise
const page = await pdf.getPage(1)
const content = await page.getTextContent()
const items = content.items
  .map((raw) => ({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width, h: raw.height }))
  .filter((i) => i.str.trim().length > 0 && i.y > 290 && i.y < 310)
  .sort((a, b) => b.y - a.y || a.x - b.x)
for (const i of items) {
  console.log(`y=${i.y.toFixed(3)} x=${i.x.toFixed(2)} w=${i.w.toFixed(2)} str="${i.str}"`)
}
