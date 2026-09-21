import fs from 'node:fs'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const data = new Uint8Array(fs.readFileSync('/vercel/share/v0-project/.scratch/sample3.pdf'))
const pdf = await pdfjs.getDocument({ data }).promise
console.log('numPages', pdf.numPages)
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const content = await page.getTextContent()
  console.log(`\n=== PAGE ${p} ===`)
  const items = content.items.map((raw) => ({
    str: raw.str,
    x: raw.transform[4],
    y: raw.transform[5],
    w: raw.width,
    h: raw.height,
  })).filter(i => i.str.trim().length > 0)
  // sort by y desc, then x asc
  items.sort((a, b) => b.y - a.y || a.x - b.x)
  for (const it of items) {
    console.log(`y=${it.y.toFixed(2)} x=${it.x.toFixed(2)} w=${it.w.toFixed(2)} "${it.str}"`)
  }
}
